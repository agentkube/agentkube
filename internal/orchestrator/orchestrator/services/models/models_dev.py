"""
Models.dev API Client & Cache Service

Fetches the full AI model catalog from https://models.dev/api.json,
caches it in memory, and provides query methods for providers/models.

This replaces the old hardcoded DEFAULT_MODELS + SQLite approach.
"""

import time
import logging
import httpx
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

MODELS_DEV_API_URL = "https://models.dev/api.json"
MODELS_DEV_LOGO_BASE = "https://models.dev/logos"
CACHE_TTL_SECONDS = 3600  # 1 hour


@dataclass
class ModelsDevCost:
    """Cost per million tokens."""
    input: float = 0.0
    output: float = 0.0
    cache_read: float = 0.0
    cache_write: float = 0.0


@dataclass
class ModelsDevLimit:
    """Token limits for the model."""
    context: int = 0
    input: int = 0
    output: int = 0


@dataclass
class ModelsDevModalities:
    """Input/output modalities supported by the model."""
    input: List[str] = field(default_factory=lambda: ["text"])
    output: List[str] = field(default_factory=lambda: ["text"])


@dataclass
class ModelsDevModel:
    """A single model from the models.dev catalog."""
    id: str
    name: str
    provider_id: str = ""
    family: str = ""
    attachment: bool = False
    reasoning: bool = False
    tool_call: bool = False
    temperature: bool = True
    knowledge: str = ""
    release_date: str = ""
    last_updated: str = ""
    modalities: ModelsDevModalities = field(default_factory=ModelsDevModalities)
    open_weights: bool = False
    cost: ModelsDevCost = field(default_factory=ModelsDevCost)
    limit: ModelsDevLimit = field(default_factory=ModelsDevLimit)
    status: str = ""
    structured_output: bool = False

    @property
    def full_id(self) -> str:
        """Return provider_id/model_id format."""
        return f"{self.provider_id}/{self.id}" if self.provider_id else self.id

    def to_dict(self) -> Dict[str, Any]:
        """Convert to a JSON-serializable dict."""
        return {
            "id": self.id,
            "name": self.name,
            "provider_id": self.provider_id,
            "full_id": self.full_id,
            "family": self.family,
            "attachment": self.attachment,
            "reasoning": self.reasoning,
            "tool_call": self.tool_call,
            "temperature": self.temperature,
            "knowledge": self.knowledge,
            "release_date": self.release_date,
            "last_updated": self.last_updated,
            "modalities": {
                "input": self.modalities.input,
                "output": self.modalities.output,
            },
            "open_weights": self.open_weights,
            "cost": {
                "input": self.cost.input,
                "output": self.cost.output,
                "cache_read": self.cost.cache_read,
                "cache_write": self.cost.cache_write,
            },
            "limit": {
                "context": self.limit.context,
                "input": self.limit.input,
                "output": self.limit.output,
            },
            "status": self.status,
            "structured_output": self.structured_output,
        }


@dataclass
class ModelsDevProvider:
    """A provider from the models.dev catalog."""
    id: str
    name: str
    env: List[str] = field(default_factory=list)
    npm: str = ""
    api: str = ""
    doc: str = ""
    models: Dict[str, ModelsDevModel] = field(default_factory=dict)

    @property
    def logo_url(self) -> str:
        return f"{MODELS_DEV_LOGO_BASE}/{self.id}.svg"

    @property
    def model_count(self) -> int:
        return len(self.models)

    def to_dict(self, include_models: bool = False) -> Dict[str, Any]:
        """Convert to JSON-serializable dict."""
        result = {
            "id": self.id,
            "name": self.name,
            "env": self.env,
            "api": self.api,
            "doc": self.doc,
            "logo_url": self.logo_url,
            "model_count": self.model_count,
        }
        if include_models:
            result["models"] = {
                mid: m.to_dict() for mid, m in self.models.items()
            }
        return result


def _parse_cost(raw: Any) -> ModelsDevCost:
    """Parse cost data from raw API response."""
    if not raw or not isinstance(raw, dict):
        return ModelsDevCost()
    return ModelsDevCost(
        input=float(raw.get("input", 0) or 0),
        output=float(raw.get("output", 0) or 0),
        cache_read=float(raw.get("cache_read", 0) or 0),
        cache_write=float(raw.get("cache_write", 0) or 0),
    )


def _parse_limit(raw: Any) -> ModelsDevLimit:
    """Parse limit data from raw API response."""
    if not raw or not isinstance(raw, dict):
        return ModelsDevLimit()
    return ModelsDevLimit(
        context=int(raw.get("context", 0) or 0),
        input=int(raw.get("input", 0) or 0),
        output=int(raw.get("output", 0) or 0),
    )


def _parse_modalities(raw: Any) -> ModelsDevModalities:
    """Parse modalities from raw API response."""
    if not raw or not isinstance(raw, dict):
        return ModelsDevModalities()
    return ModelsDevModalities(
        input=raw.get("input", ["text"]) or ["text"],
        output=raw.get("output", ["text"]) or ["text"],
    )


