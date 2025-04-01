import { KubeContext } from '@/types/cluster';
import { getHeaders } from '@/utils/headers';
import { OPERATOR_URL } from '@/config';
export const removeCluster = async (id: string): Promise<void> => {
  const response = await fetch(`/api/clusters/${id}`, {
    headers: getHeaders(),
    method: 'DELETE'
  });

  if (!response.ok) {
    throw new Error('Failed to remove cluster');
  }
};

export const getKubeContexts = async (): Promise<KubeContext[]> => {
  const response = await fetch(`${OPERATOR_URL}/contexts`, {
    method: 'GET'
  });

  if (!response.ok) {
    throw new Error('Failed to get cluster contexts');
  }

  return response.json();
};

export const kubeProxyRequest = async (clusterName: string, path: string, method: string, body?: any) => {
  const response = await fetch(`${OPERATOR_URL}/clusters/${clusterName}/${path}`, {
    method,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to proxy request: ${errorText}`);
  }

  // Check if the response is JSON before parsing
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return response.json();
  } else {
    return response.text();
  }
};