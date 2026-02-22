

#-------------------------------------------------------------------------------------#
# Task Management Tools - Tools for managing tasks, subtasks, and task operations
# Provides CRUD operations for subtasks and task status management with database tracking
#-------------------------------------------------------------------------------------#

import uuid
import json
from agents import function_tool
from typing import Dict, Optional, List, Any
import datetime
from orchestrator.db.db import SessionLocal
from orchestrator.db.models.task import Task

tool_call_history = []

class TaskManager:
    """Task manager to handle task_id context for agents."""
    def __init__(self, task_id: str):
        self.task_id = task_id

def track_call(name, args=None, kwargs=None, output=None, error=None):
    """Record a tool call in the history with output"""
    if args is None:
        args = ()
    if kwargs is None:
        kwargs = {}
    
    tool_call_history.append({
        "tool": name,
        "args": args,
        "kwargs": kwargs,
        "output": output,
        "error": error,
        "timestamp": datetime.datetime.now().isoformat()
    })
    print(f"tool_call: {name}")

def create_subtask_with_manager(task_manager: TaskManager):
    """Factory function to create create_subtask with task_manager context."""
    
    @function_tool
    def create_subtask(subject: str, goal: str, plan: List[Any], 
                       discovery: str = "", status: int = 0) -> Dict[str, Any]:
        """
        Create a new subtask for the current task.
        
        Args:
            subject: Subject/title of the subtask
            goal: Goal/objective of the subtask
            plan: Array of tools used (list of dictionaries)
            discovery: Discovery/findings from the investigation (optional)
            status: Number of issues found (optional, defaults to 0)
            
        Returns:
            Dict containing success status and subtask details
        """
        try:
            db = SessionLocal()
            
            # Use row-level locking to prevent concurrent subtask overwrites
            task = db.query(Task).filter(Task.task_id == task_manager.task_id).with_for_update().first()
        
            if not task:
                error_msg = f"Task with task_id {task_manager.task_id} not found"
                track_call("create_subtask", kwargs=locals(), error=error_msg)
                db.close()
                return {"success": False, "error": error_msg}
        
            # Create new subtask
            subtask = {
                "id": str(uuid.uuid4()),
                "subject": subject,
                "status": status,  # number of issues found
                "reason": subject,  # Using subject as reason/title
                "goal": goal,
                "plan": plan,  # array of tools used
                "discovery": discovery,  # Discovery/findings from investigation
                "created_at": datetime.datetime.now().isoformat()
            }
            
            # Get current subtasks and create a new list (SQLAlchemy JSON column mutation issue)
            current_subtasks = list(task.sub_tasks) if task.sub_tasks else []
            
            # Append new subtask
            current_subtasks.append(subtask)
            
            # Force SQLAlchemy to detect the change by reassigning the entire list
            task.sub_tasks = current_subtasks
            
            # Mark the attribute as modified for SQLAlchemy to track JSON changes
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(task, 'sub_tasks')
            
            # Explicitly update the updated_at timestamp
            task.updated_at = datetime.datetime.now()
            
            db.commit()
            
            db.close()
            
            result = {
                "success": True,
                "subtask": subtask,
                "task_id": task_manager.task_id,
                "message": f"Subtask '{subject}' created successfully"
            }
        
            track_call("create_subtask", kwargs=locals(), output=result)
            return result
            
        except Exception as e:
            db.rollback()
            db.close()
            error_msg = f"Failed to create subtask: {str(e)}"
            track_call("create_subtask", kwargs=locals(), error=error_msg)
            return {"success": False, "error": error_msg}
    
    return create_subtask

# Keep the original create_subtask for backward compatibility
@function_tool
def create_subtask(task_id: str, subject: str, goal: str, plan: List[Any], 
                   discovery: str = "", status: int = 0) -> Dict[str, Any]:
    """
    Create a new subtask for a given task (original function for backward compatibility).
    
    Args:
        task_id: Task ID to add subtask to
        subject: Subject/title of the subtask
        goal: Goal/objective of the subtask
        plan: Array of tools used (list of dictionaries)
        discovery: Discovery/findings from the investigation (optional)
        status: Number of issues found (optional, defaults to 0)
        
    Returns:
        Dict containing success status and subtask details
    """
    try:
        db = SessionLocal()
        
        # Use row-level locking to prevent concurrent subtask overwrites
        task = db.query(Task).filter(Task.task_id == task_id).with_for_update().first()
        
        if not task:
            error_msg = f"Task with task_id {task_id} not found"
            track_call("create_subtask", kwargs=locals(), error=error_msg)
            db.close()
            return {"success": False, "error": error_msg}
        
        # Create new subtask
        subtask = {
            "id": str(uuid.uuid4()),
            "subject": subject,
            "status": status,  # number of issues found
            "reason": subject,  # Using subject as reason/title
            "goal": goal,
            "plan": plan,  # array of tools used
            "discovery": discovery,  # Discovery/findings from investigation
            "created_at": datetime.datetime.now().isoformat()
        }
        
        # Get current subtasks and create a new list (SQLAlchemy JSON column mutation issue)
        current_subtasks = list(task.sub_tasks) if task.sub_tasks else []
        
        # Append new subtask
        current_subtasks.append(subtask)
        
        # Force SQLAlchemy to detect the change by reassigning the entire list
        task.sub_tasks = current_subtasks
        
        # Mark the attribute as modified for SQLAlchemy to track JSON changes
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(task, 'sub_tasks')
        
        # Explicitly update the updated_at timestamp
        task.updated_at = datetime.datetime.now()
        
        db.commit()
        
        db.close()
        
        result = {
            "success": True,
            "subtask": subtask,
            "task_id": task_id,
            "message": f"Subtask '{subject}' created successfully"
        }
        
        track_call("create_subtask", kwargs=locals(), output=result)
        return result
        
    except Exception as e:
        db.rollback()
        db.close()
        error_msg = f"Failed to create subtask: {str(e)}"
        track_call("create_subtask", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg}

