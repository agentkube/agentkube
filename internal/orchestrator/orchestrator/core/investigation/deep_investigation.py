"""
Deep Investigation Inline Streaming Module

Following sst/opencode pattern:
- Inline streaming (no queue)
- Stream tokens/events in real-time via SSE
- Persist events to DB as they happen
- Support reconnection with event replay

This module handles:
1. POST /investigate → Starts investigation and streams results via SSE
2. GET /investigate/{task_id}/event → Reconnect to existing investigation
"""

import json
import asyncio
import logging
from datetime import datetime, timezone
from typing import AsyncGenerator, Dict, Any, Optional

from orchestrator.db.models.task import TaskStatus
from orchestrator.db.models.investigate import InvestigationTaskRequest
from orchestrator.db.models.stream import MessageStreamStatus

# Import refactored modules
from orchestrator.core.investigation.tool_mapping import get_tool_title
from orchestrator.core.investigation.event_persistence import (
    save_event_to_db,
    get_stored_events,
    get_task_status,
    create_task_in_db,
    update_task_status,
    add_subtask_to_db
)

logger = logging.getLogger(__name__)


# =============================================================================
# INVESTIGATION ABORT SIGNALS (Similar to SESSION_ABORT_SIGNALS)
# =============================================================================

# Global dict to track abort signals for running investigations
# Key: task_id, Value: asyncio.Event (set when cancellation is requested)
INVESTIGATION_ABORT_SIGNALS: Dict[str, asyncio.Event] = {}


def register_investigation(task_id: str) -> asyncio.Event:
    """Register an investigation and return its abort signal."""
    abort_event = asyncio.Event()
    INVESTIGATION_ABORT_SIGNALS[task_id] = abort_event
    logger.info(f"Registered investigation {task_id} for cancellation tracking")
    return abort_event


def cancel_investigation_signal(task_id: str) -> bool:
    """
    Signal an investigation to cancel.
    Returns True if signal was sent, False if investigation not found.
    """
    if task_id in INVESTIGATION_ABORT_SIGNALS:
        INVESTIGATION_ABORT_SIGNALS[task_id].set()
        logger.info(f"Sent cancellation signal to investigation {task_id}")
        return True
    logger.warning(f"Investigation {task_id} not found in active investigations")
    return False


def cleanup_investigation(task_id: str):
    """Clean up investigation state after completion/cancellation."""
    if task_id in INVESTIGATION_ABORT_SIGNALS:
        del INVESTIGATION_ABORT_SIGNALS[task_id]
        logger.info(f"Cleaned up investigation {task_id}")


def is_investigation_cancelled(task_id: str) -> bool:
    """Check if an investigation has been cancelled."""
    if task_id in INVESTIGATION_ABORT_SIGNALS:
        return INVESTIGATION_ABORT_SIGNALS[task_id].is_set()
    return False


# =============================================================================
# SSE EVENT FORMATTING
# =============================================================================

def format_sse_event(event: dict) -> dict:
    """Format event for SSE response (sse_starlette expects dict with 'data' key)."""
    return {"data": json.dumps(event)}


# =============================================================================
# INLINE INVESTIGATION STREAMING - Main entry point
# =============================================================================

