import os
import sys
import base64
from pathlib import Path as FilePath
from typing import Optional
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import logging
import platform
from fastapi import HTTPException, Path

from orchestrator.services.usage import PendingUsageService

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def get_app_data_directory():
    """Get the appropriate application data directory for the current platform."""
    if sys.platform == "win32":
        # Windows: Use APPDATA
        base_dir = FilePath(os.environ.get('APPDATA', os.path.expanduser('~')))
        app_dir = base_dir / 'Agentkube'
    elif sys.platform == "darwin":
        # macOS: Use ~/Library/Application Support
        base_dir = FilePath.home() / 'Library' / 'Application Support'
        app_dir = base_dir / 'Agentkube'
    else:
        # Linux: Use ~/.local/share
        base_dir = FilePath.home() / '.local' / 'share'
        app_dir = base_dir / 'agentkube'
    
    # Create the directory if it doesn't exist
    app_dir.mkdir(parents=True, exist_ok=True)
    return app_dir

class AccountService:
    """
    Service for storing and retrieving license keys.
    License keys are stored in an encrypted format in the app data directory.
    """
    
    # Salt for key derivation
    _SALT = b'agentkube_salt_value_for_license_encryption'
    
    @staticmethod
    def _get_secrets_path() -> FilePath:
        """
        Get the path to the secrets file, ensuring cross-platform compatibility.
        
        Returns:
            Path to the secrets file.
        """
        app_data_dir = get_app_data_directory()
        user_dir = app_data_dir / 'User'
        # Ensure User directory exists
        user_dir.mkdir(parents=True, exist_ok=True)
        return user_dir / 'secrets'
    
    @staticmethod
    def _derive_key(password: str) -> bytes:
        """
        Derive an encryption key from a password.
        
        Args:
            password: Password to derive key from.
            
        Returns:
            Derived key as bytes.
        """
        # Use system-specific information as part of the password
        system_info = platform.node() + platform.machine()
        password = password + system_info
        
        password_bytes = password.encode()
        
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=AccountService._SALT,
            iterations=100000,
        )
        
        key = base64.urlsafe_b64encode(kdf.derive(password_bytes))
        return key
    
    @staticmethod
    def _get_encryption_key() -> bytes:
        """
        Get an encryption key derived from system-specific information.
        
        Returns:
            Encryption key as bytes.
        """
        # Use machine-specific identifier for encryption
        machine_id = platform.node() + "-" + platform.processor()
        return AccountService._derive_key(machine_id)
    
    @staticmethod
    def store_license_key(license_key: str) -> bool:
        """
        Store a license key in an encrypted format.
        
        Args:
            license_key: License key to store.
            
        Returns:
            True if successful, False otherwise.
        """
        try:
            key = AccountService._get_encryption_key()
            cipher = Fernet(key)
            encrypted_bytes = cipher.encrypt(license_key.encode())
            
            secrets_path = AccountService._get_secrets_path()
            # Ensure parent directory exists
            secrets_path.parent.mkdir(parents=True, exist_ok=True)
            
            with open(secrets_path, 'wb') as f:
                f.write(encrypted_bytes)
            
            # Set appropriate permissions for the secrets file
            # Make the file readable/writable only by the owner
            if platform.system() != "Windows":  # Unix-like systems
                os.chmod(secrets_path, 0o600)
                
            return True
        except Exception as e:
            logger.error(f"Error storing license key: {e}")
            return False
    
    @staticmethod
    def get_license_key() -> Optional[str]:
        """
        Retrieve and decrypt the license key.
        
        Returns:
            Decrypted license key or None if not found or error occurs.
        """
        try:
            secrets_path = AccountService._get_secrets_path()
            
            if not secrets_path.exists():
                return None
            
            with open(secrets_path, 'rb') as f:
                encrypted_bytes = f.read()
            
            key = AccountService._get_encryption_key()
            cipher = Fernet(key)
            
            decrypted_bytes = cipher.decrypt(encrypted_bytes)
            return decrypted_bytes.decode()
        except Exception as e:
            logger.error(f"Error retrieving license key: {e}")
            return None
    
    @staticmethod
    def update_license_key(license_key: str) -> bool:
        """
        Update the stored license key.
        
        Args:
            license_key: New license key to store.
            
        Returns:
            True if successful, False otherwise.
        """
        # For update, we simply overwrite the existing key
        return AccountService.store_license_key(license_key)
    
    @staticmethod
    def delete_license_key() -> bool:
        """
        Delete the stored license key.
        
        Returns:
            True if successful, False otherwise.
        """
        try:
            secrets_path = AccountService._get_secrets_path()
            
            if secrets_path.exists():
                os.remove(secrets_path)
            
            return True
        except Exception as e:
            logger.error(f"Error deleting license key: {e}")
            return False
    
    @staticmethod
    def has_license_key() -> bool:
        """
        Check if a license key is stored.
        
        Returns:
            True if a license key is stored, False otherwise.
        """
        return AccountService._get_secrets_path().exists()
    
    @staticmethod
    def store_instance_id(instance_id: str) -> bool:
        """
        Store an instance ID in an encrypted format.
        
        Args:
            instance_id: Instance ID to store.
            
        Returns:
            True if successful, False otherwise.
        """
        try:
            key = AccountService._get_encryption_key()
            cipher = Fernet(key)
            encrypted_bytes = cipher.encrypt(instance_id.encode())
            
            instance_path = AccountService._get_instance_path()
            # Ensure parent directory exists
            instance_path.parent.mkdir(parents=True, exist_ok=True)
            
            with open(instance_path, 'wb') as f:
                f.write(encrypted_bytes)
            
            # Set appropriate permissions for the instance file
            # Make the file readable/writable only by the owner
            if platform.system() != "Windows":  # Unix-like systems
                os.chmod(instance_path, 0o600)
                
            return True
        except Exception as e:
            logger.error(f"Error storing instance ID: {e}")
            return False

    @staticmethod
    def get_instance_id() -> Optional[str]:
        """
        Retrieve and decrypt the instance ID.
        
        Returns:
            Decrypted instance ID or None if not found or error occurs.
        """
        try:
            instance_path = AccountService._get_instance_path()
            
            if not instance_path.exists():
                return None
            
            with open(instance_path, 'rb') as f:
                encrypted_bytes = f.read()
            
            key = AccountService._get_encryption_key()
            cipher = Fernet(key)
            
            decrypted_bytes = cipher.decrypt(encrypted_bytes)
            return decrypted_bytes.decode()
        except Exception as e:
            logger.error(f"Error retrieving instance ID: {e}")
            return None

    @staticmethod
    def update_instance_id(instance_id: str) -> bool:
        """
        Update the stored instance ID.
        
        Args:
            instance_id: New instance ID to store.
            
        Returns:
            True if successful, False otherwise.
        """
        # For update, we simply overwrite the existing ID
        return AccountService.store_instance_id(instance_id)

    @staticmethod
    def delete_instance_id() -> bool:
        """
        Delete the stored instance ID.
        
        Returns:
            True if successful, False otherwise.
        """
        try:
            instance_path = AccountService._get_instance_path()
            
            if instance_path.exists():
                os.remove(instance_path)
            
            return True
        except Exception as e:
            logger.error(f"Error deleting instance ID: {e}")
            return False

    @staticmethod
    def has_instance_id() -> bool:
        """
        Check if an instance ID is stored.
        
        Returns:
            True if an instance ID is stored, False otherwise.
        """
        return AccountService._get_instance_path().exists()

    @staticmethod
    def _get_instance_path() -> FilePath:
        """
        Get the path to the instance file, ensuring cross-platform compatibility.
        
        Returns:
            Path to the instance file.
        """
        app_data_dir = get_app_data_directory()
        user_dir = app_data_dir / 'User'
        # Ensure User directory exists
        user_dir.mkdir(parents=True, exist_ok=True)
        return user_dir / 'instance'


