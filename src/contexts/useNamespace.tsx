import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getNamespaces } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';
import { V1Namespace } from '@kubernetes/client-node';

interface NamespaceContextType {
  namespaces: V1Namespace[];
  availableNamespaces: string[];
  selectedNamespaces: string[];
  setSelectedNamespaces: (namespaces: string[]) => void;
  loading: boolean;
  error: string | null;
}

const NamespaceContext = createContext<NamespaceContextType | undefined>(undefined);

export const NamespaceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [namespaces, setNamespaces] = useState<V1Namespace[]>([]);
  const [selectedNamespaces, setSelectedNamespaces] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { currentContext } = useCluster();

  useEffect(() => {
    const fetchNamespaces = async () => {
      if (!currentContext) {
        setError('No cluster context available');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const namespacesData = await getNamespaces(currentContext.name);
        setNamespaces(namespacesData);
        
        // Extract namespace names
        const namespaceNames = namespacesData
          .map(ns => ns.metadata?.name)
          .filter(Boolean) as string[];
        
        // Initially select all namespaces
        setSelectedNamespaces(namespaceNames);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch namespaces:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch namespaces');
      } finally {
        setLoading(false);
      }
    };

    fetchNamespaces();
  }, [currentContext]);

  // Get sorted list of available namespace names
  const availableNamespaces = namespaces
    .map(ns => ns.metadata?.name)
    .filter(Boolean) as string[];
    
  availableNamespaces.sort((a, b) => a.localeCompare(b));

  return (
    <NamespaceContext.Provider
      value={{
        namespaces,
        availableNamespaces,
        selectedNamespaces,
        setSelectedNamespaces,
        loading,
        error
      }}
    >
      {children}
    </NamespaceContext.Provider>
  );
};

export const useNamespace = () => {
  const context = useContext(NamespaceContext);
  if (context === undefined) {
    throw new Error('useNamespace must be used within a NamespaceProvider');
  }
  return context;
};