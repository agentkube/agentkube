from pydantic import BaseModel
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from datetime import datetime
from typing import Optional

from orchestrator.db.db import Base

def generate_uuid():
    return str(uuid.uuid4())

class ConversationCreate(BaseModel):
    title: Optional[str] = "New Conversation"

class ConversationUpdate(BaseModel):
    title: str

class Conversation(Base):
    """Model for storing conversations."""
    __tablename__ = "conversations"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    title = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_deleted = Column(Boolean, default=False)

    # Relationship with messages
    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan")

    def to_dict(self):
        """Convert conversation to dictionary."""
        return {
            "id": self.id,
            "title": self.title,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "message_count": len(self.messages) if self.messages else 0,
        }

class Message(Base):
    """Model for storing messages in a conversation."""
    __tablename__ = "messages"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    conversation_id = Column(String(36), ForeignKey("conversations.id"), nullable=False)
    role = Column(String(50), nullable=False)  # "user" or "assistant"
    content = Column(Text, nullable=False)
    name = Column(String(100), nullable=True)  # For agent name if applicable
    created_at = Column(DateTime, default=datetime.utcnow)
    model = Column(String(100), nullable=True)  # Model used for assistant responses
    prompt = Column(Text, nullable=True)  # Custom prompt used, if any
    kubecontext = Column(String(100), nullable=True)  # Kubernetes context used, if any

    # Relationship with conversation
    conversation = relationship("Conversation", back_populates="messages")

    def to_dict(self):
        """Convert message to dictionary."""
        return {
            "id": self.id,
            "conversation_id": self.conversation_id,
            "role": self.role,
            "content": self.content,
            "name": self.name,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "model": self.model,
            "kubecontext": self.kubecontext
        }