import React, { useState, useEffect } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { useModels } from '@/contexts/useModel';
import { ORCHESTRATOR_URL } from '@/config';
import { patchConfig } from '@/api/settings';
import { OpenRouter } from '@/assets/icons';
const RemediationDefaultModel = () => {
  const { models } = useModels();
  const [currentModel, setCurrentModel] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch the current default model from settings
  useEffect(() => {
    const fetchCurrentModel = async () => {
      try {
        const response = await fetch(`${ORCHESTRATOR_URL}/api/config`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch settings: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.models && data.models.currentModel) {
          setCurrentModel(data.models.currentModel);
        }
      } catch (error) {
        console.error('Error fetching current model:', error);
      }
    };

    fetchCurrentModel();
  }, []);

  const handleModelChange = async (modelProvider: string, modelId: string) => {
    if (modelId === currentModel) return;
    
    setLoading(true);
    try {
      await patchConfig({
        models: {
          currentModel: `${modelProvider}/${modelId}`
        }
      });
      
      setCurrentModel(`${modelProvider}/${modelId}`);
      
      // Show success indicator
      setShowSuccess(true);
      
      // Hide success indicator after 3 seconds
      setTimeout(() => {
        setShowSuccess(false);
      }, 3000);
      
    } catch (error) {
      console.error('Error updating default model:', error);
    } finally {
      setLoading(false);
    }
  };

  // Get the display name for the current model
  const getCurrentModelName = () => {
    const model = models.find(m => m.id === currentModel);
    return model ? model.name : currentModel;
  };

  // Filter models based on search query
  const filteredModels = models.filter(model => {
    const searchText = searchQuery.toLowerCase();
    return (
      model.name.toLowerCase().includes(searchText) ||
      model.provider.toLowerCase().includes(searchText) ||
      `${model.provider}/${model.name}`.toLowerCase().includes(searchText)
    );
  });

  const handleSearchClick = (e: React.MouseEvent<HTMLInputElement>) => {
    e.stopPropagation();
  };
  
  return (
    <div className="mt-6 space-y-3 border-t border-gray-200 dark:border-gray-800 p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-medium text-white">Remediation Configuration</h3>
        
        {/* Success indicator */}
        {showSuccess && (
          <div className="flex items-center text-green-500 text-sm animate-pulse">
            <Check className="mr-1 h-4 w-4" />
            <span>Model updated</span>
          </div>
        )}
      </div>
      
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Select the default model to use for remediation tasks.
      </p>
      
      <div className="flex items-center space-x-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="outline" 
              className="justify-between bg-transparent border border-gray-300 dark:border-gray-700/60 text-gray-900 dark:text-white"
              disabled={loading}
            >
              <span>{getCurrentModelName() || "Select a model"}</span>
              <ChevronDown className="ml-2 h-4 w-4 text-gray-500" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='start' className="bg-white dark:bg-[#0B0D13]/80 dark:border-gray-400/10 backdrop-blur-sm">
            <div className="p-2 sticky top-0 z-10 bg-white dark:bg-[#0B0D13]/80 backdrop-blur-sm border-b border-gray-100 dark:border-gray-800/50">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
                <Input
                  placeholder="Search models..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onClick={handleSearchClick}
                  className="pl-8 h-9 bg-gray-200 dark:bg-gray-500/10 border border-gray-200 dark:border-gray-600/50 text-gray-900 dark:text-white text-sm"
                />
              </div>
            </div>
            <ScrollArea className="h-[200px] mt-1">
              <div className="p-1">
                {filteredModels.length > 0 ? (
                  filteredModels.map((model) => (
                    <DropdownMenuItem
                      key={model.id}
                      className={`flex items-center w-80 justify-between cursor-pointer px-3 text-sm rounded-sm ${
                        model.id === currentModel 
                          ? 'bg-gray-100 dark:bg-gray-700/60 text-gray-900 dark:text-white' 
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-900/10'
                      }`}
                      onClick={() => handleModelChange(model.provider, model.id)}
                    >
                      <span>{model.provider}/{model.name}</span>
                      {model.id === currentModel && (
                        <Check className="h-4 w-4 text-gray-900 dark:text-white" />
                      )}
                      <OpenRouter className='dark:text-gray-400' size={10} />
                    </DropdownMenuItem>
                  ))
                ) : (
                  <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                    No models found
                  </div>
                )}
              </div>
            </ScrollArea>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export default RemediationDefaultModel;