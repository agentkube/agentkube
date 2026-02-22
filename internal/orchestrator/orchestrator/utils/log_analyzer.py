import json
import time
import os
import platform
from datetime import datetime
from typing import List, Dict, Any, AsyncGenerator, Optional
from openai import AsyncOpenAI
from agents import Agent, Runner, set_default_openai_client, OpenAIChatCompletionsModel, ModelSettings

from agents import trace, gen_trace_id
from orchestrator.db.models.chat import ChatMessage
from orchestrator.db.models.stream import MessageStreamStatus
from orchestrator.db.models.analysis import LogAnalysisRequest

from orchestrator.tools.kubectl import (
    set_kubecontext,
    describe_resource,
    get_events,
    top_pods,
    top_nodes,
    list_pods,
    list_resources
)
from config import get_openrouter_api_key, get_openrouter_api_url, get_web_search_enabled
from orchestrator.core.prompt.base_prompt import format_message_with_files
from orchestrator.utils.stream_utils import process_stream_events, setup_openai_client, prepare_input_messages
from orchestrator.services.byok.provider import get_provider_for_model
from orchestrator.services.account.session import get_user_plan


def create_log_analysis_prompt(request: LogAnalysisRequest) -> str:
    """
    Create a specialized prompt for log analysis.
    """
    return f"""<identity>
You are an expert Kubernetes troubleshoot assistant specializing in log analysis.
Built-in AI Agent in Agentkube, an AI-Powered Kubernetes Management IDE
</identity>

<role>
Log Analysis Specialist for Kubernetes pod troubleshooting
</role>

<expertise>
- Pod log analysis and interpretation
- Error pattern detection and categorization
- Performance metrics analysis from logs
- Security event identification
- Log correlation and pattern recognition
- Actionable troubleshooting recommendations
</expertise>

<tools_available>
- describe_resource: Get detailed resource information (pods, deployments, nodes, services, etc.)
- get_events: Get related events for the pod and namespace
- top_pods: Get resource usage metrics for pods
- top_nodes: Get node resource pressure information
- list_pods: Check other pods in namespace for patterns
- list_resources: List any Kubernetes resources (nodes, configmaps, secrets, services, etc.)
</tools_available>

<context>
Pod: {request.pod_name}
Container: {request.container_name}
Namespace: {request.namespace}
Cluster: {request.cluster_name}
</context>

<responsibilities>
- Analyze pod logs for errors, warnings, and anomalies
- Identify performance issues and resource constraints
- Detect security-related events and authentication failures
- Recognize patterns and correlations in log entries
- Provide actionable troubleshooting recommendations
- Generate comprehensive log analysis reports
</responsibilities>

<investigation_scenarios>
- Application errors and exceptions
- Performance degradation and resource issues
- Security incidents and authentication failures
- Container startup and initialization problems
- Network connectivity and communication issues
</investigation_scenarios>

<reasoning_approach>
Let's think step by step to analyze these pod logs:

Step 1: **Log Analysis** - What errors and patterns are present?
- Scan logs for error messages, warnings, and exceptions
- Identify recurring patterns or timing issues
- Note any startup, connectivity, or resource-related messages

Step 2: **Context Investigation** - What's the pod's current state?
- Use tools to check pod status, resource usage, and constraints
- Gather related events for this pod and namespace
- Check configuration, secrets, and service connectivity
- Analyze pod YAML configuration if provided for environment variables and setup issues

Step 3: **Root Cause Correlation** - Why are these issues occurring?
- Connect log errors with pod/node status and resource metrics
- Identify if issues are due to configuration, resources, or external dependencies
- Determine the specific underlying problem

Step 4: **Solution Development** - How to resolve and prevent?
- Provide targeted fixes based on identified root cause
- Suggest prevention strategies for the specific issue found
</reasoning_approach>

<instructions>
Follow the reasoning approach step by step. Use the available tools to investigate the pod's current state and correlate with log findings before concluding. Think through each step methodically.

IMPORTANT: Before providing your final analysis, use tools to gather context about the pod's status, resource usage, and related events to understand the complete picture. If pod YAML configuration is provided, analyze it for resource constraints, environment variables, volume mounts, and other configuration issues that might correlate with the log errors.
</instructions>

<output_format>
After your step-by-step investigation, provide a CONCISE analysis:

**Errors**  
Main errors found in logs

**Cause**  
Based on your investigation, explain the specific root cause

**Fix**  
Specific action to resolve the issue (no commands)

**Prevention**  
One targeted recommendation to prevent this specific problem

Note:
Just give the anaylsis what you see, don't ask any questions.
Keep the section in bold, and whenever you specify any resource in content, enclose it inside a code block using a single back-quote (`).
Keep the response under (200 - 1000) words total. Focus on actionable information only. Focus on actionable insights from your investigation. Do not use headers (#, ##, ###) or emojis.
</output_format>

<log_content>
```
{request.logs}
```
</log_content>

{f'''<pod_configuration>
```yaml
{request.pod_yaml}
```
</pod_configuration>''' if request.pod_yaml else ''}

<env>
OS Version: {platform.system().lower()} {platform.release()}
Shell: {os.environ.get('SHELL', 'Unknown').split('/')[-1] if os.environ.get('SHELL') else 'Unknown'}
Working directory: {os.getcwd()}
Is directory a git repo: {'Yes' if os.path.exists(os.path.join(os.getcwd(), '.git')) else 'No'}
Today's date: {datetime.now().strftime('%Y-%m-%d')}
</env>"""


async def stream_log_analysis(
    request: LogAnalysisRequest
) -> AsyncGenerator[str, None]:
    """
    Stream AI analysis of pod logs with specialized prompts.
    
    Args:
        request: LogAnalysisRequest containing logs and context
        
    Yields:
        str: Streaming analysis content in JSON format
    """
    setup_openai_client()
    
    trace_id = gen_trace_id()
    analysis_prompt = create_log_analysis_prompt(request)
    
    with trace(workflow_name="Log Analysis Assistant", trace_id=trace_id):
        try:
            set_kubecontext(request.kubecontext)

            # Get user plan to determine provider
            user_plan = await get_user_plan()

            # Get provider configuration based on plan
            # Free plan users use default OpenRouter provider
            if user_plan == "free":
                provider_config = get_provider_for_model(request.model, "default")
            else:
                provider_config = get_provider_for_model(request.model)
            
            log_analyzer_agent = Agent(
                name="Agentkube: Log Analysis Agent2",
                instructions=analysis_prompt,
                model_settings=ModelSettings(
                    parallel_tool_calls=False,
                    temperature=0.2,
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
                tools=[
                    describe_resource,
                    get_events,
                    top_pods,
                    top_nodes,
                    list_pods,
                    list_resources
                ]
            )

            message = f"Analyze these Kubernetes pod logs for {request.pod_name} in namespace {request.namespace}"
            formatted_message = format_message_with_files(message, None)
            agent_input = prepare_input_messages(None, formatted_message)
            
            # Run agent
            result = Runner.run_streamed(log_analyzer_agent, input=agent_input, max_turns=10)
            
            # Process and yield events
            async for event_data in process_stream_events(result, trace_id):
                yield event_data
                
        except Exception as e:
            error_msg = f"Error in log analysis: {str(e)}"
            print(f"ERROR: {error_msg}")
            yield json.dumps({'error': error_msg})
            yield json.dumps({'done': True})
            yield MessageStreamStatus.done.value
            
        finally:
            pass