import React, { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { DEFAULT_MODELS } from '@/constants/models.constant';
interface ModelOption {
  id: string;
  name: string;
}

interface ModelSelectorProps {
  selectedModel: string;
  onModelChange: (modelId: string) => void;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ selectedModel, onModelChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [models, setModels] = useState<ModelOption[]>(DEFAULT_MODELS);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Handle clicking outside to close dropdown
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

  // Filter models based on search query
  const filteredModels = models.filter(model => 
    model.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get current selected model name
  const currentModel = models.find(model => model.id === selectedModel)?.name || 'Select model';

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      setSearchQuery('');
    }
  };

  const selectModel = (modelId: string) => {
    onModelChange(modelId);
    setIsOpen(false);
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
        <div className="absolute right-0 bottom-full mb-1 w-56 rounded-md shadow-lg dark:bg-[#0B0D13]/60 backdrop-blur-md border border-gray-800/50 z-50">
          <div className="p-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1 bg-gray-200 dark:bg-gray-900 rounded text-sm text-gray-700 dark:text-gray-300 focus:outline-none"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto py-1 
            scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent
            [&::-webkit-scrollbar]:w-1.5 
            [&::-webkit-scrollbar-track]:bg-transparent 
            [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
            [&::-webkit-scrollbar-thumb]:rounded-full
            [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">
            {filteredModels.map((model) => (
              <div
                key={model.id}
                className={`px-3 py-2 text-xs cursor-pointer flex items-center justify-between ${
                  model.id === selectedModel 
                    ? 'bg-gray-300 dark:bg-gray-800/30 dark:text-white' 
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-700/20'
                }`}
                onClick={() => selectModel(model.id)}
              >
                <span>{model.name}</span>
                {model.id === selectedModel && <Check size={16} className="text-gray-300" />}
              </div>
            ))}
          </div>
          <div className="border-t border-gray-800/50 py-1 px-3">
            <div className="text-xs text-gray-500 flex justify-between items-center">
              <span>⌘/ toggle, ⌘\ open</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModelSelector;