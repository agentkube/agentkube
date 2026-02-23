import json
import time
from typing import List, Dict, Any, AsyncGenerator, Optional
from openai import AsyncOpenAI
from agents import Agent, Runner, set_default_openai_client, OpenAIChatCompletionsModel, set_default_openai_api, set_tracing_export_api_key, ModelSettings, set_tracing_disabled
from agents.models.chatcmpl_converter import Converter
from agents.tool import FunctionTool

from agents import trace, gen_trace_id
from orchestrator.db.models.chat import ChatMessage
from orchestrator.db.models.stream import MessageStreamStatus

from orchestrator.tools.kubectl import kubectl_tools, set_kubecontext, get_resource_dependency
from orchestrator.tools.helm import helm_tools
from orchestrator.tools.filesystem import filesystem_tools
from orchestrator.tools.terminal import terminal_tools
from orchestrator.tools.argocd import argocd_tools
from orchestrator.tools.prometheus import prometheus_tools
from orchestrator.tools.grafana import grafana_tools
from orchestrator.tools.datadog import datadog_tools
from orchestrator.tools.docker import docker_tools
from orchestrator.tools.trivy import scan_manifest
from orchestrator.tools.opencost import opencost_tools
from orchestrator.tools.signoz import signoz_tools
from orchestrator.tools.grype import scan_image
from orchestrator.tools.agent import agent_tools
from orchestrator.tools.drift import drift_tools
from orchestrator.tools.planning import planning_tools 
from orchestrator.tools.loki import loki_tools 

from orchestrator.guardrails import kubernetes_security_guardrail, sensitive_data_guardrail
from extension.mcp import MCPServerStdio, MCPServerSse
from config import get_mcp_config, get_openrouter_api_key, get_openrouter_api_url, get_openai_api_key, get_web_search_enabled, get_cluster_config
from orchestrator.core.prompt.base_prompt import get_default_system_prompt, format_message_with_files
from orchestrator.services.byok.provider import get_provider_for_model
from orchestrator.utils.tool_mapper import get_component_for_tool, should_emit_custom_component, prepare_component_props
from orchestrator.session import Session, SessionInfo, SessionStatus, get_or_create_session, cleanup_session_state, SESSION_ABORT_SIGNALS, TextPart, ToolPart, ReasoningPart, TodoPart, MessagePart
import asyncio
from orchestrator.tools.deep_investigation import (
    get_past_investigations,
    get_investigation_details
)

# -------- DO NOT REMOVE ABOVE IMPORTS, IF REQUIRED USE IT ----------

def convert_mcp_tool_to_openai(tool: Any) -> Dict[str, Any]:
    """
    Convert MCP tool definition to OpenAI-compatible tool definition.

    Args:
        tool: MCP tool object with name, description, and inputSchema

    Returns:
        OpenAI-compatible tool definition
    """
    return {
        "type": "function",
        "function": {
            "name": tool.name,
            "description": tool.description or f"Execute {tool.name}",
            "parameters": {
                "type": "object",
                "properties": tool.inputSchema.get("properties", {}),
                "required": tool.inputSchema.get("required", [])
            }
        }
    }

# Global registry for termination signals (keyed by trace_id)
ACTIVE_SIGNALS: Dict[str, asyncio.Event] = {}

# Global registry for tool approval decisions (keyed by trace_id)
# Each entry contains: {tool_call_id: {"decision": str, "future": asyncio.Future}}
APPROVAL_DECISIONS: Dict[str, Dict[str, Dict[str, Any]]] = {}

# Tool approval policies
class ApprovalPolicy:
    AUTO_APPROVE = "auto_approve"  # Execute without approval
    REQUIRE_APPROVAL = "require_approval"  # Wait for user approval
    APPROVED_FOR_SESSION = "approved_for_session"  # Approved for entire session

# Session-wide approvals (keyed by trace_id, stores set of tool names)
SESSION_APPROVALS: Dict[str, set] = {}

# Redirect instructions (keyed by trace_id, stores new instruction message)
REDIRECT_INSTRUCTIONS: Dict[str, str] = {}

TODO_STATES: Dict[str, List[Dict[str, Any]]] = {}

def assess_tool_safety(tool_name: str, arguments: Dict[str, Any]) -> str:
    """
    Assess whether a tool requires approval based on safety criteria.
    Following OpenCode patterns - certain tools are auto-approved for better UX.

    Auto-approved tools (read-only or self-management):
    - Memory tools: save_memory, get_memory
    - Todo tools: todo_read, todo_write, todo_update, todo_delete, todo_clear
    - File read tools: read_file, glob, grep, list_tool
    - Web fetch: web_fetch (read-only)

    Tools requiring approval:
    - write_file, edit_file (file modifications)
    - shell (shell execution)

    Returns:
        ApprovalPolicy constant (REQUIRE_APPROVAL or AUTO_APPROVE)
    """
    # Auto-approve read-only and self-management tools (OpenCode style)
    AUTO_APPROVED_TOOLS = {
        # Memory tools - agent self-management
        "save_memory",
        "get_memory",
        # Todo tools - agent self-management (OpenCode style)
        "todo_write",
        "todo_read", 
        "todo_update",
        "todo_delete",
        "todo_clear",
        # File read tools - read-only
        "read_file",
        "glob",
        "grep",
        "list_tool",
        # Web fetch - read-only
        "web_fetch",
    }

    if tool_name in AUTO_APPROVED_TOOLS:
        return ApprovalPolicy.AUTO_APPROVE

    # Require approval for potentially destructive tools
    # - shell: Can execute any shell command
    # - write_file: Overwrites files
    # - edit_file: Modifies files
    return ApprovalPolicy.REQUIRE_APPROVAL

# ============================================================================
# AGENT LOOP IMPLEMENTATION
# ============================================================================

