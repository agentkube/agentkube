import hashlib
import uuid
from pathlib import Path as FilePath
import logging
import platform
import os
import base64

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class PendingUsageService:
    """
    Service for storing and managing pending usage increments.
    These are stored in a base64 encoded file to handle failures.
    """
    
    _PENDING_PATH = FilePath.home() / '.agentkube' / 'tmp'
    
    @classmethod
    def _get_pending_usage(cls) -> int:
        """Get the current pending usage count."""
        try:
            if cls._PENDING_PATH.exists():
                with open(cls._PENDING_PATH, 'r') as f:
                    encoded_data = f.read()
                    decoded_data = base64.b64decode(encoded_data.encode()).decode()
                    return int(decoded_data)
            return 0
        except Exception as e:
            logger.error(f"Error reading pending usage: {e}")
            return 0
    
    @classmethod
    def _save_pending_usage(cls, amount: int) -> None:
        """Save pending usage count."""
        try:
            # Ensure directory exists
            os.makedirs(cls._PENDING_PATH.parent, exist_ok=True)
            
            encoded_data = base64.b64encode(str(amount).encode()).decode()
            with open(cls._PENDING_PATH, 'w') as f:
                f.write(encoded_data)
                
            # Set appropriate permissions
            if platform.system() != "Windows":
                os.chmod(cls._PENDING_PATH, 0o600)
        except Exception as e:
            logger.error(f"Error saving pending usage: {e}")
    
    @classmethod
    def add_pending_usage(cls, amount: int = 1) -> None:
        """Add to pending usage count with safety limits."""
        current = cls._get_pending_usage()
        new_total = current + amount
        
        # Safety mechanism: If pending usage gets too high (>1000), reset it
        # This prevents runaway accumulation
        if new_total > 1000:
            logger.warning(f"Pending usage too high ({new_total}). Resetting to prevent overflow.")
            cls._save_pending_usage(amount)  # Just save the current amount, discard excessive pending
        else:
            cls._save_pending_usage(new_total)
    
    @classmethod
    def clear_pending_usage(cls) -> None:
        """Clear pending usage after successful sync."""
        try:
            if cls._PENDING_PATH.exists():
                os.remove(cls._PENDING_PATH)
        except Exception as e:
            logger.error(f"Error clearing pending usage: {e}")
    
    @classmethod
    def get_and_clear_pending_usage(cls) -> int:
        """Get pending usage and clear it."""
        amount = cls._get_pending_usage()
        cls.clear_pending_usage()
        return amount
    
    @classmethod
    def check_and_reset_excessive_pending(cls, max_allowed: int = 500) -> bool:
        """Check if pending usage is excessive and reset if needed."""
        current = cls._get_pending_usage()
        if current > max_allowed:
            logger.warning(f"Excessive pending usage detected ({current}). Resetting to prevent system issues.")
            cls.clear_pending_usage()
            return True
        return False