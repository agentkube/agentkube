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
  const resourceContent = jsonToYaml(resource);
  
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