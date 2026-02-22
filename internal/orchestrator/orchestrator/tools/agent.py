#-------------------------------------------------------------------------------------#
# Agent Tools - Self-management tools for the AI agent
# Provides tools for memory management, task tracking, file operations, and shell execution
# Based on OpenCode/Gemini CLI implementation patterns
#-------------------------------------------------------------------------------------#

import json
import datetime
import aiohttp
import asyncio
import subprocess
import re
import os
import fnmatch
import uuid
from pathlib import Path
from typing import Dict, Any, Optional, List, Literal
from agents import function_tool
from pydantic import BaseModel, Field

# ============================================================================
# Storage Configuration - OpenCode style storage in ~/.agentkube/
# ============================================================================

AGENTKUBE_DIR = Path.home() / ".agentkube"
MEMORY_FILE = AGENTKUBE_DIR / "AGENT_MEMORY.md"
TODO_STORAGE_DIR = AGENTKUBE_DIR / "storage" / "todo"

# Default session ID (can be overridden per-call)
DEFAULT_SESSION_ID = "default"

def ensure_storage_dir():
    """Ensure the ~/.agentkube directory exists."""
    AGENTKUBE_DIR.mkdir(parents=True, exist_ok=True)

def ensure_todo_storage_dir():
    """Ensure the ~/.agentkube/storage/todo directory exists."""
    TODO_STORAGE_DIR.mkdir(parents=True, exist_ok=True)

def get_todo_file(session_id: str) -> Path:
    """Get the todo file path for a specific session."""
    ensure_todo_storage_dir()
    return TODO_STORAGE_DIR / f"{session_id}.json"

# ============================================================================
# Memory Tools - Persistent fact storage
# ============================================================================

@function_tool
def save_memory(fact: str) -> Dict[str, Any]:
    """
    Save an important fact or piece of information to long-term memory.
    Use this to remember user preferences, project context, or any important details
    that should persist across sessions.

    Args:
        fact: The fact or information to remember. Be specific and descriptive.

    Returns:
        Dict containing success status and the saved memory entry.
    
    Example:
        save_memory("User prefers verbose output with detailed explanations")
        save_memory("Current Kubernetes cluster context is 'production-east'")
    """
    try:
        ensure_storage_dir()
        timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        # Create file with header if it doesn't exist
        if not MEMORY_FILE.exists():
            MEMORY_FILE.write_text(
                "# Agent Memory\n\n"
                "This file contains important information remembered by the AI agent.\n\n"
            )
        
        # Append the new memory entry
        with open(MEMORY_FILE, "a") as f:
            f.write(f"- [{timestamp}] {fact}\n")
        
        return {
            "success": True,
            "message": f"Memory saved: {fact}",
            "timestamp": timestamp,
            "file": str(MEMORY_FILE)
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to save memory: {str(e)}"
        }

@function_tool
def get_memory() -> Dict[str, Any]:
    """
    Retrieve all saved memories from long-term storage.
    Use this to recall previously saved facts, user preferences, or project context.

    Returns:
        Dict containing the list of all saved memories.
    """
    try:
        ensure_storage_dir()
        
        if not MEMORY_FILE.exists():
            return {
                "success": True,
                "memories": [],
                "message": "No memories saved yet."
            }
        
        content = MEMORY_FILE.read_text()
        
        # Parse memory entries
        memories = []
        for line in content.split("\n"):
            if line.startswith("- ["):
                # Extract timestamp and fact
                match = re.match(r"- \[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] (.+)", line)
                if match:
                    memories.append({
                        "timestamp": match.group(1),
                        "fact": match.group(2)
                    })
        
        return {
            "success": True,
            "memories": memories,
            "count": len(memories),
            "raw_content": content
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to retrieve memories: {str(e)}"
        }

# ============================================================================
# Todo Tools - Task tracking with state management (OpenCode style)
# Session-scoped JSON storage with unique IDs and priority levels
# ============================================================================

class TodoItem(BaseModel):
    """A todo item with unique ID, task description, state, and priority."""
    id: str = Field(description="Unique identifier for the todo item")
    content: str = Field(description="Description of the task")
    status: Literal["pending", "in_progress", "completed", "cancelled"] = Field(
        default="pending",
        description="Current status of the task"
    )
    priority: Literal["high", "medium", "low"] = Field(
        default="medium",
        description="Priority level of the task"
    )
    created_at: str = Field(description="ISO timestamp when the todo was created")
    updated_at: str = Field(description="ISO timestamp when the todo was last updated")

