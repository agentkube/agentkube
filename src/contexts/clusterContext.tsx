import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { KubeContext } from '@/types/cluster';
import { getKubeContexts } from '@/api/cluster';
import { useToast } from '@/hooks/use-toast';

interface ClusterContextType {
  contexts: KubeContext[];
  currentContext: KubeContext | null;
  loading: boolean;
  error: string | null;
  fullWidth: boolean;
  refreshInterval: number;
  fetchContexts: () => Promise<void>;
  setCurrentContext: (context: KubeContext) => void;
  refreshContexts: () => Promise<void>;
  setFullWidth: (fullWidth: boolean) => void;
  setRefreshInterval: (interval: number) => void;
}

const ClusterContext = createContext<ClusterContextType | undefined>(undefined);

interface ClusterProviderProps {
  children: ReactNode;
}

export const ClusterProvider: React.FC<ClusterProviderProps> = ({ children }) => {
  const [refreshInterval, setRefreshIntervalState] = useState<number>(() => {
    const stored = localStorage.getItem('refresh_interval');
    return stored ? JSON.parse(stored) : 20000;
  });
  const [contexts, setContexts] = useState<KubeContext[]>([]);
  const [currentContext, setCurrentContext] = useState<KubeContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fullWidth, setFullWidthState] = useState<boolean>(() => {
    const stored = localStorage.getItem('full-width');
    return stored ? JSON.parse(stored) : false;
  });


  const { toast } = useToast();

  const setRefreshInterval = (interval: number) => {
    setRefreshIntervalState(interval);
    localStorage.setItem('refresh_interval', JSON.stringify(interval));
  };

  // Store selected context in localStorage
  const storageKey = 'current-kube-context';

  const handleSetFullWidth = (isFullWidth: boolean) => {
    setFullWidthState(isFullWidth);
    localStorage.setItem('full-width', JSON.stringify(isFullWidth));
  };

  // Function to fetch all available kube contexts
  const fetchContexts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const fetchedContexts = await getKubeContexts();
      setContexts(fetchedContexts);
      
      // Check if we have a stored context
      const storedContextName = localStorage.getItem(storageKey);
      
      // If we have a stored context, try to find it in the fetched contexts
      if (storedContextName) {
        const foundContext = fetchedContexts.find(ctx => ctx.name === storedContextName);
        if (foundContext) {
          setCurrentContext(foundContext);
        } else if (fetchedContexts.length > 0) {
          // If stored context not found, set the first available one
          setCurrentContext(fetchedContexts[0]);
          localStorage.setItem(storageKey, fetchedContexts[0].name);
        }
      } else if (fetchedContexts.length > 0) {
        // If no stored context, set the first available one
        setCurrentContext(fetchedContexts[0]);
        localStorage.setItem(storageKey, fetchedContexts[0].name);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch Kubernetes contexts';
      setError(errorMessage);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Function to refresh contexts
  const refreshContexts = useCallback(async () => {
    await fetchContexts();
  }, [fetchContexts]);

  // Fetch contexts on mount
  React.useEffect(() => {
    fetchContexts();
  }, [fetchContexts]);

  React.useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const fetchedContexts = await getKubeContexts();
        
        setContexts(prev => {
          // Deep comparison to avoid unnecessary updates
          const hasChanged = prev.length !== fetchedContexts.length || 
            prev.some((ctx, index) => 
              !fetchedContexts[index] || 
              ctx.name !== fetchedContexts[index].name ||
              ctx.kubeContext !== fetchedContexts[index].kubeContext ||
              ctx.server !== fetchedContexts[index].server
            );
          
          return hasChanged ? fetchedContexts : prev;
        });
      } catch (err) {
        console.error('Failed to refresh contexts:', err);
      }
    }, refreshInterval);
  
    return () => clearInterval(interval);
  }, [refreshInterval]);

  const handleSetCurrentContext = (context: KubeContext) => {
    setCurrentContext(context);
    localStorage.setItem(storageKey, context.name);
    toast({
      title: "Context Changed",
      description: `Switched to: ${context.name}`,
    });
  };

  const value = {
    contexts,
    currentContext,
    loading,
    error,
    fullWidth,
    refreshInterval,
    fetchContexts,
    setCurrentContext: handleSetCurrentContext,
    refreshContexts,
    setFullWidth: handleSetFullWidth,
    setRefreshInterval,
  };

  return (
    <ClusterContext.Provider value={value}>
      {children}
    </ClusterContext.Provider>
  );
};

export const useCluster = () => {
  const context = useContext(ClusterContext);
  if (context === undefined) {
    throw new Error('useCluster must be used within a ClusterProvider');
  }
  return context;
};