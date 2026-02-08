import { ORCHESTRATOR_URL } from '@/config';

export interface Model {
  id: string;
  name: string;
  provider: string;
  enabled: boolean;
  isCustom: boolean;
  premiumOnly: boolean;
}

export interface ModelCreate {
  id: string;
  name: string;
  provider: string;
  enabled?: boolean;
  premium_only?: boolean;
}

export interface ModelUpdate {
  name?: string;
  provider?: string;
  enabled?: boolean;
  premium_only?: boolean;
}

/**
 * Fetches all available models
 * @returns Promise with the list of models
 */
export const getModels = async (): Promise<Model[]> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/models`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data as Model[];
  } catch (error) {
    console.error('Error fetching models:', error);
    throw error;
  }
};

/**
 * Fetches a specific model by ID
 * @param modelId The ID of the model to fetch
 * @returns Promise with the model data
 */
export const getModel = async (modelId: string): Promise<Model> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/models/${modelId}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch model: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data as Model;
  } catch (error) {
    console.error(`Error fetching model ${modelId}:`, error);
    throw error;
  }
};

/**
 * Creates a new custom model
 * @param model The model data to create
 * @returns Promise with the created model
 */
export const createModel = async (model: ModelCreate): Promise<Model> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/models`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(model),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to create model: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data as Model;
  } catch (error) {
    console.error('Error creating model:', error);
    throw error;
  }
};

/**
 * Updates an existing model
 * @param modelId The ID of the model to update
 * @param model The model data to update
 * @returns Promise with the updated model
 */
export const updateModel = async (modelId: string, model: ModelUpdate): Promise<Model> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/models/${modelId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(model),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to update model: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data as Model;
  } catch (error) {
    console.error(`Error updating model ${modelId}:`, error);
    throw error;
  }
};

/**
 * Deletes a custom model
 * @param modelId The ID of the model to delete
 * @returns Promise with the deletion status
 */
export const deleteModel = async (modelId: string): Promise<{ status: string; message: string }> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/models/${modelId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to delete model: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Error deleting model ${modelId}:`, error);
    throw error;
  }
};

/**
 * Enables or disables a model
 * @param modelId The ID of the model to toggle
 * @param enabled Whether the model should be enabled or disabled
 * @returns Promise with the updated model
 */
export const toggleModelEnabled = async (modelId: string, enabled: boolean): Promise<Model> => {
  return updateModel(modelId, { enabled });
};