class TodoInput(BaseModel):
    """Input model for creating/updating todo items (used by write_todos)."""
    content: str = Field(description="Brief description of the task")
    status: Literal["pending", "in_progress", "completed", "cancelled"] = Field(
        default="pending",
        description="Current status: pending, in_progress, completed, cancelled"
    )
    priority: Literal["high", "medium", "low"] = Field(
        default="medium", 
        description="Priority level: high, medium, low"
    )
    id: Optional[str] = Field(
        default=None,
        description="Unique identifier. If not provided, one will be generated."
    )

def generate_todo_id() -> str:
    """Generate a unique ID for a todo item."""
    return str(uuid.uuid4())[:8]

def load_todos(session_id: str) -> List[Dict[str, Any]]:
    """Load todos for a specific session."""
    todo_file = get_todo_file(session_id)
    if not todo_file.exists():
        return []
    try:
        data = json.loads(todo_file.read_text())
        return data.get("todos", [])
    except (json.JSONDecodeError, Exception):
        return []

def save_todos(session_id: str, todos: List[Dict[str, Any]]) -> None:
    """Save todos for a specific session."""
    todo_file = get_todo_file(session_id)
    data = {
        "session_id": session_id,
        "updated_at": datetime.datetime.now().isoformat(),
        "todos": todos
    }
    todo_file.write_text(json.dumps(data, indent=2))

