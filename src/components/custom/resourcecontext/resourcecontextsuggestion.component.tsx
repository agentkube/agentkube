import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Eye, Plus } from 'lucide-react';
import { useCluster } from '@/contexts/clusterContext';
import { getResource } from '@/api/internal/resources';
import { resourceToEnrichedSearchResult } from '@/utils/resource-to-enriched.utils';
import { EnrichedSearchResult } from '@/types/search';

interface ResourceContextSuggestionProps {
  onResourceSelect: (resource: EnrichedSearchResult) => void;
}

const ResourceContextSuggestion: React.FC<ResourceContextSuggestionProps> = ({ onResourceSelect }) => {
  const location = useLocation();
  const { currentContext } = useCluster();
  const [isLoading, setIsLoading] = useState(false);
  const [suggestionData, setSuggestionData] = useState<{
    resourceType: string;
    resourceName: string;
    namespace?: string;
    apiGroup?: string;
    apiVersion?: string;
    namespaced: boolean;
  } | null>(null);

  // Detect if we're on a resource viewer page
  useEffect(() => {
    const pathname = location.pathname;

    // Always reset and re-evaluate when pathname changes
    setSuggestionData(null);

    // Parse pathname directly instead of relying on useParams (which doesn't work in drawer context)
    // Pattern for namespaced resources: /dashboard/explore/{resource}/{namespace}/{name}
    // Pattern for cluster-scoped: /dashboard/explore/{resource}/{name}

    // Check for pods
    const podMatch = pathname.match(/\/pods\/([^\/]+)\/([^\/]+)/);
    if (podMatch) {
      const [, namespace, resourceName] = podMatch;
      setSuggestionData({
        resourceType: 'pods',
        resourceName,
        namespace,
        apiVersion: 'v1',
        namespaced: true,
      });
      return;
    }

    // Check for deployments
    const deploymentMatch = pathname.match(/\/deployments\/([^\/]+)\/([^\/]+)/);
    if (deploymentMatch) {
      const [, namespace, resourceName] = deploymentMatch;
      setSuggestionData({
        resourceType: 'deployments',
        resourceName,
        namespace,
        apiGroup: 'apps',
        apiVersion: 'v1',
        namespaced: true,
      });
      return;
    }

    // Check for daemonsets
    const daemonsetMatch = pathname.match(/\/daemonsets\/([^\/]+)\/([^\/]+)/);
    if (daemonsetMatch) {
      const [, namespace, resourceName] = daemonsetMatch;
      setSuggestionData({
        resourceType: 'daemonsets',
        resourceName,
        namespace,
        apiGroup: 'apps',
        apiVersion: 'v1',
        namespaced: true,
      });
      return;
    }

    // Check for replicasets
    const replicasetMatch = pathname.match(/\/replicasets\/([^\/]+)\/([^\/]+)/);
    if (replicasetMatch) {
      const [, namespace, resourceName] = replicasetMatch;
      setSuggestionData({
        resourceType: 'replicasets',
        resourceName,
        namespace,
        apiGroup: 'apps',
        apiVersion: 'v1',
        namespaced: true,
      });
      return;
    }

    // Check for statefulsets
    const statefulsetMatch = pathname.match(/\/statefulsets\/([^\/]+)\/([^\/]+)/);
    if (statefulsetMatch) {
      const [, namespace, resourceName] = statefulsetMatch;
      setSuggestionData({
        resourceType: 'statefulsets',
        resourceName,
        namespace,
        apiGroup: 'apps',
        apiVersion: 'v1',
        namespaced: true,
      });
      return;
    }

    // Check for cronjobs
    const cronjobMatch = pathname.match(/\/cronjobs\/([^\/]+)\/([^\/]+)/);
    if (cronjobMatch) {
      const [, namespace, resourceName] = cronjobMatch;
      setSuggestionData({
        resourceType: 'cronjobs',
        resourceName,
        namespace,
        apiGroup: 'batch',
        apiVersion: 'v1',
        namespaced: true,
      });
      return;
    }

    // Check for jobs
    const jobMatch = pathname.match(/\/jobs\/([^\/]+)\/([^\/]+)/);
    if (jobMatch) {
      const [, namespace, resourceName] = jobMatch;
      setSuggestionData({
        resourceType: 'jobs',
        resourceName,
        namespace,
        apiGroup: 'batch',
        apiVersion: 'v1',
        namespaced: true,
      });
      return;
    }

    // Check for services
    const serviceMatch = pathname.match(/\/services\/([^\/]+)\/([^\/]+)/);
    if (serviceMatch) {
      const [, namespace, resourceName] = serviceMatch;
      setSuggestionData({
        resourceType: 'services',
        resourceName,
        namespace,
        apiVersion: 'v1',
        namespaced: true,
      });
      return;
    }

    // Check for configmaps
    const configmapMatch = pathname.match(/\/configmaps\/([^\/]+)\/([^\/]+)/);
    if (configmapMatch) {
      const [, namespace, resourceName] = configmapMatch;
      setSuggestionData({
        resourceType: 'configmaps',
        resourceName,
        namespace,
        apiVersion: 'v1',
        namespaced: true,
      });
      return;
    }

    // Check for secrets
    const secretMatch = pathname.match(/\/secrets\/([^\/]+)\/([^\/]+)/);
    if (secretMatch) {
      const [, namespace, resourceName] = secretMatch;
      setSuggestionData({
        resourceType: 'secrets',
        resourceName,
        namespace,
        apiVersion: 'v1',
        namespaced: true,
      });
      return;
    }

    // Check for ingresses
    const ingressMatch = pathname.match(/\/ingresses\/([^\/]+)\/([^\/]+)/);
    if (ingressMatch) {
      const [, namespace, resourceName] = ingressMatch;
      setSuggestionData({
        resourceType: 'ingresses',
        resourceName,
        namespace,
        apiGroup: 'networking.k8s.io',
        apiVersion: 'v1',
        namespaced: true,
      });
      return;
    }

    // Check for nodes (cluster-scoped)
    const nodeMatch = pathname.match(/\/nodes\/([^\/]+)$/);
    if (nodeMatch) {
      const [, resourceName] = nodeMatch;
      setSuggestionData({
        resourceType: 'nodes',
        resourceName,
        apiVersion: 'v1',
        namespaced: false,
      });
      return;
    }

    // Check for namespaces (cluster-scoped)
    const namespaceMatch = pathname.match(/\/namespaces\/([^\/]+)$/);
    if (namespaceMatch) {
      const [, resourceName] = namespaceMatch;
      setSuggestionData({
        resourceType: 'namespaces',
        resourceName,
        apiVersion: 'v1',
        namespaced: false,
      });
      return;
    }

    // If no match found, suggestion remains null (already cleared at start of useEffect)
  }, [location.pathname]);

  const handleAddContext = async () => {
    if (!suggestionData || !currentContext) return;

    setIsLoading(true);

    try {
      // Fetch the resource data
      const resourceData = await getResource(
        currentContext.name,
        suggestionData.resourceType as any,
        suggestionData.resourceName,
        suggestionData.namespace,
        suggestionData.apiGroup
      );

      // Convert to EnrichedSearchResult format
      const enrichedResource = resourceToEnrichedSearchResult(
        resourceData,
        suggestionData.resourceType,
        suggestionData.namespaced,
        suggestionData.apiGroup,
        suggestionData.apiVersion || 'v1'
      );

      // Add to context
      onResourceSelect(enrichedResource);

      // Clear the suggestion after successful addition
      setSuggestionData(null);
    } catch (error) {
      console.error('Error adding resource to context:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Don't show suggestion if not on a viewer page or if loading
  if (!suggestionData) return null;

  return (
    <button
      onClick={handleAddContext}
      disabled={isLoading}
      className="flex items-center text-gray-500 dark:text-gray-300/50 hover:text-gray-700 dark:hover:text-gray-300 transition-colors rounded px-2 py-1 text-xs disabled:opacity-50"
      title={`Add ${suggestionData.resourceType}/${suggestionData.resourceName} to context`}
    >
      {isLoading ? (
        <svg className="animate-spin h-3 w-3 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      ) : (
        <Eye size={12} className="mr-1" />
      )}
      <span className="max-w-[400px] truncate">
        {suggestionData.resourceType}/{suggestionData.resourceName}
      </span>
    </button>
  );
};

export default ResourceContextSuggestion;
