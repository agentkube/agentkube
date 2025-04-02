import React, { useState } from 'react';
import { Check, Plus, X, Trash2, AlertTriangle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ModelConfig } from '@/components/custom';
import { DEFAULT_MODELS } from '@/constants/models.constant';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useNavigate } from 'react-router-dom';

interface Model {
  id: string;
  name: string;
  provider: string;
  enabled: boolean;
  isCustom: boolean;
  premiumOnly?: boolean; // New property to mark models as premium
}

const ModelConfiguration = () => {
  const [models, setModels] = useState<Model[]>(DEFAULT_MODELS);
  const navigate = useNavigate();

  const isPremiumUser = false;

  const [showAddInput, setShowAddInput] = useState(false);
  const [newModelName, setNewModelName] = useState('');

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [modelToDelete, setModelToDelete] = useState<string | null>(null);


  const toggleModelEnabled = (modelId: string) => {
    const modelToToggle = models.find(model => model.id === modelId);

    if (modelToToggle?.premiumOnly && !isPremiumUser) {
      return;
    }
    
    setModels(models.map(model =>
      model.id === modelId
        ? { ...model, enabled: !model.enabled }
        : model
    ));
  };

  // Add new model
  const handleAddModel = () => {
    if (newModelName.trim()) {
      const newModel = {
        id: newModelName.trim(),
        name: newModelName.trim(),
        provider: "custom",
        enabled: false,
        isCustom: true
      };

      setModels([...models, newModel]);
      setNewModelName('');
      setShowAddInput(false);
    }
  };

  // Open delete confirmation dialog
  const openDeleteDialog = (e: React.MouseEvent, modelId: string) => {
    e.stopPropagation(); 
    setModelToDelete(modelId);
    setShowDeleteDialog(true);
  };

  const confirmDelete = () => {
    if (modelToDelete) {
      setModels(models.filter(model => model.id !== modelToDelete));
      setShowDeleteDialog(false);
      setModelToDelete(null);
    }
  };

  const cancelDelete = () => {
    setShowDeleteDialog(false);
    setModelToDelete(null);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleAddModel();
    }
  };

  const getModelNameToDelete = () => {
    if (!modelToDelete) return '';
    const model = models.find(m => m.id === modelToDelete);
    return model ? model.name : '';
  };

  const renderModelItem = (model: Model) => {
    if (model.premiumOnly && !isPremiumUser) {
      return (
        <TooltipProvider key={model.id}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center py-2 px-3 cursor-not-allowed group">
                <div className="w-6 flex items-center justify-center">
                  <div className="w-4 h-4 border border-gray-500/30 bg-gray-300/20 dark:bg-gray-700/20 rounded-sm flex items-center justify-center">
                    {/* <AlertCircle className="w-3 h-3 text-amber-500" /> */}
                  </div>
                </div>
                
                <span className="text-sm w-full ml-2 text-gray-500/80 dark:text-gray-400/60 flex justify-between items-center">
                  <span>{model.name}</span>
                  <span className="ml-2 text-xs px-1.5 py-0.5 bg-gray-300/30 dark:bg-green-500/10 text-gray-800 dark:text-green-500 rounded-[0.3rem]">Pro Plan</span>
                </span>
                
                {model.isCustom && (
                  <div className="ml-auto">
                    <button
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                      onClick={(e) => openDeleteDialog(e, model.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent className="bg-gray-100 dark:bg-gray-800/20 text-gray-800 dark:text-gray-100 backdrop-blur-sm">
              <p>Only available in Pro Plan. <a onClick={() => navigate('/settings/account')} className="text-blue-500 hover:text-blue-600">Upgrade Now</a></p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    
    return (
      <div
        key={model.id}
        className="flex items-center py-2 px-3 cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/50 rounded-sm group"
        onClick={() => toggleModelEnabled(model.id)}
      >
        <div className="w-6 flex items-center justify-center">
          <div className={`w-4 h-4 border ${model.enabled ? 'bg-gray-300 dark:bg-gray-700 border-gray-700' : 'border-gray-600/50 bg-transparent'} rounded-sm flex items-center justify-center`}>
            {model.enabled && <Check className="w-3 h-3 text-black dark:text-white" />}
          </div>
        </div>
        
        <span className={`text-sm ml-2 ${model.enabled ? 'text-black dark:text-white' : 'text-gray-400'}`}>
          {model.name}
        </span>

        {model.isCustom && (
          <div className="ml-auto">
            <button
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              onClick={(e) => openDeleteDialog(e, model.id)}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6 text-gray-300">
      <div>
        <h1 className="text-2xl font-medium text-black dark:text-white">Model Names</h1>
        <p className="text-gray-700 dark:text-gray-400 text-sm mt-1">
          Add new models to agentkube. Often used to configure the latest OpenAI models or OpenRouter models.
        </p>
      </div>

      <div className="space-y-1">
        {models.map(model => renderModelItem(model))}

        {showAddInput ? (
          <div className="flex items-center mt-2">
            <input
              type="text"
              className="bg-transparent border border-gray-300 dark:border-gray-800/60 w-full py-2 px-3 rounded text-black dark:text-white text-sm focus:outline-none focus:border-gray-400 dark:focus:border-gray-600"
              placeholder="New model name"
              value={newModelName}
              onChange={(e) => setNewModelName(e.target.value)}
              onKeyPress={handleKeyPress}
              autoFocus
            />
            <Button
              className="ml-2 px-4 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-800 dark:text-white py-2 rounded text-sm"
              onClick={handleAddModel}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Model
            </Button>
          </div>
        ) : (
          <button
            className="flex items-center py-2 px-3 w-full mt-2 hover:bg-gray-300/50 dark:hover:bg-gray-800/50 rounded-sm text-gray-500 dark:text-gray-400"
            onClick={() => setShowAddInput(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            <span className="text-sm">Add model</span>
          </button>
        )}
      </div>

      <ModelConfig />

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-md bg-gray-100 dark:bg-gray-800/20 backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Confirm Delete
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the model <span className="font-medium">{getModelNameToDelete()}</span>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-start">
            <div className="flex gap-2 w-full justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={cancelDelete}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={confirmDelete}
              >
                Delete
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ModelConfiguration;