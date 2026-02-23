"""OAuth2 authentication configuration for Agentkube desktop."""

import os
import logging
from typing import Optional, List
from pathlib import Path

logger = logging.getLogger(__name__)


class AuthConfig:
    """OAuth2 authentication configuration manager."""
    
    # Default OAuth2 settings
    DEFAULT_CLIENT_ID = "AGENTKUBE_DESKTOP"
    DEFAULT_SCOPES = ["user:profile", "agent:manage"]
    DEFAULT_CALLBACK_PORT = 4689
    DEFAULT_CALLBACK_TIMEOUT = 300  # 5 minutes
    
    def __init__(self):
        """Initialize auth configuration."""
        self._load_config()
    
    def _load_config(self):
        """Load configuration from environment variables."""
        # OAuth2 Core Settings
        self.enabled = self._get_bool_env("OAUTH2_ENABLED", False)
        self.client_id = os.getenv("OAUTH2_CLIENT_ID", self.DEFAULT_CLIENT_ID)
        
        # Server URLs
        self.server_base_url = os.getenv(
            "OAUTH2_SERVER_BASE_URL", 
            "https://account.agentkube.com"
        )
        self.authorization_url = f"{self.server_base_url}/oauth/authorize"
        self.token_url = f"{self.server_base_url}/oauth/token"
        
        # Override URLs if explicitly set
        if os.getenv("OAUTH2_AUTHORIZATION_URL"):
            self.authorization_url = os.getenv("OAUTH2_AUTHORIZATION_URL")
        if os.getenv("OAUTH2_TOKEN_URL"):
            self.token_url = os.getenv("OAUTH2_TOKEN_URL")
        
        # Callback settings
        self.callback_port = int(os.getenv("OAUTH2_CALLBACK_PORT", self.DEFAULT_CALLBACK_PORT))
        self.callback_timeout = int(os.getenv("OAUTH2_CALLBACK_TIMEOUT", self.DEFAULT_CALLBACK_TIMEOUT))
        
        # Scopes
        scopes_env = os.getenv("OAUTH2_SCOPES")
        if scopes_env:
            self.scopes = [scope.strip() for scope in scopes_env.split(",")]
        else:
            self.scopes = self.DEFAULT_SCOPES.copy()
        
        # Fallback settings
        self.fallback_to_license = self._get_bool_env("OAUTH2_FALLBACK_TO_LICENSE", True)
        self.auto_refresh_tokens = self._get_bool_env("OAUTH2_AUTO_REFRESH", True)
        
        # Debug settings
        self.debug_mode = self._get_bool_env("OAUTH2_DEBUG", False)
        
        # Development settings
        self.dev_mode = self._get_bool_env("OAUTH2_DEV_MODE", False)
        self.skip_browser_open = self._get_bool_env("OAUTH2_SKIP_BROWSER", False)
        
        logger.info(f"OAuth2 configuration loaded - enabled: {self.enabled}")
        if self.debug_mode:
            logger.debug(f"OAuth2 config: {self.to_dict(mask_sensitive=True)}")
    
    def _get_bool_env(self, key: str, default: bool) -> bool:
        """Get boolean environment variable."""
        value = os.getenv(key, "").lower()
        if value in ("true", "1", "yes", "on"):
            return True
        elif value in ("false", "0", "no", "off"):
            return False
        else:
            return default
    
    def get_redirect_uri(self, port: Optional[int] = None) -> str:
        """
        Get OAuth2 redirect URI.
        
        Args:
            port: Override port (uses configured port if None)
            
        Returns:
            Complete redirect URI
        """
        callback_port = port or self.callback_port
        return f"http://127.0.0.1:{callback_port}/callback"
    
    def validate_config(self) -> List[str]:
        """
        Validate OAuth2 configuration.
        
        Returns:
            List of validation errors (empty if valid)
        """
        errors = []
        
        if not self.client_id:
            errors.append("OAuth2 client ID is required")
        
        if not self.authorization_url:
            errors.append("OAuth2 authorization URL is required")
        
        if not self.token_url:
            errors.append("OAuth2 token URL is required")
        
        if self.callback_port < 1024 or self.callback_port > 65535:
            errors.append("OAuth2 callback port must be between 1024 and 65535")
        
        if self.callback_timeout < 30:
            errors.append("OAuth2 callback timeout must be at least 30 seconds")
        
        if not self.scopes:
            errors.append("At least one OAuth2 scope is required")
        
        return errors
    
    def is_valid(self) -> bool:
        """Check if configuration is valid."""
        return len(self.validate_config()) == 0
    
    def to_dict(self, mask_sensitive: bool = True) -> dict:
        """
        Convert configuration to dictionary.
        
        Args:
            mask_sensitive: Whether to mask sensitive values
            
        Returns:
            Configuration dictionary
        """
        config = {
            "enabled": self.enabled,
            "client_id": self.client_id if not mask_sensitive else self._mask_value(self.client_id),
            "server_base_url": self.server_base_url,
            "authorization_url": self.authorization_url,
            "token_url": self.token_url,
            "callback_port": self.callback_port,
            "callback_timeout": self.callback_timeout,
            "scopes": self.scopes,
            "fallback_to_license": self.fallback_to_license,
            "auto_refresh_tokens": self.auto_refresh_tokens,
            "debug_mode": self.debug_mode,
            "dev_mode": self.dev_mode,
            "skip_browser_open": self.skip_browser_open
        }
        
        return config
    
    def _mask_value(self, value: str) -> str:
        """Mask sensitive value for logging."""
        if not value or len(value) < 8:
            return "****"
        return value[:4] + "****" + value[-4:]
    
    @classmethod
    def create_example_env_file(cls, file_path: Optional[Path] = None) -> Path:
        """
        Create example .env file with OAuth2 configuration.
        
        Args:
            file_path: Path for the env file (default: .env.oauth2.example)
            
        Returns:
            Path to created file
        """
        if file_path is None:
            file_path = Path(".env.oauth2.example")
        
        content = f"""# OAuth2 Configuration for Agentkube Desktop
# Copy this file to .env and customize the values

# Enable/disable OAuth2 authentication
OAUTH2_ENABLED=true

# OAuth2 Client Configuration
OAUTH2_CLIENT_ID={cls.DEFAULT_CLIENT_ID}

# OAuth2 Server URLs
OAUTH2_SERVER_BASE_URL=https://account.agentkube.com
# OAUTH2_AUTHORIZATION_URL=https://account.agentkube.com/oauth/authorize
# OAUTH2_TOKEN_URL=https://account.agentkube.com/oauth/token

# Local Callback Server Settings
OAUTH2_CALLBACK_PORT={cls.DEFAULT_CALLBACK_PORT}
OAUTH2_CALLBACK_TIMEOUT={cls.DEFAULT_CALLBACK_TIMEOUT}

# OAuth2 Scopes (comma-separated)
OAUTH2_SCOPES={','.join(cls.DEFAULT_SCOPES)}

# Fallback Settings
OAUTH2_FALLBACK_TO_LICENSE=true
OAUTH2_AUTO_REFRESH=true

# Development Settings
OAUTH2_DEBUG=false
OAUTH2_DEV_MODE=false
OAUTH2_SKIP_BROWSER=false
"""
        
        with open(file_path, 'w') as f:
            f.write(content)
        
        logger.info(f"Created OAuth2 example configuration file: {file_path}")
        return file_path


