import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef, useLayoutEffect } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
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
  isNamespacePickerOpen: boolean;
  openNamespacePicker: () => void;
  closeNamespacePicker: () => void;
}

const NamespaceContext = createContext<NamespaceContextType | undefined>(undefined);

export const NamespaceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [namespaces, setNamespaces] = useState<V1Namespace[]>([]);
  const [selectedNamespaces, setSelectedNamespacesInternal] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isNamespacePickerOpen, setIsNamespacePickerOpen] = useState(false);
  const { currentContext } = useCluster();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  // Ref to track if initial namespace fetch is complete
  const initialFetchComplete = useRef(false);

  // Track the last URL pathname+search to detect navigation
  const lastLocationRef = useRef<string>('');

  // Compute available namespaces
  const availableNamespaces = namespaces
    .map(ns => ns.metadata?.name)
    .filter(Boolean) as string[];
  availableNamespaces.sort((a, b) => a.localeCompare(b));

  // Get URL namespace
  const urlNamespace = searchParams.get('namespace');

  // Get current location key to detect navigation
  const currentLocationKey = location.pathname + location.search;

  // Sync URL namespace when navigation occurs (location changes)
  useLayoutEffect(() => {
    // Skip if namespaces haven't been loaded yet
    if (availableNamespaces.length === 0) return;

    // Only process if location has actually changed (navigation occurred)
    if (currentLocationKey === lastLocationRef.current) return;

    lastLocationRef.current = currentLocationKey;

    if (urlNamespace && availableNamespaces.includes(urlNamespace)) {
      // URL has a valid namespace - select only that namespace
      setSelectedNamespacesInternal([urlNamespace]);
    }
    // Note: If URL doesn't have namespace or it's invalid, keep current selection
  }, [currentLocationKey, urlNamespace, availableNamespaces]);

  // Wrapper for setSelectedNamespaces that also clears URL param
  const setSelectedNamespaces = useCallback((namespaces: string[]) => {
    setSelectedNamespacesInternal(namespaces);

    // Clear the namespace param from URL when user manually changes selection
    // This prevents the URL from overriding user's choice on next render
    const currentUrlNamespace = searchParams.get('namespace');
    if (currentUrlNamespace) {
      setSearchParams(params => {
        params.delete('namespace');
        return params;
      }, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Fetch namespaces only when cluster context changes
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

        // Check if there's a namespace query parameter in the URL
        const currentUrlNamespace = searchParams.get('namespace');

        if (currentUrlNamespace && namespaceNames.includes(currentUrlNamespace)) {
          // If URL has a specific namespace, select it
          setSelectedNamespacesInternal([currentUrlNamespace]);
        } else {
          // Initially select all namespaces
          setSelectedNamespacesInternal(namespaceNames);
        }

        // Update location ref after initial setup
        lastLocationRef.current = location.pathname + location.search;

        initialFetchComplete.current = true;
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

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Check for Ctrl+N or Cmd+N
    if ((e.ctrlKey || e.metaKey) && (e.key === 'n' || e.key === 'N')) {
      e.preventDefault(); // Prevent default browser behavior
      setIsNamespacePickerOpen(true);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const openNamespacePicker = () => setIsNamespacePickerOpen(true);
  const closeNamespacePicker = () => setIsNamespacePickerOpen(false);

  return (
    <NamespaceContext.Provider
      value={{
        namespaces,
        availableNamespaces,
        selectedNamespaces,
        setSelectedNamespaces,
        loading,
        error,
        isNamespacePickerOpen,
        openNamespacePicker,
        closeNamespacePicker
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