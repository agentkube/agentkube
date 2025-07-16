import React, { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown, ChevronUp, Search, Lock, Sparkles, Brain, Plus } from 'lucide-react';
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

interface ModelSelectorProps {
  selectedModel: string;
  onModelChange: (modelId: string) => void;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ selectedModel, onModelChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const { models, enabledModels } = useModels();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const isLicensed = user?.isLicensed || false;
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
            <TooltipContent className="bg-gray-100 dark:bg-gray-800/20 text-gray-800 dark:text-gray-100 backdrop-blur-sm">
              <p>Requires Pro Plan. Activate a license to unlock premium models.</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return (
      <div
        key={model.id}
        data-selectable="true"
        className={`px-3 py-2 text-xs cursor-pointer flex items-center justify-between transition-colors ${
          isSelected
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
        <div className="absolute right-0 bottom-full mb-1 w-56 rounded-md shadow-lg dark:bg-[#0B0D13]/60 backdrop-blur-md border border-gray-400/30 dark:border-gray-800/50 z-50">
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
              className={`flex items-center px-1 py-2 text-xs w-full transition-colors cursor-pointer ${
                highlightedIndex === getTotalSelectableCount() - 1
                  ? 'bg-gray-200 dark:bg-gray-700/40 text-gray-700 dark:text-gray-200'
                  : 'hover:bg-gray-200 dark:bg-gray-800/40 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300'
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