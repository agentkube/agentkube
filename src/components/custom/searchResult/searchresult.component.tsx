import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Database, FileText, HardDrive, Shield, Globe, Box } from 'lucide-react';
import { queryResource } from '@/api/internal/resources';
import { SearchResult } from '@/types/search';
import { getResourceViewPath } from '@/utils/navigation';
import { useCluster } from '@/contexts/clusterContext';
import { parseSearchQuery } from '@/utils/spotlight.utils';
import { ExecuteCommand } from '@/api/internal/execute';
import { ExecutionResult } from "@/types/cluster";
import CommandOutputSpotlight from '../commandoutputspotlight/commandoutputspotlight.command';

interface SearchResultsProps {
  query: string;
  onResultClick?: () => void;
  limit?: number;
  resourceType?: string;
  activeIndex?: number;
  onResultsCountChange?: (count: number) => void;
  isResourceMode?: boolean;
}

const SearchResults: React.FC<SearchResultsProps> = ({
  query,
  onResultClick,
  limit = 10,
  resourceType,
  activeIndex = -1,
  onResultsCountChange,
  isResourceMode = false
}) => {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commandOutput, setCommandOutput] = useState<ExecutionResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const navigate = useNavigate();
  const [isDialogOpen, setDialogOpen] = useState(false);
  const [hasNavigated, setHasNavigated] = useState(false);
  const { currentContext } = useCluster();

  useEffect(() => {
    setHasNavigated(false);
  }, [query]);

  useEffect(() => {
    const fetchResults = async () => {
      if (!query || !currentContext) return;

      setLoading(true);
      setError(null);

      try {
        const { cleanQuery, namespace } = parseSearchQuery(query);

        const response = await queryResource(
          currentContext.name,
          cleanQuery,
          limit,
          resourceType,
          namespace
        );

        setResults(response.results || []);
        if (onResultsCountChange) {
          onResultsCountChange(response.results?.length || 0);
        }
      } catch (err) {
        console.error('Search error:', err);
        if (onResultsCountChange) {
          onResultsCountChange(0);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchResults();


    // return () => clearTimeout(timeout);
  }, [query, limit, resourceType, onResultsCountChange]);

  // Handle keyboard events only in resource mode
  useEffect(() => {
    if (!isResourceMode) return;
  
    const handleKeyDown = (e: KeyboardEvent) => {
      // Handle escape to close command output
      if (e.key === 'Escape' && commandOutput) {
        e.preventDefault();
        e.stopPropagation();
        setCommandOutput(null);
        return;
      }
  
      if (e.key.toLowerCase() === 'f' && commandOutput) {
        e.preventDefault();
        e.stopPropagation();
        setDialogOpen(true);
        return;
      }
  
      // Track navigation with arrow keys
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setHasNavigated(true);
        return;
      }
  
      // Handle D/V keys only if user has navigated and no command output is showing
      if (activeIndex >= 0 && results.length > 0 && !commandOutput && hasNavigated) {
        if (e.key.toLowerCase() === 'd') {
          e.preventDefault();
          e.stopPropagation();
          handleDescribe(results[activeIndex]);
        } else if (e.key.toLowerCase() === 'v') {
          e.preventDefault();
          e.stopPropagation();
          handleResultClick(results[activeIndex]);
        }
      }
    };
  
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isResourceMode, activeIndex, results, commandOutput, hasNavigated]);

  const handleResultClick = (result: SearchResult) => {
    const path = getResourceViewPath(result);
    navigate(path);
    if (onResultClick) {
      onResultClick();
    }
  };

  const handleDescribe = async (result: SearchResult) => {
    if (!currentContext) return;

    setCommandOutput(null);
    setIsExecuting(true);

    try {
      const describeCommand = result.namespaced
        ? `kubectl describe ${result.resourceType} ${result.resourceName} -n ${result.namespace} --context ${currentContext.name}`
        : `kubectl describe ${result.resourceType} ${result.resourceName} --context ${currentContext.name}`;

      const output = await ExecuteCommand(describeCommand, currentContext.name);
      setCommandOutput(output);
    } catch (error) {
      console.error('Failed to describe resource:', error);
      setCommandOutput({
        command: `kubectl describe ${result.resourceType} ${result.resourceName} --context ${currentContext.name}`,
        output: 'Failed to describe resource: ' + (error as Error).message,
        success: false
      });
    } finally {
      setIsExecuting(false);
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
    <>
      {/* Command Output Section */}
      {commandOutput && (
        <CommandOutputSpotlight
          output={commandOutput}
          isExecuting={isExecuting}
          isDialogOpen={isDialogOpen}
          setIsDialogOpen={setDialogOpen}
        />
      )}

      {/* Search Results - Always show, even with command output */}
      <div className="py-0">
        {results.map((result, index) => (
          <div
            key={`${result.resourceType}-${result.namespace}-${result.resourceName}-${index}`}
            className={`flex items-center px-4 py-2 cursor-pointer ${isResourceMode && activeIndex === index
              ? 'bg-blue-100 dark:bg-gray-800/50'
              : isResourceMode
                ? 'hover:bg-gray-200 dark:hover:bg-gray-800/20'
                : 'bg-transparent hover:bg-gray-200 dark:hover:bg-gray-800/20'
              }`}
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
                {/* Show keyboard hints only in resource mode when active and no command output */}
                {isResourceMode && activeIndex === index && !commandOutput && (
                  <div className="ml-auto flex items-center gap-2 text-xs text-gray-500">
                    <span className="bg-gray-300 dark:bg-gray-700 px-1.5 py-0.5 rounded">D</span>
                    <span>describe</span>
                    <span className="bg-gray-300 dark:bg-gray-700 px-1.5 py-0.5 rounded">V</span>
                    <span>view</span>
                  </div>
                )}
                {/* Show escape hint when command output is visible */}
                {isResourceMode && activeIndex === index && commandOutput && (
                  <div className="ml-auto flex items-center gap-2 text-xs text-gray-500">
                    <span className="bg-gray-300 dark:bg-gray-700 px-1.5 py-0.5 rounded">F</span>
                    <span>fullscreen</span>
                    <span className="bg-gray-300 dark:bg-gray-700 px-1.5 py-0.5 rounded">Esc</span>
                    <span>close output</span>
                  </div>
                )}
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
    </>
  );
};

export default SearchResults;