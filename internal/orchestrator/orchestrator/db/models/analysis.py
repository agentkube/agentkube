from pydantic import BaseModel
from typing import Optional, Dict, Any


class LogAnalysisRequest(BaseModel):
    logs: str
    pod_name: str
    namespace: str
    container_name: str
    cluster_name: str
    model: Optional[str] = "openai/gpt-4o-mini"
    kubecontext: Optional[str] = None
    pod_yaml: Optional[str] = None  # Optional YAML configuration for more precise analysis


class EventAnalysisRequest(BaseModel):
    event: Dict[str, Any]  # Kubernetes event object
    cluster_name: str
    model: Optional[str] = "openai/gpt-4o-mini"
    kubecontext: Optional[str] = None
    resource_yaml: Optional[str] = None  # Optional YAML configuration for more precise analysis