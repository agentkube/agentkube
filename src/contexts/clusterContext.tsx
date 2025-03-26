import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { KubeContext } from '@/types/cluster';
import { getKubeContexts } from '@/api/cluster';
import { useToast } from '@/hooks/use-toast';

interface ClusterContextType {
  contexts: KubeContext[];
  currentContext: KubeContext | null;
  loading: boolean;
  error: string | null;
  fetchContexts: () => Promise<void>;
  setCurrentContext: (context: KubeContext) => void;
  refreshContexts: () => Promise<void>;
}

const ClusterContext = createContext<ClusterContextType | undefined>(undefined);

interface ClusterProviderProps {
  children: ReactNode;
}

export const ClusterProvider: React.FC<ClusterProviderProps> = ({ children }) => {
  // State management for contexts
  const [contexts, setContexts] = useState<KubeContext[]>([]);
  const [currentContext, setCurrentContext] = useState<KubeContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Store selected context in localStorage
  const storageKey = 'current-kube-context';

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
    fetchContexts,
    setCurrentContext: handleSetCurrentContext,
    refreshContexts,
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