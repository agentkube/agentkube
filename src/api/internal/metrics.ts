/**
 * Interfaces for pod metrics data returned by the metrics API
 */

/**
 * Represents CPU usage information for a pod or container
 */
export interface CPUMetrics {
  currentUsage: string;
  currentUsageCore: number;
  requestedCPU: string;
  limitCPU?: string;
  usagePercentage: number;
}

/**
 * Represents memory usage information for a pod or container
 */
export interface MemoryMetrics {
  currentUsage: string;
  currentUsageBytes: number;
  requestedMemory: string;
  limitMemory?: string;
  usagePercentage: number;
  currentUsageMiB: number;
  requestedMemoryMiB: number;
}

/**
 * Represents metrics for a single container within a pod
 */
export interface ContainerMetrics {
  name: string;
  cpu: CPUMetrics;
  memory: MemoryMetrics;
}

/**
 * Represents a single data point in the metrics history
 */
export interface MetricsHistoryPoint {
  timestamp: string;
  cpu: number;
  memory: number;
}

/**
 * Represents the complete metrics data for a pod
 */
export interface PodMetrics {
  podName: string;
  namespace: string;
  source: string;
  timestamp: string;
  lastUpdated: string;
  cpu: CPUMetrics;
  memory: MemoryMetrics;
  containers: ContainerMetrics[];
  history: MetricsHistoryPoint[];
}

/**
 * Fetches metrics data for a specific pod
 * 
 * @param clusterName The name of the cluster context
 * @param namespace The namespace the pod is in
 * @param podName The name of the pod
 * @returns Promise with the pod metrics data
 */
export async function getPodMetrics(
  clusterName: string,
  namespace: string,
  podName: string
): Promise<PodMetrics> {
  try {
    const response = await fetch(`/operator/cluster/${clusterName}/metrics/pods/${namespace}/${podName}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      credentials: 'include', // Include cookies for auth
    });

    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(errorJson.error || `Failed to get pod metrics (${response.status}): ${response.statusText}`);
      } catch (e) {
        throw new Error(`Failed to get pod metrics (${response.status}): ${errorText}`);
      }
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching pod metrics:', error);
    throw error;
  }
}

/**
 * Formats CPU usage to a human-readable string
 * 
 * @param cpuUsage CPU usage in cores
 * @returns Formatted CPU usage string
 */
export function formatCPUUsage(cpuUsage: number): string {
  if (cpuUsage === 0) return '0';
  
  if (cpuUsage < 0.001) {
    return `${(cpuUsage * 1000000).toFixed(0)}µ`;
  } else if (cpuUsage < 1) {
    return `${(cpuUsage * 1000).toFixed(0)}m`;
  } else {
    return cpuUsage.toFixed(2);
  }
}

/**
 * Formats memory usage to a human-readable string
 * 
 * @param memoryBytes Memory usage in bytes
 * @returns Formatted memory usage string
 */
export function formatMemoryUsage(memoryBytes: number): string {
  if (memoryBytes === 0) return '0';
  
  const units = ['B', 'Ki', 'Mi', 'Gi', 'Ti'];
  let unitIndex = 0;
  let value = memoryBytes;
  
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  
  // Round to 2 decimal places for better readability
  return `${value.toFixed(2)}${units[unitIndex]}`;
}

/**
 * Fetches metrics data for all pods in a namespace
 * 
 * @param clusterName The name of the cluster context
 * @param namespace The namespace to fetch pods from
 * @returns Promise with an array of pod metrics data
 */
export async function getNamespacePodMetrics(
  clusterName: string,
  namespace: string
): Promise<PodMetrics[]> {
  try {
    const response = await fetch(`/operator/cluster/${clusterName}/metrics/namespaces/${namespace}/pods`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      credentials: 'include', // Include cookies for auth
    });

    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(errorJson.error || `Failed to get namespace pod metrics (${response.status}): ${response.statusText}`);
      } catch (e) {
        throw new Error(`Failed to get namespace pod metrics (${response.status}): ${errorText}`);
      }
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching namespace pod metrics:', error);
    throw error;
  }
}

/**
 * Calculates the color for a usage percentage gauge
 * 
 * @param percentage Usage percentage (0-100)
 * @returns CSS color class or hex color
 */
export function getResourceUsageColor(percentage: number): string {
  if (percentage >= 90) {
    return 'text-red-500 dark:text-red-400';
  } else if (percentage >= 75) {
    return 'text-orange-500 dark:text-orange-400';
  } else if (percentage >= 60) {
    return 'text-yellow-500 dark:text-yellow-400';
  } else {
    return 'text-green-500 dark:text-green-400';
  }
}