import React, { useState, useEffect, useMemo } from 'react';
import { getConfigMaps } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';
import { useNamespace } from '@/contexts/useNamespace';
import { V1ConfigMap } from '@kubernetes/client-node';
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, MoreVertical, Search, ArrowUpDown, ArrowUp, ArrowDown, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from 'react-router-dom';
import { calculateAge } from '@/utils/age';
import { NamespaceSelector, ErrorComponent } from '@/components/custom';
import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, Copy } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { deleteResource } from '@/api/internal/resources';

// Define sorting types
type SortDirection = 'asc' | 'desc' | null;
type SortField = 'name' | 'namespace' | 'dataCount' | 'size' | 'age' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

const ConfigMaps: React.FC = () => {
  const navigate = useNavigate();
  const { currentContext } = useCluster();
  const { selectedNamespaces } = useNamespace();
  const [configMaps, setConfigMaps] = useState<V1ConfigMap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // --- Start of Multi-select ---
  const [selectedConfigMaps, setSelectedConfigMaps] = useState<Set<string>>(new Set());
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [activeConfigMap, setActiveConfigMap] = useState<V1ConfigMap | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Cmd+F (Mac) or Ctrl+F (Windows)
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault(); 
        
        const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
        }
      }
    };
  
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  
  const handleConfigMapClick = (e: React.MouseEvent, configMap: V1ConfigMap) => {
    const configMapKey = `${configMap.metadata?.namespace}/${configMap.metadata?.name}`;

    if (e.metaKey || e.ctrlKey) {
      // Prevent navigation when using multi-select
      e.preventDefault();
      e.stopPropagation();

      setSelectedConfigMaps(prev => {
        const newSelection = new Set(prev);
        if (newSelection.has(configMapKey)) {
          newSelection.delete(configMapKey);
        } else {
          newSelection.add(configMapKey);
        }
        return newSelection;
      });
    } else if (!selectedConfigMaps.has(configMapKey)) {
      // Clear selection on regular click (unless clicking on already selected configMap)
      setSelectedConfigMaps(new Set());
      handleConfigMapDetails(configMap);
    } else {
      handleConfigMapDetails(configMap);
    }
  };

  // Add context menu handlers
  const handleContextMenu = (e: React.MouseEvent, configMap: V1ConfigMap) => {
    e.preventDefault();
    e.stopPropagation();

    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setActiveConfigMap(configMap);
    setShowContextMenu(true);

    // Multi-select support: if configMap isn't in selection, make it the only selection
    const configMapKey = `${configMap.metadata?.namespace}/${configMap.metadata?.name}`;
    if (!selectedConfigMaps.has(configMapKey)) {
      setSelectedConfigMaps(new Set([configMapKey]));
    }
  };

  // Close context menu when clicking outside and handle deselection
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Close context menu when clicking outside
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setShowContextMenu(false);
      }

      // Clear selection when clicking outside the table rows
      const target = event.target as Element;

      if (target instanceof Element) {
        const isTableClick = target.closest('table') !== null;
        const isTableHeadClick = target.closest('thead') !== null;
        const isOutsideTable = !isTableClick || isTableHeadClick;
        const isContextMenuClick = contextMenuRef.current?.contains(event.target as Node) || false;
        const isAlertDialogClick = document.querySelector('.dialog-root')?.contains(event.target as Node) || false;

        if (isOutsideTable && !isContextMenuClick && !isAlertDialogClick && selectedConfigMaps.size > 0) {
          setSelectedConfigMaps(new Set());
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedConfigMaps]);

  // Handle view action - only available for a single ConfigMap
  const handleViewConfigMap = () => {
    setShowContextMenu(false);

    if (activeConfigMap && activeConfigMap.metadata?.name && activeConfigMap.metadata?.namespace) {
      navigate(`/dashboard/explore/configmaps/${activeConfigMap.metadata.namespace}/${activeConfigMap.metadata.name}`);
    }
  };

  // Handle delete action
  const handleDeleteClick = () => {
    setShowContextMenu(false);
    setShowDeleteDialog(true);
  };

  // Perform actual deletion
  const deleteConfigMaps = async () => {
    setShowDeleteDialog(false);

    try {
      if (selectedConfigMaps.size === 0 && activeConfigMap) {
        // Delete single active ConfigMap
        await deleteConfigMap(activeConfigMap);
      } else {
        // Delete all selected ConfigMaps
        for (const configMapKey of selectedConfigMaps) {
          const [namespace, name] = configMapKey.split('/');
          const configMapToDelete = configMaps.find(cm =>
            cm.metadata?.namespace === namespace && cm.metadata?.name === name
          );

          if (configMapToDelete) {
            await deleteConfigMap(configMapToDelete);
          }
        }
      }

      // Clear selection after deletion
      setSelectedConfigMaps(new Set());

      // Refresh ConfigMap list after deletion
      if (currentContext && selectedNamespaces.length > 0) {
        const fetchConfigMaps = async () => {
          try {
            setLoading(true);

            // Fetch configmaps for each selected namespace
            const configMapPromises = selectedNamespaces.map(namespace =>
              getConfigMaps(currentContext.name, namespace)
            );

            const results = await Promise.all(configMapPromises);
            const allConfigMaps = results.flat();

            setConfigMaps(allConfigMaps);
            setError(null);
          } catch (err) {
            console.error('Failed to fetch configmaps:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch configmaps');
          } finally {
            setLoading(false);
          }
        };

        fetchConfigMaps();
      }

    } catch (error) {
      console.error('Failed to delete ConfigMap(s):', error);
      setError(error instanceof Error ? error.message : 'Failed to delete ConfigMap(s)');
    }
  };

  // Delete ConfigMap function
  const deleteConfigMap = async (configMap: V1ConfigMap) => {
    if (!currentContext || !configMap.metadata?.name || !configMap.metadata?.namespace) return;

    await deleteResource(
      currentContext.name,
      'configmaps',
      configMap.metadata.name,
      { namespace: configMap.metadata.namespace }
    );
  };

  // Render the context menu
  const renderContextMenu = () => {
    if (!showContextMenu || !contextMenuPosition) return null;

    // Calculate if we need to show the menu above or below the click position
    const windowHeight = window.innerHeight;
    const menuHeight = 150; // Approximate context menu height
    const shouldShowAbove = windowHeight - contextMenuPosition.y < menuHeight;

    return createPortal(
      <div
        ref={contextMenuRef}
        className="fixed z-50 min-w-[180px] bg-white dark:bg-[#0B0D13] backdrop-blur-sm rounded-md shadow-lg border border-gray-300 dark:border-gray-800/60 py-1 text-sm"
        style={{
          left: `${contextMenuPosition.x}px`,
          top: shouldShowAbove
            ? `${contextMenuPosition.y - menuHeight}px`
            : `${contextMenuPosition.y}px`,
        }}
      >
        <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 font-medium border-b border-gray-200 dark:border-gray-800/60">
          {selectedConfigMaps.size > 1
            ? `${selectedConfigMaps.size} ConfigMaps selected`
            : activeConfigMap?.metadata?.name || 'ConfigMap actions'}
        </div>

        <div
          className={`px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center ${selectedConfigMaps.size > 1 ? 'text-gray-400 dark:text-gray-600 pointer-events-none' : ''}`}
          onClick={selectedConfigMaps.size <= 1 ? handleViewConfigMap : undefined}
          title={selectedConfigMaps.size > 1 ? "Select only one ConfigMap to view" : ""}
        >
          <Eye className="h-4 w-4 mr-2" />
          View
        </div>

        <div
          className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center text-red-600 dark:text-red-400"
          onClick={handleDeleteClick}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete {selectedConfigMaps.size > 1 ? `(${selectedConfigMaps.size})` : ''}
        </div>
      </div>,
      document.body
    );
  };

  // Delete confirmation dialog
  const renderDeleteDialog = () => {
    return (
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-gray-100 dark:bg-[#0B0D13]">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm ConfigMap Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedConfigMaps.size > 1
                ? `${selectedConfigMaps.size} ConfigMaps`
                : `"${activeConfigMap?.metadata?.name}"`}?
              This action cannot be undone.

              <div className="mt-2 text-amber-600 dark:text-amber-400">
                Warning: Deleting a ConfigMap may impact applications that depend on it.
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteConfigMaps}
              className="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  };
  // --- End of Multi-select ---

  // Add sorting state
  const [sort, setSort] = useState<SortState>({
    field: null,
    direction: null
  });

  // Fetch configmaps for all selected namespaces
  useEffect(() => {
    const fetchAllConfigMaps = async () => {
      if (!currentContext || selectedNamespaces.length === 0) {
        setConfigMaps([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // If no namespaces are selected, fetch from all namespaces
        if (selectedNamespaces.length === 0) {
          const configMapsData = await getConfigMaps(currentContext.name);
          setConfigMaps(configMapsData);
          return;
        }

        // Fetch configmaps for each selected namespace
        const configMapPromises = selectedNamespaces.map(namespace =>
          getConfigMaps(currentContext.name, namespace)
        );

        const results = await Promise.all(configMapPromises);

        // Flatten the array of configmap arrays
        const allConfigMaps = results.flat();
        setConfigMaps(allConfigMaps);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch configmaps:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch configmaps');
      } finally {
        setLoading(false);
      }
    };

    fetchAllConfigMaps();
  }, [currentContext, selectedNamespaces]);

  // Filter configmaps based on search query
  const filteredConfigMaps = useMemo(() => {
    if (!searchQuery.trim()) {
      return configMaps;
    }

    const lowercaseQuery = searchQuery.toLowerCase();

    return configMaps.filter(configMap => {
      const name = configMap.metadata?.name?.toLowerCase() || '';
      const namespace = configMap.metadata?.namespace?.toLowerCase() || '';
      const labels = configMap.metadata?.labels || {};
      const annotations = configMap.metadata?.annotations || {};
      const data = configMap.data || {};
      const binaryData = configMap.binaryData || {};

      // Check if any data key or value contains the query
      const dataMatches = Object.entries(data).some(
        ([key, value]) =>
          key.toLowerCase().includes(lowercaseQuery) ||
          (typeof value === 'string' && value.toLowerCase().includes(lowercaseQuery))
      );

      // Check if any binary data key contains the query
      const binaryDataMatches = Object.keys(binaryData).some(
        key => key.toLowerCase().includes(lowercaseQuery)
      );

      // Check if name, namespace, or any data contains the query
      if (
        name.includes(lowercaseQuery) ||
        namespace.includes(lowercaseQuery) ||
        dataMatches ||
        binaryDataMatches
      ) {
        return true;
      }

      // Check if any label contains the query
      const labelMatches = Object.entries(labels).some(
        ([key, value]) =>
          key.toLowerCase().includes(lowercaseQuery) ||
          (typeof value === 'string' && value.toLowerCase().includes(lowercaseQuery))
      );

      // Check if any annotation contains the query
      const annotationMatches = Object.entries(annotations).some(
        ([key, value]) =>
          key.toLowerCase().includes(lowercaseQuery) ||
          (typeof value === 'string' && value.toLowerCase().includes(lowercaseQuery))
      );

      return labelMatches || annotationMatches;
    });
  }, [configMaps, searchQuery]);

  // Sort configmaps based on sort state
  const sortedConfigMaps = useMemo(() => {
    if (!sort.field || !sort.direction) {
      return filteredConfigMaps;
    }

    return [...filteredConfigMaps].sort((a, b) => {
      const sortMultiplier = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'name':
          return (a.metadata?.name || '').localeCompare(b.metadata?.name || '') * sortMultiplier;

        case 'namespace':
          return (a.metadata?.namespace || '').localeCompare(b.metadata?.namespace || '') * sortMultiplier;

        case 'dataCount': {
          const countA = countDataEntries(a);
          const countB = countDataEntries(b);
          return (countA - countB) * sortMultiplier;
        }

        case 'size': {
          const sizeA = calculateConfigMapSize(a);
          const sizeB = calculateConfigMapSize(b);
          return (sizeA - sizeB) * sortMultiplier;
        }

        case 'age': {
          const timeA = a.metadata?.creationTimestamp ? new Date(a.metadata.creationTimestamp).getTime() : 0;
          const timeB = b.metadata?.creationTimestamp ? new Date(b.metadata.creationTimestamp).getTime() : 0;
          return (timeA - timeB) * sortMultiplier;
        }

        default:
          return 0;
      }
    });
  }, [filteredConfigMaps, sort.field, sort.direction]);

  // Helper to count total data entries (data + binaryData)
  const countDataEntries = (configMap: V1ConfigMap): number => {
    const dataCount = Object.keys(configMap.data || {}).length;
    const binaryDataCount = Object.keys(configMap.binaryData || {}).length;
    return dataCount + binaryDataCount;
  };

  // Helper to calculate the total size of the ConfigMap data
  const calculateConfigMapSize = (configMap: V1ConfigMap): number => {
    let totalSize = 0;

    // Calculate size of string data
    const data = configMap.data || {};
    Object.values(data).forEach(value => {
      if (typeof value === 'string') {
        totalSize += value.length;
      }
    });

    // Calculate size of binary data (if any)
    const binaryData = configMap.binaryData || {};
    Object.values(binaryData).forEach(value => {
      if (typeof value === 'string') {
        // Binary data is base64 encoded, so estimate actual size
        totalSize += Math.floor((value.length * 3) / 4); // Approximate binary size from base64
      }
    });

    return totalSize;
  };

  // Format size for display
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) {
      return `${bytes} B`;
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(2)} KiB`;
    } else {
      return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
    }
  };

  const handleConfigMapDetails = (configMap: V1ConfigMap) => {
    if (configMap.metadata?.name && configMap.metadata?.namespace) {
      navigate(`/dashboard/explore/configmaps/${configMap.metadata.namespace}/${configMap.metadata.name}`);
    }
  };

  // Format data keys for display
  const formatDataKeys = (configMap: V1ConfigMap): JSX.Element => {
    const dataKeys = Object.keys(configMap.data || {});
    const binaryDataKeys = Object.keys(configMap.binaryData || {});
    const allKeys = [...dataKeys, ...binaryDataKeys];

    if (allKeys.length === 0) {
      return <span className="text-gray-500 dark:text-gray-400">No data</span>;
    }

    // If there are too many keys, show a summary
    if (allKeys.length > 3) {
      return (
        <div>
          <div className="mb-1">{allKeys.slice(0, 3).join(', ')}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            +{allKeys.length - 3} more keys
          </div>
        </div>
      );
    }

    return <div>{allKeys.join(', ')}</div>;
  };

  // Handle column sort click
  const handleSort = (field: SortField) => {
    setSort(prevSort => {
      // If clicking the same field
      if (prevSort.field === field) {
        // Toggle direction: asc -> desc -> null -> asc
        if (prevSort.direction === 'asc') {
          return { field, direction: 'desc' };
        } else if (prevSort.direction === 'desc') {
          return { field: null, direction: null };
        } else {
          return { field, direction: 'asc' };
        }
      }
      // If clicking a new field, default to ascending
      return { field, direction: 'asc' };
    });
  };

  // Render sort indicator
  const renderSortIndicator = (field: SortField) => {
    if (sort.field !== field) {
      return <ArrowUpDown className="ml-1 h-4 w-4 inline opacity-10" />;
    }

    if (sort.direction === 'asc') {
      return <ArrowUp className="ml-1 h-4 w-4 inline text-blue-500" />;
    }

    if (sort.direction === 'desc') {
      return <ArrowDown className="ml-1 h-4 w-4 inline text-blue-500" />;
    }

    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorComponent message={error} />
    );
  }

  return (
    <div className="p-6 space-y-6
        max-h-[92vh] overflow-y-auto
          scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent
          [&::-webkit-scrollbar]:w-1.5 
          [&::-webkit-scrollbar-track]:bg-transparent 
          [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">
      <div className='flex items-center justify-between md:flex-row gap-4 items-start md:items-end'>
        <div>
          <h1 className='text-5xl font-[Anton] uppercase font-bold text-gray-800/30 dark:text-gray-700/50'>ConfigMaps</h1>
          <div className="w-full md:w-96 mt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
              <Input
                type="text"
                placeholder="Search by name, namespace, or data key..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </div>

        <div className="w-full md:w-96">
          <div className="text-sm font-medium mb-2">Namespaces</div>
          <NamespaceSelector />
        </div>
      </div>

      {/* No results message */}
      {sortedConfigMaps.length === 0 && (
        <Alert className="my-6">
          <AlertDescription>
            {searchQuery
              ? `No configmaps matching "${searchQuery}"`
              : selectedNamespaces.length === 0
                ? "Please select at least one namespace"
                : "No configmaps found in the selected namespaces"}
          </AlertDescription>
        </Alert>
      )}

      {/* ConfigMaps table */}
      {sortedConfigMaps.length > 0 && (
        <Card className="bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <div className="rounded-md border">
            {renderContextMenu()}
            {renderDeleteDialog()}
            <Table className="bg-gray-50 dark:bg-transparent rounded-2xl">
              <TableHeader>
                <TableRow className="border-b border-gray-400 dark:border-gray-800/80">
                  <TableHead
                    className="cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('name')}
                  >
                    Name {renderSortIndicator('name')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('namespace')}
                  >
                    Namespace {renderSortIndicator('namespace')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:text-blue-500 w-[100px]"
                    onClick={() => handleSort('dataCount')}
                  >
                    Data {renderSortIndicator('dataCount')}
                  </TableHead>
                  <TableHead>
                    Keys
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500 w-[100px]"
                    onClick={() => handleSort('size')}
                  >
                    Size {renderSortIndicator('size')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('age')}
                  >
                    Age {renderSortIndicator('age')}
                  </TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedConfigMaps.map((configMap) => (
                  <TableRow
                    key={`${configMap.metadata?.namespace}-${configMap.metadata?.name}`}
                    className={`bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30 ${selectedConfigMaps.has(`${configMap.metadata?.namespace}/${configMap.metadata?.name}`) ? 'bg-blue-50 dark:bg-gray-800/30' : ''
                      }`}
                    onClick={(e) => handleConfigMapClick(e, configMap)}
                    onContextMenu={(e) => handleContextMenu(e, configMap)}
                  >
                    <TableCell className="font-medium" onClick={() => handleConfigMapDetails(configMap)}>
                      <div className="hover:text-blue-500 hover:underline">
                        {configMap.metadata?.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="hover:text-blue-500 hover:underline" onClick={() => navigate(`/dashboard/explore/namespaces`)}>
                        {configMap.metadata?.namespace}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="px-2 py-1 rounded-[0.3rem] text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
                        {countDataEntries(configMap)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {formatDataKeys(configMap)}
                    </TableCell>
                    <TableCell className="text-center">
                      {formatSize(calculateConfigMapSize(configMap))}
                    </TableCell>
                    <TableCell className="text-center">
                      {calculateAge(configMap.metadata?.creationTimestamp?.toString())}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          // Implement actions menu if needed
                        }}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
};

export default ConfigMaps;