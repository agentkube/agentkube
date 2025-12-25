import React, { useState, useRef, useEffect } from 'react';
import { Plus } from 'lucide-react';
import KUBERNETES_LOGO from '@/assets/kubernetes.svg';
import { useCluster } from '@/contexts/clusterContext';
import { listResources, queryResource } from '@/api/internal/resources';
import { SearchResult } from '@/types/search';
import { jsonToYaml } from '@/utils/yaml';
import { ResourceInfoTooltip } from '../resource-tooltip.component';
import { AlertCircle } from 'lucide-react';

interface ContextSelectorProps {
  onResourceSelect: (resource: SearchResult) => void;
}

const isPodFailing = (pod: any): boolean => {
  const phase = pod.status?.phase?.toLowerCase();
  return phase === 'failed' || phase === 'error' ||
    (pod.status?.containerStatuses || []).some((status: any) =>
      status.state?.waiting?.reason === 'CrashLoopBackOff' ||
      status.state?.waiting?.reason === 'ImagePullBackOff' ||
      status.state?.waiting?.reason === 'ErrImagePull'
    );
};

const ResourceContext: React.FC<ContextSelectorProps> = ({ onResourceSelect }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [failingPodKeys, setFailingPodKeys] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const lastSearchIdRef = useRef(0);
  const { currentContext } = useCluster();

  // Handle clicking outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const fetchResourceContent = async (resource: SearchResult): Promise<string> => {
    try {
      if (!currentContext) return '';

      // Get the resource details using the existing listResources function
      const result = await listResources(
        currentContext.name,
        resource.resourceType,
        {
          namespace: resource.namespaced ? resource.namespace : undefined,
          name: resource.resourceName,
          apiGroup: resource.group || undefined,
          apiVersion: resource.version || 'v1'
        }
      );

      // Convert the resource to YAML format using the existing utility
      if (result.length > 0) {
        // Ensure the resource has kind and apiVersion for complete YAML
        const completeResource = {
          kind: resource.resourceType,
          apiVersion: resource.group ? `${resource.group}/${resource.version}` : resource.version,
          ...result[0]
        };
        return jsonToYaml(completeResource);
      }

      return '';
    } catch (err) {
      console.error('Failed to fetch resource content:', err);
      return '';
    }
  };


  // Fetch search results when dropdown opens or search query changes
  useEffect(() => {
    if (!isOpen || !currentContext) {
      setSearchResults([]);
      setIsLoading(false);
      return;
    }

    const fetchResults = async () => {
      const searchId = ++lastSearchIdRef.current;
      setIsLoading(true);
      setError(null);

      try {
        // Prepare query: strip leading @ if present (for copy-pasted mentions)
        let processedQuery = searchQuery.trim();
        if (processedQuery.startsWith('@')) {
          processedQuery = processedQuery.substring(1);
        }

        // Parse searchQuery for resource types (e.g., "pods/my-pod")
        let parsedResourceType: string | undefined;
        let finalSearchQuery = processedQuery;

        if (processedQuery.includes('/')) {
          const [type, ...queryParts] = processedQuery.split('/');
          parsedResourceType = type.trim().toLowerCase();
          finalSearchQuery = queryParts.join('/').trim();
        } else if (!processedQuery) {
          // Default to pods if query is empty or just '@'
          parsedResourceType = 'pods';
        }

        let results: SearchResult[] = [];

        if (parsedResourceType === 'events' || parsedResourceType === 'nodes' || parsedResourceType === 'namespaces') {
          // For cluster-wide or high-detail resources, use listResources directly (consistent with AutoTextarea)
          const items = await listResources(currentContext.name, parsedResourceType as any);

          if (searchId !== lastSearchIdRef.current) return;

          results = items
            .filter(item => {
              if (!finalSearchQuery) return true;
              const q = finalSearchQuery.toLowerCase();
              const name = item.metadata?.name || '';

              if (parsedResourceType === 'events') {
                const event = item as any;
                return (
                  (event.involvedObject?.name || '').toLowerCase().includes(q) ||
                  (event.message || '').toLowerCase().includes(q) ||
                  (event.reason || '').toLowerCase().includes(q)
                );
              }
              return name.toLowerCase().includes(q);
            })
            .slice(0, 60)
            .map(item => ({
              resourceType: parsedResourceType!,
              resourceName: item.metadata?.name || '',
              namespace: item.metadata?.namespace || '',
              namespaced: !!item.metadata?.namespace,
              group: '',
              version: 'v1'
            }));
        } else {
          // Default to queryResource for other types
          const response = await queryResource(
            currentContext.name,
            finalSearchQuery,
            60,
            parsedResourceType
          );

          if (searchId !== lastSearchIdRef.current) return;
          results = response.results || [];
        }

        // Only update if this is still the most recent search
        if (searchId === lastSearchIdRef.current) {
          setSearchResults(results);
        }
      } catch (err) {
        console.error('Search error:', err);
        if (searchId === lastSearchIdRef.current) {
          setError('Connect to cluster to search resources');
          setSearchResults([]);
        }
      } finally {
        if (searchId === lastSearchIdRef.current) {
          setIsLoading(false);
        }
      }
    };

    // Add debounce for search
    const timeout = setTimeout(() => {
      fetchResults();
    }, 300);

    return () => {
      clearTimeout(timeout);
    };
  }, [searchQuery, isOpen, currentContext]);

  // Check for failing pods when search results change
  useEffect(() => {
    if (searchResults.length === 0 || !currentContext) {
      setFailingPodKeys(new Set());
      return;
    }

    const checkHealth = async () => {
      const pods = searchResults.filter(r => r.resourceType === 'pods');
      if (pods.length === 0) return;

      const namespaces = Array.from(new Set(pods.map(p => p.namespace).filter(Boolean) as string[]));
      const failing = new Set<string>();

      try {
        // Fetch full pod status for all pods in the namespaces found in search results
        const podData = await Promise.all(
          namespaces.map(ns => listResources(currentContext.name, 'pods', { namespace: ns }))
        );

        const allPods = podData.flat();
        allPods.forEach(pod => {
          if (pod.metadata?.namespace && pod.metadata?.name && isPodFailing(pod)) {
            failing.add(`pods/${pod.metadata.namespace}/${pod.metadata.name}`);
          }
        });

        setFailingPodKeys(failing);
      } catch (err) {
        console.error('Error checking health:', err);
      }
    };

    checkHealth();
  }, [searchResults, currentContext]);

  // Grouped results for rendering
  const failingPods = searchResults.filter(r =>
    r.resourceType === 'pods' && failingPodKeys.has(`pods/${r.namespace}/${r.resourceName}`)
  );

  const otherResources = searchResults.filter(r =>
    !(r.resourceType === 'pods' && failingPodKeys.has(`pods/${r.namespace}/${r.resourceName}`))
  );

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
    // Reset search when opening dropdown
    if (!isOpen) {
      setSearchQuery('');
    }
  };

  const handleResourceSelection = async (resource: SearchResult) => {
    setIsLoading(true);
    try {
      // Fetch the resource content (YAML)
      const resourceContent = await fetchResourceContent(resource);

      const enrichedResource = {
        ...resource,
        resourceContent
      };

      onResourceSelect(enrichedResource);
      setIsOpen(false);
    } catch (error) {
      console.error('Error fetching resource content:', error);
      onResourceSelect(resource);
      setIsOpen(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={toggleDropdown}
        className="flex items-center text-muted-foreground hover:text-foreground transition-colors rounded px-2 py-1"
      >
        <Plus size={14} className="mr-1" />
        <span className="text-xs">Add context</span>
      </button>

      {isOpen && (
        <div className="absolute left-0 bottom-full mb-1 w-96 rounded-md shadow-lg bg-white dark:bg-drawer/60 backdrop-blur-md border border-gray-400/30 dark:border-gray-800/50 z-50">
          <div className="p-2">
            <div className="relative">
              <input
                type="text"
                placeholder="Search resources by name"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-3 pr-3 py-2 bg-muted rounded text-xs text-foreground focus:outline-none  focus:ring-ring"
                autoFocus
              />
            </div>
          </div>

          <div className="px-3 pt-2 pb-1">
            <div className="text-xs text-gray-500 uppercase font-medium">Available</div>
          </div>

          <div className="max-h-40 overflow-y-auto py-1
            [&::-webkit-scrollbar]:w-1.5 
            [&::-webkit-scrollbar-track]:bg-transparent 
            [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
            [&::-webkit-scrollbar-thumb]:rounded-full
            [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">

            {isLoading && (
              <div className="px-3 py-2 text-sm text-gray-500 flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Searching...
              </div>
            )}

            {error && (
              <div className="px-3 py-2 text-sm text-gray-800 dark:text-gray-500">
                {error}
              </div>
            )}

            {!isLoading && !error && searchResults.length === 0 && (
              <div className="px-3 py-2 text-sm text-gray-500">
                No resources found matching "{searchQuery}"
              </div>
            )}

            {!isLoading && !error && failingPods.length > 0 && (
              <>
                <div className="px-3 pt-2 pb-1 border-t border-gray-400/10 dark:border-gray-800/20 mt-1">
                  <div className="text-[10px] text-red-500 uppercase font-bold flex items-center gap-1">
                    <AlertCircle size={10} />
                    Failing Pods
                  </div>
                </div>
                {failingPods.map((result, index) => (
                  <ResourceInfoTooltip key={`failing-${result.resourceName}-${index}`} resource={result}>
                    <div
                      className="px-3 py-1.5 text-sm cursor-pointer flex items-center justify-between hover:bg-red-500/10 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 group transition-colors"
                      onClick={() => handleResourceSelection(result)}
                    >
                      <div className="flex items-center min-w-0">
                        <img src={KUBERNETES_LOGO} alt="K8s" className="w-4 h-4 opacity-70 group-hover:opacity-100" />
                        <span className="ml-2 text-xs truncate">pods/{result.resourceName}</span>
                      </div>
                      <div className="text-[10px] opacity-70">
                        {result.namespace}
                      </div>
                    </div>
                  </ResourceInfoTooltip>
                ))}
              </>
            )}

            {!isLoading && !error && otherResources.length > 0 && (
              <>
                {failingPods.length > 0 && (
                  <div className="px-3 pt-2 pb-1 border-t border-gray-400/10 dark:border-gray-800/20 mt-2">
                    <div className="text-[10px] text-gray-500 uppercase font-bold">Other Resources</div>
                  </div>
                )}
                {otherResources.map((result, index) => (
                  <ResourceInfoTooltip key={`other-${result.resourceName}-${index}`} resource={result}>
                    <div
                      className="px-3 py-1.5 text-sm cursor-pointer flex items-center justify-between hover:bg-gray-300/80 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 group transition-colors"
                      onClick={() => handleResourceSelection(result)}
                    >
                      <div className="flex items-center min-w-0">
                        <img src={KUBERNETES_LOGO} alt="K8s" className="w-4 h-4 opacity-70 group-hover:opacity-100" />
                        <span className="ml-2 text-xs truncate">{result.resourceType}/{result.resourceName}</span>
                      </div>
                      <div className="text-muted-foreground text-[10px]">
                        {result.namespace ? result.namespace : "cluster-scoped"}
                      </div>
                    </div>
                  </ResourceInfoTooltip>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ResourceContext;