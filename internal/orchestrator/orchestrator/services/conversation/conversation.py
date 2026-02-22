from sqlalchemy.orm import Session
from orchestrator.db.models.conversation import Conversation, Message
from typing import List, Optional
import uuid
from datetime import datetime

class ConversationService:
    """Service for handling conversation-related database operations."""

    @staticmethod
    def create_conversation(db: Session, title: Optional[str] = None) -> Conversation:
        """Create a new conversation.
        
        Args:
            db: Database session
            title: Optional title for the conversation
            
        Returns:
            Newly created conversation
        """
        conversation = Conversation(
            id=str(uuid.uuid4()),
            title=title or "New Conversation"
        )
        db.add(conversation)
        db.commit()
        db.refresh(conversation)
        return conversation

    @staticmethod
    def get_conversation(db: Session, conversation_id: str) -> Optional[Conversation]:
        """Get a conversation by ID.
        
        Args:
            db: Database session
            conversation_id: ID of the conversation
            
        Returns:
            Conversation if found, None otherwise
        """
        return db.query(Conversation).filter(
            Conversation.id == conversation_id,
            Conversation.is_deleted == False
        ).first()

    @staticmethod
    def list_conversations(db: Session, skip: int = 0, limit: int = 100) -> List[Conversation]:
        """List conversations.
        
        Args:
            db: Database session
            skip: Number of records to skip (for pagination)
            limit: Maximum number of records to return
            
        Returns:
            List of conversations
        """
        return db.query(Conversation).filter(
            Conversation.is_deleted == False
        ).order_by(Conversation.updated_at.desc()).offset(skip).limit(limit).all()

    @staticmethod
    def update_conversation(db: Session, conversation_id: str, title: Optional[str] = None) -> Optional[Conversation]:
        """Update a conversation.
        
        Args:
            db: Database session
            conversation_id: ID of the conversation
            title: New title for the conversation
            
        Returns:
            Updated conversation if found, None otherwise
        """
        conversation = ConversationService.get_conversation(db, conversation_id)
        if not conversation:
            return None
            
        if title is not None:
            conversation.title = title
            
        conversation.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(conversation)
        return conversation

    @staticmethod
    def delete_conversation(db: Session, conversation_id: str) -> bool:
        """Soft-delete a conversation.
        
        Args:
            db: Database session
            conversation_id: ID of the conversation
            
        Returns:
            True if successful, False otherwise
        """
        conversation = ConversationService.get_conversation(db, conversation_id)
        if not conversation:
            return False
            
        conversation.is_deleted = True
        db.commit()
        return True

    @staticmethod
    def add_message(db: Session, 
                    conversation_id: str, 
                    role: str, 
                    content: str,
                    name: Optional[str] = None,
                    model: Optional[str] = None,
                    prompt: Optional[str] = None,
                    kubecontext: Optional[str] = None) -> Optional[Message]:
        """Add a message to a conversation.
        
        Args:
            db: Database session
            conversation_id: ID of the conversation
            role: Role of the message sender ("user" or "assistant")
            content: Content of the message
            name: Name of the agent (for assistant messages)
            model: Model used (for assistant messages)
            prompt: Custom prompt used (for assistant messages)
            kubecontext: Kubernetes context used
            
        Returns:
            Newly created message if successful, None otherwise
        """
        conversation = ConversationService.get_conversation(db, conversation_id)
        if not conversation:
            return None
            
        message = Message(
            id=str(uuid.uuid4()),
            conversation_id=conversation_id,
            role=role,
            content=content,
            name=name,
            model=model,
            prompt=prompt,
            kubecontext=kubecontext
        )
        
        db.add(message)
        
        # Update conversation's updated_at timestamp
        conversation.updated_at = datetime.utcnow()
        
        db.commit()
        db.refresh(message)
        return message

    @staticmethod
    def get_messages(db: Session, conversation_id: str) -> List[Message]:
        """Get all messages in a conversation.
        
        Args:
            db: Database session
            conversation_id: ID of the conversation
            
        Returns:
            List of messages
        """
        return db.query(Message).filter(
            Message.conversation_id == conversation_id
        ).order_by(Message.created_at).all()

    @staticmethod
    def get_conversation_with_messages(db: Session, conversation_id: str) -> Optional[dict]:
        """Get a conversation with all its messages.
        
        Args:
            db: Database session
            conversation_id: ID of the conversation
            
        Returns:
            Dictionary with conversation and messages if found, None otherwise
        """
        conversation = ConversationService.get_conversation(db, conversation_id)
        if not conversation:
            return None
            
        messages = ConversationService.get_messages(db, conversation_id)
        
        return {
            "conversation": conversation.to_dict(),
            "messages": [message.to_dict() for message in messages]
        }