# Convenience functions for direct imports
def store_license_key(license_key: str) -> bool:
    """Store a license key in an encrypted format."""
    return AccountService.store_license_key(license_key)

def get_license_key() -> Optional[str]:
    """Retrieve and decrypt the license key."""
    return AccountService.get_license_key()

def update_license_key(license_key: str) -> bool:
    """Update the stored license key."""
    return AccountService.update_license_key(license_key)

def delete_license_key() -> bool:
    """Delete the stored license key."""
    return AccountService.delete_license_key()

def has_license_key() -> bool:
    """Check if a license key is stored."""
    return AccountService.has_license_key()

def store_instance_id(instance_id: str) -> bool:
    """Store an instance ID in an encrypted format."""
    return AccountService.store_instance_id(instance_id)

def get_instance_id() -> Optional[str]:
    """Retrieve and decrypt the instance ID."""
    return AccountService.get_instance_id()

def update_instance_id(instance_id: str) -> bool:
    """Update the stored instance ID."""
    return AccountService.update_instance_id(instance_id)

def delete_instance_id() -> bool:
    """Delete the stored instance ID."""
    return AccountService.delete_instance_id()

def has_instance_id() -> bool:
    """Check if an instance ID is stored."""
    return AccountService.has_instance_id()


async def increment_usage_for_license(amount: int = 1):
    """
    Increment usage for the stored license key.
    
    Args:
        amount: Amount to increment (default 1)
    
    Raises:
        HTTPException: If no license key is found or the usage service fails
    
    Returns:
        dict: Response from the usage service
    """
    import httpx
    from config.config import get_agentkube_server_url
    license_key = get_license_key()
    server_url = get_agentkube_server_url()
    if not license_key:
        raise HTTPException(status_code=401, detail="No license key found")
    
    # Check for pending usage and add it to current amount
    pending = PendingUsageService.get_and_clear_pending_usage()
    total_amount = amount + pending
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f'{server_url}/api/instances/usage/increment',
                headers={
                    'x-license-key': license_key,
                    'Content-Type': 'application/json'
                },
                json={
                    'field': 'usage_count',
                    'amount': total_amount
                }
            )
            
            if response.status_code != 200:
                # Save the total amount to pending if failed
                PendingUsageService.add_pending_usage(total_amount)
                error_data = response.json()
                raise HTTPException(
                    status_code=response.status_code, 
                    detail=error_data.get('message', 'Failed to update usage')
                )
            
            return response.json()
            
    except httpx.HTTPError as e:
        # Save to pending on connection error
        PendingUsageService.add_pending_usage(total_amount)
        raise HTTPException(status_code=503, detail=f"Failed to connect to usage service: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        # Save to pending on any other error
        PendingUsageService.add_pending_usage(total_amount)
        raise HTTPException(status_code=500, detail=f"Failed to update usage: {str(e)}")
    
async def update_usage_async(amount: int = 1):
    """Helper function to update usage asynchronously."""
    try:
        await increment_usage_for_license(amount)
    except Exception as e:
        # On failure, save to pending
        PendingUsageService.add_pending_usage(amount)
        logger.error(f"Failed to update usage: {e}")
        
async def validate_license_on_startup():
    """
    Validate license key and instance ID with LemonSqueezy on application startup.
    Remove credentials if validation fails.
    """
    import httpx
    try:
        logger.info("Starting license validation process...")
        
        license_key = get_license_key()
        instance_id = get_instance_id()
        
        if not license_key or not instance_id:
            logger.info("No license key or instance ID found, skipping validation")
            return
        
        logger.info("Validating license with LemonSqueezy...")
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.lemonsqueezy.com/v1/licenses/validate",
                headers={
                    "Accept": "application/json"
                },
                data={
                    "license_key": license_key,
                    "instance_id": instance_id
                }
            )
            
            if response.status_code == 200:
                result = response.json()
                
                if result.get("valid", False):
                    logger.info("License validation successful")
                    license_status = result.get("license_key", {}).get("status", "unknown")
                    logger.info(f"License status: {license_status}")
                else:
                    error_msg = result.get("error", "Unknown validation error")
                    logger.warning(f"License validation failed: {error_msg}")
                    logger.info("Removing invalid license key and instance ID...")
                    
                    # Remove invalid credentials
                    delete_license_key()
                    delete_instance_id()
                    
                    logger.info("Invalid credentials removed from system")
            else:
                logger.error(f"License validation request failed with status {response.status_code}")
                
                # Check if response contains validation error even with non-200 status
                try:
                    result = response.json()
                    if not result.get("valid", True):
                        error_msg = result.get("error", "Unknown validation error")
                        logger.warning(f"License validation failed: {error_msg}")
                        logger.info("Removing invalid license key and instance ID...")
                        
                        delete_license_key()
                        delete_instance_id()
                        
                        logger.info("Invalid credentials removed from system")
                except:
                    # If we can't parse response, treat as network error and keep credentials
                    pass
                
    except httpx.TimeoutException:
        logger.warning("License validation timed out - keeping existing credentials")
    except httpx.RequestError as e:
        logger.warning(f"License validation network error: {e} - keeping existing credentials")
    except Exception as e:
        logger.error(f"Unexpected error during license validation: {e}")