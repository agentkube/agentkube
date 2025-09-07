import React, { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown, ChevronUp, Search, Lock, Sparkles, Brain, Plus, Zap, DollarSign, Database } from 'lucide-react';
import { useAuth } from '@/contexts/useAuth';
import { useModels } from '@/contexts/useModel';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getProviderIcon } from '@/utils/providerIconMap';
import { useNavigate } from 'react-router-dom';
import { ModelData } from '@/types/llm';
import LoadingSpinner from '@/utils/loader.utils';
import MarkdownContent from '@/utils/markdown-formatter';

interface ModelSelectorProps {
  selectedModel: string;
  onModelChange: (modelId: string) => void;
}

// Cache
let openRouterModelsCache: ModelData[] | null = null;
let cachePromise: Promise<ModelData[]> | null = null;

// Fetch models once and cache
const fetchOpenRouterModels = async (): Promise<ModelData[]> => {
  if (openRouterModelsCache) {
    return openRouterModelsCache;
  }

  if (cachePromise) {
    return cachePromise;
  }

  cachePromise = (async () => {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models');
      if (response.ok) {
        const data = await response.json();
        if (data && Array.isArray(data.data)) {
          openRouterModelsCache = data.data;
          return data.data;
        }
      }
      return [];
    } catch (error) {
      console.error('Failed to fetch OpenRouter model data:', error);
      return [];
    } finally {
      cachePromise = null;
    }
  })();

  return cachePromise;
};

