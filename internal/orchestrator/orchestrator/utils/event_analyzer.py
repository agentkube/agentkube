import json
import time
import os
import platform
from datetime import datetime
from typing import List, Dict, Any, AsyncGenerator, Optional
from openai import AsyncOpenAI
from agents import Agent, Runner, set_default_openai_client, OpenAIChatCompletionsModel, set_default_openai_api, set_tracing_export_api_key, ModelSettings

from agents import trace, gen_trace_id
from orchestrator.db.models.chat import ChatMessage
from orchestrator.db.models.stream import MessageStreamStatus
from orchestrator.db.models.analysis import EventAnalysisRequest

from orchestrator.tools.kubectl import (
    set_kubecontext,
    get_events,
    describe_resource,
    get_pod_logs,
    list_pods,
    list_resources
)
from config import get_openrouter_api_key, get_openrouter_api_url, get_openai_api_key, get_web_search_enabled
from orchestrator.core.prompt.base_prompt import format_message_with_files
from orchestrator.utils.stream_utils import process_stream_events, setup_openai_client, prepare_input_messages
from orchestrator.services.byok.provider import get_provider_for_model
import asyncio    
            

def create_event_analysis_prompt(request: EventAnalysisRequest) -> str:
    """
    Create a specialized prompt for Kubernetes event analysis.
    """
    event = request.event
    event_type = event.get('type', 'Unknown')
    event_reason = event.get('reason', 'N/A')
    event_message = event.get('message', 'No message available')
    involved_object = event.get('involvedObject', {})
    object_kind = involved_object.get('kind', 'Unknown')
    object_name = involved_object.get('name', 'Unknown')
    namespace = event.get('metadata', {}).get('namespace', 'Unknown')
    
    return f"""<identity>
You are an expert Kubernetes troubleshoot assistant specializing in event analysis and root cause investigation.
Built-in AI Agent in Agentkube, an AI-Powered Kubernetes Management IDE
</identity>

<role>
Event Analysis Specialist for Kubernetes incident investigation
</role>

<expertise>
- Kubernetes event analysis and interpretation
- Root cause analysis for cluster incidents
- Event correlation with system behavior
- Impact assessment and severity evaluation
- Pattern detection in event sequences
- Actionable remediation strategies
</expertise>

<tools_available>
- get_events: Get recent events for context and correlation
- describe_resource: Get detailed resource information (pods, deployments, nodes, services, etc.)
- get_pod_logs: Check pod logs for related errors
- list_pods: Check pod status in namespace
- list_resources: List any Kubernetes resources (deployments, services, nodes, configmaps, secrets, etc.)
</tools_available>

<context>
Event Type: {event_type}
Reason: {event_reason}
Object: {object_kind}/{object_name}
Namespace: {namespace}
Cluster: {request.cluster_name}
</context>

<responsibilities>
- Analyze Kubernetes events for root cause identification
- Evaluate event severity and system impact
- Detect patterns and correlations with common issues
- Provide actionable resolution and prevention strategies
- Correlate events with resource states and configurations
- Generate comprehensive incident analysis reports
</responsibilities>

<investigation_scenarios>
- Pod lifecycle events and failures
- Resource scheduling and allocation issues
- Configuration and validation errors
- Network and storage related events
- Security and RBAC related incidents
</investigation_scenarios>

<reasoning_approach>
Let's think step by step to analyze this Kubernetes event:

Step 1: **Event Analysis** - What exactly happened?
- Examine the event type, reason, and message
- Identify the affected resource (pod, deployment, etc.)
- Note the timestamp and frequency

Step 2: **Context Gathering** - What's the current state?
- Use tools to check the current status of involved resources
- Gather related events in the namespace/cluster
- Check resource utilization and constraints
- If resource YAML is provided, thoroughly analyze it for:
  - Resource limits and requests (CPU, memory)
  - Environment variables and their values
  - Volume mounts and configurations
  - Image pull policies and image references
  - Liveness/readiness probe configurations
  - Security contexts and permissions
  - Service account configurations
  - Port configurations and conflicts

Step 3: **Root Cause Investigation** - Why did this happen?
- Correlate event details with gathered context
- Look for patterns in logs, resource usage, or configuration
- Identify the specific underlying issue

Step 4: **Solution Formulation** - How to fix and prevent?
- Provide targeted fix based on root cause analysis
- Suggest prevention measures for the specific issue found
</reasoning_approach>

<instructions>
Follow the reasoning approach step by step. Use the available tools to investigate thoroughly before concluding. Think through each step methodically.

IMPORTANT: Before providing your final analysis, gather context using the available tools to understand the current state and correlate with the event details. If resource YAML configuration is provided, analyze it for resource constraints, environment variables, volume mounts, and other configuration issues that might correlate with the event.
</instructions>

<output_format>
After your investigation, provide a CONCISE analysis:

**Cause**
Based on your step-by-step investigation, explain what specifically caused this event

**Fix**
Provide specific, actionable fixes:
- If YAML/configuration issue: Show the exact fields that need to be changed, what the current value is, and what it should be
- If resource constraint issue: Specify exact resource values to adjust (e.g., memory: 128Mi → 256Mi)
- If missing configuration: Specify what needs to be added and where in the YAML
- If dependency issue: Identify what's missing and how to resolve it
- Always reference the specific YAML path (e.g., `spec.containers[0].resources.limits.memory`)

**Prevention**
Give one targeted recommendation to prevent this specific issue

Keep the section in bold, and whenever you specify any resource, enclose it inside a code block using a single back-quote (`).
Keep the response under (200 - 1000) words total. Focus on actionable information only. Focus on actionable insights from your investigation. Do not use headers (#, ##, ###) or emojis.
</output_format>

<event_details>
```json
{json.dumps(event, indent=2)}
```
</event_details>

<event_message>
{event_message}
</event_message>

{f'''<resource_configuration>
```yaml
{request.resource_yaml}
```
</resource_configuration>''' if request.resource_yaml else ''}

<env>
OS Version: {platform.system().lower()} {platform.release()}
Shell: {os.environ.get('SHELL', 'Unknown').split('/')[-1] if os.environ.get('SHELL') else 'Unknown'}
Working directory: {os.getcwd()}
Is directory a git repo: {'Yes' if os.path.exists(os.path.join(os.getcwd(), '.git')) else 'No'}
Today's date: {datetime.now().strftime('%Y-%m-%d')}
</env>"""


