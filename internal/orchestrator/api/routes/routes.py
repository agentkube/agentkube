import json
import os, datetime 

from fastapi import HTTPException, Depends, Query, Path, BackgroundTasks
from fastapi.responses import JSONResponse
from typing import Dict, Any, Optional, List
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import text
from fastapi import Request
from config.config import get_settings, get_mcp_config, config_manager, get_user_rules, get_cluster_rules, get_kubeignore, update_user_rules, update_cluster_rules, update_kubeignore, get_deny_list, get_web_search_enabled, get_recon_mode, get_additional_config, get_cluster_config, update_cluster_config

from orchestrator.db.db import get_db, Base, engine
from orchestrator.db.models.command import ExecuteCommandRequest
from orchestrator.db.models.config import ConfigUpdate, McpUpdate, RulesUpdate, KubeignoreUpdate, ClusterConfigUpdate
from orchestrator.db.models.chat import ChatRequest
from orchestrator.db.models.model import (
    ModelResponse,
    ProviderResponse,
    ProviderDetailResponse,
    EnableModelRequest,
    DisableModelRequest,
    ConnectProviderRequest,
    DisconnectProviderRequest,
    ProviderStatusResponse,
)
from orchestrator.db.models.chat import ChatMessage, CompletionRequest, SecurityChatRequest
from orchestrator.db.models.conversation import ConversationCreate, ConversationUpdate
from orchestrator.db.models.investigate import InvestigationTaskRequest, InvestigationTask
from orchestrator.db.models.task import TaskStatus, Task, TaskPatchRequest
from orchestrator.db.models.analytics import AnalyticsEventRequest
from orchestrator.db.models.analysis import LogAnalysisRequest, EventAnalysisRequest

from orchestrator.utils.investigation_queue import investigation_manager
from orchestrator.utils.stream import stream_agent_conversation
from orchestrator.utils.stream_utils import stream_agent_response, ACTIVE_SIGNALS, APPROVAL_DECISIONS, REDIRECT_INSTRUCTIONS
from orchestrator.utils.security_utils import stream_security_remediation
from orchestrator.utils.log_analyzer import stream_log_analysis
from orchestrator.utils.event_analyzer import stream_event_analysis
from orchestrator.utils.title_generator import stream_title_generation, TitleGenerationRequest

from orchestrator.services.conversation.conversation import ConversationService
from orchestrator.services.command.command import CommandService
from orchestrator.services.account.account import store_instance_id, get_instance_id, update_instance_id, delete_instance_id, has_instance_id
from orchestrator.services.account.session import store_oauth2_session, get_oauth2_session, delete_oauth2_session, has_oauth2_session, get_user_info, is_session_expired, update_oauth2_usage_async, should_track_usage
from orchestrator.services.models.llms import ModelService
from orchestrator.services.mcp import MCPService
from orchestrator.services.analytics import send_event
from orchestrator.tools.mcp import MCPClient
from orchestrator.session import Session, SessionInfo

# Import OAuth2 auth routes
from api.routes.auth_routes import setup_auth_routes
from fastapi import APIRouter


INCOMING_EVENTS_QUEUE_MAX_SIZE = 10
_mcp_client: Optional[MCPClient] = None

async def get_mcp_client() -> MCPClient:
    """Get or create the MCP client instance."""
    global _mcp_client
    if _mcp_client is None:
        _mcp_client = MCPClient(get_mcp_config())
        await _mcp_client.initialize()
    return _mcp_client

def setup_routes(api):    
    """Setup API routes.
    
    Args:
        api: FastAPI instance
        
    Returns:
        Modified FastAPI instance
    """
    Base.metadata.create_all(bind=engine)
    
    # Models now come from models.dev catalog — no DB initialization needed
    
    @api.get("/health")
    async def health_check(db = Depends(get_db)):
        """Health check endpoint to verify database connectivity."""
        try:
            # Execute a simple query to check database connection
            db.execute(text("SELECT 1"))
            return {"status": "healthy", "database": "connected"}
        except SQLAlchemyError as e:
            raise HTTPException(status_code=503, detail=f"Database connection failed: {str(e)}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Health check failed: {str(e)}")
    
    @api.post("/orchestrator/api/investigate")
    async def investigate(
        request: InvestigationTaskRequest,
        background_tasks: BackgroundTasks,
        db: Session = Depends(get_db)
    ):
        """
        Start an investigation with inline SSE streaming (sst/opencode pattern).
        
        Returns an EventSourceResponse that streams investigation events in real-time:
        - investigation_started: Stream begins
        - analysis_step: Each tool call with human-readable title
        - agent_phase_complete: Sub-agent finished
        - investigation_complete: Final summary and remediation
        - error: If something goes wrong
        
        The investigation runs inline (no queue), streaming results as they happen.
        Events are also persisted to DB for reconnection support.
        """
        import uuid
        from orchestrator.core.investigation.deep_investigation import stream_inline_investigation
        
        # Generate task_id for this investigation
        task_id = str(uuid.uuid4())
        
        return EventSourceResponse(
            stream_inline_investigation(request, task_id),
            media_type="text/event-stream"
        )


    @api.get("/orchestrator/api/investigate/{task_id}/status")
    async def get_investigation_status(task_id: str):
        """Get the status and result of an investigation."""
        task_data = investigation_manager.get_investigation_status(task_id)
        
        if not task_data:
            raise HTTPException(
                status_code=404,
                detail=f"Investigation with task_id {task_id} not found"
            )
        
        # Map task status to investigation status
        status_map = {
            TaskStatus.PROCESSED.value: "processing",
            TaskStatus.COMPLETED.value: "completed",
            TaskStatus.CANCELLED.value: "cancelled"
        }

        investigation_status = status_map.get(task_data["status"], "processing")
        
        # Return different responses based on status
        if investigation_status == "completed":
            # Extract result from sub_tasks if available
            if task_data.get("sub_tasks") and len(task_data["sub_tasks"]) > 0:
                sub_task = task_data["sub_tasks"][0]

            return {
                "task_id": task_id,
                "status": investigation_status,
                "created_at": task_data["created_at"],
                "started_at": task_data["created_at"],
                "completed_at": task_data["updated_at"]
            }
        elif investigation_status == "cancelled":
            return {
                "task_id": task_id,
                "status": investigation_status,
                "created_at": task_data["created_at"],
                "started_at": task_data["created_at"],
                "cancelled_at": task_data["updated_at"],
                "message": "Investigation was cancelled by user"
            }
        elif investigation_status == "failed":
            # Get error from latest event
            error = "Investigation failed"
            if task_data.get("events"):
                for event in reversed(task_data["events"]):
                    if "failed" in event.get("reason", "").lower():
                        error = event.get("analysis", error)
                        break

            return {
                "task_id": task_id,
                "status": investigation_status,
                "created_at": task_data["created_at"],
                "started_at": task_data["created_at"],
                "completed_at": task_data["updated_at"],
                "error": error
            }
        else:
            # PROCESSING
            return {
                "task_id": task_id,
                "status": investigation_status,
                "created_at": task_data["created_at"],
                "started_at": task_data["created_at"],
                "message": f"Investigation is {investigation_status}"
            }

    @api.get("/orchestrator/api/investigate")
    async def list_investigations(
        limit: int = Query(50, ge=1, le=100),
        status: Optional[str] = Query(None, description="Filter by status")
    ):
        """List recent investigations with optional status filtering."""
        tasks = investigation_manager.list_investigations(limit=limit)
        
        # Map task status to investigation status
        status_map = {
            TaskStatus.PROCESSED.value: "processing",
            TaskStatus.COMPLETED.value: "completed",
            TaskStatus.CANCELLED.value: "cancelled"
        }

        investigations = []
        for task in tasks:
            investigation_status = status_map.get(task["status"], "processing")
            
            # Apply status filter if provided
            if status and investigation_status != status:
                continue
                
            investigations.append({
                "task_id": task["task_id"],
                "status": investigation_status,
                "title": task["title"],
                "tags": task.get("tags", []),
                "severity": task.get("severity"),
                "created_at": task["created_at"],
                "started_at": task["created_at"],
                "completed_at": task["updated_at"] if investigation_status in ["completed", "failed", "cancelled"] else None
            })
        
        return {
            "investigations": investigations,
            "total": len(investigations)
        }

    @api.post("/orchestrator/api/investigate/{task_id}/cancel")
    async def cancel_investigation(task_id: str, db: Session = Depends(get_db)):
        """
        Cancel a running investigation using SSE abort signal.
        
        This uses the new signal-based approach (like SESSION_ABORT_SIGNALS)
        instead of the old queue-based cancellation.
        """
        from orchestrator.core.investigation.deep_investigation import (
            cancel_investigation_signal,
            INVESTIGATION_ABORT_SIGNALS
        )
        from orchestrator.db.models.task import Task, TaskStatus
        
        # First try to signal cancellation if investigation is actively running
        if task_id in INVESTIGATION_ABORT_SIGNALS:
            success = cancel_investigation_signal(task_id)
            if success:
                return {
                    "task_id": task_id,
                    "status": "cancelled",
                    "message": "Investigation cancellation signal sent"
                }
        
        # If not actively running, check if it's in the database and update status
        task = db.query(Task).filter(Task.task_id == task_id).first()
        if task:
            if task.status in [TaskStatus.COMPLETED.value, "completed", TaskStatus.CANCELLED.value, "cancelled"]:
                raise HTTPException(
                    status_code=400,
                    detail="Investigation already completed or cancelled"
                )
            
            # Mark as cancelled in DB
            task.status = TaskStatus.CANCELLED.value
            db.commit()
            return {
                "task_id": task_id,
                "status": "cancelled",
                "message": "Investigation cancelled successfully"
            }
        
        raise HTTPException(
            status_code=404,
            detail="Investigation not found"
        )

    @api.delete("/orchestrator/api/investigate/{task_id}")
    async def delete_investigation(task_id: str, db: Session = Depends(get_db)):
        """Cancel and delete an investigation task."""
        from orchestrator.core.investigation.deep_investigation import (
            cancel_investigation_signal,
            INVESTIGATION_ABORT_SIGNALS
        )
        from orchestrator.db.models.task import Task
        
        # First signal cancellation if running
        if task_id in INVESTIGATION_ABORT_SIGNALS:
            cancel_investigation_signal(task_id)
        
        # Then delete from database
        task = db.query(Task).filter(Task.task_id == task_id).first()
        if task:
            db.delete(task)
            db.commit()
            return {
                "task_id": task_id,
                "status": "deleted",
                "message": "Investigation cancelled and deleted successfully"
            }
        
        raise HTTPException(
            status_code=404,
            detail="Investigation not found"
        )

    # ==========================================================================
    # INVESTIGATION SSE STREAMING (Following sst/opencode pattern)
    # ==========================================================================
    

    @api.get("/orchestrator/api/investigate/{task_id}/todos")
    async def get_investigation_todos(task_id: str):
        """Get the todo list for a specific investigation."""
        try:
            from orchestrator.tools.todo_board import load_todos
            todos = load_todos(task_id)
            return {
                "task_id": task_id,
                "todos": todos,
                "count": len(todos)
            }
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to fetch todos: {str(e)}"
            )

    @api.get("/orchestrator/api/investigate/{task_id}/event")
    async def stream_investigation_event(task_id: str):
        """
        Subscribe to investigation events via Server-Sent Events.
        
        Following sst/opencode pattern:
        1. First replays all stored events from Task.events (for reconnecting clients)
        2. Then streams live updates as investigation progresses
        3. Investigation continues in background even if client disconnects
        4. Client can reconnect anytime and get full history + live updates
        
        Event types streamed:
        - investigation_started: Stream started
        - analysis_step: Tool call with human-readable title
        - agent_phase_complete: Sub-agent finished
        - investigation_complete: Final results
        - investigation_cancelled: Task was cancelled
        - error: Something went wrong
        
        Usage:
        1. Submit investigation: POST /orchestrator/api/investigate -> get task_id
        2. Load task data: GET /orchestrator/api/tasks/{task_id}
        3. If status === "processing": Connect to this SSE endpoint
        4. Navigate away -> SSE disconnects, but investigation continues
        5. Return -> Reconnect to SSE, get full history + live updates
        """
        from orchestrator.core.investigation.deep_investigation import stream_investigation_events
        
        return EventSourceResponse(
            stream_investigation_events(task_id),
            media_type="text/event-stream"
        )



