from pydantic import BaseModel
from typing import Dict, Any

class AnalyticsEventRequest(BaseModel):
    event: str
    properties: Dict[str, Any]