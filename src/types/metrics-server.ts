/**
 * Request payload for metrics server installation
 */
export interface MetricsServerInstallRequest {
  type: 'production' | 'local';
}

/**
 * Response from metrics server installation/uninstallation operations
 */
export interface MetricsServerOperationResponse {
  success: boolean;
  message: string;
  operationId: string;
  data: {
    status: string;
    cluster?: string;
    type?: string;
  };
}

/**
 * Metrics server deployment information
 */
export interface MetricsServerDeployment {
  name: string;
  namespace: string;
  replicas: number;
  readyReplicas: number;
  availableReplicas: number;
  creationTimestamp: string;
  image: string;
  args: string[];
}

/**
 * Metrics server service information
 */
export interface MetricsServerService {
  name: string;
  namespace: string;
  clusterIP: string;
  port: number;
  type: string;
}

/**
 * Metrics server component status
 */
export interface MetricsServerComponent {
  name: string;
  type: string;
  status: 'Ready' | 'NotFound' | 'NotReady';
}

/**
 * Complete metrics server status information
 */
export interface MetricsServerStatus {
  installed: boolean;
  ready: boolean;
  version?: string;
  serviceAddress?: string;
  deployment?: MetricsServerDeployment;
  service?: MetricsServerService;
  components: MetricsServerComponent[];
  error?: string;
}

/**
 * Response from metrics server status endpoint
 */
export interface MetricsServerStatusResponse {
  success: boolean;
  message: string;
  data: MetricsServerStatus;
}

/**
 * Operation details for async operations
 */
export interface OperationDetails {
  id: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  target: string;
  startTime: string;
  progress: number;
  message: string;
  data: {
    installType?: string;
  };
  retryCount: number;
  maxRetries: number;
  createdBy: string;
  tags: string[];
  error?: string;
}

/**
 * Response from operation status endpoint
 */
export interface OperationStatusResponse {
  success: boolean;
  message: string;
  data: OperationDetails;
}