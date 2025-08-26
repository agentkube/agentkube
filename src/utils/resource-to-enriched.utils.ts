import { EnrichedSearchResult } from '@/types/search';
import { jsonToYaml } from '@/utils/yaml';

/**
 * Generic interface for any Kubernetes resource with metadata
 */
interface KubernetesResource {
  metadata?: {
    name?: string;
    namespace?: string;
  };
}

/**
 * Map plural resource types to their corresponding Kubernetes kinds
 */
const resourceTypeToKind: Record<string, string> = {
  'serviceaccounts': 'ServiceAccount',
  'clusterroles': 'ClusterRole', 
  'clusterrolebindings': 'ClusterRoleBinding',
  'roles': 'Role',
  'rolebindings': 'RoleBinding',
  'pods': 'Pod',
  'deployments': 'Deployment',
  'services': 'Service',
  'persistentvolumeclaims': 'PersistentVolumeClaim',
  'persistentvolumes': 'PersistentVolume',
  'daemonsets': 'DaemonSet',
  'statefulsets': 'StatefulSet',
  'storageclasses': 'StorageClass',
  // Add more mappings as needed
};

/**
 * Converts any Kubernetes resource to an EnrichedSearchResult format
 * that can be used with the ResourceContext component
 */
export const resourceToEnrichedSearchResult = (
  resource: KubernetesResource,
  resourceType: string,
  isNamespaced: boolean = true,
  group: string = '',
  version: string = 'v1'
): EnrichedSearchResult => {
  // Get the correct Kubernetes kind from the resource type
  const kind = resourceTypeToKind[resourceType] || resourceType;
  
  // Create a complete Kubernetes resource object with apiVersion and kind
  const completeResource = {
    kind,
    apiVersion: group ? `${group}/${version}` : version,
    ...resource
  };
  
  const resourceContent = jsonToYaml(completeResource);
  
  return {
    namespace: resource.metadata?.namespace || 'default',
    group,
    version,
    resourceType,
    resourceName: resource.metadata?.name || `unknown-${resourceType.toLowerCase()}`,
    namespaced: isNamespaced,
    resourceContent
  };
};