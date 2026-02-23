# OAuth2 Session Management Service
# This service handles OAuth2 token storage and management using the existing encryption utility

import os
import sys
import json
from pathlib import Path as FilePath
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
import logging
import platform
from fastapi import HTTPException

# Import the shared directory function from AccountService  
from orchestrator.services.account.account import get_app_data_directory
# Import the existing encryption utilities
from orchestrator.utils.encryption import encrypt_data, decrypt_data

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class SessionService:
    """
    Service for storing and retrieving OAuth2 tokens and session data.
    Uses the existing AES-256-CBC encryption utility for consistency with the rest of the system.
    """
    
    @staticmethod
    def _get_session_path() -> FilePath:
        """
        Get the path to the OAuth2 session file, ensuring cross-platform compatibility.
        
        Returns:
            Path to the OAuth2 session file.
        """
        app_data_dir = get_app_data_directory()
        user_dir = app_data_dir / 'User'
        # Ensure User directory exists
        user_dir.mkdir(parents=True, exist_ok=True)
        return user_dir / 'oauth_session'
    
    @staticmethod
    def store_oauth2_session(session_data: Dict[str, Any]) -> bool:
        """
        Store OAuth2 session data in an encrypted format.
        
        Args:
            session_data: Dictionary containing OAuth2 tokens and user info
            
        Expected session_data format:
        {
            "access_token": "...",
            "refresh_token": "...",
            "expires_at": "2024-01-01T12:00:00Z",
            "token_type": "Bearer",
            "scope": "user:profile agent:manage",
            "user_info": {
                "id": "user-id",
                "email": "user@example.com", 
                "name": "User Name"
            },
            "created_at": "2024-01-01T11:00:00Z"
        }
            
        Returns:
            True if successful, False otherwise.
        """
        try:
            # Add metadata
            session_data['stored_at'] = datetime.utcnow().isoformat()
            
            # Convert to JSON
            session_json = json.dumps(session_data, indent=2)
            
            # Encrypt using the existing encryption utility
            encrypted_data = encrypt_data(session_json)
            
            session_path = SessionService._get_session_path()
            # Ensure parent directory exists
            session_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Write the encrypted string to file
            with open(session_path, 'w') as f:
                f.write(encrypted_data)
            
            # Set appropriate permissions for the session file
            # Make the file readable/writable only by the owner
            if platform.system() != "Windows":  # Unix-like systems
                os.chmod(session_path, 0o600)
                
            logger.info("OAuth2 session data stored successfully")
            return True
        except Exception as e:
            logger.error(f"Error storing OAuth2 session: {e}")
            return False
    
    @staticmethod
    def get_oauth2_session() -> Optional[Dict[str, Any]]:
        """
        Retrieve and decrypt the OAuth2 session data.
        
        Returns:
            Decrypted session data dictionary or None if not found or error occurs.
        """
        try:
            session_path = SessionService._get_session_path()
            
            if not session_path.exists():
                return None
            
            # Read the encrypted string from file
            with open(session_path, 'r') as f:
                encrypted_data = f.read()
            
            # Decrypt using the existing encryption utility
            session_json = decrypt_data(encrypted_data)
            session_data = json.loads(session_json)
            
            return session_data
        except Exception as e:
            logger.error(f"Error retrieving OAuth2 session: {e}")
            return None
    
    @staticmethod
    def update_oauth2_session(session_data: Dict[str, Any]) -> bool:
        """
        Update the stored OAuth2 session data.
        
        Args:
            session_data: New session data to store.
            
        Returns:
            True if successful, False otherwise.
        """
        # For update, we simply overwrite the existing session
        return SessionService.store_oauth2_session(session_data)
    
    @staticmethod
    def delete_oauth2_session() -> bool:
        """
        Delete the stored OAuth2 session data.
        
        Returns:
            True if successful, False otherwise.
        """
        try:
            session_path = SessionService._get_session_path()
            
            if session_path.exists():
                os.remove(session_path)
                logger.info("OAuth2 session data deleted successfully")
            
            return True
        except Exception as e:
            logger.error(f"Error deleting OAuth2 session: {e}")
            return False
    
    @staticmethod
    def has_oauth2_session() -> bool:
        """
        Check if OAuth2 session data is stored.
        
        Returns:
            True if session data is stored, False otherwise.
        """
        return SessionService._get_session_path().exists()
    
    @staticmethod
    def is_session_expired() -> bool:
        """
        Check if the stored OAuth2 session is expired.
        
        Returns:
            True if expired or no session, False if still valid.
            Note: Sessions without expires_at are considered persistent (non-expiring).
        """
        session_data = SessionService.get_oauth2_session()
        
        if not session_data:
            return True
            
        expires_at_str = session_data.get('expires_at')
        if not expires_at_str:
            # No expiration data means persistent session - never expires
            return False
            
        try:
            expires_at = datetime.fromisoformat(expires_at_str.replace('Z', '+00:00'))
            now = datetime.utcnow().replace(tzinfo=expires_at.tzinfo)
            
            # Add 5 minute buffer for token refresh
            return now >= (expires_at - timedelta(minutes=5))
        except Exception as e:
            logger.error(f"Error checking session expiration: {e}")
            return True
    
    @staticmethod
    def get_user_info() -> Optional[Dict[str, Any]]:
        """
        Get user information from the stored OAuth2 session.
        
        Returns:
            User info dictionary or None if not available.
        """
        session_data = SessionService.get_oauth2_session()
        if session_data:
            return session_data.get('user_info')
        return None
    
    @staticmethod
    def get_access_token() -> Optional[str]:
        """
        Get the access token from stored OAuth2 session.
        
        Returns:
            Access token string or None if not available.
        """
        session_data = SessionService.get_oauth2_session()
        if session_data and not SessionService.is_session_expired():
            return session_data.get('access_token')
        return None
    
    @staticmethod
    def get_refresh_token() -> Optional[str]:
        """
        Get the refresh token from stored OAuth2 session.
        
        Returns:
            Refresh token string or None if not available.
        """
        session_data = SessionService.get_oauth2_session()
        if session_data:
            return session_data.get('refresh_token')
        return None
    
    @staticmethod
    def update_tokens(access_token: str, refresh_token: str = None, expires_in: int = 3600) -> bool:
        """
        Update only the tokens in the existing session.
        
        Args:
            access_token: New access token
            refresh_token: New refresh token (optional)
            expires_in: Token expiration time in seconds
            
        Returns:
            True if successful, False otherwise.
        """
        try:
            session_data = SessionService.get_oauth2_session()
            if not session_data:
                logger.error("Cannot update tokens: no existing session found")
                return False
            
            # Update tokens
            session_data['access_token'] = access_token
            if refresh_token:
                session_data['refresh_token'] = refresh_token
            
            # Update expiration
            expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
            session_data['expires_at'] = expires_at.isoformat() + 'Z'
            session_data['updated_at'] = datetime.utcnow().isoformat()
            
            return SessionService.store_oauth2_session(session_data)
        except Exception as e:
            logger.error(f"Error updating tokens: {e}")
            return False


