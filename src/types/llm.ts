// Define types for model data
export interface ProviderIcon {
  url: string;
  invertRequired: boolean;
}

export interface DataPolicyDetails {
  dataPolicyUrl?: string;
  privacyPolicyURL?: string;
  termsOfServiceURL?: string;
  paidModels?: {
    training: boolean;
    retainsPrompts?: boolean;
  };
  requiresUserIDs?: boolean;
  training?: boolean;
  retainsPrompts?: boolean;
}

export interface DetailedProviderInfo {
  name: string;
  displayName: string;
  slug: string;
  baseUrl: string;
  dataPolicy: DataPolicyDetails;
  headquarters: string;
  datacenters?: string[];
  hasChatCompletions: boolean;
  hasCompletions: boolean;
  isAbortable: boolean;
  moderationRequired: boolean;
  editors: string[];
  owners: string[];
  adapterName: string;
  isMultipartSupported: boolean;
  statusPageUrl: string | null;
  byokEnabled: boolean;
  icon: ProviderIcon;
  ignoredProviderModels: string[];
}

export interface EndpointModel {
  slug: string;
  hf_slug: string;
  updated_at: string;
  created_at: string;
  hf_updated_at: string | null;
  name: string;
  short_name: string;
  author: string;
  description: string;
  model_version_group_id: string | null;
  context_length: number;
  input_modalities: string[];
  output_modalities: string[];
  has_text_output: boolean;
  group: string;
  instruct_type: string | null;
  default_system: string | null;
  default_stops: string[];
  hidden: boolean;
  router: string | null;
  warning_message: string;
  permaslug: string;
  reasoning_config: Record<string, unknown> | null;
  features: Record<string, unknown> | null;
}

export interface Endpoint {
  id: string;
  name: string;
  context_length: number;
  model: EndpointModel;
  model_variant_slug: string;
  model_variant_permaslug: string;
  adapter_name: string;
  provider_name: string;
  provider_info: DetailedProviderInfo;
  provider_display_name: string;
  provider_slug: string;
  provider_model_id: string;
  quantization: string | null;
  variant: string;
  is_free: boolean;
  can_abort: boolean;
  max_prompt_tokens: number | null;
  max_completion_tokens: number | null;
  max_prompt_images: number | null;
  max_tokens_per_image: number | null;
  supported_parameters: string[];
  is_byok: boolean;
  moderation_required: boolean;
  data_policy: DataPolicyDetails;
  pricing: ModelPricing;
  variable_pricings: VariablePricing[];
  is_hidden: boolean;
  is_deranked: boolean;
  is_disabled: boolean;
  supports_tool_parameters: boolean;
  supports_reasoning: boolean;
  supports_multipart: boolean;
  limit_rpm: number | null;
  limit_rpd: number | null;
  limit_rpm_cf: number | null;
  has_completions: boolean;
  has_chat_completions: boolean;
  features: Record<string, unknown>;
  provider_region: string | null;
}

export interface VariablePricing {
  [key: string]: unknown;
}

export interface PerRequestLimits {
  rpm?: number | null;
  rpd?: number | null;
  tokens_per_minute?: number | null;
  tokens_per_day?: number | null;
  [key: string]: unknown;
}

export interface ModelArchitecture {
  modality: string;
  input_modalities: string[];
  output_modalities: string[];
  tokenizer: string;
  instruct_type: string | null;
  has_text_output?: boolean;
  group?: string;
  default_system?: string | null;
  default_stops?: string[];
  reasoning_config?: Record<string, unknown> | null;
  features?: Record<string, unknown> | null;
}

export interface ProviderInfo {
  context_length: number | null;
  max_completion_tokens: number | null;
  is_moderated: boolean;
  name?: string;
  displayName?: string;
  slug?: string;
  baseUrl?: string;
  headquarters?: string;
  hasChatCompletions?: boolean;
  hasCompletions?: boolean;
  isAbortable?: boolean;
  moderationRequired?: boolean;
  adapterName?: string;
  isMultipartSupported?: boolean;
  statusPageUrl?: string | null;
  byokEnabled?: boolean;
  quantization?: string;
  variant?: string;
  is_free?: boolean;
  can_abort?: boolean;
  max_prompt_tokens?: number | null;
  max_prompt_images?: number | null;
  max_tokens_per_image?: number | null;
  supported_parameters?: string[];
  is_byok?: boolean;
  supports_tool_parameters?: boolean;
  supports_reasoning?: boolean;
  supports_multipart?: boolean;
  limit_rpm?: number | null;
  limit_rpd?: number | null;
  limit_rpm_cf?: number | null;
  provider_region?: string | null;
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
  discount?: number;
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
  per_request_limits: PerRequestLimits;
  slug?: string;
  hf_slug?: string;
  updated_at?: string;
  created_at?: string;
  hf_updated_at?: string | null;
  short_name?: string;
  author?: string;
  model_version_group_id?: string | null;
  hidden?: boolean;
  router?: string | null;
  warning_message?: string;
  permaslug?: string;
  endpoint?: Endpoint;
  is_hidden?: boolean;
  is_deranked?: boolean;
  is_disabled?: boolean;
  variable_pricings?: VariablePricing[];
  data_policy?: DataPolicyDetails;
}