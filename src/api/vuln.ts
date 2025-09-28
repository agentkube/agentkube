import { OPERATOR_URL } from '@/config';
import {
  ScannerStatusResponse,
  ClusterImagesResponse,
  ScanImagesRequest,
  ScanImagesResponse,
  GetScanResultsResponse,
  ListAllScansResponse,
  ClusterScanRequest,
  GetClusterImagesParams,
  GetScanResultsParams,
  ListAllScansParams
} from '@/types/vuln';

/**
 * Check if the vulnerability scanner is initialized and ready
 * @returns A promise that resolves with the scanner status
 */
export const getScannerStatus = async (): Promise<ScannerStatusResponse> => {
  const response = await fetch(`${OPERATOR_URL}/vulnerability/status`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `Failed to get scanner status (${response.status})`);
  }

  return response.json();
};

/**
 * Discover all container images running in the cluster with metadata
 * @param cluster The name of the cluster
 * @param params Optional parameters including namespace filter
 * @returns A promise that resolves with cluster images
 */
export const getClusterImages = async (
  cluster: string,
  params?: GetClusterImagesParams
): Promise<ClusterImagesResponse> => {
  const searchParams = new URLSearchParams();
  if (params?.namespace) {
    searchParams.append('namespace', params.namespace);
  }

  const url = `${OPERATOR_URL}/cluster/${cluster}/images${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `Failed to get cluster images (${response.status})`);
  }

  return response.json();
};

/**
 * Trigger vulnerability scans for specific container images
 * @param request The scan request containing images and optional context
 * @returns A promise that resolves with scan results
 */
export const scanImages = async (request: ScanImagesRequest): Promise<ScanImagesResponse> => {
  const response = await fetch(`${OPERATOR_URL}/vulnerability/scan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `Failed to scan images (${response.status})`);
  }

  return response.json();
};

/**
 * Retrieve vulnerability scan results for a specific image
 * @param params Parameters containing the image name to get results for
 * @returns A promise that resolves with scan results for the image
 */
export const getScanResults = async (params: GetScanResultsParams): Promise<GetScanResultsResponse> => {
  const searchParams = new URLSearchParams();
  searchParams.append('image', params.image);

  const response = await fetch(`${OPERATOR_URL}/vulnerability/results?${searchParams.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `Failed to get scan results (${response.status})`);
  }

  return response.json();
};

/**
 * Get all vulnerability scan results with optional filtering
 * @param params Optional parameters including severity filter
 * @returns A promise that resolves with all scan results
 */
export const listAllScans = async (params?: ListAllScansParams): Promise<ListAllScansResponse> => {
  const searchParams = new URLSearchParams();
  if (params?.severity) {
    searchParams.append('severity', params.severity.toLowerCase());
  }

  const url = `${OPERATOR_URL}/vulnerability/scans${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `Failed to list all scans (${response.status})`);
  }

  return response.json();
};

/**
 * Initiate vulnerability scanning for all images found in cluster resources
 * @param cluster The name of the cluster
 * @param request Optional scan request parameters
 * @returns A promise that resolves with information about the triggered scan
 */
export const triggerClusterScan = async (
  cluster: string,
  request?: ClusterScanRequest
): Promise<{ message: string; cluster: string; namespace?: string; resourceType?: string }> => {
  const response = await fetch(`${OPERATOR_URL}/cluster/${cluster}/vulnerability/scan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request || {}),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `Failed to trigger cluster scan (${response.status})`);
  }

  return response.json();
};