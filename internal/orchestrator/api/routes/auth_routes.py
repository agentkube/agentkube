"""OAuth2 authentication API routes."""

import logging
import sys
import os
from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse, HTMLResponse

from orchestrator.db.models.auth import (
    AuthInitRequest,
    AuthInitResponse,
    AuthCallbackRequest,
    AuthCallbackResponse,
    AuthStatusResponse,
    AuthRefreshRequest,
    AuthRefreshResponse,
    AuthLogoutResponse
)
from orchestrator.services.auth.auth_service import AuthenticationService
from orchestrator.services.auth.exceptions import OAuth2Error, CallbackTimeoutError
from config.auth_config import get_auth_config, is_oauth2_enabled
from config.config import get_agentkube_server_url

# Add utils directory to path for HTML templates
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from api.utils.html_templates import get_success_html, get_error_html

logger = logging.getLogger(__name__)

# Global authentication service instance
_auth_service = None


def get_auth_service() -> AuthenticationService:
    """Get or create the authentication service instance."""
    global _auth_service
    
    if _auth_service is None:
        config = get_auth_config()
        
        _auth_service = AuthenticationService(
            client_id=config.client_id,
            authorization_url=config.authorization_url,
            token_url=config.token_url,
            scopes=config.scopes,
            callback_port=config.callback_port,
            callback_timeout=config.callback_timeout
        )
        
        logger.info("Authentication service initialized")
    
    return _auth_service


