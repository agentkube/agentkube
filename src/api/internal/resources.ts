import {
  V1Namespace,
  V1Pod,
  V1Service,
  V1ConfigMap,
  V1Secret,
  V1PersistentVolume,
  V1PersistentVolumeClaim,
  V1Node,
  CoreV1Event as V1Event,
  V1Deployment,
  V1DaemonSet,
  V1StatefulSet,
  V1Ingress
} from '@kubernetes/client-node';
import { SearchResponse } from '@/types/search';

/**
 * Configuration options for API requests
 */
interface RequestOptions {
  namespace?: string;      // specific namespace for namespaced resources
  name?: string;           // specific resource name to fetch a single resource
  apiGroup?: string;       // e.g., 'apps', 'networking.k8s.io'
  apiVersion?: string;     // e.g., 'v1', 'v1beta1'
  labelSelector?: string;  // kubernetes label selector
  fieldSelector?: string;  // kubernetes field selector
}

/**
 * Maps resource type strings to their respective Kubernetes types
 */
interface KubernetesTypeMapping {
  'namespaces': V1Namespace;
  'pods': V1Pod;
  'services': V1Service;
  'configmaps': V1ConfigMap;
  'secrets': V1Secret;
  'persistentvolumes': V1PersistentVolume;
  'persistentvolumeclaims': V1PersistentVolumeClaim;
  'nodes': V1Node;
  'events': V1Event;
  'deployments': V1Deployment;
  'statefulsets': V1StatefulSet;
  'daemonsets': V1DaemonSet;
  'ingresses': V1Ingress;
  [key: string]: any; // Allow for dynamic resource types
}

/**
 * Lists Kubernetes resources with support for all standard Kubernetes API patterns
 * Compatible with the backend proxy routes and strongly typed with kubernetes-client
 * 
 * @param clusterName The cluster name to query
 * @param resourceType The type of resource to fetch (e.g., 'pods', 'deployments')
 * @param options Options for the request including namespace, apiGroup, etc.
 * @returns Promise with the resources of the specified type
 */
export async function listResources<T extends keyof KubernetesTypeMapping>(
  clusterName: string,
  resourceType: T,
  options: RequestOptions = {}
): Promise<KubernetesTypeMapping[T][]> {
  const {
    namespace,
    name,
    apiGroup,
    apiVersion = 'v1',
    labelSelector,
    fieldSelector
  } = options;

  // Determine if we're using a core API or custom API group
  const baseUrl = apiGroup
    ? `http://localhost:4688/api/v1/clusters/${clusterName}/apis/${apiGroup}/${apiVersion}`
    : `http://localhost:4688/api/v1/clusters/${clusterName}/api/${apiVersion}`;

  // Build path based on resource type and namespace
  let resourcePath = '';
  
  if (namespace) {
    resourcePath = `namespaces/${namespace}/${resourceType}`;
    if (name) {
      resourcePath += `/${name}`;
    }
  } else {
    resourcePath = resourceType as string;
    if (name) {
      resourcePath += `/${name}`;
    }
  }

  // Build full URL
  let fullUrl = `${baseUrl}/${resourcePath}`;

  // Add query parameters if needed
  const queryParams = new URLSearchParams();
  if (labelSelector) {
    queryParams.append('labelSelector', labelSelector);
  }
  if (fieldSelector) {
    queryParams.append('fieldSelector', fieldSelector);
  }

  const queryString = queryParams.toString();
  if (queryString) {
    fullUrl += `?${queryString}`;
  }

  try {
    // Make the HTTP request
    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'include', // Include cookies for auth
    });

    if (!response.ok) {
      // Check if we got HTML instead of JSON (usually an auth or server error)
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        const textResponse = await response.text();
        throw new Error(`Server returned HTML instead of JSON (${response.status}): ${textResponse.substring(0, 100)}...`);
      }

      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(errorJson.message || `Failed to list resources (${response.status}): ${response.statusText}`);
      } catch (e) {
        throw new Error(`Failed to list resources (${response.status}): ${errorText}`);
      }
    }

    const data = await response.json();
    
    // If this is a list response, return the items array
    // Otherwise, if it's a single resource, wrap it in an array
    if (data.items) {
      return data.items;
    } else if (name) {
      return [data];
    } else {
      console.warn('Unexpected API response format:', data);
      return [];
    }
  } catch (error) {
    console.error('Error fetching resources:', error);
    throw error;
  }
}