const ModelInfoTooltip: React.FC<{ modelId: string; provider: string; children: React.ReactNode }> = ({ modelId, provider, children }) => {
  const [openRouterModel, setOpenRouterModel] = useState<ModelData | null>(null);
  const [loading, setLoading] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);

  // Find model in cached data
  const findModelInCache = async () => {
    if (openRouterModel || loading) return;

    setLoading(true);
    try {
      const models = await fetchOpenRouterModels();
      // Find the model by matching the full ID (provider/model)
      const fullModelId = `${provider}/${modelId}`;
      const foundModel = models.find((model: ModelData) =>
        model.id === fullModelId ||
        model.id === modelId ||
        model.name.toLowerCase().includes(modelId.toLowerCase())
      );

      if (foundModel) {
        setOpenRouterModel(foundModel);
      }
    } catch (error) {
      console.error('Failed to find model in cache:', error);
    } finally {
      setLoading(false);
    }
  };

  // Format price display
  const formatPrice = (price: string) => {
    if (price === "-1") return "Variable";
    if (price === "0") return "Free";

    const priceNum = parseFloat(price);

    if (priceNum === 0) return "$0.00";
    if (priceNum < 0.000001) return `$${(priceNum * 1000000).toFixed(4)}µ`;
    if (priceNum < 0.001) return `$${(priceNum * 1000).toFixed(4)}m`;

    return `$${priceNum.toFixed(6)}`;
  };

  // Format token count
  const formatTokenCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(0)}K`;
    return count.toString();
  };

  // Format date from timestamp
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString("en-US", {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Get capability badges
  const getCapabilities = (model: ModelData) => {
    const capabilities = [];

    if (model.architecture?.input_modalities?.includes("image")) {
      capabilities.push({ label: "Vision", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300" });
    }

    if (model.endpoint?.supports_reasoning || model.architecture?.reasoning_config) {
      capabilities.push({ label: "Reasoning", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300" });
    }

    if (model.endpoint?.supports_tool_parameters) {
      capabilities.push({ label: "Tools", color: "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300" });
    }

    return capabilities;
  };

  // Helper function to truncate description
  const getTruncatedDescription = (description: string, maxLength: number = 120) => {
    if (description.length <= maxLength) {
      return description;
    }
    return description.substring(0, maxLength).trim() + '...';
  };

  // Helper function to check if description needs truncation
  const needsTruncation = (description: string, maxLength: number = 120) => {
    return description && description.length > maxLength;
  };

  if (!openRouterModel && !loading) {
    return (
      <TooltipProvider>
        <Tooltip open={isTooltipOpen} onOpenChange={setIsTooltipOpen} delayDuration={300}>
          <TooltipTrigger
            asChild
            onMouseEnter={() => {
              findModelInCache();
              setIsTooltipOpen(true);
            }}
            onMouseLeave={() => {
              if (!showFullDescription) {
                setIsTooltipOpen(false);
              }
            }}
          >
            {children}
          </TooltipTrigger>
          <TooltipContent
            side="left"
            align="center"
            className="w-64 p-3 border-0 shadow-2xl bg-white dark:bg-[#0B0D13]/5 backdrop-blur-md border border-gray-400/30 dark:border-gray-800/50"
            sideOffset={8}
            onMouseEnter={() => setIsTooltipOpen(true)}
            onMouseLeave={() => setIsTooltipOpen(false)}
          >
            <div className="text-center text-sm text-gray-500 py-2">
              <LoadingSpinner />
              <p className=" ">Loading model info.</p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (!openRouterModel) {
    return (
      <TooltipProvider>
        <Tooltip open={isTooltipOpen} onOpenChange={setIsTooltipOpen} delayDuration={300}>
          <TooltipTrigger
            asChild
            onMouseEnter={() => setIsTooltipOpen(true)}
            onMouseLeave={() => {
              if (!showFullDescription) {
                setIsTooltipOpen(false);
              }
            }}
          >
            {children}
          </TooltipTrigger>
          <TooltipContent
            side="left"
            align="center"
            className="w-64 p-3 border-0 shadow-2xl bg-white dark:bg-[#0B0D13]/5  backdrop-blur-md border border-gray-400/30 dark:border-gray-800/50"
            sideOffset={8}
            onMouseEnter={() => setIsTooltipOpen(true)}
            onMouseLeave={() => setIsTooltipOpen(false)}
          >
            <div className="text-center py-2">
              <p className="text-sm text-gray-500">Model info not available</p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const capabilities = getCapabilities(openRouterModel);
  const isMultimodal = openRouterModel.architecture?.input_modalities?.includes("image");
  const hasDescription = openRouterModel.description && openRouterModel.description.trim().length > 0;
  const descriptionNeedsTruncation = hasDescription && needsTruncation(openRouterModel.description);

  return (
    <TooltipProvider>
      <Tooltip open={isTooltipOpen} onOpenChange={setIsTooltipOpen} delayDuration={300}>
        <TooltipTrigger
          asChild
          onMouseEnter={() => setIsTooltipOpen(true)}
          onMouseLeave={() => {
            if (!showFullDescription) {
              setIsTooltipOpen(false);
            }
          }}
        >
          {children}
        </TooltipTrigger>
        <TooltipContent
          side="left"
          align="center"
          className="w-80 p-0 border-0 shadow-2xl bg-white dark:bg-[#0B0D13]/5  backdrop-blur-md border border-gray-400/30 dark:border-gray-800/50 "
          sideOffset={8}
          onMouseEnter={() => setIsTooltipOpen(true)}
          onMouseLeave={() => {
            setIsTooltipOpen(false);
            setShowFullDescription(false); // Reset when tooltip closes
          }}
        >
          <div className="">
            {/* Header */}
            <div className="p-4 flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
                  {openRouterModel.name}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                  {provider}
                </p>
                {openRouterModel.created && (
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Released {formatDate(openRouterModel.created)}
                  </p>
                )}
              </div>
              {/* Capabilities */}
              {capabilities.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {capabilities.map((capability, index) => (
                    <span
                      key={index}
                      className={`text-xs px-2 py-1 rounded-md ${capability.color}`}
                    >
                      {capability.label}
                    </span>
                  ))}
                </div>
              )}

            </div>

            <div className='bg-white dark:bg-[#0B0D13]/40 p-4 space-y-3'>
              {/* Description with Read More */}
              {hasDescription && (
                <div className="space-y-1">
                  <div className="text-xs leading-relaxed [&>div]:space-y-1 [&_h1]:text-xs [&_h1]:font-semibold [&_h2]:text-xs [&_h2]:font-semibold [&_h3]:text-xs [&_h3]:font-medium [&_p]:text-xs [&_p]:text-gray-300 [&_p]:dark:text-gray-300 [&_p]:mb-1 [&_li]:text-xs [&_li]:text-gray-300 [&_li]:dark:text-gray-300 [&_ul]:mb-1 [&_ol]:mb-1 [&_code]:text-xs [&_code]:bg-gray-600/20 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded">
                    <MarkdownContent
                      content={showFullDescription || !descriptionNeedsTruncation
                        ? openRouterModel.description
                        : getTruncatedDescription(openRouterModel.description)
                      }
                    />
                  </div>
                  {descriptionNeedsTruncation && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowFullDescription(!showFullDescription);
                        setIsTooltipOpen(true); // Keep tooltip open
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      className="text-xs text-blue-500 hover:text-blue-300 dark:text-blue-400 dark:hover:text-blue-300 transition-colors cursor-pointer underline focus:outline-none"
                    >
                      {showFullDescription ? 'Show less' : 'Read more'}
                    </button>
                  )}
                </div>
              )}


              {/* Specs Grid */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
                {/* Context Length */}
                <div className="flex items-center space-x-2">
                  <Database size={12} className="text-gray-500" />
                  <div>
                    <p className="text-xs font-medium text-gray-900 dark:text-white">
                      {formatTokenCount(openRouterModel.context_length)}
                    </p>
                    <p className="text-xs text-gray-500">Context</p>
                  </div>
                </div>

                {/* Modality */}
                <div className="flex items-center space-x-2">
                  <Zap size={12} className="text-gray-500" />
                  <div>
                    <p className="text-xs font-medium text-gray-900 dark:text-white">
                      {openRouterModel.architecture?.modality || 'text->text'}
                    </p>
                    <p className="text-xs text-gray-500">Type</p>
                  </div>
                </div>

                {/* Input Price */}
                {openRouterModel.pricing?.prompt && (
                  <div className="flex items-center space-x-2">
                    <DollarSign size={12} className="text-gray-500" />
                    <div>
                      <p className="text-xs font-medium text-gray-900 dark:text-white font-mono">
                        {formatPrice(openRouterModel.pricing.prompt)}
                      </p>
                      <p className="text-xs text-gray-500">Input</p>
                    </div>
                  </div>
                )}

                {/* Output Price */}
                {openRouterModel.pricing?.completion && (
                  <div className="flex items-center space-x-2">
                    <DollarSign size={12} className="text-gray-500" />
                    <div>
                      <p className="text-xs font-medium text-gray-900 dark:text-white font-mono">
                        {formatPrice(openRouterModel.pricing.completion)}
                      </p>
                      <p className="text-xs text-gray-500">Output</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Additional features */}
              {openRouterModel.endpoint && (
                <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-xs font-medium text-gray-900 dark:text-white mb-1">Features:</p>
                  <div className="flex flex-wrap gap-1">
                    {openRouterModel.endpoint.supports_tool_parameters && (
                      <span className="text-xs px-1.5 py-0.5 bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300 rounded">
                        Tools
                      </span>
                    )}
                    {openRouterModel.endpoint.supports_reasoning && (
                      <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 rounded">
                        Reasoning
                      </span>
                    )}
                    {openRouterModel.endpoint.supports_multipart && (
                      <span className="text-xs px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/20 text-purple-800 dark:text-purple-300 rounded">
                        Multipart
                      </span>
                    )}
                    {openRouterModel.endpoint.is_free && (
                      <span className="text-xs px-1.5 py-0.5 bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300 rounded">
                        Free Tier
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Rate limits */}
              {openRouterModel.per_request_limits && (openRouterModel.per_request_limits.rpm || openRouterModel.per_request_limits.rpd) && (
                <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-xs font-medium text-gray-900 dark:text-white mb-1">Rate Limits:</p>
                  <div className="text-xs text-gray-300 dark:text-gray-300 space-y-0.5">
                    {openRouterModel.per_request_limits.rpm && (
                      <div>{openRouterModel.per_request_limits.rpm}/min requests</div>
                    )}
                    {openRouterModel.per_request_limits.rpd && (
                      <div>{openRouterModel.per_request_limits.rpd}/day requests</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

const ModelSelector: React.FC<ModelSelectorProps> = ({ selectedModel, onModelChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const { models, enabledModels } = useModels();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const isLicensed = user?.isAuthenticated || false;
  const navigate = useNavigate();

  const selectedModelId = selectedModel.includes('/')
    ? selectedModel.split('/')[1]
    : selectedModel;

  // Handle click outside
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

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Cmd+/ to toggle dropdown (Mac) or Ctrl+/ (Windows/Linux)
      if ((event.metaKey || event.ctrlKey) && event.key === '/') {
        event.preventDefault();
        toggleDropdown();
        return;
      }

      // Only handle arrow keys when dropdown is open
      if (!isOpen) return;

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          setHighlightedIndex(prev => {
            const maxIndex = getTotalSelectableCount() - 1;
            return prev < maxIndex ? prev + 1 : 0;
          });
          break;
        case 'ArrowUp':
          event.preventDefault();
          setHighlightedIndex(prev => {
            const maxIndex = getTotalSelectableCount() - 1;
            return prev > 0 ? prev - 1 : maxIndex;
          });
          break;
        case 'Enter':
          event.preventDefault();
          handleEnterKey();
          break;
        case 'Escape':
          event.preventDefault();
          setIsOpen(false);
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, highlightedIndex]);

  // Reset highlighted index when search query changes
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [searchQuery]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Auto-scroll to highlighted item
  useEffect(() => {
    if (highlightedIndex >= 0 && scrollContainerRef.current) {
      const scrollContainer = scrollContainerRef.current;
      const items = scrollContainer.querySelectorAll('[data-selectable="true"]');
      const highlightedItem = items[highlightedIndex] as HTMLElement;

      if (highlightedItem) {
        // Use scrollIntoView for more reliable scrolling
        highlightedItem.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'nearest'
        });
      }
    }
  }, [highlightedIndex]);

  // Handle premium model fallback
  useEffect(() => {
    const currentSelectedModel = models.find(m => m.id === selectedModelId);
    if (currentSelectedModel?.premiumOnly && !isLicensed) {
      const fallbackModel = models.find(m => !m.premiumOnly && m.enabled);
      if (fallbackModel) {
        onModelChange(`${fallbackModel.provider}/${fallbackModel.id}`);
      }
    }
  }, [isLicensed, selectedModel, models, onModelChange, selectedModelId]);

  // Filter and sort models
  const filteredModels = enabledModels
    .filter(model => {
      return model.name.toLowerCase().includes(searchQuery.toLowerCase());
    })
    .sort((a, b) => {
      if (isLicensed) {
        if (a.premiumOnly && !b.premiumOnly) return -1;
        if (!a.premiumOnly && b.premiumOnly) return 1;
      }
      return a.name.localeCompare(b.name);
    });

  const currentModel = models.find(model => model.id === selectedModelId)?.name || 'Select model';

  // Get all selectable items (models + "Add Model" option)
  const getSelectableItems = () => {
    return filteredModels.filter(model => !(model.premiumOnly && !isLicensed));
  };

  const getTotalSelectableCount = () => {
    return getSelectableItems().length + 1; // +1 for "Add Model" option
  };

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
    setHighlightedIndex(-1);
    if (!isOpen) {
      setSearchQuery('');
    }
  };

  const selectModel = (modelId: string, provider: string, premiumOnly?: boolean) => {
    if (premiumOnly && !isLicensed) {
      return;
    }

    onModelChange(`${provider}/${modelId}`);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleEnterKey = () => {
    const selectableModels = getSelectableItems();
    const totalCount = getTotalSelectableCount();

    if (highlightedIndex >= 0 && highlightedIndex < totalCount) {
      // If it's the last index, it's the "Add Model" option
      if (highlightedIndex === totalCount - 1) {
        navigate("/settings/models");
        setIsOpen(false);
      } else if (highlightedIndex < selectableModels.length) {
        // It's a model selection
        const model = selectableModels[highlightedIndex];
        selectModel(model.id, model.provider, model.premiumOnly);
      }
    }
  };

  const renderModelItem = (model: typeof models[0], index: number) => {
    const isPremium = model.premiumOnly === true;
    const isSelected = model.id === selectedModelId;
    const isDisabled = isPremium && !isLicensed;

    // Calculate the actual index in selectable items
    const selectableModels = getSelectableItems();
    const selectableIndex = selectableModels.findIndex(item => item.id === model.id);
    const isHighlighted = selectableIndex === highlightedIndex && selectableIndex >= 0;

    if (isDisabled) {
      return (
        <TooltipProvider key={model.id}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="px-3 py-2 text-xs cursor-not-allowed flex items-center justify-between text-gray-400"
              >
                <div className="flex items-center">
                  <Lock size={12} className="mr-1.5 text-gray-500" />
                  <span>{model.name}</span>
                </div>
                <span className="flex items-center ml-2 text-xxs px-1.5 py-0.5 bg-gray-300/30 dark:bg-green-500/10 text-gray-800 dark:text-green-500 rounded-[0.3rem]">
                  <Sparkles size={12} className="mr-1 w-3 h-3" />
                  <span>Pro</span>
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent className="bg-gray-100 dark:bg-gray-800/30 text-gray-800 dark:text-gray-100 backdrop-blur-md border border-gray-400/30 dark:border-gray-800/50">
              <p>Requires Pro Plan. Activate a license to unlock premium models.</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    const modelItemContent = (
      <div
        key={model.id}
        data-selectable="true"
        className={`px-3 py-2 text-xs cursor-pointer flex items-center justify-between transition-colors ${isSelected
          ? 'bg-gray-300 dark:bg-gray-800/30 dark:text-white'
          : isHighlighted
            ? 'bg-gray-200 dark:bg-gray-700/40 text-gray-700 dark:text-gray-200'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-700/20'
          }`}
        onClick={() => selectModel(model.id, model.provider, model.premiumOnly)}
        onMouseEnter={() => {
          const selectableModels = getSelectableItems();
          const selectableIndex = selectableModels.findIndex(item => item.id === model.id);
          if (selectableIndex >= 0) {
            setHighlightedIndex(selectableIndex);
          }
        }}
      >
        <div className="flex items-center space-x-1.5">
          {getProviderIcon(model.provider)}
          <span>{model.name}</span>
        </div>
        {isSelected && <Check size={16} className="text-gray-300" />}
        {isPremium && !isSelected && !isLicensed &&
          <span className="ml-2 text-xxs px-1.5 py-0.5 bg-gray-300/30 dark:bg-green-500/10 text-gray-800 dark:text-green-500 rounded-[0.3rem]">
            Pro
          </span>
        }
      </div>
    );

    // Wrap with tooltip only if not disabled
    return (
      <ModelInfoTooltip key={model.id} modelId={model.id} provider={model.provider}>
        {modelItemContent}
      </ModelInfoTooltip>
    );
  };

  return (
    <div ref={dropdownRef} className="relative inline-block text-left">
      <div
        className="inline-flex items-center cursor-pointer text-gray-400 text-xs hover:text-gray-300"
        onClick={toggleDropdown}
      >
        <span>{currentModel}</span>
        {isOpen ? <ChevronUp size={14} className="ml-1" /> : <ChevronDown size={14} className="ml-1" />}
      </div>

      {isOpen && (
        <div className="absolute right-0 bottom-full mb-1 w-56 rounded-md shadow-lg dark:bg-[#0B0D13]/5 backdrop-blur-md border border-gray-400/30 dark:border-gray-800/50 border border-gray-400/30 dark:border-gray-800/50 z-50">
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
          <div
            ref={scrollContainerRef}
            className="max-h-40 overflow-y-auto 
            [&::-webkit-scrollbar]:w-1.5 
            [&::-webkit-scrollbar-track]:bg-transparent 
            [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
            [&::-webkit-scrollbar-thumb]:rounded-full
            [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">

            {filteredModels.map((model, index) => renderModelItem(model, index))}

            <div
              data-selectable="true"
              className={`flex items-center px-1 py-2 text-xs w-full transition-colors cursor-pointer ${highlightedIndex === getTotalSelectableCount() - 1
                ? 'bg-gray-200 dark:bg-gray-700/40 text-gray-700 dark:text-gray-200'
                : 'hover:bg-gray-200 dark:bg-gray-800/40 dark:hover:bg-gray-800 text-gray-300 dark:text-gray-300'
                }`}
              onClick={() => {
                navigate("/settings/models");
                setIsOpen(false);
              }}
              onMouseEnter={() => setHighlightedIndex(getTotalSelectableCount() - 1)}
            >
              <Plus className='h-3' />
              Add Model
            </div>

            {filteredModels.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-500 text-center">
                No models found
              </div>
            )}
          </div>
          <div className="border-t border-gray-400/30 dark:border-gray-800/50 py-1 px-3">
            <div className="text-xs text-gray-500 flex justify-between items-center">
              <span>⌘/ toggle</span>
              {!isLicensed && (
                <></>
                // <span className="text-xxs text-gray-400">Some models require Pro Plan</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModelSelector;