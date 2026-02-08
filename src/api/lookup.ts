import { OPERATOR_URL } from "@/config";

export interface ServicePort {
  name: string;
  port: number;
  targetPort: number;
  containerPort: number;
  protocol: string;
  nodePort?: number;
}

export interface ToolInstance {
  serviceAddress: string;
  namespace: string;
  serviceType: string;
  serviceURL: string;
  ports: ServicePort[];
}

export interface ToolLookupResponse {
  tool: string;
  cluster: string;
  instances: ToolInstance[];
  count: number;
}

export interface MultiToolLookupResponse {
  cluster: string;
  results: Record<string, {
    instances: ToolInstance[];
    count: number;
  }>;
}

export interface SupportedToolsResponse {
  supportedTools: string[];
  count: number;
}

/**
 * Get list of all supported tools that can be discovered
 */
export async function getSupportedTools(): Promise<SupportedToolsResponse> {
  const response = await fetch(`${OPERATOR_URL}/lookup/tools`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to get supported tools: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Find a specific tool in a specific cluster
 */
export async function findToolInCluster(
  clusterName: string,
  toolName: string
): Promise<ToolLookupResponse> {
  const response = await fetch(`${OPERATOR_URL}/lookup/cluster/${clusterName}/tool/${toolName}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to find ${toolName} in cluster ${clusterName}: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Find multiple tools in a specific cluster
 */
export async function findMultipleToolsInCluster(
  clusterName: string,
  tools: string[] = [] // Empty array means search for all supported tools
): Promise<MultiToolLookupResponse> {
  const response = await fetch(`${OPERATOR_URL}/lookup/cluster/${clusterName}/tools`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ tools }),
  });

  if (!response.ok) {
    throw new Error(`Failed to find tools in cluster ${clusterName}: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Find all monitoring tools in a cluster (convenience function)
 */
export async function findMonitoringToolsInCluster(
  clusterName: string
): Promise<MultiToolLookupResponse> {
  const monitoringTools = ['grafana', 'prometheus', 'signoz', 'newrelic', 'datadog', 'jaeger', 'elastic', 'kibana'];
  return findMultipleToolsInCluster(clusterName, monitoringTools);
}