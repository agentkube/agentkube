import { kubeProxyRequest } from '@/api/cluster';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface KRRConfig {
  cpuPercentile?: number;          // Default: 99
  memoryBufferPercentage?: number; // Default: 15
  historyDays?: number;            // Default: 14
  oomBufferPercentage?: number;    // Default: 15
  useOOMKillData?: boolean;        // Default: true
  cpuMinValue?: number;            // Default: 10 (millicores)
  memoryMinValue?: number;         // Default: 100 (MB)
}

export interface ContainerRecommendation {
  containerName: string;
  current: {
    cpu: { request: number | null; limit: number | null };
    memory: { request: number | null; limit: number | null };
  };
  recommended: {
    cpu: { request: number | null; limit: number | null };
    memory: { request: number | null; limit: number | null };
  };
  severity: 'CRITICAL' | 'WARNING' | 'OK' | 'GOOD';
  dataPoints: number;
  oomDetected: boolean;
  info?: string;
  metrics: {
    cpu: { p99: number; max: number; avg: number } | null;
    memory: { max: number; avg: number } | null;
  };
  explanation: {
    cpu: string;
    memory: string;
  };
}

// Default configuration
const DEFAULT_CONFIG: Required<KRRConfig> = {
  cpuPercentile: 99,
  memoryBufferPercentage: 15,
  historyDays: 14,
  oomBufferPercentage: 15,
  useOOMKillData: true,
  cpuMinValue: 10,
  memoryMinValue: 100,
};

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Get KRR recommendations for a single container
 */