@function_tool
def todo_write(
    content: str,
    priority: str = "medium",
    session_id: str = "default"
) -> Dict[str, Any]:
    """
    Add a new todo item to track a task.
    Use this tool to create and manage a structured task list for your current coding session. 
    This helps you track progress, organize complex tasks, and demonstrate thoroughness to the user.\nIt 
    also helps the user understand the progress of the task and overall progress of their requests.\n\n## When 
    to Use This Tool\nUse this tool proactively in these scenarios:\n\n1. Complex multi-step tasks - 
    When a task requires 3 or more distinct steps or actions\n2. Non-trivial and complex tasks - Tasks that 
    require careful planning or multiple operations\n3. User explicitly requests todo list - When the user directly 
    asks you to use the todo list\n4. User provides multiple tasks - When users provide a list of things to be done 
    (numbered or comma-separated)\n5. After receiving new instructions - Immediately capture user requirements as todos\n
    6. When you start working on a task - Mark it as in_progress BEFORE beginning work. Ideally you should only have one 
    todo as in_progress at a time\n7. After completing a task - Mark it as completed and add any new follow-up tasks 
    discovered during implementation\n\n## When NOT to Use This Tool\n\nSkip using this tool when:\n1. There is only a 
    single, straightforward task\n2. The task is trivial and tracking it provides no organizational benefit\n3. The 
    task can be completed in less than 3 trivial steps\n4. The task is purely conversational or 
    informational\n\nNOTE that you should not use this tool if there is only one trivial task to do. In this 
    case you are better off just doing the task directly.\n\n## Examples of When to Use the Todo List\n\n<example>\nUser: 
    I want to add a dark mode toggle to the application settings. Make sure you run the tests and build when you're done!\nAssistant: I'll help add a dark mode toggle to your application settings. Let me create a todo list to track this implementation.\n*Creates todo list with the following items:*\n1. Create dark mode toggle component in Settings page\n2. Add dark mode state management (context/store)\n3. Implement CSS-in-JS styles for dark theme\n4. Update existing components to support theme switching\n5. Run tests and build process, addressing any failures or errors that occur\n*Begins working on the first task*\n\n<reasoning>\nThe assistant used the todo list because:\n1. Adding dark mode is a multi-step feature requiring UI, state management, and styling changes\n2. The user explicitly requested tests and build be run afterward\n3. The assistant inferred that tests and build need to pass by adding \"Ensure tests and build succeed\" as the final task\n</reasoning>\n</example>\n\n<example>\nUser: Help me rename the function getCwd to getCurrentWorkingDirectory across my project\nAssistant: Let me first search through your codebase to find all occurrences of 'getCwd'.\n*Uses grep or search tools to locate all instances of getCwd in the codebase*\nAssistant: I've found 15 instances of 'getCwd' across 8 different files. Let me create a todo list to track these changes.\n*Creates todo list with specific items for each file that needs updating*\n\n<reasoning>\nThe assistant used the todo list because:\n1. First, the assistant searched to understand the scope of the task\n2. Upon finding multiple occurrences across different files, it determined this was a complex task with multiple steps\n3. The todo list helps ensure every instance is tracked and updated systematically\n4. This approach prevents missing any occurrences and maintains code consistency\n</reasoning>\n</example>\n\n\n<example>\nUser: I need to implement these features for my e-commerce site: user registration, product catalog, shopping cart, and checkout flow.\nAssistant: I'll help implement these features. First, let's add all the features to the todo list.\n*Creates a todo list breaking down each feature into specific tasks based on the project architecture*\nAssistant: Let's start with user registration. This will involve creating database models, API endpoints, and frontend forms that integrate with your existing authentication system.\n\n<reasoning>\nThe assistant used the todo list because:\n1. The user provided multiple complex features to implement in a comma separated list\n2. The todo list helps organize these large features into manageable tasks\n3. This approach allows for tracking progress across the entire implementation\n</reasoning>\n</example>\n\n<example>\nUser: Can you help optimize my React application? It's rendering slowly and has performance issues.</user>\nAssistant: I'll help optimize your React application. First, let me examine your codebase to identify potential performance bottlenecks.\n*Reviews component structure, render patterns, state management, and data fetching*\nAssistant: After analyzing your codebase, I've identified several performance issues. Let me create a todo list to track our optimization efforts.\n*Creates todo list with items like: 1) Implement memoization for expensive calculations in ProductList, 2) Add virtualization for long lists in Dashboard, 3) Optimize image loading in Gallery component, 4) Fix state update loops in ShoppingCart, 5) Review bundle size and implement code splitting*\nLet's start by implementing memoization for the expensive calculations in your ProductList component.</assistant>\n\n<reasoning>\nThe assistant used the todo list because:\n1. First, the assistant examined the codebase to identify specific performance issues\n2. Based on this analysis, it identified multiple optimization opportunities\n3. Performance optimization is a non-trivial task requiring multiple steps\n4. The todo list helps methodically track improvements across different components\n5. This systematic approach ensures all performance bottlenecks are addressed\n</reasoning>\n</example>\n\n## Examples of When NOT to Use the Todo List\n\n<example>\nUser: How do I print 'Hello World' in Python?\nAssistant: In Python, you can print \"Hello World\" with this simple code:\n\npython\nprint(\"Hello World\")\n\nThis will output the text \"Hello World\" to the console when executed.</assistant>\n\n<reasoning>\nThe assistant did not use the todo list because this is a single, trivial task that can be completed in one step. There's no need to track multiple tasks or steps for such a straightforward request.\n</reasoning>\n</example>\n\n<example>\nUser: What does the git status command do?\nAssistant: The git status command shows the current state of your working directory and staging area. It displays which changes have been staged, which haven't, and which files aren't being tracked by Git. This is a fundamental command for understanding the current state of your repository before making commits.\n\n<reasoning>\nThe assistant did not use the todo list because this is an informational request with no actual coding task to complete. The user is simply asking for an explanation, not for the assistant to perform multiple steps or tasks.\n</reasoning>\n</example>\n\n<example>\nUser: Can you add a comment to the calculateTotal function to explain what it does?\nAssistant: Sure, let me add a comment to the calculateTotal function to explain what it does.\n* Uses the Edit tool to add a comment to the calculateTotal function *\n\n<reasoning>\nThe assistant did not use the todo list because this is a single, straightforward task confined to one location in the code. Adding a comment doesn't require tracking multiple steps or systematic organization.\n</reasoning>\n</example>\n\n<example>\nUser: Run npm install for me and tell me what happens.\nAssistant: I'll run the npm install command for you.\n\n*Executes: npm install*\n\nThe command completed successfully. Here's the output:\n[Output of npm install command]\n\nAll dependencies have been installed according to your package.json file.\n\n<reasoning>\nThe assistant did not use the todo list because this is a single command execution with immediate results. There are no multiple steps to track or organize, making the todo list unnecessary for this straightforward task.\n</reasoning>\n</example>\n\n## Task States and Management\n\n1. **Task States**: Use these states to track progress:\n   - pending: Task not yet started\n   - in_progress: Currently working on (limit to ONE task at a time)\n   - completed: Task finished successfully\n\n2. **Task Management**:\n   - Update task status in real-time as you work\n   - Mark tasks complete IMMEDIATELY after finishing (don't batch completions)\n   - Only have ONE task in_progress at any time\n   - Complete current tasks before starting new ones\n   - Remove tasks that are no longer relevant from the list entirely\n\n3. **Task Completion Requirements**:\n   - ONLY mark a task as completed when you have FULLY accomplished it\n   - If you encounter errors, blockers, or cannot finish, keep the task as in_progress\n   - When blocked, create a new task describing what needs to be resolved\n   - Never mark a task as completed if:\n     - Tests are failing\n     - Implementation is partial\n     - You encountered unresolved errors\n     - You couldn't find necessary files or dependencies\n\n4. **Task Breakdown**:\n   - Create specific, actionable items\n   - Break complex tasks into smaller, manageable steps\n   - Use clear, descriptive task names\n\nWhen in doubt, use this tool. Being proactive with task management demonstrates attentiveness and ensures you complete all requirements successfully.\n

    Args:
        content: Brief description of the task
        priority: Priority level - "high", "medium", or "low" (default: "medium")
        session_id: Session identifier (default: "default")

    Returns:
        Dict containing success status and the new todo item.
    """
    try:
        if priority not in ["high", "medium", "low"]:
            priority = "medium"
        
        timestamp = datetime.datetime.now().isoformat()
        
        new_todo = {
            "id": generate_todo_id(),
            "content": content,
            "status": "pending",
            "priority": priority,
            "created_at": timestamp,
            "updated_at": timestamp
        }
        
        todos = load_todos(session_id)
        todos.append(new_todo)
        save_todos(session_id, todos)
        
        return json.dumps({
            "success": True,
            "message": f"Todo added: {content}",
            "todo": new_todo,
            "session_id": session_id,
            "total_todos": len(todos)
        })
    except Exception as e:
        return json.dumps({
            "success": False,
            "error": f"Failed to add todo: {str(e)}"
        })

