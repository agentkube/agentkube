import { SearchResult } from "@/types/search";

export const getResourceViewPath = (result: SearchResult): string => {
  // Standard resource path mapping based on resource type
  switch (result.resourceType) {
    // Workloads
    case 'pods':
      return `/dashboard/explore/pods/${result.namespace}/${result.resourceName}`;
    case 'deployments':
      return `/dashboard/explore/deployments/${result.namespace}/${result.resourceName}`;
    case 'daemonsets':
      return `/dashboard/explore/daemonsets/${result.namespace}/${result.resourceName}`;
    case 'statefulsets':
      return `/dashboard/explore/statefulsets/${result.namespace}/${result.resourceName}`;
    case 'jobs':
      return `/dashboard/explore/jobs/${result.namespace}/${result.resourceName}`;
    case 'cronjobs':
      return `/dashboard/explore/cronjobs/${result.namespace}/${result.resourceName}`;
    
    // Configuration
    case 'configmaps':
      return `/dashboard/explore/configmaps/${result.namespace}/${result.resourceName}`;
    case 'secrets':
      return `/dashboard/explore/secrets/${result.namespace}/${result.resourceName}`;

    // RBAC
    case 'serviceaccounts':
      return `/dashboard/explore/serviceaccounts/${result.namespace}/${result.resourceName}`;
    case 'roles':
      return `/dashboard/explore/roles/${result.namespace}/${result.resourceName}`;
    case 'rolebindings':
      return `/dashboard/explore/rolebindings/${result.namespace}/${result.resourceName}`;
    case 'clusterroles':
      return `/dashboard/explore/clusterroles/${result.resourceName}`;
    case 'clusterrolebindings':
      return `/dashboard/explore/clusterrolebindings/${result.resourceName}`;

    // Networking
    case 'services':
      return `/dashboard/explore/services/${result.namespace}/${result.resourceName}`;
    case 'endpoints':
      return `/dashboard/explore/endpoints/${result.namespace}/${result.resourceName}`;
    case 'ingresses':
      return `/dashboard/explore/ingresses/${result.namespace}/${result.resourceName}`;
    case 'ingressclasses':
      return `/dashboard/explore/ingressclasses/${result.resourceName}`;
    case 'networkpolicies':
      return `/dashboard/explore/networkpolicies/${result.namespace}/${result.resourceName}`;

    // Storage
    case 'persistentvolumeclaims':
      return `/dashboard/explore/persistentvolumeclaims/${result.resourceName}/namespace/${result.namespace}`;
    case 'persistentvolumes':
      return `/dashboard/explore/persistentvolumes/${result.resourceName}`;
    case 'storageclasses':
      return `/dashboard/explore/storageclasses/${result.resourceName}`;

    // Autoscaling
    case 'horizontalpodautoscalers':
      return `/dashboard/explore/horizontalpodautoscalers/${result.namespace}/${result.resourceName}`;
    case 'verticalpodautoscalers':
      return `/dashboard/explore/verticalpodautoscalers/${result.namespace}/${result.resourceName}`;

    // Cluster 
    case 'namespaces':
      return `/dashboard/explore/namespaces/${result.resourceName}`;
    case 'nodes':
      return `/dashboard/explore/nodes/${result.resourceName}`;

    // Others
    case 'leases':
      return `/dashboard/explore/leases/${result.namespace}/${result.resourceName}`;

      // TODO for custom resources
    // For resources not explicitly handled, use a generic approach
    default:
      // For namespaced resources
      if (result.namespaced) {
        return `/dashboard/explore/resources/${result.group}/${result.version}/${result.resourceType}/${result.resourceName}/namespace/${result.namespace}`;
      }
      // For cluster-scoped resources
      return `/dashboard/explore/resources/${result.group}/${result.version}/${result.resourceType}/${result.resourceName}`;
  }
};