export async function getContainerRecommendation(
  clusterName: string,
  namespace: string,
  podName: string,
  containerName: string,
  currentResources: {
    cpu: { request: string; limit?: string };
    memory: { request: string; limit?: string };
  },
  prometheusConfig: { namespace: string; service: string },
  config: KRRConfig = {}
): Promise<ContainerRecommendation> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Parse current resources
  const current = {
    cpu: {
      request: parseResourceValue(currentResources.cpu.request, 'cpu'),
      limit: currentResources.cpu.limit ? parseResourceValue(currentResources.cpu.limit, 'cpu') : null,
    },
    memory: {
      request: parseResourceValue(currentResources.memory.request, 'memory'),
      limit: currentResources.memory.limit ? parseResourceValue(currentResources.memory.limit, 'memory') : null,
    },
  };

  const basePath = `api/v1/namespaces/${prometheusConfig.namespace}/services/${prometheusConfig.service}/proxy/api/v1/query`;

  try {
    // Build all Prometheus queries
    const queries = buildQueries(namespace, podName, containerName, cfg);

    // Execute all queries in parallel
    const [cpuP99Res, cpuMaxRes, cpuAvgRes, memMaxRes, memAvgRes, dataPointsRes, oomRes] = await Promise.all([
      queryPrometheus(clusterName, basePath, queries.cpuP99),
      queryPrometheus(clusterName, basePath, queries.cpuMax),
      queryPrometheus(clusterName, basePath, queries.cpuAvg),
      queryPrometheus(clusterName, basePath, queries.memoryMax),
      queryPrometheus(clusterName, basePath, queries.memoryAvg),
      queryPrometheus(clusterName, basePath, queries.dataPoints),
      queries.oom ? queryPrometheus(clusterName, basePath, queries.oom) : Promise.resolve(null),
    ]);

    // Parse all results
    const cpuP99 = parseQueryResult(cpuP99Res);
    const cpuMax = parseQueryResult(cpuMaxRes);
    const cpuAvg = parseQueryResult(cpuAvgRes);
    const memMax = parseQueryResult(memMaxRes);
    const memAvg = parseQueryResult(memAvgRes);
    const dataPoints = parseQueryResult(dataPointsRes) || 0;
    const oomMemory = parseQueryResult(oomRes);

    // Check if sufficient data
    if (dataPoints < 100) {
      return {
        containerName,
        current,
        recommended: {
          cpu: { request: null, limit: null },
          memory: { request: null, limit: null },
        },
        severity: 'OK',
        dataPoints: Math.round(dataPoints),
        oomDetected: false,
        info: `Not enough data (${Math.round(dataPoints)} points, need 100+)`,
        metrics: {
          cpu: cpuP99 ? { p99: cpuP99, max: cpuMax || 0, avg: cpuAvg || 0 } : null,
          memory: memMax ? { max: memMax, avg: memAvg || 0 } : null,
        },
        explanation: {
          cpu: 'Insufficient data points for reliable recommendation',
          memory: 'Insufficient data points for reliable recommendation',
        },
      };
    }

    // Calculate CPU recommendation (using P99)
    const cpuRecommended = cpuP99 !== null
      ? Math.max(Math.ceil(cpuP99), cfg.cpuMinValue)
      : null;

    // Calculate Memory recommendation
    const memoryBuffer = oomMemory ? cfg.oomBufferPercentage : cfg.memoryBufferPercentage;
    const memRecommended = memMax !== null
      ? Math.max(
        Math.ceil(memMax * (1 + memoryBuffer / 100)),
        cfg.memoryMinValue * 1024 * 1024
      )
      : null;

    const recommended = {
      cpu: { request: cpuRecommended, limit: null },
      memory: { request: memRecommended, limit: memRecommended },
    };

    // Calculate severity
    const severity = calculateSeverity(current, recommended);

    // Generate explanations
    const cpuExplanation = generateCPUExplanation(cpuP99, cpuMax, current.cpu.request, cfg.cpuPercentile);
    const memoryExplanation = generateMemoryExplanation(memMax, memAvg, memoryBuffer, oomMemory !== null);

    return {
      containerName,
      current,
      recommended,
      severity,
      dataPoints: Math.round(dataPoints),
      oomDetected: !!oomMemory,
      info: oomMemory ? `Memory max usage was ${formatBytes(oomMemory)}. To avoid OOM kills, it's recommended to set ${formatBytes(memRecommended)}` : undefined,
      metrics: {
        cpu: cpuP99 ? { p99: cpuP99, max: cpuMax || 0, avg: cpuAvg || 0 } : null,
        memory: memMax ? { max: memMax, avg: memAvg || 0 } : null,
      },
      explanation: {
        cpu: cpuExplanation,
        memory: memoryExplanation,
      },
    };
  } catch (error) {
    console.error('Error getting KRR recommendation:', error);
    return {
      containerName,
      current,
      recommended: {
        cpu: { request: null, limit: null },
        memory: { request: null, limit: null },
      },
      severity: 'OK',
      dataPoints: 0,
      oomDetected: false,
      info: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      metrics: { cpu: null, memory: null },
      explanation: {
        cpu: 'Error fetching metrics',
        memory: 'Error fetching metrics',
      },
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build all Prometheus queries
 */
function buildQueries(namespace: string, podName: string, containerName: string, cfg: Required<KRRConfig>) {
  // Use regex matching for pod name to handle Prometheus label matching correctly
  // This matches the pod name exactly but uses regex syntax required by some Prometheus setups
  const baseFilter = `{namespace="${namespace}", pod=~"${podName}", container="${containerName}", container!=""}`;

  return {
    cpuP99: `quantile_over_time(0.99, max(rate(container_cpu_usage_seconds_total${baseFilter}[5m])) by (container, pod, job)[${cfg.historyDays}d:30m]) * 1000`,
    cpuMax: `max_over_time(max(rate(container_cpu_usage_seconds_total${baseFilter}[5m])) by (container, pod, job)[${cfg.historyDays}d:30m]) * 1000`,
    cpuAvg: `avg_over_time(max(rate(container_cpu_usage_seconds_total${baseFilter}[5m])) by (container, pod, job)[${cfg.historyDays}d:30m]) * 1000`,
    memoryMax: `max_over_time(max(container_memory_working_set_bytes${baseFilter}) by (container, pod, job)[${cfg.historyDays}d:30m])`,
    memoryAvg: `avg_over_time(max(container_memory_working_set_bytes${baseFilter}) by (container, pod, job)[${cfg.historyDays}d:30m])`,
    dataPoints: `count_over_time(max(container_cpu_usage_seconds_total${baseFilter}) by (container, pod, job)[${cfg.historyDays}d:30m])`,
    oom: cfg.useOOMKillData
      ? `max_over_time(max(max(kube_pod_container_resource_limits{resource="memory", namespace="${namespace}", pod=~"${podName}", container="${containerName}"}) by (pod, container, job) * on(pod, container, job) group_left(reason) max(kube_pod_container_status_last_terminated_reason{reason="OOMKilled", namespace="${namespace}", pod=~"${podName}", container="${containerName}"}) by (pod, container, job, reason)) by (container, pod, job)[${cfg.historyDays}d:30m])`
      : null,
  };
}

/**
 * Query Prometheus via kube proxy
 */
async function queryPrometheus(clusterName: string, basePath: string, query: string): Promise<any> {
  return await kubeProxyRequest(
    clusterName,
    `${basePath}?query=${encodeURIComponent(query)}`,
    'GET'
  );
}

/**
 * Parse Prometheus query result
 */
function parseQueryResult(response: any): number | null {
  if (response?.status === 'success' && response.data?.result?.length > 0) {
    return parseFloat(response.data.result[0].value[1]);
  }
  return null;
}

/**
 * Parse Kubernetes resource values to internal format
 */
function parseResourceValue(value: string, type: 'cpu' | 'memory'): number | null {
  if (!value || value === '0') return null;

  if (type === 'cpu') {
    if (value.endsWith('m')) {
      return parseFloat(value.slice(0, -1)); // millicores
    }
    return parseFloat(value) * 1000; // cores to millicores
  } else {
    // memory - convert to bytes
    if (value.endsWith('Ki')) return parseFloat(value.slice(0, -2)) * 1024;
    if (value.endsWith('Mi')) return parseFloat(value.slice(0, -2)) * 1024 * 1024;
    if (value.endsWith('Gi')) return parseFloat(value.slice(0, -2)) * 1024 * 1024 * 1024;
    return parseFloat(value); // assume bytes
  }
}

/**
 * Calculate severity based on current vs recommended
 */
function calculateSeverity(
  current: ContainerRecommendation['current'],
  recommended: ContainerRecommendation['recommended']
): 'CRITICAL' | 'WARNING' | 'OK' | 'GOOD' {
  if (!recommended.cpu.request || !recommended.memory.request) return 'OK';
  if (!current.cpu.request || !current.memory.request) return 'WARNING';

  const cpuRatio = current.cpu.request / recommended.cpu.request;
  const memRatio = current.memory.request / recommended.memory.request;

  // CRITICAL: Severely under-provisioned (< 50%)
  if (cpuRatio < 0.5 || memRatio < 0.5) return 'CRITICAL';

  // WARNING: Significantly misaligned
  if (cpuRatio < 0.7 || memRatio < 0.7 || cpuRatio > 2.0 || memRatio > 2.0) {
    return 'WARNING';
  }

  // GOOD: Well optimized (within �10%)
  if (cpuRatio >= 0.9 && cpuRatio <= 1.1 && memRatio >= 0.9 && memRatio <= 1.1) {
    return 'GOOD';
  }

  return 'OK';
}

/**
 * Generate CPU explanation text
 */
function generateCPUExplanation(p99: number | null, _max: number | null, current: number | null, _percentile: number): string {
  if (p99 === null) return 'No CPU metrics available';

  const p99Str = formatCPU(p99);
  const explanation = `99% of the time, the CPU usage was below ${p99Str}`;

  if (current !== null && current < p99) {
    return `${explanation}. Current request (${formatCPU(current)}) is below this threshold.`;
  }

  return explanation + '. CPU limit should generally be set to none to allow temporary bursts.';
}

/**
 * Generate Memory explanation text
 */
function generateMemoryExplanation(max: number | null, _avg: number | null, buffer: number, oomDetected: boolean): string {
  if (max === null) return 'No memory metrics available';

  const maxStr = formatBytes(max);

  if (oomDetected) {
    return `Memory max usage was ${maxStr}. To avoid OOM kills, it's recommended to set ${formatBytes(max * (1 + buffer / 100))}`;
  }

  return `Memory max usage was ${maxStr}. To avoid OOM kills, it's recommended to set ${formatBytes(max * (1 + buffer / 100))}. Setting memory limit == memory request allows for maximum utilization of resources.`;
}

/**
 * Format CPU value for display
 */
export function formatCPU(value: number | null): string {
  if (value === null) return 'N/A';

  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)}`;
  }
  return `${Math.round(value)}m`;
}

/**
 * Format memory value for display (bytes to human readable)
 */
export function formatBytes(bytes: number | null): string {
  if (bytes === null) return 'N/A';

  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}Gi`;
  }
  if (bytes >= 1024 * 1024) {
    return `${Math.ceil(bytes / (1024 * 1024))}Mi`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(0)}Ki`;
  }
  return `${bytes}`;
}

/**
 * Format resource value for Kubernetes YAML
 */
export function formatResourceForYAML(value: number | null, type: 'cpu' | 'memory'): string {
  if (value === null) return '';

  if (type === 'cpu') {
    return formatCPU(value);
  } else {
    return formatBytes(value);
  }
}

/**
 * Calculate percentage change between current and recommended
 */
export function getChangePercentage(
  current: number | null,
  recommended: number | null
): number | null {
  if (current === null || recommended === null || current === 0) return null;
  return ((recommended - current) / current) * 100;
}

/**
 * Get Prometheus monitoring config from localStorage
 */
export function getMonitoringConfig(clusterName: string): { namespace: string; service: string } {
  try {
    const savedConfig = localStorage.getItem(`${clusterName}.monitoringConfig`);
    if (savedConfig) {
      const parsedConfig = JSON.parse(savedConfig);
      if (parsedConfig.externalConfig?.monitoring) {
        return parsedConfig.externalConfig.monitoring;
      }
    }
  } catch (err) {
    console.error('Error loading monitoring config:', err);
  }

  return { namespace: 'monitoring', service: 'kube-prometheus-stack-prometheus:9090' };
}
