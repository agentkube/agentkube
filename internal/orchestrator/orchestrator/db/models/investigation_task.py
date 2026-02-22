from pydantic import BaseModel

class SubTaskSchema(BaseModel):
    subject: str
    status: int
    reason: str
    goal: str
    discovery: str  

class ImpactSchema(BaseModel):
  impact_duration: int
  service_affected: int
  impacted_since: int
  
class SupervisorResponseSchema(BaseModel):
  summary: str
  remediation: str
  impact: ImpactSchema    


    