# Convenience functions for direct imports (similar to account.py)
def store_oauth2_session(session_data: Dict[str, Any]) -> bool:
    """Store OAuth2 session data in an encrypted format."""
    return SessionService.store_oauth2_session(session_data)

def get_oauth2_session() -> Optional[Dict[str, Any]]:
    """Retrieve and decrypt the OAuth2 session data."""
    return SessionService.get_oauth2_session()

def update_oauth2_session(session_data: Dict[str, Any]) -> bool:
    """Update the stored OAuth2 session data."""
    return SessionService.update_oauth2_session(session_data)

def delete_oauth2_session() -> bool:
    """Delete the stored OAuth2 session data."""
    return SessionService.delete_oauth2_session()

def has_oauth2_session() -> bool:
    """Check if OAuth2 session data is stored."""
    return SessionService.has_oauth2_session()

def is_session_expired() -> bool:
    """Check if the stored OAuth2 session is expired."""
    return SessionService.is_session_expired()

def get_user_info() -> Optional[Dict[str, Any]]:
    """Get user information from the stored OAuth2 session."""
    return SessionService.get_user_info()

def get_access_token() -> Optional[str]:
    """Get the access token from stored OAuth2 session."""
    return SessionService.get_access_token()

def get_refresh_token() -> Optional[str]:
    """Get the refresh token from stored OAuth2 session."""
    return SessionService.get_refresh_token()

