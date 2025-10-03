import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { KubeContext, RecentConnection } from '@/types/cluster';
import { getKubeContexts } from '@/api/cluster';
import { useToast } from '@/hooks/use-toast';

interface ClusterContextType {
  contexts: KubeContext[];
  currentContext: KubeContext | null;
  loading: boolean;
  error: string | null;
  fullWidth: boolean;
  refreshInterval: number;
  recentConnections: RecentConnection[];
  fetchContexts: () => Promise<void>;
  setCurrentContext: (context: KubeContext) => void;
  refreshContexts: () => Promise<void>;
  setFullWidth: (fullWidth: boolean) => void;
  setRefreshInterval: (interval: number) => void;
  addToRecentConnections: (context: KubeContext) => void;
  removeFromRecentConnections: (contextName: string) => void;
  updateRecentConnectionName: (oldName: string, newName: string) => void;
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

  const [recentConnections, setRecentConnections] = useState<RecentConnection[]>(() => {
    const stored = localStorage.getItem('recent-connected-clusters');
    return stored ? JSON.parse(stored) : [];
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

  // Recent connections cache management
  const addToRecentConnections = useCallback((context: KubeContext) => {
    setRecentConnections(prev => {
      // Remove existing entry if present
      const filtered = prev.filter(conn => conn.kubeContext.name !== context.name);
      
      // Add to front with current timestamp
      const newConnection: RecentConnection = {
        kubeContext: context,
        connectedAt: new Date().toISOString()
      };
      
      // Keep only last 3 entries
      const updated = [newConnection, ...filtered].slice(0, 3);
      
      // Save to localStorage
      localStorage.setItem('recent-connected-clusters', JSON.stringify(updated));
      
      return updated;
    });
  }, []);

  const removeFromRecentConnections = useCallback((contextName: string) => {
    setRecentConnections(prev => {
      const filtered = prev.filter(conn => conn.kubeContext.name !== contextName);
      localStorage.setItem('recent-connected-clusters', JSON.stringify(filtered));
      return filtered;
    });
  }, []);

  const updateRecentConnectionName = useCallback((oldName: string, newName: string) => {
    setRecentConnections(prev => {
      const updated = prev.map(conn => 
        conn.kubeContext.name === oldName 
          ? { 
              ...conn, 
              kubeContext: { ...conn.kubeContext, name: newName }
            }
          : conn
      );
      localStorage.setItem('recent-connected-clusters', JSON.stringify(updated));
      return updated;
    });
  }, []);

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

  // fetch contexts
  useEffect(() => {
    fetchContexts();
  }, [fetchContexts]);


  const handleSetCurrentContext = (context: KubeContext) => {
    setCurrentContext(context);
    localStorage.setItem(storageKey, context.name);
    
    // Add to recent connections cache
    addToRecentConnections(context);
    
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
    recentConnections,
    fetchContexts,
    setCurrentContext: handleSetCurrentContext,
    refreshContexts,
    setFullWidth: handleSetFullWidth,
    setRefreshInterval,
    addToRecentConnections,
    removeFromRecentConnections,
    updateRecentConnectionName,
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