"""
Model Service — models.dev + settings.json approach.

Models come from the models.dev catalog.
User preferences (enabled/disabled models) live in ~/.agentkube/settings.json.
No database dependency.

Following sst/opencode pattern:
- ALL models from connected providers are available by default
- Users can enable/disable individual models
- Deprecated/alpha models are filtered out by default
"""

import logging
import os
from typing import List, Dict, Any, Optional, Set
from config import config_manager

from orchestrator.services.models.models_dev import ModelsDevService

logger = logging.getLogger(__name__)

# Status values that should be filtered out by default
FILTERED_STATUSES = {"deprecated"}

# Env var mapping for provider connection detection
PROVIDER_ENV_MAPPING = {
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "google": "GOOGLE_GENERATIVE_AI_API_KEY",
    "xai": "XAI_API_KEY",
    "groq": "GROQ_API_KEY",
    "deepseek": "DEEPSEEK_API_KEY",
    "mistral": "MISTRAL_API_KEY",
    "cohere": "COHERE_API_KEY",
    "perplexity": "PERPLEXITY_API_KEY",
    "together": "TOGETHER_API_KEY",
    "fireworks": "FIREWORKS_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
    "github-copilot": "GITHUB_TOKEN",
}


def _is_provider_connected(provider_id: str) -> bool:
    """Check if a provider has credentials configured."""
    settings = config_manager.get_settings()

    # Check new unified providers config
    providers = settings.get("models", {}).get("providers", {})
    provider_conf = providers.get(provider_id, {})
    if provider_conf.get("enabled") and provider_conf.get("apiKey"):
        return True

    # Check legacy externalProviderSettings
    ext = settings.get("models", {}).get("externalProviderSettings", {})
    legacy_conf = ext.get(provider_id, {})
    if legacy_conf.get("enabled") and legacy_conf.get("apiKey"):
        return True

    # Check environment variables
    env_var = PROVIDER_ENV_MAPPING.get(provider_id)
    if env_var and os.environ.get(env_var):
        return True

    # Local providers (Ollama, vLLM) — connected if endpoint is set
    if provider_id in ("ollama", "vllm"):
        local_conf = ext.get(provider_id, {}) or providers.get(provider_id, {})
        if local_conf.get("enabled"):
            return True

    return False


def _get_connected_provider_ids() -> Set[str]:
    """Return the set of provider IDs that have credentials configured."""
    connected = set()
    settings = config_manager.get_settings()

    # Check new providers path
    providers = settings.get("models", {}).get("providers", {})
    for pid, conf in providers.items():
        if conf.get("enabled") and (conf.get("apiKey") or conf.get("endpoint")):
            connected.add(pid)

    # Check legacy path
    ext = settings.get("models", {}).get("externalProviderSettings", {})
    for pid, conf in ext.items():
        if conf.get("enabled") and (conf.get("apiKey") or conf.get("endpoint")):
            connected.add(pid)

    # Check env vars from our hardcoded mapping
    for pid, env_var in PROVIDER_ENV_MAPPING.items():
        if os.environ.get(env_var):
            connected.add(pid)

    return connected


async def _get_connected_provider_ids_with_catalog() -> Set[str]:
    """
    Like _get_connected_provider_ids but also dynamically checks env vars
    from the models.dev catalog. This catches providers we didn't hardcode.
    """
    connected = _get_connected_provider_ids()

    # Also check env vars listed in the models.dev catalog providers
    try:
        catalog_providers = await ModelsDevService.get_providers()
        for provider in catalog_providers:
            if provider.id in connected:
                continue
            # Check if any of the provider's env vars are set
            for env_var in provider.env:
                if os.environ.get(env_var):
                    connected.add(provider.id)
                    break
    except Exception:
        pass  # Catalog may not be available yet

    return connected


class ModelService:
    """
    Service for handling model-related operations.

    Uses models.dev as the source of truth for available models.
    User preferences (enabled/disabled) stored in settings.json.
    No database dependency.

    Like sst/opencode: if a provider is connected, ALL its non-deprecated
    models are enabled by default. Users can then enable/disable individually.
    """

    @classmethod
    def _get_enabled_model_ids(cls) -> List[str]:
        """
        Read enabled model IDs from settings.json.

        If no explicit enabledModels list exists (first-time or fresh install),
        returns None to signal that the caller should use the "all connected
        provider models" strategy (like opencode).
        """
        settings = config_manager.get_settings()
        enabled = settings.get("models", {}).get("enabledModels", None)
        return enabled  # None = not set yet, [] = explicitly empty

    @classmethod
    def _set_enabled_model_ids(cls, model_ids: List[str]):
        """Write enabled model IDs to settings.json."""
        config_manager.update_settings({
            "models": {
                "enabledModels": model_ids
            }
        })

    @classmethod
    async def _get_effective_enabled_ids(cls) -> Set[str]:
        """
        Resolve the effective set of enabled model IDs.

        Like opencode:
        - If user has an explicit enabledModels list → use that
        - Otherwise → ALL non-deprecated models from connected providers
        """
        explicit = cls._get_enabled_model_ids()
        if explicit is not None:
            return set(explicit)

        # No explicit list → enable ALL models from connected providers
        # (matching opencode behavior)
        connected = await _get_connected_provider_ids_with_catalog()
        if not connected:
            return set()

        all_models = await ModelsDevService.get_all_models_flat()
        enabled = set()
        for model in all_models:
            if model.provider_id not in connected:
                continue
            # Filter deprecated/alpha models (like opencode)
            status = getattr(model, 'status', '') or ''
            if status in FILTERED_STATUSES:
                continue
            enabled.add(model.full_id)

        # Persist so future calls use the explicit list
        cls._set_enabled_model_ids(sorted(enabled))
        logger.info("Auto-enabled %d models from %d connected providers", len(enabled), len(connected))
        return enabled

    @classmethod
    async def list_all_models(cls) -> List[Dict[str, Any]]:
        """
        List ALL models from models.dev catalog, with an `enabled` flag
        indicating whether the user has enabled each one.
        """
        enabled_ids = await cls._get_effective_enabled_ids()
        all_models = await ModelsDevService.get_all_models_flat()

        result = []
        for model in all_models:
            m = model.to_dict()
            m["enabled"] = model.full_id in enabled_ids
            result.append(m)
        return result

    @classmethod
    async def list_enabled_models(cls) -> List[Dict[str, Any]]:
        """
        List only user-enabled models, enriched with data from models.dev.
        Falls back to ID-only entries if a model isn't in the catalog
        (e.g., user enabled a local/custom model).
        """
        enabled_ids = await cls._get_effective_enabled_ids()
        result = []

        for full_id in sorted(enabled_ids):
            parts = full_id.split("/", 1)
            if len(parts) != 2:
                continue
            provider_id, model_id = parts

            model = await ModelsDevService.get_model(provider_id, model_id)
            if model:
                m = model.to_dict()
                m["enabled"] = True
                result.append(m)
            else:
                # Model not in catalog (local/custom model) — return minimal info
                result.append({
                    "id": model_id,
                    "name": model_id,
                    "provider_id": provider_id,
                    "full_id": full_id,
                    "family": "",
                    "attachment": False,
                    "reasoning": False,
                    "tool_call": False,
                    "temperature": True,
                    "knowledge": "",
                    "release_date": "",
                    "last_updated": "",
                    "modalities": {"input": ["text"], "output": ["text"]},
                    "open_weights": False,
                    "cost": {"input": 0, "output": 0, "cache_read": 0, "cache_write": 0},
                    "limit": {"context": 0, "input": 0, "output": 0},
                    "status": "",
                    "structured_output": False,
                    "enabled": True,
                })
        return result

    @classmethod
    async def enable_model(cls, provider_id: str, model_id: str) -> Dict[str, Any]:
        """Add a model to the enabled list in settings.json."""
        full_id = f"{provider_id}/{model_id}"
        enabled_ids = list(await cls._get_effective_enabled_ids())
        if full_id not in enabled_ids:
            enabled_ids.append(full_id)
            cls._set_enabled_model_ids(sorted(enabled_ids))
            logger.info("Model enabled: %s", full_id)
        return {"status": "ok", "full_id": full_id, "enabled": True}

    @classmethod
    async def disable_model(cls, provider_id: str, model_id: str) -> Dict[str, Any]:
        """Remove a model from the enabled list in settings.json."""
        full_id = f"{provider_id}/{model_id}"
        enabled_ids = list(await cls._get_effective_enabled_ids())
        if full_id in enabled_ids:
            enabled_ids.remove(full_id)
            cls._set_enabled_model_ids(sorted(enabled_ids))
            logger.info("Model disabled: %s", full_id)
        return {"status": "ok", "full_id": full_id, "enabled": False}

    @classmethod
    async def get_model_info(cls, provider_id: str, model_id: str) -> Optional[Dict[str, Any]]:
        """Get full model info from models.dev catalog."""
        model = await ModelsDevService.get_model(provider_id, model_id)
        if model:
            enabled_ids = await cls._get_effective_enabled_ids()
            m = model.to_dict()
            m["enabled"] = model.full_id in enabled_ids
            return m
        return None

    @classmethod
    async def search_models(cls, query: str) -> List[Dict[str, Any]]:
        """Search the catalog, with enabled status annotated."""
        enabled_ids = await cls._get_effective_enabled_ids()
        results = await ModelsDevService.search_models(query)
        out = []
        for model in results:
            m = model.to_dict()
            m["enabled"] = model.full_id in enabled_ids
            out.append(m)
        return out

    @classmethod
    async def get_providers(cls) -> List[Dict[str, Any]]:
        """Get all providers with connection status."""
        providers = await ModelsDevService.get_providers()
        result = []
        for p in providers:
            d = p.to_dict(include_models=False)
            # Check if provider has API key configured
            d["connected"] = _is_provider_connected(p.id)
            result.append(d)
        return result

    @classmethod
    async def get_provider_detail(cls, provider_id: str) -> Optional[Dict[str, Any]]:
        """Get a single provider with its models."""
        provider = await ModelsDevService.get_provider(provider_id)
        if not provider:
            return None
        d = provider.to_dict(include_models=True)
        d["connected"] = _is_provider_connected(provider_id)
        # Annotate enabled status on each model
        enabled_ids = await cls._get_effective_enabled_ids()
        if "models" in d:
            for mid, mdata in d["models"].items():
                full_id = f"{provider_id}/{mid}"
                mdata["enabled"] = full_id in enabled_ids
        return d