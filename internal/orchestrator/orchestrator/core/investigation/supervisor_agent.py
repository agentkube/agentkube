"""
Supervisor Agent Module
"""

import json
import asyncio
import logging
from datetime import datetime, timezone
from typing import AsyncGenerator, Dict, Any, Optional, List
from pathlib import Path
from openai import AsyncOpenAI

from orchestrator.services.byok.provider import get_provider_for_model
from orchestrator.services.account.session import should_track_usage, update_oauth2_usage_async
# Import tools (raw functions)
from orchestrator.tools.kubectl import (
    get_resource_yaml,
    get_resource_dependency,
    set_kubecontext
)
from orchestrator.tools.todo_board import (
    create_todo,
    update_todo,
    list_todos
)

from orchestrator.core.investigation.tool_mapping import get_tool_title

# Agents SDK imports for sub-agent tools
from agents import function_tool, Runner, trace, gen_trace_id, RunHooks

# Sub-agent imports (same pattern as investigator.py)
from orchestrator.workflows.flows.logging import create_logging_agent
from orchestrator.workflows.flows.discovery import create_discovery_agent
from orchestrator.workflows.flows.monitoring import create_monitoring_agent
from orchestrator.workflows.flows.parser import create_parser_agent, toon_to_prompt
from agents import ToolCallItem, ToolCallOutputItem

logger = logging.getLogger(__name__)


# =============================================================================
# process_agent_output helper function
# =============================================================================

async def process_agent_output(result, parser_agent=None, trace_id: str = None) -> Dict[str, Any]:
    """
    Process agent output from Runner.run (without output_type).
    Extracts tool calls from result and parses TOON response using parser agent.
    Returns format compatible with _update_agent_plan_data.

    Args:
        result: Runner result from sub-agent
        parser_agent: Parser agent to convert TOON to structured output
        trace_id: Trace ID for the investigation
    """
    import re
    from orchestrator.db.models.investigation_task import SubTaskSchema

    tool_calls = []

    # Create mapping of call_id to output
    outputs_map = {}
    for item in result.new_items:
        if isinstance(item, ToolCallOutputItem):
            # Get call_id from the raw_item
            call_id = item.raw_item.get("call_id", "")
            if call_id:
                outputs_map[call_id] = item.output

    # Build tool_calls list with outputs
    for item in result.new_items:
        if isinstance(item, ToolCallItem):
            call_id = getattr(item.raw_item, "call_id", "")
            tool_data = {
                "tool": item.raw_item.name,
                "arguments": item.raw_item.arguments,
                "call_id": call_id,
                "output": outputs_map.get(call_id, "")
            }
            tool_calls.append(tool_data)

    # Parse and convert final_output using parser agent
    final_response = ""
    if result.final_output:
        try:
            # Check if it's already a Pydantic model
            if hasattr(result.final_output, 'model_dump_json'):
                final_response = result.final_output.model_dump_json()
            # If it's a string (TOON format), use parser agent to convert
            elif isinstance(result.final_output, str):
                if parser_agent and trace_id:
                    # Use parser agent to convert TOON to structured output
                    parsing_prompt = toon_to_prompt(result.final_output)

                    with trace(workflow_name="Kubernetes Investigation", trace_id=trace_id):
                        parser_result = await Runner.run(
                            parser_agent,
                            input=parsing_prompt,
                            max_turns=30  # Parser should complete in one turn
                        )

                    # Parser agent has output_type=ParsedTOONOutput
                    if hasattr(parser_result.final_output, 'model_dump_json'):
                        final_response = parser_result.final_output.model_dump_json()
                    else:
                        final_response = str(parser_result.final_output)
                else:
                    # Fallback to manual JSON parsing if no parser agent
                    json_match = re.search(r'```json\s*(\{.*?\})\s*```', result.final_output, re.DOTALL)
                    if json_match:
                        json_str = json_match.group(1)
                    else:
                        json_match = re.search(r'\{.*\}', result.final_output, re.DOTALL)
                        json_str = json_match.group(0) if json_match else result.final_output

                    json_data = json.loads(json_str)
                    validated_model = SubTaskSchema(**json_data)
                    final_response = validated_model.model_dump_json()
            else:
                # Fallback: convert whatever it is to string
                final_response = str(result.final_output)

        except Exception as e:
            print(f"Error parsing agent output: {e}")
            final_response = str(result.final_output)

    return {
        "tool_calls": tool_calls,
        "final_response": final_response
    }


