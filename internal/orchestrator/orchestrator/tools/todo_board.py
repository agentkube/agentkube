# orchestrator/tools/todo_board.py

import json
import datetime
import uuid
from pathlib import Path
from typing import Dict, Any, Optional, List, Literal
from agents import function_tool

# Storage configuration
AGENTKUBE_DIR = Path.home() / ".agentkube"
INVESTIGATION_DIR = AGENTKUBE_DIR / "storage" / "investigation"

def ensure_storage_dir():
    """Ensure the investigation storage directory exists."""
    INVESTIGATION_DIR.mkdir(parents=True, exist_ok=True)

def get_investigation_file(task_id: str) -> Path:
    """Get the file path for a specific investigation (task_id)."""
    ensure_storage_dir()
    # Sanitize task_id to ensure safe filename
    safe_id = "".join(c for c in task_id if c.isalnum() or c in ('-', '_'))
    if not safe_id:
        safe_id = "default"
    return INVESTIGATION_DIR / f"{safe_id}.json"

def load_todos(task_id: str) -> List[Dict[str, Any]]:
    """Load todos for a specific investigation ID."""
    file_path = get_investigation_file(task_id)
    if not file_path.exists():
        return []
    try:
        data = json.loads(file_path.read_text())
        return data.get("todos", [])
    except (json.JSONDecodeError, Exception):
        return []

def save_todos(task_id: str, todos: List[Dict[str, Any]]) -> None:
    """Save todos for a specific investigation ID."""
    file_path = get_investigation_file(task_id)
    data = {
        "task_id": task_id,
        "updated_at": datetime.datetime.now().isoformat(),
        "todos": todos
    }
    file_path.write_text(json.dumps(data, indent=2))

def generate_id() -> str:
    """Generate a unique ID for a todo item."""
    return f"TODO-{str(uuid.uuid4())[:8]}"

@function_tool
def create_todo(
    content: str,
    priority: str = "medium",
    task_id: str = "default",
    type: str = "analysis",
    assigned_to: str = "planning"
) -> Dict[str, Any]:
    """
    Create a new todo item in the investigation board.

    Args:
        content: Clear description of what needs to be done
        priority: Priority level ("high", "medium", "low")
        task_id: The ID of the investigation this todo belongs to (serves as the bucket/session ID)
        type: Task type (collection, analysis, validation, remediation)
        assigned_to: Agent responsible for the todo

    Returns:
        Dict containing success status and the created todo details.
    """
    try:
        # Normalize priority
        if priority.lower() not in ["high", "medium", "low"]:
            priority = "medium"
            
        timestamp = datetime.datetime.now().isoformat()
        
        new_todo = {
            "id": generate_id(),
            "content": content,
            "status": "pending",
            "priority": priority.lower(),
            "created_at": timestamp,
            "updated_at": timestamp,
            "type": type,
            "assigned_to": assigned_to,
            "investigation_id": task_id 
        }
        
        todos = load_todos(task_id)
        todos.append(new_todo)
        save_todos(task_id, todos)
        
        return {
            "success": True,
            "message": f"Todo created: {content}",
            "todo": new_todo
        }
    except Exception as e:
        return {"success": False, "error": f"Failed to create todo: {str(e)}"}


@function_tool
def update_todo(
    id: str,
    task_id: str, # made mandatory to find the file (investigation ID)
    status: Optional[str] = None,
    content: Optional[str] = None,
    priority: Optional[str] = None,
    assigned_to: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Update an existing todo's status or details.

    Args:
        id: The unique ID of the todo item (e.g., TODO-1234)
        task_id: The ID of the investigation (REQUIRED to locate the file)
        status: New status (pending, in_progress, completed, cancelled)
        content: Updated description
        priority: Updated priority ("high", "medium", "low")
        assigned_to: Reassign to another agent

    Returns:
        Dict containing success status and the updated todo.
    """
    try:
        todos = load_todos(task_id)
        
        found = False
        updated_todo = None
        
        for todo in todos:
            if todo.get("id") == id:
                found = True
                if status:
                    todo["status"] = status
                if content:
                    todo["content"] = content
                if priority:
                    todo["priority"] = priority
                if assigned_to:
                    todo["assigned_to"] = assigned_to
                
                todo["updated_at"] = datetime.datetime.now().isoformat()
                updated_todo = todo
                break
        
        if not found:
            return {"success": False, "error": f"Todo {id} not found in investigation {task_id}"}
            
        save_todos(task_id, todos)
        
        return {
            "success": True,
            "message": f"Todo {id} updated",
            "todo": updated_todo
        }
    except Exception as e:
        return {"success": False, "error": f"Failed to update todo: {str(e)}"}


@function_tool
def get_todos(
    task_id: str,
    status: Optional[str] = None,
    assigned_to: Optional[str] = None,
    limit: int = 50
) -> Dict[str, Any]:
    """
    Retrieve todos for a specific investigation.

    Args:
        task_id: The investigation ID to filter by
        status: Filter by status (optional)
        assigned_to: Filter by assigned agent (optional)
        limit: Max number of items to return

    Returns:
        Dict containing the list of todos.
    """
    try:
        todos = load_todos(task_id)
        
        # Apply filters
        if status:
            todos = [t for t in todos if t.get("status") == status]
        if assigned_to:
            todos = [t for t in todos if t.get("assigned_to") == assigned_to]
            
        # Sort by priority (high > medium > low) and then creation time
        priority_map = {"high": 0, "medium": 1, "low": 2}
        todos.sort(key=lambda x: (priority_map.get(x.get("priority", "medium"), 1), x.get("created_at", "")))
        
        # Limit
        todos = todos[:limit]
        
        return {
            "success": True,
            "todos": todos,
            "count": len(todos)
        }
    except Exception as e:
        return {"success": False, "error": f"Failed to get todos: {str(e)}"}


@function_tool
def list_todos(task_id: str) -> Dict[str, Any]:
    """
    List ALL todos for an investigation.

    Args:
        task_id: The investigation ID

    Returns:
        Dict containing todos.
    """
    return get_todos(task_id=task_id, limit=100)


# Export list of tools
todo_board_tools = [
    create_todo,
    update_todo,
    get_todos,
    list_todos
]
