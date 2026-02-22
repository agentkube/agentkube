from sqlalchemy.orm import Session
from orchestrator.db.models.model import Model
from typing import List, Optional, Dict, Any

class ModelService:
    """Service for handling model-related database operations."""
    
    # Default models 
    DEFAULT_MODELS = [
        {
            "id": "claude-sonnet-4",
            "name": "claude-sonnet-4",
            "provider": "anthropic",
            "enabled": True,
            "isCustom": False,
            "premiumOnly": True
        },
        {
            "id": "claude-opus-4",
            "name": "claude-opus-4",
            "provider": "anthropic",
            "enabled": True,
            "isCustom": False,
            "premiumOnly": True
        },
        {
            "id": "claude-3.7-sonnet",
            "name": "claude-3.7-sonnet",
            "provider": "anthropic",
            "enabled": True,
            "isCustom": False,
            "premiumOnly": True
        },
        {
            "id": "gpt-5",
            "name": "gpt-5",
            "provider": "openai",
            "enabled": True,
            "isCustom": False,
            "premiumOnly": False
        },
        {
            "id": "deepseek-r1",
            "name": "deepseek-r1",
            "provider": "deepseek",
            "enabled": False,
            "isCustom": False,
            "premiumOnly": True
        },
        {
            "id": "deepseek-v3",
            "name": "deepseek-v3",
            "provider": "deepseek",
            "enabled": True,
            "isCustom": False,
            "premiumOnly": False
        },
        {
            "id": "gpt-4",
            "name": "gpt-4",
            "provider": "openai",
            "enabled": True,
            "isCustom": False,
            "premiumOnly": True
        },
        {
            "id": "gpt-4o",
            "name": "gpt-4o",
            "provider": "openai",
            "enabled": False,
            "isCustom": False,
            "premiumOnly": True
        },
        {
            "id": "o4-mini",
            "name": "o4-mini",
            "provider": "openai",
            "enabled": False,
            "isCustom": False,
            "premiumOnly": True
        },
        {
            "id": "gpt-4o-mini",
            "name": "gpt-4o-mini",
            "provider": "openai",
            "enabled": True,
            "isCustom": False,
            "premiumOnly": False
        },
        {
            "id": "gpt-4.1",
            "name": "gpt-4.1",
            "provider": "openai",
            "enabled": True,
            "isCustom": False,
            "premiumOnly": True
        },
        {
            "id": "gpt-4.1-mini",
            "name": "gpt-4.1-mini",
            "provider": "openai",
            "enabled": True,
            "isCustom": False,
            "premiumOnly": False
        },
        {
            "id": "grok-2",
            "name": "grok-2",
            "provider": "xai",
            "enabled": False,
            "isCustom": False,
            "premiumOnly": True
        },
        {
            "id": "o3-mini",
            "name": "o3-mini",
            "provider": "openai",
            "enabled": True,
            "isCustom": False,
            "premiumOnly": True
        }
    ]
    
    @classmethod
    def initialize_default_models(cls, db: Session):
        """Initialize the database with default models if they don't exist."""
        for model_data in cls.DEFAULT_MODELS:
            existing_model = db.query(Model).filter(Model.id == model_data["id"]).first()
            if not existing_model:
                new_model = Model(
                    id=model_data["id"],
                    name=model_data["name"],
                    provider=model_data["provider"],
                    enabled=model_data["enabled"],
                    is_custom=model_data["isCustom"],
                    premium_only=model_data["premiumOnly"]
                )
                db.add(new_model)
        db.commit()
    
    @staticmethod
    def create_model(db: Session, model_data: Dict[str, Any]) -> Model:
        """Create a new custom model.
        
        Args:
            db: Database session
            model_data: Model data including id, name, provider, etc.
            
        Returns:
            Newly created model
        """
        # Check if model with the same ID already exists
        existing_model = db.query(Model).filter(Model.id == model_data["id"]).first()
        if existing_model:
            return None
        
        # Create a new custom model
        new_model = Model(
            id=model_data["id"],
            name=model_data["name"],
            provider=model_data["provider"],
            enabled=model_data.get("enabled", True),
            is_custom=True,  # Always true for newly created models
            premium_only=model_data.get("premium_only", False)
        )
        
        db.add(new_model)
        db.commit()
        db.refresh(new_model)
        return new_model
    
    @staticmethod
    def get_model(db: Session, model_id: str) -> Optional[Model]:
        """Get a model by ID.
        
        Args:
            db: Database session
            model_id: ID of the model
            
        Returns:
            Model if found, None otherwise
        """
        return db.query(Model).filter(Model.id == model_id).first()
    
    @staticmethod
    def list_models(db: Session) -> List[Model]:
        """List all models.
        
        Args:
            db: Database session
            
        Returns:
            List of models
        """
        return db.query(Model).all()
    
    @staticmethod
    def update_model(db: Session, model_id: str, model_data: Dict[str, Any]) -> Optional[Model]:
        """Update a model.
        
        Args:
            db: Database session
            model_id: ID of the model
            model_data: New model data
            
        Returns:
            Updated model if found, None otherwise
        """
        model = ModelService.get_model(db, model_id)
        if not model:
            return None
        
        # Update fields
        if "name" in model_data and model_data["name"] is not None:
            model.name = model_data["name"]
        
        if "provider" in model_data and model_data["provider"] is not None:
            model.provider = model_data["provider"]
        
        if "enabled" in model_data and model_data["enabled"] is not None:
            model.enabled = model_data["enabled"]
        
        if "premium_only" in model_data and model_data["premium_only"] is not None:
            model.premium_only = model_data["premium_only"]
        
        db.commit()
        db.refresh(model)
        return model
    
    @staticmethod
    def delete_model(db: Session, model_id: str) -> bool:
        """Delete a model.
        
        Args:
            db: Database session
            model_id: ID of the model
            
        Returns:
            True if successful, False otherwise
        """
        model = ModelService.get_model(db, model_id)
        if not model:
            return False
        
        # Don't allow deletion of default models
        if not model.is_custom:
            return False
        
        db.delete(model)
        db.commit()
        return True