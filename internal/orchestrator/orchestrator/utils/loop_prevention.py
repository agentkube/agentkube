from agents import ToolsToFinalOutputResult, FunctionToolResult
from typing import List, Any

def loop_detection_handler(context: Any, tool_results: List[FunctionToolResult]) -> ToolsToFinalOutputResult:
    """
    Custom handler to detect and break tool loops.
    
    It checks both the current tool execution and the conversation history (context.messages)
    to identify if the same tool has been called 3 or more times consecutively.
    """
    if not tool_results:
        return ToolsToFinalOutputResult(is_final_output=False, final_output=None)

    # 1. Identify the tool(s) currently being executed
    current_tool_names = [r.tool_name for r in tool_results]
    if not current_tool_names:
         return ToolsToFinalOutputResult(is_final_output=False, final_output=None)
    
    # We primarily check the first tool in the current batch (assuming sequential or batch-same usage)
    target_tool = current_tool_names[0]
    
    # 2. Count consecutive occurrences in history
    streak = 0
    
    # Add current batch size to streak if they are all the same
    for name in current_tool_names:
        if name == target_tool:
            streak += 1
        else:
            # If current batch mixes tools, we probably aren't in a simple loop
            return ToolsToFinalOutputResult(is_final_output=False, final_output=None)

    # 3. Check history
    if hasattr(context, "messages"):
        messages = context.messages
        # Iterate backwards
        for msg in reversed(messages):
            # Check for tool_calls
            tool_calls = getattr(msg, "tool_calls", None)
            if not tool_calls and isinstance(msg, dict):
                tool_calls = msg.get("tool_calls")
            
            if tool_calls:
                # Iterate through tool calls in this message (often usually 1)
                # If parsed as objects
                if isinstance(tool_calls, list):
                    # We need to process them in reverse order of their appearance in the list 
                    # to maintain the backward search flow, but typically "reversed(messages)" is enough chunking.
                    # Let's just check the last one or all.
                    
                    # For strict loop detection: verify if ALL tool calls in this message match the target
                    for tc in reversed(tool_calls):
                        name = None
                        if hasattr(tc, "function"):
                            name = tc.function.name
                        elif isinstance(tc, dict):
                            fn = tc.get("function", {})
                            name = fn.get("name")
                        
                        if name == target_tool:
                            streak += 1
                        else:
                            # Sequence broken
                            break
                    if name != target_tool:
                        break
            
            # If we encounter a user message or other interruption, strictly speaking the loop might be broken 
            # or it might be "User says continue" -> "Agent calls same tool".
            # For now, let's only count contiguous tool_call blocks. 
            # If we see a message *without* tool calls (like a text response), we check if it breaks the concept of a loop.
            # Usually: ToolCall -> ToolOutput -> ToolCall.
            # If we see ToolOutput (role=tool), we ignore it (it's part of the loop).
            
            role = getattr(msg, "role", None)
            if not role and isinstance(msg, dict):
                role = msg.get("role")
                
            if role == "tool":
                continue 
            
            # If we see a message that is NOT tool/assistant-with-tool, we stop counting
            if role == "user" or (role == "assistant" and not tool_calls):
                break
                
    # 4. Action
    if streak >= 3:
        return ToolsToFinalOutputResult(
            is_final_output=True,
            final_output=f"Detected repeated calls to {target_tool} ({streak} times). Stopping to prevent loop. The resource likely does not exist or has no data."
        )
    
    return ToolsToFinalOutputResult(is_final_output=False, final_output=None)
