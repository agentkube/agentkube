from sqlalchemy import Column, String, JSON, DateTime, Integer, Boolean
from sqlalchemy.sql import func
from orchestrator.db.db import Base
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from enum import Enum


class TaskStatus(str, Enum):
    CANCELLED = "cancelled"
    PROCESSED = "processed"
    COMPLETED = "completed"


class SubTaskStatus(str, Enum):
    ISSUES_FOUND = "issues_found"
    NO_ISSUES = "no_issues"


class Task(Base):
    """SQLAlchemy Task model for storing task information."""
    __tablename__ = "tasks"

    id = Column(String, primary_key=True, index=True)
    task_id = Column(String, index=True, nullable=False)
    title = Column(String, nullable=False)
    tags = Column(JSON)  # List of strings
    severity = Column(String)
    
    # TODO: Add these fields for better past_investigation filtering:
    # resource_name = Column(String, index=True)  # e.g., "debug-app", "payment-service"
    # resource_type = Column(String, index=True)  # e.g., "pod", "deployment", "node"
    # namespace = Column(String, index=True)      # e.g., "production", "api-app"
    # cluster_context = Column(String)            # e.g., "kind-milo", "prod-cluster"
    duration = Column(Integer)  # Duration in seconds
    status = Column(String, default=TaskStatus.PROCESSED)
    
    # Impact fields
    impact_duration = Column(Integer, default=0)  # Duration in seconds
    service_affected = Column(Integer, default=0)  # Number of services affected
    impacted_since = Column(Integer, default=0)  # Time since impact started (in seconds)
    
    # Sub-tasks stored as JSON
    sub_tasks = Column(JSON, default=list)  # List of sub-task objects
    
    # Events stored as JSON
    events = Column(JSON, default=list)  # List of event objects
    
    # Investigation results stored as markdown
    summary = Column(String)  # Markdown content with impact, cause, affected resources, root cause analysis
    remediation = Column(String)  # Markdown content with remediation suggestions

    # KGroot-specific fields for structured root cause analysis
    fault_propagation_graph = Column(JSON)  # {"nodes": [...], "edges": [...], "root_causes": [...]}
    matched_pattern = Column(String)  # e.g., "CPU Overload Pattern"
    pattern_confidence = Column(Integer)  # e.g., 92 (percentage as integer)
    propagation_chain = Column(JSON)  # ["CPU_SPIKE", "MEMORY_PRESSURE", "OOM_KILLED", "POD_CRASH"]
    
    # User action fields
    resolved = Column(String, default="no")  # Whether the task has been marked as resolved by user

    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    def to_dict(self):
        """Convert task to dictionary."""
        return {
            "id": self.id,
            "task_id": self.task_id,
            "title": self.title,
            "tags": self.tags or [],
            "severity": self.severity,
            "duration": self.duration,
            "status": self.status,
            "impact": {
                "impact_duration": self.impact_duration,
                "service_affected": self.service_affected,
                "impacted_since": self.impacted_since
            },
            "sub_tasks": self.sub_tasks or [],
            "events": self.events or [],
            "summary": self.summary,
            "remediation": self.remediation,
            "fault_propagation_graph": self.fault_propagation_graph,
            "matched_pattern": self.matched_pattern,
            "pattern_confidence": self.pattern_confidence,
            "propagation_chain": self.propagation_chain or [],
            "resolved": "yes" if self.resolved in ("yes", 1, "1", True, "true", "True") else "no",
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }


class AgentTask(Base):
    """
    Granular task for the Agentic Workflow.
    Linked to a specific parent task_id.
    """
    __tablename__ = "agent_tasks"

    id = Column(String, primary_key=True, index=True)
    task_id = Column(String, index=True, nullable=False) # The parent task this belongs to
    content = Column(String, nullable=False)
    type = Column(String, nullable=False) # "collection", "analysis", "validation", "remediation"
    priority = Column(Integer, default=5)  # 1-10
    status = Column(String, default="pending")  # "pending", "in_progress", "completed", "cancelled"
    assigned_to = Column(String)
    
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    def to_dict(self):
        return {
            "id": self.id,
            "task_id": self.task_id,
            "content": self.content,
            "type": self.type,
            "priority": self.priority,
            "status": self.status,
            "assigned_to": self.assigned_to,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }


# Pydantic models for API request/response validation
class ImpactModel(BaseModel):
    impact_duration: int = 0
    service_affected: int = 0
    impacted_since: int = 0


class ToolUsed(BaseModel):
    tool_name: str
    output: str
    arguments: dict = {}
    call_id: Optional[str] = None

class SubTaskModel(BaseModel):
    subject: str
    status: int = 0  # number of issues found
    reason: str  # title
    goal: str
    plan: List[ToolUsed] = []  # array of tools used with their outputs
    discovery: str


class EventModel(BaseModel):
    source: str
    subject: str
    reason: str  # PR MERGED/APPLICATION DEPLOYMENT/ERROR RATE SPIKED/etc
    timestamp: datetime
    analysis: Optional[str] = None  # markdown content with charts and explanation
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class TaskCreate(BaseModel):
    task_id: str
    title: str
    tags: Optional[List[str]] = []
    severity: Optional[str] = None
    duration: Optional[int] = None
    status: TaskStatus = TaskStatus.PROCESSED
    impact: Optional[ImpactModel] = None
    sub_tasks: Optional[List[SubTaskModel]] = []
    events: Optional[List[EventModel]] = []
    summary: Optional[str] = None
    remediation: Optional[str] = None


class TaskUpdate(BaseModel):
    task_id: Optional[str] = None
    title: Optional[str] = None
    tags: Optional[List[str]] = None
    severity: Optional[str] = None
    duration: Optional[int] = None
    status: Optional[TaskStatus] = None
    impact: Optional[ImpactModel] = None
    sub_tasks: Optional[List[SubTaskModel]] = None
    events: Optional[List[EventModel]] = None
    summary: Optional[str] = None
    remediation: Optional[str] = None
    resolved: Optional[str] = None  # "yes" or "no"


class TaskResponse(BaseModel):
    id: str
    task_id: str
    title: str
    tags: List[str]
    severity: Optional[str]
    duration: Optional[int]
    status: TaskStatus
    impact: ImpactModel
    sub_tasks: List[SubTaskModel]
    events: List[EventModel]
    summary: Optional[str]
    remediation: Optional[str]
    resolved: str = "no"  # "yes" or "no"
    created_at: Optional[str]
    updated_at: Optional[str]


class TaskPatchRequest(BaseModel):
    """Request body for PATCH /tasks/{task_id}"""
    resolved: Optional[str] = None  # "yes" or "no"