"""
Planning tools for task management and progress tracking.

Provides write_todos and read_todos tools to enable agents to:
1. Break down complex tasks into structured plans
2. Track progress through task completion
3. Update status as work progresses

Inspired by OpenAI Codex's update_plan tool.
"""

from typing import List, Dict, Any, TypedDict
import json


class TodoItem(TypedDict):
    """A single todo item with status and content."""
    status: str  # "pending" | "in_progress" | "completed"
    content: str  # Task description


def write_todos(
    todos,  # List of todo items (no type hint to avoid schema issues)
    trace_id: str = None  # Will be injected by execute_tool_safe
) -> str:
    """
    Create or update the agent's todo list.

    This tool allows the agent to plan multi-step tasks and track progress.
    The entire todo list is replaced on each call (full replacement, not merge).

    Args:
        todos: List of todo items (array of objects), each containing:
            - status: string - Must be "pending", "in_progress", or "completed"
            - content: string - Task description (what needs to be done)

        Example:
            [
                {"status": "pending", "content": "Check cluster health"},
                {"status": "in_progress", "content": "Analyze pods"},
                {"status": "completed", "content": "Review logs"}
            ]

    Returns:
        Confirmation message

    Guidelines for agents:
    - Keep list minimal (3-6 items)
    - Only for complex, multi-step tasks (3+ steps)
    - Break down into clear, actionable items
    - For simple tasks (1-2 steps), execute directly without todos
    - Update status promptly as tasks complete
    - When creating a new plan, show it to user before starting

    Example:
        write_todos([
            {"status": "pending", "content": "Check cluster health"},
            {"status": "pending", "content": "Analyze resource usage"},
            {"status": "pending", "content": "Generate recommendations"}
        ])
    """
    from orchestrator.utils.stream_utils import TODO_STATES

    # Handle case where todos might be passed as a JSON string
    if isinstance(todos, str):
        try:
            todos = json.loads(todos)
        except json.JSONDecodeError:
            return "Error: todos parameter must be a valid JSON array"

    # Ensure todos is a list
    if not isinstance(todos, list):
        return "Error: todos parameter must be an array"

    # Validate todo structure
    for i, todo in enumerate(todos):
        if not isinstance(todo, dict):
            return f"Error: Todo at index {i} must be a dictionary"

        if "status" not in todo or "content" not in todo:
            return f"Error: Todo at index {i} must have 'status' and 'content' fields"

        if todo["status"] not in ["pending", "in_progress", "completed"]:
            return f"Error: Invalid status '{todo['status']}' at index {i}. Must be: pending, in_progress, or completed"

        if not isinstance(todo["content"], str) or not todo["content"].strip():
            return f"Error: Todo 'content' at index {i} must be a non-empty string"

    # Store todos in global registry (full replacement)
    if trace_id is None:
        return "Error: trace_id not available (internal error)"

    # Check if this is a new plan or an update
    is_new_plan = trace_id not in TODO_STATES or len(TODO_STATES.get(trace_id, [])) == 0

    # Store todos
    TODO_STATES[trace_id] = todos
    
    # Persist to disk for Session API access
    try:
        from orchestrator.session import Session
        todo_file = Session.get_todo_file(trace_id)
        if todo_file:
            todo_file.write_text(json.dumps({"todos": todos}, indent=2))
    except Exception as e:
        print(f"Failed to persist todos to disk: {e}")

    # Return confirmation with metadata for event emission
    result = {
        "success": True,
        "message": f"Updated todo list with {len(todos)} items",
        "is_new_plan": is_new_plan,
        "todo_count": len(todos)
    }

    return json.dumps(result)


def read_todos(trace_id: str = None) -> str:
    """
    Read the current todo list.

    Returns:
        JSON string of current todo items

    Example response:
        [
            {"status": "completed", "content": "Check cluster health"},
            {"status": "in_progress", "content": "Analyze resource usage"},
            {"status": "pending", "content": "Generate recommendations"}
        ]
    """
    from orchestrator.utils.stream_utils import TODO_STATES

    if trace_id is None:
        return json.dumps({
            "success": False,
            "error": "trace_id not available (internal error)"
        })

    todos = TODO_STATES.get(trace_id, [])
    
    # If not in memory, try loading from disk
    if not todos:
        try:
            from orchestrator.session import Session
            # Session.get_todos returns List[Dict]
            loaded_todos = Session.get_todos(trace_id)
            if loaded_todos:
                todos = loaded_todos
                # Cache in memory
                TODO_STATES[trace_id] = todos
        except Exception as e:
            print(f"Failed to load todos from disk: {e}")

    return json.dumps({
        "success": True,
        "todos": todos,
        "count": len(todos)
    })


# Export tools
planning_tools = [write_todos, read_todos]
