"""
AI Provider Resolution — Direct provider routing.
"""

from enum import Enum
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
import logging
import os

from config import (
    get_provider_api_key,
    get_provider_base_url,
    is_provider_enabled,
    config_manager
)

logger = logging.getLogger(__name__)


class ProviderType(str, Enum):
    """Provider types for type safety."""
    OPENROUTER = "openrouter"
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    GOOGLE = "google"
    AZURE = "azure"
    OLLAMA = "ollama"
    VLLM = "vllm"
    CUSTOM = "custom"

    @classmethod
    def from_string(cls, value: str) -> "ProviderType":
        """Convert string to ProviderType, falling back to CUSTOM."""
        try:
            return cls(value.lower())
        except ValueError:
            return cls.CUSTOM


# Known provider API base URLs
KNOWN_PROVIDER_URLS: Dict[str, str] = {
    "openrouter": "https://openrouter.ai/api/v1",
    "openai": "https://api.openai.com/v1",
    "anthropic": "https://api.anthropic.com/v1",
    "google": "https://generativelanguage.googleapis.com/v1beta",
    "xai": "https://api.x.ai/v1",
    "groq": "https://api.groq.com/openai/v1",
    "deepseek": "https://api.deepseek.com/v1",
    "mistral": "https://api.mistral.ai/v1",
    "cohere": "https://api.cohere.com/v2",
    "perplexity": "https://api.perplexity.ai",
    "together": "https://api.together.xyz/v1",
    "fireworks": "https://api.fireworks.ai/inference/v1",
    "cerebras": "https://api.cerebras.ai/v1",
    "sambanova": "https://api.sambanova.ai/v1",
    "alibaba": "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
}

# Local providers that don't need API keys
LOCAL_PROVIDERS = {"ollama", "vllm", "lmstudio"}

# Default endpoints for local providers
LOCAL_PROVIDER_DEFAULTS: Dict[str, str] = {
    "ollama": "http://127.0.0.1:11434/v1",
    "vllm": "http://localhost:8000/v1",
    "lmstudio": "http://localhost:1234/v1",
}


def _parse_model_name(model_name: str) -> tuple:
    """
    Parse a model name into (provider_id, api_model_name).

    Examples:
      "openai/gpt-4o-mini"           → ("openai", "gpt-4o-mini")
      "anthropic/claude-sonnet-4"    → ("anthropic", "claude-sonnet-4")
      "openrouter/openai/gpt-4o-mini" → ("openrouter", "openai/gpt-4o-mini")
      "deepseek/deepseek-chat"       → ("deepseek", "deepseek-chat")
      "gpt-4o-mini"                  → (None, "gpt-4o-mini")
    """
    if "/" not in model_name:
        return None, model_name

    parts = model_name.split("/", 1)
    provider_id = parts[0].lower()

    # Special case: openrouter models have format "openrouter/provider/model"
    # The API model name should be "provider/model" (everything after "openrouter/")
    if provider_id == "openrouter":
        return "openrouter", parts[1]  # e.g., "openai/gpt-4o-mini"

    # Normal case: "provider/model"
    return provider_id, parts[1]


