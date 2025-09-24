import { KubeContext, KubeconfigUploadResponse, KubeconfigUploadRequest } from '@/types/cluster';
import { OPERATOR_URL } from '@/config';
import { ClusterReport } from '@/types/cluster-report';
import { IndividualConfigAuditReport } from '@/types/trivy';
import { fetch } from '@tauri-apps/plugin-http';


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

  // Use Tauri HTTP plugin for proper file upload support
  const response = await fetch(`${OPERATOR_URL}/kubeconfig/upload-file`, {
    method: 'POST',
    body: formData,
    // Don't set Content-Type header - let Tauri set it automatically
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Upload failed: ${errorText}`);
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

// Delete context (both system and imported)
export const deleteContext = async (
  contextName: string, 
  allowSystemKubeconfigDeletion: boolean = false
): Promise<{ success: boolean; message: string; removedFiles?: string[] }> => {
  const response = await fetch(`${OPERATOR_URL}/kubeconfig/contexts/${contextName}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ allowSystemKubeconfigDeletion }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to delete context: ${errorText}`);
  }

  return response.json();
};

// Legacy function - kept for backward compatibility
export const deleteUploadedContext = async (contextName: string): Promise<{ success: boolean; message: string }> => {
  return deleteContext(contextName, false);
};

// Rename context (both system and imported)
export const renameContext = async (
  oldName: string,
  newName: string
): Promise<{
  success: boolean;
  message: string;
  oldName: string;
  newName: string;
  source: string;
}> => {
  const response = await fetch(`${OPERATOR_URL}/kubeconfig/contexts/${oldName}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: newName }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to rename context: ${errorText}`);
  }

  return response.json();
};


export const validateKubeconfigPath = async (path: string) => {
  const response = await fetch(`${OPERATOR_URL}/kubeconfig/validate-path`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to validate path');
  }

  return response.json();
};

// Validate kubeconfig folder
export const validateKubeconfigFolder = async (folderPath: string) => {
  const response = await fetch(`${OPERATOR_URL}/kubeconfig/validate-folder`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ folderPath }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to validate folder');
  }

  return response.json();
};

export const getClusterReport = async (clusterName: string): Promise<ClusterReport> => {
  const response = await fetch(`${OPERATOR_URL}/cluster/${clusterName}/report`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get cluster report: ${errorText}`);
  }

  return response.json();
};

export const getConfigAuditReportForResource = async (clusterName: string, reportName: string): Promise<IndividualConfigAuditReport> => {
  const response = await kubeProxyRequest(
    clusterName,
    `apis/aquasecurity.github.io/v1alpha1/configauditreports/${reportName}`,
    'GET'
  );

  return response as IndividualConfigAuditReport;
};