# Global configuration instance
auth_config = AuthConfig()


def get_auth_config() -> AuthConfig:
    """Get the global auth configuration instance."""
    return auth_config


def reload_auth_config() -> AuthConfig:
    """Reload auth configuration from environment."""
    global auth_config
    auth_config = AuthConfig()
    return auth_config


def is_oauth2_enabled() -> bool:
    """Check if OAuth2 is enabled."""
    return auth_config.enabled


def get_oauth2_client_id() -> str:
    """Get OAuth2 client ID."""
    return auth_config.client_id


def get_oauth2_authorization_url() -> str:
    """Get OAuth2 authorization URL."""
    return auth_config.authorization_url


def get_oauth2_token_url() -> str:
    """Get OAuth2 token URL."""
    return auth_config.token_url


def get_oauth2_scopes() -> List[str]:
    """Get OAuth2 scopes."""
    return auth_config.scopes


def get_oauth2_callback_port() -> int:
    """Get OAuth2 callback port."""
    return auth_config.callback_port


def get_oauth2_callback_timeout() -> int:
    """Get OAuth2 callback timeout."""
    return auth_config.callback_timeout


def should_fallback_to_license() -> bool:
    """Check if should fallback to license key authentication."""
    return auth_config.fallback_to_license


def should_auto_refresh_tokens() -> bool:
    """Check if should automatically refresh tokens."""
    return auth_config.auto_refresh_tokens


def is_oauth2_debug_enabled() -> bool:
    """Check if OAuth2 debug mode is enabled."""
    return auth_config.debug_mode