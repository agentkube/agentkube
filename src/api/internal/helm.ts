import { OPERATOR_URL } from "@/config";
/**
 * Interface for a Helm repository
 */
export interface HelmRepository {
  name: string;
  url: string;
}

/**
 * Interface for a Helm chart
 */
export interface HelmChart {
  name: string;
  description: string;
  version: string;
  appVersion: string;
  repository: string;
}

/**
 * Interface for a Helm release
 */
export interface HelmRelease {
  name: string;
  namespace: string;
  revision: number;
  updated: string;
  status: string;
  info: {
    first_deployed: string;
    last_deployed: string;
    deleted: string;
    description: string;
    notes: string;
  }
  chart: { 
    metadata: { 
      name?: string;
      version?: string;
      appVersion?: string;
      description?: string;
      type?: string;
    };
  };
  chartVersion: string;
  appVersion?: string;
}

/**
 * Interface for repository operations request
 */
export interface HelmRepositoryRequest {
  name: string;
  url: string;
}

/**
 * Interface for common install/upgrade parameters
 */
interface CommonInstallUpgradeRequest {
  name: string;
  namespace: string;
  description: string;
  values: string; // base64 encoded YAML values
  chart: string;
  version: string;
}

/**
 * Interface for chart installation request
 */
export interface InstallReleaseRequest extends CommonInstallUpgradeRequest {
  createNamespace?: boolean;
  dependencyUpdate?: boolean;
}

/**
 * Interface for chart upgrade request
 */
export interface UpgradeReleaseRequest extends CommonInstallUpgradeRequest {
  install?: boolean;
}

/**
 * Interface for chart rollback request
 */
export interface RollbackReleaseRequest {
  name: string;
  namespace: string;
  revision: number;
}

/**
 * Interface for action status response
 */
export interface HelmActionStatus {
  status: string;
  message?: string;
}

/**
 * Lists all Helm repositories
 * 
 * @param clusterName The name of the Kubernetes cluster
 * @returns Promise with list of Helm repositories
 */
export async function listHelmRepositories(clusterName: string): Promise<HelmRepository[]> {
  try {
    const response = await fetch(`${OPERATOR_URL}/cluster/${clusterName}/helm/repositories`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to list Helm repositories: ${errorText}`);
    }

    const data = await response.json();
    return data.repositories;
  } catch (error) {
    console.error('Error listing Helm repositories:', error);
    throw error;
  }
}

/**
 * Adds a new Helm repository
 * 
 * @param clusterName The name of the Kubernetes cluster
 * @param name The name of the repository
 * @param url The URL of the repository
 * @returns Promise resolving when the repository is added
 */
export async function addHelmRepository(
  clusterName: string,
  name: string,
  url: string
): Promise<void> {
  try {
    const response = await fetch(`${OPERATOR_URL}/cluster/${clusterName}/helm/repositories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, url }),
      credentials: 'include',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to add Helm repository: ${errorText}`);
    }
  } catch (error) {
    console.error('Error adding Helm repository:', error);
    throw error;
  }
}

/**
 * Updates an existing Helm repository
 * 
 * @param clusterName The name of the Kubernetes cluster
 * @param name The name of the repository
 * @param url The updated URL of the repository
 * @returns Promise resolving when the repository is updated
 */
export async function updateHelmRepository(
  clusterName: string,
  name: string,
  url: string
): Promise<void> {
  try {
    const response = await fetch(`${OPERATOR_URL}/cluster/${clusterName}/helm/repositories`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, url }),
      credentials: 'include',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update Helm repository: ${errorText}`);
    }
  } catch (error) {
    console.error('Error updating Helm repository:', error);
    throw error;
  }
}

/**
 * Removes a Helm repository
 * 
 * @param clusterName The name of the Kubernetes cluster
 * @param name The name of the repository to remove
 * @returns Promise resolving when the repository is removed
 */
export async function removeHelmRepository(
  clusterName: string,
  name: string
): Promise<void> {
  try {
    const response = await fetch(`${OPERATOR_URL}/cluster/${clusterName}/helm/repositories?name=${encodeURIComponent(name)}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to remove Helm repository: ${errorText}`);
    }
  } catch (error) {
    console.error('Error removing Helm repository:', error);
    throw error;
  }
}

/**
 * Lists available Helm charts
 * 
 * @param clusterName The name of the Kubernetes cluster
 * @param filter Optional filter string to search for charts
 * @returns Promise with list of matching Helm charts
 */
