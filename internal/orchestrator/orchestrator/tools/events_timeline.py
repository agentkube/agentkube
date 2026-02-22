
#-------------------------------------------------------------------------------------#
# Timeline Events Tools - Tools for managing task events and timeline operations
# Provides CRUD operations for task events with database tracking
#-------------------------------------------------------------------------------------#

import uuid
from agents import function_tool
from typing import Dict, Optional, Any
import datetime
from orchestrator.db.db import SessionLocal
from orchestrator.db.models.task import Task

tool_call_history = []

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

@function_tool
def add_event(task_id: str, source: str, subject: str, reason: str, analysis: Optional[str] = None) -> Dict[str, Any]:
    """
    Add a new event to a task's timeline.
    
    Args:
        task_id: Task ID to add event to
        source: Source of the event (e.g., 'kubernetes', 'prometheus', 'github')
        subject: Subject/title of the event
        reason: Reason code (e.g., 'POD_RESTARTED', 'DEPLOYMENT_FAILED', 'PR_MERGED')
        analysis: Optional markdown analysis with charts and explanation
        
    Returns:
        Dict containing success status and event details
    """
    try:
        db = SessionLocal()
        
        # Use row-level locking to prevent concurrent event overwrites
        task = db.query(Task).filter(Task.task_id == task_id).with_for_update().first()
        
        if not task:
            error_msg = f"Task with task_id {task_id} not found"
            track_call("add_event", kwargs=locals(), error=error_msg)
            return {"success": False, "error": error_msg}
        
        # Create new event
        event = {
            "id": str(uuid.uuid4()),
            "source": source,
            "subject": subject,
            "reason": reason,
            "timestamp": datetime.datetime.now().isoformat(),
            "analysis": analysis or ""
        }
        
        # Get current events and create a new list (SQLAlchemy JSON column mutation issue)
        current_events = list(task.events) if task.events else []
        
        # Append new event
        current_events.append(event)
        
        # Force SQLAlchemy to detect the change by reassigning the entire list
        task.events = current_events
        
        # Mark the attribute as modified for SQLAlchemy to track JSON changes
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(task, 'events')
        
        # Explicitly update the updated_at timestamp
        task.updated_at = datetime.datetime.now()
        
        db.commit()
        db.close()
        
        result = {
            "success": True,
            "event": event,
            "task_id": task_id,
            "message": f"Event '{subject}' added successfully"
        }
        
        track_call("add_event", kwargs=locals(), output=result)
        return result
        
    except Exception as e:
        if 'db' in locals():
            db.rollback()
            db.close()
        error_msg = f"Failed to add event: {str(e)}"
        track_call("add_event", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg}

@function_tool
def update_event(task_id: str, event_id: str, source: Optional[str] = None, 
                 subject: Optional[str] = None, reason: Optional[str] = None, 
                 analysis: Optional[str] = None) -> Dict[str, Any]:
    """
    Update an existing event in a task's timeline.
    
    Args:
        task_id: Task ID containing the event
        event_id: ID of the event to update
        source: Updated source of the event
        subject: Updated subject/title of the event
        reason: Updated reason code
        analysis: Updated markdown analysis
        
    Returns:
        Dict containing success status and updated event details
    """
    try:
        db = SessionLocal()
        
        # Use row-level locking to prevent concurrent updates
        task = db.query(Task).filter(Task.task_id == task_id).with_for_update().first()
        
        if not task:
            error_msg = f"Task with task_id {task_id} not found"
            track_call("update_event", kwargs=locals(), error=error_msg)
            return {"success": False, "error": error_msg}
        
        # Find and update event
        current_events = task.events or []
        event_updated = False
        
        for event in current_events:
            if event.get("id") == event_id:
                # Update only provided fields
                if source is not None:
                    event["source"] = source
                if subject is not None:
                    event["subject"] = subject
                if reason is not None:
                    event["reason"] = reason
                if analysis is not None:
                    event["analysis"] = analysis
                
                event["updated_at"] = datetime.datetime.now().isoformat()
                event_updated = True
                break
        
        if not event_updated:
            error_msg = f"Event with ID {event_id} not found"
            track_call("update_event", kwargs=locals(), error=error_msg)
            return {"success": False, "error": error_msg}
        
        # Force SQLAlchemy to detect the change by reassigning the entire list
        task.events = current_events
        
        # Mark the attribute as modified for SQLAlchemy to track JSON changes
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(task, 'events')
        
        # Explicitly update the updated_at timestamp
        task.updated_at = datetime.datetime.now()
        
        db.commit()
        db.close()
        
        result = {
            "success": True,
            "message": f"Event {event_id} updated successfully"
        }
        
        track_call("update_event", kwargs=locals(), output=result)
        return result
        
    except Exception as e:
        if 'db' in locals():
            db.rollback()
            db.close()
        error_msg = f"Failed to update event: {str(e)}"
        track_call("update_event", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg}

# Collection of all timeline events tools
timeline_events_tools = [
    add_event,
    update_event
]