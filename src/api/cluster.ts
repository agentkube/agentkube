import { KubeContext, KubeconfigUploadResponse, KubeconfigUploadRequest } from '@/types/cluster';
import { OPERATOR_URL } from '@/config';


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


// Upload kubeconfig file
export const uploadKubeconfigFile = async (file: File, sourceName?: string, ttl?: number): Promise<KubeconfigUploadResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  if (sourceName) formData.append('sourceName', sourceName);
  if (ttl) formData.append('ttl', ttl.toString());

  const response = await fetch(`${OPERATOR_URL}/kubeconfig/upload-file`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Failed to upload kubeconfig file');
  }

  return response.json();
};

// Upload kubeconfig content
export const uploadKubeconfigContent = async (request: KubeconfigUploadRequest): Promise<KubeconfigUploadResponse> => {
  const response = await fetch(`${OPERATOR_URL}/kubeconfig/upload-content`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error('Failed to upload kubeconfig content');
  }

  return response.json();
};

// List uploaded contexts
export const getUploadedContexts = async (): Promise<{ contexts: KubeContext[]; count: number }> => {
  const response = await fetch(`${OPERATOR_URL}/kubeconfig/uploaded-contexts`, {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error('Failed to get uploaded contexts');
  }

  return response.json();
};

// Delete uploaded context
export const deleteUploadedContext = async (contextName: string): Promise<{ success: boolean; message: string }> => {
  const response = await fetch(`${OPERATOR_URL}/kubeconfig/uploaded-contexts/${contextName}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error('Failed to delete uploaded context');
  }

  return response.json();
};