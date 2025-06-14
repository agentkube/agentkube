export interface Cluster {
  id: string;
  clusterName: string;
  accessType: string;
  externalEndpoint: string;
  status: 'ACTIVE' | 'ERROR';
  lastHeartbeat: Date;
  createdAt: Date;
  updatedAt: Date;
  provider?: string; // Added for UI compatibility
  hourlyRate?: number; // Added for UI compatibility
  tags?: string[]; // Added for UI compatibility
}

export interface ClusterWithApiKey extends Cluster {
  apiKey: {
    id: string;
    name: string;
  };
};


export interface ClusterMetrics {
  workloads: {
    namespaces: number;
    deployments: number;
    replicasets: number;
    statefulsets: number;
    pods: number;
    running_pods: number;
    pending_pods: number;
    failed_pods: number;
    nodes: number;
    jobs: number;
    running_jobs: number;
    completed_jobs: number;
    cronjobs: number;
    daemonsets: number;
  };
  network: {
    services: number;
    endpoints: number;
    ingresses: number;
  };
  storage: {
    persistent_volumes: number;
    persistent_volume_claims: number;
    storage_classes: number;
  };
}


export interface MetricsPerNamespace {
  name: string;
  metrics: {
      cpu: {
          request: string;
          limit: string;
      };
      memory: {
          request: string;
          limit: string;
      };
  };
  workloads: {
      pods: number;
      deployments: number;
      daemonsets: number;
      statefulsets: number;
      running_pods: number;
      pending_pods: number;
      failed_pods: number;
      succeeded_pods: number;
  };
}


export interface ExecutionResult {
  success: boolean;
  command: string;
  output: string;
}

export interface PodMetricsPoint {
  timestamp: string;
  cpuUsage: number;
  cpuRequests: number;
  cpuLimits: number;
  memoryUsage: number;
  memoryRequests: number;
  memoryLimits: number;
  networkRxBytes: number;
  networkTxBytes: number;
  networkRxErrors: number;
  networkTxErrors: number;
  restartCount: number;
}

export interface ComprehensivePodMetrics {
  name: string;
  namespace: string;
  status: string;
  startTime: string;
  timePoints: PodMetricsPoint[];
}

export interface PodMetricsResponse {
  metrics: ComprehensivePodMetrics[];
  timeRange: string;
  startTime: string;
  endTime: string;
  step: string;
  query: {
    namespace: string;
    pod: string;
  };
}


export interface KubeContext {
  name: string;
  server: string;
  auth_type: string;
  kubeContext: {
    cluster: string;
    user: string;
  };
  meta_data: {
    extensions: Record<string, unknown>;
    namespace: string;
    source: string;
  };
}

export interface KubeconfigUploadRequest {
  content: string;
  sourceName: string;
  ttl?: number; // TTL in hours
}

export interface KubeconfigUploadResponse {
  success: boolean;
  message: string;
  contextsAdded?: string[];
  errors?: string[];
  filePath?: string;
}

export interface KubeConfigFile {
	id: string;
	name: string;
	size: number;
	path: string;
	isValid: boolean;
	contexts: string[];
	clusters: string[];
	validationMessage?: string;
	file?: File; // Add this line
	isFromText?: boolean; // Add this line
  isDroppedFile?: boolean;
}