@function_tool
def todo_read(session_id: str = "default") -> Dict[str, Any]:
    """
    Retrieve all todos for a session, grouped by status.

    Args:
        session_id: Session identifier for scoping todos (default: "default")

    Returns:
        Dict containing the todo list with items grouped by status.
    """
    try:
        todos = load_todos(session_id)
        
        if not todos:
            return json.dumps({
                "success": True,
                "todos": [],
                "message": f"No todos found for session '{session_id}'.",
                "session_id": session_id
            })
        
        # Group by status
        grouped = {
            "pending": [],
            "in_progress": [],
            "completed": [],
            "cancelled": []
        }
        
        for todo in todos:
            status = todo.get("status", "pending")
            if status in grouped:
                grouped[status].append(todo)
        
        # Sort each group by priority (high > medium > low)
        priority_order = {"high": 0, "medium": 1, "low": 2}
        for status in grouped:
            grouped[status].sort(key=lambda x: priority_order.get(x.get("priority", "medium"), 1))
        
        return json.dumps({
            "success": True,
            "todos": todos,
            "grouped": grouped,
            "count": len(todos),
            "session_id": session_id,
            "summary": {
                "pending": len(grouped["pending"]),
                "in_progress": len(grouped["in_progress"]),
                "completed": len(grouped["completed"]),
                "cancelled": len(grouped["cancelled"])
            }
        })
    except Exception as e:
        return json.dumps({
            "success": False,
            "error": f"Failed to retrieve todos: {str(e)}"
        })

@function_tool
def todo_update(
    todo_id: str,
    status: Optional[str] = None,
    content: Optional[str] = None,
    priority: Optional[str] = None,
    session_id: str = "default"
) -> Dict[str, Any]:
    """
    Update an existing todo item by its ID.
    You can update status, content, and/or priority.

    Args:
        todo_id: The unique ID of the todo to update
        status: New status - "pending", "in_progress", "completed", or "cancelled" (optional)
        content: New task description (optional)
        priority: New priority - "high", "medium", or "low" (optional)
        session_id: Session identifier for scoping todos (default: "default")

    Returns:
        Dict containing success status and the updated todo item.
    
    Example:
        todo_update("abc12345", status="in_progress")
        todo_update("abc12345", status="completed", priority="high")
    """
    try:
        # Validate inputs
        valid_statuses = ["pending", "in_progress", "completed", "cancelled"]
        valid_priorities = ["high", "medium", "low"]
        
        if status and status not in valid_statuses:
            return json.dumps({"success": False, "error": f"Invalid status: {status}. Use one of {valid_statuses}"})
        if priority and priority not in valid_priorities:
            return json.dumps({"success": False, "error": f"Invalid priority: {priority}. Use one of {valid_priorities}"})
        
        todos = load_todos(session_id)
        
        # Find and update the todo
        found = False
        updated_todo = None
        for todo in todos:
            if todo.get("id") == todo_id:
                found = True
                if status:
                    todo["status"] = status
                if content:
                    todo["content"] = content
                if priority:
                    todo["priority"] = priority
                todo["updated_at"] = datetime.datetime.now().isoformat()
                updated_todo = todo
                break
        
        if not found:
            return json.dumps({
                "success": False,
                "error": f"Todo with ID '{todo_id}' not found in session '{session_id}'"
            })
        
        save_todos(session_id, todos)
        
        return json.dumps({
            "success": True,
            "message": f"Todo '{todo_id}' updated",
            "todo": updated_todo,
            "session_id": session_id
        })
    except Exception as e:
        return json.dumps({
            "success": False,
            "error": f"Failed to update todo: {str(e)}"
        })