async def stream_event_analysis(
    request: EventAnalysisRequest
) -> AsyncGenerator[str, None]:
    """
    Stream AI analysis of Kubernetes events with specialized prompts.
    
    Args:
        request: EventAnalysisRequest containing event data and context
        
    Yields:
        str: Streaming analysis content in JSON format
    """
    setup_openai_client()
    
    trace_id = gen_trace_id()
    analysis_prompt = create_event_analysis_prompt(request)
    
    with trace(workflow_name="Event Analysis Assistant", trace_id=trace_id):
        try:
            set_kubecontext(request.kubecontext)

            # Get provider configuration directly
            provider_config = get_provider_for_model(request.model)
            
            event_analyzer_agent = Agent(
                name="Agentkube: Event Analysis Agent",
                instructions=analysis_prompt,
                model_settings=ModelSettings(
                    parallel_tool_calls=False,
                    temperature=0.1,
                    extra_headers={
                        "HTTP-Referer": "https://agentkube.com",
                        "X-Title": "Agentkube"
                    }
                ),
                model=OpenAIChatCompletionsModel(
                    model=provider_config.model_name,
                    openai_client=AsyncOpenAI(
                        base_url=provider_config.base_url,
                        api_key=provider_config.api_key,
                    )
                ),
                tools=[get_events, describe_resource, get_pod_logs, list_pods, list_resources]
            )

            event = request.event
            event_type = event.get('type', 'Unknown')
            event_reason = event.get('reason', 'N/A')
            involved_object = event.get('involvedObject', {})
            object_kind = involved_object.get('kind', 'Unknown')
            object_name = involved_object.get('name', 'Unknown')
            
            message = f"Analyze this Kubernetes {event_type} event: {event_reason} for {object_kind}/{object_name} in cluster {request.cluster_name} \n{request.resource_yaml}"
            formatted_message = format_message_with_files(message, None)
            agent_input = prepare_input_messages(None, formatted_message)
            
            # Run agent
            result = Runner.run_streamed(event_analyzer_agent, input=agent_input, max_turns=10)
            
            # Process and yield events
            async for event_data in process_stream_events(result, trace_id):
                yield event_data
                
        except Exception as e:
            error_msg = f"Error in event analysis: {str(e)}"
            print(f"ERROR: {error_msg}")
            yield json.dumps({'error': error_msg})
            yield json.dumps({'done': True})
            yield MessageStreamStatus.done.value
            
        finally:
            pass