/**
 * Get a specific resource by name
 */
export async function getResource<T extends keyof KubernetesTypeMapping>(
  clusterName: string,
  resourceType: T,
  name: string,
  namespace?: string,
  apiGroup?: string,
  apiVersion: string = 'v1'
): Promise<KubernetesTypeMapping[T]> {
  const resources = await listResources(clusterName, resourceType, {
    namespace,
    name,
    apiGroup,
    apiVersion
  });
  
  if (resources.length === 0) {
    throw new Error(`Resource not found: ${resourceType}/${name}`);
  }
  
  return resources[0];
}

// Convenience methods for common resource types

/**
 * Get all namespaces in the cluster
 */
export async function getNamespaces(clusterName: string): Promise<V1Namespace[]> {
  return listResources(clusterName, 'namespaces');
}

/**
 * Get all nodes in the cluster
 */
export async function getNodes(clusterName: string): Promise<V1Node[]> {
  return listResources(clusterName, 'nodes');
}

/**
 * Get pods, optionally filtered by namespace
 */
export async function getPods(clusterName: string, namespace?: string): Promise<V1Pod[]> {
  return listResources(clusterName, 'pods', { namespace });
}

/**
 * Get services, optionally filtered by namespace
 */
export async function getServices(clusterName: string, namespace?: string): Promise<V1Service[]> {
  return listResources(clusterName, 'services', { namespace });
}

/**
 * Get configmaps, optionally filtered by namespace
 */
export async function getConfigMaps(clusterName: string, namespace?: string): Promise<V1ConfigMap[]> {
  return listResources(clusterName, 'configmaps', { namespace });
}

/**
 * Get secrets, optionally filtered by namespace
 */
export async function getSecrets(clusterName: string, namespace?: string): Promise<V1Secret[]> {
  return listResources(clusterName, 'secrets', { namespace });
}

/**
 * Get persistent volumes (cluster-scoped)
 */
export async function getPersistentVolumes(clusterName: string): Promise<V1PersistentVolume[]> {
  return listResources(clusterName, 'persistentvolumes');
}

/**
 * Get persistent volume claims, optionally filtered by namespace
 */
export async function getPersistentVolumeClaims(clusterName: string, namespace?: string): Promise<V1PersistentVolumeClaim[]> {
  return listResources(clusterName, 'persistentvolumeclaims', { namespace });
}

/**
 * Get events, optionally filtered by namespace
 */
export async function getEvents(clusterName: string, namespace?: string): Promise<V1Event[]> {
  return listResources(clusterName, 'events', { namespace });
}

/**
 * Get deployments, optionally filtered by namespace
 */
export async function getDeployments(clusterName: string, namespace?: string): Promise<V1Deployment[]> {
  return listResources(clusterName, 'deployments', { 
    namespace,
    apiGroup: 'apps' 
  });
}

/**
 * Get statefulsets, optionally filtered by namespace
 */
export async function getStatefulSets(clusterName: string, namespace?: string): Promise<V1StatefulSet[]> {
  return listResources(clusterName, 'statefulsets', { 
    namespace,
    apiGroup: 'apps' 
  });
}

/**
 * Get daemonsets, optionally filtered by namespace
 */
export async function getDaemonSets(clusterName: string, namespace?: string): Promise<V1DaemonSet[]> {
  return listResources(clusterName, 'daemonsets', { 
    namespace,
    apiGroup: 'apps' 
  });
}

/**
 * Get ingresses, optionally filtered by namespace
 */
export async function getIngresses(clusterName: string, namespace?: string): Promise<V1Ingress[]> {
  return listResources(clusterName, 'ingresses', { 
    namespace,
    apiGroup: 'networking.k8s.io' 
  });
}