@dataclass
class AIProvider:
    """
    AI Provider configuration — Direct routing approach.

    Each model routes to its actual provider. No fallback.
    API keys come from settings.json or environment variables.

    Attributes:
        provider: The provider type enum
        model_name: The model name sent to the API (stripped of provider prefix,
                     except for OpenRouter which keeps "provider/model")
        api_key: API key for the provider
        base_url: Base URL for the provider API
        parsed_model: The model name without any provider prefix
        provider_id: The raw provider identifier string
    """
    provider: ProviderType
    model_name: str
    api_key: str
    base_url: str
    parsed_model: str = ""
    provider_id: str = ""

    def __post_init__(self):
        """Set defaults."""
        if not self.provider_id:
            self.provider_id = self.provider.value

    @classmethod
    def _resolve_api_key(cls, provider_id: str) -> str:
        """
        Get API key for a provider from settings.json or env vars.
        Returns empty string if not found (no fallback).
        """
        key = get_provider_api_key(provider_id)
        return key or ""

    @classmethod
    def _resolve_base_url(cls, provider_id: str) -> str:
        """
        Get base URL for a provider.
        Priority: settings.json > KNOWN_PROVIDER_URLS.
        """
        # Check user-configured endpoint first
        url = get_provider_base_url(provider_id)
        if url:
            return url

        # Fall back to known defaults
        return KNOWN_PROVIDER_URLS.get(provider_id, "")

    @classmethod
    def from_model(cls, model_name: str, provider: Optional[str] = None) -> "AIProvider":
        """
        Create AIProvider for a model. Main entry point.

        Direct routing — no fallback to OpenRouter:
        1. Parse model name to extract provider_id and api_model_name
        2. Look up API key from settings.json for that provider
        3. Look up base URL for that provider
        4. Return configured AIProvider

        For OpenRouter models (e.g., "openrouter/openai/gpt-4o-mini"):
        - Uses OpenRouter base URL and API key
        - Sends "openai/gpt-4o-mini" as the model name to OpenRouter API

        Args:
            model_name: Full model name (e.g., "openai/gpt-4", "openrouter/openai/gpt-4o-mini")
            provider: Optional provider override (ignored if model name has provider prefix)

        Returns:
            Configured AIProvider instance
        """
        # Parse provider and model from the model name
        provider_id, api_model_name = _parse_model_name(model_name)

        # If explicit provider override is given (and model didn't have a prefix)
        if not provider_id and provider:
            provider_id = provider.lower()

        # If still no provider, try to infer or error
        if not provider_id:
            logger.warning("No provider found for model: %s", model_name)
            # Treat as bare model name — caller should handle the error
            return cls(
                provider=ProviderType.CUSTOM,
                model_name=model_name,
                api_key="",
                base_url="",
                parsed_model=model_name,
                provider_id="unknown",
            )

        # Local providers
        if provider_id in LOCAL_PROVIDERS:
            base_url = get_provider_base_url(provider_id) or LOCAL_PROVIDER_DEFAULTS.get(provider_id, "")
            return cls(
                provider=ProviderType.from_string(provider_id),
                model_name=api_model_name,
                api_key=provider_id,  # dummy key for local
                base_url=base_url,
                parsed_model=api_model_name,
                provider_id=provider_id,
            )

        # Cloud provider — resolve API key and base URL
        api_key = cls._resolve_api_key(provider_id)
        base_url = cls._resolve_base_url(provider_id)

        if not api_key:
            logger.warning(
                "No API key found for provider '%s' (model: %s). "
                "Please configure it in Settings → Models → API Keys or set the environment variable.",
                provider_id, model_name
            )

        if not base_url:
            logger.warning(
                "No base URL found for provider '%s' (model: %s).",
                provider_id, model_name
            )

        logger.info(
            "Routing model '%s' → provider='%s', api_model='%s', base_url='%s'",
            model_name, provider_id, api_model_name, base_url
        )

        return cls(
            provider=ProviderType.from_string(provider_id),
            model_name=api_model_name,
            api_key=api_key,
            base_url=base_url,
            parsed_model=api_model_name.split("/")[-1] if "/" in api_model_name else api_model_name,
            provider_id=provider_id,
        )

    @property
    def is_local_provider(self) -> bool:
        """Check if this is a local provider."""
        return self.provider_id in LOCAL_PROVIDERS

    @property
    def is_cloud_provider(self) -> bool:
        """Check if this is a cloud provider."""
        return not self.is_local_provider

    def validate(self) -> bool:
        """Validate provider configuration."""
        if not self.base_url:
            logger.error("Provider %s: Missing base_url", self.provider_id)
            return False
        if not self.api_key:
            logger.error("Provider %s: Missing API key", self.provider_id)
            return False
        if not self.model_name:
            logger.error("Provider %s: Missing model_name", self.provider_id)
            return False
        return True

    def to_openai_client_params(self) -> Dict[str, Any]:
        """Convert to OpenAI client parameters."""
        return {
            "base_url": self.base_url,
            "api_key": self.api_key,
        }

    def __repr__(self) -> str:
        masked_key = f"{self.api_key[:8]}..." if self.api_key and len(self.api_key) > 8 else "****"
        return (
            f"AIProvider(provider={self.provider_id}, "
            f"model={self.model_name}, "
            f"base_url={self.base_url}, "
            f"api_key={masked_key})"
        )


def get_provider_for_model(model_name: str, provider: Optional[str] = None) -> AIProvider:
    """
    Convenience function to get provider for a model.

    Args:
        model_name: The model name (e.g., "openai/gpt-4", "openrouter/openai/gpt-4o-mini")
        provider: Optional provider override

    Returns:
        AIProvider instance configured for the model
    """
    return AIProvider.from_model(model_name, provider)