@function_tool
def todo_delete(todo_id: str, session_id: str = "default") -> Dict[str, Any]:
    """
    Delete a todo item by its ID.

    Args:
        todo_id: The unique ID of the todo to delete
        session_id: Session identifier for scoping todos (default: "default")

    Returns:
        Dict containing success status and confirmation.
    
    Example:
        todo_delete("abc12345")
    """
    try:
        todos = load_todos(session_id)
        
        # Find and remove the todo
        original_count = len(todos)
        todos = [t for t in todos if t.get("id") != todo_id]
        
        if len(todos) == original_count:
            return json.dumps({
                "success": False,
                "error": f"Todo with ID '{todo_id}' not found in session '{session_id}'"
            })
        
        save_todos(session_id, todos)
        
        return json.dumps({
            "success": True,
            "message": f"Todo '{todo_id}' deleted",
            "session_id": session_id,
            "remaining_todos": len(todos)
        })
    except Exception as e:
        return json.dumps({
            "success": False,
            "error": f"Failed to delete todo: {str(e)}"
        })

@function_tool
def todo_clear(session_id: str = "default", status: Optional[str] = None) -> Dict[str, Any]:
    """
    Clear todos for a session. Can clear all todos or only those with a specific status.

    Args:
        session_id: Session identifier for scoping todos (default: "default")
        status: Optional status filter - only clear todos with this status.
                If not provided, clears ALL todos for the session.

    Returns:
        Dict containing success status and count of cleared items.
    
    Example:
        todo_clear()  # Clear all todos in default session
        todo_clear(status="completed")  # Clear only completed todos
        todo_clear(session_id="project-alpha", status="cancelled")  # Clear cancelled todos in specific session
    """
    try:
        valid_statuses = ["pending", "in_progress", "completed", "cancelled"]
        
        if status and status not in valid_statuses:
            return json.dumps({"success": False, "error": f"Invalid status: {status}. Use one of {valid_statuses}"})
        
        todos = load_todos(session_id)
        original_count = len(todos)
        
        if status:
            # Filter out todos with the specified status
            todos = [t for t in todos if t.get("status") != status]
            cleared_count = original_count - len(todos)
            save_todos(session_id, todos)
            message = f"Cleared {cleared_count} '{status}' todos"
        else:
            # Clear all todos
            todo_file = get_todo_file(session_id)
            if todo_file.exists():
                todo_file.unlink()
            cleared_count = original_count
            message = f"Cleared all {cleared_count} todos for session '{session_id}'"
        
        return json.dumps({
            "success": True,
            "message": message,
            "cleared_count": cleared_count,
            "remaining_todos": len(todos) if status else 0,
            "session_id": session_id
        })
    except Exception as e:
        return json.dumps({
            "success": False,
            "error": f"Failed to clear todos: {str(e)}"
        })

# ============================================================================
# File Tools - File and directory operations
# ============================================================================

@function_tool
def read_file(file_path: str, offset: int = 0, limit: Optional[int] = None) -> Dict[str, Any]:
    """
    Read the contents of a file. Supports reading large files with offset and limit.

    Args:
        file_path: Path to the file to read (relative or absolute)
        offset: Line number to start reading from (0-indexed, default: 0)
        limit: Maximum number of lines to read (default: None = read all)

    Returns:
        Dict containing the file content and metadata.
    """
    try:
        path = Path(file_path).expanduser().resolve()
        
        if not path.exists():
            return {"success": False, "error": f"File not found: {file_path}"}
        
        if not path.is_file():
            return {"success": False, "error": f"Not a file: {file_path}"}
        
        # Read file
        content = path.read_text(encoding="utf-8")
        lines = content.split("\n")
        total_lines = len(lines)
        
        # Apply offset and limit
        if limit:
            selected_lines = lines[offset:offset + limit]
        else:
            selected_lines = lines[offset:]
        
        return {
            "success": True,
            "content": "\n".join(selected_lines),
            "file_path": str(path),
            "total_lines": total_lines,
            "offset": offset,
            "lines_returned": len(selected_lines),
            "size_bytes": path.stat().st_size
        }
    except UnicodeDecodeError:
        return {"success": False, "error": f"Cannot read binary file: {file_path}"}
    except Exception as e:
        return {"success": False, "error": f"Failed to read file: {str(e)}"}

