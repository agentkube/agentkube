import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Check, ChevronDown, ChevronUp, Search, Plus, Zap, DollarSign, Database } from 'lucide-react';
import { useAuth } from '@/contexts/useAuth';
import { useModels } from '@/contexts/useModel';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useNavigate } from 'react-router-dom';
import type { Model } from '@/types/llm';

const MODELS_DEV_LOGO_BASE = 'https://models.dev/logos';

// Provider logo from models.dev with fallback
const ProviderLogo: React.FC<{ provider: string; size?: number }> = ({ provider, size = 14 }) => {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        className="inline-flex items-center justify-center rounded bg-gray-200 dark:bg-gray-700 text-[8px] font-bold text-gray-500 dark:text-gray-400 uppercase"
        style={{ width: size, height: size }}
      >
        {provider.charAt(0)}
      </span>
    );
  }
  return (
    <img
      src={`${MODELS_DEV_LOGO_BASE}/${provider}.svg`}
      alt={provider}
      className="inline-block rounded dark:invert"
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  );
};

interface ModelSelectorProps {
  selectedModel: string;
  onModelChange: (modelId: string) => void;
}

// ── Model Info Tooltip (using models.dev data from our Model type) ──

const ModelInfoTooltip: React.FC<{ model: Model; children: React.ReactNode }> = ({ model, children }) => {
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);

  // Format price display (cost per million tokens)
  const formatCost = (cost: number) => {
    if (cost === 0) return 'Free';
    if (cost < 0.01) return `$${cost.toFixed(4)}/M`;
    return `$${cost.toFixed(2)}/M`;
  };

  // Format token count
  const formatTokenCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(0)}K`;
    return count.toString();
  };

  // Build capability badges
  const capabilities: { label: string; color: string }[] = [];
  if (model.reasoning) {
    capabilities.push({ label: 'Reasoning', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300' });
  }
  if (model.tool_call) {
    capabilities.push({ label: 'Tools', color: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300' });
  }
  if (model.attachment) {
    capabilities.push({ label: 'Vision', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300' });
  }
  if (model.structured_output) {
    capabilities.push({ label: 'Structured', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300' });
  }

  return (
    <TooltipProvider>
      <Tooltip open={isTooltipOpen} onOpenChange={setIsTooltipOpen} delayDuration={300}>
        <TooltipTrigger
          asChild
          onMouseEnter={() => setIsTooltipOpen(true)}
          onMouseLeave={() => setIsTooltipOpen(false)}
        >
          {children}
        </TooltipTrigger>
        <TooltipContent
          side="left"
          align="center"
          className="w-72 p-0 border-0 shadow-2xl bg-white dark:bg-card/5 backdrop-blur-md border border-gray-400/30 dark:border-gray-800/50"
          sideOffset={8}
          onMouseEnter={() => setIsTooltipOpen(true)}
          onMouseLeave={() => setIsTooltipOpen(false)}
        >
          <div>
            {/* Header */}
            <div className="p-3 flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
                  {model.name}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                  {model.provider}
                </p>
                {model.release_date && (
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Released {model.release_date}
                  </p>
                )}
              </div>
              {capabilities.length > 0 && (
                <div className="flex flex-wrap gap-1 ml-2">
                  {capabilities.map((cap, i) => (
                    <span key={i} className={`text-xs px-1.5 py-0.5 rounded ${cap.color}`}>
                      {cap.label}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className='bg-white dark:bg-card/40 p-3 space-y-2'>
              {/* Specs Grid */}
              <div className="grid grid-cols-2 gap-2">
                {/* Context Length */}
                {model.limit?.context > 0 && (
                  <div className="flex items-center space-x-2">
                    <Database size={12} className="text-gray-500" />
                    <div>
                      <p className="text-xs font-medium text-gray-900 dark:text-white">
                        {formatTokenCount(model.limit.context)}
                      </p>
                      <p className="text-xs text-gray-500">Context</p>
                    </div>
                  </div>
                )}

                {/* Modality */}
                <div className="flex items-center space-x-2">
                  <Zap size={12} className="text-gray-500" />
                  <div>
                    <p className="text-xs font-medium text-gray-900 dark:text-white">
                      {model.modalities?.input?.join(', ') || 'text'} → {model.modalities?.output?.join(', ') || 'text'}
                    </p>
                    <p className="text-xs text-gray-500">Modality</p>
                  </div>
                </div>

                {/* Input Cost */}
                {model.cost?.input > 0 && (
                  <div className="flex items-center space-x-2">
                    <DollarSign size={12} className="text-gray-500" />
                    <div>
                      <p className="text-xs font-medium text-gray-900 dark:text-white font-mono">
                        {formatCost(model.cost.input)}
                      </p>
                      <p className="text-xs text-gray-500">Input</p>
                    </div>
                  </div>
                )}

                {/* Output Cost */}
                {model.cost?.output > 0 && (
                  <div className="flex items-center space-x-2">
                    <DollarSign size={12} className="text-gray-500" />
                    <div>
                      <p className="text-xs font-medium text-gray-900 dark:text-white font-mono">
                        {formatCost(model.cost.output)}
                      </p>
                      <p className="text-xs text-gray-500">Output</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Output Limit */}
              {model.limit?.output > 0 && (
                <div className="pt-1 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-xs text-gray-500">
                    Max output: <span className="font-mono text-gray-300">{formatTokenCount(model.limit.output)}</span> tokens
                  </p>
                </div>
              )}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

// ── Model Selector (grouped by provider, like opencode) ──

const ModelSelector: React.FC<ModelSelectorProps> = ({ selectedModel, onModelChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const { models, enabledModels, refreshModels } = useModels();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  // Use full_id for selection matching (e.g., "openrouter/openai/gpt-4o-mini" vs "openai/gpt-4o-mini")
  const selectedFullId = selectedModel || '';

  // Fetch models whenever the dropdown opens
  useEffect(() => {
    if (isOpen) {
      refreshModels();
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter models by search query
  const filteredModels = useMemo(() => {
    return enabledModels.filter(model =>
      model.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      model.provider.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [enabledModels, searchQuery]);

  // Group models by provider (like opencode)
  const groupedModels = useMemo(() => {
    const groups: Record<string, Model[]> = {};
    for (const model of filteredModels) {
      const provider = model.provider;
      if (!groups[provider]) groups[provider] = [];
      groups[provider].push(model);
    }
    // Sort providers alphabetically, then models within each provider
    const sortedEntries = Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([provider, models]) => [
        provider,
        models.sort((a, b) => a.name.localeCompare(b.name)),
      ] as [string, Model[]]);
    return sortedEntries;
  }, [filteredModels]);

  // Build flat list for keyboard navigation
  const flatSelectableItems = useMemo(() => {
    const items: { type: 'model'; model: Model }[] = [];
    for (const [, models] of groupedModels) {
      for (const model of models) {
        items.push({ type: 'model', model });
      }
    }
    return items;
  }, [groupedModels]);

  const selectedModelObj = models.find(model => model.full_id === selectedFullId);
  const currentModel = selectedModelObj?.name || selectedModel || 'Select model';
  const currentProvider = selectedModelObj?.provider;

  const totalSelectableCount = flatSelectableItems.length + 1; // +1 for "Manage models"

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightedIndex(prev => Math.min(prev + 1, totalSelectableCount - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIndex(prev => Math.max(prev - 1, -1));
          break;
        case 'Enter':
          e.preventDefault();
          if (highlightedIndex >= 0 && highlightedIndex < flatSelectableItems.length) {
            const item = flatSelectableItems[highlightedIndex];
            onModelChange(item.model.full_id);
            setIsOpen(false);
            setHighlightedIndex(-1);
          } else if (highlightedIndex === totalSelectableCount - 1) {
            navigate("/settings/models");
            setIsOpen(false);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          setHighlightedIndex(-1);
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, highlightedIndex, flatSelectableItems, totalSelectableCount, navigate, onModelChange]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex < 0 || !scrollContainerRef.current) return;
    const items = scrollContainerRef.current.querySelectorAll('[data-selectable="true"]');
    const item = items[highlightedIndex];
    if (item) {
      item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [highlightedIndex]);

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
    setHighlightedIndex(-1);
    if (!isOpen) setSearchQuery('');
  };

  // Capitalize provider name for display
  const providerDisplayName = (provider: string) => {
    const names: Record<string, string> = {
      openai: 'OpenAI',
      anthropic: 'Anthropic',
      google: 'Google',
      openrouter: 'OpenRouter',
      deepseek: 'DeepSeek',
      xai: 'xAI',
      mistral: 'Mistral',
      groq: 'Groq',
      cohere: 'Cohere',
      meta: 'Meta',
      ollama: 'Ollama',
      vllm: 'vLLM',
      azure: 'Azure',
    };
    return names[provider] || provider.charAt(0).toUpperCase() + provider.slice(1);
  };

  // Track flat index for keyboard navigation
  let flatIndex = 0;

  return (
    <div ref={dropdownRef} className="relative inline-block text-left">
      <div
        className="inline-flex items-center cursor-pointer text-xs text-muted-foreground hover:text-foreground hover:bg-gray-800/20 px-1.5 py-1 rounded transition-colors"
        onClick={toggleDropdown}
      >
        {currentProvider && (
          <div className="mr-1.5">
            <ProviderLogo provider={currentProvider} size={14} />
          </div>
        )}
        <span>{currentModel}</span>
        {isOpen ? <ChevronUp size={14} className="ml-1" /> : <ChevronDown size={14} className="ml-1" />}
      </div>

      {isOpen && (
        <div className="absolute right-0 bottom-full mb-1 w-60 rounded-md shadow-lg dark:bg-card/5 backdrop-blur-md border border-gray-400/30 dark:border-gray-800/50 z-50">
          {/* Search */}
          <div className="p-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1 bg-gray-200 dark:bg-gray-800/30 rounded text-sm text-gray-700 dark:text-gray-300 focus:outline-none"
              />
            </div>
          </div>

          {/* Models list grouped by provider */}
          <div
            ref={scrollContainerRef}
            className="max-h-52 overflow-y-auto 
            [&::-webkit-scrollbar]:w-1.5 
            [&::-webkit-scrollbar-track]:bg-transparent 
            [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
            [&::-webkit-scrollbar-thumb]:rounded-full
            [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50"
          >
            {groupedModels.map(([provider, providerModels]) => {
              return (
                <div key={provider}>
                  {/* Provider header */}
                  <div className="px-3 py-1.5 flex items-center gap-1.5 text-[11px] font-medium text-gray-500 dark:text-gray-500 tracking-wider sticky top-0 bg-white/80 dark:bg-card/80 backdrop-blur-sm">

                    {providerDisplayName(provider)}
                  </div>
                  {providerModels.map((model) => {
                    const currentFlatIndex = flatIndex;
                    flatIndex++;
                    const isSelected = model.full_id === selectedFullId;
                    const isHighlighted = currentFlatIndex === highlightedIndex;

                    const modelItemContent = (
                      <div
                        data-selectable="true"
                        className={`px-3 py-1.5 text-xs cursor-pointer flex items-center justify-between transition-colors ${isSelected
                          ? 'bg-gray-300 dark:bg-gray-800/30 dark:text-white'
                          : isHighlighted
                            ? 'bg-gray-200 dark:bg-gray-700/40 text-gray-700 dark:text-gray-200'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-700/20'
                          }`}
                        onClick={() => {
                          onModelChange(model.full_id);
                          setIsOpen(false);
                          setHighlightedIndex(-1);
                        }}
                        onMouseEnter={() => setHighlightedIndex(currentFlatIndex)}
                      >
                        <div className="flex items-center space-x-1.5">
                          <ProviderLogo provider={provider} size={14} />
                          <span>{model.name}</span>
                          {model.status && (
                            <span className="text-[9px] px-1 py-0.5 bg-gray-200 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 rounded">
                              {model.status === 'beta' ? 'Beta' : model.status === 'deprecated' ? 'Deprecated' : model.status}
                            </span>
                          )}
                        </div>
                        {isSelected && <Check size={14} className="text-gray-300 shrink-0" />}
                      </div>
                    );

                    return (
                      <ModelInfoTooltip key={model.full_id} model={model}>
                        {modelItemContent}
                      </ModelInfoTooltip>
                    );
                  })}
                </div>
              );
            })}

            {/* Manage models link */}
            <div
              data-selectable="true"
              className={`flex items-center px-3 py-2 text-xs w-full transition-colors cursor-pointer border-t border-gray-400/20 dark:border-gray-800/50 ${highlightedIndex === totalSelectableCount - 1
                ? 'bg-gray-200 dark:bg-gray-700/40 text-gray-700 dark:text-gray-200'
                : 'hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400'
                }`}
              onClick={() => {
                navigate("/settings/models");
                setIsOpen(false);
              }}
              onMouseEnter={() => setHighlightedIndex(totalSelectableCount - 1)}
            >
              <Plus className='h-3 w-3 mr-1' />
              Manage models
            </div>

            {filteredModels.length === 0 && (
              <div className="px-3 py-4 text-xs text-gray-500 text-center">
                No models found
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-400/30 dark:border-gray-800/50 py-1 px-3">
            <div className="text-xs text-gray-500 flex justify-between items-center">
              <span>⌘/ toggle</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModelSelector;