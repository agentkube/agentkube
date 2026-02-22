#-------------------------------------------------------------------------------------#
# Session Management - OpenCode-style session handling
# Provides persistent session storage with unique IDs, message history, and metadata
# Based on SST/OpenCode session implementation patterns
#-------------------------------------------------------------------------------------#

import json
import uuid
import datetime
import asyncio
from pathlib import Path
from typing import Dict, Any, Optional, List, Literal
from dataclasses import dataclass, field, asdict
from enum import Enum

# ============================================================================
# Storage Configuration - OpenCode style storage in ~/.agentkube/
# ============================================================================

AGENTKUBE_DIR = Path.home() / ".agentkube"
STORAGE_DIR = AGENTKUBE_DIR / "storage"
SESSION_STORAGE_DIR = STORAGE_DIR / "session"
MESSAGE_STORAGE_DIR = STORAGE_DIR / "message"
TODO_STORAGE_DIR = STORAGE_DIR / "todo"

def ensure_storage_dirs():
    """Ensure all storage directories exist."""
    SESSION_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    MESSAGE_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    TODO_STORAGE_DIR.mkdir(parents=True, exist_ok=True)

# ============================================================================
# Session Info - OpenCode style session metadata
# ============================================================================

class SessionStatus(str, Enum):
    """Session status states."""
    IDLE = "idle"
    BUSY = "busy"
    COMPLETED = "completed"

@dataclass
class SessionTime:
    """Session time metadata."""
    created: float  # Unix timestamp
    updated: float  # Unix timestamp
    
    def to_dict(self) -> Dict[str, float]:
        return {"created": self.created, "updated": self.updated}
    
    @classmethod
    def from_dict(cls, data: Dict[str, float]) -> "SessionTime":
        return cls(created=data.get("created", 0), updated=data.get("updated", 0))

@dataclass
class SessionInfo:
    """
    Session information schema - OpenCode style.
    
    Fields:
        id: Unique session identifier (UUID)
        title: Human-readable session title (auto-generated or user-defined)
        directory: Working directory for the session
        status: Current session status (idle, busy, completed)
        time: Creation and update timestamps
        parent_id: Parent session ID for branched sessions (optional)
        summary: Session summary (optional, generated after completion)
        model: Model used for this session
        message_count: Number of messages in this session
    """
    id: str
    title: str
    directory: str
    status: SessionStatus
    time: SessionTime
    parent_id: Optional[str] = None
    summary: Optional[str] = None
    model: Optional[str] = None
    message_count: int = 0
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "directory": self.directory,
            "status": self.status.value,
            "time": self.time.to_dict(),
            "parent_id": self.parent_id,
            "summary": self.summary,
            "model": self.model,
            "message_count": self.message_count
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "SessionInfo":
        return cls(
            id=data["id"],
            title=data.get("title", "Untitled Session"),
            directory=data.get("directory", str(Path.cwd())),
            status=SessionStatus(data.get("status", "idle")),
            time=SessionTime.from_dict(data.get("time", {"created": 0, "updated": 0})),
            parent_id=data.get("parent_id"),
            summary=data.get("summary"),
            model=data.get("model"),
            message_count=data.get("message_count", 0)
        )

# ============================================================================
# Message Parts - OpenCode style part types for sequential content
# ============================================================================

class PartType(str, Enum):
    """Part types that can compose a message."""
    TEXT = "text"
    REASONING = "reasoning"
    TOOL = "tool"
    FILE = "file"
    TODO = "todo"

@dataclass
class TextPart:
    """Text content part."""
    type: str = "text"
    id: str = ""
    content: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        return {"type": self.type, "id": self.id, "content": self.content}
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "TextPart":
        return cls(type="text", id=data.get("id", ""), content=data.get("content", ""))

@dataclass
class ReasoningPart:
    """Reasoning/thinking content part (for o1/o3 models)."""
    type: str = "reasoning"
    id: str = ""
    content: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        return {"type": self.type, "id": self.id, "content": self.content}
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ReasoningPart":
        return cls(type="reasoning", id=data.get("id", ""), content=data.get("content", ""))

@dataclass
class ToolPart:
    """
    Tool call part with state machine.
    
    States: pending -> running -> completed | error
    """
    type: str = "tool"
    id: str = ""  # Part ID
    call_id: str = ""  # OpenAI tool call ID
    tool_name: str = ""
    arguments: Dict[str, Any] = field(default_factory=dict)
    state: str = "pending"  # pending, running, completed, error, denied, redirected
    result: Optional[str] = None
    success: Optional[bool] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": self.type,
            "id": self.id,
            "call_id": self.call_id,
            "tool_name": self.tool_name,
            "arguments": self.arguments,
            "state": self.state,
            "result": self.result,
            "success": self.success
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ToolPart":
        return cls(
            type="tool",
            id=data.get("id", ""),
            call_id=data.get("call_id", ""),
            tool_name=data.get("tool_name", ""),
            arguments=data.get("arguments", {}),
            state=data.get("state", "pending"),
            result=data.get("result"),
            success=data.get("success")
        )

@dataclass
class TodoPart:
    """Todo item part for task tracking."""
    type: str = "todo"
    id: str = ""
    todo_id: str = ""
    content: str = ""
    status: str = "pending"  # pending, in_progress, completed, cancelled
    priority: str = "medium"  # low, medium, high
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": self.type,
            "id": self.id,
            "todo_id": self.todo_id,
            "content": self.content,
            "status": self.status,
            "priority": self.priority
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "TodoPart":
        return cls(
            type="todo",
            id=data.get("id", ""),
            todo_id=data.get("todo_id", ""),
            content=data.get("content", ""),
            status=data.get("status", "pending"),
            priority=data.get("priority", "medium")
        )

# Union type for all parts
MessagePart = TextPart | ToolPart | ReasoningPart | TodoPart

def part_from_dict(data: Dict[str, Any]) -> MessagePart:
    """Factory function to create a part from dict based on type."""
    part_type = data.get("type", "text")
    if part_type == "text":
        return TextPart.from_dict(data)
    elif part_type == "reasoning":
        return ReasoningPart.from_dict(data)
    elif part_type == "tool":
        return ToolPart.from_dict(data)
    elif part_type == "todo":
        return TodoPart.from_dict(data)
    else:
        # Default to text part
        return TextPart.from_dict(data)

# ============================================================================
# Message - OpenCode style message structure with parts
# ============================================================================

@dataclass
class MessageInfo:
    """
    Message information for a session - OpenCode style with parts.
    
    Fields:
        id: Unique message identifier
        session_id: Parent session ID
        role: Message role (user, assistant, system)
        parts: List of message parts (text, tool, reasoning, etc.)
        time: Message timestamp
        
    The parts array maintains the sequential order of content as it was generated.
    This is crucial for proper rendering of interleaved text and tool calls.
    """
    id: str
    session_id: str
    role: Literal["user", "assistant", "system"]
    parts: List[MessagePart] = field(default_factory=list)
    time: float = 0  # Unix timestamp
    
    @property
    def content(self) -> str:
        """Get the full text content by concatenating all text parts."""
        return "".join(
            p.content for p in self.parts 
            if isinstance(p, (TextPart, ReasoningPart))
        )
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "session_id": self.session_id,
            "role": self.role,
            "parts": [p.to_dict() for p in self.parts],
            "time": self.time,
            # Include content for backward compatibility
            "content": self.content
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "MessageInfo":
        # Parse parts if present
        parts = []
        if "parts" in data and isinstance(data["parts"], list):
            parts = [part_from_dict(p) for p in data["parts"]]
        elif "content" in data and data["content"]:
            # Backward compatibility: convert old content-only messages to parts
            parts = [TextPart(id=str(uuid.uuid4()), content=data["content"])]
        
        return cls(
            id=data["id"],
            session_id=data["session_id"],
            role=data.get("role", "user"),
            parts=parts,
            time=data.get("time", 0)
        )


# ============================================================================
# Session Module - OpenCode style session operations
# ============================================================================

class Session:
    """
    Session management following OpenCode patterns.
    
    Storage structure:
        ~/.agentkube/storage/session/{session_id}.json  - Session info
        ~/.agentkube/storage/message/{session_id}/      - Messages directory
        ~/.agentkube/storage/todo/{session_id}.json     - Session todos
    """
    
    @staticmethod
    def generate_id() -> str:
        """Generate a unique session ID."""
        return str(uuid.uuid4())
    
    @staticmethod
    def get_session_file(session_id: str) -> Path:
        """Get the session file path."""
        ensure_storage_dirs()
        return SESSION_STORAGE_DIR / f"{session_id}.json"
    
    @staticmethod
    def get_messages_dir(session_id: str) -> Path:
        """Get the messages directory for a session."""
        ensure_storage_dirs()
        messages_dir = MESSAGE_STORAGE_DIR / session_id
        messages_dir.mkdir(parents=True, exist_ok=True)
        return messages_dir
    
    @staticmethod
    def get_todo_file(session_id: str) -> Path:
        """Get the todo file path for a session."""
        ensure_storage_dirs()
        return TODO_STORAGE_DIR / f"{session_id}.json"
    
    # -------------------------------------------------------------------------
    # Session CRUD Operations
    # -------------------------------------------------------------------------
    
    @classmethod
    def create(
        cls,
        title: Optional[str] = None,
        directory: Optional[str] = None,
        model: Optional[str] = None,
        parent_id: Optional[str] = None
    ) -> SessionInfo:
        """
        Create a new session.
        
        Args:
            title: Session title (auto-generated if not provided)
            directory: Working directory (defaults to cwd)
            model: Model to use for this session
            parent_id: Parent session ID for branching
            
        Returns:
            SessionInfo object for the new session
        """
        now = datetime.datetime.now().timestamp()
        session_id = cls.generate_id()
        
        # Auto-generate title if not provided
        if not title:
            title = f"Session {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}"
        
        session = SessionInfo(
            id=session_id,
            title=title,
            directory=directory or str(Path.cwd()),
            status=SessionStatus.IDLE,
            time=SessionTime(created=now, updated=now),
            parent_id=parent_id,
            model=model,
            message_count=0
        )
        
        # Save to disk
        session_file = cls.get_session_file(session_id)
        session_file.write_text(json.dumps(session.to_dict(), indent=2))
        
        return session
    
    @classmethod
    def get(cls, session_id: str) -> Optional[SessionInfo]:
        """
        Get a session by ID.
        
        Args:
            session_id: Session ID to retrieve
            
        Returns:
            SessionInfo if found, None otherwise
        """
        session_file = cls.get_session_file(session_id)
        
        if not session_file.exists():
            return None
        
        try:
            data = json.loads(session_file.read_text())
            return SessionInfo.from_dict(data)
        except (json.JSONDecodeError, KeyError):
            return None
    
    @classmethod
    def update(
        cls,
        session_id: str,
        title: Optional[str] = None,
        status: Optional[SessionStatus] = None,
        summary: Optional[str] = None,
        model: Optional[str] = None
    ) -> Optional[SessionInfo]:
        """
        Update a session's metadata.
        
        Args:
            session_id: Session ID to update
            title: New title (optional)
            status: New status (optional)
            summary: New summary (optional)
            model: New model (optional)
            
        Returns:
            Updated SessionInfo if found, None otherwise
        """
        session = cls.get(session_id)
        if not session:
            return None
        
        # Update fields if provided
        if title is not None:
            session.title = title
        if status is not None:
            session.status = status
        if summary is not None:
            session.summary = summary
        if model is not None:
            session.model = model
        
        # Update timestamp
        session.time.updated = datetime.datetime.now().timestamp()
        
        # Save to disk
        session_file = cls.get_session_file(session_id)
        session_file.write_text(json.dumps(session.to_dict(), indent=2))
        
        return session
    
    @classmethod
    def delete(cls, session_id: str) -> bool:
        """
        Delete a session and all associated data.
        
        Args:
            session_id: Session ID to delete
            
        Returns:
            True if deleted, False if not found
        """
        session_file = cls.get_session_file(session_id)
        
        if not session_file.exists():
            return False
        
        # Delete session file
        session_file.unlink()
        
        # Delete messages directory
        messages_dir = cls.get_messages_dir(session_id)
        if messages_dir.exists():
            for msg_file in messages_dir.glob("*.json"):
                msg_file.unlink()
            messages_dir.rmdir()
        
        # Delete todo file
        todo_file = cls.get_todo_file(session_id)
        if todo_file.exists():
            todo_file.unlink()
        
        return True
    
    @classmethod
    def list(cls, limit: int = 50) -> List[SessionInfo]:
        """
        List all sessions, sorted by last updated.
        
        Args:
            limit: Maximum number of sessions to return
            
        Returns:
            List of SessionInfo objects
        """
        ensure_storage_dirs()
        sessions = []
        
        for session_file in SESSION_STORAGE_DIR.glob("*.json"):
            try:
                data = json.loads(session_file.read_text())
                sessions.append(SessionInfo.from_dict(data))
            except (json.JSONDecodeError, KeyError):
                continue
        
        # Sort by updated time (most recent first)
        sessions.sort(key=lambda s: s.time.updated, reverse=True)
        
        return sessions[:limit]
    
    # -------------------------------------------------------------------------
    # Session Status Operations
    # -------------------------------------------------------------------------
    
    @classmethod
    def set_busy(cls, session_id: str) -> Optional[SessionInfo]:
        """Mark a session as busy (processing)."""
        return cls.update(session_id, status=SessionStatus.BUSY)
    
    @classmethod
    def set_idle(cls, session_id: str) -> Optional[SessionInfo]:
        """Mark a session as idle."""
        return cls.update(session_id, status=SessionStatus.IDLE)
    
    @classmethod
    def set_completed(cls, session_id: str) -> Optional[SessionInfo]:
        """Mark a session as completed."""
        return cls.update(session_id, status=SessionStatus.COMPLETED)
    
    # -------------------------------------------------------------------------
    # Message Operations
    # -------------------------------------------------------------------------
    
    @classmethod
    def add_message(
        cls,
        session_id: str,
        role: Literal["user", "assistant", "system"],
        content: str,
        parts: Optional[List[MessagePart]] = None
    ) -> Optional[MessageInfo]:
        """
        Add a message to a session.
        
        Args:
            session_id: Session ID
            role: Message role
            content: Message content (for backward compatibility, will be converted to TextPart)
            parts: Optional list of parts (if provided, content is ignored)
            
        Returns:
            MessageInfo if successful, None if session not found
        """
        session = cls.get(session_id)
        if not session:
            return None
        
        message_id = str(uuid.uuid4())
        now = datetime.datetime.now().timestamp()
        
        # Use parts if provided, otherwise convert content to a TextPart
        if parts:
            message_parts = parts
        else:
            message_parts = [TextPart(id=str(uuid.uuid4()), content=content)] if content else []
        
        message = MessageInfo(
            id=message_id,
            session_id=session_id,
            role=role,
            parts=message_parts,
            time=now
        )
        
        # Save message
        messages_dir = cls.get_messages_dir(session_id)
        message_file = messages_dir / f"{message_id}.json"
        message_file.write_text(json.dumps(message.to_dict(), indent=2))
        
        # Update session message count
        session.message_count += 1
        session.time.updated = now
        session_file = cls.get_session_file(session_id)
        session_file.write_text(json.dumps(session.to_dict(), indent=2))
        
        return message
    
    @classmethod
    def create_message(
        cls,
        session_id: str,
        role: Literal["user", "assistant", "system"]
    ) -> Optional[MessageInfo]:
        """
        Create an empty message that can have parts added to it.
        
        This is used for streaming - create the message first, then add parts.
        
        Args:
            session_id: Session ID
            role: Message role
            
        Returns:
            MessageInfo if successful, None if session not found
        """
        session = cls.get(session_id)
        if not session:
            return None
        
        message_id = str(uuid.uuid4())
        now = datetime.datetime.now().timestamp()
        
        message = MessageInfo(
            id=message_id,
            session_id=session_id,
            role=role,
            parts=[],
            time=now
        )
        
        # Save message
        messages_dir = cls.get_messages_dir(session_id)
        message_file = messages_dir / f"{message_id}.json"
        message_file.write_text(json.dumps(message.to_dict(), indent=2))
        
        # Update session message count
        session.message_count += 1
        session.time.updated = now
        session_file = cls.get_session_file(session_id)
        session_file.write_text(json.dumps(session.to_dict(), indent=2))
        
        return message
    
    @classmethod
    def get_message(cls, session_id: str, message_id: str) -> Optional[MessageInfo]:
        """
        Get a specific message by ID.
        
        Args:
            session_id: Session ID
            message_id: Message ID
            
        Returns:
            MessageInfo if found, None otherwise
        """
        messages_dir = cls.get_messages_dir(session_id)
        message_file = messages_dir / f"{message_id}.json"
        
        if not message_file.exists():
            return None
        
        try:
            data = json.loads(message_file.read_text())
            return MessageInfo.from_dict(data)
        except (json.JSONDecodeError, KeyError):
            return None
    
    @classmethod
    def add_part(
        cls,
        session_id: str,
        message_id: str,
        part: MessagePart
    ) -> Optional[MessageInfo]:
        """
        Add a part to an existing message.
        
        This appends the part to the message's parts array, maintaining order.
        Used during streaming to build messages incrementally.
        
        Args:
            session_id: Session ID
            message_id: Message ID
            part: The part to add
            
        Returns:
            Updated MessageInfo if successful, None otherwise
        """
        message = cls.get_message(session_id, message_id)
        if not message:
            return None
        
        # Add part to the message
        message.parts.append(part)
        
        # Save updated message
        messages_dir = cls.get_messages_dir(session_id)
        message_file = messages_dir / f"{message_id}.json"
        message_file.write_text(json.dumps(message.to_dict(), indent=2))
        
        return message
    
    @classmethod
    def update_part(
        cls,
        session_id: str,
        message_id: str,
        part_id: str,
        updates: Dict[str, Any]
    ) -> Optional[MessageInfo]:
        """
        Update a specific part within a message.
        
        This is used to update tool call results, change state, etc.
        
        Args:
            session_id: Session ID
            message_id: Message ID
            part_id: Part ID to update
            updates: Dictionary of fields to update
            
        Returns:
            Updated MessageInfo if successful, None otherwise
        """
        message = cls.get_message(session_id, message_id)
        if not message:
            return None
        
        # Find and update the part
        for i, part in enumerate(message.parts):
            if part.id == part_id:
                # Apply updates based on part type
                if isinstance(part, ToolPart):
                    if "state" in updates:
                        part.state = updates["state"]
                    if "result" in updates:
                        part.result = updates["result"]
                    if "success" in updates:
                        part.success = updates["success"]
                elif isinstance(part, (TextPart, ReasoningPart)):
                    if "content" in updates:
                        part.content = updates["content"]
                elif isinstance(part, TodoPart):
                    if "status" in updates:
                        part.status = updates["status"]
                    if "content" in updates:
                        part.content = updates["content"]
                break
        
        # Save updated message
        messages_dir = cls.get_messages_dir(session_id)
        message_file = messages_dir / f"{message_id}.json"
        message_file.write_text(json.dumps(message.to_dict(), indent=2))
        
        return message
    
    @classmethod
    def append_to_text_part(
        cls,
        session_id: str,
        message_id: str,
        part_id: str,
        delta: str
    ) -> Optional[MessageInfo]:
        """
        Append text to an existing TextPart or ReasoningPart.
        
        Used for streaming text content - appends delta to existing content.
        
        Args:
            session_id: Session ID
            message_id: Message ID
            part_id: Part ID to append to
            delta: Text to append
            
        Returns:
            Updated MessageInfo if successful, None otherwise
        """
        message = cls.get_message(session_id, message_id)
        if not message:
            return None
        
        # Find and update the part
        for part in message.parts:
            if part.id == part_id and isinstance(part, (TextPart, ReasoningPart)):
                part.content += delta
                break
        
        # Save updated message
        messages_dir = cls.get_messages_dir(session_id)
        message_file = messages_dir / f"{message_id}.json"
        message_file.write_text(json.dumps(message.to_dict(), indent=2))
        
        return message
    
    @classmethod
    def get_messages(cls, session_id: str, limit: int = 100) -> List[MessageInfo]:
        """
        Get messages for a session.
        
        Args:
            session_id: Session ID
            limit: Maximum messages to return
            
        Returns:
            List of MessageInfo objects, sorted by time
        """
        messages_dir = cls.get_messages_dir(session_id)
        messages = []
        
        for msg_file in messages_dir.glob("*.json"):
            try:
                data = json.loads(msg_file.read_text())
                messages.append(MessageInfo.from_dict(data))
            except (json.JSONDecodeError, KeyError):
                continue
        
        # Sort by time (oldest first)
        messages.sort(key=lambda m: m.time)
        
        return messages[:limit]
    
    @classmethod
    def get_todos(cls, session_id: str) -> List[Dict[str, Any]]:
        """
        Get all todos for a session.
        
        Args:
            session_id: Session ID
            
        Returns:
            List of todo items
        """
        todo_file = cls.get_todo_file(session_id)
        
        if not todo_file.exists():
            return []
        
        try:
            data = json.loads(todo_file.read_text())
            # Handle both list format and dict format (compatibility)
            if isinstance(data, list):
                return data
            elif isinstance(data, dict) and "todos" in data:
                return data["todos"]
            else:
                return []
        except (json.JSONDecodeError, KeyError):
            return []

# ============================================================================
# Global Session State - In-memory cache for active sessions
# ============================================================================

# Active session states (keyed by session_id)
ACTIVE_SESSIONS: Dict[str, SessionInfo] = {}

# Session abort controllers (keyed by session_id)
SESSION_ABORT_SIGNALS: Dict[str, asyncio.Event] = {}

def get_or_create_session(
    session_id: Optional[str] = None,
    title: Optional[str] = None,
    model: Optional[str] = None
) -> SessionInfo:
    """
    Get an existing session or create a new one.
    
    Args:
        session_id: Existing session ID (optional)
        title: Session title for new sessions
        model: Model for new sessions
        
    Returns:
        SessionInfo object
    """
    if session_id:
        # Try to get existing session
        session = Session.get(session_id)
        if session:
            # Cache in memory
            ACTIVE_SESSIONS[session_id] = session
            return session
    
    # Create new session
    session = Session.create(title=title, model=model)
    ACTIVE_SESSIONS[session.id] = session
    
    # Create abort signal for this session
    SESSION_ABORT_SIGNALS[session.id] = asyncio.Event()
    
    return session

def cleanup_session_state(session_id: str) -> None:
    """
    Clean up in-memory session state.
    
    Args:
        session_id: Session ID to clean up
    """
    if session_id in ACTIVE_SESSIONS:
        del ACTIVE_SESSIONS[session_id]
    
    if session_id in SESSION_ABORT_SIGNALS:
        del SESSION_ABORT_SIGNALS[session_id]
