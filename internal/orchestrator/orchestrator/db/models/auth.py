"""Pydantic models for OAuth2 authentication."""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


class AuthInitRequest(BaseModel):
    """Request to initiate OAuth2 authentication flow."""
    
    open_browser: bool = Field(default=True, description="Whether to automatically open browser")
    additional_params: Optional[Dict[str, str]] = Field(
        default=None, 
        description="Additional OAuth2 parameters"
    )


class AuthInitResponse(BaseModel):
    """Response from OAuth2 authentication initiation."""
    
    success: bool = Field(description="Whether initiation was successful")
    auth_url: Optional[str] = Field(default=None, description="OAuth2 authorization URL")
    session_id: Optional[str] = Field(default=None, description="Session ID for this auth flow")
    callback_port: Optional[int] = Field(default=None, description="Local callback server port")
    expires_in: Optional[int] = Field(default=None, description="Session timeout in seconds")
    message: str = Field(description="Human-readable status message")
    error: Optional[str] = Field(default=None, description="Error code if failed")


class AuthCallbackRequest(BaseModel):
    """Request for manual authorization code entry."""
    
    session_id: str = Field(description="Session ID from auth initiation")
    auth_code: str = Field(description="Authorization code from browser")


class AuthCallbackResponse(BaseModel):
    """Response from authorization code processing."""
    
    success: bool = Field(description="Whether authentication was successful")
    message: str = Field(description="Human-readable status message")
    error: Optional[str] = Field(default=None, description="Error code if failed")
    token_info: Optional[Dict[str, Any]] = Field(
        default=None, 
        description="Token information if successful"
    )
    requires_login: Optional[bool] = Field(
        default=None, 
        description="Whether user needs to log in again"
    )
    fallback_available: Optional[bool] = Field(
        default=None, 
        description="Whether manual code entry is available"
    )
    session_id: Optional[str] = Field(
        default=None, 
        description="Session ID for fallback scenarios"
    )


class AuthStatusResponse(BaseModel):
    """Current authentication status."""
    
    authenticated: bool = Field(description="Whether user is currently authenticated")
    has_tokens: bool = Field(description="Whether tokens are stored")
    is_expired: Optional[bool] = Field(
        default=None, 
        description="Whether stored tokens are expired"
    )
    user_info: Optional[Dict[str, Any]] = Field(
        default=None, 
        description="User profile information"
    )
    expires_at: Optional[datetime] = Field(
        default=None, 
        description="Token expiration time"
    )
    scopes: List[str] = Field(
        default_factory=list, 
        description="Granted OAuth2 scopes"
    )
    token_type: Optional[str] = Field(
        default=None, 
        description="Token type (usually Bearer)"
    )


class AuthRefreshRequest(BaseModel):
    """Request to refresh access tokens."""
    
    force: bool = Field(
        default=False, 
        description="Force refresh even if token is not expired"
    )


class AuthRefreshResponse(BaseModel):
    """Response from token refresh operation."""
    
    success: bool = Field(description="Whether token refresh was successful")
    message: str = Field(description="Human-readable status message")
    expires_in: Optional[int] = Field(
        default=None, 
        description="New token expiration time in seconds"
    )
    error: Optional[str] = Field(default=None, description="Error code if failed")
    requires_login: Optional[bool] = Field(
        default=None, 
        description="Whether user needs to log in again"
    )


class AuthLogoutResponse(BaseModel):
    """Response from logout operation."""
    
    success: bool = Field(description="Whether logout was successful")
    message: str = Field(description="Human-readable status message")
    error: Optional[str] = Field(default=None, description="Error code if failed")


class TokenInfo(BaseModel):
    """OAuth2 token information."""
    
    access_token: str = Field(description="OAuth2 access token")
    refresh_token: str = Field(description="OAuth2 refresh token")
    expires_in: int = Field(description="Token expiration time in seconds")
    token_type: str = Field(default="Bearer", description="Token type")
    scope: Optional[str] = Field(default=None, description="Granted scopes")


class UserInfo(BaseModel):
    """User profile information from OAuth2 provider."""
    
    user_id: Optional[str] = Field(default=None, description="User ID")
    email: Optional[str] = Field(default=None, description="User email")
    name: Optional[str] = Field(default=None, description="User display name")
    username: Optional[str] = Field(default=None, description="Username")
    avatar_url: Optional[str] = Field(default=None, description="User avatar URL")
    verified: Optional[bool] = Field(default=None, description="Whether user is verified")


class SessionInfo(BaseModel):
    """Active authentication session information."""
    
    session_id: str = Field(description="Unique session identifier")
    created_at: datetime = Field(description="Session creation time")
    callback_port: int = Field(description="Local callback server port")
    auth_url: str = Field(description="OAuth2 authorization URL for this session")
    expires_at: Optional[datetime] = Field(
        default=None, 
        description="Session expiration time"
    )


class AuthError(BaseModel):
    """Authentication error details."""
    
    error_code: str = Field(description="Machine-readable error code")
    error_message: str = Field(description="Human-readable error message")
    error_description: Optional[str] = Field(
        default=None, 
        description="Detailed error description"
    )
    timestamp: datetime = Field(description="Error timestamp")
    session_id: Optional[str] = Field(
        default=None, 
        description="Associated session ID if applicable"
    )


# Legacy compatibility models for gradual migration
class LicenseKeyRequest(BaseModel):
    """Legacy license key request model."""
    license_key: str


class LicenseKeyResponse(BaseModel):
    """Legacy license key response model."""
    success: bool
    message: str
    license_key: Optional[str] = None


# Configuration models
class OAuth2Config(BaseModel):
    """OAuth2 configuration settings."""
    
    enabled: bool = Field(default=False, description="Whether OAuth2 is enabled")
    client_id: str = Field(description="OAuth2 client ID")
    authorization_url: str = Field(description="OAuth2 authorization endpoint")
    token_url: str = Field(description="OAuth2 token endpoint")
    scopes: List[str] = Field(
        default_factory=list, 
        description="Default OAuth2 scopes to request"
    )
    callback_port: int = Field(
        default=4689, 
        description="Default port for local callback server"
    )
    callback_timeout: int = Field(
        default=300, 
        description="Callback timeout in seconds"
    )


class AuthConfig(BaseModel):
    """Complete authentication configuration."""
    
    oauth2: OAuth2Config = Field(description="OAuth2 configuration")
    fallback_to_license: bool = Field(
        default=True, 
        description="Whether to fall back to license key auth"
    )
    auto_refresh_tokens: bool = Field(
        default=True, 
        description="Whether to automatically refresh expired tokens"
    )
    debug_mode: bool = Field(
        default=False, 
        description="Whether to enable auth debug logging"
    )