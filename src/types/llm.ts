// Define types for model data
export interface ModelArchitecture {
  modality: string;
  input_modalities: string[];
  output_modalities: string[];
  tokenizer: string;
  instruct_type: string | null;
}

export interface ProviderInfo {
  context_length: number | null;
  max_completion_tokens: number | null;
  is_moderated: boolean;
}

export interface ModelPricing {
  prompt: string;
  completion: string;
  request: string;
  image: string;
  web_search: string;
  internal_reasoning: string;
  input_cache_read: string;
  input_cache_write: string;
}

export interface ModelData {
  id: string;
  name: string;
  created: number;
  description: string;
  context_length: number;
  architecture: ModelArchitecture;
  pricing: ModelPricing;
  top_provider: ProviderInfo;
  per_request_limits: any;
}
