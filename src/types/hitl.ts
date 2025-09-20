export interface HITLApprovalRequest {
  request_id: string;
  function_name: string;
  function_args: Record<string, any>;
  command: string;
  timestamp: number;
}

export interface HITLDecisionRequest {
  request_id: string;
  approved: boolean;
}

export interface HITLDecisionResponse {
  success: boolean;
  message: string;
}

export interface HITLStatusResponse {
  enabled: boolean;
}

export interface HITLToggleRequest {
  enabled: boolean;
}

export interface HITLToggleResponse {
  enabled: boolean;
  message: string;
}

export interface HITLPendingRequestsResponse {
  requests: Record<string, {
    function_name: string;
    function_args: Record<string, any>;
    command: string;
    timestamp: number;
  }>;
}

export type HITLDecisionType = 'APPROVED' | 'REJECTED' | 'TIMEOUT';

export interface HITLToolCallOutput {
  command: string;
  output: string;
  hitl_status?: HITLDecisionType;
}