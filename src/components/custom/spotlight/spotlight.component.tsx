import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Search, ChevronDown, ChevronUp } from 'lucide-react';
import { useSpotlight } from '@/contexts/useSpotlight';
import { debounce } from 'lodash';
import { Separator } from "@/components/ui/separator";
import { ExecuteCommand } from '@/api/internal/execute';
import { ExecutionResult, KubeContext } from "@/types/cluster";
import { motion, AnimatePresence } from 'framer-motion';

import { ExplorerSuggestionsConstant } from '@/constants/suggestion.contants';
import { CommandSuggestionsConstants } from '@/constants/command-suggestion.constant';
import { SYSTEM_SUGGESTIONS } from '@/constants/system-suggestion.constant';
import { kubeShortcuts, kubeResourceShortcuts, contextShortcuts } from '@/constants/spotlight-shortcuts.constant';
import { getMcpConfig, updateMcpConfig } from '@/api/settings';
import { mcpShortcuts } from '@/constants/spotlight-shortcuts.constant';
import { useCluster } from '@/contexts/clusterContext';
import SpotlightSuggestion from '../spotlightsuggestion/spotlightsuggestion.component';
import ExplorerSuggestion from '../explorersuggestion/explorersuggestion.component';
import CommandSpotlight from '../commandspotlight/commandspotlight.component';
import CommandOutputSpotlight from '../commandoutputspotlight/commandoutputspotlight.command';
import SearchResults from '../searchResult/searchresult.component';
import MCPServerSpotlight from '../mcpspotlight/mcpspotlight.component';
import ContextSwitcher from '../contextswitcher/contextswitcher.component';
import { parseSearchQuery } from '@/utils/spotlight.utils';

const Spotlight: React.FC = () => {
  const { isOpen, query, setQuery, onClose } = useSpotlight();
  const { currentContext, setCurrentContext, contexts } = useCluster();
  const inputRef = useRef<HTMLInputElement>(null);
  const [chartSelected, setChartSelected] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [commandOutput, setCommandOutput] = useState<ExecutionResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [matchingResource, setMatchingResource] = useState<kubeResourceShortcuts | null>(null);
  const [activeResourceIndex, setActiveResourceIndex] = useState<number>(0);
  const [activeResource, setActiveResource] = useState<kubeResourceShortcuts | null>(null);
  const [resourceMode, setResourceMode] = useState<boolean>(false);
  const [resourceQuery, setResourceQuery] = useState<string>('');
  const [tabPressed, setTabPressed] = useState<boolean>(false);
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  const [contextMode, setContextMode] = useState<boolean>(false);
  const [contextQuery, setContextQuery] = useState<string>('');
  const [filteredContexts, setFilteredContexts] = useState<KubeContext[]>([]);
  const [searchResultsCount, setSearchResultsCount] = useState<number>(0);

  const [mcpMode, setMcpMode] = useState<boolean>(false);
  const [mcpQuery, setMcpQuery] = useState<string>('');
  const [mcpServers, setMcpServers] = useState<any[]>([]);
  const [filteredMcpServers, setFilteredMcpServers] = useState<any[]>([]);

  // Debounced search handler for suggestions
  const debouncedSearch = useCallback(
    debounce((searchQuery: string) => {
      setDebouncedQuery(searchQuery);
      setShowSuggestions(searchQuery.length > 0);
    }, 300),
    []
  );

  // Check if search term matches the context shortcut
  useEffect(() => {
    if (debouncedQuery.trim() === '') {
      return;
    }

    const queryLower = debouncedQuery.toLowerCase();

    // Check for MCP shortcut
    if (mcpShortcuts.shortcut.toLowerCase() === queryLower ||
      "mcp".toLowerCase().includes(queryLower)) {
      setMatchingResource(null);
    }

    // Check if there's a match for the context shortcut
    if (contextShortcuts.shortcut.toLowerCase() === queryLower ||
      "context".toLowerCase().includes(queryLower) ||
      "contexts".toLowerCase().includes(queryLower)) {
      setMatchingResource(null); // Clear any resource matches
    }
  }, [debouncedQuery]);

  // Check if search term matches any Kubernetes resource shortcuts
  useEffect(() => {
    if (debouncedQuery.trim() === '') {
      setMatchingResource(null);
      return;
    }

    const queryLower = debouncedQuery.toLowerCase();

    // First check if there's an exact match for any resource shortcut
    const exactMatch = kubeShortcuts.find(resource =>
      resource.shortcut.toLowerCase() === queryLower
    );

    if (exactMatch) {
      setMatchingResource(exactMatch);
      return;
    }

    // If no exact match, check for partial matches
    const partialMatch = kubeShortcuts.find(resource =>
      resource.shortcut.toLowerCase().includes(queryLower) ||
      resource.title.toLowerCase().includes(queryLower)
    );

    setMatchingResource(partialMatch || null);
    setActiveResourceIndex(0);

  }, [debouncedQuery]);

  useEffect(() => {
    debouncedSearch(query);

    const { cleanQuery } = parseSearchQuery(query);

    // Set showSearchResults when there's a query and it's not in chart mode
    if ((cleanQuery || query.includes('@')) && !chartSelected && !resourceMode && !contextMode && !mcpMode) {
      setShowSearchResults(true);
    } else {
      setShowSearchResults(false);
    }

    if (!query) {
      setCommandOutput(null);
    }
  }, [query, debouncedSearch, chartSelected, resourceMode, contextMode, mcpMode]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }

    if (!isOpen) {
      setShowSuggestions(false);
      setChartSelected(false);
      setCommandOutput(null);
      setShowSearchResults(false);
      setResourceMode(false);
      setActiveResource(null);
      setResourceQuery('');
      setContextMode(false);
      setContextQuery('');
      setMcpMode(false);
      setMcpQuery('');
    }
  }, [isOpen]);

  useEffect(() => {
    const fetchMcpServers = async () => {
      try {
        const mcpConfig = await getMcpConfig();
        const serversArray = Object.entries(mcpConfig.mcpServers || {}).map(([name, config]: [string, any]) => ({
          name,
          ...config
        }));
        setMcpServers(serversArray);
        setFilteredMcpServers(serversArray);
      } catch (error) {
        console.error('Failed to fetch MCP servers:', error);
      }
    };

    if (isOpen) {
      fetchMcpServers();
    }
  }, [isOpen]);


  const handleCommandExecution = async (command: string) => {
    setCommandOutput(null);
    setIsExecuting(true);
    if (!currentContext) return;
    try {
      const result = await ExecuteCommand(
        command,
        currentContext.name
      );
      setCommandOutput(result);
    } catch (error) {
      console.error('Failed to execute command:', error);
      setCommandOutput({
        command: command,
        output: 'Failed to execute command: ' + (error as Error).message,
        success: false
      });
    } finally {
      setIsExecuting(false);
    }
  };

  // Handle keyboard navigation and selection
  const handleKeyDown = useCallback(async (e: KeyboardEvent): Promise<void> => {
    if (isOpen) {
      if (contextMode) {
        if (e.code === 'Enter' && filteredContexts.length > 0) {
          e.preventDefault();
          // Switch to the selected context
          const selectedContext = filteredContexts[activeResourceIndex];
          setCurrentContext(selectedContext);

          // Reset after execution
          setContextMode(false);
          setContextQuery('');
          onClose();
        } else if (e.code === 'Backspace' && contextQuery === '') {
          // If backspace is pressed when the context query is empty, exit context mode
          e.preventDefault();
          setContextMode(false);
          setContextQuery('');
          setQuery('');
        } else if (e.code === 'ArrowDown') {
          e.preventDefault();
          setActiveResourceIndex(prev =>
            prev < filteredContexts.length - 1 ? prev + 1 : prev
          );
        } else if (e.code === 'ArrowUp') {
          e.preventDefault();
          setActiveResourceIndex(prev => prev > 0 ? prev - 1 : 0);
        }

      } else if (mcpMode) {
        if (e.code === 'Enter' && filteredMcpServers.length > 0) {
          e.preventDefault();
          const selectedServer = filteredMcpServers[activeResourceIndex];
          console.log('Selected MCP server:', selectedServer);
          setMcpMode(false);
          setMcpQuery('');
          onClose();
        } else if (e.code === 'Backspace' && mcpQuery === '') {
          e.preventDefault();
          setMcpMode(false);
          setMcpQuery('');
          setQuery('');
        } else if (e.code === 'ArrowDown') {
          e.preventDefault();
          setActiveResourceIndex(prev =>
            prev < filteredMcpServers.length - 1 ? prev + 1 : prev
          );
        } else if (e.code === 'ArrowUp') {
          e.preventDefault();
          setActiveResourceIndex(prev => prev > 0 ? prev - 1 : 0);
        }
      } else if (resourceMode) {
        if (e.code === 'Enter' && activeResource) {
          e.preventDefault();
          // Handle resource query execution
          const resourceCommand = `kubectl get ${activeResource.shortcut} ${resourceQuery ? `-o=wide | grep ${resourceQuery}` : ''}`;
          handleCommandExecution(resourceCommand);

          // Reset after execution
          setResourceMode(false);
          setActiveResource(null);
          setResourceQuery('');
          setActiveResourceIndex(0); // Reset index
        } else if (e.code === 'Backspace' && resourceQuery === '') {
          // If backspace is pressed when the resource query is empty, exit resource search mode
          e.preventDefault();
          setResourceMode(false);
          setActiveResource(null);
          setResourceQuery('');
          setQuery('');
          setActiveResourceIndex(0); // Reset index
        } else if (e.code === 'ArrowDown') {
          e.preventDefault();
          setActiveResourceIndex(prev =>
            prev < searchResultsCount - 1 ? prev + 1 : prev
          );
        } else if (e.code === 'ArrowUp') {
          e.preventDefault();
          setActiveResourceIndex(prev => prev > 0 ? prev - 1 : 0);
        }
      } else {

        // Check for context shortcut
        const isContextMatch =
          debouncedQuery.toLowerCase() === contextShortcuts.shortcut.toLowerCase() ||
          "context".toLowerCase().includes(debouncedQuery.toLowerCase()) ||
          "contexts".toLowerCase().includes(debouncedQuery.toLowerCase());

        if ((e.code === 'Tab' || e.code === 'Enter') && isContextMatch) {
          e.preventDefault();
          // Enter context search mode
          setContextMode(true);
          setContextQuery('');
          setFilteredContexts(contexts);
          setActiveResourceIndex(0);

          // Animation for tab press
          setTabPressed(true);
          setTimeout(() => {
            setTabPressed(false);
          }, 300);
        }
        // Resource shortcut handling
        else if (e.code === 'Tab' && matchingResource) {
          e.preventDefault();
          // Enter resource search mode with matching resource
          setActiveResource(matchingResource);
          setResourceMode(true);
          setResourceQuery('');

          // Animation for tab press
          setTabPressed(true);
          setTimeout(() => {
            setTabPressed(false);
          }, 300);
        } else if (e.code === 'Enter' && matchingResource) {
          e.preventDefault();
          // Enter resource search mode with matching resource
          setActiveResource(matchingResource);
          setResourceMode(true);
          setResourceQuery('');

          // Animation for enter press (same as tab)
          setTabPressed(true);
          setTimeout(() => {
            setTabPressed(false);
          }, 300);
        } else {
          // Check for MCP shortcut
          const isMcpMatch = debouncedQuery.toLowerCase() === mcpShortcuts.shortcut.toLowerCase() ||
            "mcp".toLowerCase().includes(debouncedQuery.toLowerCase());

          if ((e.code === 'Tab' || e.code === 'Enter') && isMcpMatch) {
            e.preventDefault();
            setMcpMode(true);
            setMcpQuery('');
            setActiveResourceIndex(0);
            setTabPressed(true);
            setTimeout(() => setTabPressed(false), 300);

            // Refetch MCP servers when entering MCP mode
            await refetchMcpServers();
          }
        }
      }
    }
  }, [isOpen, matchingResource, resourceMode, activeResource, resourceQuery, handleCommandExecution, contextMode, filteredContexts, contexts, debouncedQuery, activeResourceIndex, setCurrentContext, mcpMode, mcpQuery, filteredMcpServers, mcpServers]);


  const refetchMcpServers = async () => {
    try {
      const mcpConfig = await getMcpConfig();
      const serversArray = Object.entries(mcpConfig.mcpServers || {}).map(([name, config]: [string, any]) => ({
        name,
        ...config
      }));
      setMcpServers(serversArray);
      setFilteredMcpServers(serversArray);
    } catch (error) {
      console.error('Failed to refetch MCP servers:', error);
    }
  };

  const handleMcpServerToggle = async (serverName: string, enabled: boolean) => {
    const updateLocalState = (newEnabled: boolean) => {
      setMcpServers(prev =>
        prev.map(server =>
          server.name === serverName
            ? { ...server, enabled: newEnabled }
            : server
        )
      );

      setFilteredMcpServers(prev =>
        prev.map(server =>
          server.name === serverName
            ? { ...server, enabled: newEnabled }
            : server
        )
      );
    };

    // Update UI immediately for instant visual feedback
    updateLocalState(enabled);

    // Handle backend update in the background
    try {
      const currentConfig = await getMcpConfig();

      const updatedConfig = {
        ...currentConfig,
        mcpServers: {
          ...currentConfig.mcpServers,
          [serverName]: {
            ...currentConfig.mcpServers[serverName],
            enabled: enabled
          }
        }
      };

      await updateMcpConfig(updatedConfig);
    } catch (error) {
      console.error('Failed to toggle MCP server:', error);

      updateLocalState(!enabled);
    }
  };

  // Set up keyboard event listeners
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Handle changes to the input field
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    if (mcpMode) {
      setMcpQuery(e.target.value);
      const filtered = mcpServers.filter(server =>
        server.name.toLowerCase().includes(e.target.value.toLowerCase())
      );
      setFilteredMcpServers(filtered);
    } else if (resourceMode) {
      setResourceQuery(e.target.value);
    } else if (contextMode) {
      setContextQuery(e.target.value);
      // Filter contexts based on query
      const filtered = contexts.filter(ctx =>
        ctx.name.toLowerCase().includes(e.target.value.toLowerCase())
      );
      setFilteredContexts(filtered);
    } else {
      setQuery(e.target.value);
    }
  };

  if (!isOpen) return null;

  // Is context match check
  const isContextMatch =
    debouncedQuery.toLowerCase() === contextShortcuts.shortcut.toLowerCase() ||
    "context".toLowerCase().includes(debouncedQuery.toLowerCase()) ||
    "contexts".toLowerCase().includes(debouncedQuery.toLowerCase());

  // Filter and limit suggestions to 5
  const filteredSuggestions = SYSTEM_SUGGESTIONS.filter(suggestion =>
    query && (
      suggestion.title.toLowerCase().includes(query.toLowerCase()) ||
      suggestion.description.toLowerCase().includes(query.toLowerCase())
    )
  ).slice(0, 5);

  // Filter and limit explorer suggestions to 3
  const filteredCommandSuggestions = CommandSuggestionsConstants.filter(suggestion =>
    query && (
      suggestion.command.toLowerCase().includes(query.toLowerCase())
    )
  ).slice(0, 3);

  const filteredExplorerSuggestions = ExplorerSuggestionsConstant.filter(suggestion =>
    query && (
      suggestion.title.toLowerCase().includes(query.toLowerCase()) ||
      suggestion.description.toLowerCase().includes(query.toLowerCase())
    )
  ).slice(0, 3);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-40">
      <div className="absolute inset-0 dark:bg-gray-900/30 backdrop-blur-sm" onClick={onClose} />
      <AnimatePresence>
        <motion.div
          className="relative w-full max-w-3xl bg-gray-100 dark:bg-[#1B1C26]/80 backdrop-blur-md rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700/30 overflow-hidden"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{
            scale: tabPressed ? [1, 1.03, 1] : 1,
            opacity: 1,
            boxShadow: tabPressed
              ? ["0px 0px 0px rgba(0, 0, 0, 0)",
                contextMode
                  ? `0px 0px 30px ${contextShortcuts.color}`
                  : activeResource
                    ? `0px 0px 30px ${activeResource.color}`
                    : matchingResource
                      ? `0px 0px 30px ${matchingResource.color}`
                      : isContextMatch
                        ? `0px 0px 30px ${contextShortcuts.color}`
                        : "0px 0px 30px rgba(59, 130, 246, 0.6)",
                contextMode
                  ? `0px 0px 15px ${contextShortcuts.color}`
                  : activeResource
                    ? `0px 0px 15px ${activeResource.color}`
                    : matchingResource
                      ? `0px 0px 15px ${matchingResource.color}`
                      : isContextMatch
                        ? `0px 0px 15px ${contextShortcuts.color}`
                        : "0px 0px 15px rgba(59, 130, 246, 0.4)"]
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
                <Search className="w-5 h-5 text-gray-400" />
              </div>

              {/* Context or Resource search mode badge */}
              {contextMode ? (
                <motion.div
                  className="flex items-center px-1 ml-2"
                  initial={false}
                  animate={{
                    scale: tabPressed ? [1, 1.1, 1] : 1,
                    transition: {
                      duration: 0.3,
                      ease: "easeOut"
                    }
                  }}
                >
                  <span className="font-medium text-sm text-white bg-blue-500 px-2 py-1 rounded-[0.3rem]" style={{
                    backgroundColor: contextShortcuts.color.replace('0.6', '1')
                  }}>
                    {contextShortcuts.title}
                  </span>
                </motion.div>
              ) : resourceMode ? (
                <motion.div
                  className="flex items-center px-1 ml-2"
                  initial={false}
                  animate={{
                    scale: tabPressed ? [1, 1.1, 1] : 1,
                    transition: {
                      duration: 0.3,
                      ease: "easeOut"
                    }
                  }}
                >
                  <span className="font-medium text-sm text-white bg-blue-500 px-2 py-1 rounded-[0.3rem]" style={{
                    backgroundColor: activeResource ? activeResource.color.replace('0.6', '1') : 'rgba(59, 130, 246, 1)'
                  }}>
                    {activeResource?.title}
                  </span>
                </motion.div>
              ) : mcpMode ? (
                <motion.div
                  className="flex items-center px-1 ml-2"
                  initial={false}
                  animate={{
                    scale: tabPressed ? [1, 1.1, 1] : 1,
                    transition: { duration: 0.3, ease: "easeOut" }
                  }}
                >
                  <span className="font-medium text-sm text-white bg-purple-500 px-2 py-1 rounded-[0.3rem]">
                    {mcpShortcuts.title}
                  </span>
                </motion.div>
              ) : null}

              <input
                ref={inputRef}
                type="text"
                value={contextMode ? contextQuery : mcpMode ? mcpQuery : resourceMode ? resourceQuery : query}
                onChange={handleInputChange}
                placeholder={
                  contextMode
                    ? `Search contexts...`
                    : mcpMode
                      ? `Search MCP servers...`
                      : resourceMode
                        ? `Search ${activeResource?.title}...`
                        : "Kube Spotlight Search"
                }
                className="w-full p-2 text-gray-900 dark:text-gray-100 placeholder-gray-600 bg-transparent border-none focus:outline-none focus:ring-0"
                autoComplete="off"
              />

              {/* Match description and Tab button */}
              {!contextMode && !resourceMode && !mcpMode && (
                <div className="absolute right-0 text-gray-600 dark:text-gray-400 text-sm flex items-center">
                  {isContextMatch ? (
                    <>
                      <span>{contextShortcuts.description}</span>
                      <div className="bg-gray-200 dark:bg-gray-700/40 rounded px-1.5 py-0.5 ml-2 flex items-center">
                        <span>Tab</span>
                      </div>
                    </>
                  ) : mcpShortcuts.shortcut.toLowerCase() === debouncedQuery.toLowerCase() ||
                    "mcp".toLowerCase().includes(debouncedQuery.toLowerCase()) ? (
                    <>
                      <span>{mcpShortcuts.description}</span>
                      <div className="bg-gray-200 dark:bg-gray-700/40 rounded px-1.5 py-0.5 ml-2 flex items-center">
                        <span>Tab</span>
                      </div>
                    </>
                  ) : matchingResource ? (
                    <>
                      <span>{matchingResource.description}</span>
                      <div className="bg-gray-200 dark:bg-gray-700/40 rounded px-1.5 py-0.5 ml-2 flex items-center">
                        <span>Tab</span>
                      </div>
                    </>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          {/* Command Output Section */}
          {commandOutput && (
            <CommandOutputSpotlight
              output={commandOutput}
              isExecuting={isExecuting}
            />
          )}

          {/* Search Results Section */}
          {showSearchResults && query.length >= 2 && !resourceMode && !contextMode && !commandOutput && (
            <>
              <div className="py-1">
                <div className="px-4">
                  <p className="text-sm mb-1 text-gray-500">Resources</p>
                </div>
                <SearchResults
                  query={query}
                  onResultClick={onClose}
                  limit={3}
                  activeIndex={0}
                  onResultsCountChange={() => { }}
                />
              </div>
            </>
          )}

          {/* Resource Search Results Section */}
          {resourceMode && activeResource && !commandOutput && (
            <>
              <SearchResults
                query={resourceQuery}
                onResultClick={onClose}
                limit={5}
                resourceType={activeResource.resourceType}
                activeIndex={activeResourceIndex}
                onResultsCountChange={setSearchResultsCount}
                isResourceMode={true}
              />
            </>
          )}

          {/* MCP Mode Section */}
          {mcpMode && (
            <>
              <div className="py-1">
                <div className="px-4">
                  <p className="text-sm mb-1 text-gray-500">MCP Servers</p>
                </div>
                <MCPServerSpotlight
                  servers={filteredMcpServers}
                  onServerSelect={(server) => {
                    console.log('Selected server:', server);
                    setMcpMode(false);
                    onClose();
                  }}
                  onToggleEnabled={handleMcpServerToggle}
                  query={mcpQuery}
                  activeIndex={activeResourceIndex}
                />
              </div>
            </>
          )}
          {/* Context Mode Section */}
          {contextMode && (
            <>
              <div className="py-1">
                <div className="px-4">
                  <p className="text-sm mb-1 text-gray-500">Kubernetes Contexts</p>
                </div>
                <ContextSwitcher
                  contexts={contexts}
                  currentContext={currentContext}
                  onContextSelect={(context) => {
                    setCurrentContext(context);
                    setContextMode(false);
                    onClose();
                  }}
                  query={contextQuery}
                  activeIndex={activeResourceIndex}
                />
              </div>
            </>
          )}

          {/* Command Section */}
          {showSuggestions && filteredCommandSuggestions.length > 0 && !resourceMode && !contextMode && !mcpMode && (
            <>
              <div className="py-1">
                <div className="px-4">
                  <p className="text-sm mb-1 text-gray-500">Command</p>
                  <Separator className="bg-gray-200 dark:bg-gray-900/20" />
                </div>
                <div>
                  {filteredCommandSuggestions.map((suggestion, index) => (
                    <CommandSpotlight
                      key={index}
                      command={suggestion.command}
                      onClick={() => handleCommandExecution(suggestion.command)}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Explorer Section */}
          {!chartSelected && showSuggestions && filteredExplorerSuggestions.length > 0 && !resourceMode && !contextMode && !mcpMode && (
            <>
              <div className="py-1">
                <div className="px-4">
                  <p className="text-sm mb-1 text-gray-500">Explorer</p>
                </div>
                <div>
                  {filteredExplorerSuggestions.map((suggestion, index) => (
                    <ExplorerSuggestion
                      key={index}
                      id={suggestion.id}
                      title={suggestion.title}
                      description={suggestion.description}
                      icon={suggestion.icon}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          {/* System Suggestions Section */}
          {showSuggestions && filteredSuggestions.length > 0 && !resourceMode && !contextMode && !mcpMode && (
            <>
              <div className="">
                <div className="px-4">
                  <p className="text-sm mb-1 text-gray-500">System</p>
                </div>
                <div>
                  {filteredSuggestions.map((suggestion, index) => (
                    <SpotlightSuggestion
                      key={index}
                      title={suggestion.title}
                      description={suggestion.description}
                      icon={suggestion.icon}
                      link={suggestion.link}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Escape hint */}
          {(contextMode) && (
            <div className='bg-gray-200/80 dark:bg-gray-500/10 text-gray-500 dark:text-gray-500 py-1 px-4 text-xs flex justify-end items-center'>
              <div className="bg-gray-300 dark:bg-gray-700/40 rounded px-1 py-0.5 mr-1 flex items-center">
                <span><ChevronDown className='h-4 w-4' /></span>
              </div>
              <div className="bg-gray-300 dark:bg-gray-700/40 rounded px-1 py-0.5 mr-1 flex items-center">
                <span><ChevronUp className='h-4 w-4' /></span>
              </div>
              <div className="bg-gray-300 dark:bg-gray-700/40 rounded px-1.5 py-0.5 mr-1 flex items-center">
                <span>Esc</span>
              </div>
              <span className=''>
                to close
              </span>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default Spotlight;