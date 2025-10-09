import type { ColumnConfig } from '@/components/custom/resourcefiltersidebar/resourcefiltersidebar.component';

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
      // Merge stored config with default config to handle new columns
      const mergedConfig = defaultConfig.map(defaultCol => {
        const storedCol = storedConfig.find(col => col.key === defaultCol.key);
        return storedCol ? { ...defaultCol, visible: storedCol.visible } : defaultCol;
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
    
    // Only store the essential data (key and visible state)
    const configToStore = config.map(({ key, visible }) => ({ key, visible }));
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