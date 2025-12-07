import React, { useState, useRef, useEffect } from 'react';
import { Plus } from 'lucide-react';
import KUBERNETES_LOGO from '@/assets/kubernetes.svg';
import { useCluster } from '@/contexts/clusterContext';
import { listResources, queryResource } from '@/api/internal/resources';
import { SearchResult } from '@/types/search';
import { jsonToYaml } from '@/utils/yaml';

interface ContextSelectorProps {
  onResourceSelect: (resource: SearchResult) => void;
}

const ResourceContext: React.FC<ContextSelectorProps> = ({ onResourceSelect }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
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
    if (!isOpen || !currentContext) return;

    const fetchResults = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await queryResource(
          currentContext.name,
          searchQuery || 'deployment',
          60 // limit
        );

        setSearchResults(response.results || []);
      } catch (err) {
        console.error('Search error:', err);
        setError('Connect to cluster to search resources');
      } finally {
        setIsLoading(false);
      }
    };

    // Add debounce for search
    const timeout = setTimeout(() => {
      fetchResults();
    }, 300);

    return () => clearTimeout(timeout);
  }, [searchQuery, isOpen, currentContext]);

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

            {!isLoading && !error && searchResults.map((result, index) => (
              <div
                key={`${result.resourceType}-${result.namespace || 'cluster'}-${result.resourceName}-${index}`}
                className="px-3 py-1 text-sm cursor-pointer flex items-center justify-between hover:bg-gray-300/80 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300"
                onClick={() => handleResourceSelection(result)}
              >
                <div className="flex items-center">
                  <img src={KUBERNETES_LOGO} alt="Kubernetes Logo" className="w-4 h-4" />
                  <span className="ml-2 text-xs">{result.resourceType}/{result.resourceName}</span>
                </div>
                <div className="text-muted-foreground text-xs">
                  {result.namespace ? result.namespace : "cluster-scoped"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ResourceContext;