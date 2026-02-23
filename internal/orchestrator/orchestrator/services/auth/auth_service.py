"""Main OAuth2 authentication service orchestrator."""

import asyncio
import logging
import webbrowser
from typing import Dict, Any, Optional, Tuple
from datetime import datetime, timezone

from .oauth_client import OAuth2Client
from .callback_server import CallbackManager
from .token_manager import TokenManager
from .exceptions import (
    OAuth2Error, 
    TokenExpiredError, 
    CallbackTimeoutError, 
    InvalidAuthCodeError,
    CallbackServerError
)

logger = logging.getLogger(__name__)


class AuthenticationService:
    """Main service for handling OAuth2 authentication flow."""
    
    def __init__(
        self,
        client_id: str,
        authorization_url: str,
        token_url: str,
        scopes: list[str] = None,
        callback_port: int = 4689,
        callback_timeout: int = 300
    ):
        """
        Initialize authentication service.
        
        Args:
            client_id: OAuth2 client ID
            authorization_url: Authorization endpoint URL
            token_url: Token endpoint URL
            scopes: List of OAuth2 scopes
            callback_port: Port for local callback server
            callback_timeout: Callback timeout in seconds
        """
        self.client_id = client_id
        self.scopes = scopes or []
        self.callback_port = callback_port
        self.callback_timeout = callback_timeout
        
        # Initialize callback manager to get dynamic redirect URI
        self.callback_manager = CallbackManager(callback_port, callback_timeout)
        redirect_uri = self.callback_manager.get_redirect_uri()
        
        # Initialize OAuth2 client
        self.oauth_client = OAuth2Client(
            client_id=client_id,
            authorization_url=authorization_url,
            token_url=token_url,
            redirect_uri=redirect_uri,
            scopes=scopes
        )
        
        # Session storage for active authentication flows
        self._active_sessions: Dict[str, Dict[str, Any]] = {}
    
    def is_authenticated(self) -> bool:
        """
        Check if user is currently authenticated with valid tokens.
        
        Returns:
            True if authenticated with valid tokens
        """
        return TokenManager.get_valid_access_token() is not None
    
    def get_authentication_status(self) -> Dict[str, Any]:
        """
        Get detailed authentication status.
        
        Returns:
            Authentication status dictionary
        """
        token_info = TokenManager.get_token_info()
        
        if not token_info:
            return {
                'authenticated': False,
                'has_tokens': False,
                'user_info': None,
                'expires_at': None,
                'scopes': []
            }
        
        return {
            'authenticated': not token_info.get('is_expired', True),
            'has_tokens': token_info.get('has_tokens', False),
            'is_expired': token_info.get('is_expired', True),
            'user_info': token_info.get('user_info', {}),
            'expires_at': token_info.get('expires_at'),
            'scopes': token_info.get('scopes', []),
            'token_type': token_info.get('token_type', 'Bearer')
        }
    
    async def initiate_login(
        self, 
        open_browser: bool = True,
        additional_params: Dict[str, str] = None
    ) -> Dict[str, Any]:
        """
        Initiate OAuth2 login flow.
        
        Args:
            open_browser: Whether to automatically open browser
            additional_params: Additional OAuth2 parameters
            
        Returns:
            Login initiation result with auth URL and session info
        """
        try:
            # Generate PKCE pair and state
            code_verifier, code_challenge = self.oauth_client.generate_pkce_pair()
            state = self.oauth_client.generate_state()
            
            # Build authorization URL
            auth_url = self.oauth_client.build_authorization_url(
                code_challenge=code_challenge,
                state=state,
                additional_params=additional_params
            )
            
            # Store session information
            session_info = {
                'code_verifier': code_verifier,
                'code_challenge': code_challenge,
                'state': state,
                'auth_url': auth_url,
                'created_at': datetime.now(timezone.utc).isoformat(),
                'callback_port': self.callback_port
            }
            
            self._active_sessions[state] = session_info
            
            # Optionally open browser
            if open_browser:
                try:
                    webbrowser.open(auth_url)
                    logger.info("Opened browser for OAuth2 authentication")
                except Exception as e:
                    logger.warning(f"Failed to open browser: {e}")
            
            return {
                'success': True,
                'auth_url': auth_url,
                'session_id': state,
                'callback_port': self.callback_port,
                'expires_in': self.callback_timeout,
                'message': 'OAuth2 login initiated. Please complete authentication in your browser.'
            }
            
        except Exception as e:
            logger.error(f"Error initiating OAuth2 login: {e}")
            return {
                'success': False,
                'error': str(e),
                'message': 'Failed to initiate OAuth2 login'
            }
    
    async def complete_login_with_callback(self, session_id: str) -> Dict[str, Any]:
        """
        Complete login by waiting for callback.
        
        Args:
            session_id: Session ID from login initiation
            
        Returns:
            Login completion result
        """
        try:
            # Validate session
            if session_id not in self._active_sessions:
                raise OAuth2Error(f"Invalid session ID: {session_id}")
            
            session_info = self._active_sessions[session_id]
            
            # Wait for callback
            callback_result = await self.callback_manager.handle_callback()
            
            # Process callback result
            return await self._process_callback_result(
                callback_result, 
                session_info, 
                session_id
            )
            
        except CallbackTimeoutError as e:
            logger.warning(f"OAuth2 callback timed out for session {session_id}")
            return {
                'success': False,
                'error': 'callback_timeout',
                'message': str(e),
                'fallback_available': True,
                'session_id': session_id
            }
        except Exception as e:
            logger.error(f"Error completing OAuth2 login: {e}")
            # Clean up session
            self._active_sessions.pop(session_id, None)
            return {
                'success': False,
                'error': str(e),
                'message': 'Failed to complete OAuth2 login'
            }
    
    async def complete_login_with_code(
        self, 
        session_id: str, 
        authorization_code: str
    ) -> Dict[str, Any]:
        """
        Complete login with manually entered authorization code.
        
        Args:
            session_id: Session ID from login initiation
            authorization_code: Authorization code from user
            
        Returns:
            Login completion result
        """
        try:
            # Validate session
            if session_id not in self._active_sessions:
                raise OAuth2Error(f"Invalid session ID: {session_id}")
            
            session_info = self._active_sessions[session_id]
            
            # Create callback result structure
            callback_result = {
                'code': authorization_code,
                'state': session_info['state'],
                'error': None,
                'error_description': None,
                'success': True
            }
            
            # Process callback result
            return await self._process_callback_result(
                callback_result, 
                session_info, 
                session_id
            )
            
        except Exception as e:
            logger.error(f"Error completing OAuth2 login with code: {e}")
            # Clean up session
            self._active_sessions.pop(session_id, None)
            return {
                'success': False,
                'error': str(e),
                'message': 'Failed to complete OAuth2 login with authorization code'
            }
    
    async def _process_callback_result(
        self, 
        callback_result: Dict[str, Any], 
        session_info: Dict[str, Any], 
        session_id: str
    ) -> Dict[str, Any]:
        """Process OAuth2 callback result."""
        try:
            # Check for callback errors
            if not callback_result['success'] or callback_result.get('error'):
                error_msg = callback_result.get('error_description') or callback_result.get('error', 'Unknown error')
                raise OAuth2Error(f"OAuth2 authorization failed: {error_msg}")
            
            # Validate state parameter
            if callback_result['state'] != session_info['state']:
                raise OAuth2Error("Invalid state parameter - possible CSRF attack")
            
            # Get authorization code
            auth_code = callback_result['code']
            if not auth_code:
                raise OAuth2Error("No authorization code received")
            
            # Exchange code for tokens
            token_response = await self.oauth_client.exchange_code_for_tokens(
                authorization_code=auth_code,
                code_verifier=session_info['code_verifier']
            )
            
            # Store tokens
            success = TokenManager.store_tokens(
                access_token=token_response['access_token'],
                refresh_token=token_response['refresh_token'],
                expires_in=token_response['expires_in'],
                token_type=token_response.get('token_type', 'Bearer'),
                scope=token_response.get('scope')
            )
            
            if not success:
                raise OAuth2Error("Failed to store authentication tokens")
            
            # Clean up session
            self._active_sessions.pop(session_id, None)
            
            logger.info("OAuth2 login completed successfully")
            return {
                'success': True,
                'message': 'Authentication completed successfully',
                'token_info': {
                    'token_type': token_response.get('token_type', 'Bearer'),
                    'expires_in': token_response['expires_in'],
                    'scope': token_response.get('scope')
                }
            }
            
        except Exception as e:
            logger.error(f"Error processing OAuth2 callback: {e}")
            # Clean up session
            self._active_sessions.pop(session_id, None)
            raise
    
    async def refresh_tokens(self) -> Dict[str, Any]:
        """
        Refresh access tokens using refresh token.
        
        Returns:
            Token refresh result
        """
        try:
            # Get refresh token
            refresh_token = TokenManager.get_refresh_token()
            if not refresh_token:
                raise TokenExpiredError("No refresh token available")
            
            # Refresh tokens
            token_response = await self.oauth_client.refresh_access_token(refresh_token)
            
            # Update stored tokens
            success = TokenManager.update_tokens(
                access_token=token_response['access_token'],
                expires_in=token_response['expires_in'],
                refresh_token=token_response.get('refresh_token', refresh_token),  # Use new or keep existing
                token_type=token_response.get('token_type', 'Bearer'),
                scope=token_response.get('scope')
            )
            
            if not success:
                raise OAuth2Error("Failed to update refreshed tokens")
            
            logger.info("Access tokens refreshed successfully")
            return {
                'success': True,
                'message': 'Tokens refreshed successfully',
                'expires_in': token_response['expires_in']
            }
            
        except TokenExpiredError:
            # Refresh token is expired, need to re-authenticate
            logger.warning("Refresh token expired, full re-authentication required")
            TokenManager.delete_tokens()
            return {
                'success': False,
                'error': 'refresh_token_expired',
                'message': 'Refresh token expired. Please log in again.',
                'requires_login': True
            }
        except Exception as e:
            logger.error(f"Error refreshing tokens: {e}")
            return {
                'success': False,
                'error': str(e),
                'message': 'Failed to refresh authentication tokens'
            }
    
    def logout(self) -> Dict[str, Any]:
        """
        Logout user by clearing stored tokens.
        
        Returns:
            Logout result
        """
        try:
            # Clear stored tokens
            success = TokenManager.delete_tokens()
            
            # Clear active sessions
            self._active_sessions.clear()
            
            if success:
                logger.info("User logged out successfully")
                return {
                    'success': True,
                    'message': 'Logged out successfully'
                }
            else:
                return {
                    'success': False,
                    'message': 'Failed to clear authentication data'
                }
                
        except Exception as e:
            logger.error(f"Error during logout: {e}")
            return {
                'success': False,
                'error': str(e),
                'message': 'Logout failed'
            }
    
    def get_access_token(self) -> Optional[str]:
        """
        Get valid access token, attempting refresh if needed.
        
        Returns:
            Valid access token or None if unavailable
        """
        # Try to get valid access token
        access_token = TokenManager.get_valid_access_token()
        
        if access_token:
            return access_token
        
        # Token is expired or not found
        logger.info("Access token expired or not found, attempting refresh")
        
        # Note: In a real application, you might want to handle async refresh
        # This method is kept synchronous for simplicity
        # Consider creating an async version for automatic refresh
        return None
    
    async def ensure_valid_token(self) -> Optional[str]:
        """
        Ensure we have a valid access token, refreshing if necessary.
        
        Returns:
            Valid access token or None if unavailable/refresh failed
        """
        # Try to get valid access token
        access_token = TokenManager.get_valid_access_token()
        
        if access_token:
            return access_token
        
        # Try to refresh
        refresh_result = await self.refresh_tokens()
        
        if refresh_result['success']:
            return TokenManager.get_valid_access_token()
        
        return None
    
    def cleanup_expired_sessions(self):
        """Clean up expired authentication sessions."""
        try:
            current_time = datetime.now(timezone.utc)
            expired_sessions = []
            
            for session_id, session_info in self._active_sessions.items():
                created_at = datetime.fromisoformat(session_info['created_at'])
                if (current_time - created_at).total_seconds() > self.callback_timeout:
                    expired_sessions.append(session_id)
            
            for session_id in expired_sessions:
                self._active_sessions.pop(session_id, None)
                logger.info(f"Cleaned up expired session: {session_id}")
                
        except Exception as e:
            logger.error(f"Error cleaning up expired sessions: {e}")
    
    def get_session_info(self, session_id: str) -> Optional[Dict[str, Any]]:
        """
        Get information about an active session.
        
        Args:
            session_id: Session ID
            
        Returns:
            Session info dictionary or None if not found
        """
        session_info = self._active_sessions.get(session_id)
        
        if not session_info:
            return None
        
        # Don't expose sensitive information
        return {
            'session_id': session_id,
            'created_at': session_info['created_at'],
            'callback_port': session_info['callback_port'],
            'auth_url': session_info['auth_url']
        }