def setup_auth_routes(router: APIRouter) -> APIRouter:
    """
    Setup OAuth2 authentication routes.
    
    Args:
        router: FastAPI router instance
        
    Returns:
        Router with auth routes added
    """
    
    @router.post("/orchestrator/api/auth/login", response_model=AuthInitResponse)
    async def initiate_login(request: AuthInitRequest = None):
        """Initiate OAuth2 login flow."""
        try:
            # Check if OAuth2 is enabled
            if not is_oauth2_enabled():
                return AuthInitResponse(
                    success=False,
                    message="OAuth2 authentication is not enabled",
                    error="oauth2_disabled"
                )
            
            # Use default request if none provided
            if request is None:
                request = AuthInitRequest()
            
            auth_service = get_auth_service()
            
            # Clean up any expired sessions
            auth_service.cleanup_expired_sessions()
            
            # Initiate login flow
            result = await auth_service.initiate_login(
                open_browser=request.open_browser,
                additional_params=request.additional_params
            )
            
            return AuthInitResponse(**result)
            
        except Exception as e:
            logger.error(f"Error initiating OAuth2 login: {e}")
            return AuthInitResponse(
                success=False,
                message=f"Failed to initiate login: {str(e)}",
                error="login_initiation_failed"
            )
    
    @router.post("/orchestrator/api/auth/callback", response_model=AuthCallbackResponse)
    async def handle_manual_callback(
        request: AuthCallbackRequest,
        background_tasks: BackgroundTasks
    ):
        """Handle manual authorization code entry."""
        try:
            if not is_oauth2_enabled():
                raise HTTPException(
                    status_code=400,
                    detail="OAuth2 authentication is not enabled"
                )
            
            auth_service = get_auth_service()
            
            # Complete login with manual code
            result = await auth_service.complete_login_with_code(
                session_id=request.session_id,
                authorization_code=request.auth_code
            )
            
            # Schedule session cleanup
            background_tasks.add_task(auth_service.cleanup_expired_sessions)
            
            return AuthCallbackResponse(**result)
            
        except Exception as e:
            logger.error(f"Error handling manual callback: {e}")
            return AuthCallbackResponse(
                success=False,
                message=f"Authentication failed: {str(e)}",
                error="callback_processing_failed"
            )
    
    @router.get("/orchestrator/api/auth/status", response_model=AuthStatusResponse)
    async def get_auth_status():
        """Get current authentication status."""
        try:
            if not is_oauth2_enabled():
                return AuthStatusResponse(
                    authenticated=False,
                    has_tokens=False,
                    user_info=None,
                    expires_at=None,
                    scopes=[]
                )
            
            # Use SessionService instead of AuthenticationService
            from orchestrator.services.account.session import SessionService
            
            # Check if we have a session stored
            if not SessionService.has_oauth2_session():
                return AuthStatusResponse(
                    authenticated=False,
                    has_tokens=False,
                    user_info=None,
                    expires_at=None,
                    scopes=[]
                )
            
            # Get session data
            session_data = SessionService.get_oauth2_session()
            if not session_data:
                return AuthStatusResponse(
                    authenticated=False,
                    has_tokens=False,
                    user_info=None,
                    expires_at=None,
                    scopes=[]
                )
            
            # Sessions don't expire automatically - only through logout
            is_expired = False
            
            # No expiration time for persistent sessions
            expires_at = None
            
            # Parse scopes
            scopes = []
            if session_data.get('scope'):
                scopes = session_data['scope'].split()
            
            # Get user info
            user_info = session_data.get('user_info', {})
            
            return AuthStatusResponse(
                authenticated=not is_expired,
                has_tokens=True,
                is_expired=is_expired,
                user_info=user_info,
                expires_at=expires_at,
                scopes=scopes,
                token_type=session_data.get('token_type', 'Bearer')
            )
            
        except Exception as e:
            logger.error(f"Error getting auth status: {e}")
            return AuthStatusResponse(
                authenticated=False,
                has_tokens=False,
                user_info=None,
                expires_at=None,
                scopes=[]
            )
    
    @router.post("/orchestrator/api/auth/refresh", response_model=AuthRefreshResponse)
    async def refresh_tokens(request: AuthRefreshRequest = None):
        """Refresh OAuth2 access tokens."""
        try:
            if not is_oauth2_enabled():
                return AuthRefreshResponse(
                    success=False,
                    message="OAuth2 authentication is not enabled",
                    error="oauth2_disabled"
                )
            
            # Use default request if none provided
            if request is None:
                request = AuthRefreshRequest()
            
            auth_service = get_auth_service()
            
            # Check if refresh is needed (unless forced)
            if not request.force and auth_service.is_authenticated():
                return AuthRefreshResponse(
                    success=True,
                    message="Tokens are still valid, no refresh needed"
                )
            
            # Refresh tokens
            result = await auth_service.refresh_tokens()
            
            return AuthRefreshResponse(**result)
            
        except Exception as e:
            logger.error(f"Error refreshing tokens: {e}")
            return AuthRefreshResponse(
                success=False,
                message=f"Token refresh failed: {str(e)}",
                error="token_refresh_failed"
            )
    
    @router.post("/orchestrator/api/auth/logout", response_model=AuthLogoutResponse)
    async def logout(background_tasks: BackgroundTasks):
        """Logout user and clear authentication tokens."""
        try:
            if not is_oauth2_enabled():
                return AuthLogoutResponse(
                    success=True,
                    message="OAuth2 not enabled, no logout needed"
                )
            
            # Use SessionService to delete the OAuth2 session (consistent with login/status)
            from orchestrator.services.account.session import SessionService
            
            # Delete the OAuth2 session
            session_deleted = SessionService.delete_oauth2_session()
            
            if session_deleted:
                logger.info("OAuth2 session deleted successfully during logout")
                return AuthLogoutResponse(
                    success=True,
                    message="Logged out successfully"
                )
            else:
                logger.warning("No OAuth2 session found to delete during logout")
                return AuthLogoutResponse(
                    success=True,
                    message="Logged out successfully (no active session)"
                )
            
        except Exception as e:
            logger.error(f"Error during logout: {e}")
            return AuthLogoutResponse(
                success=False,
                message=f"Logout failed: {str(e)}",
                error="logout_failed"
            )
    
    @router.get("/orchestrator/api/auth/config")
    async def get_auth_config_info():
        """Get public authentication configuration information."""
        try:
            config = get_auth_config()
            
            # Return only public configuration information
            public_config = {
                "oauth2_enabled": config.enabled,
                "client_id": config.client_id,
                "authorization_url": config.authorization_url if config.enabled else None,
                "scopes": config.scopes if config.enabled else [],
                "callback_port": config.callback_port if config.enabled else None,
                "callback_timeout": config.callback_timeout if config.enabled else None,
                "fallback_to_license": config.fallback_to_license,
                "server_base_url": config.server_base_url if config.enabled else None
            }
            
            return JSONResponse(content=public_config)
            
        except Exception as e:
            logger.error(f"Error getting auth config: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to get auth configuration: {str(e)}"
            )
    
    @router.get("/orchestrator/api/auth/session/{session_id}")
    async def get_session_info(session_id: str):
        """Get information about an active authentication session."""
        try:
            if not is_oauth2_enabled():
                raise HTTPException(
                    status_code=400,
                    detail="OAuth2 authentication is not enabled"
                )
            
            auth_service = get_auth_service()
            session_info = auth_service.get_session_info(session_id)
            
            if not session_info:
                raise HTTPException(
                    status_code=404,
                    detail=f"Session {session_id} not found or expired"
                )
            
            return JSONResponse(content=session_info)
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error getting session info: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to get session information: {str(e)}"
            )
    
    # Direct callback endpoint (for browser redirects)
    @router.get("/callback")
    async def handle_browser_callback(
        code: str = None,
        state: str = None,
        error: str = None,
        error_description: str = None
    ):
        """Handle OAuth2 callback from browser redirect."""
        try:
            logger.info(f"Received OAuth2 callback - code: {'present' if code else 'missing'}, state: {state}, error: {error}")
            
            if error:
                logger.error(f"OAuth2 callback error: {error} - {error_description}")
                
                # Create user-friendly error message
                if error == "access_denied":
                    error_message = "You chose not to authorize Agentkube Desktop. No worries! You can try again anytime."
                elif error_description:
                    error_message = error_description.replace('+', ' ')
                else:
                    error_message = f"Authorization failed: {error}"
                
                html_content = get_error_html(error_message)
                return HTMLResponse(content=html_content, status_code=400)
            
            if not code or not state:
                logger.error("Missing required callback parameters")
                return JSONResponse(
                    content={
                        "success": False,
                        "error": "invalid_request",
                        "message": "Missing authorization code or state parameter"
                    },
                    status_code=400
                )
            
            # If OAuth2 is not enabled, return error
            if not is_oauth2_enabled():
                return JSONResponse(
                    content={
                        "success": False,
                        "error": "oauth2_disabled",
                        "message": "OAuth2 authentication is not enabled"
                    },
                    status_code=400
                )
            
            # Process the authorization code by calling the backend
            try:
                import httpx
                logger.info("Processing authorization code with backend")
                
                # Call the backend to validate the authorization session
                async with httpx.AsyncClient() as client:
                    server_url =  get_agentkube_server_url()
                    backend_response = await client.post(
                        f'{server_url}/api/v1/oauth/callback', # AGENTKUBE_SERVER_URL: api.agentkube.com
                        json={
                            "code": code,
                            "state": state
                        }
                    )
                    
           
                
                if backend_response.status_code == 200:
                    result = backend_response.json()
                    logger.info("Backend authorization validation successful")
                    
                    # Get user info from result
                    user_info = result.get('user', {})
                    user_email = user_info.get('email', 'User')
                    
            
                    # Store the session using encrypted user data
                    from orchestrator.services.account.session import SessionService
                    from orchestrator.utils.encryption import encrypt_data
                    from datetime import datetime, timedelta
                    import json
                    
                    # Encrypt user data for backend authentication
                    user_data_to_encrypt = {
                        "supabaseId": user_info.get('id'),  # Use 'id' as supabaseId from OAuth response
                        "email": user_info.get('email')
                    }
                    
                    encrypted_user_data = encrypt_data(json.dumps(user_data_to_encrypt))
                    
                    # Store session with encrypted user data (no expiration - persistent until logout)
                    session_data = {
                        "encrypted_user_data": encrypted_user_data,
                        "user_info": {
                            "id": user_info.get('id'),
                            "email": user_info.get('email'),
                            "name": user_info.get('name')
                        },
                        "created_at": datetime.utcnow().isoformat() + 'Z'
                    }
                    
                    SessionService.store_oauth2_session(session_data)
                    logger.info("OAuth2 session with encrypted user data stored successfully")
                    
                    html_content = get_success_html(
                        message=f"You have successfully authorized Agentkube Desktop. Welcome, {user_email}!",
                        user_info=user_info
                    )
                    
                    return HTMLResponse(content=html_content)
                else:
                    logger.error(f"Backend authorization validation failed: {backend_response.status_code}")
                    error_data = backend_response.json() if backend_response.content else {}
                    
                    error_message = f"Authorization validation failed: {error_data.get('message', 'Unknown error')}"
                    html_content = get_error_html(error_message)
                    
                    return HTMLResponse(content=html_content, status_code=400)
                    
            except Exception as backend_error:
                logger.error(f"Error calling backend for authorization: {backend_error}")
                
                error_message = f"Failed to process authorization: {str(backend_error)}"
                html_content = get_error_html(error_message)
                
                return HTMLResponse(content=html_content, status_code=500)
            
        except Exception as e:
            logger.error(f"Error in callback handler: {e}")
            return JSONResponse(
                content={
                    "success": False,
                    "error": "callback_processing_failed", 
                    "message": str(e)
                },
                status_code=500
            )

    # New encrypted auth endpoints for desktop app
    @router.get("/orchestrator/api/auth/user")
    async def get_user_profile():
        """Get complete user profile including subscription, usage, etc."""
        try:
            from orchestrator.services.account.session import get_user_profile_with_encrypted_auth    
            user_profile = await get_user_profile_with_encrypted_auth()
            
            
            # Filter out sensitive data before returning to frontend
            safe_profile = {
                "id": user_profile.get("id"),
                "supabaseId": user_profile.get("supabaseId"),
                "email": user_profile.get("email"),
                "name": user_profile.get("name"),
                "usage_count": user_profile.get("usage_count"),
                "usage_limit": user_profile.get("usage_limit"),
                "subscription": user_profile.get("subscription"),
                "createdAt": user_profile.get("createdAt"),
                "updatedAt": user_profile.get("updatedAt")
                # Exclude openrouter_key and attributes for security
            }
            
            return JSONResponse(content=safe_profile)
            
        except HTTPException as e:
            return JSONResponse(
                content={"error": e.detail},
                status_code=e.status_code
            )
        except Exception as e:
            logger.error(f"Error getting user profile: {e}")
            return JSONResponse(
                content={"error": "Failed to get user profile"},
                status_code=500
            )
    
    @router.post("/orchestrator/api/auth/usage/increment")
    async def increment_user_usage():
        """Increment user usage count"""
        try:
            from orchestrator.services.account.session import increment_usage
            
            # Default increment by 1
            result = await increment_usage(amount=1)
            
            return JSONResponse(content={
                "success": True,
                "message": "Usage incremented successfully",
                "usage_data": result
            })
            
        except HTTPException as e:
            return JSONResponse(
                content={"error": e.detail},
                status_code=e.status_code
            )
        except Exception as e:
            logger.error(f"Error incrementing usage: {e}")
            return JSONResponse(
                content={"error": "Failed to increment usage"},
                status_code=500
            )
    

    # Health check endpoint for OAuth2 system
    @router.get("/orchestrator/api/auth/health")
    async def auth_health_check():
        """Health check for OAuth2 authentication system."""
        try:
            config = get_auth_config()
            
            # Validate configuration
            config_errors = config.validate_config()
            
            health_info = {
                "oauth2_enabled": config.enabled,
                "config_valid": len(config_errors) == 0,
                "config_errors": config_errors if config_errors else None,
                "auth_service_initialized": _auth_service is not None,
                "status": "healthy" if config.enabled and len(config_errors) == 0 else "degraded"
            }
            
            # Add token status if OAuth2 is enabled
            if config.enabled and _auth_service:
                try:
                    auth_service = get_auth_service()
                    is_authenticated = auth_service.is_authenticated()
                    health_info["user_authenticated"] = is_authenticated
                except Exception as e:
                    health_info["auth_check_error"] = str(e)
            
            return JSONResponse(content=health_info)
            
        except Exception as e:
            logger.error(f"Error in auth health check: {e}")
            return JSONResponse(
                content={
                    "status": "error",
                    "error": str(e)
                },
                status_code=500
            )
    
    return router


def create_auth_router() -> APIRouter:
    """Create a new router with auth routes."""
    router = APIRouter(tags=["Authentication"])
    return setup_auth_routes(router)