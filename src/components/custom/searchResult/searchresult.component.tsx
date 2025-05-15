import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Database, FileText, HardDrive, Shield, Globe, Box } from 'lucide-react';
import { queryResource } from '@/api/internal/resources';
import { SearchResult } from '@/types/search';
import { getResourceViewPath } from '@/utils/navigation';
import { useCluster } from '@/contexts/clusterContext';

interface SearchResultsProps {
  query: string;
  onResultClick?: () => void; // Optional callback for result click
  limit?: number;
  resourceType?: string; // Add this prop
}

const SearchResults: React.FC<SearchResultsProps> = ({ 
  query, 
  onResultClick,
  limit = 10,
  resourceType
}) => {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { currentContext } = useCluster();

  useEffect(() => {
    const fetchResults = async () => {
      if (!query || !currentContext) return;
      
      setLoading(true);
      setError(null);
      
      try {
        const response = await queryResource(
          currentContext.name,
          query,
          limit,
          resourceType // Add the resourceType parameter
        );
        
        setResults(response.results || []);
      } catch (err) {
        console.error('Search error:', err);
        // setError(err instanceof Error ? err.message : 'Failed to search resources');
      } finally {
        setLoading(false);
      }
    };
    
    // Add debounce here if needed
    const timeout = setTimeout(() => {
      fetchResults();
    }, 300);
    
    return () => clearTimeout(timeout);
  }, [query, limit, resourceType]);

  const handleResultClick = (result: SearchResult) => {
    const path = getResourceViewPath(result);
    navigate(path);
    if (onResultClick) {
      onResultClick();
    }
  };

  // Get icon based on resource type
  const getResourceIcon = (result: SearchResult) => {
    switch (result.resourceType) {
      case 'pods':
        return <Box className="w-4 h-4" />;
      case 'deployments':
      case 'statefulsets':
      case 'daemonsets':
        return <HardDrive className="w-4 h-4" />;
      case 'configmaps':
      case 'secrets':
        return <FileText className="w-4 h-4" />;
      case 'services':
      case 'ingresses':
        return <Globe className="w-4 h-4" />;
      case 'persistentvolumes':
      case 'persistentvolumeclaims':
      case 'storageclasses':
        return <Database className="w-4 h-4" />;
      case 'roles':
      case 'clusterroles':
      case 'rolebindings':
      case 'clusterrolebindings':
        return <Shield className="w-4 h-4" />;
      default:
        return <Box className="w-4 h-4" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-gray-500 mr-2" />
        <span className="text-gray-500">Searching...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-500 p-4 text-center">
        {error}
      </div>
    );
  }

  if (results.length === 0 && query.length > 0) {
    return (
      <div className="text-gray-500 p-4 text-center">
        No resources found for "{query}"
      </div>
    );
  }

  return (
    <div className="py-0">
      {results.map((result, index) => (
        <div
          key={`${result.resourceType}-${result.namespace}-${result.resourceName}-${index}`}
          className="flex items-center px-4 py-2 hover:bg-gray-200 dark:hover:bg-gray-800/20 cursor-pointer"
          onClick={() => handleResultClick(result)}
        >
          <div className="mr-3 text-gray-600">
            {getResourceIcon(result)}
          </div>
          <div className="flex-1">
            <div className="flex items-center">
              <span className="font-medium">{result.resourceName}</span>
              <span className="ml-2 px-2 py-0.5 bg-gray-200 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 rounded-[0.3rem] text-xs text-gray-600">
                {result.resourceType}
              </span>
            </div>
            {result.namespaced && (
              <div className="text-sm text-gray-500">
                namespace: {result.namespace}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default SearchResults;