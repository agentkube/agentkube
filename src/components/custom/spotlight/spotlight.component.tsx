import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Search, ChartColumnBig, Settings, Moon } from 'lucide-react';
import { useSpotlight } from '@/contexts/useSpotlight';
import { debounce } from 'lodash';
import { Separator } from "@/components/ui/separator";
import { ExecuteCommand } from '@/api/internal/execute';
import { ExecutionResult } from "@/types/cluster";

import SpotlightSuggestion from '../spotlightsuggestion/spotlightsuggestion.component';
import ExplorerSuggestion from '../explorersuggestion/explorersuggestion.component';
// import MonitorSpotlight from '../monitorspotlight/monitorspotlight.component';
import { ExplorerSuggestionsConstant } from '@/constants/suggestion.contants';
import { CommandSuggestionsConstants } from '@/constants/command-suggestion.constant';
import CommandSpotlight from '../commandspotlight/commandspotlight.component';
import CommandSuggestions from '../commandsuggestion/commandsuggestion.component';
import CommandOutputSpotlight from '../commandoutputspotlight/commandoutputspotlight.command';
import SearchResults from '../searchResult/searchresult.component';
import { SYSTEM_SUGGESTIONS } from '@/constants/system-suggestion.constant';

const Spotlight: React.FC = () => {
  const { isOpen, query, setQuery, onClose } = useSpotlight();
  const inputRef = useRef<HTMLInputElement>(null);
  const [chartSelected, setChartSelected] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [commandOutput, setCommandOutput] = useState<ExecutionResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);

  // Debounced search handler
  const debouncedSearch = useCallback(
    debounce((searchQuery: string) => {
      setShowSuggestions(searchQuery.length > 0);
    }, 300),
    []
  );

  useEffect(() => {
    debouncedSearch(query);

    // Set showSearchResults when there's a query and it's not in chart mode
    if (query && !chartSelected) {
      setShowSearchResults(true);
    } else {
      setShowSearchResults(false);
    }

    if (!query) {
      setCommandOutput(null);
    }
  }, [query, debouncedSearch, chartSelected]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
    if (!isOpen) {
      setShowSuggestions(false);
      setChartSelected(false);
      setCommandOutput(null);
      setShowSearchResults(false); // Add this line
    }
  }, [isOpen]);

  const toggleChart = () => {
    setChartSelected(!chartSelected);
  };

  const handleCommandExecution = async (command: string) => {
    setIsExecuting(true);
    try {
      // const args = command.replace(/^kubectl\s+/, '').split(' ')
      const result = await ExecuteCommand(
        command
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

  if (!isOpen) return null;

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
      <div className="relative w-full max-w-3xl bg-gray-100 dark:bg-[#1B1C26]/70 backdrop-blur-md rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700/30 overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center justify-between py-1 px-4 text-2xl">
          <div className="flex items-center flex-grow">
            <Search className="w-5 h-5 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Kube Spotlight Search"
              className="w-full px-4 py-2 text-gray-900 dark:text-gray-100 placeholder-gray-600 bg-transparent border-none focus:outline-none focus:ring-0"
              autoComplete="off"
            />
          </div>
          <button
            onClick={toggleChart}
            className={`p-2 rounded-[0.3rem] transition-colors duration-200 cursor-pointer ${chartSelected
                ? 'bg-gray-300/70 text-gray-600'
                : 'text-gray-400 hover:bg-gray-200'
              }`}
          >
            <ChartColumnBig className="w-4 h-4" />
          </button>
        </div>

        {/* Monitor Section */}
        {chartSelected && showSuggestions && (
          <>
            <Separator className="bg-gray-300 dark:bg-gray-800" />
            {/* <MonitorSpotlight query={query} /> */}
          </>
        )}

        {/* Command Output Section */}
        {commandOutput && (
          <CommandOutputSpotlight
            output={commandOutput}
            isExecuting={isExecuting}
          />
        )}

        {showSearchResults && query.length >= 2 && !commandOutput && (
          <>
            <div className="py-1">
              <div className="px-4">
                <p className="text-sm mb-1 text-gray-500">Resources</p>
                <Separator className="bg-gray-200 dark:bg-gray-800" />
              </div>
              <SearchResults
                query={query}
                onResultClick={onClose}
                limit={3}
              />
            </div>
          </>
        )}
        {/* Command Section */}
        {showSuggestions && filteredCommandSuggestions.length > 0 && (
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

        {/* Natural Language Command Suggestions */}
        {showSuggestions && query && !chartSelected && (
          <>
            <div className="py-1">
              <div className="border-t border-gray-200 dark:border-gray-700/30">
                <CommandSuggestions
                  query={query}
                  onCommandSelect={handleCommandExecution}
                />
              </div>
            </div>
          </>
        )}

        {/* System Suggestions Section */}
        {showSuggestions && filteredSuggestions.length > 0 && (
          <>
            <Separator className="bg-gray-300" />
            <div className="py-3">
              <div className="px-4">
                <p className="text-sm mb-1 text-gray-500">System</p>
              </div>
              <div className="border-t border-gray-200 dark:border-gray-700/30">
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

        {/* Explorer Section */}
        {!chartSelected && showSuggestions && filteredExplorerSuggestions.length > 0 && (
          <>
            <div className="py-1">
              <div className="px-4">
                <p className="text-sm mb-1 text-gray-500">Explorer</p>
                <Separator className="bg-gray-200" />
              </div>
              <div className="border-gray-200 dark:border-gray-800/40">
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
      </div>
    </div>
  );
};

export default Spotlight;