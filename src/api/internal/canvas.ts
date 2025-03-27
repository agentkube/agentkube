/**
 * Interface representing a resource identifier in Kubernetes
 */
export interface ResourceIdentifier {
  namespace: string;
  group: string;
  version: string;
  resource_type: string;
  resource_name: string;
}

/**
 * Represents a node in the graph visualization
 */
export interface CanvasNode {
  id: string;
  type: string;
  data: {
    namespace: string;
    group: string;
    version: string;
    resourceType: string;
    resourceName: string;
    status: any;
    createdAt: string;
    labels: Record<string, string>;
    [key: string]: any;
  };
}

/**
 * Represents an edge (connection) between nodes in the graph
 */
export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  label: string;
}

/**
 * Response format for the graph data
 */
export interface GraphResponse {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

/**
 * Fetches the canvas/graph visualization data for a Kubernetes resource
 * This creates a graph showing relationships between the resource and related objects
 * 
 * @param clusterName The name of the cluster context
 * @param namespace The namespace of the resource (empty string for cluster-scoped resources)
 * @param group The API group of the resource (empty string for core resources)
 * @param version The API version of the resource
 * @param resourceType The type of resource (plural form, e.g. 'deployments')
 * @param resourceName The name of the specific resource
 * @returns Promise with the graph data containing nodes and edges
 */
export async function getResourceCanvas(
  clusterName: string,
  namespace: string,
  group: string,
  version: string,
  resourceType: string,
  resourceName: string
): Promise<GraphResponse> {
  try {
    // Create the resource identifier object
    const resource: ResourceIdentifier = {
      namespace,
      group,
      version,
      resource_type: resourceType,
      resource_name: resourceName
    };

    // Make API request to the canvas endpoint
    const response = await fetch(`http://localhost:4688/api/v1/cluster/${clusterName}/canvas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'include', // Include cookies for auth
      body: JSON.stringify(resource),
    });

    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(errorJson.error || `Failed to get canvas data (${response.status}): ${response.statusText}`);
      } catch (e) {
        throw new Error(`Failed to get canvas data (${response.status}): ${errorText}`);
      }
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching resource canvas:', error);
    throw error;
  }
}

/**
 * Helper function to create a resource identifier for any Kubernetes resource
 * 
 * @param resourceType The type of resource (e.g. 'deployments', 'services')
 * @param resourceName The name of the specific resource
 * @param namespace The namespace of the resource (if namespaced)
 * @param group The API group (defaults to auto-detection based on resource type)
 * @param version The API version (defaults to auto-detection based on resource type)
 * @returns A ResourceIdentifier object
 */
export function createResourceIdentifier(
  resourceType: string,
  resourceName: string,
  namespace: string = '',
  group: string = '',
  version: string = ''
): ResourceIdentifier {
  // Handle special case for 'core' group
  if (group === 'core') {
    group = '';
  }
  
  // Auto-detect API group and version based on resource type if not provided
  if (!group || !version) {
    const resourceMapping = getResourceGroupVersionMapping(resourceType);
    if (!group) group = resourceMapping.group;
    if (!version) version = resourceMapping.version;
  }

  return {
    namespace,
    group,
    version,
    resource_type: resourceType,
    resource_name: resourceName
  };
}

/**
 * Maps Kubernetes resource types to their API group and version
 * This helps automatically determine the correct API group/version for a resource
 * 
 * @param resourceType The type of resource (plural form)
 * @returns The API group and version for the given resource type
 */
function getResourceGroupVersionMapping(resourceType: string): { group: string, version: string } {
  // Default to core API group with v1 version
  const defaultMapping = { group: '', version: 'v1' };
  
  // Map of resource types to their API groups and versions
  const resourceMappings: Record<string, { group: string, version: string }> = {
    // Core resources (v1)
    'pods': defaultMapping,
    'services': defaultMapping,
    'endpoints': defaultMapping,
    'nodes': defaultMapping,
    'configmaps': defaultMapping,
    'secrets': defaultMapping,
    'namespaces': defaultMapping,
    'serviceaccounts': defaultMapping,
    'persistentvolumeclaims': defaultMapping,
    'persistentvolumes': defaultMapping,
    'events': defaultMapping,
    'limitranges': defaultMapping,
    'resourcequotas': defaultMapping,
    'componentstatuses': defaultMapping,
    
    // Apps API group
    'deployments': { group: 'apps', version: 'v1' },
    'statefulsets': { group: 'apps', version: 'v1' },
    'daemonsets': { group: 'apps', version: 'v1' },
    'replicasets': { group: 'apps', version: 'v1' },
    'controllerrevisions': { group: 'apps', version: 'v1' },
    
    // Batch API group
    'jobs': { group: 'batch', version: 'v1' },
    'cronjobs': { group: 'batch', version: 'v1' },
    
    // Networking API group
    'ingresses': { group: 'networking.k8s.io', version: 'v1' },
    'networkpolicies': { group: 'networking.k8s.io', version: 'v1' },
    'ingressclasses': { group: 'networking.k8s.io', version: 'v1' },
    
    // RBAC API group
    'roles': { group: 'rbac.authorization.k8s.io', version: 'v1' },
    'rolebindings': { group: 'rbac.authorization.k8s.io', version: 'v1' },
    'clusterroles': { group: 'rbac.authorization.k8s.io', version: 'v1' },
    'clusterrolebindings': { group: 'rbac.authorization.k8s.io', version: 'v1' },
    
    // Storage API group
    'storageclasses': { group: 'storage.k8s.io', version: 'v1' },
    'volumeattachments': { group: 'storage.k8s.io', version: 'v1' },
    'csinodes': { group: 'storage.k8s.io', version: 'v1' },
    'csidrivers': { group: 'storage.k8s.io', version: 'v1' },
    
    // Policy API group
    'poddisruptionbudgets': { group: 'policy', version: 'v1' },
    'podsecuritypolicies': { group: 'policy', version: 'v1beta1' },
    
    // Autoscaling API group
    'horizontalpodautoscalers': { group: 'autoscaling', version: 'v2' },
    
    // ApiExtensions API group
    'customresourcedefinitions': { group: 'apiextensions.k8s.io', version: 'v1' },
    
    // Authentication API group
    'tokenreviews': { group: 'authentication.k8s.io', version: 'v1' },
    
    // Authorization API group
    'localsubjectaccessreviews': { group: 'authorization.k8s.io', version: 'v1' },
    'selfsubjectaccessreviews': { group: 'authorization.k8s.io', version: 'v1' },
    'selfsubjectrulesreviews': { group: 'authorization.k8s.io', version: 'v1' },
    'subjectaccessreviews': { group: 'authorization.k8s.io', version: 'v1' },
    
    // Certificates API group
    'certificatesigningrequests': { group: 'certificates.k8s.io', version: 'v1' },
    
    // Coordination API group
    'leases': { group: 'coordination.k8s.io', version: 'v1' },
    
    // Discovery API group
    'endpointslices': { group: 'discovery.k8s.io', version: 'v1' },
    
    // Scheduling API group
    'priorityclasses': { group: 'scheduling.k8s.io', version: 'v1' },
  };
  
  return resourceMappings[resourceType] || defaultMapping;
}

// Example usage:
/*
// For a deployment
const deploymentCanvas = await getResourceCanvas(
  'my-cluster',
  createResourceIdentifier('deployments', 'my-deployment', 'default', 'apps')
);

// For a service
const serviceCanvas = await getResourceCanvas(
  'my-cluster',
  createResourceIdentifier('services', 'my-service', 'default')
);
*/