export async function listHelmCharts(
  clusterName: string,
  filter?: string
): Promise<HelmChart[]> {
  try {
    let url = `${OPERATOR_URL}/cluster/${clusterName}/helm/charts`;
    if (filter) {
      url += `?filter=${encodeURIComponent(filter)}`;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to list Helm charts: ${errorText}`);
    }

    const data = await response.json();
    return data.charts;
  } catch (error) {
    console.error('Error listing Helm charts:', error);
    throw error;
  }
}

/**
 * Lists Helm releases
 * 
 * @param clusterName The name of the Kubernetes cluster
 * @param namespace Optional namespace to filter releases
 * @param allNamespaces Whether to list releases across all namespaces
 * @returns Promise with list of Helm releases
 */
export async function listHelmReleases(
  clusterName: string,
  namespace?: string,
  allNamespaces?: boolean
): Promise<HelmRelease[]> {
  try {
    let url = `${OPERATOR_URL}/cluster/${clusterName}/helm/releases?`;
    const params = new URLSearchParams();
    
    if (namespace) {
      params.append('namespace', namespace);
    }
    
    if (allNamespaces) {
      params.append('allNamespaces', 'true');
    }
    
    url += params.toString();

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'include',
    });

    // Check if response is OK (status code 200-299)
    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error Response:', errorText);
      throw new Error(`Failed to list Helm releases: Status ${response.status}`);
    }

    // Check content type
    const contentType = response.headers.get('Content-Type');
    if (!contentType || !contentType.includes('application/json')) {
      // Try to get the response text to help with debugging
      const text = await response.text();
      console.error('Unexpected Content-Type:', contentType);
      console.error('Response Preview:', text.substring(0, 200));
      
      // Try to parse as JSON anyway if it looks like JSON
      if (text.trim().startsWith('{') && text.includes('"releases"')) {
        try {
          const data = JSON.parse(text);
          return data.releases || [];
        } catch (parseError) {
          console.error('Failed to parse response as JSON:', parseError);
        }
      }
      
      // If we couldn't recover, throw an error
      throw new Error(`Expected JSON response but got: ${contentType || 'unknown content type'}`);
    }

    // Parse response as JSON
    const data = await response.json();
    
    // Handle unexpected response format
    if (!data || typeof data !== 'object') {
      console.error('Unexpected response format:', data);
      return [];
    }
    
    // Check if releases property exists
    if (!Array.isArray(data.releases)) {
      console.warn('Response missing releases array:', data);
      return [];
    }
    
    return data.releases;
  } catch (error) {
    console.error('Error listing Helm releases:', error);
    throw error;
  }
}

/**
 * Gets details of a specific Helm release
 * 
 * @param clusterName The name of the Kubernetes cluster
 * @param releaseName The name of the release
 * @param namespace The namespace of the release
 * @returns Promise with detailed release information
 */
export async function getHelmRelease(
  clusterName: string,
  releaseName: string,
  namespace: string
): Promise<any> {
  try {
    const url = `${OPERATOR_URL}/cluster/${clusterName}/helm/release?name=${encodeURIComponent(releaseName)}&namespace=${encodeURIComponent(namespace)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Release not found: ${releaseName}`);
      }
      const errorText = await response.text();
      throw new Error(`Failed to get Helm release: ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting Helm release:', error);
    throw error;
  }
}

/**
 * Gets the release history for a Helm release
 * 
 * @param clusterName The name of the Kubernetes cluster
 * @param releaseName The name of the release
 * @param namespace The namespace of the release
 * @returns Promise with the release history
 */
export async function getHelmReleaseHistory(
  clusterName: string,
  releaseName: string,
  namespace: string
): Promise<any[]> {
  try {
    const url = `${OPERATOR_URL}/cluster/${clusterName}/helm/release/history?name=${encodeURIComponent(releaseName)}&namespace=${encodeURIComponent(namespace)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Release not found: ${releaseName}`);
      }
      const errorText = await response.text();
      throw new Error(`Failed to get Helm release history: ${errorText}`);
    }

    const data = await response.json();
    return data.releases;
  } catch (error) {
    console.error('Error getting Helm release history:', error);
    throw error;
  }
}

/**
 * Installs a new Helm chart
 * 
 * @param clusterName The name of the Kubernetes cluster
 * @param request The installation request details
 * @returns Promise resolving when the installation has started
 */
export async function installHelmRelease(
  clusterName: string,
  request: InstallReleaseRequest
): Promise<void> {
  try {
    const url = `${OPERATOR_URL}/cluster/${clusterName}/helm/release/install`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      credentials: 'include',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to install Helm release: ${errorText}`);
    }
  } catch (error) {
    console.error('Error installing Helm release:', error);
    throw error;
  }
}

/**
 * Upgrades an existing Helm release
 * 
 * @param clusterName The name of the Kubernetes cluster
 * @param request The upgrade request details
 * @returns Promise resolving when the upgrade has started
 */
export async function upgradeHelmRelease(
  clusterName: string,
  request: UpgradeReleaseRequest
): Promise<void> {
  try {
    const url = `${OPERATOR_URL}/cluster/${clusterName}/helm/release/upgrade`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      credentials: 'include',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to upgrade Helm release: ${errorText}`);
    }
  } catch (error) {
    console.error('Error upgrading Helm release:', error);
    throw error;
  }
}

/**
 * Rolls back a Helm release to a previous revision
 * 
 * @param clusterName The name of the Kubernetes cluster
 * @param request The rollback request details
 * @returns Promise resolving when the rollback has started
 */
