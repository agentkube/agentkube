# orchestrator/utils/investigation_queue.py
"""
Investigation Manager - Simplified for inline streaming approach.

This module provides read-only database access for investigation tasks.
The actual investigation processing is now handled inline via SSE streaming
in deep_investigation.py - no queue needed.
"""

import logging
from typing import Dict, Any, Optional, List

from orchestrator.db.models.task import Task, TaskStatus
from orchestrator.db.db import SessionLocal


class InvestigationManager:
    """
    Simplified investigation manager for the inline streaming approach.
    
    Key changes from queue-based approach:
    - No TaskQueue or background workers
    - No active_investigators tracking (handled by INVESTIGATION_ABORT_SIGNALS)
    - No submit_investigation or process_investigation (inline streaming now)
    - Keeps read-only methods for listing and status checks
    """

    def __init__(self):
        """Initialize the investigation manager (no queue setup needed)."""
        pass

    def get_investigation_status(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Get the status of an investigation from database."""
        db = SessionLocal()
        try:
            task = db.query(Task).filter(Task.task_id == task_id).first()
            if task:
                return task.to_dict()
            return None
        finally:
            db.close()
    
    def list_investigations(self, limit: int = 50) -> List[Dict[str, Any]]:
        """List recent investigations from database."""
        db = SessionLocal()
        try:
            tasks = db.query(Task).filter(
                Task.tags.contains(["investigation"])
            ).order_by(Task.created_at.desc()).limit(limit).all()
            
            return [task.to_dict() for task in tasks]
        finally:
            db.close()


# Investigation manager singleton instance
investigation_manager = InvestigationManager()