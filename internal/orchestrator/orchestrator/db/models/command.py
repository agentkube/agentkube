from pydantic import BaseModel

class ExecuteCommandRequest(BaseModel):
    command: str
    kubecontext: str

class ExecuteCommandResponse(BaseModel):
    success: bool
    command: str
    output: str