async def execute_tool_safe(
    tool_name: str,
    tool_function: Any,
    arguments: Dict[str, Any],
    call_id: str,
    trace_id: str = None,
    is_agents_sdk_tool: bool = False,
    is_mcp_tool: bool = False,
    mcp_server: Any = None
) -> Dict[str, Any]:
    """
    Execute a tool safely, catching errors and returning them as data.

    This implements the Codex pattern: errors are tool outputs, not exceptions.
    The agent can see the error and adjust its strategy.

    Args:
        tool_name: Name of the tool being executed
        tool_function: The actual tool function to call (or on_invoke_tool for FunctionTool)
        arguments: Arguments to pass to the tool
        call_id: Unique identifier for this tool call
        trace_id: Trace ID for session-specific state (injected for planning tools)
        is_agents_sdk_tool: Whether this is an agents SDK FunctionTool (uses on_invoke_tool)
        is_mcp_tool: Whether this is an MCP tool
        mcp_server: MCP server instance if this is an MCP tool

    Returns:
        Dict with call_id, output, and success flag
    """
    try:
        # Inject trace_id as session_id for todo tools that need session-specific state
        # OpenCode style: trace_id becomes the session_id for scoped todo storage
        todo_tools = ["todo_write", "todo_read", "todo_update", "todo_delete", "todo_clear"]
        if tool_name in todo_tools and trace_id:
            # Use trace_id as the session_id if not explicitly provided
            if "session_id" not in arguments or arguments["session_id"] == "default":
                arguments["session_id"] = trace_id

        if is_mcp_tool and mcp_server:
            # MCP tool - call via MCP server
            result = await mcp_server.call_tool(tool_name, arguments)
            # MCP returns CallToolResult with content field
            output = str(result.content) if hasattr(result, 'content') else str(result)
        elif is_agents_sdk_tool:
            # FunctionTool.on_invoke_tool expects (ToolContext, args_json_string)
            # We'll pass None for ToolContext and JSON string of arguments
            args_json = json.dumps(arguments)
            result = await tool_function(None, args_json)
            output = str(result) if result is not None else "Success"
        else:
            # Regular function - pass arguments as kwargs
            if asyncio.iscoroutinefunction(tool_function):
                result = await tool_function(**arguments)
            else:
                result = tool_function(**arguments)
            output = str(result) if result is not None else "Success"

        return {
            "call_id": call_id,
            "output": output,
            "success": True
        }

    except Exception as e:
        # Tool failed - return error as output (not exception)
        error_msg = f"Tool execution failed: {str(e)}"
        print(f"ERROR in {tool_name}: {error_msg}")
        import traceback
        traceback.print_exc()

        return {
            "call_id": call_id,
            "output": error_msg,
            "success": False
        }