@function_tool
def write_file(file_path: str, content: str) -> Dict[str, Any]:
    """
    Write content to a file. Creates the file and parent directories if they don't exist.
    WARNING: This will overwrite the file if it exists.

    Args:
        file_path: Path to the file to write (relative or absolute)
        content: Content to write to the file

    Returns:
        Dict containing success status and file metadata.
    """
    try:
        path = Path(file_path).expanduser().resolve()
        
        # Create parent directories
        path.parent.mkdir(parents=True, exist_ok=True)
        
        existed = path.exists()
        path.write_text(content, encoding="utf-8")
        
        return {
            "success": True,
            "message": f"File {'updated' if existed else 'created'}: {file_path}",
            "file_path": str(path),
            "size_bytes": path.stat().st_size,
            "lines": len(content.split("\n"))
        }
    except Exception as e:
        return {"success": False, "error": f"Failed to write file: {str(e)}"}

@function_tool
def edit_file(file_path: str, old_string: str, new_string: str) -> Dict[str, Any]:
    """
    Edit a file by replacing occurrences of old_string with new_string.
    Use this for targeted edits rather than rewriting entire files.

    Args:
        file_path: Path to the file to edit
        old_string: The exact string to find and replace
        new_string: The string to replace it with

    Returns:
        Dict containing success status and edit summary.
    """
    try:
        path = Path(file_path).expanduser().resolve()
        
        if not path.exists():
            return {"success": False, "error": f"File not found: {file_path}"}
        
        content = path.read_text(encoding="utf-8")
        
        if old_string not in content:
            return {
                "success": False,
                "error": f"String not found in file: {old_string[:50]}..."
            }
        
        # Count occurrences
        count = content.count(old_string)
        
        # Perform replacement
        new_content = content.replace(old_string, new_string)
        path.write_text(new_content, encoding="utf-8")
        
        return {
            "success": True,
            "message": f"Replaced {count} occurrence(s) in {file_path}",
            "file_path": str(path),
            "replacements": count
        }
    except Exception as e:
        return {"success": False, "error": f"Failed to edit file: {str(e)}"}

@function_tool
def glob(pattern: str, path: str = ".") -> Dict[str, Any]:
    """
    Find files and directories matching a glob pattern.

    Args:
        pattern: Glob pattern to match (e.g., "*.py", "**/*.yaml", "src/**/*.ts")
        path: Directory to search in (default: current directory)

    Returns:
        Dict containing the list of matching paths.
    """
    try:
        search_path = Path(path).expanduser().resolve()
        
        if not search_path.exists():
            return {"success": False, "error": f"Directory not found: {path}"}
        
        matches = list(search_path.glob(pattern))
        
        # Convert to relative paths and sort
        results = []
        for match in sorted(matches)[:100]:  # Limit to 100 results
            try:
                rel_path = match.relative_to(search_path)
                results.append({
                    "path": str(rel_path),
                    "absolute": str(match),
                    "is_dir": match.is_dir(),
                    "size": match.stat().st_size if match.is_file() else None
                })
            except ValueError:
                results.append({
                    "path": str(match),
                    "absolute": str(match),
                    "is_dir": match.is_dir()
                })
        
        return {
            "success": True,
            "matches": results,
            "count": len(results),
            "pattern": pattern,
            "search_path": str(search_path),
            "truncated": len(matches) > 100
        }
    except Exception as e:
        return {"success": False, "error": f"Glob search failed: {str(e)}"}

