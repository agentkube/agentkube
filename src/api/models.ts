import { ORCHESTRATOR_URL } from '@/config';
import type { ModelsDevModel, ModelsDevProvider, Model } from '@/types/llm';

// ── Types ──

export type { Model, ModelsDevModel, ModelsDevProvider };

// ── Helper: Convert backend ModelsDevModel to frontend Model ──

export function toModel(m: ModelsDevModel): Model {
  return {
    id: m.id,
    name: m.name,
    provider: m.provider_id,
    provider_id: m.provider_id,
    full_id: m.full_id,
    enabled: m.enabled ?? false,
    reasoning: m.reasoning,
    tool_call: m.tool_call,
    attachment: m.attachment,
    cost: m.cost,
    limit: m.limit,
    modalities: m.modalities,
    open_weights: m.open_weights,
    family: m.family,
    knowledge: m.knowledge,
    release_date: m.release_date,
    last_updated: m.last_updated,
    status: m.status,
    structured_output: m.structured_output,
    temperature: m.temperature,
  };
}


// ── API Functions ──

/**
 * Fetch user's enabled models (from settings.json).
 * Backward compatible — this is the same endpoint as the old getModels().
 */
export const getModels = async (): Promise<Model[]> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/models`);
    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
    }
    const data: ModelsDevModel[] = await response.json();
    return data.map(toModel);
  } catch (error) {
    console.error('Error fetching models:', error);
    throw error;
  }
};

/**
 * Fetch ALL models from catalog with enabled status.
 */
export const getAllModels = async (): Promise<Model[]> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/models/all`);
    if (!response.ok) {
      throw new Error(`Failed to fetch all models: ${response.status} ${response.statusText}`);
    }
    const data: ModelsDevModel[] = await response.json();
    return data.map(toModel);
  } catch (error) {
    console.error('Error fetching all models:', error);
    throw error;
  }
};

/**
 * Fetch the full models.dev catalog (providers list with metadata).
 */
export const getProviders = async (): Promise<ModelsDevProvider[]> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/models/providers`);
    if (!response.ok) {
      throw new Error(`Failed to fetch providers: ${response.status} ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching providers:', error);
    throw error;
  }
};

/**
 * Fetch a specific provider with its models.
 */
export const getProviderDetail = async (providerId: string): Promise<ModelsDevProvider> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/models/providers/${providerId}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch provider: ${response.status} ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error fetching provider ${providerId}:`, error);
    throw error;
  }
};

/**
 * Search models by name, family, or provider.
 */
export const searchModels = async (query: string): Promise<Model[]> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/models/search?q=${encodeURIComponent(query)}`);
    if (!response.ok) {
      throw new Error(`Search failed: ${response.status} ${response.statusText}`);
    }
    const data: ModelsDevModel[] = await response.json();
    return data.map(toModel);
  } catch (error) {
    console.error('Error searching models:', error);
    throw error;
  }
};

/**
 * Enable a model (add to settings.json enabledModels list).
 */
export const enableModel = async (providerId: string, modelId: string): Promise<{ status: string; full_id: string; enabled: boolean }> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/models/enable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider_id: providerId, model_id: modelId }),
    });
    if (!response.ok) {
      throw new Error(`Failed to enable model: ${response.status} ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error enabling model:', error);
    throw error;
  }
};

/**
 * Disable a model (remove from settings.json enabledModels list).
 */
export const disableModel = async (providerId: string, modelId: string): Promise<{ status: string; full_id: string; enabled: boolean }> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/models/disable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider_id: providerId, model_id: modelId }),
    });
    if (!response.ok) {
      throw new Error(`Failed to disable model: ${response.status} ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error disabling model:', error);
    throw error;
  }
};

/**
 * Connect a provider (store API key in settings.json).
 */
export const connectProvider = async (
  providerId: string,
  apiKey: string,
  baseUrl?: string,
  endpoint?: string,
): Promise<{ status: string; provider_id: string; connected: boolean }> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/providers/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider_id: providerId,
        api_key: apiKey,
        ...(baseUrl ? { base_url: baseUrl } : {}),
        ...(endpoint ? { endpoint } : {}),
      }),
    });
    if (!response.ok) {
      throw new Error(`Failed to connect provider: ${response.status} ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error connecting provider:', error);
    throw error;
  }
};

/**
 * Disconnect a provider (remove API key from settings.json).
 */
export const disconnectProvider = async (providerId: string): Promise<{ status: string; provider_id: string; connected: boolean }> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/providers/${providerId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`Failed to disconnect provider: ${response.status} ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error disconnecting provider:', error);
    throw error;
  }
};

/**
 * Get connection status for all providers.
 */
export const getProvidersStatus = async (): Promise<Record<string, boolean>> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/providers/status`);
    if (!response.ok) {
      throw new Error(`Failed to fetch provider status: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return data.statuses || {};
  } catch (error) {
    console.error('Error fetching provider status:', error);
    throw error;
  }
};