async def run_agent_loop(
    openai_client: AsyncOpenAI,
    model_name: str,
    system_prompt: str,
    initial_message: str,
    chat_history: Optional[List[ChatMessage]],
    tools: List[Any],
    tools_map: Dict[str, Any],
    tools_sdk_flags: Dict[str, bool],
    trace_id: str,
    termination_signal: asyncio.Event,
    mcp_tools_map: Optional[Dict[str, Any]] = None,
    auto_approve: bool = False,
    reasoning_effort: str = "medium",
    max_iterations: int = 100
) -> AsyncGenerator[Dict[str, Any], None]:
    """
    Main agent loop

    Args:
        openai_client: AsyncOpenAI client instance
        model_name: Model identifier (e.g., "gpt-4o-mini")
        system_prompt: System instructions
        initial_message: User's message
        chat_history: Previous conversation history
        tools: List of tool schemas for OpenAI API (from Converter.tool_to_openai)
        tools_map: Dict mapping tool names to callable functions
        tools_sdk_flags: Dict indicating which tools are from agents SDK (use on_invoke_tool)
        trace_id: Unique trace ID for this session
        termination_signal: asyncio.Event that user can set to abort
        mcp_tools_map: Dict mapping MCP tool names to their MCP server instances
        auto_approve: If True, skip approval flow and execute all tools automatically
        reasoning_effort: Reasoning effort level for o1/o3 models ("low", "medium", "high")
        max_iterations: Maximum number of loop iterations

    Yields:
        Dict events with types: iteration_start, text, tool_call_start,
        tool_call_end, user_cancelled, done
    """

    # Initialize MCP tools map if not provided
    if mcp_tools_map is None:
        mcp_tools_map = {}

    # Build initial conversation messages
    messages = [{"role": "system", "content": system_prompt}]

    if chat_history:
        for msg in chat_history:
            messages.append({
                "role": msg.role,
                "content": msg.content
            })

    messages.append({"role": "user", "content": initial_message})

    iteration = 0
    
    # Token usage tracking (OpenCode-style)
    total_input_tokens = 0
    total_output_tokens = 0

    while iteration < max_iterations:
        # Check if user requested termination
        if termination_signal.is_set():
            yield {
                "type": "user_cancelled",
                "message": "User aborted the request"
            }
            break

        iteration += 1
        yield {
            "type": "iteration_start",
            "iteration": iteration
        }

        # Call OpenAI API with streaming
        try:
            stream = await openai_client.chat.completions.create(
                model=model_name,
                messages=messages,
                tools=tools if tools else None,
                stream=True,
                stream_options={"include_usage": True},  # Enable token usage in stream
                temperature=0.1,
                # reasoning_effort=reasoning_effort,
                extra_headers={
                    "HTTP-Referer": "https://agentkube.com",
                    "X-Title": "Agentkube", 
                },
            )

            # Track response data
            has_tool_calls = False
            tool_calls = []
            assistant_message_content = ""

            # Process streaming chunks
            async for chunk in stream:
                # Check for user cancellation during streaming
                if termination_signal.is_set():
                    yield {
                        "type": "user_cancelled",
                        "message": "User aborted during LLM generation"
                    }
                    return

                # Extract token usage from stream (OpenCode-style)
                # Usage comes in a chunk that may not have choices
                if hasattr(chunk, 'usage') and chunk.usage:
                    total_input_tokens += chunk.usage.prompt_tokens or 0
                    total_output_tokens += chunk.usage.completion_tokens or 0
                    
                    # Emit usage event
                    yield {
                        "type": "usage",
                        "tokens": {
                            "input": total_input_tokens,
                            "output": total_output_tokens,
                            "total": total_input_tokens + total_output_tokens
                        }
                    }

                if not chunk.choices:
                    continue

                choice = chunk.choices[0]
                delta = choice.delta
                
                # Handle reasoning content (OpenAI o1/o3 models)
                if hasattr(delta, 'reasoning_content') and delta.reasoning_content:
                    yield {
                        "type": "reasoning_text",
                        "content": delta.reasoning_content
                    }

                # Handle text content
                if delta.content:
                    assistant_message_content += delta.content
                    yield {
                        "type": "text",
                        "content": delta.content
                    }

                # Handle tool calls
                if delta.tool_calls:
                    for tool_call_delta in delta.tool_calls:
                        # Initialize tool call if new
                        while len(tool_calls) <= tool_call_delta.index:
                            tool_calls.append({
                                "id": "",
                                "name": "",
                                "arguments": ""
                            })

                        tc = tool_calls[tool_call_delta.index]

                        # Accumulate tool call data
                        if tool_call_delta.id:
                            tc["id"] = tool_call_delta.id
                            has_tool_calls = True

                        if tool_call_delta.function:
                            if tool_call_delta.function.name:
                                tc["name"] = tool_call_delta.function.name

                            if tool_call_delta.function.arguments:
                                tc["arguments"] += tool_call_delta.function.arguments

            # If we have text response and no tool calls, we're done
            if assistant_message_content and not has_tool_calls:
                # Add assistant message to history
                messages.append({
                    "role": "assistant",
                    "content": assistant_message_content
                })

                yield {
                    "type": "done",
                    "reason": "completed",
                    "message": "Agent completed the task",
                    "tokens": {
                        "input": total_input_tokens,
                        "output": total_output_tokens,
                        "total": total_input_tokens + total_output_tokens
                    }
                }
                break

            # If no tool calls at all, we're done
            if not has_tool_calls:
                yield {
                    "type": "done",
                    "reason": "completed",
                    "message": "Agent completed the task",
                    "tokens": {
                        "input": total_input_tokens,
                        "output": total_output_tokens,
                        "total": total_input_tokens + total_output_tokens
                    }
                }
                break

            # Parse and emit tool_call_start events
            for tc in tool_calls:
                if tc["name"]:
                    try:
                        tc["arguments"] = json.loads(tc["arguments"]) if tc["arguments"] else {}
                    except json.JSONDecodeError:
                        tc["arguments"] = {}

                    yield {
                        "type": "tool_call_start",
                        "tool": tc["name"],
                        "arguments": tc["arguments"],
                        "call_id": tc["id"]
                    }

            # Execute all tool calls (with approval flow)
            tool_results = []
            redirect_requested = False
            redirect_message = None

            for tc in tool_calls:
                if not tc["name"]:
                    continue

                # Check termination before executing each tool
                if termination_signal.is_set():
                    yield {
                        "type": "user_cancelled",
                        "message": "User aborted during tool execution"
                    }
                    return

                # Assess if tool requires approval
                approval_policy = assess_tool_safety(tc["name"], tc["arguments"])

                # Override approval policy if auto_approve is enabled
                if auto_approve:
                    approval_policy = ApprovalPolicy.AUTO_APPROVE

                # Check if tool was already approved for session
                if trace_id in SESSION_APPROVALS and tc["name"] in SESSION_APPROVALS[trace_id]:
                    approval_policy = ApprovalPolicy.AUTO_APPROVE

                # Handle approval flow
                if approval_policy == ApprovalPolicy.REQUIRE_APPROVAL:
                    # Request approval from user
                    yield {
                        "type": "tool_approval_request",
                        "tool": tc["name"],
                        "arguments": tc["arguments"],
                        "call_id": tc["id"],
                        "message": f"Tool '{tc['name']}' requires approval before execution"
                    }

                    # Create a future to wait for user decision
                    approval_future = asyncio.Future()

                    # Register approval decision holder
                    if trace_id not in APPROVAL_DECISIONS:
                        APPROVAL_DECISIONS[trace_id] = {}

                    APPROVAL_DECISIONS[trace_id][tc["id"]] = {
                        "tool": tc["name"],
                        "arguments": tc["arguments"],
                        "future": approval_future
                    }

                    try:
                        # Wait for user decision (with timeout)
                        decision = await asyncio.wait_for(approval_future, timeout=300)  # 5 minute timeout

                        # Clean up approval decision
                        del APPROVAL_DECISIONS[trace_id][tc["id"]]

                        if decision == "deny":
                            # User denied execution
                            result = {
                                "call_id": tc["id"],
                                "output": f"Tool execution denied by user",
                                "success": False
                            }

                            yield {
                                "type": "tool_denied",
                                "tool": tc["name"],
                                "call_id": tc["id"],
                                "message": "User denied tool execution"
                            }

                        elif decision == "redirect":
                            # User wants to redirect with new instruction
                            new_instruction = REDIRECT_INSTRUCTIONS.get(trace_id, "")

                            # Deny current tool call
                            result = {
                                "call_id": tc["id"],
                                "output": f"Tool execution redirected by user with new instruction",
                                "success": False
                            }

                            yield {
                                "type": "tool_redirected",
                                "tool": tc["name"],
                                "call_id": tc["id"],
                                "message": "User redirected with new instruction",
                                "new_instruction": new_instruction
                            }

                            # Mark all remaining tool calls as skipped since we're redirecting
                            for remaining_tc in tool_calls[tool_calls.index(tc) + 1:]:
                                tool_results.append({
                                    "call_id": remaining_tc["id"],
                                    "output": "Skipped due to redirect",
                                    "success": False
                                })

                            # Add redirect flag to break out and inject new message
                            yield {
                                "type": "redirect_requested",
                                "new_message": new_instruction
                            }

                            # Set redirect flag
                            redirect_requested = True
                            redirect_message = new_instruction

                            # Clean up redirect instruction
                            if trace_id in REDIRECT_INSTRUCTIONS:
                                del REDIRECT_INSTRUCTIONS[trace_id]

                            # Break tool calls loop to inject new message
                            break

                        elif decision == "approve_for_session":
                            # User approved for entire session
                            if trace_id not in SESSION_APPROVALS:
                                SESSION_APPROVALS[trace_id] = set()
                            SESSION_APPROVALS[trace_id].add(tc["name"])

                            yield {
                                "type": "tool_approved",
                                "tool": tc["name"],
                                "call_id": tc["id"],
                                "scope": "session",
                                "message": f"Tool '{tc['name']}' approved for this session"
                            }

                            # Execute the tool
                            tool_function = tools_map.get(tc["name"])
                            is_sdk_tool = tools_sdk_flags.get(tc["name"], False)
                            is_mcp = tc["name"] in mcp_tools_map
                            mcp_server = mcp_tools_map.get(tc["name"]) if is_mcp else None

                            if tool_function or is_mcp:
                                result = await execute_tool_safe(
                                    tool_name=tc["name"],
                                    tool_function=tool_function,
                                    arguments=tc["arguments"],
                                    call_id=tc["id"],
                                    trace_id=trace_id,
                                    is_agents_sdk_tool=is_sdk_tool,
                                    is_mcp_tool=is_mcp,
                                    mcp_server=mcp_server
                                )
                            else:
                                result = {
                                    "call_id": tc["id"],
                                    "output": f"Error: Tool '{tc['name']}' not found",
                                    "success": False
                                }

                        else:  # approve
                            # User approved single execution
                            yield {
                                "type": "tool_approved",
                                "tool": tc["name"],
                                "call_id": tc["id"],
                                "scope": "once",
                                "message": f"Tool '{tc['name']}' approved"
                            }

                            # Execute the tool
                            tool_function = tools_map.get(tc["name"])
                            is_sdk_tool = tools_sdk_flags.get(tc["name"], False)
                            is_mcp = tc["name"] in mcp_tools_map
                            mcp_server = mcp_tools_map.get(tc["name"]) if is_mcp else None

                            if tool_function or is_mcp:
                                result = await execute_tool_safe(
                                    tool_name=tc["name"],
                                    tool_function=tool_function,
                                    arguments=tc["arguments"],
                                    call_id=tc["id"],
                                    trace_id=trace_id,
                                    is_agents_sdk_tool=is_sdk_tool,
                                    is_mcp_tool=is_mcp,
                                    mcp_server=mcp_server
                                )
                            else:
                                result = {
                                    "call_id": tc["id"],
                                    "output": f"Error: Tool '{tc['name']}' not found",
                                    "success": False
                                }

                    except asyncio.TimeoutError:
                        # Timeout waiting for approval - deny by default
                        result = {
                            "call_id": tc["id"],
                            "output": f"Tool execution timed out waiting for user approval",
                            "success": False
                        }

                        yield {
                            "type": "tool_timeout",
                            "tool": tc["name"],
                            "call_id": tc["id"],
                            "message": "Approval request timed out"
                        }

                        # Clean up
                        if trace_id in APPROVAL_DECISIONS and tc["id"] in APPROVAL_DECISIONS[trace_id]:
                            del APPROVAL_DECISIONS[trace_id][tc["id"]]

                else:
                    # Auto-approve: execute directly
                    tool_function = tools_map.get(tc["name"])
                    is_sdk_tool = tools_sdk_flags.get(tc["name"], False)
                    is_mcp = tc["name"] in mcp_tools_map
                    mcp_server = mcp_tools_map.get(tc["name"]) if is_mcp else None

                    if tool_function or is_mcp:
                        result = await execute_tool_safe(
                            tool_name=tc["name"],
                            tool_function=tool_function,
                            arguments=tc["arguments"],
                            call_id=tc["id"],
                            trace_id=trace_id,
                            is_agents_sdk_tool=is_sdk_tool,
                            is_mcp_tool=is_mcp,
                            mcp_server=mcp_server
                        )
                    else:
                        result = {
                            "call_id": tc["id"],
                            "output": f"Error: Tool '{tc['name']}' not found",
                            "success": False
                        }

                tool_results.append(result)
                
                # --- Emit custom_component event if tool has a GenUI component mapping
                if should_emit_custom_component(tc["name"], result):
                    component_name = get_component_for_tool(tc["name"])
                    component_props = prepare_component_props(tc["name"], result["output"])

                    yield {
                        "type": "custom_component",
                        "component": component_name,
                        "props": component_props,
                        "call_id": result["call_id"]
                    }
                # --- End of custom_component event emission

                yield {
                    "type": "tool_call_end",
                    "tool": tc["name"],
                    "result": result["output"],
                    "success": result["success"],
                    "call_id": result["call_id"]
                }

                # ============================================================================
                # OPENCODE-STYLE TODO EVENTS
                # Emit events when todo tools are called for real-time UI updates
                # ============================================================================
                todo_tools = ["todo_write", "todo_update", "todo_delete", "todo_clear"]
                if tc["name"] in todo_tools and result.get("success", False):
                    try:
                        # Parse the result to get todo data
                        raw_output = result["output"]
                        
                        result_data = json.loads(raw_output) if isinstance(raw_output, str) else raw_output
                        
                        # Determine event type based on tool
                        if tc["name"] == "todo_write":
                            event_type = "todo.created"
                            todo_item = result_data.get("todo", {})
                        elif tc["name"] == "todo_update":
                            event_type = "todo.updated"
                            todo_item = result_data.get("todo", {})
                        elif tc["name"] == "todo_delete":
                            event_type = "todo.deleted"
                            todo_item = {"id": tc["arguments"].get("todo_id")}
                        else:  # todo_clear
                            event_type = "todo.cleared"
                            todo_item = {}
                        
                        # Get session_id from arguments or use trace_id
                        session_id = tc["arguments"].get("session_id", trace_id)
                        
                        # Emit OpenCode-style todo event
                        yield {
                            "type": event_type,
                            "session_id": session_id,
                            "todo": todo_item,
                            "total_todos": result_data.get("total_todos", result_data.get("remaining_todos", 0)),
                            "call_id": result["call_id"],
                            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                        }
                        
                        # Also sync to in-memory TODO_STATES for backward compatibility
                        if tc["name"] == "todo_write" and todo_item:
                            if trace_id not in TODO_STATES:
                                TODO_STATES[trace_id] = []
                            TODO_STATES[trace_id].append(todo_item)
                        
                    except (json.JSONDecodeError, KeyError, TypeError) as e:
                        # If result parsing fails, skip custom event
                        pass

                # ============================================================================
                # PLAN EVENTS (write_todos / read_todos from planning.py)
                # Emit plan_created/plan_updated events for the planning tools
                # ============================================================================
                if tc["name"] == "write_todos" and result.get("success", False):
                    try:
                        result_data = json.loads(result["output"]) if isinstance(result["output"], str) else result["output"]
                        
                        if result_data.get("success", False):
                            # Get the todos from TODO_STATES which write_todos stores
                            todos = TODO_STATES.get(trace_id, [])
                            is_new_plan = result_data.get("is_new_plan", True)
                            
                            event_type = "plan_created" if is_new_plan else "plan_updated"
                            
                            yield {
                                "type": event_type,
                                "todos": todos,
                                "todo_count": len(todos),
                                "trace_id": trace_id,
                                "call_id": result["call_id"],
                                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                            }
                    except (json.JSONDecodeError, KeyError, TypeError):
                        pass

            # Handle redirect if requested
            if redirect_requested and redirect_message:
                # Don't add tool calls/results to history, inject new user message instead
                messages.append({
                    "role": "user",
                    "content": redirect_message
                })

                yield {
                    "type": "user_message_injected",
                    "message": redirect_message
                }

                # Continue to next iteration with new user message
            else:
                # Normal flow: Add assistant's tool calls to conversation history
                messages.append({
                    "role": "assistant",
                    "content": assistant_message_content if assistant_message_content else None,
                    "tool_calls": [
                        {
                            "id": tc["id"],
                            "type": "function",
                            "function": {
                                "name": tc["name"],
                                "arguments": json.dumps(tc["arguments"])
                            }
                        }
                        for tc in tool_calls if tc["name"]
                    ]
                })

                # Add tool results to conversation history
                for result in tool_results:
                    messages.append({
                        "role": "tool",
                        "tool_call_id": result["call_id"],
                        "content": result["output"]
                    })

                # Continue to next iteration - LLM will see tool results

        except Exception as e:
            # Extract clean error message from provider API errors
            error_msg = str(e)
            try:
                # OpenAI SDK errors have a response with JSON body
                if hasattr(e, 'response'):
                    body = e.response.json()
                    if isinstance(body, dict) and 'error' in body:
                        err = body['error']
                        if isinstance(err, dict) and 'message' in err:
                            error_msg = err['message']
                elif hasattr(e, 'body') and isinstance(e.body, dict):
                    err = e.body.get('error', {})
                    if isinstance(err, dict) and 'message' in err:
                        error_msg = err['message']
            except Exception:
                pass  # Fall back to str(e)

            print(f"FATAL ERROR: {error_msg}")
            import traceback
            traceback.print_exc()

            yield {
                "type": "error",
                "error": error_msg
            }
            yield {
                "type": "done",
                "reason": "error"
            }
            break

    # Max iterations reached
    if iteration >= max_iterations:
        yield {
            "type": "done",
            "reason": "max_iterations",
            "message": f"Reached maximum iteration limit ({max_iterations})"
        }


