import React, { useState } from 'react';
import { Check, Plus, X, Trash2, AlertTriangle, AlertCircle, Brain } from 'lucide-react';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/useAuth';
import { useModels } from '@/contexts/useModel';
import { RemediationConfiguration } from '@/components/custom';
import { DeepSeek, XAI, Gemini, MetaAI, OpenAI, Anthropic } from '@/assets/icons';

const getProviderIcon = (provider: string) => {
  const iconMap: Record<string, JSX.Element> = {
    'openai': <OpenAI size={14} />,
    'anthropic': <Anthropic size={14} />,
    'xai': <XAI size={14} />,
    'deepseek': <DeepSeek size={14} />,
    'google': <Gemini size={14} />,
    'meta': <MetaAI size={14} />,
  };

  return iconMap[provider.toLowerCase()] || <Brain size={12} />; // fallback icon
};

const ModelConfiguration = () => {
  const { models, toggleModel, addModel, removeModel } = useModels();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isPremiumUser = user?.isLicensed || false;

  const [showAddInput, setShowAddInput] = useState(false);
  const [newModelName, setNewModelName] = useState('');
  const [newModelProvider, setNewModelProvider] = useState('');

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [modelToDelete, setModelToDelete] = useState<string | null>(null);

  const toggleModelEnabled = async (modelId: string) => {
    const modelToToggle = models.find(model => model.id === modelId);

    if (!modelToToggle) return;

    if (modelToToggle.premiumOnly && !isPremiumUser) {
      return;
    }

    try {
      await toggleModel(modelId, !modelToToggle.enabled);
    } catch (error) {
      console.error('Error toggling model:', error);
    }
  };

  // Add new model
  const handleAddModel = async () => {
    if (newModelName.trim()) {
      try {
        await addModel({
          id: newModelName.trim().toLowerCase().replace(/\s+/g, '-'),
          name: newModelName.trim(),
          provider: newModelProvider || 'custom',
          enabled: false,
          premium_only: false
        });

        setNewModelName('');
        setNewModelProvider('');
        setShowAddInput(false);
      } catch (error) {
        console.error('Error adding model:', error);
      }
    }
  };

  // Open delete confirmation dialog
  const openDeleteDialog = (e: React.MouseEvent, modelId: string) => {
    e.stopPropagation();
    setModelToDelete(modelId);
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (modelToDelete) {
      try {
        await removeModel(modelToDelete);
        setShowDeleteDialog(false);
        setModelToDelete(null);
      } catch (error) {
        console.error('Error deleting model:', error);
      }
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

  const renderModelItem = (model: typeof models[0]) => {
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
        <div className="w-6 flex items-center">
          <div className={`w-4 h-4 border ${model.enabled ? 'bg-gray-300 dark:bg-gray-700 border-gray-700' : 'border-gray-600/50 bg-transparent'} rounded-sm flex items-center justify-center`}>
            {model.enabled && <Check className="w-3 h-3 text-black dark:text-white" />}
          </div>
        </div>

        <div className='flex items-center'>
          {getProviderIcon(model.provider)}
          <span className={`text-sm ml-1 ${model.enabled ? 'text-black dark:text-white' : 'text-gray-400'}`}>
            {model.name}
          </span>
        </div>

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
        <h1 className="text-4xl font-[Anton] uppercase text-gray-700/20 dark:text-gray-200/20 font-medium">Model Names</h1>
        <p className="text-gray-700 dark:text-gray-400 text-sm mt-1">
          Add new models to agentkube. Often used to configure the latest OpenAI models or OpenRouter models.
        </p>
      </div>

      <div className="space-y-1">
        {models.map(model => renderModelItem(model))}

        {showAddInput ? (
          <div className="flex flex-col space-y-2 mt-2">
            <input
              type="text"
              className="bg-transparent dark:bg-gray-700/10 border border-gray-300 dark:border-gray-800/60 w-full py-2 px-3 rounded text-black dark:text-white text-sm focus:outline-none focus:border-gray-400 dark:focus:border-gray-600"
              placeholder="New model name"
              value={newModelName}
              onChange={(e) => setNewModelName(e.target.value)}
              onKeyPress={handleKeyPress}
              autoFocus
            />
            <div className="flex items-center space-x-2">
              <input
                type="text"
                className="bg-transparent dark:bg-gray-700/10 border border-gray-300 dark:border-gray-800/60 w-full py-2 px-3 rounded text-black dark:text-white text-sm focus:outline-none focus:border-gray-400 dark:focus:border-gray-600"
                placeholder="Provider (e.g. openai, anthropic)"
                value={newModelProvider}
                onChange={(e) => setNewModelProvider(e.target.value)}
              />
              <Button
                // variant="outline"
                className="px-4 py-2 rounded text-sm"
                onClick={handleAddModel}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Model
              </Button>
            </div>
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

      {/* Remediation Default Model */}
      <RemediationConfiguration />

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