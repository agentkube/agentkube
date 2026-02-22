
from pydantic import BaseModel

# HITL Pydantic models
class HITLDecisionRequest(BaseModel):
    request_id: str
    approved: bool

class HITLToggleRequest(BaseModel):
    enabled: bool