# Dependency on Event Analyzer and Log Analyzer
async def process_stream_events(result, trace_id: str) -> AsyncGenerator[str, None]:
    """
    Process and yield events from the agent stream.
    """

    
    yield json.dumps({'trace_id': trace_id})
    
    async for event in result.stream_events():
        try:
            # Log event to strean.log
            # with open("logs/stream5.log", "a") as f:
            #     f.write(f"EVENT: {event.type}\n")
            #     f.write(f"DATA: {vars(event)}\n")
            #     if hasattr(event, 'data'):
            #         f.write(f"EVENT_DATA: {vars(event.data)}\n")
            #     f.write("---\n")
            
            if event.type == "raw_response_event":
                if (hasattr(event.data, "delta") and event.data.delta and 
                    hasattr(event.data, "type") and event.data.type == "response.output_text.delta"):
                    yield json.dumps({'text': event.data.delta})
                elif (hasattr(event.data, "type") and event.data.type == "response.output_item.done" and
                      hasattr(event.data, "item") and hasattr(event.data.item, "type") and 
                      event.data.item.type == "function_call"):
                    
                    function_name = event.data.item.name
                    function_args = json.loads(event.data.item.arguments) if event.data.item.arguments else {}
                    
        
                        
                    function_call = {
                        "tool": event.data.item.name,
                        "name": event.data.item.name,
                        "arguments": event.data.item.arguments,
                        "call_id": event.data.item.call_id
                    }
                    yield json.dumps({'function_call': function_call})
                    
            elif event.type == "run_item_stream_event":
                if event.item.type == "tool_call_item":
                    if hasattr(event.item, "raw_item") and hasattr(event.item.raw_item, "name"):
                        call_id = getattr(event.item.raw_item, "call_id", "")
                        tool_data = {
                            "tool": event.item.raw_item.name,
                            "command": event.item.raw_item.arguments,
                            "name": event.item.raw_item.name,
                            "arguments": event.item.raw_item.arguments,
                            "call_id": call_id
                        }
                        yield json.dumps({'tool_call': tool_data})
                        
                elif event.item.type == "tool_call_output_item":
                    if hasattr(event.item, "output"):
                        tool_output_data = {
                            "call_id": event.item.raw_item.get("call_id", ""),
                            "output": event.item.output
                        }
                        yield json.dumps({'tool_output': tool_output_data})
                        
                elif event.item.type == "message_output_item":
                    if hasattr(event.item, "content") and event.item.content:
                        yield json.dumps({'text': event.item.content})
                        
                elif event.item.type == "handoff_item":
                    if hasattr(event.item, "target_agent"):
                        handoff_data = {
                            "target_agent": event.item.target_agent.name if hasattr(event.item.target_agent, 'name') else str(event.item.target_agent),
                            "handoff_type": "agent_handoff"
                        }
                        yield json.dumps({'handoff': handoff_data})
                
        except Exception as e:
            error_msg = f"Error processing event: {str(e)}"
            print(f"ERROR: {error_msg}")
            yield json.dumps({'error': error_msg})
    
    yield json.dumps({'done': True})
    yield MessageStreamStatus.done.value

