import uvicorn
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.routes.routes import setup_routes
import logging
from config import setup_config_directory, get_openrouter_api_key, config_manager
from orchestrator.services.usage import PendingUsageService
from orchestrator.services.account.session import validate_oauth2_session_on_startup
from config.auth_config import get_auth_config, is_oauth2_enabled
from orchestrator.services.auth.token_manager import TokenManager
from orchestrator.services.auth.auth_service import AuthenticationService
import signal
import sys

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Setup configuration directory and files
agentkube_dir, settings_path, mcp_path, rules_dir, additional_config_path = setup_config_directory()

async def validate_oauth2_on_startup():
    """
    Validate OAuth2 configuration on application startup.
    Log authentication status without clearing tokens.
    """
    try:
        if not is_oauth2_enabled():
            logger.info("OAuth2 authentication is disabled")
            return
        
        logger.info("Starting OAuth2 validation process...")
        
        # Validate OAuth2 configuration
        auth_config = get_auth_config()
        config_errors = auth_config.validate_config()
        
        if config_errors:
            logger.error(f"OAuth2 configuration errors: {config_errors}")
            return
        
        logger.info("OAuth2 configuration is valid")
        
        # Check session status using SessionService instead of TokenManager
        from orchestrator.services.account.session import SessionService
        
        if SessionService.has_oauth2_session():
            session_data = SessionService.get_oauth2_session()
            if session_data:
                user_info = session_data.get('user_info', {})
                user_email = user_info.get('email', 'Unknown')
                created_at = session_data.get('created_at')
                
                logger.info(f"OAuth2 session found for user: {user_email}")
                if created_at:
                    logger.info(f"Session created at: {created_at}")
            else:
                logger.info("OAuth2 session file exists but could not be read")
        else:
            logger.info("No OAuth2 session found")
                
    except Exception as e:
        logger.error(f"Unexpected error during OAuth2 validation: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifecycle management for the FastAPI application.
    Handles starting and stopping MCP servers.
    """
    logger.info("Starting application...")

    # Run database migrations before anything else
    try:
        from orchestrator.db.auto_migrate import migrate_on_startup
        logger.info("Running automatic database migrations...")
        migrate_on_startup()
    except Exception as e:
        logger.error(f"Database migration failed: {e}")
        # Continue anyway - Base.metadata.create_all() will handle new tables

    # Validate OAuth2 configuration and session on startup
    await validate_oauth2_on_startup()
    
    # Check for pending usage on startup with retry logic
    try:
        # First check if pending usage is excessive and reset if needed
        if PendingUsageService.check_and_reset_excessive_pending(max_allowed=500):
            logger.info("Excessive pending usage was reset on startup")
        
        pending = PendingUsageService._get_pending_usage()
        if pending > 0:
            logger.info(f"Found pending usage: {pending}")
            # Try to sync pending usage using encrypted auth with retry logic
            from orchestrator.services.account.session import increment_usage_with_retry
            await increment_usage_with_retry(pending, max_retries=3, raise_exceptions=False)
            logger.info("Successfully synced pending usage")
    except Exception as e:
        logger.error(f"Failed to sync pending usage on startup after retries: {e}")
    
    # Only try to get OpenRouter API key if OAuth2 is enabled and user is authenticated
    try:
        from orchestrator.services.account.session import has_oauth2_session, is_session_expired

        if is_oauth2_enabled() and has_oauth2_session() and not is_session_expired():
            api_key = get_openrouter_api_key()
            if api_key:
                logger.info("Successfully retrieved router key")
            else:
                logger.warning("Could not retrieve router key")
        else:
            logger.info("Skipping router key retrieval (OAuth2 disabled or no session)")
    except Exception as e:
        logger.error(f"Error retrieving router key: {e}")
    
    yield

    logger.info("Shutting down application...")

    # Stop file monitoring
    try:
        config_manager.stop_monitoring()
        logger.info("File monitoring stopped")
    except Exception as e:
        logger.error(f"Error stopping file monitoring: {e}")

app = FastAPI(
    title="Agentkube Orchestrator API",
    lifespan=lifespan 
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app = setup_routes(app)

def signal_handler(sig, frame):
    """Handle shutdown signals gracefully."""
    _ = frame  # Unused parameter
    logger.info(f"Received signal {sig}, shutting down...")

    try:
        config_manager.stop_monitoring()
    except Exception as e:
        logger.error(f"Error stopping file monitoring: {e}")
    sys.exit(0)


def main():
    # Setup signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    uvicorn.run(app, host="127.0.0.1", port=4689, log_level="info")

if __name__ == "__main__":
    main()