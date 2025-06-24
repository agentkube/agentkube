import React, { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown, ChevronUp, Search, Lock, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/useAuth';
import { useModels } from '@/contexts/useModel';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DeepSeek, Anthropic, OpenAI, XAI } from '@lobehub/icons';


const getProviderIcon = (provider: string) => {
  const iconMap: Record<string, JSX.Element>  = {
    'openai': <OpenAI size={14} />,
    'anthropic': <Anthropic size={14} />,
    'xai': <XAI size={14} />,
    'deepseek': <DeepSeek size={14} />,
    // Add more providers as needed
    'google': <DeepSeek size={14} />, // placeholder until you have Google icon
    'cohere': <DeepSeek size={14} />, // placeholder until you have Cohere icon
    'meta': <DeepSeek size={14} />, // placeholder until you have Meta icon
  };

  return iconMap[provider.toLowerCase()] || <DeepSeek size={12} />; // fallback icon
};

interface ModelSelectorProps {
  selectedModel: string;
  onModelChange: (modelId: string) => void;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ selectedModel, onModelChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { models, enabledModels } = useModels();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const isLicensed = user?.isLicensed || false;

  const selectedModelId = selectedModel.includes('/')
    ? selectedModel.split('/')[1]
    : selectedModel;

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

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
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
  };

  const renderModelItem = (model: typeof models[0]) => {
    const isPremium = model.premiumOnly === true;
    const isSelected = model.id === selectedModelId;
    const isDisabled = isPremium && !isLicensed;

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
                  <span>{model.name}/</span>
                </div>
                <span className="flex items-center ml-2 text-xxs px-1.5 py-0.5 bg-gray-300/30 dark:bg-green-500/10 text-gray-800 dark:text-green-500 rounded-[0.3rem]">
                  <Sparkles size={12} className="mr-1 w-3 h-3" />
                  <span>
                    Pro
                  </span>
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
        className={`px-3 py-2 text-xs cursor-pointer flex items-center justify-between ${isSelected
            ? 'bg-gray-300 dark:bg-gray-800/30 dark:text-white'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-700/20'
          }`}
        onClick={() => selectModel(model.id, model.provider, model.premiumOnly)}
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
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1 bg-gray-200 dark:bg-gray-800/50 rounded text-sm text-gray-700 dark:text-gray-300 focus:outline-none"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-40 overflow-y-auto py-1 
            scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent
            [&::-webkit-scrollbar]:w-1.5 
            [&::-webkit-scrollbar-track]:bg-transparent 
            [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
            [&::-webkit-scrollbar-thumb]:rounded-full
            [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">

            {filteredModels.map(renderModelItem)}

            {filteredModels.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-500 text-center">
                No models found
              </div>
            )}
          </div>
          <div className="border-t border-gray-400/30 dark:border-gray-800/50 py-1 px-3">
            <div className="text-xs text-gray-500 flex justify-between items-center">
              <span>⌘/ toggle, ⌘\ open</span>
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