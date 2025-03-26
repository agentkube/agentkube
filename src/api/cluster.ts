import { KubeContext } from '@/types/cluster';
import { getHeaders } from '@/utils/headers';

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
  const response = await fetch('/operator/contexts', {
    method: 'GET'
  });

  if (!response.ok) {
    throw new Error('Failed to get cluster contexts');
  }

  return response.json();
};
