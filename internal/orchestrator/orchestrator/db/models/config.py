from pydantic import BaseModel
from typing import Dict, Any

class ConfigUpdate(BaseModel):
    config: Dict[str, Any]

class McpUpdate(BaseModel):
    mcp: Dict[str, Any]

class RulesUpdate(BaseModel):
    content: str

class KubeignoreUpdate(BaseModel):
    content: str

class ClusterConfigUpdate(BaseModel):
    cluster_name: str
    config: Dict[str, Any]