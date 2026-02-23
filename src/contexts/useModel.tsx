import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback } from 'react';
import {
  getModels,
  getAllModels,
  getProviders,
  enableModel as apiEnableModel,
  disableModel as apiDisableModel,
  connectProvider as apiConnectProvider,
  disconnectProvider as apiDisconnectProvider,
  searchModels as apiSearchModels,
  Model,
} from '@/api/models';
import type { ModelsDevProvider } from '@/types/llm';

interface ModelsContextType {
  // Enabled models (from settings.json)
  models: Model[];
  enabledModels: Model[];

  // All models from catalog (lazy-loaded)
  allModels: Model[];
  loadAllModels: () => Promise<void>;

  // Providers
  providers: ModelsDevProvider[];
  loadProviders: () => Promise<void>;

  // State
  isLoading: boolean;
  error: string | null;
  selectedModel: string;
  setSelectedModel: (modelId: string) => void;

  // Actions
  refreshModels: () => Promise<void>;
  enableModel: (providerId: string, modelId: string) => Promise<void>;
  disableModel: (providerId: string, modelId: string) => Promise<void>;
  searchModels: (query: string) => Promise<Model[]>;

  // Provider actions
  connectProvider: (providerId: string, apiKey: string, baseUrl?: string) => Promise<void>;
  disconnectProvider: (providerId: string) => Promise<void>;
}

const ModelsContext = createContext<ModelsContextType | undefined>(undefined);

export const ModelsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [models, setModels] = useState<Model[]>([]);
  const [allModels, setAllModels] = useState<Model[]>([]);
  const [providers, setProviders] = useState<ModelsDevProvider[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('');

  // All enabled models (same as models since backend only returns enabled ones)
  const enabledModels = models;

  const refreshModels = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const fetchedModels = await getModels();
      setModels(fetchedModels);

      // Select a default model if none is selected
      if (!selectedModel && fetchedModels.length > 0) {
        const defaultModel = fetchedModels[0];
        if (defaultModel) {
          setSelectedModel(defaultModel.full_id);
        }
      }
    } catch (err) {
      console.error('Error fetching models:', err);
      setError('Failed to load models. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedModel]);

  const loadAllModels = useCallback(async () => {
    try {
      const fetched = await getAllModels();
      setAllModels(fetched);
    } catch (err) {
      console.error('Error fetching all models:', err);
    }
  }, []);

  const loadProviders = useCallback(async () => {
    try {
      const fetched = await getProviders();
      setProviders(fetched);
    } catch (err) {
      console.error('Error fetching providers:', err);
    }
  }, []);

  // Fetch enabled models on mount
  useEffect(() => {
    refreshModels();
  }, []);

  // Enable a model
  const enableModel = useCallback(async (providerId: string, modelId: string) => {
    try {
      await apiEnableModel(providerId, modelId);
      await refreshModels();
      // Refresh allModels if loaded
      if (allModels.length > 0) {
        await loadAllModels();
      }
    } catch (err) {
      console.error('Error enabling model:', err);
      setError('Failed to enable model. Please try again.');
      throw err;
    }
  }, [refreshModels, allModels.length, loadAllModels]);

  // Disable a model
  const disableModel = useCallback(async (providerId: string, modelId: string) => {
    try {
      await apiDisableModel(providerId, modelId);
      await refreshModels();
      if (allModels.length > 0) {
        await loadAllModels();
      }
    } catch (err) {
      console.error('Error disabling model:', err);
      setError('Failed to disable model. Please try again.');
      throw err;
    }
  }, [refreshModels, allModels.length, loadAllModels]);

  // Search models
  const searchModels = useCallback(async (query: string): Promise<Model[]> => {
    try {
      return await apiSearchModels(query);
    } catch (err) {
      console.error('Error searching models:', err);
      return [];
    }
  }, []);

  // Connect a provider
  const connectProvider = useCallback(async (providerId: string, apiKey: string, baseUrl?: string) => {
    try {
      await apiConnectProvider(providerId, apiKey, baseUrl);
      // Refresh providers list to show updated connection status
      if (providers.length > 0) {
        await loadProviders();
      }
    } catch (err) {
      console.error('Error connecting provider:', err);
      setError('Failed to connect provider. Please try again.');
      throw err;
    }
  }, [providers.length, loadProviders]);

  // Disconnect a provider
  const disconnectProvider = useCallback(async (providerId: string) => {
    try {
      await apiDisconnectProvider(providerId);
      if (providers.length > 0) {
        await loadProviders();
      }
    } catch (err) {
      console.error('Error disconnecting provider:', err);
      setError('Failed to disconnect provider. Please try again.');
      throw err;
    }
  }, [providers.length, loadProviders]);

  // Update selected model if current selection becomes unavailable
  useEffect(() => {
    if (selectedModel && models.length > 0) {
      const currentFound = models.find(m => m.full_id === selectedModel);
      if (!currentFound) {
        // Selected model was removed — fall back to first enabled model
        const fallback = models[0];
        if (fallback) {
          setSelectedModel(fallback.full_id);
        }
      }
    }
  }, [models, selectedModel]);

  const value = useMemo(() => ({
    models,
    enabledModels,
    allModels,
    loadAllModels,
    providers,
    loadProviders,
    isLoading,
    error,
    selectedModel,
    setSelectedModel,
    refreshModels,
    enableModel,
    disableModel,
    searchModels,
    connectProvider,
    disconnectProvider,
  }), [
    models, enabledModels, allModels, loadAllModels,
    providers, loadProviders,
    isLoading, error, selectedModel,
    refreshModels, enableModel, disableModel, searchModels,
    connectProvider, disconnectProvider,
  ]);

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