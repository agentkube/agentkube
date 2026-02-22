from sqlalchemy import Column, String, Boolean, DateTime
from sqlalchemy.sql import func
from orchestrator.db.db import Base
from pydantic import BaseModel
from typing import Optional


class Model(Base):
    """SQLAlchemy Model class for AI models."""
    __tablename__ = "models"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, index=True)
    provider = Column(String, index=True)
    enabled = Column(Boolean, default=True)
    is_custom = Column(Boolean, default=True)
    premium_only = Column(Boolean, default=False)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    def to_dict(self):
        """Convert model to dictionary."""
        return {
            "id": self.id,
            "name": self.name,
            "provider": self.provider,
            "enabled": self.enabled,
            "isCustom": self.is_custom,
            "premiumOnly": self.premium_only,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None
        }


# Pydantic models for API request/response validation
class ModelCreate(BaseModel):
    id: str
    name: str
    provider: str
    enabled: bool = True
    premium_only: bool = False
    

class ModelUpdate(BaseModel):
    name: Optional[str] = None
    provider: Optional[str] = None
    enabled: Optional[bool] = None
    premium_only: Optional[bool] = None


class ModelResponse(BaseModel):
    id: str
    name: str
    provider: str
    enabled: bool
    isCustom: bool
    premiumOnly: bool