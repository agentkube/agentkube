const STORAGE_KEY = 'drift-analysis-state';

export interface DriftAnalysisState {
  baselineResource: string;
  comparedResources: string[];
  activeTab: 'attributes' | 'metrics';
  showOnlyDrift: boolean;
}

export const getStoredDriftState = (): DriftAnalysisState | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.warn('Failed to load drift analysis state:', error);
    return null;
  }
};

export const saveDriftState = (state: DriftAnalysisState): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Failed to save drift analysis state:', error);
  }
};

export const clearDriftState = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to clear drift analysis state:', error);
  }
};