async def create_mcp_server(server_name: str, server_config: Dict[str, Any]) -> Optional[Any]:
    """
    Create and connect to an MCP server based on configuration.
    """
    if not server_config.get("enabled", True):
        print(f"Skipping disabled MCP server: {server_name}")
        return None
        
    transport_type = server_config.get("transport", "").lower()
    
    # Auto-detect transport if not specified
    if not transport_type:
        if "url" in server_config:
            transport_type = "sse"
        elif "command" in server_config:
            transport_type = "stdio"
        else:
            print(f"Skipping MCP server {server_name}: Cannot determine transport type")
            return None
    
    try:
        if transport_type == "stdio":
            # Stdio servers need longer timeout for process spawning
            mcp_server = MCPServerStdio(
                params={
                    "command": server_config["command"],
                    "args": server_config.get("args", []),
                    "env": server_config.get("env"),
                    "cwd": server_config.get("cwd")
                },
                name=server_name,
                client_session_timeout_seconds=server_config.get("timeout", 30)
            )
        elif transport_type == "sse":
            mcp_server = MCPServerSse(
                params={
                    "url": server_config["url"],
                    "headers": server_config.get("headers"),
                    "timeout": server_config.get("timeout", 5),
                    "sse_read_timeout": server_config.get("sse_read_timeout", 300)
                }, 
                name=server_name
            )
        else:
            print(f"Unsupported transport type for {server_name}: {transport_type}")
            return None
            
        await mcp_server.connect()
        print(f"Successfully connected to MCP server: {server_name}")
        return mcp_server
        
    except Exception as e:
        print(f"Failed to connect to MCP server {server_name}: {e}")
        return None