# =============================================================================
# RunHooks for capturing sub-agent tool events
# =============================================================================

class SubAgentHooks(RunHooks):
    """
    Custom RunHooks to capture tool call events from sub-agents.
    Events are collected in a list for yielding to the frontend.
    """
    
    def __init__(self):
        self.tool_events = []
        self.step_result = None  # Store the parsed result here
        self.tool_calls_data = []  # Store tool_calls with proper arguments
    
    async def on_tool_start(self, context, agent, tool):
        """Capture when a tool starts executing."""
        # tool is a Tool object, try to get arguments from it
        tool_name = tool.name if hasattr(tool, 'name') else str(tool)
        # Arguments are not directly available in on_tool_start, we'll capture them in on_tool_end
        self.tool_events.append({
            "event_type": "tool_start",
            "tool_name": tool_name,
            "agent_name": agent.name if hasattr(agent, 'name') else "Sub-Agent",
            "arguments": {},
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
    
    async def on_tool_end(self, context, agent, tool, result):
        """Capture when a tool finishes executing."""
        tool_name = tool.name if hasattr(tool, 'name') else str(tool)
        
        # Try to extract arguments from result if it's a dict with command info
        arguments = {}
        result_preview = ""
        if result:
            result_str = str(result)
            result_preview = result_str
            # Parse result to get pod_name/namespace if available
            if isinstance(result, dict):
                arguments = {
                    "pod_name": result.get("pod_name", ""),
                    "namespace": result.get("namespace", "")
                }
            elif isinstance(result, str) and "pod_name" in result.lower():
                # Try to extract from string
                try:
                    import re
                    pod_match = re.search(r'mock-database|[\w-]+-[\w-]+-[\w]+', result)
                    if pod_match:
                        arguments["pod_name"] = pod_match.group(0)
                except:
                    pass
        
        self.tool_events.append({
            "event_type": "tool_end",
            "tool_name": tool_name,
            "agent_name": agent.name if hasattr(agent, 'name') else "Sub-Agent",
            "result_preview": result_preview,
            "arguments": arguments,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })


def load_supervisor_prompt() -> str:
    """Load supervisor system prompt from file."""
    prompt_path = Path(__file__).parent.parent.parent / "workflows" / "prompts" / "supervisor_system_prompt_v2.txt"
    try:
        return prompt_path.read_text()
    except Exception as e:
        logger.error(f"Failed to load supervisor prompt: {e}")
        return "You are a Kubernetes investigation supervisor. Analyze issues and provide root cause analysis."


# =============================================================================
# Tool registration - Same pattern as stream_utils.py
# =============================================================================
# Tool registration
# =============================================================================

# Import past investigation tools
from orchestrator.tools.deep_investigation import (
    get_past_investigations,
    get_investigation_details
)

# List of tools available to the supervisor (all @function_tool decorated)
SUPERVISOR_TOOL_FUNCTIONS = [
    get_resource_yaml,
    get_resource_dependency,
    get_past_investigations,
    get_investigation_details,
    # TODO add grep tool to find kubernetes resources
    # TODO add Alerts to find alerts
    # create_todo,
    # update_todo,
    # list_todos,
]


def get_supervisor_tools() -> tuple[List[Dict], Dict[str, Any]]:
    """
    Build tool schemas and tool map from SUPERVISOR_TOOL_FUNCTIONS.
    All tools should be @function_tool decorated from agents SDK.
    Returns (tools_schema, tools_map)
    """
    from agents.tool import FunctionTool
    from agents.models.chatcmpl_converter import Converter
    
    tools_schema = []
    tools_map = {}
    
    for tool in SUPERVISOR_TOOL_FUNCTIONS:
        if isinstance(tool, FunctionTool):
            # Use Converter to get OpenAI format
            openai_tool_format = Converter.tool_to_openai(tool)
            tools_schema.append(openai_tool_format)
            # Store the on_invoke_tool callable
            tools_map[tool.name] = tool.on_invoke_tool
        else:
            logger.warning(f"Skipping unsupported tool type: {type(tool)} - use @function_tool decorator")
    
    return tools_schema, tools_map


async def execute_tool(
    tool_name: str, 
    arguments: Dict[str, Any], 
    tools_map: Dict[str, Any]
) -> str:
    """
    Execute a @function_tool and return the result as a string.
    """
    if tool_name not in tools_map:
        return json.dumps({"error": f"Unknown tool: {tool_name}"})
    
    try:
        tool_func = tools_map[tool_name]
        
        # All tools are @function_tool - call on_invoke_tool(context, args_json)
        args_json = json.dumps(arguments)
        result = await tool_func(None, args_json)
        result_str = str(result) if result is not None else "Success"
        
        return result_str
        
    except Exception as e:
        logger.error(f"Tool {tool_name} execution error: {e}")
        return json.dumps({"error": str(e)})


async def run_supervisor_investigation(
    task_id: str,
    prompt: str,
    context: Optional[Dict] = None,
    resource_context: Optional[List] = None,
    model: str = "openai/gpt-4o-mini",
    kubecontext: Optional[str] = None,
    kubeconfig: Optional[str] = None,
    max_iterations: int = 15
) -> AsyncGenerator[Dict[str, Any], None]:
    """
    Run the supervisor agent investigation using raw OpenAI streaming.
    
    Yields investigation events as they happen:
    - tool_call (when tool is invoked)
    - analysis_step (tool result)
    - text_delta (streaming text)
    - investigation_summary
    - investigation_remediation
    - investigation_complete
    """
    # Set kubecontext if provided (with optional kubeconfig path)
    if kubecontext:
        set_kubecontext(kubecontext, kubeconfig)
    
    # Track investigation start time for duration calculation
    investigation_start_time = datetime.now(timezone.utc)
    
    # Build tools schema and map
    tools_schema, tools_map = get_supervisor_tools()
    
    # Get provider configuration
    try:
        provider_config = get_provider_for_model(model)
    except Exception as e:
        logger.warning(f"Failed to get provider config: {e}, using defaults")
        from orchestrator.services.byok.provider import ProviderConfig
        provider_config = ProviderConfig(
            base_url="https://openrouter.ai/api/v1",
            api_key="",
            model_name=model.replace("openai/", "")
        )
    
    # OpenAI client
    client = AsyncOpenAI(
        base_url=provider_config.base_url,
        api_key=provider_config.api_key
    )
    
    # =========================================================================
    # Create sub-agents (same pattern as investigator.py)
    # =========================================================================
    trace_id = gen_trace_id()
    
    # Create all specialist agents
    logging_agent = create_logging_agent(client, provider_config.model_name, kubecontext)
    discovery_agent = create_discovery_agent(client, provider_config.model_name, kubecontext)
    monitoring_agent = create_monitoring_agent(client, provider_config.model_name, kubecontext)
    parser_agent = create_parser_agent(client, provider_config.model_name)
    
    # Shared hooks to capture sub-agent tool events
    sub_agent_hooks = SubAgentHooks()
    
    # =========================================================================
    # Define log_analysis as @function_tool (same pattern as investigator.py)
    # =========================================================================
    @function_tool
    async def log_analysis(input_data: str) -> str:
        """
        Logs & Traces Specialist for application monitoring and distributed tracing.
        
        This tool delegates to a specialized logging agent that can:
        - Collect and analyze application and system logs using get_pod_logs
        - Identify error patterns and anomalies in log data
        - Track error propagation across services
        - Correlate logs with incidents and alerts
        
        Provide specific details in input_data about:
        - Pod name and namespace to analyze (e.g., "pod 'mock-database' in 'api-app' namespace")
        - Time ranges for log analysis (e.g., "last 10 minutes", "since error occurred")
        - Error patterns or keywords to search for (e.g., "authentication failures", "connection errors")
        - Container name if multiple containers exist
        
        The logging agent will return structured findings in TOON format with:
        - subject: Brief title of log findings
        - status: Number of log issues found
        - reason: Brief reason for log issues
        - goal: Analysis scope and success criteria
        - discovery: Detailed log analysis findings
        
        Example: "Analyze logs from pod 'mock-database' in the 'api-app' namespace, focusing on any error patterns or startup issues"
        """
        with trace(workflow_name="Kubernetes Investigation", trace_id=trace_id):
            # Run logging agent using agents SDK Runner with hooks
            result = await Runner.run(
                logging_agent, 
                input_data, 
                max_turns=50,
                hooks=sub_agent_hooks  # Capture tool events
            )
            
            # Use parser agent to convert TOON output to structured data
            collected_data = await process_agent_output(result, parser_agent, trace_id)

            # print(result.final_output)
            # Add agent type and timestamp if it's a dict (parsed successfully)
            if isinstance(collected_data, dict):
                # If parsed result has tool_calls and final_response keys (from process_agent_output)
                # We need to restructure it as a sub_task
                if "tool_calls" in collected_data:
                    # Parse the final response which might be the JSON for subtask
                    final_json = collected_data.get("final_response", "{}")
                    try:
                        sub_task_data = json.loads(final_json) if isinstance(final_json, str) else final_json
                    except:
                        sub_task_data = {}
                    
                    # Merge tool calls from collected_data['tool_calls'] into the plan if needed
                    # Or just use the parsed sub_task_data directly if the parser did its job
                    
                    # Ensure minimal fields
                    if not isinstance(sub_task_data, dict):
                         sub_task_data = {"discovery": str(sub_task_data)}
                         
                    sub_task_data["_agent_type"] = "logging"
                    sub_task_data["_timestamp"] = int(datetime.now(timezone.utc).timestamp())
                    
                    # Store tool_calls for event emission (with proper arguments)
                    sub_agent_hooks.tool_calls_data = collected_data.get("tool_calls", [])
                    
                    # If tool calls define the 'plan', we can use them
                    if not sub_task_data.get("plan"):
                        plan_items = []
                        for tc in collected_data.get("tool_calls", []):
                            output_str = str(tc.get("output", "")) if tc.get("output") else ""
                            args = tc.get("arguments", {})
                            # Parse arguments if it's a string
                            if isinstance(args, str):
                                try:
                                    args = json.loads(args)
                                except:
                                    args = {}
                            args_str = json.dumps(args) if isinstance(args, dict) else str(args)
                            plan_items.append({
                                "tool_name": tc.get("tool", "unknown"),
                                "output": output_str,
                                "arguments": args_str,
                                "call_id": tc.get("call_id", "")
                            })
                        sub_task_data["plan"] = plan_items
                    
                    # Update hooks with result for event emission
                    sub_agent_hooks.step_result = sub_task_data
                    
                    # Return the enriched data
                    collected_data = sub_task_data
            
        return json.dumps(collected_data) if isinstance(collected_data, dict) else str(collected_data)
    
    # =========================================================================
    # Define resource_discovery as @function_tool
    # =========================================================================
    @function_tool
    async def resource_discovery(input_data: str) -> str:
        """
        Kubernetes Resource Discovery & Events Specialist.
        
        This tool delegates to a specialized discovery agent that can:
        - Analyze Kubernetes resource status and configurations
        - Check pod, service, deployment, and namespace health
        - Examine resource relationships and dependencies
        - Investigate events and deployment issues
        - Check Helm releases and ArgoCD applications
        
        Provide specific details in input_data about:
        - Resource type and name to investigate (e.g., "pod 'api-server' in 'production' namespace")
        - What aspect to focus on (events, status, configuration, dependencies)
        - Specific issues to look for (CrashLoopBackOff, ImagePullBackOff, etc.)
        
        Example: "Investigate pod 'crash-loop-demo' in namespace 'test-crash' to understand why it keeps restarting"
        """
        with trace(workflow_name="Kubernetes Investigation", trace_id=trace_id):
            result = await Runner.run(
                discovery_agent, 
                input_data, 
                max_turns=1000,
                hooks=sub_agent_hooks
            )
            
            collected_data = await process_agent_output(result, parser_agent, trace_id)
            
            # if await should_track_usage(model):
            #      # await update_oauth2_usage_async()
            #     pass
            # print(result.final_output)
            if isinstance(collected_data, dict):
                if "tool_calls" in collected_data:
                    final_json = collected_data.get("final_response", "{}")
                    try:
                        sub_task_data = json.loads(final_json) if isinstance(final_json, str) else final_json
                    except:
                        sub_task_data = {}
                    
                    if not isinstance(sub_task_data, dict):
                         sub_task_data = {"discovery": str(sub_task_data)}
                         
                    sub_task_data["_agent_type"] = "discovery"
                    sub_task_data["_timestamp"] = int(datetime.now(timezone.utc).timestamp())
                    
                    sub_agent_hooks.tool_calls_data = collected_data.get("tool_calls", [])
                    
                    if not sub_task_data.get("plan"):
                        plan_items = []
                        for tc in collected_data.get("tool_calls", []):
                            output_str = str(tc.get("output", "")) if tc.get("output") else ""
                            args = tc.get("arguments", {})
                            if isinstance(args, str):
                                try:
                                    args = json.loads(args)
                                except:
                                    args = {}
                            args_str = json.dumps(args) if isinstance(args, dict) else str(args)
                            plan_items.append({
                                "tool_name": tc.get("tool", "unknown"),
                                "output": output_str,
                                "arguments": args_str,
                                "call_id": tc.get("call_id", "")
                            })
                        sub_task_data["plan"] = plan_items
                    
                    sub_agent_hooks.step_result = sub_task_data
                    collected_data = sub_task_data
            
        return json.dumps(collected_data) if isinstance(collected_data, dict) else str(collected_data)
    
    # =========================================================================
    # Define metrics_analysis as @function_tool
    # =========================================================================
    @function_tool
    async def metrics_analysis(input_data: str) -> str:
        """
        Metrics & Performance Monitoring Specialist.
        
        This tool delegates to a specialized monitoring agent that can:
        - Analyze resource utilization (CPU, memory, disk)
        - Check node and pod resource consumption
        - Identify performance bottlenecks and anomalies
        - Correlate metrics with incidents
        
        Provide specific details in input_data about:
        - Resources to analyze (pods, nodes, namespaces)
        - Metrics focus (CPU, memory, or both)
        - Performance concerns to investigate
        
        Example: "Check CPU and memory usage for pods in 'api-app' namespace to identify any resource constraints"
        """
        with trace(workflow_name="Kubernetes Investigation", trace_id=trace_id):
            result = await Runner.run(
                monitoring_agent, 
                input_data, 
                max_turns=1000,
                hooks=sub_agent_hooks
            )
            
            collected_data = await process_agent_output(result, parser_agent, trace_id)
            
            # if await should_track_usage(model):
            #     # await update_oauth2_usage_async()
            #     pass

            if isinstance(collected_data, dict):
                if "tool_calls" in collected_data:
                    final_json = collected_data.get("final_response", "{}")
                    try:
                        sub_task_data = json.loads(final_json) if isinstance(final_json, str) else final_json
                    except:
                        sub_task_data = {}
                    
                    if not isinstance(sub_task_data, dict):
                         sub_task_data = {"discovery": str(sub_task_data)}
                         
                    sub_task_data["_agent_type"] = "monitoring"
                    sub_task_data["_timestamp"] = int(datetime.now(timezone.utc).timestamp())
                    
                    sub_agent_hooks.tool_calls_data = collected_data.get("tool_calls", [])
                    
                    if not sub_task_data.get("plan"):
                        plan_items = []
                        for tc in collected_data.get("tool_calls", []):
                            output_str = str(tc.get("output", "")) if tc.get("output") else ""
                            args = tc.get("arguments", {})
                            if isinstance(args, str):
                                try:
                                    args = json.loads(args)
                                except:
                                    args = {}
                            args_str = json.dumps(args) if isinstance(args, dict) else str(args)
                            plan_items.append({
                                "tool_name": tc.get("tool", "unknown"),
                                "output": output_str,
                                "arguments": args_str,
                                "call_id": tc.get("call_id", "")
                            })
                        sub_task_data["plan"] = plan_items
                    
                    sub_agent_hooks.step_result = sub_task_data
                    collected_data = sub_task_data
            
        return json.dumps(collected_data) if isinstance(collected_data, dict) else str(collected_data)
    
    # =========================================================================
    # Add all sub-agent tools to tools schema
    # =========================================================================
    from agents.models.chatcmpl_converter import Converter
    
    # Convert @function_tools to OpenAI schema
    log_analysis_schema = Converter.tool_to_openai(log_analysis)
    resource_discovery_schema = Converter.tool_to_openai(resource_discovery)
    metrics_analysis_schema = Converter.tool_to_openai(metrics_analysis)
    
    tools_schema.append(log_analysis_schema)
    tools_schema.append(resource_discovery_schema)
    tools_schema.append(metrics_analysis_schema)
    
    tools_map["log_analysis"] = log_analysis.on_invoke_tool
    tools_map["resource_discovery"] = resource_discovery.on_invoke_tool
    tools_map["metrics_analysis"] = metrics_analysis.on_invoke_tool
    
    # Load system prompt
    system_prompt = load_supervisor_prompt()
    
    # Build initial messages
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"""Investigate the following Kubernetes issue:

{prompt}

Task ID for todos: {task_id}

{f"Additional context: {json.dumps(context)}" if context else ""}
{f"Resource context: {json.dumps(resource_context)}" if resource_context else ""}

Begin your investigation by gathering evidence using the available tools."""}
    ]
    
    # Note: investigation_started is yielded by deep_investigation.py
    
    step_index = 0
    accumulated_summary = ""
    accumulated_remediation = ""

    # if await should_track_usage(model):
    #     # await update_oauth2_usage_async()
    #     pass
    
    for iteration in range(max_iterations):
        logger.info(f"[Supervisor] Iteration {iteration + 1}/{max_iterations}")
        
        try:
            # Call OpenAI with tool support
            response = await client.chat.completions.create(
                model=provider_config.model_name,
                messages=messages,
                tools=tools_schema,
                tool_choice="auto",
                temperature=0.1,
                # max_tokens=50000,
                extra_headers={
                    "HTTP-Referer": "https://agentkube.com",
                    "X-Title": "Agentkube Investigation"
                }
            )
            
            message = response.choices[0].message
            
            # Check if there are tool calls
            if message.tool_calls:
                # Add assistant message to history
                messages.append({
                    "role": "assistant",
                    "content": message.content,
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.function.name,
                                "arguments": tc.function.arguments
                            }
                        }
                        for tc in message.tool_calls
                    ]
                })
                
                # Process each tool call
                for tool_call in message.tool_calls:
                    tool_name = tool_call.function.name
                    try:
                        arguments = json.loads(tool_call.function.arguments)
                    except:
                        arguments = {}
                    
                    step_index += 1
                    
                    # Debug: Print tool call
                    # print(f"\n=== TOOL CALL: {tool_name} ===")
                    # print(f"Arguments: {json.dumps(arguments, indent=2)}")
                    
                    # Generate human-readable title
                    tool_title = get_tool_title(tool_name, arguments)
                    
                    # Yield tool call event with title
                    yield {
                        "type": "tool_call",
                        "task_id": task_id,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "tool_name": tool_name,
                        "title": tool_title,
                        "arguments": json.dumps(arguments),
                        "step_index": step_index
                    }
                    
                    # Execute tool
                    result = await execute_tool(tool_name, arguments, tools_map)
                    
                    # Yield sub-agent tool events using tool_calls_data (has proper arguments)
                    # Handle all sub-agent tools
                    sub_agent_tools = ["log_analysis", "resource_discovery", "metrics_analysis"]
                    agent_name_map = {
                        "log_analysis": "Logging Agent",
                        "resource_discovery": "Discovery Agent",
                        "metrics_analysis": "Metrics Agent"
                    }
                    
                    if tool_name in sub_agent_tools and sub_agent_hooks.tool_calls_data:
                        for tc in sub_agent_hooks.tool_calls_data:
                            step_index += 1
                            sub_tool_name = tc.get("tool", "unknown")
                            
                            # Parse arguments
                            args = tc.get("arguments", {})
                            if isinstance(args, str):
                                try:
                                    args = json.loads(args)
                                except:
                                    args = {}
                            
                            output_str = str(tc.get("output", "")) if tc.get("output") else ""
                            
                            yield {
                                "type": "tool_call",
                                "task_id": task_id,
                                "timestamp": datetime.now(timezone.utc).isoformat(),
                                "tool_name": sub_tool_name,
                                "title": get_tool_title(sub_tool_name, args),
                                "arguments": json.dumps(args) if isinstance(args, dict) else str(args),
                                "step_index": step_index,
                                "sub_agent": agent_name_map.get(tool_name, "Sub-Agent"),
                                "detail": output_str
                            }
                        # Clear for next sub-agent call
                        sub_agent_hooks.tool_calls_data = []
                        sub_agent_hooks.tool_events = []
                    
                    # If this was a sub-agent tool and we have a step result, yield agent_phase_complete
                    if tool_name in sub_agent_tools and sub_agent_hooks.step_result:
                         yield {
                            "type": "agent_phase_complete",
                            "task_id": task_id,
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "sub_task": sub_agent_hooks.step_result,
                            "agent_type": sub_agent_hooks.step_result.get("_agent_type", tool_name)
                        }
                        # Clear for next call
                         sub_agent_hooks.step_result = None
                    
                    # Yield analysis step event
                    yield {
                        "type": "analysis_step",
                        "task_id": task_id,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "title": get_tool_title(tool_name, arguments),
                        "detail": result,
                        "status": "completed",
                        "step_index": step_index,
                        "tool_name": tool_name
                    }
                    
                    # Add tool result to messages
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": result
                    })
                    
                    # Small delay between tool calls
                    await asyncio.sleep(0.3)
            
            else:
                # No tool calls - LLM is providing final analysis
                final_content = message.content or ""
                
                # Parse summary and remediation from the response
                if "## Root Cause" in final_content or "**Root Cause" in final_content:
                    accumulated_summary = final_content
                    
                    # Try to split into summary and remediation
                    if "## Remediation" in final_content:
                        parts = final_content.split("## Remediation")
                        accumulated_summary = parts[0].strip()
                        accumulated_remediation = "## Remediation" + parts[1].strip() if len(parts) > 1 else ""
                    elif "## Immediate Actions" in final_content:
                        parts = final_content.split("## Immediate Actions")
                        accumulated_summary = parts[0].strip()
                        accumulated_remediation = "## Immediate Actions" + parts[1].strip() if len(parts) > 1 else ""
                else:
                    accumulated_summary += "\n" + final_content
                
                # =========================================================
                # PHASE 1: Yield DRAFT summary/remediation
                # =========================================================
                yield {
                    "type": "investigation_draft",
                    "task_id": task_id,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "summary": accumulated_summary,
                    "remediation": accumulated_remediation,
                    "is_draft": True
                }
                
                # =========================================================
                # PHASE 2: Run Critique Agent
                # =========================================================
                from orchestrator.core.investigation.critique_confidence import (
                    run_critique_agent,
                    run_confidence_agent,
                    refine_investigation
                )
                
                yield {
                    "type": "critique_started",
                    "task_id": task_id,
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }
                
                critique_result = await run_critique_agent(
                    client=client,
                    model=provider_config.model_name,
                    draft_summary=accumulated_summary,
                    draft_remediation=accumulated_remediation
                )
                
                # if await should_track_usage(model):
                #     # await update_oauth2_usage_async()
                #     pass
                
                yield {
                    "type": "critique_complete",
                    "task_id": task_id,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "approved": critique_result.approved,
                    "critique_summary": critique_result.critique_summary,
                    "issues_count": len(critique_result.issues),
                    "refinement_needed": not critique_result.approved
                }
                
                # =========================================================
                # PHASE 3: Refine if needed
                # =========================================================
                final_summary = accumulated_summary
                final_remediation = accumulated_remediation
                
                if not critique_result.approved:
                    yield {
                        "type": "refinement_started",
                        "task_id": task_id,
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    }
                    
                    final_summary, final_remediation = await refine_investigation(
                        client=client,
                        model=provider_config.model_name,
                        draft_summary=accumulated_summary,
                        draft_remediation=accumulated_remediation,
                        critique=critique_result
                    )
                    
                    yield {
                        "type": "refinement_complete",
                        "task_id": task_id,
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    }
                
                # =========================================================
                # PHASE 4: Yield FINAL summary/remediation
                # =========================================================
                yield {
                    "type": "investigation_summary",
                    "task_id": task_id,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "summary": final_summary,
                    "is_draft": False
                }
                
                if final_remediation:
                    yield {
                        "type": "investigation_remediation",
                        "task_id": task_id,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "remediation": final_remediation
                    }
                
                # =========================================================
                # PHASE 5: Run Confidence Agent
                # =========================================================
                yield {
                    "type": "confidence_started",
                    "task_id": task_id,
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }
                
                confidence_result = await run_confidence_agent(
                    client=client,
                    model=provider_config.model_name,
                    final_summary=final_summary,
                    final_remediation=final_remediation
                )
                
                yield {
                    "type": "confidence_complete",
                    "task_id": task_id,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "confidence": confidence_result.confidence,
                    "matched_pattern": confidence_result.matched_pattern,
                    "impacted_since": confidence_result.impacted_since,
                    "last_seen": confidence_result.impacted_since,  # Same as impacted_since for point-in-time
                    "services_affected": confidence_result.services_affected,
                    "impact_severity": confidence_result.impact_severity,
                    "affected_resources": [r.model_dump() for r in confidence_result.affected_resources]
                }
                
                # Update accumulated for DB storage
                accumulated_summary = final_summary
                accumulated_remediation = final_remediation
                
                # Done - break the loop
                break
                
        except Exception as e:
            logger.error(f"[Supervisor] Error in iteration {iteration}: {e}")
            yield {
                "type": "error",
                "task_id": task_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "error": str(e)
            }
            break
    
    # Yield completion event
    yield {
        "type": "investigation_complete",
        "task_id": task_id,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    # Calculate and yield task duration
    investigation_end_time = datetime.now(timezone.utc)
    duration_seconds = int((investigation_end_time - investigation_start_time).total_seconds())
    yield {
        "type": "task_duration",
        "task_id": task_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "duration": duration_seconds
    }