/**
 * Get available API resources
 */
export async function getApiResources(clusterName: string, apiVersion: string = 'v1'): Promise<any> {
  const response = await fetch(`http://localhost:4688/api/v1/clusters/${clusterName}/api/${apiVersion}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to get API resources: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Get available API groups
 */
export async function getApiGroups(clusterName: string): Promise<any> {
  const response = await fetch(`http://localhost:4688/api/v1/clusters/${clusterName}/apis`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to get API groups: ${response.statusText}`);
  }

  return await response.json();
}



/**
 * Searches for Kubernetes resources based on a query string
 * @param contextName The contextName for the Kubernetes cluster
 * @param query The search query
 * @param limit Maximum number of results to return
* @returns A promise resolving to search results
 */
export const queryResource = async (
  contextName: string,
  query: string,
  limit: number = 10
): Promise<SearchResponse> => {

  const response = await fetch(`http://localhost:4688/api/v1/cluster/${contextName}/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contextName,
      query,
      limit
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || `Failed to search resources: ${response.statusText}`);
  }

  return await response.json();
};


/**
 * Creates a new Kubernetes resource
 * 
 * @param clusterName The cluster name where to create the resource
 * @param resourceType The type of resource to create (e.g., 'pods', 'deployments')
 * @param resourceData The resource definition data
 * @param options Options for the request including namespace, apiGroup, etc.
 * @returns Promise with the created resource
 */
export async function createResource<T extends keyof KubernetesTypeMapping>(
  clusterName: string,
  resourceType: T,
  resourceData: any,
  options: RequestOptions = {}
): Promise<KubernetesTypeMapping[T]> {
  const {
    namespace,
    apiGroup,
    apiVersion = 'v1',
  } = options;

  // Determine if we're using a core API or custom API group
  const baseUrl = apiGroup
    ? `http://localhost:4688/api/v1/clusters/${clusterName}/apis/${apiGroup}/${apiVersion}`
    : `http://localhost:4688/api/v1/clusters/${clusterName}/api/${apiVersion}`;

  // Build path based on resource type and namespace
  let resourcePath = namespace 
    ? `namespaces/${namespace}/${resourceType}`
    : resourceType as string;

  // Build full URL
  const fullUrl = `${baseUrl}/${resourcePath}`;

  try {
    // Make the HTTP request
    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'include', // Include cookies for auth
      body: JSON.stringify(resourceData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(errorJson.message || `Failed to create resource (${response.status}): ${response.statusText}`);
      } catch (e) {
        throw new Error(`Failed to create resource (${response.status}): ${errorText}`);
      }
    }

    return await response.json();
  } catch (error) {
    console.error('Error creating resource:', error);
    throw error;
  }
}

/**
 * Updates an existing Kubernetes resource using PUT (replace)
 * 
 * @param clusterName The cluster name where the resource exists
 * @param resourceType The type of resource to update (e.g., 'pods', 'deployments')
 * @param name The name of the resource to update
 * @param resourceData The updated resource definition data
 * @param options Options for the request including namespace, apiGroup, etc.
 * @returns Promise with the updated resource
 */
export async function updateResource<T extends keyof KubernetesTypeMapping>(
  clusterName: string,
  resourceType: T,
  name: string,
  resourceData: any,
  options: RequestOptions = {}
): Promise<KubernetesTypeMapping[T]> {
  const {
    namespace,
    apiGroup,
    apiVersion = 'v1',
  } = options;

  // Determine if we're using a core API or custom API group
  const baseUrl = apiGroup
    ? `http://localhost:4688/api/v1/clusters/${clusterName}/apis/${apiGroup}/${apiVersion}`
    : `http://localhost:4688/api/v1/clusters/${clusterName}/api/${apiVersion}`;

  // Build path based on resource type and namespace
  let resourcePath = namespace 
    ? `namespaces/${namespace}/${resourceType}/${name}`
    : `${resourceType as string}/${name}`;

  // Build full URL
  const fullUrl = `${baseUrl}/${resourcePath}`;

  try {
    // Make the HTTP request
    const response = await fetch(fullUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'include', // Include cookies for auth
      body: JSON.stringify(resourceData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(errorJson.message || `Failed to update resource (${response.status}): ${response.statusText}`);
      } catch (e) {
        throw new Error(`Failed to update resource (${response.status}): ${errorText}`);
      }
    }

    return await response.json();
  } catch (error) {
    console.error('Error updating resource:', error);
    throw error;
  }
}

/**
 * Patches an existing Kubernetes resource using the JSON patch format
 * 
 * @param clusterName The cluster name where the resource exists
 * @param resourceType The type of resource to patch (e.g., 'pods', 'deployments')
 * @param name The name of the resource to patch
 * @param patchData The JSON patch operations to apply
 * @param options Options for the request including namespace, apiGroup, etc.
 * @returns Promise with the patched resource
 */
export async function patchResource<T extends keyof KubernetesTypeMapping>(
  clusterName: string,
  resourceType: T,
  name: string,
  patchData: any[],
  options: RequestOptions = {}
): Promise<KubernetesTypeMapping[T]> {
  const {
    namespace,
    apiGroup,
    apiVersion = 'v1',
  } = options;

  // Determine if we're using a core API or custom API group
  const baseUrl = apiGroup
    ? `http://localhost:4688/api/v1/clusters/${clusterName}/apis/${apiGroup}/${apiVersion}`
    : `http://localhost:4688/api/v1/clusters/${clusterName}/api/${apiVersion}`;

  // Build path based on resource type and namespace
  let resourcePath = namespace 
    ? `namespaces/${namespace}/${resourceType}/${name}`
    : `${resourceType as string}/${name}`;

  // Build full URL
  const fullUrl = `${baseUrl}/${resourcePath}`;

  try {
    // Make the HTTP request
    const response = await fetch(fullUrl, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json-patch+json',
        'Accept': 'application/json',
      },
      credentials: 'include', // Include cookies for auth
      body: JSON.stringify(patchData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(errorJson.message || `Failed to patch resource (${response.status}): ${response.statusText}`);
      } catch (e) {
        throw new Error(`Failed to patch resource (${response.status}): ${errorText}`);
      }
    }

    return await response.json();
  } catch (error) {
    console.error('Error patching resource:', error);
    throw error;
  }
}

/**
 * Deletes a Kubernetes resource
 * 
 * @param clusterName The cluster name where the resource exists
 * @param resourceType The type of resource to delete (e.g., 'pods', 'deployments')
 * @param name The name of the resource to delete
 * @param options Options for the request including namespace, apiGroup, etc.
 * @returns Promise that resolves when deletion is complete
 */
export async function deleteResource(
  clusterName: string,
  resourceType: string,
  name: string,
  options: RequestOptions = {}
): Promise<void> {
  const {
    namespace,
    apiGroup,
    apiVersion = 'v1',
  } = options;

  // Determine if we're using a core API or custom API group
  const baseUrl = apiGroup
    ? `http://localhost:4688/api/v1/clusters/${clusterName}/apis/${apiGroup}/${apiVersion}`
    : `http://localhost:4688/api/v1/clusters/${clusterName}/api/${apiVersion}`;

  // Build path based on resource type and namespace
  let resourcePath = namespace 
    ? `namespaces/${namespace}/${resourceType}/${name}`
    : `${resourceType}/${name}`;

  // Build full URL
  const fullUrl = `${baseUrl}/${resourcePath}`;

  try {
    // Make the HTTP request
    const response = await fetch(fullUrl, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'include', // Include cookies for auth
    });

    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(errorJson.message || `Failed to delete resource (${response.status}): ${response.statusText}`);
      } catch (e) {
        throw new Error(`Failed to delete resource (${response.status}): ${errorText}`);
      }
    }

    // Some delete operations return a status object, but we don't need to return it
    return;
  } catch (error) {
    console.error('Error deleting resource:', error);
    throw error;
  }
}