async def setup_mcp_servers() -> List[Any]:
    """
    Set up and connect to all configured MCP servers.
    """
    mcp_servers = []
    mcp_config = get_mcp_config()
    
    if not mcp_config or "mcpServers" not in mcp_config:
        return mcp_servers
    
    # Create servers concurrently for better performance
    server_tasks = []
    for server_name, server_config in mcp_config["mcpServers"].items():
        task = create_mcp_server(server_name, server_config)
        server_tasks.append(task)
    
    # Wait for all connections to complete
    servers = await asyncio.gather(*server_tasks, return_exceptions=True)
    
    # Filter out None values and exceptions
    for server in servers:
        if server is not None and not isinstance(server, Exception):
            mcp_servers.append(server)
    
    print(f"Total MCP servers connected: {len(mcp_servers)}")
    return mcp_servers

def cleanup_mcp_servers(mcp_servers: List[Any]) -> None:
    """
    Clean up and disconnect MCP servers.
    """
    if not mcp_servers:
        return

    for mcp_server in mcp_servers:
        try:
            mcp_server.session = None
            print(f"Disconnected MCP server: {mcp_server.name}")
        except Exception as e:
            print(f"Error disconnecting MCP server: {e}")

    mcp_servers.clear()
    print("All MCP servers disconnected")

def cleanup_session(trace_id: str, mcp_servers: List[Any]) -> None:
    """
    Clean up session resources including MCP servers and approval state.
    """
    # Cleanup MCP servers
    cleanup_mcp_servers(mcp_servers)

    # Remove termination signal from registry
    if trace_id in ACTIVE_SIGNALS:
        del ACTIVE_SIGNALS[trace_id]

    # Remove approval decisions for this session
    if trace_id in APPROVAL_DECISIONS:
        del APPROVAL_DECISIONS[trace_id]

    # Remove session approvals for this session
    if trace_id in SESSION_APPROVALS:
        del SESSION_APPROVALS[trace_id]

    # Remove redirect instructions for this session
    if trace_id in REDIRECT_INSTRUCTIONS:
        del REDIRECT_INSTRUCTIONS[trace_id]

    # Remove todo states for this session
    if trace_id in TODO_STATES:
        del TODO_STATES[trace_id]

def setup_openai_client() -> None:
    """
    Set up the OpenAI client with custom configuration.
    """
    custom_client = AsyncOpenAI(
        base_url=get_openrouter_api_url(), 
        api_key=get_openrouter_api_key(),
    )
    set_default_openai_client(custom_client)
    set_default_openai_api("chat_completions")
    set_tracing_export_api_key(api_key=get_openai_api_key())
    
    #TODO Add comment in dev mode
    set_tracing_disabled(True)

def get_enabled_tools(kubecontext: Optional[str] = None):
    """
    Get enabled optional tools based on cluster configuration.
    Returns only the optional tools if they are configured.
    """
    enabled_tools = []
    
    if not kubecontext:
        # If no kubecontext, don't add optional tools
        return enabled_tools
    
    try:
        cluster_config = get_cluster_config(kubecontext)
        
        # Check if ArgoCD is enabled
        argocd_config = cluster_config.get('argocd', {})
        if argocd_config.get('enabled', False) or argocd_config.get('service_address'):
            enabled_tools.extend(argocd_tools)
        
        # Check if Prometheus is enabled
        prometheus_config = cluster_config.get('prometheus', {})
        if prometheus_config.get('enabled', False) or prometheus_config.get('service_address') or prometheus_config.get('url'):
            enabled_tools.extend(prometheus_tools)
            
        # Check if Grafana is enabled
        grafana_config = cluster_config.get('grafana', {})
        if grafana_config.get('enabled', False) or grafana_config.get('api_token') or grafana_config.get('url'):
            enabled_tools.extend(grafana_tools)
        
        # Check if DataDog is enabled
        datadog_config = cluster_config.get('datadog', {})
        if datadog_config.get('enabled', False) or datadog_config.get('service_address') or datadog_config.get('url'):
            enabled_tools.extend(datadog_tools)
        
        # Check if Docker is enabled
        docker_config = cluster_config.get('docker', {})
        if docker_config.get('enabled', False):
            enabled_tools.extend(docker_tools)
        
        # Check if Trivy is enabled
        trivy_config = cluster_config.get('trivy', {})
        if trivy_config.get('enabled', False):
            enabled_tools.append(scan_manifest)
        
        # Check if OpenCost is enabled
        opencost_config = cluster_config.get('opencost', {})
        if opencost_config.get('enabled', False) or opencost_config.get('service_address') or opencost_config.get('url'):
            enabled_tools.extend(opencost_tools)
        
        # Check if SigNoz is enabled
        signoz_config = cluster_config.get('signoz', {})
        if signoz_config.get('enabled', False) or signoz_config.get('api_token') or signoz_config.get('url'):
            enabled_tools.extend(signoz_tools)
            
        # Check if Loki is enabled
        loki_config = cluster_config.get('loki', {})
        if loki_config.get('enabled', False) or loki_config.get('service_address') or loki_config.get('url'):
            enabled_tools.extend(loki_tools)
        
        return enabled_tools
    except Exception as e:
        print(f"Error checking cluster config for {kubecontext}: {e}")
        # Return empty list on error
        return enabled_tools


def prepare_input_messages(chat_history: Optional[List[ChatMessage]], 
                          formatted_message: str) -> Any:
    """
    Prepare input messages for the agent.
    """
    if not chat_history:
        return formatted_message
    
    input_messages = []
    for msg in chat_history:
        input_messages.append({
            "role": msg.role,
            "content": msg.content
        })
    
    input_messages.append({"role": "user", "content": formatted_message})
    return input_messages