export async function rollbackHelmRelease(
  clusterName: string,
  request: RollbackReleaseRequest
): Promise<void> {
  try {
    const url = `${OPERATOR_URL}/cluster/${clusterName}/helm/release/rollback`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      credentials: 'include',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to rollback Helm release: ${errorText}`);
    }
  } catch (error) {
    console.error('Error rolling back Helm release:', error);
    throw error;
  }
}

/**
 * Uninstalls a Helm release
 * 
 * @param clusterName The name of the Kubernetes cluster
 * @param releaseName The name of the release to uninstall
 * @param namespace The namespace of the release
 * @returns Promise resolving when the uninstall has started
 */
export async function uninstallHelmRelease(
  clusterName: string,
  releaseName: string,
  namespace: string
): Promise<void> {
  try {
    const url = `${OPERATOR_URL}/cluster/${clusterName}/helm/release?name=${encodeURIComponent(releaseName)}&namespace=${encodeURIComponent(namespace)}`;

    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to uninstall Helm release: ${errorText}`);
    }
  } catch (error) {
    console.error('Error uninstalling Helm release:', error);
    throw error;
  }
}

/**
 * Gets the status of an asynchronous Helm action
 * 
 * @param clusterName The name of the Kubernetes cluster
 * @param releaseName The name of the release
 * @param action The action name (install, upgrade, uninstall, rollback)
 * @param namespace Optional namespace of the release
 * @returns Promise with the action status
 */
export async function getHelmActionStatus(
  clusterName: string,
  releaseName: string,
  action: 'install' | 'upgrade' | 'uninstall' | 'rollback',
  namespace?: string
): Promise<HelmActionStatus> {
  try {
    let url = `${OPERATOR_URL}/cluster/${clusterName}/helm/release/status?name=${encodeURIComponent(releaseName)}&action=${encodeURIComponent(action)}`;
    
    if (namespace) {
      url += `&namespace=${encodeURIComponent(namespace)}`;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get Helm action status: ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting Helm action status:', error);
    throw error;
  }
}

/**
 * Encodes a YAML values object or string to base64 for use with Helm API
 * 
 * @param values YAML content as string or object
 * @returns base64 encoded values string
 */
export function encodeHelmValues(values: string | object): string {
  let valuesStr: string;
  
  if (typeof values === 'object') {
    // Convert object to YAML string
    // This requires a YAML library like js-yaml in a real implementation
    // For simplicity, we're using JSON.stringify here
    valuesStr = JSON.stringify(values);
  } else {
    valuesStr = values;
  }
  
  // Convert to base64
  return btoa(valuesStr);
}

/**
 * Decodes base64-encoded YAML values from Helm API
 * 
 * @param encodedValues base64 encoded values string
 * @returns decoded YAML string
 */
export function decodeHelmValues(encodedValues: string): string {
  return atob(encodedValues);
}

/**
 * Installs a chart with a simple configuration
 * 
 * @param clusterName The name of the Kubernetes cluster
 * @param releaseName The name for the release
 * @param chart The chart to install (e.g., "bitnami/nginx")
 * @param namespace The namespace to install into
 * @param values Optional YAML values as string or object
 * @returns Promise resolving when installation has started
 */
export async function quickInstallHelmChart(
  clusterName: string,
  releaseName: string,
  chart: string,
  namespace: string,
  values?: string | object
): Promise<void> {
  const encodedValues = values ? encodeHelmValues(values) : '';
  
  const request: InstallReleaseRequest = {
    name: releaseName,
    namespace: namespace,
    description: `Installed chart ${chart}`,
    chart: chart,
    version: '', // Empty string means latest version
    values: encodedValues,
    createNamespace: true,
    dependencyUpdate: true
  };
  
  return installHelmRelease(clusterName, request);
}


/**
 * Gets the available versions for a Helm chart from Artifact Hub
 * 
 * @param repoName The name of the chart repository
 * @param chartName The name of the chart
 * @returns Promise with the versions data as XML string
 */
export async function getChartVersions(
  repoName: string,
  chartName: string
): Promise<string> {
  try {
    const url = `${OPERATOR_URL}/proxy/helm-versions?repo=${encodeURIComponent(repoName)}&chart=${encodeURIComponent(chartName)}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/xml, text/xml, */*',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch chart versions: ${response.status}`);
    }

    return await response.text();
  } catch (error) {
    console.error('Error fetching chart versions:', error);
    throw error;
  }
}

/**
 * Gets the default values for a specific Helm chart version from Artifact Hub
 * 
 * @param packageId The package ID from Artifact Hub
 * @param version The chart version
 * @returns Promise with the chart values as YAML string
 */
export async function getChartDefaultValues(
  packageId: string,
  version: string
): Promise<string> {
  try {
    const url = `${OPERATOR_URL}/proxy/helm-values?package=${encodeURIComponent(packageId)}&version=${encodeURIComponent(version)}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'text/plain, text/yaml, */*',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch chart values: ${response.status}`);
    }

    return await response.text();
  } catch (error) {
    console.error('Error fetching chart values:', error);
    throw error;
  }
}