def update_tokens(access_token: str, refresh_token: str = None, expires_in: int = 3600) -> bool:
    """Update only the tokens in the existing session."""
    return SessionService.update_tokens(access_token, refresh_token, expires_in)



async def increment_usage(amount: int = 1, raise_exceptions: bool = True):
    """
    Increment usage using encrypted authentication header.
    This uses the new encrypted auth approach instead of OAuth tokens.

    Args:
        amount: Amount to increment (default 1)
        raise_exceptions: Whether to raise HTTPExceptions or just log errors (default True)

    Raises:
        HTTPException: If no session is found or the usage service fails (only if raise_exceptions=True)

    Returns:
        dict: Response from the usage service or error info if raise_exceptions=False
    """
    import httpx
    from config.config import get_agentkube_server_url
    from orchestrator.services.usage import PendingUsageService

    session_data = SessionService.get_oauth2_session()
    if not session_data:
        error_msg = "No valid session found"
        if raise_exceptions:
            raise HTTPException(status_code=401, detail=error_msg)
        else:
            logger.warning(f"Usage tracking failed: {error_msg}")
            return {"success": False, "error": error_msg}

    encrypted_user_data = session_data.get('encrypted_user_data')
    if not encrypted_user_data:
        error_msg = "No encrypted user data in session"
        if raise_exceptions:
            raise HTTPException(status_code=401, detail=error_msg)
        else:
            logger.warning(f"Usage tracking failed: {error_msg}")
            return {"success": False, "error": error_msg}

    server_url = get_agentkube_server_url()

    # Check for pending usage
    pending = PendingUsageService._get_pending_usage()

    # Track if we should skip re-adding to pending on failure (when user is at limit)
    skip_pending_on_failure = False

    # If pending usage is too high, get current user profile to check limits
    if pending > 100:  # If pending usage is suspiciously high
        logger.warning(f"High pending usage detected: {pending}. Checking user limits...")

        try:
            # Get user profile to check current usage and limits
            user_profile = await get_user_profile_with_encrypted_auth()
            current_usage = user_profile.get('usage_count', 0)
            usage_limit = user_profile.get('usage_limit', 30)  # Default to free tier limit

            # Calculate available usage space
            available_usage = max(0, usage_limit - current_usage - 2)  # Leave 2 buffer

            if available_usage <= 0:
                logger.warning(f"User at usage limit ({current_usage}/{usage_limit}). Clearing pending usage.")
                PendingUsageService.clear_pending_usage()
                skip_pending_on_failure = True  # Don't re-add to pending if user is at limit

                error_msg = "Usage limit reached. Pending usage cleared."
                if raise_exceptions:
                    raise HTTPException(status_code=429, detail=error_msg)
                else:
                    logger.warning(f"Usage tracking stopped: {error_msg}")
                    return {"success": False, "error": error_msg, "skip_retry": True}

            # If pending + current amount would exceed limits, adjust it
            total_amount = amount + pending
            if total_amount > available_usage:
                adjusted_amount = available_usage
                logger.warning(f"Adjusting usage increment from {total_amount} to {adjusted_amount} to stay within limits")

                # Clear pending and set it to 0 since we're using only what's available
                PendingUsageService.clear_pending_usage()
                total_amount = adjusted_amount
            else:
                # Normal case - clear pending and use total
                PendingUsageService.clear_pending_usage()
                total_amount = amount + pending

        except HTTPException as e:
            if e.status_code == 401:
                # Auth issue, handle pending normally
                PendingUsageService.clear_pending_usage()
                total_amount = amount + pending
            else:
                raise
        except Exception as e:
            logger.error(f"Error checking user limits: {e}. Proceeding with normal flow.")
            # On error, clear pending and use normal amount
            PendingUsageService.clear_pending_usage()
            total_amount = amount + pending
    else:
        # Normal pending usage - clear and add to current amount
        PendingUsageService.clear_pending_usage()
        total_amount = amount + pending

    try:
        async with httpx.AsyncClient() as client:
            # Call the agentkube-core backend with encrypted user header
            response = await client.post(
                f'{server_url}/api/v1/remote/usage/increment',
                headers={
                    'X-Encrypted-User': encrypted_user_data,  # Custom encrypted header
                    'Content-Type': 'application/json'
                },
                json={
                    'field': 'usage_count',
                    'amount': total_amount
                }
            )

            if response.status_code != 200:
                error_data = response.json() if response.content else {}
                error_msg = error_data.get('message', 'Failed to update usage')

                # Only save to pending if we're not at usage limit
                if not skip_pending_on_failure:
                    PendingUsageService.add_pending_usage(total_amount)
                else:
                    logger.info("Skipping pending usage addition - user at usage limit")

                if raise_exceptions:
                    raise HTTPException(
                        status_code=response.status_code,
                        detail=error_msg
                    )
                else:
                    logger.warning(f"Usage tracking failed with status {response.status_code}: {error_msg}")
                    return {"success": False, "error": error_msg, "status_code": response.status_code, "skip_retry": skip_pending_on_failure}

            logger.info(f"Usage incremented successfully by {total_amount}")
            return response.json()

    except httpx.HTTPError as e:
        # Only save to pending on connection error if not at usage limit
        if not skip_pending_on_failure:
            PendingUsageService.add_pending_usage(total_amount)
        error_msg = f"Failed to connect to usage service: {str(e)}"

        if raise_exceptions:
            raise HTTPException(status_code=503, detail=error_msg)
        else:
            logger.warning(f"Usage tracking failed: {error_msg}")
            return {"success": False, "error": error_msg, "skip_retry": skip_pending_on_failure}
    except HTTPException:
        if raise_exceptions:
            raise
        else:
            # This should not happen if raise_exceptions=False, but just in case
            logger.error("Unexpected HTTPException in non-raising mode")
            return {"success": False, "error": "Unexpected error", "skip_retry": skip_pending_on_failure}
    except Exception as e:
        # Only save to pending on any other error if not at usage limit
        if not skip_pending_on_failure:
            PendingUsageService.add_pending_usage(total_amount)
        error_msg = f"Failed to update usage: {str(e)}"

        if raise_exceptions:
            raise HTTPException(status_code=500, detail=error_msg)
        else:
            logger.warning(f"Usage tracking failed: {error_msg}")
            return {"success": False, "error": error_msg, "skip_retry": skip_pending_on_failure}

async def get_user_profile_with_encrypted_auth():
    """
    Get full user profile using encrypted authentication header.
    This includes subscription, usage, OpenRouter keys, etc.
    
    Returns:
        dict: Complete user profile data
    """
    import httpx
    from config.config import get_agentkube_server_url
    import json
    
    session_data = SessionService.get_oauth2_session()
    if not session_data:
        raise HTTPException(status_code=401, detail="No valid session found")
    
    encrypted_user_data = session_data.get('encrypted_user_data')
    
    # If no encrypted data but we have user_info, create it now
    if not encrypted_user_data and session_data.get('user_info'):
        user_info = session_data.get('user_info')
        user_data_to_encrypt = {
            "supabaseId": user_info.get('id'),
            "email": user_info.get('email')
        }
        
        encrypted_user_data = encrypt_data(json.dumps(user_data_to_encrypt))
        
        # Update session with encrypted data
        session_data['encrypted_user_data'] = encrypted_user_data
        SessionService.store_oauth2_session(session_data)
        logger.info("Added encrypted user data to existing session")
    
    if not encrypted_user_data:
        raise HTTPException(status_code=401, detail="No encrypted user data in session")
    
    server_url = get_agentkube_server_url()
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f'{server_url}/api/v1/remote/user',
                headers={
                    'X-Encrypted-User': encrypted_user_data,
                    'Content-Type': 'application/json'
                }
            )
            
            if response.status_code != 200:
                error_data = response.json() if response.content else {}
                raise HTTPException(
                    status_code=response.status_code,
                    detail=error_data.get('message', 'Failed to get user profile')
                )
            
            return response.json()
            
    except httpx.HTTPError as e:
        raise HTTPException(status_code=503, detail=f"Failed to connect to user service: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get user profile: {str(e)}")

