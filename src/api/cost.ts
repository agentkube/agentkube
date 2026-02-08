import { OPERATOR_URL } from "@/config";

/**
 * Interface for OpenCost status response
 */
export interface OpenCostStatus {
  cluster: string;
  status: {
    installed: boolean;
    version?: string;
    namespace?: string;
    installMethod?: string;
    status?: string;
    installTime?: string;
    prometheusUrl?: string;
    uiEndpoint?: string;
  };
}

/**
 * Get the OpenCost status for a specific cluster
 * @param clusterName - The name of the cluster to check
 * @returns OpenCost status information for the specified cluster
 */
export const getOpenCostStatus = async (clusterName: string): Promise<OpenCostStatus> => {
  const response = await fetch(`${OPERATOR_URL}/cluster/${clusterName}/metrics/opencost/status`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch OpenCost status for cluster: ${clusterName}`);
  }

  return response.json();
};