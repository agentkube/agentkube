import React, { useState, useEffect, useMemo } from 'react';
import { getPersistentVolumeClaims } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';
import { useNamespace } from '@/contexts/useNamespace';
import { V1PersistentVolumeClaim } from '@kubernetes/client-node';
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, MoreVertical, Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from 'react-router-dom';
import { calculateAge } from '@/utils/age';
import { NamespaceSelector, ErrorComponent } from '@/components/custom';
import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, Database, Copy } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { deleteResource } from '@/api/internal/resources';
import { OPERATOR_URL } from '@/config';

// Define sorting types
type SortDirection = 'asc' | 'desc' | null;
type SortField = 'name' | 'namespace' | 'status' | 'volume' | 'capacity' | 'accessModes' | 'storageClass' | 'age' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

const PersistentVolumeClaims: React.FC = () => {
  const navigate = useNavigate();
  const { currentContext } = useCluster();
  const { selectedNamespaces } = useNamespace();
  const [pvcs, setPvcs] = useState<V1PersistentVolumeClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // -- Start of Multi-select -- 
  const [selectedPvcs, setSelectedPvcs] = useState<Set<string>>(new Set());
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [activePvc, setActivePvc] = useState<V1PersistentVolumeClaim | null>(null);
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
  
  // Add click handler for PVC selection with cmd/ctrl key
  const handlePvcClick = (e: React.MouseEvent, pvc: V1PersistentVolumeClaim) => {
    const pvcKey = `${pvc.metadata?.namespace}/${pvc.metadata?.name}`;

    if (e.metaKey || e.ctrlKey) {
      // Prevent navigation when using multi-select
      e.preventDefault();
      e.stopPropagation();

      setSelectedPvcs(prev => {
        const newSelection = new Set(prev);
        if (newSelection.has(pvcKey)) {
          newSelection.delete(pvcKey);
        } else {
          newSelection.add(pvcKey);
        }
        return newSelection;
      });
    } else if (!selectedPvcs.has(pvcKey)) {
      // Clear selection on regular click (unless clicking on already selected pvc)
      setSelectedPvcs(new Set());
      handlePvcDetails(pvc);
    } else {
      handlePvcDetails(pvc);
    }
  };

  // Add context menu handlers
  const handleContextMenu = (e: React.MouseEvent, pvc: V1PersistentVolumeClaim) => {
    e.preventDefault();
    e.stopPropagation();

    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setActivePvc(pvc);
    setShowContextMenu(true);

    // Multi-select support: if pvc isn't in selection, make it the only selection
    const pvcKey = `${pvc.metadata?.namespace}/${pvc.metadata?.name}`;
    if (!selectedPvcs.has(pvcKey)) {
      setSelectedPvcs(new Set([pvcKey]));
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
      const target = event.target as Element; // Cast to Element instead of Node

      // Make sure target is an Element before using closest
      if (target instanceof Element) {
        const isTableClick = target.closest('table') !== null;
        const isTableHeadClick = target.closest('thead') !== null;
        const isOutsideTable = !isTableClick || isTableHeadClick;
        const isContextMenuClick = contextMenuRef.current?.contains(event.target as Node) || false;
        const isAlertDialogClick = document.querySelector('.dialog-root')?.contains(event.target as Node) || false;

        if (isOutsideTable && !isContextMenuClick && !isAlertDialogClick && selectedPvcs.size > 0) {
          setSelectedPvcs(new Set());
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedPvcs]);

  // Handle clone PVC
  const handleClonePvc = async () => {
    setShowContextMenu(false);

    try {
      if (selectedPvcs.size === 0 && activePvc) {
        // Clone single active PVC
        await clonePvc(activePvc);
      } else if (selectedPvcs.size === 1) {
        // Clone the selected PVC
        const pvcKey = Array.from(selectedPvcs)[0];
        const [namespace, name] = pvcKey.split('/');
        const pvcToClone = pvcs.find(p =>
          p.metadata?.namespace === namespace && p.metadata?.name === name
        );

        if (pvcToClone) {
          await clonePvc(pvcToClone);
        }
      } else {
        // Alert user that multiple PVC cloning is not supported
        alert("Cloning multiple PVCs at once is not supported. Please select a single PVC to clone.");
      }

      // Refresh PVC list
      // You can call your fetchAllPVCs function here

    } catch (error) {
      console.error('Failed to clone PVC:', error);
      setError(error instanceof Error ? error.message : 'Failed to clone PVC');
    }
  };

  // Clone a PVC
  const clonePvc = async (pvc: V1PersistentVolumeClaim) => {
    if (!currentContext || !pvc.metadata?.name || !pvc.metadata?.namespace) return;

    // Ask for the new PVC name
    const newName = prompt("Enter name for the cloned PVC:", `${pvc.metadata.name}-clone`);
    if (!newName) return; // User cancelled

    // Create a new PVC based on the existing one
    const newPvc = {
      apiVersion: 'v1',
      kind: 'PersistentVolumeClaim',
      metadata: {
        name: newName,
        namespace: pvc.metadata.namespace,
        // Don't copy labels that are specific to the original PVC
        labels: { ...pvc.metadata.labels, clonedFrom: pvc.metadata.name }
      },
      spec: {
        accessModes: pvc.spec?.accessModes,
        resources: pvc.spec?.resources,
        storageClassName: pvc.spec?.storageClassName,
        // Don't set volumeName to avoid binding to the same PV
        selector: pvc.spec?.selector
      }
    };

    // Create the new PVC
    await fetch(`${OPERATOR_URL}/clusters/${currentContext.name}/api/v1/namespaces/${pvc.metadata.namespace}/persistentvolumeclaims`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(newPvc),
    });
  };

  // Handle delete action
  const handleDeleteClick = () => {
    setShowContextMenu(false);
    setShowDeleteDialog(true);
  };

  // Perform actual deletion
  const deletePVCs = async () => {
    setShowDeleteDialog(false);

    try {
      if (selectedPvcs.size === 0 && activePvc) {
        // Delete single active PVC
        await deletePVC(activePvc);
      } else {
        // Delete all selected PVCs
        for (const pvcKey of selectedPvcs) {
          const [namespace, name] = pvcKey.split('/');
          const pvcToDelete = pvcs.find(p =>
            p.metadata?.namespace === namespace && p.metadata?.name === name
          );

          if (pvcToDelete) {
            await deletePVC(pvcToDelete);
          }
        }
      }

      // Clear selection after deletion
      setSelectedPvcs(new Set());

      // Refresh PVC list
      // You can call your fetchAllPVCs function here

    } catch (error) {
      console.error('Failed to delete PVC(s):', error);
      setError(error instanceof Error ? error.message : 'Failed to delete PVC(s)');
    }
  };

  // Delete PVC function
  const deletePVC = async (pvc: V1PersistentVolumeClaim) => {
    if (!currentContext || !pvc.metadata?.name || !pvc.metadata?.namespace) return;

    await deleteResource(
      currentContext.name,
      'persistentvolumeclaims',
      pvc.metadata.name,
      { namespace: pvc.metadata.namespace }
    );
  };

  // Render the context menu
  const renderContextMenu = () => {
    if (!showContextMenu || !contextMenuPosition) return null;

    // Calculate if we need to show the menu above or below the click position
    const windowHeight = window.innerHeight;
    const menuHeight = 150; // Approximate context menu height
    const shouldShowAbove = windowHeight - contextMenuPosition.y < menuHeight;

    // Check if PVC is in a state where operations are allowed
    const isBound = activePvc?.status?.phase === 'Bound';

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
          {selectedPvcs.size > 1
            ? `${selectedPvcs.size} PVCs selected`
            : activePvc?.metadata?.name || 'PVC actions'}
        </div>

        <div
          className={`px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center ${(selectedPvcs.size > 1 || !isBound) ? 'text-gray-400 dark:text-gray-600 pointer-events-none' : ''
            }`}
          onClick={selectedPvcs.size <= 1 && isBound ? handleClonePvc : undefined}
          title={selectedPvcs.size > 1 ? "Select only one PVC to clone" : (!isBound ? "PVC must be bound to clone" : "")}
        >
          <Copy className="h-4 w-4 mr-2" />
          Clone
        </div>

        <div
          className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center text-red-600 dark:text-red-400"
          onClick={handleDeleteClick}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete {selectedPvcs.size > 1 ? `(${selectedPvcs.size})` : ''}
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
            <AlertDialogTitle>Confirm PVC Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedPvcs.size > 1
                ? `${selectedPvcs.size} persistent volume claims`
                : `"${activePvc?.metadata?.name}"`}?
              This action cannot be undone.

              <div className="mt-2 text-amber-600 dark:text-amber-400">
                Warning: Deleting a PVC may result in data loss. Make sure you have backed up any important data.
                {activePvc?.spec?.volumeName && (
                  <div className="mt-1">
                    The underlying PersistentVolume may or may not be deleted depending on the reclaim policy.
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deletePVCs}
              className="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  };
  // -- Endo of Multi-select -- 

  // Add sorting state
  const [sort, setSort] = useState<SortState>({
    field: null,
    direction: null
  });

  // Fetch PVCs for all selected namespaces
  useEffect(() => {
    const fetchAllPVCs = async () => {
      if (!currentContext || selectedNamespaces.length === 0) {
        setPvcs([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // If no namespaces are selected, fetch from all namespaces
        if (selectedNamespaces.length === 0) {
          const pvcsData = await getPersistentVolumeClaims(currentContext.name);
          setPvcs(pvcsData);
          return;
        }

        // Fetch PVCs for each selected namespace
        const pvcPromises = selectedNamespaces.map(namespace =>
          getPersistentVolumeClaims(currentContext.name, namespace)
        );

        const results = await Promise.all(pvcPromises);

        // Flatten the array of PVC arrays
        const allPvcs = results.flat();
        setPvcs(allPvcs);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch persistent volume claims:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch persistent volume claims');
      } finally {
        setLoading(false);
      }
    };

    fetchAllPVCs();
  }, [currentContext, selectedNamespaces]);

  // Filter PVCs based on search query
  const filteredPvcs = useMemo(() => {
    if (!searchQuery.trim()) {
      return pvcs;
    }

    const lowercaseQuery = searchQuery.toLowerCase();

    return pvcs.filter(pvc => {
      const name = pvc.metadata?.name?.toLowerCase() || '';
      const namespace = pvc.metadata?.namespace?.toLowerCase() || '';
      const storageClass = pvc.spec?.storageClassName?.toLowerCase() || '';
      const status = pvc.status?.phase?.toLowerCase() || '';
      const labels = pvc.metadata?.labels || {};
      const volumeName = pvc.spec?.volumeName?.toLowerCase() || '';

      // Check if name, namespace, storage class, or status contains the query
      if (
        name.includes(lowercaseQuery) ||
        namespace.includes(lowercaseQuery) ||
        storageClass.includes(lowercaseQuery) ||
        status.includes(lowercaseQuery) ||
        volumeName.includes(lowercaseQuery)
      ) {
        return true;
      }

      // Check if any label contains the query
      return Object.entries(labels).some(
        ([key, value]) =>
          key.toLowerCase().includes(lowercaseQuery) ||
          (typeof value === 'string' && value.toLowerCase().includes(lowercaseQuery))
      );
    });
  }, [pvcs, searchQuery]);

  // Sort PVCs based on sort state
  const sortedPvcs = useMemo(() => {
    if (!sort.field || !sort.direction) {
      return filteredPvcs;
    }

    return [...filteredPvcs].sort((a, b) => {
      const sortMultiplier = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'name':
          return (a.metadata?.name || '').localeCompare(b.metadata?.name || '') * sortMultiplier;

        case 'namespace':
          return (a.metadata?.namespace || '').localeCompare(b.metadata?.namespace || '') * sortMultiplier;

        case 'status': {
          const statusA = a.status?.phase || 'Unknown';
          const statusB = b.status?.phase || 'Unknown';

          // Define a custom order for status for better sorting
          const statusOrder: Record<string, number> = {
            'Bound': 1,
            'Pending': 2,
            'Lost': 3,
            'Unknown': 4
          };

          const orderA = statusOrder[statusA] || 5;
          const orderB = statusOrder[statusB] || 5;

          return (orderA - orderB) * sortMultiplier;
        }

        case 'volume': {
          const volumeA = a.spec?.volumeName || '';
          const volumeB = b.spec?.volumeName || '';
          return volumeA.localeCompare(volumeB) * sortMultiplier;
        }

        case 'capacity': {
          // Get capacity for comparison
          const storageA = a.status?.capacity?.storage || a.spec?.resources?.requests?.storage || '';
          const storageB = b.status?.capacity?.storage || b.spec?.resources?.requests?.storage || '';

          // Convert to bytes for numerical comparison
          const bytesA = convertStorageToBytes(storageA);
          const bytesB = convertStorageToBytes(storageB);

          return (bytesA - bytesB) * sortMultiplier;
        }

        case 'accessModes': {
          const modesA = a.spec?.accessModes || [];
          const modesB = b.spec?.accessModes || [];

          // First compare by number of access modes
          if (modesA.length !== modesB.length) {
            return (modesA.length - modesB.length) * sortMultiplier;
          }

          // Then compare by the first mode (alphabetically)
          const firstModeA = modesA.sort()[0] || '';
          const firstModeB = modesB.sort()[0] || '';
          return firstModeA.localeCompare(firstModeB) * sortMultiplier;
        }

        case 'storageClass': {
          const storageClassA = a.spec?.storageClassName || 'default';
          const storageClassB = b.spec?.storageClassName || 'default';
          return storageClassA.localeCompare(storageClassB) * sortMultiplier;
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
  }, [filteredPvcs, sort.field, sort.direction]);

  // Helper to convert storage string to bytes for sorting
  const convertStorageToBytes = (storage: string): number => {
    if (!storage) return 0;

    // Handle already formatted strings
    if (storage.endsWith('Ki')) {
      return parseInt(storage) * 1024;
    }
    if (storage.endsWith('Mi')) {
      return parseInt(storage) * 1024 * 1024;
    }
    if (storage.endsWith('Gi')) {
      return parseInt(storage) * 1024 * 1024 * 1024;
    }
    if (storage.endsWith('Ti')) {
      return parseInt(storage) * 1024 * 1024 * 1024 * 1024;
    }

    // Try to parse as a plain number (bytes)
    const bytes = parseInt(storage);
    return isNaN(bytes) ? 0 : bytes;
  };

  const handlePvcDetails = (pvc: V1PersistentVolumeClaim) => {
    if (pvc.metadata?.name && pvc.metadata?.namespace) {
      navigate(`/dashboard/explore/persistentvolumeclaims/${pvc.metadata.namespace}/${pvc.metadata.name}`);
    }
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

  // Format storage size to human-readable format
  const formatStorage = (storage: string | undefined): string => {
    if (!storage) return 'N/A';

    // Return as is if it's already in a human-readable format
    if (storage.endsWith('Ki') || storage.endsWith('Mi') || storage.endsWith('Gi') || storage.endsWith('Ti')) {
      return storage;
    }

    // Try to parse as a number (bytes)
    const bytes = parseInt(storage);
    if (isNaN(bytes)) return storage;

    // Convert to appropriate unit
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} Ki`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} Mi`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} Gi`;
  };

  // Get a color class based on the PVC phase
  const getStatusColorClass = (phase: string | undefined): string => {
    if (!phase) return 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300';

    switch (phase.toLowerCase()) {
      case 'bound':
        return 'bg-green-200 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'pending':
        return 'bg-yellow-200 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'lost':
        return 'bg-red-200 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      default:
        return 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
    }
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
          <h1 className='text-5xl font-[Anton] uppercase font-bold text-gray-800/30 dark:text-gray-700/50'>Persistent Volume Claims</h1>
          <div className="w-full md:w-96 mt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
              <Input
                type="text"
                placeholder="Search by name, namespace, or storage class..."
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
      {sortedPvcs.length === 0 && (
        <Alert className="my-6 bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <AlertDescription>
            {searchQuery
              ? `No persistent volume claims matching "${searchQuery}"`
              : selectedNamespaces.length === 0
                ? "Please select at least one namespace"
                : "No persistent volume claims found in the selected namespaces"}
          </AlertDescription>
        </Alert>
      )}

      {/* PVCs table */}
      {sortedPvcs.length > 0 && (
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
                    className="text-center cursor-pointer hover:text-blue-500 w-[100px]"
                    onClick={() => handleSort('status')}
                  >
                    Status {renderSortIndicator('status')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('volume')}
                  >
                    Volume {renderSortIndicator('volume')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500 w-[100px]"
                    onClick={() => handleSort('capacity')}
                  >
                    Capacity {renderSortIndicator('capacity')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500 w-[150px]"
                    onClick={() => handleSort('accessModes')}
                  >
                    Access Modes {renderSortIndicator('accessModes')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500 w-[150px]"
                    onClick={() => handleSort('storageClass')}
                  >
                    Storage Class {renderSortIndicator('storageClass')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500 w-[80px]"
                    onClick={() => handleSort('age')}
                  >
                    Age {renderSortIndicator('age')}
                  </TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedPvcs.map((pvc) => (
                  <TableRow
                    key={`${pvc.metadata?.namespace}-${pvc.metadata?.name}`}
                    className={`bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30 ${selectedPvcs.has(`${pvc.metadata?.namespace}/${pvc.metadata?.name}`) ? 'bg-blue-50 dark:bg-gray-800/30' : ''
                      }`}
                    onClick={(e) => handlePvcClick(e, pvc)}
                    onContextMenu={(e) => handleContextMenu(e, pvc)}
                  >
                    <TableCell className="font-medium" onClick={() => handlePvcDetails(pvc)}>
                      <div className="hover:text-blue-500 hover:underline">
                        {pvc.metadata?.name}
                      </div>
                    </TableCell>
                    <TableCell>{pvc.metadata?.namespace}</TableCell>
                    <TableCell className="text-center">
                      <span className={`px-2 py-1 rounded-[0.3rem] text-xs font-medium ${getStatusColorClass(pvc.status?.phase)}`}>
                        {pvc.status?.phase || 'Unknown'}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <div
                        className="hover:text-blue-500 hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/dashboard/explore/persistentvolumes`);
                        }}
                      >
                        {pvc.spec?.volumeName || '-'}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {formatStorage(pvc.status?.capacity?.storage) ||
                        formatStorage(pvc.spec?.resources?.requests?.storage) ||
                        'N/A'}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex flex-wrap justify-center gap-1">
                        {pvc.spec?.accessModes?.map((mode, index) => (
                          <span
                            key={index}
                            className="px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300"
                          >
                            {mode}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {pvc.spec?.storageClassName || 'default'}
                    </TableCell>
                    <TableCell className="text-center">
                      {calculateAge(pvc.metadata?.creationTimestamp?.toString())}
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

export default PersistentVolumeClaims;