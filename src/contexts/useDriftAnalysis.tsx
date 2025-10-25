import React, { createContext, useContext, useState, useCallback } from 'react';

interface DriftAnalysisContextType {
  baselineResource: string;
  comparedResources: string[];
  isOpen: boolean;
  addToDriftCheck: (resourceId: string) => void;
  removeFromDriftCheck: (resourceId: string) => void;
  clearDriftCheck: () => void;
  openDriftAnalysis: () => void;
  closeDriftAnalysis: () => void;
  setBaselineResource: (resourceId: string) => void;
  setComparedResources: (resourceIds: string[]) => void;
}

const DriftAnalysisContext = createContext<DriftAnalysisContextType | undefined>(undefined);

export const DriftAnalysisProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [baselineResource, setBaselineResourceState] = useState<string>('');
  const [comparedResources, setComparedResourcesState] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const addToDriftCheck = useCallback((resourceId: string) => {
    // If no baseline is set, this becomes the baseline
    if (!baselineResource) {
      setBaselineResourceState(resourceId);
    } else if (!comparedResources.includes(resourceId) && resourceId !== baselineResource) {
      // Add to compared resources if not already there and not the baseline
      setComparedResourcesState(prev => [...prev, resourceId]);
    }
  }, [baselineResource, comparedResources]);

  const removeFromDriftCheck = useCallback((resourceId: string) => {
    if (resourceId === baselineResource) {
      // If removing baseline, promote first compared resource to baseline
      if (comparedResources.length > 0) {
        setBaselineResourceState(comparedResources[0]);
        setComparedResourcesState(prev => prev.slice(1));
      } else {
        setBaselineResourceState('');
      }
    } else {
      // Remove from compared resources
      setComparedResourcesState(prev => prev.filter(id => id !== resourceId));
    }
  }, [baselineResource, comparedResources]);

  const clearDriftCheck = useCallback(() => {
    setBaselineResourceState('');
    setComparedResourcesState([]);
  }, []);

  const openDriftAnalysis = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeDriftAnalysis = useCallback(() => {
    setIsOpen(false);
  }, []);

  const setBaselineResource = useCallback((resourceId: string) => {
    setBaselineResourceState(resourceId);
  }, []);

  const setComparedResources = useCallback((resourceIds: string[]) => {
    setComparedResourcesState(resourceIds);
  }, []);

  return (
    <DriftAnalysisContext.Provider
      value={{
        baselineResource,
        comparedResources,
        isOpen,
        addToDriftCheck,
        removeFromDriftCheck,
        clearDriftCheck,
        openDriftAnalysis,
        closeDriftAnalysis,
        setBaselineResource,
        setComparedResources,
      }}
    >
      {children}
    </DriftAnalysisContext.Provider>
  );
};

export const useDriftAnalysis = () => {
  const context = useContext(DriftAnalysisContext);
  if (context === undefined) {
    throw new Error('useDriftAnalysis must be used within a DriftAnalysisProvider');
  }
  return context;
};
