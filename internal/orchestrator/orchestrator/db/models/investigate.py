# orchestrator/db/models/investigate.py
from pydantic import BaseModel
from typing import Optional, Dict, List, Any
from sqlalchemy import Column, String, JSON, DateTime, Boolean
from sqlalchemy.sql import func
from orchestrator.db.db import Base

class InvestigationTask(Base):
    """SQLAlchemy model for storing investigation tasks in database."""
    __tablename__ = "investigation_tasks"

    id = Column(String, primary_key=True, index=True)
    task_id = Column(String, index=True, nullable=False)
    prompt = Column(String, nullable=False)
    context = Column(JSON)  # Dict[str, Any]
    model = Column(String, default="openai/gpt-4o-mini")
    resource_context = Column(JSON)  # List[Dict[str, str]]
    log_context = Column(JSON)  # List[Dict[str, str]]
    
    # User action fields
    resolved = Column(String, default="no")
    
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    def to_dict(self):
        """Convert investigation task to dictionary."""
        return {
            "id": self.id,
            "task_id": self.task_id,
            "prompt": self.prompt,
            "context": self.context or {},
            "model": self.model,
            "resource_context": self.resource_context or [],
            "log_context": self.log_context or [],
            "resolved": "yes" if self.resolved in ("yes", 1, "1", True, "true", "True") else "no",
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }


class InvestigationTaskRequest(BaseModel):
    """
    Pydantic model for API request validation.
    
    """
    prompt: str
    context: Dict[str, Any]  
    model: Optional[str] = "openai/gpt-4o-mini"
    resource_context: Optional[List[Dict[str, str]]] = None  # [{"resource_name": "pod-name", "resource_content": "yaml-content"}]
    log_context: Optional[List[Dict[str, str]]] = None  # [{"log_name": "app-container", "log_content": "log-content"}]


# =============================================================================
# Critique Agent Models
# =============================================================================

class CritiqueIssue(BaseModel):
    """Individual issue found during critique."""
    type: str  # evidence_gap, logic_error, safety_concern, incomplete, hallucination
    severity: str  # high, medium, low
    description: str
    suggestion: str


class CritiqueResponse(BaseModel):
    """Structured response from the Critique Agent."""
    approved: bool  # True if investigation is accurate, complete, and safe
    critique_summary: str
    issues: List[CritiqueIssue] = []
    strengths: List[str] = []
    missing_investigations: List[str] = []
    remediation_safe: bool = True
    refinement_guidance: str = ""


# =============================================================================
# Confidence Agent Models
# =============================================================================

class AffectedResource(BaseModel):
    """Resource affected by the incident."""
    type: str  # pod, service, deployment, etc.
    name: str
    namespace: str


class TimeAnalysis(BaseModel):
    """Time analysis of the incident."""
    first_occurrence: str  # ISO 8601 timestamp
    last_occurrence: str  # ISO 8601 timestamp
    duration_seconds: int
    is_ongoing: bool


class ConfidenceFactors(BaseModel):
    """Factors contributing to confidence score."""
    evidence_sources: int
    corroborating_evidence: bool
    root_cause_verified: bool
    remediation_tested: bool = False


class ConfidenceResponse(BaseModel):
    """Structured response from the Confidence Agent."""
    confidence: int  # 0-100
    matched_pattern: Optional[str] = None  # OOMKilled, CrashLoopBackOff, etc.
    impacted_since: str  # ISO 8601 timestamp
    last_seen: str  # ISO 8601 timestamp
    services_affected: int
    affected_resources: List[AffectedResource] = []
    impact_severity: str  # high, medium, low
    confidence_factors: Optional[ConfidenceFactors] = None
    time_analysis: Optional[TimeAnalysis] = None

# If Needed 
# Issues (Investigation Context)
# Evidence table for gathered data

"""
🏗️ Architecture Components Needed
1. Core Models & Data Structures

InvestigationTaskRequest - Input validation model
InvestigationTaskResult - Response model
Issue - Investigation context object
Database models for issues and evidence storage

2. Investigation Engine

IssueInvestigator - Main AI investigation orchestrator
Agentic loop with iterative tool calling
Context management and safeguards

3. API Layer

/orchestrator/api/investigate endpoint
/orchestrator/api/stream/investigate (streaming version)
Request/response handling


API Routes
python# routes/investigate.py
@router.post("/orchestrator/api/investigate")
async def investigate_endpoint(request: InvestigationTaskRequest) -> InvestigationTaskResult

@router.post("/orchestrator/api/stream/investigate") 
async def investigate_stream_endpoint(request: InvestigationTaskRequest) -> StreamingResponse

OpenAI Agents Integration

Use Agent class with Kubernetes/ArgoCD/Helm tools
Enable parallel tool execution via ModelSettings
Implement streaming responses for real-time investigation updates

Investigation Flow

Context Gathering → Retrieve issue data, fetch instructions
Agent Creation → Configure with tools and investigation prompts
Agentic Loop → Iterative AI reasoning + tool calling
Result Processing → Structure analysis into sections
Response → Return comprehensive investigation result

Iterative Investigation with Feedback
The agentic loop enables the AI to:

Analyze the current situation
Decide which tools to call
Execute tools in parallel
Process results and update context
Continue investigating or provide final analysis

How the Agentic Loop Works in Detail
AI Reasoning Phase
The OpenAI Agent analyzes the situation and decides:

What information is needed
Which tools to call first
What hypothesis to test

3. Tool Selection & Parallel Execution
4. Result Analysis & Context Update
The agent receives all tool results and updates its understanding

5. Hypothesis Formation
Based on results, the AI forms hypotheses:

"The pod is failing due to image pull issues"
"Database connectivity might be a secondary issue"
"Let me investigate the image configuration"

Five Whys Analysis
The AI applies the five whys methodology:
Why 1: Why is the pod crashing?
→ Image pull failure and database connection issues
Why 2: Why is the image pull failing?
→ Invalid image tag specified
Why 3: Why was an invalid tag used?
→ Helm values contain incorrect image version
Why 4: Why are the Helm values incorrect?
→ Recent deployment used wrong configuration
Why 5: Why was wrong configuration deployed?
→ CI/CD pipeline lacks validation for image tags

Final Analysis & Recommendations
After multiple iterations, the agent provides:

Root cause identification
Detailed analysis
Actionable recommendations


Requirement need a ToolCallTracker, AgenticLoopManager class

"""