async def increment_usage_with_retry(amount: int = 1, max_retries: int = 3, raise_exceptions: bool = True):
    """
    Increment usage with retry logic.

    Args:
        amount: Amount to increment (default 1)
        max_retries: Maximum number of retry attempts (default 3)
        raise_exceptions: Whether to raise HTTPExceptions or just log errors (default True)

    Returns:
        dict: Response from the usage service or error info if raise_exceptions=False
    """
    import asyncio

    last_error = None

    for attempt in range(max_retries + 1):  # +1 to include the initial attempt
        try:
            if attempt > 0:
                # Wait with exponential backoff: 1s, 2s, 4s
                wait_time = 2 ** (attempt - 1)
                logger.info(f"Retrying usage increment attempt {attempt + 1}/{max_retries + 1} after {wait_time}s...")
                await asyncio.sleep(wait_time)

            result = await increment_usage(amount, raise_exceptions=raise_exceptions)

            # If we get here and it's successful, return the result
            if raise_exceptions or result.get("success", True):
                if attempt > 0:
                    logger.info(f"Usage increment succeeded on attempt {attempt + 1}")
                return result
            else:
                # If raise_exceptions=False and we got an error response
                last_error = result.get("error", "Unknown error")
                logger.warning(f"Usage increment attempt {attempt + 1} failed: {last_error}")

                # Check if we should skip retrying (e.g., user at usage limit)
                if result.get("skip_retry", False):
                    logger.info("Stopping retry attempts - user at usage limit")
                    return result

                continue

        except Exception as e:
            last_error = str(e)
            logger.warning(f"Usage increment attempt {attempt + 1} failed with exception: {last_error}")

            # If this is the last attempt, handle accordingly
            if attempt == max_retries:
                if raise_exceptions:
                    raise
                else:
                    return {"success": False, "error": last_error}

    # If we exhausted all retries and raise_exceptions=False
    error_msg = f"Failed to increment usage after {max_retries + 1} attempts. Last error: {last_error}"
    logger.error(error_msg)
    return {"success": False, "error": error_msg}

async def update_oauth2_usage_async(amount: int = 1):
    """
    Helper function to update usage asynchronously using encrypted auth.
    This function is safe to use in background tasks as it won't raise exceptions.
    """
    try:
        result = await increment_usage(amount, raise_exceptions=False)
        if not result.get("success", True):
            logger.warning(f"Background usage tracking failed: {result.get('error', 'Unknown error')}")
        return result
    except Exception as e:
        logger.error(f"Unexpected error in background usage tracking: {str(e)}")
        return {"success": False, "error": str(e)}