async def stream_inline_investigation(
    request: InvestigationTaskRequest,
    task_id: str
) -> AsyncGenerator[dict, None]:
    """
    Stream investigation results inline (no queue).
    
    Uses the supervisor agent with raw OpenAI streaming to:
    1. Create investigation todos
    2. Gather evidence using kubectl tools
    3. Analyze findings
    4. Provide root cause analysis and remediation
    
    Yields SSE events as they happen for real-time frontend updates.
    Supports cancellation via INVESTIGATION_ABORT_SIGNALS.
    """
    from orchestrator.core.investigation.supervisor_agent import run_supervisor_investigation
    from orchestrator.tools.kubectl import set_kubecontext
    
    logger.info(f"Starting supervisor investigation for task {task_id}")
    
    # Register investigation for cancellation tracking
    abort_event = register_investigation(task_id)
    
    try:
        # Create task in DB
        create_task_in_db(task_id, request)
        
        # Extract kubecontext and kubeconfig from request context
        kubecontext = request.context.get("kubecontext") if request.context else None
        kubeconfig = request.context.get("kubeconfig") if request.context else None
        
        # Set kubecontext if provided (with optional kubeconfig path)
        if kubecontext:
            set_kubecontext(kubecontext, kubeconfig)
        
        # Track summary and remediation for final update
        accumulated_summary = ""
        accumulated_remediation = ""
        accumulated_duration = 0
        accumulated_confidence = None
        accumulated_pattern = None
        accumulated_impacted_since = None
        accumulated_services_affected = 0
        accumulated_impact_severity = None
        
        # Yield investigation started event immediately
        started_event = {
            "type": "investigation_started",
            "task_id": task_id,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        save_event_to_db(task_id, started_event)
        yield format_sse_event(started_event)
        
        # Run supervisor investigation and stream events
        async for event in run_supervisor_investigation(
            task_id=task_id,
            prompt=request.prompt,
            context=request.context,
            resource_context=request.resource_context,
            model=request.model or "openai/gpt-4o-mini",
            kubecontext=kubecontext,
            kubeconfig=kubeconfig
        ):
            # Check for cancellation signal
            if abort_event.is_set():
                logger.info(f"Investigation {task_id} cancelled by user")
                
                # Update task status to cancelled
                update_task_status(task_id, TaskStatus.CANCELLED.value)
                
                # Emit cancellation event
                cancelled_event = {
                    "type": "investigation_cancelled",
                    "task_id": task_id,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "message": "Investigation cancelled by user"
                }
                save_event_to_db(task_id, cancelled_event)
                yield format_sse_event(cancelled_event)
                
                # Exit the loop
                break
            
            # Save to DB and yield for SSE
            save_event_to_db(task_id, event)
            yield format_sse_event(event)
            
            # Track summary and remediation (only from final, not draft)
            event_type = event.get("type")
            
            if event_type == "investigation_summary" and not event.get("is_draft"):
                accumulated_summary = event.get("summary", "")
            elif event_type == "investigation_remediation":
                accumulated_remediation = event.get("remediation", "")
            elif event_type == "task_duration":
                accumulated_duration = event.get("duration", 0)
            elif event_type == "confidence_complete":
                # Track confidence data for DB update
                accumulated_confidence = event.get("confidence", 0)
                accumulated_pattern = event.get("matched_pattern")
                accumulated_impacted_since = event.get("impacted_since")
                accumulated_services_affected = event.get("services_affected", 0)
                accumulated_impact_severity = event.get("impact_severity")
            
            # Add subtasks to DB
            if event_type == "agent_phase_complete" and event.get("sub_task"):
                add_subtask_to_db(task_id, event["sub_task"])
            
            # Small delay between events for smoother streaming
            await asyncio.sleep(0.1)
        
        # Only mark as completed if not cancelled
        if not abort_event.is_set():
            # Update task to completed with all accumulated data
            update_task_status(
                task_id,
                TaskStatus.COMPLETED.value,
                summary=accumulated_summary or "Investigation completed",
                remediation=accumulated_remediation or "See investigation findings for remediation steps",
                duration=accumulated_duration,
                pattern_confidence=accumulated_confidence,
                matched_pattern=accumulated_pattern,
                impacted_since=accumulated_impacted_since,
                service_affected=accumulated_services_affected,
                impact_severity=accumulated_impact_severity
            )
            
            logger.info(f"Investigation {task_id} completed")
        
    except asyncio.CancelledError:
        logger.info(f"Client disconnected from investigation {task_id}")
        yield format_sse_event({"type": "disconnected", "task_id": task_id})
        raise
        
    except Exception as e:
        logger.error(f"Investigation {task_id} failed: {e}", exc_info=True)
        
        update_task_status(task_id, TaskStatus.CANCELLED.value)
        
        error_event = {
            "type": "error",
            "task_id": task_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "error": str(e)
        }
        save_event_to_db(task_id, error_event)
        yield format_sse_event(error_event)
    
    finally:
        # Always cleanup the investigation from tracking
        cleanup_investigation(task_id)
    
    # Final done signal
    yield MessageStreamStatus.done.value


# =============================================================================
# RECONNECTION STREAMING - For existing investigations
# =============================================================================

async def stream_investigation_events(task_id: str) -> AsyncGenerator[dict, None]:
    """
    Stream events for an existing investigation.
    
    Following sst/opencode pattern for reconnection:
    1. First replay all stored events from Task.events
    2. If still processing, poll for new updates
    3. If completed/cancelled, just replay and close
    
    This allows:
    - User navigates away → investigation continues
    - User returns → reconnects to SSE, sees all past events + live updates
    """
    poll_interval = 1.0
    max_wait_time = 900  # 15 minutes
    start_time = datetime.now(timezone.utc)
    
    logger.info(f"SSE reconnection stream for task {task_id}")
    
    # Get current task status
    status = get_task_status(task_id)
    
    if status is None:
        yield format_sse_event({"type": "error", "task_id": task_id, "error": "Task not found"})
        return
    
    # Phase 1: Replay stored events
    stored_events = get_stored_events(task_id)
    
    for event in stored_events:
        yield format_sse_event(event)
    
    # If already completed/cancelled, we're done
    if status in [TaskStatus.COMPLETED.value, "completed", TaskStatus.CANCELLED.value, "cancelled"]:
        logger.info(f"Task {task_id} already completed/cancelled, replayed {len(stored_events)} events")
        yield "[DONE]"
        return
    
    # Phase 2: Poll for new updates (task is still processing)
    last_event_count = len(stored_events)
    
    try:
        while True:
            # Check timeout
            elapsed = (datetime.now(timezone.utc) - start_time).total_seconds()
            if elapsed > max_wait_time:
                yield format_sse_event({
                    "type": "investigation_timeout",
                    "task_id": task_id,
                    "message": "Stream timeout"
                })
                break
            
            # Check for new events
            current_events = get_stored_events(task_id)
            
            if len(current_events) > last_event_count:
                # Send new events
                for event in current_events[last_event_count:]:
                    yield format_sse_event(event)
                last_event_count = len(current_events)
            
            # Check if completed
            status = get_task_status(task_id)
            if status in [TaskStatus.COMPLETED.value, "completed", TaskStatus.CANCELLED.value, "cancelled"]:
                logger.info(f"Task {task_id} completed during reconnection stream")
                break
            
            await asyncio.sleep(poll_interval)
        
        yield MessageStreamStatus.done.value
        
    except asyncio.CancelledError:
        logger.info(f"Reconnection stream cancelled for task {task_id}")
        yield format_sse_event({"type": "disconnected", "task_id": task_id})
        raise
