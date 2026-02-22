from pydantic import BaseModel
from typing import Optional, List, Dict


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str
    name: Optional[str] = None 

class ChatRequest(BaseModel):
    message: str
    chat_history: Optional[List[ChatMessage]] = []
    model: Optional[str] = None
    kubecontext: Optional[str] = None
    kubeconfig: Optional[str] = None
    prompt: Optional[str] = None
    files: Optional[List[Dict[str, str]]] = None
    auto_approve: Optional[bool] = False  # Auto-approve all tool executions
    reasoning_effort: Optional[str] = "medium"  # Reasoning effort for o1/o3 models: low, medium, high
    session_id: Optional[str] = None  # OpenCode-style session ID - if provided, continues existing session
    
class CompletionRequest(BaseModel):
    message: str  
    conversation_id: Optional[str] = None  # Optional - if not provided, a new conversation is created
    model: Optional[str] = None
    kubecontext: Optional[str] = None
    prompt: Optional[str] = None
    files: Optional[List[Dict[str, str]]] = None 
    
    
class VulnerabilityContext(BaseModel):
    severity: Optional[str] = None
    description: Optional[str] = None
    code_snippet: Optional[str] = None

class SecurityChatRequest(BaseModel):
    vulnerability_context: Optional[VulnerabilityContext] = None
    manifest_content: str
    model: Optional[str] = None