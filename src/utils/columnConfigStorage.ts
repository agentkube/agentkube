import { ColumnConfig } from '@/types/resource-filter';

const STORAGE_KEY = 'agentkube_column_config';

type ColumnConfigMap = {
  [resourceType: string]: { key: string; visible: boolean }[];
};

const getAllStoredConfigs = (): ColumnConfigMap => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.warn('Failed to load stored column configs:', error);
    return {};
  }
};

const saveAllConfigs = (configs: ColumnConfigMap): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
  } catch (error) {
    console.warn('Failed to save column configs:', error);
  }
};

export const getStoredColumnConfig = (resourceType: string, defaultConfig: ColumnConfig[]): ColumnConfig[] => {
  try {
    const allConfigs = getAllStoredConfigs();
    const storedConfig = allConfigs[resourceType];
    
    if (storedConfig) {
      // Merge stored config with default config to handle new columns and nested structures
      const mergedConfig = defaultConfig.map(defaultCol => {
        const storedCol = storedConfig.find(col => col.key === defaultCol.key);
        
        if (storedCol) {
          const merged = { ...defaultCol, visible: storedCol.visible };
          
          // Handle nested children
          if (defaultCol.children) {
            merged.children = defaultCol.children.map(defaultChild => {
              const storedChild = storedConfig.find(col => col.key === defaultChild.key);
              return storedChild ? { ...defaultChild, visible: storedChild.visible } : defaultChild;
            });
          }
          
          return merged;
        }
        
        return defaultCol;
      });
      
      return mergedConfig;
    }
  } catch (error) {
    console.warn('Failed to load stored column config:', error);
  }
  
  return defaultConfig;
};

export const saveColumnConfig = (resourceType: string, config: ColumnConfig[]): void => {
  try {
    const allConfigs = getAllStoredConfigs();
    
    // Flatten the config to store both parent and child columns
    const configToStore: { key: string; visible: boolean }[] = [];
    
    config.forEach(col => {
      // Store the parent column
      configToStore.push({ key: col.key, visible: col.visible });
      
      // Store child columns if they exist
      if (col.children) {
        col.children.forEach(child => {
          configToStore.push({ key: child.key, visible: child.visible });
        });
      }
    });
    
    allConfigs[resourceType] = configToStore;
    
    saveAllConfigs(allConfigs);
  } catch (error) {
    console.warn('Failed to save column config:', error);
  }
};

export const clearColumnConfig = (resourceType: string): void => {
  try {
    const allConfigs = getAllStoredConfigs();
    delete allConfigs[resourceType];
    saveAllConfigs(allConfigs);
  } catch (error) {
    console.warn('Failed to clear column config:', error);
  }
};