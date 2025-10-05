import { OPERATOR_URL } from "@/config";
import {
  MetricsServerInstallRequest,
  MetricsServerOperationResponse,
  MetricsServerStatusResponse,
  OperationStatusResponse,
  OperationDetails
} from "@/types/metrics-server";

/**
 * Installs metrics server on the specified cluster
 * 
 * @param clusterName The name of the cluster to install metrics server on
 * @param installType The type of installation ('production' or 'local')
 * @returns Promise with the operation response
 */
export async function installMetricsServer(
  clusterName: string,
  installType: 'production' | 'local' = 'production'
): Promise<MetricsServerOperationResponse> {
  try {
    const response = await fetch(`${OPERATOR_URL}/cluster/${clusterName}/metrics/server/install`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        type: installType
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(errorJson.message || `Failed to install metrics server (${response.status}): ${response.statusText}`);
      } catch (e) {
        throw new Error(`Failed to install metrics server (${response.status}): ${errorText}`);
      }
    }

    return await response.json();
  } catch (error) {
    console.error('Error installing metrics server:', error);
    throw error;
  }
}

/**
 * Gets the status of metrics server installation on the specified cluster
 * 
 * @param clusterName The name of the cluster to check metrics server status
 * @returns Promise with the metrics server status
 */
export async function getMetricsServerStatus(
  clusterName: string
): Promise<MetricsServerStatusResponse> {
  try {
    const response = await fetch(`${OPERATOR_URL}/cluster/${clusterName}/metrics/server/status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(errorJson.message || `Failed to get metrics server status (${response.status}): ${response.statusText}`);
      } catch (e) {
        throw new Error(`Failed to get metrics server status (${response.status}): ${errorText}`);
      }
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting metrics server status:', error);
    throw error;
  }
}

/**
 * Uninstalls metrics server from the specified cluster
 * 
 * @param clusterName The name of the cluster to uninstall metrics server from
 * @returns Promise with the operation response
 */
export async function uninstallMetricsServer(
  clusterName: string
): Promise<MetricsServerOperationResponse> {
  try {
    const response = await fetch(`${OPERATOR_URL}/cluster/${clusterName}/metrics/server/uninstall`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(errorJson.message || `Failed to uninstall metrics server (${response.status}): ${response.statusText}`);
      } catch (e) {
        throw new Error(`Failed to uninstall metrics server (${response.status}): ${errorText}`);
      }
    }

    return await response.json();
  } catch (error) {
    console.error('Error uninstalling metrics server:', error);
    throw error;
  }
}

/**
 * Gets the status of an async operation (install/uninstall)
 * 
 * @param operationId The ID of the operation to check
 * @returns Promise with the operation status
 */
export async function getOperationStatus(
  operationId: string
): Promise<OperationStatusResponse> {
  try {
    const response = await fetch(`${OPERATOR_URL}/operations/${operationId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(errorJson.message || `Failed to get operation status (${response.status}): ${response.statusText}`);
      } catch (e) {
        throw new Error(`Failed to get operation status (${response.status}): ${errorText}`);
      }
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting operation status:', error);
    throw error;
  }
}

/**
 * Utility function to poll operation status until completion
 * 
 * @param operationId The operation ID to poll
 * @param intervalMs Polling interval in milliseconds (default: 2000)
 * @param timeoutMs Maximum time to wait in milliseconds (default: 300000 = 5 minutes)
 * @returns Promise that resolves when operation completes or rejects on timeout/error
 */
export async function pollOperationStatus(
  operationId: string,
  intervalMs: number = 2000,
  timeoutMs: number = 300000
): Promise<OperationDetails> {
  const startTime = Date.now();
  
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        if (Date.now() - startTime > timeoutMs) {
          reject(new Error('Operation polling timeout'));
          return;
        }

        const response = await getOperationStatus(operationId);
        const operation = response.data;

        if (operation.status === 'completed') {
          resolve(operation);
          return;
        }

        if (operation.status === 'failed') {
          reject(new Error(operation.error || 'Operation failed'));
          return;
        }

        // Continue polling if still pending or running
        setTimeout(poll, intervalMs);
      } catch (error) {
        reject(error);
      }
    };

    poll();
  });
}

/**
 * Convenience function to install metrics server and wait for completion
 * 
 * @param clusterName The name of the cluster to install metrics server on
 * @param installType The type of installation ('production' or 'local')
 * @param pollInterval Polling interval in milliseconds (default: 2000)
 * @param timeout Maximum time to wait in milliseconds (default: 300000 = 5 minutes)
 * @returns Promise that resolves when installation completes
 */
export async function installMetricsServerAndWait(
  clusterName: string,
  installType: 'production' | 'local' = 'production',
  pollInterval: number = 2000,
  timeout: number = 300000
): Promise<OperationDetails> {
  const installResponse = await installMetricsServer(clusterName, installType);
  return await pollOperationStatus(installResponse.operationId, pollInterval, timeout);
}

/**
 * Convenience function to uninstall metrics server and wait for completion
 * 
 * @param clusterName The name of the cluster to uninstall metrics server from
 * @param pollInterval Polling interval in milliseconds (default: 2000)
 * @param timeout Maximum time to wait in milliseconds (default: 300000 = 5 minutes)
 * @returns Promise that resolves when uninstallation completes
 */
export async function uninstallMetricsServerAndWait(
  clusterName: string,
  pollInterval: number = 2000,
  timeout: number = 300000
): Promise<OperationDetails> {
  const uninstallResponse = await uninstallMetricsServer(clusterName);
  return await pollOperationStatus(uninstallResponse.operationId, pollInterval, timeout);
}