async def stream_agent_response(
    message: str,
    chat_history: Optional[List[ChatMessage]] = None,
    model_name: str = "openai/gpt-4o-mini",
    kubecontext: Optional[str] = None,
    kubeconfig: Optional[str] = None,
    custom_prompt: Optional[str] = None,
    files: Optional[List[Dict[str, str]]] = None,
    auto_approve: bool = False,
    reasoning_effort: str = "medium",
    session_id: Optional[str] = None  # OpenCode-style session ID
) -> AsyncGenerator[str, None]:
    """
    Stream a response from the Kubernetes assistant using the iterative agent loop.

    This implementation follows OpenCode patterns:
    - Proper session management with persistent storage
    - Multiple iterations within a single request
    - Tool execution with result feedback
    - User-controlled termination
    - Graceful error handling
    - Auto-approval of tool executions
    
    Args:
        message: User message
        chat_history: Previous chat messages
        model_name: LLM model to use
        kubecontext: Kubernetes context
        kubeconfig: Path to kubeconfig file
        custom_prompt: Custom system prompt
        files: Attached files
        auto_approve: Auto-approve tool executions
        reasoning_effort: Reasoning effort for o1/o3 models
        session_id: OpenCode-style session ID - if provided, continues existing session
    """
    setup_openai_client()

    # =========================================================================
    # OPENCODE-STYLE SESSION MANAGEMENT
    # Get or create a session with proper persistence
    # =========================================================================
    session = get_or_create_session(
        session_id=session_id,
        title=message[:50] + "..." if len(message) > 50 else message,
        model=model_name
    )
    
    # Use session.id as the canonical session identifier
    current_session_id = session.id
    
    # Mark session as busy
    Session.set_busy(current_session_id)
    
    # Store user message in session
    Session.add_message(current_session_id, "user", message)


    accumulated_parts: List[MessagePart] = []  # Parts in order of arrival
    current_text_part: Optional[TextPart] = None  # Current text part being streamed
    accumulated_todos = []  # List of todo items created/updated during this response
    
    # Helper to finalize current text part and start a new one
    def finalize_current_text_part():
        nonlocal current_text_part
        if current_text_part and current_text_part.content.strip():
            accumulated_parts.append(current_text_part)
        current_text_part = None


    # trace_id is ONLY for observability tracing, NOT session management
    trace_id = gen_trace_id()
    system_prompt = custom_prompt or get_default_system_prompt(kubecontext, kubeconfig_path=kubeconfig)

    # Create termination signal for this session (keyed by session_id, not trace_id)
    termination_signal = asyncio.Event()
    SESSION_ABORT_SIGNALS[current_session_id] = termination_signal
    
    # Also keep in ACTIVE_SIGNALS for backward compatibility with abort endpoint
    ACTIVE_SIGNALS[current_session_id] = termination_signal

    with trace(workflow_name="Kubernetes Assistant", trace_id=trace_id):
        mcp_servers = []
        try:
            # First event: send session_id so frontend can continue/abort
            yield json.dumps({
                'session_id': current_session_id,
                'trace_id': trace_id,  # Keep for backward compatibility
                'session': session.to_dict()  # Full session info
            })

            set_kubecontext(kubecontext, kubeconfig_path=kubeconfig)

            # Connect MCP servers
            mcp_servers = await setup_mcp_servers()

            # Comment out original Kubernetes tools - keeping for reference
            # enabled_tools = kubectl_tools + helm_tools + terminal_tools + filesystem_tools + drift_tools + [scan_image] + get_enabled_tools(kubecontext)
            
            # Use only agent_tools (OpenCode style)
            enabled_tools = agent_tools + [scan_image] + [get_past_investigations, get_investigation_details, get_resource_dependency] + get_enabled_tools(kubecontext)

            enable_websearch = ":online" if get_web_search_enabled() else ""

            provider_config = get_provider_for_model(model_name)

            # Create OpenAI client with provider config
            openai_client = AsyncOpenAI(
                base_url=provider_config.base_url,
                api_key=provider_config.api_key,
            )

            # Build tools schema and tools map for OpenAI format
            import inspect
            tools_schema = []
            tools_map = {}
            tools_sdk_flags = {}  # Track which tools are from agents SDK
            mcp_tools_map = {}  # Track MCP tools: tool_name -> mcp_server

            # First, collect MCP tools from all connected servers
            for mcp_server in mcp_servers:
                try:
                    mcp_tools = await mcp_server.list_tools()
                    for mcp_tool in mcp_tools:
                        # Convert MCP tool to OpenAI format
                        openai_tool_format = convert_mcp_tool_to_openai(mcp_tool)
                        tools_schema.append(openai_tool_format)

                        # Map tool name to MCP server instance
                        mcp_tools_map[mcp_tool.name] = mcp_server
                except Exception as e:
                    print(f"Error listing tools from MCP server {mcp_server.name}: {e}")

            # Then, process regular enabled tools
            for tool in enabled_tools:
                # Check if it's a FunctionTool from agents SDK
                if isinstance(tool, FunctionTool):
                    # Use Converter to get OpenAI format
                    openai_tool_format = Converter.tool_to_openai(tool)
                    tools_schema.append(openai_tool_format)

                    # Store the actual callable (on_invoke_tool) in tools_map
                    tools_map[tool.name] = tool.on_invoke_tool
                    tools_sdk_flags[tool.name] = True  # Mark as agents SDK tool

                elif hasattr(tool, '__name__') and callable(tool):
                    # Regular Python function - build schema manually
                    tool_name = tool.__name__
                    tools_map[tool_name] = tool
                    tools_sdk_flags[tool_name] = False  # Not an agents SDK tool

                    sig = inspect.signature(tool)
                    parameters = {
                        "type": "object",
                        "properties": {},
                        "required": []
                    }

                    for param_name, param in sig.parameters.items():
                        # Determine parameter type
                        param_type = "string"  # default
                        if param.annotation != inspect.Parameter.empty:
                            annotation = param.annotation
                            # Handle typing hints
                            if annotation == int or str(annotation) == "<class 'int'>":
                                param_type = "integer"
                            elif annotation == bool or str(annotation) == "<class 'bool'>":
                                param_type = "boolean"
                            elif annotation == float or str(annotation) == "<class 'float'>":
                                param_type = "number"
                            elif hasattr(annotation, '__origin__'):
                                # Handle List, Optional, etc
                                if annotation.__origin__ == list:
                                    param_type = "array"

                        parameters["properties"][param_name] = {
                            "type": param_type,
                            "description": f"{param_name} parameter"
                        }

                        # Add to required if no default value
                        if param.default == inspect.Parameter.empty:
                            parameters["required"].append(param_name)

                    # Create OpenAI tool schema
                    tool_schema = {
                        "type": "function",
                        "function": {
                            "name": tool_name,
                            "description": (tool.__doc__ or f"Execute {tool_name}").strip(),
                            "parameters": parameters
                        }
                    }
                    tools_schema.append(tool_schema)
                else:
                    print(f"Warning: Skipping unsupported tool type: {type(tool)}")

            formatted_message = format_message_with_files(message, files)
            
            print("reasoning_effort", reasoning_effort)

            # Run agent loop with raw OpenAI API
            async for event in run_agent_loop(
                openai_client=openai_client,
                model_name=provider_config.model_name + enable_websearch,
                system_prompt=system_prompt,
                initial_message=formatted_message,
                chat_history=chat_history,
                tools=tools_schema,
                tools_map=tools_map,
                tools_sdk_flags=tools_sdk_flags,
                trace_id=current_session_id,  # Use session_id for session-scoped state
                termination_signal=termination_signal,
                mcp_tools_map=mcp_tools_map,
                auto_approve=auto_approve,
                reasoning_effort=reasoning_effort,
                max_iterations=100
            ):
                # Convert events to SSE format
                yield json.dumps(event)
                
                # =========================================================================
                # ACCUMULATE RESPONSE DATA FOR SESSION STORAGE
                # =========================================================================
                event_type = event.get("type")
                
                # =========================================================================
                # PARTS-BASED ACCUMULATION (OpenCode style)
                # Text and tool calls are stored as parts in order of arrival
                # =========================================================================
                
                # Accumulate text content - append to current TextPart or create new one
                if event_type == "text":
                    text_content = event.get("content", "")
                    if text_content:
                        if current_text_part is None:
                            # Create new text part
                            import uuid as uuid_module
                            current_text_part = TextPart(
                                id=str(uuid_module.uuid4()),
                                content=text_content
                            )
                        else:
                            # Append to existing text part
                            current_text_part.content += text_content
                
                # Reasoning text - similar to text but separate part type
                elif event_type == "reasoning_text":
                    text_content = event.get("content", "")
                    if text_content:
                        # Finalize current text part first
                        finalize_current_text_part()
                        # Create ReasoningPart
                        import uuid as uuid_module
                        reasoning_part = ReasoningPart(
                            id=str(uuid_module.uuid4()),
                            content=text_content
                        )
                        accumulated_parts.append(reasoning_part)
                
                # Track tool calls - finalize current text, add ToolPart
                elif event_type == "tool_call_start":
                    # Finalize any pending text part first
                    finalize_current_text_part()
                    
                    # Create ToolPart in pending state
                    import uuid as uuid_module
                    tool_part = ToolPart(
                        id=str(uuid_module.uuid4()),
                        call_id=event.get("call_id", ""),
                        tool_name=event.get("tool", ""),
                        arguments=event.get("arguments", {}),
                        state="running"  # Tool has started
                    )
                    accumulated_parts.append(tool_part)
                
                elif event_type == "tool_call_end":
                    # Find and update the matching ToolPart
                    call_id = event.get("call_id")
                    for part in accumulated_parts:
                        if isinstance(part, ToolPart) and part.call_id == call_id:
                            part.state = "completed" if event.get("success", False) else "error"
                            part.result = event.get("result", "")
                            part.success = event.get("success", False)
                            break
                
                # Track todos from OpenCode-style events
                elif event_type == "todo.created":
                    todo = event.get("todo", {})
                    if todo and todo.get("id"):
                        accumulated_todos.append(todo)
                
                elif event_type == "todo.updated":
                    todo = event.get("todo", {})
                    if todo and todo.get("id"):
                        # Update existing todo or add new one
                        found = False
                        for i, t in enumerate(accumulated_todos):
                            if t.get("id") == todo.get("id"):
                                accumulated_todos[i] = {**t, **todo}
                                found = True
                                break
                        if not found:
                            accumulated_todos.append(todo)
                
                elif event_type == "todo.deleted":
                    todo_id = event.get("todo", {}).get("id")
                    if todo_id:
                        accumulated_todos = [t for t in accumulated_todos if t.get("id") != todo_id]
                
                elif event_type == "todo.cleared":
                    accumulated_todos = []
                
                # Also handle plan events which contain todo lists
                elif event_type in ("plan_created", "plan_updated"):
                    todos = event.get("todos", [])
                    if todos:
                        accumulated_todos = todos
                
                # Handle user cancellation - save partial response with parts
                elif event_type == "user_cancelled":
                    # Finalize any pending text part
                    finalize_current_text_part()
                    
                    if accumulated_parts:
                        # Add a cancellation notice as a TextPart
                        import uuid as uuid_module
                        cancel_part = TextPart(
                            id=str(uuid_module.uuid4()),
                            content="\n\n*[Response cancelled by user]*"
                        )
                        accumulated_parts.append(cancel_part)
                        
                        # Save with parts (no metadata comments needed - parts are structured!)
                        Session.add_message(
                            current_session_id, 
                            "assistant", 
                            "",  # content computed from parts
                            parts=accumulated_parts
                        )
                    Session.set_idle(current_session_id)

            # =========================================================================
            # SAVE ASSISTANT MESSAGE TO SESSION (Parts-based)
            # Parts are stored in sequential order - no need for metadata comments!
            # =========================================================================
            
            # Finalize any pending text part first
            finalize_current_text_part()
            
            if accumulated_parts:
                # Save assistant message with parts
                Session.add_message(
                    current_session_id, 
                    "assistant", 
                    "",  # content is computed from parts
                    parts=accumulated_parts
                )

            # Mark session as idle on completion
            Session.set_idle(current_session_id)

            # Final done marker
            yield json.dumps({'done': True, 'session_id': current_session_id})
            yield MessageStreamStatus.done.value

        except Exception as e:
            error_msg = f"Error in agent execution: {str(e)}"
            print(f"ERROR: {error_msg}")
            
            # Still save partial response if any (using parts)
            finalize_current_text_part()
            if accumulated_parts:
                import uuid as uuid_module
                error_part = TextPart(
                    id=str(uuid_module.uuid4()),
                    content="\n\n*[Response interrupted due to error]*"
                )
                accumulated_parts.append(error_part)
                Session.add_message(
                    current_session_id, 
                    "assistant", 
                    "", 
                    parts=accumulated_parts
                )
            
            Session.set_idle(current_session_id)
            yield json.dumps({'error': error_msg})
            yield json.dumps({'done': True, 'session_id': current_session_id})
            yield MessageStreamStatus.done.value

        finally:
            # Clean up MCP servers and in-memory state
            cleanup_session(current_session_id, mcp_servers)
            cleanup_session_state(current_session_id)