def _parse_model(model_id: str, raw: Dict[str, Any], provider_id: str) -> ModelsDevModel:
    """Parse a single model from raw API data."""
    return ModelsDevModel(
        id=model_id,
        name=raw.get("name", model_id),
        provider_id=provider_id,
        family=raw.get("family", ""),
        attachment=bool(raw.get("attachment", False)),
        reasoning=bool(raw.get("reasoning", False)),
        tool_call=bool(raw.get("tool_call", False)),
        temperature=bool(raw.get("temperature", True)),
        knowledge=raw.get("knowledge", ""),
        release_date=raw.get("release_date", ""),
        last_updated=raw.get("last_updated", ""),
        modalities=_parse_modalities(raw.get("modalities")),
        open_weights=bool(raw.get("open_weights", False)),
        cost=_parse_cost(raw.get("cost")),
        limit=_parse_limit(raw.get("limit")),
        status=raw.get("status", ""),
        structured_output=bool(raw.get("structured_output", False)),
    )


def _parse_provider(provider_id: str, raw: Dict[str, Any]) -> ModelsDevProvider:
    """Parse a single provider (with its models) from raw API data."""
    models_raw = raw.get("models", {})
    models = {}
    for model_id, model_data in models_raw.items():
        if isinstance(model_data, dict):
            models[model_id] = _parse_model(model_id, model_data, provider_id)

    return ModelsDevProvider(
        id=provider_id,
        name=raw.get("name", provider_id),
        env=raw.get("env", []) or [],
        npm=raw.get("npm", ""),
        api=raw.get("api", ""),
        doc=raw.get("doc", ""),
        models=models,
    )


class ModelsDevService:
    """
    Service to fetch, cache, and query the models.dev catalog.

    Usage:
        catalog = await ModelsDevService.get_catalog()
        providers = await ModelsDevService.get_providers()
        models = await ModelsDevService.get_models_for_provider("openai")
    """

    _cache: Optional[Dict[str, ModelsDevProvider]] = None
    _cache_time: float = 0
    _fetching: bool = False

    @classmethod
    async def get_catalog(cls) -> Dict[str, ModelsDevProvider]:
        """
        Fetch and return the full models.dev catalog.
        Results are cached in-memory for CACHE_TTL_SECONDS.
        """
        now = time.time()
        if cls._cache is not None and (now - cls._cache_time) < CACHE_TTL_SECONDS:
            return cls._cache

        try:
            cls._fetching = True
            logger.info("Fetching models.dev catalog from %s", MODELS_DEV_API_URL)
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.get(MODELS_DEV_API_URL)
                response.raise_for_status()
                raw_data = response.json()

            catalog: Dict[str, ModelsDevProvider] = {}
            for provider_id, provider_data in raw_data.items():
                if isinstance(provider_data, dict):
                    catalog[provider_id] = _parse_provider(provider_id, provider_data)

            cls._cache = catalog
            cls._cache_time = time.time()
            logger.info(
                "models.dev catalog loaded: %d providers, %d total models",
                len(catalog),
                sum(p.model_count for p in catalog.values()),
            )
            return catalog

        except Exception as e:
            logger.error("Failed to fetch models.dev catalog: %s", e)
            # Return stale cache if available
            if cls._cache is not None:
                logger.warning("Returning stale models.dev cache")
                return cls._cache
            # Return empty catalog on first-time failure
            return {}
        finally:
            cls._fetching = False

    @classmethod
    async def get_providers(cls) -> List[ModelsDevProvider]:
        """Return list of all providers (without model details)."""
        catalog = await cls.get_catalog()
        return list(catalog.values())

    @classmethod
    async def get_provider(cls, provider_id: str) -> Optional[ModelsDevProvider]:
        """Get a specific provider by ID."""
        catalog = await cls.get_catalog()
        return catalog.get(provider_id)

    @classmethod
    async def get_models_for_provider(cls, provider_id: str) -> List[ModelsDevModel]:
        """Get all models for a specific provider."""
        provider = await cls.get_provider(provider_id)
        if not provider:
            return []
        return list(provider.models.values())

    @classmethod
    async def get_model(cls, provider_id: str, model_id: str) -> Optional[ModelsDevModel]:
        """Get a specific model by provider and model ID."""
        provider = await cls.get_provider(provider_id)
        if not provider:
            return None
        return provider.models.get(model_id)

    @classmethod
    async def get_all_models_flat(cls) -> List[ModelsDevModel]:
        """Get every model from every provider as a flat list."""
        catalog = await cls.get_catalog()
        models = []
        for provider in catalog.values():
            models.extend(provider.models.values())
        return models

    @classmethod
    async def search_models(cls, query: str) -> List[ModelsDevModel]:
        """Search models by name, family, or provider ID."""
        query_lower = query.lower()
        all_models = await cls.get_all_models_flat()
        results = []
        for model in all_models:
            if (
                query_lower in model.name.lower()
                or query_lower in model.id.lower()
                or query_lower in model.family.lower()
                or query_lower in model.provider_id.lower()
            ):
                results.append(model)
        return results

    @classmethod
    async def get_provider_api_url(cls, provider_id: str) -> str:
        """Get the API base URL for a provider from catalog."""
        provider = await cls.get_provider(provider_id)
        if provider and provider.api:
            return provider.api
        return ""

    @classmethod
    async def get_provider_env_vars(cls, provider_id: str) -> List[str]:
        """Get required environment variable names for a provider."""
        provider = await cls.get_provider(provider_id)
        if provider:
            return provider.env
        return []

    @classmethod
    def invalidate_cache(cls):
        """Force re-fetch on next call."""
        cls._cache = None
        cls._cache_time = 0
        logger.info("models.dev cache invalidated")