async def get_user_plan() -> str:
    """
    Get the user's subscription plan.

    Returns:
        str: User's plan name (e.g., "free", "developer", "startup") or "Free" as default
    """
    try:
        user_profile = await get_user_profile_with_encrypted_auth()
        subscription = user_profile.get('subscription', {})
        plan = subscription.get('plan', 'free')
        return plan
    except Exception as e:
        logger.warning(f"Could not retrieve user plan: {e}. Defaulting to Free.")
        return "free"

async def should_track_usage(model_name: str) -> bool:
    """
    Determine if usage should be tracked based on the provider being used.

    Args:
        model_name: The model name from the request

    Returns:
        bool: True if we should track usage (OpenRouter), False otherwise (BYOK)
    """
    try:
        from orchestrator.services.byok.provider import get_provider_for_model, ProviderType

        # Get user plan
        user_plan = await get_user_plan()

        # Get provider configuration based on plan
        if user_plan == "free":
            # Free users always use OpenRouter
            provider_config = get_provider_for_model(model_name, "default")
        else:
            # Paid users can use BYOK
            provider_config = get_provider_for_model(model_name)

        # Track usage only if using OpenRouter (we pay for it)
        is_openrouter = provider_config.provider == ProviderType.OPENROUTER

        logger.info(f"Usage tracking: {is_openrouter} (Provider: {provider_config.provider.value}, Plan: {user_plan})")
        return is_openrouter

    except Exception as e:
        logger.error(f"Error determining usage tracking: {e}. Defaulting to track usage.")
        # Default to tracking on error (safer for billing)
        return True

async def validate_oauth2_session_on_startup():
    """
    Validate OAuth2 session on application startup.
    Clean up invalid sessions and log authentication status.
    """
    try:
        if not has_oauth2_session():
            logger.info("No OAuth2 session found, skipping validation")
            return
        
        logger.info("Starting OAuth2 session validation...")
        
        if is_session_expired():
            logger.info("OAuth2 session is expired")
            # Try to refresh if we have a refresh token
            refresh_token = get_refresh_token()
            
            if refresh_token:
                logger.info("Attempting to refresh OAuth2 tokens...")
                # Import here to avoid circular imports
                from orchestrator.services.auth.auth_service import AuthenticationService
                from config.auth_config import get_auth_config
                
                try:
                    config = get_auth_config()
                    auth_service = AuthenticationService(
                        client_id=config.client_id,
                        authorization_url=config.authorization_url,
                        token_url=config.token_url,
                        scopes=config.scopes,
                        callback_port=config.callback_port,
                        callback_timeout=config.callback_timeout
                    )
                    
                    refresh_result = await auth_service.refresh_tokens()
                    
                    if refresh_result.get('success', False):
                        logger.info("OAuth2 tokens refreshed successfully")
                    else:
                        logger.warning(f"OAuth2 token refresh failed: {refresh_result.get('message', 'Unknown error')}")
                        # Clean up invalid session
                        delete_oauth2_session()
                        logger.info("Invalid OAuth2 session removed")
                        
                except Exception as e:
                    logger.error(f"Error during OAuth2 token refresh: {e}")
                    # Clean up potentially corrupted session
                    delete_oauth2_session()
                    logger.info("Corrupted OAuth2 session removed")
            else:
                logger.info("No refresh token available, removing expired session")
                delete_oauth2_session()
        else:
            # Session is valid
            user_info = get_user_info()
            user_email = user_info.get('email', 'Unknown') if user_info else 'Unknown'
            
            session_data = get_oauth2_session()
            expires_at = session_data.get('expires_at') if session_data else None
            
            logger.info(f"OAuth2 authentication valid for user: {user_email}")
            if expires_at:
                logger.info(f"Tokens expire at: {expires_at}")
                
    except Exception as e:
        logger.error(f"Unexpected error during OAuth2 session validation: {e}")
        # Clean up potentially corrupted session
        try:
            delete_oauth2_session()
        except Exception as cleanup_error:
            logger.error(f"Error cleaning up OAuth2 session: {cleanup_error}")