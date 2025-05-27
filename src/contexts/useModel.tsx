import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { getModels, createModel, updateModel, deleteModel, toggleModelEnabled, Model, ModelCreate, ModelUpdate } from '@/api/models';
import { useAuth } from '@/contexts/useAuth';

interface ModelsContextType {
  models: Model[];
  isLoading: boolean;
  error: string | null;
  selectedModel: string;
  setSelectedModel: (modelId: string) => void;
  enabledModels: Model[];
  refreshModels: () => Promise<void>;
  addModel: (model: ModelCreate) => Promise<Model>;
  updateModelById: (modelId: string, modelData: ModelUpdate) => Promise<Model>;
  removeModel: (modelId: string) => Promise<boolean>;
  toggleModel: (modelId: string, enabled: boolean) => Promise<Model>;
}

const ModelsContext = createContext<ModelsContextType | undefined>(undefined);

export const ModelsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [models, setModels] = useState<Model[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const { user } = useAuth();
  const isPremiumUser = user?.isLicensed || false;
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Filter models based on enabled status
  const enabledModels = models.filter(model => 
    model.enabled && (!model.premiumOnly || (model.premiumOnly && isPremiumUser))
  );

  const refreshModels = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const fetchedModels = await getModels();
      setModels(fetchedModels);
      
      // Select a default model if none is selected
      if (!selectedModel && fetchedModels.length > 0) {
        const defaultModel = fetchedModels.find(model => 
          model.enabled && (!model.premiumOnly || (model.premiumOnly && isPremiumUser))
        );
        
        if (defaultModel) {
          setSelectedModel(`${defaultModel.provider}/${defaultModel.id}`);
        }
      }
    } catch (err) {
      console.error('Error fetching models:', err);
      setError('Failed to load models. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  // Polling logic - fetch models every 5 seconds
  useEffect(() => {
    // Initial fetch
    refreshModels();
    
    // Set up polling
    pollingTimerRef.current = setInterval(() => {
      refreshModels();
    }, 5000);

    // Cleanup function
    return () => {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
      }
    };
  }, []);

  // Add a new model
  const addModel = async (modelData: ModelCreate): Promise<Model> => {
    try {
      const newModel = await createModel(modelData);
      await refreshModels();
      return newModel;
    } catch (err) {
      console.error('Error adding model:', err);
      setError('Failed to add model. Please try again.');
      throw err;
    }
  };

  // Update an existing model
  const updateModelById = async (modelId: string, modelData: ModelUpdate): Promise<Model> => {
    try {
      const updatedModel = await updateModel(modelId, modelData);
      await refreshModels();
      return updatedModel;
    } catch (err) {
      console.error(`Error updating model ${modelId}:`, err);
      setError('Failed to update model. Please try again.');
      throw err;
    }
  };

  // Remove a model
  const removeModel = async (modelId: string): Promise<boolean> => {
    try {
      await deleteModel(modelId);
      await refreshModels();
      return true;
    } catch (err) {
      console.error(`Error removing model ${modelId}:`, err);
      setError('Failed to remove model. Please try again.');
      return false;
    }
  };

  // Toggle model enabled status
  const toggleModel = async (modelId: string, enabled: boolean): Promise<Model> => {
    try {
      const updatedModel = await toggleModelEnabled(modelId, enabled);
      await refreshModels();
      return updatedModel;
    } catch (err) {
      console.error(`Error toggling model ${modelId}:`, err);
      setError('Failed to update model. Please try again.');
      throw err;
    }
  };

  // Update selected model if current selection becomes unavailable
  useEffect(() => {
    if (selectedModel && models.length > 0) {
      const [provider, modelId] = selectedModel.split('/');
      const currentModel = models.find(m => m.id === modelId && m.provider === provider);
      
      // If model is premium and user is not premium, or if model is not enabled
      if (
        !currentModel || 
        !currentModel.enabled || 
        (currentModel.premiumOnly && !isPremiumUser)
      ) {
        // Find first available enabled model
        const fallbackModel = models.find(m => 
          m.enabled && (!m.premiumOnly || (m.premiumOnly && isPremiumUser))
        );
        
        if (fallbackModel) {
          setSelectedModel(`${fallbackModel.provider}/${fallbackModel.id}`);
        }
      }
    }
  }, [models, selectedModel, isPremiumUser]);

  const value = {
    models,
    isLoading,
    error,
    selectedModel,
    setSelectedModel,
    enabledModels,
    refreshModels,
    addModel,
    updateModelById,
    removeModel,
    toggleModel
  };

  return (
    <ModelsContext.Provider value={value}>
      {children}
    </ModelsContext.Provider>
  );
};

export const useModels = (): ModelsContextType => {
  const context = useContext(ModelsContext);
  if (context === undefined) {
    throw new Error('useModels must be used within a ModelsProvider');
  }
  return context;
};