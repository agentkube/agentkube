// ── models.dev types ──
// These types match the backend's models.dev-backed API responses

export interface ModelsDevCost {
  input: number;
  output: number;
  cache_read?: number;
  cache_write?: number;
}

export interface ModelsDevLimit {
  context: number;
  input?: number;
  output: number;
}

export interface ModelsDevModalities {
  input: string[];   // ["text", "image", "audio", "video", "pdf"]
  output: string[];  // ["text", "image", "audio"]
}

/**
 * A single model from the models.dev catalog.
 * This is the canonical model type used throughout the app.
 */
export interface ModelsDevModel {
  id: string;
  name: string;
  provider_id: string;
  full_id: string;           // "provider_id/model_id"
  family?: string;
  attachment: boolean;
  reasoning: boolean;
  tool_call: boolean;
  temperature?: boolean;
  knowledge?: string;
  release_date?: string;
  last_updated?: string;
  modalities: ModelsDevModalities;
  open_weights: boolean;
  cost: ModelsDevCost;
  limit: ModelsDevLimit;
  status?: string;
  structured_output?: boolean;
  enabled?: boolean;         // from user's settings.json
}

/**
 * Provider info from models.dev catalog.
 */
export interface ModelsDevProvider {
  id: string;
  name: string;
  env: string[];
  api?: string;
  doc?: string;
  logo_url: string;         // https://models.dev/logos/{id}.svg
  model_count: number;
  connected?: boolean;
  models?: Record<string, ModelsDevModel>;
}


// ── Backward-compatible Model type ──
// Used by useModels context and components that expect the simpler shape

export interface Model {
  id: string;               // model_id (e.g., "claude-sonnet-4")
  name: string;
  provider: string;         // provider_id (e.g., "anthropic")
  provider_id: string;      // same as provider
  full_id: string;          // "provider_id/model_id"
  enabled: boolean;
  reasoning: boolean;
  tool_call: boolean;
  attachment: boolean;
  cost: ModelsDevCost;
  limit: ModelsDevLimit;
  modalities: ModelsDevModalities;
  open_weights: boolean;
  family?: string;
  knowledge?: string;
  release_date?: string;
  last_updated?: string;
  status?: string;
  structured_output?: boolean;
  temperature?: boolean;
}


// ── ModelData type ──
// Used by cost dashboard components that fetch from OpenRouter directly.
// These components are independent of the models.dev migration.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ModelData {
  id: string;
  name: string;
  created: number;
  description: string;
  context_length: number;
  architecture: {
    modality: string;
    input_modalities: string[];
    output_modalities: string[];
    tokenizer: string;
    instruct_type: string | null;
    reasoning_config?: Record<string, unknown> | null;
  };
  pricing: {
    prompt: string;
    completion: string;
    request: string;
    image: string;
    web_search: string;
    internal_reasoning: string;
    input_cache_read: string;
    input_cache_write: string;
  };
  top_provider: {
    context_length: number | null;
    max_completion_tokens: number | null;
    is_moderated: boolean;
  };
  per_request_limits: Record<string, unknown>;
  endpoint?: {
    supports_reasoning?: boolean;
    supports_tool_parameters?: boolean;
    [key: string]: unknown;
  };
}