@function_tool
def grep(pattern: str, path: str = ".", include: Optional[str] = None) -> Dict[str, Any]:
    """
    Search for a pattern in file contents using regex.

    Args:
        pattern: Regex pattern to search for
        path: Directory or file to search in (default: current directory)
        include: Optional glob pattern to filter files (e.g., "*.py", "*.yaml")

    Returns:
        Dict containing search results with file, line number, and matching content.
    """
    try:
        search_path = Path(path).expanduser().resolve()
        
        if not search_path.exists():
            return {"success": False, "error": f"Path not found: {path}"}
        
        regex = re.compile(pattern, re.IGNORECASE)
        results = []
        files_searched = 0
        
        # Get list of files to search
        if search_path.is_file():
            files = [search_path]
        else:
            if include:
                files = list(search_path.rglob(include))
            else:
                files = [f for f in search_path.rglob("*") if f.is_file()]
        
        for file_path in files[:500]:  # Limit files to search
            if not file_path.is_file():
                continue
            
            # Skip binary files and common non-text files
            if file_path.suffix.lower() in ['.exe', '.dll', '.so', '.pyc', '.pyo', '.class', '.o', '.a', '.lib', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip', '.tar', '.gz']:
                continue
            
            try:
                content = file_path.read_text(encoding="utf-8", errors="ignore")
                files_searched += 1
                
                for i, line in enumerate(content.split("\n"), 1):
                    if regex.search(line):
                        results.append({
                            "file": str(file_path),
                            "line": i,
                            "content": line.strip()[:200]  # Truncate long lines
                        })
                        
                        if len(results) >= 100:  # Limit results
                            break
                
                if len(results) >= 100:
                    break
                    
            except Exception:
                continue  # Skip files that can't be read
        
        return {
            "success": True,
            "results": results,
            "count": len(results),
            "files_searched": files_searched,
            "pattern": pattern,
            "truncated": len(results) >= 100
        }
    except re.error as e:
        return {"success": False, "error": f"Invalid regex pattern: {str(e)}"}
    except Exception as e:
        return {"success": False, "error": f"Grep search failed: {str(e)}"}

@function_tool
def list_tool(path: str = ".", ignore: Optional[str] = None) -> Dict[str, Any]:
    """
    List files and directories in a path.

    Args:
        path: Directory to list (default: current directory)
        ignore: Optional comma-separated patterns to ignore (e.g., "node_modules,*.pyc,.git")

    Returns:
        Dict containing the directory listing.
    """
    try:
        list_path = Path(path).expanduser().resolve()
        
        if not list_path.exists():
            return {"success": False, "error": f"Directory not found: {path}"}
        
        if not list_path.is_dir():
            return {"success": False, "error": f"Not a directory: {path}"}
        
        # Parse comma-separated ignore patterns
        ignore_patterns = [p.strip() for p in ignore.split(",")] if ignore else []
        entries = []
        
        for entry in sorted(list_path.iterdir()):
            name = entry.name
            
            # Check ignore patterns
            should_ignore = False
            for pattern in ignore_patterns:
                if fnmatch.fnmatch(name, pattern):
                    should_ignore = True
                    break
            
            if should_ignore:
                continue
            
            entry_info = {
                "name": name,
                "is_dir": entry.is_dir(),
                "path": str(entry)
            }
            
            if entry.is_file():
                stat = entry.stat()
                entry_info["size"] = stat.st_size
                entry_info["modified"] = datetime.datetime.fromtimestamp(stat.st_mtime).isoformat()
            elif entry.is_dir():
                try:
                    entry_info["items"] = len(list(entry.iterdir()))
                except PermissionError:
                    entry_info["items"] = "?"
            
            entries.append(entry_info)
        
        # Separate dirs and files, dirs first
        dirs = [e for e in entries if e["is_dir"]]
        files = [e for e in entries if not e["is_dir"]]
        
        return {
            "success": True,
            "entries": dirs + files,
            "path": str(list_path),
            "total_dirs": len(dirs),
            "total_files": len(files)
        }
    except Exception as e:
        return {"success": False, "error": f"Failed to list directory: {str(e)}"}

# ============================================================================
# Shell Tool - Command execution
# ============================================================================

@function_tool
def shell(command: str, workdir: Optional[str] = None, timeout: int = 30) -> Dict[str, Any]:
    """
    Execute a shell command and return the output.
    Use this for running CLI commands, scripts, or system operations.

    Args:
        command: The shell command to execute
        workdir: Working directory for the command (default: current directory)
        timeout: Maximum execution time in seconds (default: 30)

    Returns:
        Dict containing command output, exit code, and metadata.
    
    Safety notes:
    - Commands run with the user's permissions
    - Long-running commands will timeout
    - Avoid destructive commands without user confirmation
    """
    try:
        # Resolve working directory
        cwd = Path(workdir).expanduser().resolve() if workdir else Path.cwd()
        
        if not cwd.exists():
            return {"success": False, "error": f"Working directory not found: {workdir}"}
        
        # Execute command
        result = subprocess.run(
            command,
            shell=True,
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=timeout
        )
        
        stdout_content = result.stdout
        stderr_content = result.stderr
        
        # Combine stdout and stderr into single output
        # Use stdout if available, otherwise use stderr, or combine both
        if stdout_content and stderr_content:
            combined_output = stdout_content + "\n" + stderr_content
        elif stdout_content:
            combined_output = stdout_content
        else:
            combined_output = stderr_content
        
        # Truncate very long output
        max_output = 10000
        output_truncated = False
        
        if len(combined_output) > max_output:
            combined_output = combined_output[:max_output] + f"\n\n... (output truncated, {len(result.stdout) + len(result.stderr)} total chars)"
            output_truncated = True
        
        return {
            "success": result.returncode == 0,
            "exit_code": result.returncode,
            "output": combined_output,
            "command": command,
            "workdir": str(cwd),
            "output_truncated": output_truncated
        }
        
    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "error": f"Command timed out after {timeout} seconds",
            "command": command
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to execute command: {str(e)}",
            "command": command
        }

