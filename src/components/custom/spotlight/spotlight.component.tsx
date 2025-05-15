import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Search, ChartColumnBig, FileText } from 'lucide-react';
import { useSpotlight } from '@/contexts/useSpotlight';
import { debounce } from 'lodash';
import { Separator } from "@/components/ui/separator";
import { ExecuteCommand } from '@/api/internal/execute';
import { ExecutionResult, KubeContext } from "@/types/cluster";
import { motion, AnimatePresence } from 'framer-motion';

import SpotlightSuggestion from '../spotlightsuggestion/spotlightsuggestion.component';
import ExplorerSuggestion from '../explorersuggestion/explorersuggestion.component';
// import MonitorSpotlight from '../monitorspotlight/monitorspotlight.component';
// import CommandSuggestions from '../commandsuggestion/commandsuggestion.component';
import { ExplorerSuggestionsConstant } from '@/constants/suggestion.contants';
import { CommandSuggestionsConstants } from '@/constants/command-suggestion.constant';
import CommandSpotlight from '../commandspotlight/commandspotlight.component';
import CommandOutputSpotlight from '../commandoutputspotlight/commandoutputspotlight.command';
import SearchResults from '../searchResult/searchresult.component';
import { SYSTEM_SUGGESTIONS } from '@/constants/system-suggestion.constant';
import { kubeShortcuts, kubeResourceShortcuts, contextShortcuts } from '@/constants/spotlight-shortcuts.constant';
import { useCluster } from '@/contexts/clusterContext';
import ContextSwitcher from '../contextswitcher/contextswitcher.component';

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
    
    // Check if there's a match for the context shortcut
    if (contextShortcuts.shortcut.toLowerCase() === queryLower || 
        "context".toLowerCase().includes(queryLower) || 
        "contexts".toLowerCase().includes(queryLower)) {
      setMatchingResource(null); // Clear any resource matches
      // We'll handle context mode separately
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

    // Set showSearchResults when there's a query and it's not in chart mode
    if (query && !chartSelected && !resourceMode && !contextMode) {
      setShowSearchResults(true);
    } else {
      setShowSearchResults(false);
    }

    if (!query) {
      setCommandOutput(null);
    }
  }, [query, debouncedSearch, chartSelected, resourceMode, contextMode]);

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
    }
  }, [isOpen]);

  const toggleChart = () => {
    setChartSelected(!chartSelected);
  };

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
  const handleKeyDown = useCallback((e: KeyboardEvent): void => {
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
        } else if (e.code === 'Backspace' && resourceQuery === '') {
          // If backspace is pressed when the resource query is empty, exit resource search mode
          e.preventDefault();
          setResourceMode(false);
          setActiveResource(null);
          setResourceQuery('');
          setQuery('');
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
        }
      }
    }
  }, [isOpen, matchingResource, resourceMode, activeResource, resourceQuery, handleCommandExecution, contextMode, filteredContexts, contexts, debouncedQuery, activeResourceIndex, setCurrentContext]);

  // Set up keyboard event listeners
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Handle changes to the input field
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    if (resourceMode) {
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
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-60">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-xs" onClick={onClose} />
      <AnimatePresence>
        <motion.div
          className="relative w-full max-w-3xl bg-gray-100 dark:bg-[#1B1C26]/70 backdrop-blur-md rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700/30 overflow-hidden"
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
              ) : null}

              <input
                ref={inputRef}
                type="text"
                value={contextMode ? contextQuery : resourceMode ? resourceQuery : query}
                onChange={handleInputChange}
                placeholder={
                  contextMode
                    ? `Search contexts...`
                    : resourceMode
                      ? `Search ${activeResource?.title}...`
                      : "Kube Spotlight Search"
                }
                className="w-full p-2 text-gray-900 dark:text-gray-100 placeholder-gray-600 bg-transparent border-none focus:outline-none focus:ring-0"
                autoComplete="off"
              />

              {/* Match description and Tab button */}
              {!contextMode && !resourceMode && (
                <div className="absolute right-0 text-gray-600 dark:text-gray-400 text-sm flex items-center">
                  {isContextMatch ? (
                    <>
                      <span>{contextShortcuts.description}</span>
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

            {/* <button
              onClick={toggleChart}
              className={`p-2 rounded-[0.3rem] transition-colors duration-200 cursor-pointer ${chartSelected
                ? 'bg-gray-300/70 dark:bg-gray-600/30 text-gray-600 dark:text-gray-400'
                : 'text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-200/20'
              }`}
            >
              <ChartColumnBig className="w-4 h-4" />
            </button> */}
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
              />
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
          {showSuggestions && filteredCommandSuggestions.length > 0 && !resourceMode && !contextMode && (
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
          {!chartSelected && showSuggestions && filteredExplorerSuggestions.length > 0 && !resourceMode && !contextMode && (
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

          {/* Natural Language Command Suggestions */}
          {/* {showSuggestions && query && !chartSelected && !resourceMode && !contextMode && (
            <>
              <div className="py-1">
                <div className="">
                  <CommandSuggestions
                    query={query}
                    onCommandSelect={handleCommandExecution}
                  />
                </div>
              </div>
            </>
          )} */}

          {/* System Suggestions Section */}
          {showSuggestions && filteredSuggestions.length > 0 && !resourceMode && !contextMode && (
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