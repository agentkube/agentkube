"""OAuth2 client with PKCE support for Agentkube desktop authentication."""

import secrets
import hashlib
import base64
import uuid
from typing import Dict, Optional, Tuple
from urllib.parse import urlencode, parse_qs, urlparse
import httpx
import logging

from .exceptions import OAuth2Error, TokenExpiredError, TokenRefreshError

logger = logging.getLogger(__name__)


class OAuth2Client:
    """OAuth2 client with PKCE (Proof Key for Code Exchange) support."""
    
    def __init__(
        self,
        client_id: str,
        authorization_url: str,
        token_url: str,
        redirect_uri: str,
        scopes: list[str] = None
    ):
        self.client_id = client_id
        self.authorization_url = authorization_url
        self.token_url = token_url
        self.redirect_uri = redirect_uri
        self.scopes = scopes or []
        
    def generate_pkce_pair(self) -> Tuple[str, str]:
        """
        Generate PKCE code verifier and challenge.
        
        Returns:
            Tuple of (code_verifier, code_challenge)
        """
        # Generate a cryptographically secure random string
        code_verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode('utf-8')
        # Remove padding characters
        code_verifier = code_verifier.rstrip('=')
        
        # Create SHA256 hash of the verifier
        code_challenge = hashlib.sha256(code_verifier.encode('utf-8')).digest()
        # Base64 URL-safe encode the hash
        code_challenge = base64.urlsafe_b64encode(code_challenge).decode('utf-8')
        # Remove padding characters
        code_challenge = code_challenge.rstrip('=')
        
        logger.debug("Generated PKCE pair")
        return code_verifier, code_challenge
    
    def generate_state(self) -> str:
        """
        Generate a random state parameter for CSRF protection.
        
        Returns:
            Random state string
        """
        return str(uuid.uuid4())
    
    def build_authorization_url(
        self, 
        code_challenge: str, 
        state: str,
        additional_params: Dict[str, str] = None
    ) -> str:
        """
        Build the OAuth2 authorization URL with PKCE parameters.
        
        Args:
            code_challenge: PKCE code challenge
            state: State parameter for CSRF protection
            additional_params: Additional query parameters
            
        Returns:
            Complete authorization URL
        """
        params = {
            'client_id': self.client_id,
            'response_type': 'code',
            'redirect_uri': self.redirect_uri,
            'code_challenge': code_challenge,
            'code_challenge_method': 'S256',
            'state': state,
        }
        
        if self.scopes:
            params['scope'] = ' '.join(self.scopes)
            
        if additional_params:
            params.update(additional_params)
        
        url = f"{self.authorization_url}?{urlencode(params)}"
        logger.info(f"Built authorization URL with state: {state}")
        return url
    
    async def exchange_code_for_tokens(
        self, 
        authorization_code: str, 
        code_verifier: str
    ) -> Dict[str, any]:
        """
        Exchange authorization code for access and refresh tokens.
        
        Args:
            authorization_code: Authorization code from callback
            code_verifier: PKCE code verifier
            
        Returns:
            Token response dictionary
            
        Raises:
            OAuth2Error: If token exchange fails
        """
        data = {
            'grant_type': 'authorization_code',
            'client_id': self.client_id,
            'code': authorization_code,
            'redirect_uri': self.redirect_uri,
            'code_verifier': code_verifier,
        }
        
        headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
        }
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    self.token_url,
                    data=data,
                    headers=headers
                )
                
                if response.status_code != 200:
                    error_detail = "Unknown error"
                    try:
                        error_response = response.json()
                        error_detail = error_response.get('error_description', 
                                                        error_response.get('error', 'Unknown error'))
                    except:
                        error_detail = response.text
                    
                    raise OAuth2Error(f"Token exchange failed: {error_detail}")
                
                token_data = response.json()
                logger.info("Successfully exchanged authorization code for tokens")
                return token_data
                
        except httpx.RequestError as e:
            logger.error(f"Network error during token exchange: {e}")
            raise OAuth2Error(f"Network error during token exchange: {str(e)}")
        except Exception as e:
            logger.error(f"Unexpected error during token exchange: {e}")
            raise OAuth2Error(f"Token exchange failed: {str(e)}")
    
    async def refresh_access_token(self, refresh_token: str) -> Dict[str, any]:
        """
        Refresh access token using refresh token.
        
        Args:
            refresh_token: Refresh token
            
        Returns:
            New token response dictionary
            
        Raises:
            TokenRefreshError: If token refresh fails
        """
        data = {
            'grant_type': 'refresh_token',
            'client_id': self.client_id,
            'refresh_token': refresh_token,
        }
        
        headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
        }
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    self.token_url,
                    data=data,
                    headers=headers
                )
                
                if response.status_code != 200:
                    error_detail = "Unknown error"
                    try:
                        error_response = response.json()
                        error_detail = error_response.get('error_description', 
                                                        error_response.get('error', 'Unknown error'))
                    except:
                        error_detail = response.text
                    
                    # Check if refresh token is invalid/expired
                    if response.status_code == 400 and 'invalid_grant' in error_detail:
                        raise TokenExpiredError("Refresh token has expired")
                    
                    raise TokenRefreshError(f"Token refresh failed: {error_detail}")
                
                token_data = response.json()
                logger.info("Successfully refreshed access token")
                return token_data
                
        except httpx.RequestError as e:
            logger.error(f"Network error during token refresh: {e}")
            raise TokenRefreshError(f"Network error during token refresh: {str(e)}")
        except (TokenExpiredError, TokenRefreshError):
            raise
        except Exception as e:
            logger.error(f"Unexpected error during token refresh: {e}")
            raise TokenRefreshError(f"Token refresh failed: {str(e)}")
    
    def parse_callback_url(self, callback_url: str) -> Tuple[Optional[str], Optional[str], Optional[str]]:
        """
        Parse callback URL to extract authorization code, state, and error.
        
        Args:
            callback_url: Full callback URL with query parameters
            
        Returns:
            Tuple of (authorization_code, state, error)
        """
        try:
            parsed = urlparse(callback_url)
            params = parse_qs(parsed.query)
            
            code = params.get('code', [None])[0]
            state = params.get('state', [None])[0]
            error = params.get('error', [None])[0]
            
            return code, state, error
        except Exception as e:
            logger.error(f"Error parsing callback URL: {e}")
            return None, None, f"Failed to parse callback URL: {str(e)}"