import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef, useLayoutEffect } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { getNamespaces } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';
import { V1Namespace } from '@kubernetes/client-node';
import { OPERATOR_WS_URL } from '@/config';

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

  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectionIdRef = useRef<string | null>(null);

  // Ref to track if all namespaces were selected
  const isAllSelectedRef = useRef<boolean>(false);

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

    // Update isAllSelectedRef
    isAllSelectedRef.current = namespaces.length > 0 && namespaces.length === availableNamespaces.length;
  }, [searchParams, setSearchParams, availableNamespaces]);

  const handleNamespaceEvent = useCallback((kubeEvent: any) => {
    const { type, object: namespace } = kubeEvent;

    if (!namespace || !namespace.metadata) return;

    setNamespaces(prevNamespaces => {
      const newNamespaces = [...prevNamespaces];
      const existingIndex = newNamespaces.findIndex(
        ns => ns.metadata?.name === namespace.metadata.name
      );

      switch (type) {
        case 'ADDED':
          if (existingIndex === -1) {
            newNamespaces.push(namespace);
            // If all namespaces were selected, include the new one too
            if (isAllSelectedRef.current) {
              const namespaceName = namespace.metadata?.name;
              if (namespaceName) {
                setSelectedNamespacesInternal(prev => [...prev, namespaceName]);
              }
            }
          }
          break;

        case 'MODIFIED':
          if (existingIndex !== -1) {
            newNamespaces[existingIndex] = namespace;
          }
          break;

        case 'DELETED':
          if (existingIndex !== -1) {
            newNamespaces.splice(existingIndex, 1);
            // If the deleted namespace was selected, remove it from selection
            const deletedName = namespace.metadata?.name;
            if (deletedName) {
              setSelectedNamespacesInternal(prev => prev.filter(name => name !== deletedName));
            }
          }
          break;

        case 'ERROR':
          console.error('Namespace watch error:', namespace.message);
          break;

        default:
          break;
      }
      return newNamespaces;
    });
  }, []);

  const connectWebSocket = useCallback(() => {
    if (!currentContext) return;

    const connectionId = currentContext.name;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && connectionIdRef.current === connectionId) {
      return;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    try {
      const clusterUrl = `${OPERATOR_WS_URL}/clusters/${currentContext.name}/api/v1/namespaces?watch=1`;
      const ws = new WebSocket(clusterUrl);
      wsRef.current = ws;
      connectionIdRef.current = connectionId;

      ws.onopen = () => {
        if (connectionIdRef.current === connectionId) {
          setWsConnected(true);
        }
      };

      ws.onmessage = (event) => {
        if (connectionIdRef.current !== connectionId) return;

        try {
          const kubeEvent = JSON.parse(event.data);
          if (kubeEvent.type && kubeEvent.object) {
            handleNamespaceEvent(kubeEvent);
          }
        } catch (err) {
          console.warn('Failed to parse namespace WebSocket message:', err);
        }
      };

      ws.onclose = (event) => {
        if (connectionIdRef.current === connectionId) {
          setWsConnected(false);
          wsRef.current = null;
          connectionIdRef.current = null;

          if (event.code !== 1000 && event.code !== 1001 && currentContext) {
            reconnectTimeoutRef.current = setTimeout(() => {
              connectWebSocket();
            }, 5000);
          }
        }
      };

      ws.onerror = (error) => {
        if (connectionIdRef.current === connectionId) {
          console.error('Namespace WebSocket error:', error);
          setWsConnected(false);
        }
      };
    } catch (err) {
      console.error('Failed to create namespace WebSocket:', err);
    }
  }, [currentContext, handleNamespaceEvent]);

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
          isAllSelectedRef.current = false;
        } else {
          // Initially select all namespaces
          setSelectedNamespacesInternal(namespaceNames);
          isAllSelectedRef.current = true;
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

    const initialize = async () => {
      await fetchNamespaces();
      // Start WebSocket for real-time updates after initial fetch
      setTimeout(() => {
        connectWebSocket();
      }, 200);
    };

    initialize();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [currentContext, connectWebSocket]);

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