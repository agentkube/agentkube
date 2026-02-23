"""Token storage and management for OAuth2 authentication."""

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
from pathlib import Path

from orchestrator.services.account.account import get_app_data_directory, AccountService
from .exceptions import TokenExpiredError, OAuth2Error

logger = logging.getLogger(__name__)


class TokenManager:
    """Manages secure storage and refresh of OAuth2 tokens."""
    
    def __init__(self):
        """Initialize token manager."""
        pass
    
    @staticmethod
    def _get_tokens_path() -> Path:
        """
        Get the path to the tokens file.
        
        Returns:
            Path to the encrypted tokens file
        """
        app_data_dir = get_app_data_directory()
        user_dir = app_data_dir / 'User'
        user_dir.mkdir(parents=True, exist_ok=True)
        return user_dir / 'oauth_tokens'
    
    @staticmethod
    def store_tokens(
        access_token: str,
        refresh_token: str,
        expires_in: int,
        token_type: str = "Bearer",
        scope: Optional[str] = None,
        user_info: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Store OAuth2 tokens securely.
        
        Args:
            access_token: OAuth2 access token
            refresh_token: OAuth2 refresh token
            expires_in: Token expiration time in seconds
            token_type: Token type (default: Bearer)
            scope: Token scopes
            user_info: Additional user information
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Calculate expiration time
            expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
            
            token_data = {
                'access_token': access_token,
                'refresh_token': refresh_token,
                'expires_at': expires_at.isoformat(),
                'token_type': token_type,
                'scope': scope,
                'user_info': user_info or {},
                'stored_at': datetime.now(timezone.utc).isoformat()
            }
            
            # Convert to JSON string
            token_json = json.dumps(token_data)
            
            # Use existing encryption system from AccountService
            key = AccountService._get_encryption_key()
            from cryptography.fernet import Fernet
            cipher = Fernet(key)
            encrypted_bytes = cipher.encrypt(token_json.encode())
            
            # Store encrypted tokens
            tokens_path = TokenManager._get_tokens_path()
            tokens_path.parent.mkdir(parents=True, exist_ok=True)
            
            with open(tokens_path, 'wb') as f:
                f.write(encrypted_bytes)
            
            # Set appropriate permissions
            import platform
            import os
            if platform.system() != "Windows":
                os.chmod(tokens_path, 0o600)
            
            logger.info("OAuth2 tokens stored successfully")
            return True
            
        except Exception as e:
            logger.error(f"Error storing OAuth2 tokens: {e}")
            return False
    
    @staticmethod
    def get_tokens() -> Optional[Dict[str, Any]]:
        """
        Retrieve and decrypt OAuth2 tokens.
        
        Returns:
            Token data dictionary or None if not found/error
        """
        try:
            tokens_path = TokenManager._get_tokens_path()
            
            if not tokens_path.exists():
                return None
            
            # Read encrypted tokens
            with open(tokens_path, 'rb') as f:
                encrypted_bytes = f.read()
            
            # Decrypt using existing system
            key = AccountService._get_encryption_key()
            from cryptography.fernet import Fernet
            cipher = Fernet(key)
            
            decrypted_bytes = cipher.decrypt(encrypted_bytes)
            token_json = decrypted_bytes.decode()
            
            return json.loads(token_json)
            
        except Exception as e:
            logger.error(f"Error retrieving OAuth2 tokens: {e}")
            return None
    
    @staticmethod
    def get_valid_access_token() -> Optional[str]:
        """
        Get a valid access token, checking expiration.
        
        Returns:
            Valid access token or None if expired/not found
        """
        tokens = TokenManager.get_tokens()
        if not tokens:
            return None
        
        try:
            # Check if token is expired
            expires_at = datetime.fromisoformat(tokens['expires_at'])
            now = datetime.now(timezone.utc)
            
            # Add 5-minute buffer for expiration
            buffer = timedelta(minutes=5)
            if now >= (expires_at - buffer):
                logger.info("Access token is expired or about to expire")
                return None
            
            return tokens['access_token']
            
        except Exception as e:
            logger.error(f"Error checking token validity: {e}")
            return None
    
    @staticmethod
    def get_refresh_token() -> Optional[str]:
        """
        Get the refresh token.
        
        Returns:
            Refresh token or None if not found
        """
        tokens = TokenManager.get_tokens()
        if not tokens:
            return None
        
        return tokens.get('refresh_token')
    
    @staticmethod
    def is_token_expired() -> bool:
        """
        Check if the stored access token is expired.
        
        Returns:
            True if expired, False if valid, None if no token
        """
        tokens = TokenManager.get_tokens()
        if not tokens:
            return True
        
        try:
            expires_at = datetime.fromisoformat(tokens['expires_at'])
            now = datetime.now(timezone.utc)
            
            return now >= expires_at
            
        except Exception as e:
            logger.error(f"Error checking token expiration: {e}")
            return True
    
    @staticmethod
    def update_tokens(
        access_token: str,
        expires_in: int,
        refresh_token: Optional[str] = None,
        token_type: str = "Bearer",
        scope: Optional[str] = None
    ) -> bool:
        """
        Update stored tokens (typically after refresh).
        
        Args:
            access_token: New access token
            expires_in: Token expiration time in seconds
            refresh_token: New refresh token (if provided)
            token_type: Token type
            scope: Token scopes
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Get existing token data
            existing_tokens = TokenManager.get_tokens()
            if not existing_tokens:
                logger.error("No existing tokens found to update")
                return False
            
            # Update tokens
            expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
            
            existing_tokens.update({
                'access_token': access_token,
                'expires_at': expires_at.isoformat(),
                'token_type': token_type,
                'updated_at': datetime.now(timezone.utc).isoformat()
            })
            
            if refresh_token:
                existing_tokens['refresh_token'] = refresh_token
            
            if scope:
                existing_tokens['scope'] = scope
            
            # Store updated tokens
            return TokenManager._store_token_data(existing_tokens)
            
        except Exception as e:
            logger.error(f"Error updating tokens: {e}")
            return False
    
    @staticmethod
    def _store_token_data(token_data: Dict[str, Any]) -> bool:
        """
        Helper method to store token data.
        
        Args:
            token_data: Token data dictionary
            
        Returns:
            True if successful, False otherwise
        """
        try:
            token_json = json.dumps(token_data)
            
            # Encrypt
            key = AccountService._get_encryption_key()
            from cryptography.fernet import Fernet
            cipher = Fernet(key)
            encrypted_bytes = cipher.encrypt(token_json.encode())
            
            # Store
            tokens_path = TokenManager._get_tokens_path()
            with open(tokens_path, 'wb') as f:
                f.write(encrypted_bytes)
            
            logger.info("Token data updated successfully")
            return True
            
        except Exception as e:
            logger.error(f"Error storing token data: {e}")
            return False
    
    @staticmethod
    def delete_tokens() -> bool:
        """
        Delete stored OAuth2 tokens.
        
        Returns:
            True if successful, False otherwise
        """
        try:
            tokens_path = TokenManager._get_tokens_path()
            
            if tokens_path.exists():
                tokens_path.unlink()
                logger.info("OAuth2 tokens deleted successfully")
            
            return True
            
        except Exception as e:
            logger.error(f"Error deleting OAuth2 tokens: {e}")
            return False
    
    @staticmethod
    def has_tokens() -> bool:
        """
        Check if OAuth2 tokens are stored.
        
        Returns:
            True if tokens exist, False otherwise
        """
        return TokenManager._get_tokens_path().exists()
    
    @staticmethod
    def get_user_info() -> Optional[Dict[str, Any]]:
        """
        Get stored user information.
        
        Returns:
            User info dictionary or None
        """
        tokens = TokenManager.get_tokens()
        if not tokens:
            return None
        
        return tokens.get('user_info', {})
    
    @staticmethod
    def get_token_scopes() -> Optional[str]:
        """
        Get token scopes.
        
        Returns:
            Space-separated scopes string or None
        """
        tokens = TokenManager.get_tokens()
        if not tokens:
            return None
        
        return tokens.get('scope')
    
    @staticmethod
    def get_token_info() -> Optional[Dict[str, Any]]:
        """
        Get token information for status checks.
        
        Returns:
            Token info dictionary with status information
        """
        tokens = TokenManager.get_tokens()
        if not tokens:
            return None
        
        try:
            expires_at = datetime.fromisoformat(tokens['expires_at'])
            now = datetime.now(timezone.utc)
            is_expired = now >= expires_at
            
            return {
                'has_tokens': True,
                'is_expired': is_expired,
                'expires_at': expires_at,
                'token_type': tokens.get('token_type', 'Bearer'),
                'scopes': tokens.get('scope', '').split() if tokens.get('scope') else [],
                'user_info': tokens.get('user_info', {}),
                'stored_at': tokens.get('stored_at'),
                'updated_at': tokens.get('updated_at')
            }
            
        except Exception as e:
            logger.error(f"Error getting token info: {e}")
            return {
                'has_tokens': True,
                'is_expired': True,
                'error': str(e)
            }