"""
Pydantic models for the models.dev-backed API.

No more SQLAlchemy Model — all data comes from models.dev + settings.json.
"""

from pydantic import BaseModel
from typing import List, Optional, Dict, Any


# ── Request models ──

class EnableModelRequest(BaseModel):
    """Request to enable a model."""
    provider_id: str
    model_id: str


class DisableModelRequest(BaseModel):
    """Request to disable a model."""
    provider_id: str
    model_id: str


class ConnectProviderRequest(BaseModel):
    """Request to connect a provider with API key."""
    provider_id: str
    api_key: str
    base_url: Optional[str] = None
    endpoint: Optional[str] = None  # For local providers like Ollama


class DisconnectProviderRequest(BaseModel):
    """Request to disconnect a provider."""
    provider_id: str


# ── Response models ──

class CostResponse(BaseModel):
    """Model cost per million tokens."""
    input: float = 0.0
    output: float = 0.0
    cache_read: float = 0.0
    cache_write: float = 0.0


class LimitResponse(BaseModel):
    """Model token limits."""
    context: int = 0
    input: int = 0
    output: int = 0


class ModalitiesResponse(BaseModel):
    """Model input/output modalities."""
    input: List[str] = ["text"]
    output: List[str] = ["text"]


class ModelResponse(BaseModel):
    """Single model from the models.dev catalog."""
    id: str
    name: str
    provider_id: str = ""
    full_id: str = ""
    family: str = ""
    attachment: bool = False
    reasoning: bool = False
    tool_call: bool = False
    temperature: bool = True
    knowledge: str = ""
    release_date: str = ""
    last_updated: str = ""
    modalities: ModalitiesResponse = ModalitiesResponse()
    open_weights: bool = False
    cost: CostResponse = CostResponse()
    limit: LimitResponse = LimitResponse()
    status: str = ""
    structured_output: bool = False
    enabled: bool = False


class ProviderResponse(BaseModel):
    """Provider info from models.dev."""
    id: str
    name: str
    env: List[str] = []
    api: str = ""
    doc: str = ""
    logo_url: str = ""
    model_count: int = 0
    connected: bool = False


class ProviderDetailResponse(BaseModel):
    """Provider with its models."""
    id: str
    name: str
    env: List[str] = []
    api: str = ""
    doc: str = ""
    logo_url: str = ""
    model_count: int = 0
    connected: bool = False
    models: Dict[str, ModelResponse] = {}


class ProviderStatusResponse(BaseModel):
    """Aggregated provider connection status."""
    statuses: Dict[str, bool] = {}