@function_tool
def update_subtask(task_id: str, subtask_id: str, status: Optional[int] = None, 
                   discovery: Optional[str] = None, plan: Optional[List[Any]] = None) -> Dict[str, Any]:
    """
    Update an existing subtask with optional fields.
    
    Args:
        task_id: Task ID containing the subtask
        subtask_id: ID of the subtask to update
        status: Number of issues found
        discovery: Discovery/findings from the subtask
        plan: Array of tools used (list of dictionaries)
        
    Returns:
        Dict containing success status and updated subtask details
    """
    try:
        db = SessionLocal()
        
        # Use row-level locking to prevent concurrent updates
        task = db.query(Task).filter(Task.task_id == task_id).with_for_update().first()
        
        if not task:
            error_msg = f"Task with task_id {task_id} not found"
            track_call("update_subtask", kwargs=locals(), error=error_msg)
            db.close()
            return {"success": False, "error": error_msg}
        
        # Find and update subtask
        current_subtasks = task.sub_tasks or []
        subtask_updated = False
        
        for subtask in current_subtasks:
            if subtask.get("id") == subtask_id:
                # Update only provided fields
                if status is not None:
                    subtask["status"] = status
                if discovery is not None:
                    subtask["discovery"] = discovery
                if plan is not None:
                    subtask["plan"] = plan
                
                subtask["updated_at"] = datetime.datetime.now().isoformat()
                subtask_updated = True
                break
        
        if not subtask_updated:
            error_msg = f"Subtask with ID {subtask_id} not found"
            track_call("update_subtask", kwargs=locals(), error=error_msg)
            db.close()
            return {"success": False, "error": error_msg}
        
        task.sub_tasks = current_subtasks
        task.updated_at = datetime.datetime.now()
        db.commit()
        db.close()
        
        result = {
            "success": True,
            "message": f"Subtask {subtask_id} updated successfully"
        }
        
        track_call("update_subtask", kwargs=locals(), output=result)
        return result
        
    except Exception as e:
        db.rollback()
        db.close()
        error_msg = f"Failed to update subtask: {str(e)}"
        track_call("update_subtask", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg}

@function_tool
def get_task(task_id: str) -> Dict[str, Any]:
    """
    Get a task by task_id with all its subtasks and details.
    
    Args:
        task_id: Task ID to retrieve
        
    Returns:
        Dict containing task details or error if not found
    """
    try:
        db = SessionLocal()
        task = db.query(Task).filter(Task.task_id == task_id).first()
        
        if not task:
            error_msg = f"Task with task_id {task_id} not found"
            track_call("get_task", kwargs=locals(), error=error_msg)
            return {"success": False, "error": error_msg}
        
        # Convert task to dictionary
        task_dict = task.to_dict()
        
        db.close()
        
        result = {
            "success": True,
            "task": task_dict,
            "message": f"Task {task_id} retrieved successfully"
        }
        
        track_call("get_task", kwargs=locals(), output=result)
        return result
        
    except Exception as e:
        error_msg = f"Failed to get task: {str(e)}"
        track_call("get_task", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg}

@function_tool
def remove_subtask(task_id: str, subtask_id: str) -> Dict[str, Any]:
    """
    Remove a subtask from a task.
    
    Args:
        task_id: Task ID containing the subtask
        subtask_id: ID of the subtask to remove
        
    Returns:
        Dict containing success status and removal details
    """
    try:
        db = SessionLocal()
        
        # Use row-level locking to prevent concurrent modifications
        task = db.query(Task).filter(Task.task_id == task_id).with_for_update().first()
        
        if not task:
            error_msg = f"Task with task_id {task_id} not found"
            track_call("remove_subtask", kwargs=locals(), error=error_msg)
            db.close()
            return {"success": False, "error": error_msg}
        
        # Remove subtask
        current_subtasks = task.sub_tasks or []
        updated_subtasks = [st for st in current_subtasks if st.get("id") != subtask_id]
        
        if len(updated_subtasks) == len(current_subtasks):
            error_msg = f"Subtask with ID {subtask_id} not found"
            track_call("remove_subtask", kwargs=locals(), error=error_msg)
            db.close()
            return {"success": False, "error": error_msg}
        
        task.sub_tasks = updated_subtasks
        task.updated_at = datetime.datetime.now()
        db.commit()
        db.close()
        
        result = {
            "success": True,
            "message": f"Subtask {subtask_id} removed successfully"
        }
        
        track_call("remove_subtask", kwargs=locals(), output=result)
        return result
        
    except Exception as e:
        db.rollback()
        db.close()
        error_msg = f"Failed to remove subtask: {str(e)}"
        track_call("remove_subtask", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg}

# Collection of all task management tools
subtask_tools = [
    get_task,
    create_subtask,
    update_subtask,
    remove_subtask
]


