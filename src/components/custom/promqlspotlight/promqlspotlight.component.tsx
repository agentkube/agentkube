import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Crosshair, Database, Settings, Settings2, Loader2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePromQL } from '@/contexts/usePromQL';
import { useCluster } from '@/contexts/clusterContext';
import { kubeProxyRequest } from '@/api/cluster';
import { PROMETHEUS } from '@/assets';

interface PrometheusMetadata {
  [key: string]: Array<{
    type: string;
    unit: string;
    help: string;
  }>;
}

interface PrometheusTarget {
  activeTargets: Array<{
    discoveredLabels: Record<string, string>;
    labels: Record<string, string>;
    scrapePool: string;
    scrapeUrl: string;
    globalUrl: string;
    lastError: string;
    lastScrape: string;
    lastScrapeDuration: number;
    health: string;
  }>;
  droppedTargets: Array<{
    discoveredLabels: Record<string, string>;
  }>;
}

interface QueryResult {
  status: string;
  data: {
    resultType: string;
    result: Array<{
      metric: Record<string, string>;
      value?: [number, string];
      values?: Array<[number, string]>;
    }>;
  };
  error?: string;
}

const PromQLSpotlight: React.FC = () => {
  const { isOpen, query, setQuery, onClose } = usePromQL();
  const { currentContext } = useCluster();
  const inputRef = useRef<HTMLInputElement>(null);

  // State management
  const [enterPressed, setEnterPressed] = useState(false);
  const [tabPressed, setTabPressed] = useState(false);
  const [promqlMode, setPromqlMode] = useState(false);
  const [promqlQuery, setPromqlQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Add this with your other state declarations
  const [visibleResultsCount, setVisibleResultsCount] = useState(10);
  const [metadata, setMetadata] = useState<PrometheusMetadata>({});
  const [targets, setTargets] = useState<PrometheusTarget | null>(null);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // Monitoring configuration
  const [monitoringConfig, setMonitoringConfig] = useState<{
    namespace: string;
    service: string;
  }>({
    namespace: 'monitoring',
    service: 'prometheus:9090'
  });

  // Load monitoring configuration from localStorage
  const loadMonitoringConfig = useCallback(() => {
    if (!currentContext) return;

    try {
      const savedConfig = localStorage.getItem(`${currentContext.name}.monitoringConfig`);
      if (savedConfig) {
        const parsedConfig = JSON.parse(savedConfig);
        if (parsedConfig.externalConfig?.monitoring) {
          setMonitoringConfig(parsedConfig.externalConfig.monitoring);
        }
      }
    } catch (err) {
      console.error('Error loading saved monitoring config:', err);
    }
  }, [currentContext]);

  // Fetch Prometheus metadata
  const fetchMetadata = useCallback(async () => {
    if (!currentContext || !monitoringConfig.namespace || !monitoringConfig.service) return;

    try {
      setIsLoading(true);
      setError(null);

      const servicePath = `api/v1/namespaces/${monitoringConfig.namespace}/services/${monitoringConfig.service}/proxy/api/v1/metadata`;
      const metadataResponse = await kubeProxyRequest(currentContext.name, servicePath, 'GET');

      if (metadataResponse.status === 'success') {
        setMetadata(metadataResponse.data);
        // Extract metric names for suggestions
        const metricNames = Object.keys(metadataResponse.data);
        setSuggestions(metricNames.slice(0, 20)); // Limit to first 20 for performance
      }
    } catch (err) {
      console.error('Error fetching Prometheus metadata:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch metadata');
    } finally {
      setIsLoading(false);
    }
  }, [currentContext, monitoringConfig]);

  // Fetch Prometheus targets
  const fetchTargets = useCallback(async () => {
    if (!currentContext || !monitoringConfig.namespace || !monitoringConfig.service) return;

    try {
      const servicePath = `api/v1/namespaces/${monitoringConfig.namespace}/services/${monitoringConfig.service}/proxy/api/v1/targets`;
      const targetsResponse = await kubeProxyRequest(currentContext.name, servicePath, 'GET');

      if (targetsResponse.status === 'success') {
        setTargets(targetsResponse.data);
      }
    } catch (err) {
      console.error('Error fetching Prometheus targets:', err);
    }
  }, [currentContext, monitoringConfig]);

  // Execute PromQL query
  const executeQuery = useCallback(async (queryString: string) => {
    if (!currentContext || !monitoringConfig.namespace || !monitoringConfig.service || !queryString.trim()) return;

    try {
      setIsLoading(true);
      setError(null);

      const servicePath = `api/v1/namespaces/${monitoringConfig.namespace}/services/${monitoringConfig.service}/proxy/api/v1/query`;
      const params = new URLSearchParams({ query: queryString.trim() });
      const queryResponse = await kubeProxyRequest(currentContext.name, `${servicePath}?${params}`, 'GET');

      setQueryResult(queryResponse);
      setVisibleResultsCount(10);

      if (queryResponse.status !== 'success') {
        setError(queryResponse.error || 'Query execution failed');
      }
    } catch (err) {
      console.error('Error executing PromQL query:', err);
      setError(err instanceof Error ? err.message : 'Failed to execute query');
    } finally {
      setIsLoading(false);
    }
  }, [currentContext, monitoringConfig]);

  // Filter suggestions based on current input
  const filteredSuggestions = suggestions.filter(metric =>
    metric.toLowerCase().includes(promqlQuery.toLowerCase())
  ).slice(0, 5);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }

    if (!isOpen) {
      // Clean up when closing
      setPromqlMode(false);
      setPromqlQuery('');
      setQueryResult(null);
      setError(null);
      setVisibleResultsCount(10);
    }
  }, [isOpen]);

  const showMoreResults = () => {
    setVisibleResultsCount(prev => Math.min(prev + 10, queryResult?.data?.result?.length || 0));
  };

  useEffect(() => {
    if (isOpen && currentContext) {
      loadMonitoringConfig();
    }
  }, [isOpen, currentContext, loadMonitoringConfig]);

  useEffect(() => {
    if (isOpen && currentContext && monitoringConfig.namespace && monitoringConfig.service) {
      fetchMetadata();
    }
  }, [isOpen, currentContext, monitoringConfig, fetchMetadata]);

  // Handle keyboard navigation and selection
  const handleKeyDown = useCallback((e: KeyboardEvent): void => {
    if (isOpen) {
      if (promqlMode) {
        if (e.code === 'Enter') {
          e.preventDefault();
          if (promqlQuery.trim()) {
            executeQuery(promqlQuery);
            // Animation for enter press
            setEnterPressed(true);
            setTimeout(() => {
              setEnterPressed(false);
            }, 300);
          }
        } else if (e.code === 'Backspace' && promqlQuery === '') {
          // If backspace is pressed when the promql query is empty, exit promql mode
          e.preventDefault();
          setPromqlMode(false);
          setPromqlQuery('');
          setQuery('');
          setQueryResult(null);
          setError(null);
        }
      } else {
        // Normal mode - check for Tab to enter PromQL mode
        if (e.code === 'Tab') {
          e.preventDefault();
          // Enter PromQL mode
          setPromqlMode(true);
          setPromqlQuery('');

          // Animation for tab press
          setTabPressed(true);
          setTimeout(() => {
            setTabPressed(false);
          }, 300);
        }
      }
    }
  }, [isOpen, promqlMode, promqlQuery, setQuery, executeQuery]);

  // Set up keyboard event listeners
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Handle input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (promqlMode) {
      setPromqlQuery(e.target.value);
    } else {
      setQuery(e.target.value);
    }
  };

  // Handle suggestion click
  const handleSuggestionClick = (suggestion: string) => {
    setPromqlQuery(suggestion);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-60">
      <div className="absolute inset-0 dark:bg-gray-800/20 backdrop-blur-sm" onClick={onClose} />
      <AnimatePresence>
        <motion.div
          className="relative w-full max-w-4xl bg-gray-100 dark:bg-[#1B1C26]/90 backdrop-blur-md rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700/30 overflow-hidden"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{
            scale: tabPressed || enterPressed ? [1, 1.03, 1] : 1,
            opacity: 1,
            boxShadow: tabPressed || enterPressed
              ? ["0px 0px 0px rgba(0, 0, 0, 0)",
                "0px 0px 30px rgba(236, 72, 72, 0.6)",
                "0px 0px 15px rgba(236, 72, 72, 0.78)"]
              : "0px 0px 0px rgba(0, 0, 0, 0)",
            transition: {
              duration: 0.3,
              damping: 25,
              bounce: 0.5,
              ease: "easeOut",
              boxShadow: {
                delay: 0.05,
                duration: 0.4,
                times: [0, 0.6, 1]
              }
            }
          }}
          exit={{
            scale: 0.95,
            opacity: 0,
            boxShadow: "0px 0px 0px rgba(0, 0, 0, 0)",
            transition: {
              duration: 0.2
            }
          }}
        >
          {/* Search Input */}
          <div className="flex items-center justify-between py-1 px-4 text-2xl">
            <div className="flex items-center flex-grow relative">
              <div>
                <img src={PROMETHEUS} className='w-7 ' alt="" />
              </div>

              {/* PromQL Badge - only show in PromQL mode */}
              {promqlMode && (
                <motion.div
                  className="flex items-center px-1 ml-2"
                  initial={false}
                  animate={{
                    scale: tabPressed || enterPressed ? [1, 1.1, 1] : 1,
                    transition: {
                      duration: 0.3,
                      ease: "easeOut"
                    }
                  }}
                >
                  <span className="font-medium text-sm text-white bg-[#de4940] px-2 py-1 rounded-[0.3rem]">
                    PromQL
                  </span>
                  {isLoading && (
                    <Loader2 className="ml-2 h-4 w-4 animate-spin text-gray-500" />
                  )}
                </motion.div>
              )}

              <input
                ref={inputRef}
                type="text"
                value={promqlMode ? promqlQuery : query}
                onChange={handleInputChange}
                placeholder={
                  promqlMode
                    ? "Enter PromQL query..."
                    : "Search for Prometheus queries..."
                }
                className={`w-full p-2 text-gray-900 dark:text-gray-100 placeholder-gray-600 bg-transparent border-none focus:outline-none focus:ring-0 ${promqlMode ? 'font-mono' : ''
                  }`}
                autoComplete="off"
              />

              {/* Query hint */}
              <div className="absolute right-0 text-gray-600 dark:text-gray-400 text-sm flex items-center">
                {!promqlMode ? (
                  <>
                    <span>PromQL mode</span>
                    <div className="bg-gray-200 dark:bg-gray-700/40 rounded px-1.5 py-0.5 ml-2 flex items-center">
                      <span>Tab</span>
                    </div>
                  </>
                ) : (
                  <>
                    <span>Execute query</span>
                    <div className="bg-gray-200 dark:bg-gray-700/40 rounded px-1.5 py-0.5 ml-2 flex items-center">
                      <span>Enter</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Suggestions dropdown */}
          {promqlMode && promqlQuery && filteredSuggestions.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700/30">
              <div className="flex flex-wrap gap-2">
                {filteredSuggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="px-2 py-1 bg-gray-200 dark:bg-gray-700/40 rounded text-xs hover:bg-gray-300 dark:hover:bg-gray-600/40 font-mono"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Query results */}
          {promqlMode && queryResult && (
            <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700/30 max-h-64 
  overflow-y-auto py-1 
  scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent
  [&::-webkit-scrollbar]:w-1.5 
  [&::-webkit-scrollbar-track]:bg-transparent 
  [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
  [&::-webkit-scrollbar-thumb]:rounded-full
  [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                Query Results ({queryResult.data?.result?.length || 0} series)
              </div>
              {queryResult.status === 'success' && queryResult.data?.result ? (
                <div className="space-y-2">
                  {queryResult.data.result.slice(0, visibleResultsCount).map((result, index) => (
                    <div key={index} className="bg-gray-200 dark:bg-gray-800/50 rounded p-2 text-xs">
                      <div className="font-mono text-blue-600 dark:text-blue-400">
                        {Object.entries(result.metric).map(([key, value]) =>
                          `${key}="${value}"`
                        ).join(', ')}
                      </div>
                      {result.value && (
                        <div className="text-green-600 dark:text-green-400 mt-1">
                          Value: {result.value[1]} @ {new Date(result.value[0] * 1000).toLocaleString()}
                        </div>
                      )}
                    </div>
                  ))}
                  {queryResult.data.result.length > visibleResultsCount && (
                    <div className="text-center">
                      <button
                        onClick={showMoreResults}
                        className="text-xs text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 underline"
                      >
                        Show {Math.min(10, queryResult.data.result.length - visibleResultsCount)} more results
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-red-500 text-sm">
                  {queryResult.error || 'No results found'}
                </div>
              )}
            </div>
          )}

          {/* Status line */}
          {promqlMode && (
            <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700/30">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {promqlQuery ? (
                  <span>Ready to execute: <code className="font-mono bg-gray-200 dark:bg-gray-800/50 px-1 rounded">{promqlQuery}</code></span>
                ) : (
                  <span>Type a PromQL query and press Enter to execute</span>
                )}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className='bg-gray-200/80 dark:bg-gray-500/10 text-gray-500 dark:text-gray-500 py-1 px-4 text-xs flex justify-between items-center'>
            <div className='flex items-center space-x-1'>
              <button
                onClick={fetchTargets}
                className='flex items-center space-x-2 hover:bg-gray-400/10 py-1 px-2 rounded'
              >
                <Crosshair className='h-3 w-3' />
                <span>Targets ({targets?.activeTargets?.length || 0})</span>
              </button>
              <button
                onClick={fetchMetadata}
                className='flex items-center space-x-2 hover:bg-gray-400/10 py-1 px-2 rounded'
              >
                <Database className='h-3 w-3' />
                <span>Metrics ({Object.keys(metadata).length})</span>
              </button>
            </div>

            <div className='flex items-center'>
              {promqlMode ? (
                <>
                  <div className="bg-gray-300 dark:bg-gray-700/40 rounded px-1.5 py-0.5 mr-1 flex items-center">
                    <span>Enter</span>
                  </div>
                  <span className='mr-4'>execute</span>
                  <div className="bg-gray-300 dark:bg-gray-700/40 rounded px-1.5 py-0.5 mr-1 flex items-center">
                    <span>Backspace</span>
                  </div>
                  <span className='mr-4'>exit PromQL mode</span>
                </>
              ) : (
                <>
                  <div className="bg-gray-300 dark:bg-gray-700/40 rounded px-1.5 py-0.5 mr-1 flex items-center">
                    <span>Tab</span>
                  </div>
                  <span className='mr-4'>PromQL mode</span>
                </>
              )}
              <div className="bg-gray-300 dark:bg-gray-700/40 rounded px-1.5 py-0.5 mr-1 flex items-center">
                <span>Esc</span>
              </div>
              <span className=''>
                close
              </span>
            </div>
          </div>

        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default PromQLSpotlight;