# ============================================================================
# Web Fetch Tool - URL content fetching
# ============================================================================

@function_tool
async def web_fetch(prompt: str) -> Dict[str, Any]:
    """
    Processes content from URL(s) embedded in a prompt. Can handle HTTP and HTTPS URLs,
    including local network addresses and GitHub repositories.

    Use this tool to:
    - Fetch documentation from websites
    - Check API responses
    - Read configuration files from GitHub
    - Gather information from web resources

    Args:
        prompt: A prompt containing one or more URLs (http:// or https://) and instructions
                on how to process their content.

    Example:
        "Fetch the content from https://kubernetes.io/docs/concepts/overview/ and summarize it"

    Returns:
        Dict containing the fetched content and metadata
    """
    try:
        # Validate prompt
        if not prompt or prompt.strip() == "":
            return {
                "success": False,
                "error": "Prompt cannot be empty"
            }

        # Extract URLs from prompt
        url_pattern = r'https?://[^\s<>"]+'
        urls = re.findall(url_pattern, prompt)

        if not urls:
            return {
                "success": False,
                "error": "Prompt must contain at least one URL (http:// or https://)"
            }

        # Convert GitHub blob URLs to raw URLs
        processed_urls = []
        for url in urls:
            if 'github.com' in url and '/blob/' in url:
                # Convert blob URL to raw URL
                raw_url = url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/')
                processed_urls.append(raw_url)
            else:
                processed_urls.append(url)

        # Fetch content from URLs
        fetched_contents = []

        async with aiohttp.ClientSession() as session:
            for url in processed_urls:
                try:
                    async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as response:
                        if response.status != 200:
                            fetched_contents.append({
                                "url": url,
                                "error": f"HTTP {response.status}: {response.reason}",
                                "status": response.status
                            })
                            continue

                        content_type = response.headers.get('Content-Type', '')
                        text = await response.text()

                        # Simple HTML to text conversion
                        if 'html' in content_type:
                            # Remove script and style elements
                            text = re.sub(r'<script[^>]*>.*?</script>', '', text, flags=re.DOTALL | re.IGNORECASE)
                            text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL | re.IGNORECASE)
                            # Remove HTML tags
                            text = re.sub(r'<[^>]+>', '', text)
                            # Clean up whitespace
                            text = re.sub(r'\s+', ' ', text).strip()

                        # Limit length
                        if len(text) > 8000:
                            text = text[:8000] + "\n\n... (content truncated)"

                        fetched_contents.append({
                            "url": url,
                            "content": text,
                            "content_type": content_type,
                            "length": len(text),
                            "status": response.status
                        })

                except aiohttp.ClientError as e:
                    fetched_contents.append({
                        "url": url,
                        "error": f"Network error: {str(e)}",
                        "status": None
                    })
                except Exception as e:
                    fetched_contents.append({
                        "url": url,
                        "error": f"Error: {str(e)}",
                        "status": None
                    })

        # Format response for LLM
        llm_content = f"Content fetched from {len(processed_urls)} URL(s):\n\n"

        for i, fc in enumerate(fetched_contents, 1):
            llm_content += f"### URL {i}: {fc['url']}\n\n"
            if 'error' in fc:
                llm_content += f"Error: {fc['error']}\n\n"
            else:
                llm_content += f"{fc['content']}\n\n"
                llm_content += "---\n\n"

        # Format display message
        success_count = len([fc for fc in fetched_contents if 'content' in fc])
        error_count = len([fc for fc in fetched_contents if 'error' in fc])

        return_display = f"📄 Fetched {success_count} URL(s)"
        if error_count > 0:
            return_display += f", {error_count} failed"

        return {
            "success": True,
            "llmContent": llm_content,
            "returnDisplay": return_display,
            "urls": processed_urls,
            "fetched_contents": fetched_contents,
            "stats": {
                "total": len(processed_urls),
                "success": success_count,
                "errors": error_count
            }
        }

    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to fetch web content: {str(e)}"
        }

# ============================================================================
# Export all agent tools
# ============================================================================

agent_tools = [
    # Memory tools
    save_memory,
    get_memory,
    # Todo tools (OpenCode style - batch update)
    todo_write,
    todo_read,
    todo_update,
    todo_delete,
    todo_clear,
    # File tools
    read_file,
    write_file,
    edit_file,
    glob,
    grep,
    list_tool,
    # Shell tool
    shell,
    # Web tool
    web_fetch
]
