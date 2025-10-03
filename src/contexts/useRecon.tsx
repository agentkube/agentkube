import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getAgentReconMode, updateAgentReconMode } from '@/api/settings';
import { toast } from '@/hooks/use-toast';

interface ReconModeContextType {
  isReconMode: boolean;
  isLoading: boolean;
  toggleReconMode: () => Promise<void>;
  setReconMode: (enabled: boolean) => Promise<void>;
  refreshReconMode: () => Promise<void>;
  checkReconModeForOperation: () => Promise<void>;
}

const ReconModeContext = createContext<ReconModeContextType | undefined>(undefined);

interface ReconModeProviderProps {
  children: ReactNode;
}

export const ReconModeProvider: React.FC<ReconModeProviderProps> = ({ children }) => {
  const [isReconMode, setIsReconModeState] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Load initial recon mode state
  useEffect(() => {
    refreshReconMode();
  }, []);

  const refreshReconMode = async (): Promise<void> => {
    try {
      const response = await getAgentReconMode();
      setIsReconModeState(response.recon);
    } catch (error) {
      console.error('Failed to fetch recon mode:', error);
      // Default to false if we can't fetch the status
      setIsReconModeState(false);
    }
  };

  const setReconMode = async (enabled: boolean): Promise<void> => {
    if (isLoading) return;

    try {
      setIsLoading(true);
      await updateAgentReconMode(enabled);
      setIsReconModeState(enabled);
      
      // Show toast notification
      toast({
        title: enabled ? "Recon Mode Enabled" : "Recon Mode Disabled",
        description: enabled 
          ? "All modifications blocked, read-only access only." 
          : "All operations are now allowed. Full access restored.",
        variant: enabled ? "recon" : "success"
      });
    } catch (error) {
      console.error('Failed to update recon mode:', error);
      toast({
        title: "Error",
        description: "Failed to update recon mode setting",
        variant: "destructive"
      });
      // Revert on error
      await refreshReconMode();
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const toggleReconMode = async (): Promise<void> => {
    await setReconMode(!isReconMode);
  };

  const checkReconModeForOperation = async (): Promise<void> => {
    // Refresh the current state to ensure we have the latest
    await refreshReconMode();
    
    if (isReconMode) {
      toast({
        title: "Operation Blocked",
        description: "Recon mode is enabled. Disable recon mode to perform this action.",
        variant: "destructive"
      });
      
      throw new Error('Operation blocked: Recon mode is enabled. Disable recon mode to perform this action.');
    }
  };

  const value: ReconModeContextType = {
    isReconMode,
    isLoading,
    toggleReconMode,
    setReconMode,
    refreshReconMode,
    checkReconModeForOperation
  };

  return (
    <ReconModeContext.Provider value={value}>
      {children}
    </ReconModeContext.Provider>
  );
};

export const useReconMode = (): ReconModeContextType => {
  const context = useContext(ReconModeContext);
  if (context === undefined) {
    throw new Error('useReconMode must be used within a ReconModeProvider');
  }
  return context;
};

export default useReconMode;