# --------------- END OF INVESTIGATION --------------------

    # Add endpoint to get all tasks for debugging
    @api.get("/orchestrator/api/tasks")
    async def list_all_tasks(
        limit: int = Query(50, ge=1, le=100),
        db: Session = Depends(get_db)
    ):
        """List all tasks for debugging."""
        
        
        tasks = db.query(Task).order_by(Task.created_at.desc()).limit(limit).all()
        return {
            "tasks": [task.to_dict() for task in tasks],
            "total": len(tasks)
        }

    @api.get("/orchestrator/api/tasks/{task_id}")
    async def get_task_by_id(
        task_id: str,
        db: Session = Depends(get_db)
    ):
        """Get a specific task by task_id."""
        task = db.query(Task).filter(Task.task_id == task_id).first()
        
        if not task:
            raise HTTPException(
                status_code=404,
                detail=f"Task with task_id {task_id} not found"
            )
        
        return task.to_dict()

    @api.delete("/orchestrator/api/tasks/{task_id}")
    async def delete_task(
        task_id: str,
        db: Session = Depends(get_db)
    ):
        """Delete a task and its associated subtasks and events."""
        task = db.query(Task).filter(Task.task_id == task_id).first()
        
        if not task:
            raise HTTPException(
                status_code=404,
                detail=f"Task with task_id {task_id} not found"
            )
        
        # Delete the task (subtasks and events are stored as JSON in the task itself)
        db.delete(task)
        db.commit()
        
        return {
            "status": "success", 
            "message": f"Task {task_id} is deleted successfully"
        }

    @api.patch("/orchestrator/api/tasks/{task_id}")
    async def patch_task(
        task_id: str,
        patch_data: TaskPatchRequest,
        db: Session = Depends(get_db)
    ):
        """Update specific fields of a task (e.g., mark as resolved)."""
        task = db.query(Task).filter(Task.task_id == task_id).first()
        
        if not task:
            raise HTTPException(
                status_code=404,
                detail=f"Task with task_id {task_id} not found"
            )
        
        # Apply patch updates
        if patch_data.resolved is not None:
            # Store as "yes" or "no"
            resolved_value = "yes" if patch_data.resolved == "yes" else "no"
            task.resolved = resolved_value
            
            # Also update InvestigationTask if it exists
            inv_task = db.query(InvestigationTask).filter(InvestigationTask.task_id == task_id).first()
            if inv_task:
                inv_task.resolved = resolved_value
        
        db.commit()
        db.refresh(task)
        
        return {
            "status": "success",
            "message": f"Task {task_id} updated successfully",
            "task": task.to_dict()
        }

    @api.get("/orchestrator/api/investigate/{task_id}")
    async def get_investigation_task(
        task_id: str,
        db: Session = Depends(get_db)
    ):
        """Get the original investigation task by task_id."""
        investigation_task = db.query(InvestigationTask).filter(
            InvestigationTask.task_id == task_id
        ).first()
        
        if not investigation_task:
            raise HTTPException(
                status_code=404,
                detail=f"Investigation task with task_id {task_id} not found"
            )
        
        return investigation_task.to_dict()

    # Investigation metrics endpoint for monitoring
    @api.get("/orchestrator/api/investigate/metrics")
    async def get_investigation_metrics():
        """Get investigation metrics for monitoring (no queue - inline streaming)."""
        from orchestrator.core.investigation.deep_investigation import INVESTIGATION_ABORT_SIGNALS
        
        # Get all investigation tasks from database
        tasks = investigation_manager.list_investigations(limit=1000)
        
        # Count active investigations (status == PROCESSED means still running)
        active_investigations = len([
            task for task in tasks 
            if task["status"] == TaskStatus.PROCESSED.value
        ])
        
        # Count currently streaming investigations (tracked by abort signals)
        currently_streaming = len(INVESTIGATION_ABORT_SIGNALS)
        
        return {
            "currently_streaming": currently_streaming,
            "active_investigations": active_investigations,
            "total_investigations": len(tasks),
            "mode": "inline_streaming"  # Indicate we're using the new approach
        }

        
    @api.post("/orchestrator/api/handle")
    async def handle(request: Request):
        """Handle Kubernetes events from the operator."""
        try:
            # Get the raw request body
            body = await request.body()
            
            # Try to parse as JSON
            try:
                payload = await request.json()
                print(f"Received K8s event payload: {json.dumps(payload, indent=2)}")
            except Exception as json_error:
                print(f"Failed to parse JSON, raw body: {body.decode('utf-8')}")
                print(f"JSON parse error: {json_error}")
                
            # Log request headers for debugging
            print(f"Request headers: {dict(request.headers)}")
            
            return {"status": "received", "message": "Event payload logged successfully"}
            
        except Exception as e:
            print(f"Error processing K8s event: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to process event: {str(e)}")

    @api.post("/orchestrator/api/trigger")
    async def handle():
        # TODO 1. Receives POST requests for manually triggering actions
        # TODO 2. Validates that action_name is provided
        # TODO 3. Calls Web.event_handler.run_external_action() synchronously (not queued)
        # TODO 4. Returns the response directly to the caller
        pass

    
    @api.post("/orchestrator/api/helm-releases")
    async def handle():
        # TODO 1. Receives POST requests for manually triggering actions
        # TODO 2. Validates that action_name is provided
        # TODO 3. Calls Web.event_handler.run_external_action() synchronously (not queued)
        # TODO 4. Returns the response directly to the caller
        pass
        
    @api.post("/orchestrator/api/usage")
    async def update_usage():
        """Update user usage after request completion."""
        return await update_oauth2_usage_async()
    
    @api.post("/orchestrator/api/chat")
    async def chat(request: ChatRequest,  background_tasks: BackgroundTasks):
        """Chat with the Kubernetes multi-agent system with streaming response."""
        response = EventSourceResponse(
            stream_agent_response(
                message=request.message,
                chat_history=request.chat_history,
                model_name=request.model or "openai/gpt-4o-mini",
                kubecontext=request.kubecontext,
                kubeconfig=request.kubeconfig,
                custom_prompt=request.prompt,
                files=request.files,
                auto_approve=request.auto_approve,
                reasoning_effort=request.reasoning_effort,
                session_id=request.session_id  # OpenCode-style session ID
            ),
            media_type="text/event-stream"
        )

        # # Only track usage if using OpenRouter (not BYOK)
        # if await should_track_usage(request.model or "openai/gpt-4o-mini"):
        #     # background_tasks.add_task(update_oauth2_usage_async)
        #     pass

        return response

    @api.post("/orchestrator/api/chat/abort")
    async def abort_chat(request: Dict[str, str]):
        """
        Abort an active chat session.

        This endpoint allows the frontend to gracefully terminate an ongoing
        agent loop by setting the termination signal associated with the trace_id.

        Request body:
        {
            "trace_id": "abc123"
        }

        Returns:
        {
            "success": true,
            "message": "Abort signal sent"
        }
        """
        trace_id = request.get("trace_id")

        if not trace_id:
            raise HTTPException(
                status_code=400,
                detail="trace_id is required"
            )

        if trace_id not in ACTIVE_SIGNALS:
            raise HTTPException(
                status_code=404,
                detail="No active session found with that trace_id. Session may have already completed."
            )

        # Set the termination signal
        signal = ACTIVE_SIGNALS[trace_id]
        signal.set()

        return {
            "success": True,
            "message": "Abort signal sent successfully"
        }

    @api.post("/orchestrator/api/chat/tool-approval")
    async def tool_approval(request: Dict[str, Any]):
        """
        Approve or reject a tool execution request.

        This endpoint allows the frontend to respond to tool approval requests
        during agent execution. The agent will wait for user decision before
        executing potentially dangerous tools.

        Request body:
        {
            "trace_id": "abc123",
            "call_id": "call_xyz",
            "decision": "approve" | "deny" | "approve_for_session" | "redirect",
            "message": "optional: new instruction when decision is 'redirect'"
        }

        Returns:
        {
            "success": true,
            "message": "Approval decision recorded"
        }
        """
        trace_id = request.get("trace_id")
        call_id = request.get("call_id")
        decision = request.get("decision")
        message = request.get("message")  # Optional: for redirect decision

        if not trace_id or not call_id or not decision:
            raise HTTPException(
                status_code=400,
                detail="trace_id, call_id, and decision are required"
            )

        if decision not in ["approve", "deny", "approve_for_session", "redirect"]:
            raise HTTPException(
                status_code=400,
                detail="decision must be 'approve', 'deny', 'approve_for_session', or 'redirect'"
            )

        if decision == "redirect" and not message:
            raise HTTPException(
                status_code=400,
                detail="message is required when decision is 'redirect'"
            )

        if trace_id not in APPROVAL_DECISIONS:
            raise HTTPException(
                status_code=404,
                detail="No active approval request found for that trace_id"
            )

        if call_id not in APPROVAL_DECISIONS[trace_id]:
            raise HTTPException(
                status_code=404,
                detail="No pending approval found for that call_id"
            )

        # If redirect decision, store the new instruction
        if decision == "redirect":
            REDIRECT_INSTRUCTIONS[trace_id] = message

        # Set the decision in the future to unblock the agent loop
        approval_data = APPROVAL_DECISIONS[trace_id][call_id]
        approval_data["future"].set_result(decision)

        return {
            "success": True,
            "message": f"Tool {decision} decision recorded"
        }

    # =========================================================================
    # SESSION MANAGEMENT ENDPOINTS (OpenCode style)
    # =========================================================================

    @api.get("/orchestrator/api/session")
    async def list_sessions(limit: int = Query(50, ge=1, le=100)):
        """
        List all sessions, sorted by last updated.
        
        Query parameters:
            limit: Maximum number of sessions to return (1-100, default 50)
            
        Returns:
            List of session objects with id, title, status, timestamps
        """
        sessions = Session.list(limit=limit)
        return {
            "sessions": [s.to_dict() for s in sessions],
            "count": len(sessions)
        }

    @api.post("/orchestrator/api/session")
    async def create_session(
        title: Optional[str] = None,
        model: Optional[str] = None
    ):
        """
        Create a new session.
        
        Query parameters:
            title: Session title (optional, auto-generated if not provided)
            model: Model to use for this session
            
        Returns:
            The newly created session object
        """
        session = Session.create(title=title, model=model)
        return session.to_dict()

    @api.get("/orchestrator/api/session/{session_id}")
    async def get_session(session_id: str = Path(..., description="Session ID")):
        """
        Get a specific session by ID.
        
        Path parameters:
            session_id: The session ID to retrieve
            
        Returns:
            Session object if found
        """
        session = Session.get(session_id)
        if not session:
            raise HTTPException(
                status_code=404,
                detail=f"Session '{session_id}' not found"
            )
        return session.to_dict()

    @api.delete("/orchestrator/api/session/{session_id}")
    async def delete_session(session_id: str = Path(..., description="Session ID")):
        """
        Delete a session and all associated data (messages, todos).
        
        Path parameters:
            session_id: The session ID to delete
            
        Returns:
            Confirmation of deletion
        """
        success = Session.delete(session_id)
        if not success:
            raise HTTPException(
                status_code=404,
                detail=f"Session '{session_id}' not found"
            )
        return {
            "success": True,
            "message": f"Session '{session_id}' deleted successfully"
        }

    @api.get("/orchestrator/api/session/{session_id}/messages")
    async def get_session_messages(
        session_id: str = Path(..., description="Session ID"),
        limit: int = Query(100, ge=1, le=500)
    ):
        """
        Get messages for a session.
        
        Path parameters:
            session_id: The session ID
        Query parameters:
            limit: Maximum messages to return (1-500, default 100)
            
        Returns:
            List of messages sorted by time
        """
        session = Session.get(session_id)
        if not session:
            raise HTTPException(
                status_code=404,
                detail=f"Session '{session_id}' not found"
            )
        
        messages = Session.get_messages(session_id, limit=limit)
        return {
            "session_id": session_id,
            "messages": [m.to_dict() for m in messages],
            "count": len(messages)
        }

    @api.get("/orchestrator/api/session/{session_id}/todos")
    async def get_session_todos(
        session_id: str = Path(..., description="Session ID")
    ):
        """
        Get the current todo list for a session.
        
        Path parameters:
            session_id: The session ID
            
        Returns:
            List of todo items
        """
        session = Session.get(session_id)
        if not session:
            raise HTTPException(
                status_code=404,
                detail=f"Session '{session_id}' not found"
            )
        
        todos = Session.get_todos(session_id)
        return {
            "session_id": session_id,
            "todos": todos,
            "count": len(todos)
        }

    @api.post("/orchestrator/api/security/chat")
    async def security_chat(request: SecurityChatRequest, background_tasks: BackgroundTasks):
        """Chat with the Kubernetes security agent for manifest vulnerability remediation."""
        # Convert the Pydantic model to a dictionary if needed
        vulnerability_context = None
        if request.vulnerability_context:
            vulnerability_context = {
                "severity": request.vulnerability_context.severity,
                "description": request.vulnerability_context.description,
                "code_snippet": request.vulnerability_context.code_snippet
            }
        
        response = EventSourceResponse(
            stream_security_remediation(
                manifest_content=request.manifest_content,
                vulnerability_context=vulnerability_context,
                model_name=request.model or "openai/gpt-4o-mini"
            ),
            media_type="text/event-stream"
        )

        # Only track usage if using OpenRouter (not BYOK)
        # if await should_track_usage(request.model or "openai/gpt-4o-mini"):
        #     background_tasks.add_task(update_oauth2_usage_async)
        
        return response
    
    @api.post("/orchestrator/api/analyze/logs")
    async def analyze_logs(request: LogAnalysisRequest, background_tasks: BackgroundTasks):
        """Stream AI analysis of Kubernetes pod logs."""
        response = EventSourceResponse(
            stream_log_analysis(request),
            media_type="text/event-stream"
        )

        # # Only track usage if using OpenRouter (not BYOK)
        # if await should_track_usage(request.model or "openai/gpt-4o-mini"):
        #     background_tasks.add_task(update_oauth2_usage_async)

        return response

    @api.post("/orchestrator/api/analyze/events")
    async def analyze_events(request: EventAnalysisRequest, background_tasks: BackgroundTasks):
        """Stream AI analysis of Kubernetes events."""
        response = EventSourceResponse(
            stream_event_analysis(request),
            media_type="text/event-stream"
        )

        # Only track usage if using OpenRouter (not BYOK)
        # if await should_track_usage(request.model or "openai/gpt-4o-mini"):
        #     background_tasks.add_task(update_oauth2_usage_async)

        return response

    @api.post("/orchestrator/api/generate/title")
    async def generate_title(request: TitleGenerationRequest, background_tasks: BackgroundTasks):
        """
        Stream AI-generated title for investigation reports.
        
        Following sst/opencode pattern:
        - Title is generated AFTER investigation completes
        - Based on root cause analysis and user's original prompt
        - Streamed token-by-token for real-time UI updates
        
        Request body:
        {
            "task_id": "uuid",
            "user_prompt": "Original investigation prompt",
            "root_cause": "The root cause analysis text",
            "model": "openai/gpt-4o-mini" (optional)
        }
        
        Streams events:
        - title_token: Each token of the title
        - title_complete: Final complete title
        """
        response = EventSourceResponse(
            stream_title_generation(request),
            media_type="text/event-stream"
        )

        return response

    @api.post("/orchestrator/api/execute", response_model=Dict[str, Any])
    async def execute_command_direct(request: ExecuteCommandRequest):
        """Execute a kubectl command and return the result."""
        result = CommandService.execute_command(request.command, request.kubecontext)
        return {
            "success": result.success,
            "command": result.command,
            "output": result.output
        }
    
    # Config
    @api.get("/orchestrator/api/config")
    async def get_config():
        """Get the config for the agentkube multi-agent system."""
        return JSONResponse(content=get_settings())
    
    @api.put("/orchestrator/api/config")
    async def update_config(update: ConfigUpdate):
        """Update the entire config for the agentkube multi-agent system."""
        try:
            os.makedirs(os.path.dirname(config_manager.settings_path), exist_ok=True)
            with open(config_manager.settings_path, 'w') as f:
                json.dump(update.config, f, indent=2)
            # Force reload of settings
            global settings
            settings = update.config
            return {"status": "success", "message": "Config updated successfully"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to update config: {str(e)}")

    @api.patch("/orchestrator/api/config")
    async def patch_config(update: ConfigUpdate):
        """Partially update the config for the agentkube multi-agent system."""
        try:
            current_config = get_settings()
            # Deep merge the dictionaries
            merged_config = config_manager.deep_merge(current_config, update.config)
            
            os.makedirs(os.path.dirname(config_manager.settings_path), exist_ok=True)
            with open(config_manager.settings_path, 'w') as f:
                json.dump(merged_config, f, indent=2)
            
            # Force reload of settings
            global settings
            settings = merged_config
            return {"status": "success", "message": "Config patched successfully"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to patch config: {str(e)}") 

    # MCP 
    @api.get("/orchestrator/api/mcp")
    async def get_mcp():
        """Get the mcp configuration for the agentkube platform."""
        return JSONResponse(content=get_mcp_config())
    
    @api.put("/orchestrator/api/mcp")
    async def update_mcp(update: McpUpdate):
        """Update the entire MCP configuration."""
        try:
            os.makedirs(os.path.dirname(config_manager.mcp_path), exist_ok=True)
            with open(config_manager.mcp_path, 'w') as f:
                json.dump(update.mcp, f, indent=2)
            # Force reload of MCP config
            global mcp
            mcp = update.mcp
            
            await MCPService.reset_client()
            
            return {"status": "success", "message": "MCP config updated successfully"}
        
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to update MCP config: {str(e)}")

    @api.patch("/orchestrator/api/mcp")
    async def patch_mcp(update: McpUpdate):
        """Partially update the MCP configuration."""
        try:
            current_mcp = get_mcp_config()
            # Deep merge the dictionaries
            merged_mcp = config_manager.deep_merge(current_mcp, update.mcp)
            
            os.makedirs(os.path.dirname(config_manager.mcp_path), exist_ok=True)
            with open(config_manager.mcp_path, 'w') as f:
                json.dump(merged_mcp, f, indent=2)
            
            # Force reload of MCP config
            global mcp
            mcp = merged_mcp
            
            await MCPService.reset_client()
            
            return {"status": "success", "message": "MCP config patched successfully"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to patch MCP config: {str(e)}")
    
    @api.delete("/orchestrator/api/mcp/{server_name}")
    async def delete_mcp_server(server_name: str):
        """Delete a specific MCP server from the configuration."""
        try:
            current_mcp = get_mcp_config()
            
            if "mcpServers" in current_mcp and server_name in current_mcp["mcpServers"]:
                # Remove the specified server
                del current_mcp["mcpServers"][server_name]
                
                # Write updated config back to file
                os.makedirs(os.path.dirname(config_manager.mcp_path), exist_ok=True)
                with open(config_manager.mcp_path, 'w') as f:
                    json.dump(current_mcp, f, indent=2)
                
                # Update in-memory MCP config
                global mcp
                mcp = current_mcp
                
                await MCPService.reset_client()
                
                return {"status": "success", "message": f"MCP server '{server_name}' deleted successfully"}
            else:
                raise HTTPException(status_code=404, detail=f"MCP server '{server_name}' not found")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to delete MCP server: {str(e)}")  
        
    @api.get("/orchestrator/api/mcp/servers")
    async def list_mcp_servers(
        connect: bool = Query(True, description="Try to connect to servers if disconnected")
    ):
        """List all configured MCP servers with connection status and tools."""
        try:
            servers = await MCPService.list_servers(try_connect=connect)
            return servers
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to list MCP servers: {str(e)}")

    @api.get("/orchestrator/api/mcp/tools")
    async def list_mcp_tools(
        refresh: bool = Query(False, description="Force refresh of tools cache")
    ):
        """List all MCP tools from connected servers using cached tools when possible."""
        try:
            tools = await MCPService.list_all_tools(force_refresh=refresh)
            return tools
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to list MCP tools: {str(e)}")

    @api.get("/orchestrator/api/mcp/servers/{server_name}/tools")
    async def list_server_tools(
        server_name: str = Path(..., description="Name of the MCP server"),
        refresh: bool = Query(False, description="Force refresh of tools cache")
    ):
        """List all tools for a specific server."""
        try:
            # First ensure the server is connected
            connected = await MCPService.connect_to_server(server_name)
            if not connected:
                raise HTTPException(status_code=404, detail=f"Server '{server_name}' not found or could not connect")
            
            # Then get the tools
            tools = await MCPService.list_server_tools(server_name, force_refresh=refresh)
            return tools
        except ValueError as e:
            raise HTTPException(status_code=404, detail=f"Server '{server_name}' not found")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to list tools for server '{server_name}': {str(e)}")

    # Add a route to call a tool for testing/development purposes
    @api.post("/orchestrator/api/mcp/servers/{server_name}/tools/{tool_name}/execute")
    async def execute_tool(
        server_name: str = Path(..., description="Name of the MCP server"),
        tool_name: str = Path(..., description="Name of the tool to execute"),
        arguments: Dict[str, Any] = {},
        mcp_client: MCPClient = Depends(get_mcp_client)
    ):
        """Execute a tool on a specific server (for testing and development)."""
        try:
            # Ensure server is connected
            connected = await mcp_client.ensure_server_connected(server_name)
            if not connected:
                raise HTTPException(status_code=404, detail=f"Server '{server_name}' not found or could not connect")
                
            result = await mcp_client.call_tool(server_name, tool_name, arguments)
            
            # Convert to a serializable format
            if hasattr(result, 'model_dump'):
                return result.model_dump()
            elif hasattr(result, '__dict__'):
                return result.__dict__
            else:
                return {"result": str(result)}
                
        except ValueError as e:
            raise HTTPException(status_code=404, detail=f"Server '{server_name}' not found")
        except RuntimeError as e:
            raise HTTPException(status_code=503, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to execute tool: {str(e)}")
            
    # ── Models (models.dev catalog + settings.json) ──

    @api.get("/orchestrator/api/models/catalog")
    async def get_models_catalog():
        """Get the full models.dev catalog grouped by provider."""
        try:
            providers = await ModelService.get_providers()
            return providers
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to fetch catalog: {str(e)}")

    @api.get("/orchestrator/api/models/providers", response_model=List[ProviderResponse])
    async def list_providers():
        """List all providers with metadata and connection status."""
        try:
            providers = await ModelService.get_providers()
            return providers
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to fetch providers: {str(e)}")

    @api.get("/orchestrator/api/models/providers/{provider_id}")
    async def get_provider_detail(provider_id: str):
        """Get a specific provider with its models."""
        try:
            detail = await ModelService.get_provider_detail(provider_id)
            if not detail:
                raise HTTPException(status_code=404, detail=f"Provider '{provider_id}' not found")
            return detail
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to fetch provider: {str(e)}")

    @api.get("/orchestrator/api/models")
    async def list_enabled_models():
        """List user's enabled models (from settings.json)."""
        try:
            models = await ModelService.list_enabled_models()
            return models
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to fetch models: {str(e)}")

    @api.get("/orchestrator/api/models/all")
    async def list_all_models():
        """List ALL models from catalog with enabled status."""
        try:
            models = await ModelService.list_all_models()
            return models
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to fetch models: {str(e)}")

    @api.get("/orchestrator/api/models/search")
    async def search_models(q: str = Query("", description="Search query")):
        """Search models by name, family, or provider."""
        try:
            if not q.strip():
                return []
            results = await ModelService.search_models(q)
            return results
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

    @api.post("/orchestrator/api/models/enable")
    async def enable_model(request: EnableModelRequest):
        """Enable a model (add to settings.json enabledModels list)."""
        try:
            result = await ModelService.enable_model(request.provider_id, request.model_id)
            return result
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to enable model: {str(e)}")

    @api.post("/orchestrator/api/models/disable")
    async def disable_model(request: DisableModelRequest):
        """Disable a model (remove from settings.json enabledModels list)."""
        try:
            result = await ModelService.disable_model(request.provider_id, request.model_id)
            return result
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to disable model: {str(e)}")

    @api.post("/orchestrator/api/providers/connect")
    async def connect_provider(request: ConnectProviderRequest):
        """Store API key for a provider in settings.json."""
        try:
            success = config_manager.connect_provider(
                request.provider_id,
                request.api_key,
                base_url=request.base_url or "",
                endpoint=request.endpoint or "",
            )
            if not success:
                raise HTTPException(status_code=500, detail="Failed to save provider config")
            return {"status": "success", "provider_id": request.provider_id, "connected": True}
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to connect provider: {str(e)}")

    @api.delete("/orchestrator/api/providers/{provider_id}")
    async def disconnect_provider(provider_id: str):
        """Remove API key for a provider from settings.json."""
        try:
            success = config_manager.disconnect_provider(provider_id)
            if not success:
                raise HTTPException(status_code=500, detail="Failed to remove provider config")
            return {"status": "success", "provider_id": provider_id, "connected": False}
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to disconnect provider: {str(e)}")

    @api.get("/orchestrator/api/providers/status")
    async def get_providers_status():
        """Get connection status for all configured providers."""
        try:
            providers = await ModelService.get_providers()
            statuses = {p["id"]: p.get("connected", False) for p in providers}
            return {"statuses": statuses}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to get status: {str(e)}")
    
    
    # Conversations
    @api.get("/orchestrator/api/conversations")
    async def list_conversations(
        skip: int = Query(0, ge=0),
        limit: int = Query(100, ge=1, le=1000),
        db: Session = Depends(get_db)
    ):
        """List all conversations."""
        conversations = ConversationService.list_conversations(db, skip=skip, limit=limit)
        return {
            "conversations": [conversation.to_dict() for conversation in conversations],
            "total": len(conversations),
            "skip": skip,
            "limit": limit
        }
    
    @api.post("/orchestrator/api/conversations", status_code=201)
    async def create_conversation(
        request: ConversationCreate,
        db: Session = Depends(get_db)
    ):
        """Create a new conversation."""
        conversation = ConversationService.create_conversation(db, title=request.title)
        return conversation.to_dict()
    
    @api.post("/orchestrator/api/completion")
    async def completion(request: CompletionRequest,  background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
        """Generate AI completion and log to database."""
        # Get or create conversation
        conversation_id = request.conversation_id
        
        # Get chat history from database if conversation_id is provided
        chat_history = []
        if conversation_id:
            conversation = ConversationService.get_conversation(db, conversation_id)
            if not conversation:
                raise HTTPException(status_code=404, detail="Conversation not found")
                
            messages = ConversationService.get_messages(db, conversation_id)
            chat_history = [
                ChatMessage(
                    role=message.role,
                    content=message.content,
                    name=message.name
                )
                for message in messages
            ]
                
        response = EventSourceResponse(
            stream_agent_conversation(
                message=request.message,
                chat_history=chat_history,
                model_name=request.model or "openai/gpt-4o-mini",
                kubecontext=request.kubecontext,
                custom_prompt=request.prompt,
                files=request.files if hasattr(request, 'files') else None
            ),
            media_type="text/event-stream"
        )

        # Only track usage if using OpenRouter (not BYOK)
        # if await should_track_usage(request.model or "openai/gpt-4o-mini"):
        #     background_tasks.add_task(update_oauth2_usage_async)
        
        return response
    
    @api.get("/orchestrator/api/conversations/{conversation_id}")
    async def get_conversation(
        conversation_id: str,
        db: Session = Depends(get_db)
    ):
        """Get conversation details with messages."""
        result = ConversationService.get_conversation_with_messages(db, conversation_id)
        if not result:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return result

    @api.get("/orchestrator/api/conversations")
    async def list_conversations(
        skip: int = Query(0, ge=0),
        limit: int = Query(100, ge=1, le=1000),
        db: Session = Depends(get_db)
    ):
        """List all conversations."""
        conversations = ConversationService.list_conversations(db, skip=skip, limit=limit)
        return {
            "conversations": [conversation.to_dict() for conversation in conversations],
            "total": len(conversations),
            "skip": skip,
            "limit": limit
        }
        
    @api.put("/orchestrator/api/conversations/{conversation_id}")
    async def update_conversation(
        conversation_id: str,
        request: ConversationUpdate,
        db: Session = Depends(get_db)
    ):
        """Update a conversation."""
        conversation = ConversationService.update_conversation(db, conversation_id, title=request.title)
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return conversation.to_dict()
    
    @api.delete("/orchestrator/api/conversations/{conversation_id}")
    async def delete_conversation(
        conversation_id: str,
        db: Session = Depends(get_db)
    ):
        """Delete a conversation."""
        success = ConversationService.delete_conversation(db, conversation_id)
        if not success:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return {"status": "deleted", "id": conversation_id}
    
        
    # Instance
    @api.post("/orchestrator/api/instance")
    async def store_instance(request: dict):
        """Store an instance ID."""
        instance_id = request.get('instance_id')
        if not instance_id:
            raise HTTPException(status_code=400, detail="instance_id is required")
        
        success = store_instance_id(instance_id)
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to store instance ID")
            
        return {
            "success": True,
            "message": "Instance ID stored successfully"
        }

    @api.get("/orchestrator/api/instance")
    async def retrieve_instance():
        """Get the current instance ID."""
        instance_id = get_instance_id()
        
        if instance_id is None:
            return {
                "success": False,
                "message": "No instance ID found",
                "instance_id": None
            }
            
        return {
            "success": True,
            "message": "Instance ID retrieved successfully",
            "instance_id": instance_id
        }

    @api.put("/orchestrator/api/instance")
    async def replace_instance(request: dict):
        """Replace the instance ID."""
        instance_id = request.get('instance_id')
        if not instance_id:
            raise HTTPException(status_code=400, detail="instance_id is required")
        
        success = update_instance_id(instance_id)
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to update instance ID")
            
        return {
            "success": True,
            "message": "Instance ID updated successfully"
        }

    @api.delete("/orchestrator/api/instance")
    async def remove_instance():
        """Remove the instance ID."""
        if not has_instance_id():
            return {
                "success": True,
                "message": "No instance ID to remove"
            }
            
        success = delete_instance_id()
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to delete instance ID")
            
        return {
            "success": True,
            "message": "Instance ID removed successfully"
        }
    
    # OAuth2 Session Status (read-only for now)
    @api.get("/orchestrator/api/oauth2/status")
    async def get_oauth2_session_status():
        """Get OAuth2 session status without exposing sensitive data."""
        try:
            has_session = has_oauth2_session()
            is_expired = is_session_expired() if has_session else True
            user_info = get_user_info() if has_session and not is_expired else None
            
            return {
                "has_session": has_session,
                "is_expired": is_expired,
                "authenticated": has_session and not is_expired,
                "user_email": user_info.get('email') if user_info else None,
                "user_name": user_info.get('name') if user_info else None
            }
        except Exception as e:
            return {
                "has_session": False,
                "is_expired": True,
                "authenticated": False,
                "user_email": None,
                "user_name": None,
                "error": str(e)
            }
    
    # Rules Management
    @api.get("/orchestrator/api/rules/user")
    async def get_user_rules_content():
        """Get user rules content."""
        content = get_user_rules()
        return {"content": content}
    
    @api.put("/orchestrator/api/rules/user")
    async def update_user_rules_content(request: RulesUpdate):
        """Update user rules content."""
        success = update_user_rules(request.content)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to update user rules")
        return {"success": True, "message": "User rules updated successfully"}
    
    @api.get("/orchestrator/api/rules/cluster")
    async def get_cluster_rules_content():
        """Get cluster rules content."""
        content = get_cluster_rules()
        return {"content": content}
    
    @api.put("/orchestrator/api/rules/cluster")
    async def update_cluster_rules_content(request: RulesUpdate):
        """Update cluster rules content."""
        success = update_cluster_rules(request.content)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to update cluster rules")
        return {"success": True, "message": "Cluster rules updated successfully"}
    
    @api.get("/orchestrator/api/kubeignore")
    async def get_kubeignore_content():
        """Get kubeignore content."""
        content = get_kubeignore()
        return {"content": content}
    
    @api.put("/orchestrator/api/kubeignore")
    async def update_kubeignore_content(request: KubeignoreUpdate):
        """Update kubeignore content."""
        success = update_kubeignore(request.content)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to update kubeignore")
        return {"success": True, "message": "Kubeignore updated successfully"}
    
    @api.get("/orchestrator/api/agents/denylist")
    async def get_agents_denylist():
        """Get agent command deny list."""
        deny_list = get_deny_list()
        return {"denyList": deny_list}
    
    @api.get("/orchestrator/api/agents/websearch")
    async def get_agents_websearch():
        """Get web search enabled setting for agents."""
        web_search = get_web_search_enabled()
        return {"web_search": web_search}
    
    @api.get("/orchestrator/api/agents/recon")
    async def get_agents_recon():
        """Get recon mode setting for agents."""
        recon_mode = get_recon_mode()
        return {"recon": recon_mode}
    
    # Additional cluster configuration endpoints
    @api.get("/orchestrator/api/clusters")
    async def get_all_clusters():
        """Get all cluster configurations."""
        additional_config = get_additional_config()
        clusters = additional_config.get("clusters", {})
        return {"clusters": clusters}
    
    @api.get("/orchestrator/api/clusters/{cluster_name}")
    async def get_cluster_configuration(cluster_name: str):
        """Get configuration for a specific cluster."""
        cluster_config = get_cluster_config(cluster_name)
        if not cluster_config:
            raise HTTPException(status_code=404, detail=f"Cluster '{cluster_name}' configuration not found")
        return {"cluster_name": cluster_name, "config": cluster_config}
    
    @api.put("/orchestrator/api/clusters/{cluster_name}")
    async def set_cluster_configuration(cluster_name: str, request: ClusterConfigUpdate):
        """Add or update configuration for a specific cluster."""
        try:
            success = update_cluster_config(cluster_name, request.config)
            if not success:
                raise HTTPException(status_code=500, detail=f"Failed to update configuration for cluster '{cluster_name}'")
            
            return {
                "success": True,
                "message": f"Configuration for cluster '{cluster_name}' updated successfully",
                "cluster_name": cluster_name
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error updating cluster configuration: {str(e)}")
    

    
    # Analytics endpoint
    @api.post("/orchestrator/api/analytics/send-event")
    async def send_analytics_event(request: AnalyticsEventRequest):
        """Send analytics event to AgentKube server."""
        try:
            success = send_event(request.event, request.properties)
            if success:
                return {"success": True, "message": "Event sent successfully"}
            else:
                raise HTTPException(status_code=500, detail="Failed to send analytics event")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error sending analytics event: {str(e)}")
    
    # Setup OAuth2 authentication routes
    auth_router = APIRouter()
    setup_auth_routes(auth_router)
    api.include_router(auth_router)
        
    return api