// Investigation and Task Types based on API documentation

export interface InvestigationRequest {
  prompt: string;
  context?: {
    kubecontext?: string;
    namespace?: string;
    resource_name?: string;
    resource_type?: string;
  };
  model?: string;
  resource_context?: ResourceContext[];
  log_context?: LogContext[];
}

export interface ResourceContext {
  resource_name: string;
  resource_content: string;
}

export interface LogContext {
  log_name: string;
  log_content: string;
}

export interface InvestigationResponse {
  task_id: string;
  status: string;
  message: string;
  poll_url: string;
}

export interface InvestigationStatus {
  task_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  created_at: string;
  started_at?: string;
  completed_at?: string;
  message?: string;
  error?: string;
}

export interface Impact {
  impact_duration: number;
  service_affected: string | null;
  error_rate: number;
}

export interface SubTaskPlan {
  tool_name: string;
  output: string;
  title: string;
}

export interface SubTask {
  subject: string;
  status: number;
  reason: string;
  goal: string;
  plan: SubTaskPlan[];
  discovery: string;
}

export interface TaskDetails {
  id: string;
  task_id: string;
  title: string;
  tags: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  duration: number;
  status: 'processed' | 'completed' | 'cancelled';
  impact: Impact;
  sub_tasks: SubTask[];
  events: any[];
  summary: string;
  remediation: string;
  created_at: string;
  updated_at: string;
}

export interface InvestigationTaskDetails {
  id: string;
  task_id: string;
  prompt: string;
  context?: {
    kubecontext?: string;
    namespace?: string;
  };
  model?: string;
  resource_context?: ResourceContext[];
  log_context?: LogContext[];
  created_at: string;
  updated_at: string;
}

export interface InvestigationListItem {
  task_id: string;
  status: string;
  title: string;
  tags: string[];
  severity: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

export interface InvestigationListResponse {
  investigations: InvestigationListItem[];
  total: number;
}

export interface CancelResponse {
  task_id: string;
  status: string;
  message: string;
}

export interface DeleteResponse {
  status: string;
  message: string;
}

export interface InvestigationMetrics {
  queue_size: number;
  max_queue_size: number;
  num_workers: number;
  active_investigations: number;
  total_investigations: number;
}

// Streaming event types
export interface StreamEvent {
  type: 'investigation_started' | 'tool_call' | 'tool_output' | 'analysis_update' | 'investigation_summary';
  timestamp: string;
  trace_id?: string;
  issue_title?: string;
  tool?: string;
  arguments?: any;
  output?: string;
  content?: string;
  step?: number;
  summary?: {
    tool_calls: number;
    findings: string;
  };
}

export interface StreamCallbacks {
  onInvestigationStarted?: (event: StreamEvent) => void;
  onToolCall?: (event: StreamEvent) => void;
  onToolOutput?: (event: StreamEvent) => void;
  onAnalysisUpdate?: (event: StreamEvent) => void;
  onInvestigationSummary?: (event: StreamEvent) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
}