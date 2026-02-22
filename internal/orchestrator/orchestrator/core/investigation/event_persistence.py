"""
Event Persistence Module
Handles saving events to the database for replay on reconnection.
"""
import uuid
import logging
from typing import List, Optional

from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from orchestrator.db.db import SessionLocal
from orchestrator.db.models.task import Task, TaskStatus
from orchestrator.db.models.investigate import InvestigationTaskRequest

logger = logging.getLogger(__name__)

def save_event_to_db(task_id: str, event: dict) -> bool:
    """Save SSE event to Task.events for persistence."""
    db: Session = SessionLocal()
    try:
        task = db.query(Task).filter(Task.task_id == task_id).first()
        if task:
            current_events = task.events or []
            
            # Avoid duplicates by checking step_index
            if event.get("step_index") is not None:
                existing_indices = {e.get("step_index") for e in current_events if e.get("step_index") is not None}
                if event.get("step_index") in existing_indices:
                    return True
            
            current_events.append(event)
            task.events = current_events
            flag_modified(task, 'events')
            db.commit()
            return True
        return False
    except Exception as e:
        logger.error(f"Error saving event to DB: {e}")
        db.rollback()
        return False
    finally:
        db.close()


def get_stored_events(task_id: str) -> List[dict]:
    """Get all stored events for a task from DB."""
    db: Session = SessionLocal()
    try:
        task = db.query(Task).filter(Task.task_id == task_id).first()
        if task:
            return task.events or []
        return []
    finally:
        db.close()


def get_task_status(task_id: str) -> Optional[str]:
    """Get task status from DB."""
    db: Session = SessionLocal()
    try:
        task = db.query(Task).filter(Task.task_id == task_id).first()
        if task:
            return task.status
        return None
    finally:
        db.close()


def create_task_in_db(task_id: str, request: InvestigationTaskRequest) -> bool:
    """Create a new task and investigation task in the database."""
    from orchestrator.db.models.investigate import InvestigationTask
    
    db: Session = SessionLocal()
    try:
        # Create the Task record (for status, events, subtasks)
        task = Task(
            id=str(uuid.uuid4()),
            task_id=task_id,
            title=request.prompt[:100] if request.prompt else "New Investigation",
            tags=[],
            severity="unknown",
            status=TaskStatus.PROCESSED.value,  # processing
            sub_tasks=[],
            events=[],
        )
        db.add(task)
        
        # Also create InvestigationTask record (for storing prompt, context)
        # This is required for the View Prompt feature to work
        investigation_task = InvestigationTask(
            id=str(uuid.uuid4()),
            task_id=task_id,
            prompt=request.prompt,
            context=request.context,
            model=request.model,
            resource_context=request.resource_context,
            log_context=request.log_context
        )
        db.add(investigation_task)
        
        db.commit()
        logger.info(f"Created task and investigation_task {task_id} in database")
        return True
    except Exception as e:
        logger.error(f"Error creating task: {e}")
        db.rollback()
        return False
    finally:
        db.close()


def update_task_status(task_id: str, status: str, **kwargs) -> bool:
    """Update task status and optional fields."""
    db: Session = SessionLocal()
    try:
        task = db.query(Task).filter(Task.task_id == task_id).first()
        if task:
            task.status = status
            for key, value in kwargs.items():
                if hasattr(task, key):
                    setattr(task, key, value)
            db.commit()
            return True
        return False
    except Exception as e:
        logger.error(f"Error updating task status: {e}")
        db.rollback()
        return False
    finally:
        db.close()


def add_subtask_to_db(task_id: str, subtask: dict) -> bool:
    """Add a subtask to the task's sub_tasks array."""
    db: Session = SessionLocal()
    try:
        task = db.query(Task).filter(Task.task_id == task_id).first()
        if task:
            current_subtasks = task.sub_tasks or []
            current_subtasks.append(subtask)
            task.sub_tasks = current_subtasks
            flag_modified(task, 'sub_tasks')
            db.commit()
            return True
        return False
    except Exception as e:
        logger.error(f"Error adding subtask: {e}")
        db.rollback()
        return False
    finally:
        db.close()
