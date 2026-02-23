import os
import threading
import json
import yaml
from pathlib import Path
import logging
from typing import Dict, Any, Optional, List
from pydantic import FilePath, SecretStr
from dotenv import load_dotenv
from orchestrator.utils.encryption import decrypt_data
import httpx
from watchfiles import watch
import base64

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()


class ConfigManager:
    """
    Manages configuration for the Agentkube application.
    Handles reading and monitoring settings.json and mcp.json files.
    """
    
    def __init__(self):
        # Find the agentkube directory in the user's home
        self.home_dir = Path.home()
        self.agentkube_dir = self.home_dir / '.agentkube'
        self.settings_path = self.agentkube_dir / 'settings.json'
        self.mcp_path = self.agentkube_dir / 'mcp.json'
        self.additional_config_path = self.agentkube_dir / 'additionalConfig.yaml'
        self.rules_dir = self.agentkube_dir / 'rules'
        self.user_rules_path = self.rules_dir / 'user_rules.md'
        self.cluster_rules_path = self.rules_dir / 'cluster_rules.md'
        self.kubeignore_path = self.agentkube_dir / '.kubeignore'
        
        # Initialize settings, mcp, and additional config
        self.settings: Dict[str, Any] = {}
        self.mcp: Dict[str, Any] = {}
        self.additional_config: Dict[str, Any] = {}
        
        # Load initial configurations
        self.settings = self.load_settings()
        self.mcp = self.load_mcp()
        self.additional_config = self.load_additional_config()
        
        # File watching setup with watchfiles
        self._stop_event = threading.Event()
        self.monitor_thread = threading.Thread(target=self._start_file_watcher, daemon=True)
        self.monitor_thread.start()
        
        # Initialize environment variables with fallbacks from settings
        self.init_environment()
    
    def init_environment(self):
        """Initialize environment variables with fallbacks from settings"""
        self.OPENAI_API_KEY = os.getenv("OPENAI_API_KEY") or self.settings.get(
            "aiIntegration", {}).get("credentials", {}).get("openAI", {}).get("apiKey", "")
        
        self.OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
        self.OPENROUTER_API_URL = os.getenv("OPENROUTER_API_URL", "https://openrouter.ai/api/v1")
        
        self.AGENTKUBE_SERVER_URL = os.getenv("AGENTKUBE_SERVER_URL", "https://api.agentkube.com")
        
        # Analytics API key for tracking events
        self.AK_ANALYTICS_API_KEY = os.getenv("AK_ANALYTICS_API_KEY", "fba2ce096cadcdef9bf02fa649aad192232e72a11d3ce2e669432b7970f49752009dd7bc")
        
        # Default model from settings or environment variable
        self.DEFAULT_MODEL = os.getenv("DEFAULT_MODEL") or self.settings.get(
            "models", {}).get("currentModel", "openai/gpt-4o-mini")
        
        # Log level from settings or environment variable
        log_level = os.getenv("LOG_LEVEL") or self.settings.get(
            "debugging", {}).get("logLevel", "info").upper()
        logging.getLogger().setLevel(getattr(logging, log_level.upper(), logging.INFO))
        
        # Other settings
        self.streaming = self.settings.get("models", {}).get("settings", {}).get("streaming", True)
        self.temperature = self.settings.get("models", {}).get("settings", {}).get("temperature", 0.7)
        self.max_tokens = self.settings.get("models", {}).get("settings", {}).get("maxTokens", 1000)

    def load_settings(self) -> Dict[str, Any]:
        """Load settings from settings.json file"""
        try:
            if self.settings_path.exists():
                with open(self.settings_path, 'r') as f:
                    return json.load(f)
            else:
                logger.warning(f"Settings file not found at {self.settings_path}")
                return {}
        except json.JSONDecodeError:
            logger.error(f"Invalid JSON in settings file: {self.settings_path}")
            return {}
        except Exception as e:
            logger.error(f"Error loading settings: {e}")
            return {}

    def load_mcp(self) -> Dict[str, Any]:
        """Load MCP configuration from mcp.json file"""
        try:
            if self.mcp_path.exists():
                with open(self.mcp_path, 'r') as f:
                    return json.load(f)
            else:
                logger.warning(f"MCP file not found at {self.mcp_path}")
                return {}
        except json.JSONDecodeError:
            logger.error(f"Invalid JSON in MCP file: {self.mcp_path}")
            return {}
        except Exception as e:
            logger.error(f"Error loading MCP config: {e}")
            return {}

    def load_additional_config(self) -> Dict[str, Any]:
        """Load additional cluster configuration from additionalConfig.yaml file"""
        try:
            if self.additional_config_path.exists():
                with open(self.additional_config_path, 'r') as f:
                    content = f.read().strip()
                    if not content:
                        return {}
                    return yaml.safe_load(content) or {}
            else:
                logger.warning(f"Additional config file not found at {self.additional_config_path}")
                return {}
        except yaml.YAMLError as e:
            logger.error(f"Invalid YAML in additional config file: {self.additional_config_path}, error: {e}")
            return {}
        except Exception as e:
            logger.error(f"Error loading additional config: {e}")
            return {}

    def _start_file_watcher(self):
        """Start the file watcher using watchfiles"""
        try:
            # Watch the agentkube directory for changes
            for changes in watch(str(self.agentkube_dir), stop_event=self._stop_event):
                if self._stop_event.is_set():
                    break
                self._handle_file_changes(changes)
        except Exception as e:
            logger.error(f"Error in file watcher: {e}")
    
    def _handle_file_changes(self, changes):
        """Handle detected file changes"""
        for _, file_path in changes:
            file_path = Path(file_path)
            
            try:
                # Handle settings.json changes
                if file_path.name == 'settings.json' and file_path.parent == self.agentkube_dir:
                    new_settings = self.load_settings()
                    if new_settings:  # Only update if we got valid data
                        self.settings = new_settings
                        self.init_environment()
                        logger.info("Settings reloaded due to file change")
                
                # Handle mcp.json changes
                elif file_path.name == 'mcp.json' and file_path.parent == self.agentkube_dir:
                    new_mcp = self.load_mcp()
                    self.mcp = new_mcp
                    logger.info("MCP configuration reloaded due to file change")
                    
                    # Set a flag to reset the MCP client on next use
                    try:
                        from orchestrator.services.mcp import set_client_reset_flag
                        set_client_reset_flag()
                    except ImportError:
                        pass  # MCP module might not be available
                
                # Handle additionalConfig.yaml changes
                elif file_path.name == 'additionalConfig.yaml' and file_path.parent == self.agentkube_dir:
                    new_additional_config = self.load_additional_config()
                    self.additional_config = new_additional_config
                    logger.info("Additional cluster configuration reloaded due to file change")
                
            except Exception as e:
                logger.error(f"Error handling file change for {file_path}: {e}")
    
    def stop_monitoring(self):
        """Stop the file monitoring"""
        self._stop_event.set()
        if self.monitor_thread.is_alive():
            self.monitor_thread.join(timeout=5)

    def get_settings(self) -> Dict[str, Any]:
        """Get the current settings"""
        return self.settings

    def get_mcp_config(self) -> Dict[str, Any]:
        """Get the current MCP configuration"""
        return self.mcp
    
    def get_additional_config(self) -> Dict[str, Any]:
        """Get the current additional cluster configuration"""
        return self.additional_config
    
    def update_settings(self, new_settings: Dict[str, Any]) -> bool:
        """
        Update settings.json with new values.
        
        Args:
            new_settings: New settings to merge with existing settings
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Load current settings
            current_settings = self.load_settings()
            
            # Merge new settings with current settings
            updated_settings = self.deep_merge(current_settings, new_settings)
            
            # Write updated settings back to file
            with open(self.settings_path, 'w') as f:
                json.dump(updated_settings, f, indent=2)
            
            # Update in-memory settings
            self.settings = updated_settings
            self.settings_last_modified = os.path.getmtime(self.settings_path)
            
            # Re-initialize environment variables
            self.init_environment()
            
            logger.info("Settings updated")
            return True
        except Exception as e:
            logger.error(f"Error updating settings: {e}")
            return False
        
    def get_openrouter_api_key(self):
        """Get the OpenRouter API key using encrypted authentication"""
        if not hasattr(self, "_cached_openrouter_key"):
            self._cached_openrouter_key = None
        
        # If we already have a cached key, return it
        if self._cached_openrouter_key:
            return self._cached_openrouter_key
        
        # Check environment variable first
        env_key = os.getenv("OPENROUTER_API_KEY")
        if env_key:
            self._cached_openrouter_key = env_key
            return env_key
        
        # Try to get the key using encrypted auth session
        try:
            # Import here to avoid circular imports
            from orchestrator.services.account.session import SessionService
            
            # Check if we have a session
            session_data = SessionService.get_oauth2_session()
            if not session_data:
                logger.info("No authenticated session found, cannot retrieve OpenRouter API key")
                return None
            
            encrypted_user_data = session_data.get('encrypted_user_data')
            if not encrypted_user_data:
                logger.warning("No encrypted user data in session")
                return None
            
            # Get user profile with OpenRouter key from server
            response = httpx.get(
                f"{self.AGENTKUBE_SERVER_URL}/api/v1/remote/user",
                headers={
                    'X-Encrypted-User': encrypted_user_data,
                    'Content-Type': 'application/json'
                },
                timeout=10
            )
            
            if response.status_code == 200:
                user_data = response.json()
                openrouter_data = user_data.get("openrouter_key")
                
                if openrouter_data and openrouter_data.get("key"):
                    encrypted_key = openrouter_data["key"]
                    
                    try:
                        decrypted_key = decrypt_data(encrypted_key)
                        self._cached_openrouter_key = decrypted_key
                        logger.info("Successfully retrieved and cached router key")
                        return decrypted_key
                    except Exception as e:
                        logger.error(f"Failed to decrypt router key: {e}")
                else:
                    logger.warning("No router key found in user profile")
            else:
                logger.warning(f"Failed to retrieve user profile: {response.status_code}")
                
        except Exception as e:
            logger.error(f"Error retrieving router API key: {e}")
        
        return None

    def update_mcp(self, new_mcp: Dict[str, Any]) -> bool:
        """
        Update mcp.json with new values.
        
        Args:
            new_mcp: New MCP config to merge with existing config
            
        Returns:
            True if successful, False otherwise
        """
        try:
            current_mcp = self.load_mcp()
            # Merge new MCP config with current config
            updated_mcp = self.deep_merge(current_mcp, new_mcp)
            
            # Write updated MCP config back to file
            with open(self.mcp_path, 'w') as f:
                json.dump(updated_mcp, f, indent=2)
            
            # Update in-memory MCP config
            self.mcp = updated_mcp
            self.mcp_last_modified = os.path.getmtime(self.mcp_path)
            
            # Update MCP servers based on new configuration
            # tasks = get_orchestrator_tasks()
            # tasks.check_mcp_config_changes(self.mcp_path, self.mcp)
            
            logger.info("MCP configuration updated")
            return True
        except Exception as e:
            logger.error(f"Error updating MCP configuration: {e}")
            return False

    def update_additional_config(self, new_config: Dict[str, Any]) -> bool:
        """
        Update additionalConfig.yaml with new values.
        
        Args:
            new_config: New additional config to merge with existing config
            
        Returns:
            True if successful, False otherwise
        """
        try:
            current_config = self.load_additional_config()
            # Merge new config with current config
            updated_config = self.deep_merge(current_config, new_config)
            
            # Write updated config back to file
            with open(self.additional_config_path, 'w') as f:
                yaml.dump(updated_config, f, default_flow_style=False, indent=2)
            
            # Update in-memory config
            self.additional_config = updated_config
            self.additional_config_last_modified = os.path.getmtime(self.additional_config_path)
            
            logger.info("Additional cluster configuration updated")
            return True
        except Exception as e:
            logger.error(f"Error updating additional configuration: {e}")
            return False

    def get_cluster_config(self, cluster_name: str) -> Dict[str, Any]:
        """Get configuration for a specific cluster"""
        clusters = self.additional_config.get("clusters", {})
        return clusters.get(cluster_name, {})
    
    # TODO some tools like fortio, trivy may not require any of the connection_field, just enabled (true/false)
    def validate_cluster_config(self, cluster_config: Dict[str, Any]) -> bool:
        """Validate cluster configuration structure - pattern-based validation"""
        try:
            for tool_name, tool_config in cluster_config.items():
                if not isinstance(tool_config, dict):
                    logger.error(f"Tool '{tool_name}' configuration must be a dictionary")
                    return False
                
                # Validate that each tool has at least some connection info
                has_connection = False
                connection_fields = ["url", "service_address", "endpoint", "host"]
                for field in connection_fields:
                    if field in tool_config:
                        has_connection = True
                        break
                
                if not has_connection:
                    logger.error(f"Tool '{tool_name}' must have at least one connection field: {', '.join(connection_fields)}")
                    return False
                
                # Validate auth configuration if present - flexible auth methods
                auth_methods = ["basic_auth", "api_token", "token", "pat", "user", "key"]
                
                for auth_method in auth_methods:
                    if auth_method in tool_config:
                        
                        if auth_method == "basic_auth":
                            auth_config = tool_config[auth_method]
                            if not isinstance(auth_config, dict):
                                logger.error(f"Tool '{tool_name}' {auth_method} must be a dictionary")
                                return False
                            if "username" not in auth_config or "password" not in auth_config:
                                logger.error(f"Tool '{tool_name}' {auth_method} must have both username and password")
                                return False
                        else:
                            # For token-based auth (api_token, token, pat, user, key)
                            if not isinstance(tool_config[auth_method], str):
                                logger.error(f"Tool '{tool_name}' {auth_method} must be a string")
                                return False
                
                # Auth is optional - tools can work without authentication
            
            return True
        except Exception as e:
            logger.error(f"Error validating cluster config: {e}")
            return False

    def update_cluster_config(self, cluster_name: str, cluster_config: Dict[str, Any]) -> bool:
        """Update configuration for a specific cluster (merges with existing config)"""
        try:
            # Validate configuration before updating
            if not self.validate_cluster_config(cluster_config):
                logger.error(f"Invalid configuration for cluster '{cluster_name}'")
                return False
            
            current_config = self.additional_config.copy()
            if "clusters" not in current_config:
                current_config["clusters"] = {}
            
            # Get existing cluster config or initialize empty dict
            existing_cluster_config = current_config["clusters"].get(cluster_name, {})
            
            # Deep merge the new config with existing cluster config
            merged_cluster_config = self.deep_merge(existing_cluster_config, cluster_config)
            
            # Update the merged config
            current_config["clusters"][cluster_name] = merged_cluster_config
            
            # Write updated config back to file
            with open(self.additional_config_path, 'w') as f:
                yaml.dump(current_config, f, default_flow_style=False, indent=2)
            
            # Update in-memory config
            self.additional_config = current_config
            self.additional_config_last_modified = os.path.getmtime(self.additional_config_path)
            
            logger.info(f"Cluster '{cluster_name}' configuration merged successfully")
            return True
        except Exception as e:
            logger.error(f"Error updating cluster '{cluster_name}' configuration: {e}")
            return False

    @staticmethod
    def deep_merge(d1: Dict[str, Any], d2: Dict[str, Any]) -> Dict[str, Any]:
        """
        Deep merge two dictionaries. d2 values take precedence.
        
        Args:
            d1: First dictionary
            d2: Second dictionary (takes precedence)
            
        Returns:
            Merged dictionary
        """
        result = d1.copy()
        for key, value in d2.items():
            if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                result[key] = ConfigManager.deep_merge(result[key], value)
            else:
                result[key] = value
        return result
    
    def _get_provider_config(self, provider_id: str) -> dict:
        """Get provider config from settings, checking 'providers' first then legacy 'externalProviderSettings'."""
        models = self.settings.get("models", {})
        # New path: models.providers.<provider_id>
        config = models.get("providers", {}).get(provider_id, {})
        if config:
            return config
        # Legacy fallback: models.externalProviderSettings.<provider_id>
        return models.get("externalProviderSettings", {}).get(provider_id, {})

    def get_custom_openai_key(self) -> str:
        """Get the custom OpenAI API key from settings"""
        try:
            encoded_key = self._get_provider_config("openai").get("apiKey", "")
            if encoded_key:
                return base64.b64decode(encoded_key).decode('utf-8')
            return ""
        except Exception as e:
            logger.error(f"Error decoding custom OpenAI API key: {e}")
            return ""

    def get_custom_openai_base_url(self) -> str:
        """Get the custom OpenAI base URL from settings"""
        return self._get_provider_config("openai").get("baseUrl", "")

    def is_custom_openai_enabled(self) -> bool:
        """Check if custom OpenAI provider is enabled"""
        return self._get_provider_config("openai").get("enabled", False)

    def get_custom_anthropic_key(self) -> str:
        """Get the custom Anthropic API key from settings"""
        try:
            encoded_key = self._get_provider_config("anthropic").get("apiKey", "")
            if encoded_key:
                return base64.b64decode(encoded_key).decode('utf-8')
            return ""
        except Exception as e:
            logger.error(f"Error decoding custom Anthropic API key: {e}")
            return ""

    def is_custom_anthropic_enabled(self) -> bool:
        """Check if custom Anthropic provider is enabled"""
        return self._get_provider_config("anthropic").get("enabled", False)

    def get_custom_google_key(self) -> str:
        """Get the custom Google API key from settings"""
        try:
            encoded_key = self._get_provider_config("google").get("apiKey", "")
            if encoded_key:
                return base64.b64decode(encoded_key).decode('utf-8')
            return ""
        except Exception as e:
            logger.error(f"Error decoding custom Google API key: {e}")
            return ""

    def is_custom_google_enabled(self) -> bool:
        """Check if custom Google provider is enabled"""
        return self._get_provider_config("google").get("enabled", False)

    def get_azure_config(self) -> Dict[str, str]:
        """Get the Azure configuration from settings"""
        try:
            azure_config = self._get_provider_config("azure")

            # Decode the API key if it exists
            api_key = ""
            if azure_config.get("apiKey"):
                api_key = base64.b64decode(azure_config.get("apiKey", "")).decode('utf-8')

            return {
                "base_url": azure_config.get("baseUrl", ""),
                "deployment_name": azure_config.get("deploymentName", ""),
                "api_key": api_key,
                "enabled": azure_config.get("enabled", False)
            }
        except Exception as e:
            logger.error(f"Error getting Azure configuration: {e}")
            return {"base_url": "", "deployment_name": "", "api_key": "", "enabled": False}

    def is_azure_enabled(self) -> bool:
        """Check if Azure provider is enabled"""
        return self._get_provider_config("azure").get("enabled", False)

    def get_ollama_endpoint(self) -> str:
        """Get the Ollama endpoint from settings"""
        return self._get_provider_config("ollama").get("endpoint", "")

    def is_ollama_enabled(self) -> bool:
        """Check if Ollama provider is enabled"""
        return self._get_provider_config("ollama").get("enabled", False)

    def get_vllm_endpoint(self) -> str:
        """Get the vLLM endpoint from settings"""
        return self._get_provider_config("vllm").get("endpoint", "")

    def is_vllm_enabled(self) -> bool:
        """Check if vLLM provider is enabled"""
        return self._get_provider_config("vllm").get("enabled", False)
    
    def get_user_rules(self) -> str:
        """Get the content of user_rules.md"""
        try:
            if self.user_rules_path.exists():
                with open(self.user_rules_path, 'r') as f:
                    return f.read()
            return ""
        except Exception as e:
            logger.error(f"Error reading user rules: {e}")
            return ""
    
    def get_cluster_rules(self) -> str:
        """Get the content of cluster_rules.md"""
        try:
            if self.cluster_rules_path.exists():
                with open(self.cluster_rules_path, 'r') as f:
                    return f.read()
            return ""
        except Exception as e:
            logger.error(f"Error reading cluster rules: {e}")
            return ""
    
    def get_kubeignore(self) -> str:
        """Get the content of .kubeignore"""
        try:
            if self.kubeignore_path.exists():
                with open(self.kubeignore_path, 'r') as f:
                    return f.read()
            return ""
        except Exception as e:
            logger.error(f"Error reading kubeignore: {e}")
            return ""
    
    def update_user_rules(self, content: str) -> bool:
        """Update user_rules.md content"""
        try:
            self.rules_dir.mkdir(parents=True, exist_ok=True)
            with open(self.user_rules_path, 'w') as f:
                f.write(content)
            logger.info("User rules updated")
            return True
        except Exception as e:
            logger.error(f"Error updating user rules: {e}")
            return False
    
    def update_cluster_rules(self, content: str) -> bool:
        """Update cluster_rules.md content"""
        try:
            self.rules_dir.mkdir(parents=True, exist_ok=True)
            with open(self.cluster_rules_path, 'w') as f:
                f.write(content)
            logger.info("Cluster rules updated")
            return True
        except Exception as e:
            logger.error(f"Error updating cluster rules: {e}")
            return False
    
    def update_kubeignore(self, content: str) -> bool:
        """Update .kubeignore content"""
        try:
            self.agentkube_dir.mkdir(parents=True, exist_ok=True)
            with open(self.kubeignore_path, 'w') as f:
                f.write(content)
            logger.info("Kubeignore updated")
            return True
        except Exception as e:
            logger.error(f"Error updating kubeignore: {e}")
            return False
    
    def get_deny_list(self) -> List[str]:
        """Get the agent command deny list"""
        return self.settings.get("agents", {}).get("denyList", [])
    
    def get_recon_mode(self) -> bool:
        """Get the recon mode setting for agents"""
        return self.settings.get("agents", {}).get("recon", False)

    def get_agent_model_mapping(self) -> Dict[str, Dict[str, str]]:
        """Get the complete agent model mapping configuration"""
        return self.settings.get("agentModelMapping", {})

    def get_agent_model_config(self, agent_name: str) -> Dict[str, str]:
        """
        Get model configuration for a specific agent.

        Args:
            agent_name: Name of the agent (logAnalyzer, eventAnalyzer, etc.)

        Returns:
            Dictionary with 'provider' and 'model' keys
            If not configured, returns default configuration
        """
        agent_mapping = self.get_agent_model_mapping()
        return agent_mapping.get(agent_name, {"provider": "default", "model": ""})

    # ── Generic provider config (models.dev approach) ──

    # Known env var mapping for providers (fallback when catalog unavailable)
    PROVIDER_ENV_MAP = {
        "openai": "OPENAI_API_KEY",
        "anthropic": "ANTHROPIC_API_KEY",
        "google": "GOOGLE_GENERATIVE_AI_API_KEY",
        "xai": "XAI_API_KEY",
        "groq": "GROQ_API_KEY",
        "deepseek": "DEEPSEEK_API_KEY",
        "mistral": "MISTRAL_API_KEY",
        "cohere": "COHERE_API_KEY",
        "perplexity": "PERPLEXITY_API_KEY",
        "together": "TOGETHER_AI_API_KEY",
        "fireworks": "FIREWORKS_API_KEY",
        "openrouter": "OPENROUTER_API_KEY",
    }

    def get_provider_config(self, provider_id: str) -> Optional[Dict[str, Any]]:
        """
        Get provider config from settings.json.
        Checks both new 'models.providers' and legacy 'externalProviderSettings'.
        """
        # New location: models.providers.{provider_id}
        providers = self.settings.get("models", {}).get("providers", {})
        conf = providers.get(provider_id)
        if conf:
            return conf

        # Legacy location: models.externalProviderSettings.{provider_id}
        ext = self.settings.get("models", {}).get("externalProviderSettings", {})
        legacy = ext.get(provider_id)
        if legacy:
            return legacy

        return None

    def get_provider_api_key(self, provider_id: str) -> Optional[str]:
        """
        Get API key for a provider. Resolution order:
        1. settings.json → models.providers.{provider_id}.apiKey (base64)
        2. settings.json → models.externalProviderSettings.{provider_id}.apiKey (base64)
        3. Environment variable from PROVIDER_ENV_MAP
        """
        conf = self.get_provider_config(provider_id)
        if conf and conf.get("apiKey"):
            try:
                return base64.b64decode(conf["apiKey"]).decode("utf-8")
            except Exception as e:
                logger.error("Failed to decode API key for provider %s: %s", provider_id, e)

        # Env var fallback
        env_var = self.PROVIDER_ENV_MAP.get(provider_id)
        if env_var:
            val = os.environ.get(env_var)
            if val:
                return val

        return None

    def get_provider_base_url(self, provider_id: str) -> Optional[str]:
        """
        Get custom base URL for a provider from settings.
        Falls back to None (caller should use models.dev catalog URL).
        """
        conf = self.get_provider_config(provider_id)
        if conf:
            return conf.get("baseUrl") or conf.get("endpoint") or None
        return None

    def is_provider_enabled(self, provider_id: str) -> bool:
        """
        Check if a provider is enabled and has valid credentials.
        Local providers (ollama, vllm) just need to be enabled.
        Cloud providers need enabled=True AND a valid API key.
        """
        conf = self.get_provider_config(provider_id)

        # Local providers
        if provider_id in ("ollama", "vllm"):
            return bool(conf and conf.get("enabled"))

        # Cloud providers — need credentials
        if conf and conf.get("enabled"):
            if conf.get("apiKey"):
                return True

        # Check env var
        env_var = self.PROVIDER_ENV_MAP.get(provider_id)
        if env_var and os.environ.get(env_var):
            return True

        return False

    def get_enabled_model_ids(self) -> List[str]:
        """Get list of enabled model IDs from settings.json."""
        return self.settings.get("models", {}).get("enabledModels", [])

    def set_enabled_model_ids(self, model_ids: List[str]):
        """Write enabled model IDs to settings.json."""
        self.update_settings({"models": {"enabledModels": model_ids}})

    def connect_provider(self, provider_id: str, api_key: str, base_url: str = "", endpoint: str = "") -> bool:
        """
        Store API key for a provider in settings.json → models.providers.
        """
        try:
            encoded_key = base64.b64encode(api_key.encode("utf-8")).decode("utf-8") if api_key else ""
            provider_conf: Dict[str, Any] = {
                "apiKey": encoded_key,
                "enabled": True,
            }
            if base_url:
                provider_conf["baseUrl"] = base_url
            if endpoint:
                provider_conf["endpoint"] = endpoint

            self.update_settings({
                "models": {
                    "providers": {
                        provider_id: provider_conf
                    }
                }
            })
            logger.info("Provider connected: %s", provider_id)
            return True
        except Exception as e:
            logger.error("Failed to connect provider %s: %s", provider_id, e)
            return False

    def disconnect_provider(self, provider_id: str) -> bool:
        """
        Remove API key for a provider from settings.json.
        """
        try:
            self.update_settings({
                "models": {
                    "providers": {
                        provider_id: {
                            "apiKey": "",
                            "enabled": False,
                        }
                    }
                }
            })
            logger.info("Provider disconnected: %s", provider_id)
            return True
        except Exception as e:
            logger.error("Failed to disconnect provider %s: %s", provider_id, e)
            return False


config_manager = ConfigManager()

def get_settings() -> Dict[str, Any]:
    """Get the current settings"""
    return config_manager.get_settings()

def get_mcp_config() -> Dict[str, Any]:
    """Get the current MCP configuration"""
    return config_manager.get_mcp_config()

def update_settings(new_settings: Dict[str, Any]) -> bool:
    """Update settings with new values"""
    return config_manager.update_settings(new_settings)

def update_mcp(new_mcp: Dict[str, Any]) -> bool:
    """Update MCP config with new values"""
    return config_manager.update_mcp(new_mcp)

# Easy access to common settings
def get_model_name() -> str:
    """Get the current model name"""
    return config_manager.DEFAULT_MODEL

def get_openai_api_key() -> str:
    """Get the OpenAI API key"""
    return config_manager.OPENAI_API_KEY

def get_streaming() -> bool:
    """Get streaming setting"""
    return config_manager.streaming

def get_temperature() -> float:
    """Get temperature setting"""
    return config_manager.temperature

def get_max_tokens() -> int:
    """Get max tokens setting"""
    return config_manager.max_tokens

def get_openrouter_api_key() -> str:
    """Get the OpenRouter API key"""
    return config_manager.get_openrouter_api_key()

def get_openrouter_api_url() -> str:
    """Get the OpenRouter API URL"""
    return config_manager.OPENROUTER_API_URL

def get_agentkube_server_url() -> str:
    """Get the AgentKube server URL"""
    return config_manager.AGENTKUBE_SERVER_URL

def get_ak_analytics_api_key() -> str:
    """Get the AgentKube Analytics API Key"""
    return config_manager.AK_ANALYTICS_API_KEY

def get_custom_openai_key() -> str:
    """Get the custom OpenAI API key"""
    return config_manager.get_custom_openai_key()

def get_custom_openai_base_url() -> str:
    """Get the custom OpenAI base URL"""
    return config_manager.get_custom_openai_base_url()

def get_custom_anthropic_key() -> str:
    """Get the custom Anthropic API key"""
    return config_manager.get_custom_anthropic_key()

def get_custom_google_key() -> str:
    """Get the custom Google API key"""
    return config_manager.get_custom_google_key()

def get_azure_config() -> Dict[str, str]:
    """Get the Azure configuration"""
    return config_manager.get_azure_config()

def is_custom_openai_enabled() -> bool:
    """Check if custom OpenAI provider is enabled"""
    return config_manager.is_custom_openai_enabled()

def is_custom_anthropic_enabled() -> bool:
    """Check if custom Anthropic provider is enabled"""
    return config_manager.is_custom_anthropic_enabled()

def is_custom_google_enabled() -> bool:
    """Check if custom Google provider is enabled"""
    return config_manager.is_custom_google_enabled()

def is_azure_enabled() -> bool:
    """Check if Azure provider is enabled"""
    return config_manager.is_azure_enabled()

def get_ollama_endpoint() -> str:
    """Get the Ollama endpoint"""
    return config_manager.get_ollama_endpoint()

def is_ollama_enabled() -> bool:
    """Check if Ollama provider is enabled"""
    return config_manager.is_ollama_enabled()

def get_vllm_endpoint() -> str:
    """Get the vLLM endpoint"""
    return config_manager.get_vllm_endpoint()

def is_vllm_enabled() -> bool:
    """Check if vLLM provider is enabled"""
    return config_manager.is_vllm_enabled()

def get_user_rules() -> str:
    """Get user rules content"""
    return config_manager.get_user_rules()

def get_cluster_rules() -> str:
    """Get cluster rules content"""
    return config_manager.get_cluster_rules()

def get_kubeignore() -> str:
    """Get kubeignore content"""
    return config_manager.get_kubeignore()

def update_user_rules(content: str) -> bool:
    """Update user rules content"""
    return config_manager.update_user_rules(content)

def update_cluster_rules(content: str) -> bool:
    """Update cluster rules content"""
    return config_manager.update_cluster_rules(content)

def update_kubeignore(content: str) -> bool:
    """Update kubeignore content"""
    return config_manager.update_kubeignore(content)

def get_deny_list() -> List[str]:
    """Get agent command deny list"""
    return config_manager.get_deny_list()

def get_web_search_enabled() -> bool:
    """Get web search enabled setting for agents"""
    return config_manager.get_settings().get("agents", {}).get("webSearch", False)

def get_recon_mode() -> bool:
    """Get recon mode setting for agents"""
    return config_manager.get_recon_mode()

def get_image_scans_enabled() -> bool:
    """Get image scans enabled setting"""
    return config_manager.get_settings().get("imageScans", {}).get("enable", False)

def get_image_scans_exclusions() -> Dict[str, Any]:
    """Get image scans exclusions configuration"""
    return config_manager.get_settings().get("imageScans", {}).get("exclusions", {"namespaces": [], "labels": {}})

def get_additional_config() -> Dict[str, Any]:
    """Get the current additional cluster configuration"""
    return config_manager.get_additional_config()

def update_additional_config(new_config: Dict[str, Any]) -> bool:
    """Update additional config with new values"""
    return config_manager.update_additional_config(new_config)

def get_cluster_config(cluster_name: str) -> Dict[str, Any]:
    """Get configuration for a specific cluster"""
    return config_manager.get_cluster_config(cluster_name)

def update_cluster_config(cluster_name: str, cluster_config: Dict[str, Any]) -> bool:
    """Update configuration for a specific cluster"""
    return config_manager.update_cluster_config(cluster_name, cluster_config)

def get_agent_model_mapping() -> Dict[str, Dict[str, str]]:
    """Get the complete agent model mapping configuration"""
    return config_manager.get_agent_model_mapping()

def get_agent_model_config(agent_name: str) -> Dict[str, str]:
    """
    Get model configuration for a specific agent.

    Args:
        agent_name: Name of the agent (logAnalyzer, eventAnalyzer, etc.)

    Returns:
        Dictionary with 'provider' and 'model' keys
        If not configured, returns default configuration with provider='default' and model=''
    """
    return config_manager.get_agent_model_config(agent_name)

# ── Generic provider config functions (models.dev approach) ──

def get_provider_config(provider_id: str) -> Optional[Dict[str, Any]]:
    """Get provider config from settings.json."""
    return config_manager.get_provider_config(provider_id)

def get_provider_api_key(provider_id: str) -> Optional[str]:
    """Get API key for a provider (settings.json → env var fallback)."""
    return config_manager.get_provider_api_key(provider_id)

def get_provider_base_url(provider_id: str) -> Optional[str]:
    """Get custom base URL for a provider."""
    return config_manager.get_provider_base_url(provider_id)

def is_provider_enabled(provider_id: str) -> bool:
    """Check if a provider is enabled with valid credentials."""
    return config_manager.is_provider_enabled(provider_id)

def get_enabled_model_ids() -> List[str]:
    """Get list of enabled model IDs from settings.json."""
    return config_manager.get_enabled_model_ids()

def set_enabled_model_ids(model_ids: List[str]):
    """Write enabled model IDs to settings.json."""
    config_manager.set_enabled_model_ids(model_ids)

def connect_provider(provider_id: str, api_key: str, base_url: str = "", endpoint: str = "") -> bool:
    """Store API key for a provider."""
    return config_manager.connect_provider(provider_id, api_key, base_url, endpoint)

def disconnect_provider(provider_id: str) -> bool:
    """Remove API key for a provider."""
    return config_manager.disconnect_provider(provider_id)