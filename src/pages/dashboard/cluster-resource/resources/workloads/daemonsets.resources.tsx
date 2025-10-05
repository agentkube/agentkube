import React, { useState, useEffect, useMemo } from 'react';
import { getDaemonSets } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';
import { useNamespace } from '@/contexts/useNamespace';
import { V1DaemonSet } from '@kubernetes/client-node';
import { useReconMode } from '@/contexts/useRecon';
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, MoreVertical, Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from 'react-router-dom';
import { calculateAge } from '@/utils/age';
import { NamespaceSelector, ErrorComponent, ResourceFilterSidebar, type ColumnConfig } from '@/components/custom';
import { Filter } from 'lucide-react';
import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, RefreshCw, Sparkles } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Eye, Trash } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { OPERATOR_URL } from '@/config';
import { useDrawer } from '@/contexts/useDrawer';
import { resourceToEnrichedSearchResult } from '@/utils/resource-to-enriched.utils';
import { toast } from '@/hooks/use-toast';

// Define sorting types
type SortDirection = 'asc' | 'desc' | null;
type SortField = 'name' | 'namespace' | 'desired' | 'current' | 'ready' | 'upToDate' | 'available' | 'age' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

const DaemonSets: React.FC = () => {
  const navigate = useNavigate();
  const { currentContext } = useCluster();
  const { selectedNamespaces } = useNamespace();
  const [daemonSets, setDaemonSets] = useState<V1DaemonSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const { isReconMode } = useReconMode();

  // Column visibility state
  const [showFilterSidebar, setShowFilterSidebar] = useState(false);
  const [columnConfig, setColumnConfig] = useState<ColumnConfig[]>([
    { key: 'name', label: 'Name', visible: true, canToggle: false }, // Required column
    { key: 'namespace', label: 'Namespace', visible: true, canToggle: true },
    { key: 'desired', label: 'Desired', visible: true, canToggle: true },
    { key: 'current', label: 'Current', visible: true, canToggle: true },
    { key: 'ready', label: 'Ready', visible: true, canToggle: true },
    { key: 'upToDate', label: 'Up-to-date', visible: true, canToggle: true },
    { key: 'available', label: 'Available', visible: true, canToggle: true },
    { key: 'age', label: 'Age', visible: true, canToggle: true },
    { key: 'actions', label: 'Actions', visible: true, canToggle: false } // Required column
  ]);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Cmd+F (Mac) or Ctrl+F (Windows)
      if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F')) {
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

  // --- Start of Multi-select ---
  const [selectedDaemonSets, setSelectedDaemonSets] = useState<Set<string>>(new Set());
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [activeDaemonSet, setActiveDaemonSet] = useState<V1DaemonSet | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const { addResourceContext } = useDrawer();

  const handleDaemonSetClick = (e: React.MouseEvent, daemonSet: V1DaemonSet) => {
    const daemonSetKey = `${daemonSet.metadata?.namespace}/${daemonSet.metadata?.name}`;

    if (e.metaKey || e.ctrlKey) {
      // Prevent navigation when using multi-select
      e.preventDefault();
      e.stopPropagation();

      setSelectedDaemonSets(prev => {
        const newSelection = new Set(prev);
        if (newSelection.has(daemonSetKey)) {
          newSelection.delete(daemonSetKey);
        } else {
          newSelection.add(daemonSetKey);
        }
        return newSelection;
      });
    } else if (!selectedDaemonSets.has(daemonSetKey)) {
      // Clear selection on regular click (unless clicking on already selected daemonSet)
      setSelectedDaemonSets(new Set());
      handleDaemonSetDetails(daemonSet);
    } else {
      handleDaemonSetDetails(daemonSet);
    }
  };

  // Add context menu handlers
  const handleContextMenu = (e: React.MouseEvent, daemonSet: V1DaemonSet) => {
    e.preventDefault();
    e.stopPropagation();

    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setActiveDaemonSet(daemonSet);
    setShowContextMenu(true);

    // Multi-select support: if daemonSet isn't in selection, make it the only selection
    const daemonSetKey = `${daemonSet.metadata?.namespace}/${daemonSet.metadata?.name}`;
    if (!selectedDaemonSets.has(daemonSetKey)) {
      setSelectedDaemonSets(new Set([daemonSetKey]));
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

        if (isOutsideTable && !isContextMenuClick && !isAlertDialogClick && selectedDaemonSets.size > 0) {
          setSelectedDaemonSets(new Set());
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedDaemonSets]);

  // Handle restart action for DaemonSets (rolling restart)
  const handleRestartDaemonSets = async () => {
    if (isReconMode) {
      toast({
        title: "Recon Mode",
        description: "This action can't be performed while recon mode is on. Disable recon mode to proceed.",
        variant: "recon"
      });
      return;
    }
    
    setShowContextMenu(false);

    try {
      if (selectedDaemonSets.size === 0 && activeDaemonSet) {
        // Restart single active daemonSet
        await restartDaemonSet(activeDaemonSet);
      } else {
        // Restart all selected daemonSets
        for (const daemonSetKey of selectedDaemonSets) {
          const [namespace, name] = daemonSetKey.split('/');
          const daemonSetToRestart = daemonSets.find(ds =>
            ds.metadata?.namespace === namespace && ds.metadata?.name === name
          );

          if (daemonSetToRestart) {
            await restartDaemonSet(daemonSetToRestart);
          }
        }
      }

      // Refresh daemonSet list
      await fetchAllDaemonSets();

    } catch (error) {
      console.error('Failed to restart daemonSet(s):', error);
      setError(error instanceof Error ? error.message : 'Failed to restart daemonSet(s)');
    }
  };

  // Restart daemonSet by updating a restart annotation
  const restartDaemonSet = async (daemonSet: V1DaemonSet) => {
    if (!currentContext || !daemonSet.metadata?.name || !daemonSet.metadata?.namespace) return;

    // Common Kubernetes pattern to force a rolling restart:
    // Add or update a "kubectl.kubernetes.io/restartedAt" annotation with the current timestamp
    const annotations = daemonSet.spec?.template?.metadata?.annotations || {};
    const restartedAt = new Date().toISOString();

    await fetch(`${OPERATOR_URL}/clusters/${currentContext.name}/apis/apps/v1/namespaces/${daemonSet.metadata.namespace}/daemonsets/${daemonSet.metadata.name}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/strategic-merge-patch+json',
      },
      body: JSON.stringify({
        spec: {
          template: {
            metadata: {
              annotations: {
                ...annotations,
                'kubectl.kubernetes.io/restartedAt': restartedAt
              }
            }
          }
        }
      }),
    });
  };

  // Handle delete action
  const handleDeleteClick = () => {
    if (isReconMode) {
      toast({
        title: "Recon Mode",
        description: "This action can't be performed while recon mode is on. Disable recon mode to proceed.",
        variant: "recon"
      });
      return;
    }
    
    setShowContextMenu(false);
    setShowDeleteDialog(true);
  };

  // Perform actual deletion
  const deleteDaemonSets = async () => {
    setShowDeleteDialog(false);
    setDeleteLoading(true);

    try {
      if (selectedDaemonSets.size === 0 && activeDaemonSet) {
        // Delete single active daemonSet
        await deleteDaemonSet(activeDaemonSet);
      } else {
        // Delete all selected daemonSets
        for (const daemonSetKey of selectedDaemonSets) {
          const [namespace, name] = daemonSetKey.split('/');
          const daemonSetToDelete = daemonSets.find(ds =>
            ds.metadata?.namespace === namespace && ds.metadata?.name === name
          );

          if (daemonSetToDelete) {
            await deleteDaemonSet(daemonSetToDelete);
          }
        }
      }

      // Clear selection after deletion
      setSelectedDaemonSets(new Set());

      // Refresh daemonSet list
      await fetchAllDaemonSets();

    } catch (error) {
      console.error('Failed to delete daemonSet(s):', error);
      setError(error instanceof Error ? error.message : 'Failed to delete daemonSet(s)');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Delete daemonSet function
  const deleteDaemonSet = async (daemonSet: V1DaemonSet) => {
    if (!currentContext || !daemonSet.metadata?.name || !daemonSet.metadata?.namespace) return;

    await fetch(`${OPERATOR_URL}/clusters/${currentContext.name}/apis/apps/v1/namespaces/${daemonSet.metadata.namespace}/daemonsets/${daemonSet.metadata.name}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        propagationPolicy: "Background"
      }),
    });
  };

  // Column management functions
  const handleColumnToggle = (columnKey: string, visible: boolean) => {
    setColumnConfig(prev => 
      prev.map(col => 
        col.key === columnKey ? { ...col, visible } : col
      )
    );
  };

  const handleResetToDefault = () => {
    setColumnConfig(prev => 
      prev.map(col => ({ ...col, visible: true }))
    );
  };

  const isColumnVisible = (columnKey: string) => {
    const column = columnConfig.find(col => col.key === columnKey);
    return column?.visible ?? true;
  };

  // Check if DaemonSet has warning state
  const hasWarningState = (daemonSet: V1DaemonSet): boolean => {
    const desiredCount = daemonSet.status?.desiredNumberScheduled || 0;
    const currentCount = daemonSet.status?.currentNumberScheduled || 0;
    const readyCount = daemonSet.status?.numberReady || 0;
    const updatedCount = daemonSet.status?.updatedNumberScheduled || 0;
    const availableCount = daemonSet.status?.numberAvailable || 0;

    return currentCount < desiredCount ||
      readyCount < desiredCount ||
      updatedCount < desiredCount ||
      availableCount < desiredCount;
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
          {selectedDaemonSets.size > 1
            ? `${selectedDaemonSets.size} daemonsets selected`
            : activeDaemonSet?.metadata?.name || 'DaemonSet actions'}
        </div>

        <div
          className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center"
          onClick={handleRestartDaemonSets}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Restart {selectedDaemonSets.size > 1 ? `(${selectedDaemonSets.size})` : ''}
        </div>

        <div
          className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center text-red-600 dark:text-red-400"
          onClick={handleDeleteClick}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete {selectedDaemonSets.size > 1 ? `(${selectedDaemonSets.size})` : ''}
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
            <AlertDialogTitle>Confirm DaemonSet Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedDaemonSets.size > 1
                ? `${selectedDaemonSets.size} daemonsets`
                : `"${activeDaemonSet?.metadata?.name}"`}?
              This action cannot be undone and will remove all pods managed by the DaemonSet(s).

              <div className="mt-2 text-amber-600 dark:text-amber-400">
                Warning: Deleting a DaemonSet will remove pods from all nodes in the cluster.
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteDaemonSets}
              disabled={deleteLoading}
              className="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
            >
              {deleteLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  };
  // --- End of Multi-select ---

  const handleViewDaemonSet = (e: React.MouseEvent, daemonSet: V1DaemonSet) => {
    e.stopPropagation();
    if (daemonSet.metadata?.name && daemonSet.metadata?.namespace) {
      navigate(`/dashboard/explore/daemonsets/${daemonSet.metadata.namespace}/${daemonSet.metadata.name}`);
    }
  };

  const handleDeleteDaemonSet = (e: React.MouseEvent, daemonSet: V1DaemonSet) => {
    e.stopPropagation();
    if (isReconMode) {
      toast({
        title: "Recon Mode",
        description: "This action can't be performed while recon mode is on. Disable recon mode to proceed.",
        variant: "recon"
      });
      return;
    }
    
    setActiveDaemonSet(daemonSet);
    setSelectedDaemonSets(new Set([`${daemonSet.metadata?.namespace}/${daemonSet.metadata?.name}`]));
    setShowDeleteDialog(true);
  };

  const handleAskAI = (daemonSet: V1DaemonSet) => {
    try {
      const resourceContext = resourceToEnrichedSearchResult(
        daemonSet,
        'daemonsets',
        true,
        'apps',
        'v1'
      );
      
      addResourceContext(resourceContext);
      
      toast({
        title: "Added to Chat",
        description: `DaemonSet "${daemonSet.metadata?.name}" has been added to chat context`
      });
    } catch (error) {
      console.error('Error adding daemonset to chat:', error);
      toast({
        title: "Error",
        description: "Failed to add daemonset to chat context",
        variant: "destructive"
      });
    }
  };

  // Add sorting state
  const [sort, setSort] = useState<SortState>({
    field: null,
    direction: null
  });

  const fetchAllDaemonSets = async () => {
    if (!currentContext || selectedNamespaces.length === 0) {
      setDaemonSets([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // If no namespaces are selected, fetch from all namespaces
      if (selectedNamespaces.length === 0) {
        const daemonSetsData = await getDaemonSets(currentContext.name);
        setDaemonSets(daemonSetsData);
        return;
      }

      // Fetch daemonsets for each selected namespace
      const daemonSetPromises = selectedNamespaces.map(namespace =>
        getDaemonSets(currentContext.name, namespace)
      );

      const results = await Promise.all(daemonSetPromises);

      // Flatten the array of daemonset arrays
      const allDaemonSets = results.flat();
      setDaemonSets(allDaemonSets);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch daemonsets:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch daemonsets');
    } finally {
      setLoading(false);
    }
  };

  // Fetch daemonsets for all selected namespaces
  useEffect(() => {


    fetchAllDaemonSets();
  }, [currentContext, selectedNamespaces]);

  // Filter daemonsets based on search query
  const filteredDaemonSets = useMemo(() => {
    if (!searchQuery.trim()) {
      return daemonSets;
    }

    const lowercaseQuery = searchQuery.toLowerCase();

    return daemonSets.filter(daemonSet => {
      const name = daemonSet.metadata?.name?.toLowerCase() || '';
      const namespace = daemonSet.metadata?.namespace?.toLowerCase() || '';
      const labels = daemonSet.metadata?.labels || {};

      // Check if name or namespace contains the query
      if (name.includes(lowercaseQuery) || namespace.includes(lowercaseQuery)) {
        return true;
      }

      // Check if any label contains the query
      return Object.entries(labels).some(
        ([key, value]) =>
          key.toLowerCase().includes(lowercaseQuery) ||
          (typeof value === 'string' && value.toLowerCase().includes(lowercaseQuery))
      );
    });
  }, [daemonSets, searchQuery]);

  // Sort daemonsets based on sort state
  const sortedDaemonSets = useMemo(() => {
    if (!sort.field || !sort.direction) {
      return filteredDaemonSets;
    }

    return [...filteredDaemonSets].sort((a, b) => {
      const sortMultiplier = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'name':
          return (a.metadata?.name || '').localeCompare(b.metadata?.name || '') * sortMultiplier;

        case 'namespace':
          return (a.metadata?.namespace || '').localeCompare(b.metadata?.namespace || '') * sortMultiplier;

        case 'desired': {
          const desiredA = a.status?.desiredNumberScheduled || 0;
          const desiredB = b.status?.desiredNumberScheduled || 0;
          return (desiredA - desiredB) * sortMultiplier;
        }

        case 'current': {
          const currentA = a.status?.currentNumberScheduled || 0;
          const currentB = b.status?.currentNumberScheduled || 0;
          return (currentA - currentB) * sortMultiplier;
        }

        case 'ready': {
          const readyA = a.status?.numberReady || 0;
          const readyB = b.status?.numberReady || 0;
          const totalA = a.status?.desiredNumberScheduled || 1; // Avoid div by 0
          const totalB = b.status?.desiredNumberScheduled || 1;

          // Calculate ready percentage for more accurate sorting
          const percentA = readyA / totalA;
          const percentB = readyB / totalB;

          return (percentA - percentB) * sortMultiplier;
        }

        case 'upToDate': {
          const updatedA = a.status?.updatedNumberScheduled || 0;
          const updatedB = b.status?.updatedNumberScheduled || 0;
          return (updatedA - updatedB) * sortMultiplier;
        }

        case 'available': {
          const availableA = a.status?.numberAvailable || 0;
          const availableB = b.status?.numberAvailable || 0;
          return (availableA - availableB) * sortMultiplier;
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
  }, [filteredDaemonSets, sort.field, sort.direction]);

  const handleDaemonSetDetails = (daemonSet: V1DaemonSet) => {
    if (daemonSet.metadata?.name && daemonSet.metadata?.namespace) {
      navigate(`/dashboard/explore/daemonsets/${daemonSet.metadata.namespace}/${daemonSet.metadata.name}`);
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
          
          [&::-webkit-scrollbar]:w-1.5 
          [&::-webkit-scrollbar-track]:bg-transparent 
          [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">
      <div className='flex items-center justify-between md:flex-row gap-4 md:items-end'>
        <div>
          <h1 className='text-5xl font-[Anton] uppercase font-bold text-gray-800/30 dark:text-gray-700/50'>DaemonSets</h1>
          <div className="w-full md:w-96 mt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
              <Input
                type="text"
                placeholder="Search by name, namespace, or label..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </div>

        <div className="flex items-end gap-2">
          <div className="w-full md:w-96">
            {/* <div className="text-sm font-medium mb-2">Namespaces</div> */}
            <NamespaceSelector />
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilterSidebar(true)}
            className="flex items-center gap-2 h-10 dark:text-gray-300/80"
          >
            <Filter className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* No results message */}
      {sortedDaemonSets.length === 0 && (
        <Alert className="my-6 bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <AlertDescription>
            {searchQuery
              ? `No daemonsets matching "${searchQuery}"`
              : selectedNamespaces.length === 0
                ? "Please select at least one namespace"
                : "No daemonsets found in the selected namespaces"}
          </AlertDescription>
        </Alert>
      )}

      {/* DaemonSets table */}
      {sortedDaemonSets.length > 0 && (
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
                  {isColumnVisible('namespace') && (
                    <TableHead
                      className="cursor-pointer hover:text-blue-500"
                      onClick={() => handleSort('namespace')}
                    >
                      Namespace {renderSortIndicator('namespace')}
                    </TableHead>
                  )}
                  {isColumnVisible('desired') && (
                    <TableHead
                      className="text-center cursor-pointer hover:text-blue-500"
                      onClick={() => handleSort('desired')}
                    >
                      Desired {renderSortIndicator('desired')}
                    </TableHead>
                  )}
                  {isColumnVisible('current') && (
                    <TableHead
                      className="text-center cursor-pointer hover:text-blue-500"
                      onClick={() => handleSort('current')}
                    >
                      Current {renderSortIndicator('current')}
                    </TableHead>
                  )}
                  {isColumnVisible('ready') && (
                    <TableHead
                      className="text-center cursor-pointer hover:text-blue-500"
                      onClick={() => handleSort('ready')}
                    >
                      Ready {renderSortIndicator('ready')}
                    </TableHead>
                  )}
                  {isColumnVisible('upToDate') && (
                    <TableHead
                      className="text-center cursor-pointer hover:text-blue-500"
                      onClick={() => handleSort('upToDate')}
                    >
                      Up-to-date {renderSortIndicator('upToDate')}
                    </TableHead>
                  )}
                  {isColumnVisible('available') && (
                    <TableHead
                      className="text-center cursor-pointer hover:text-blue-500"
                      onClick={() => handleSort('available')}
                    >
                      Available {renderSortIndicator('available')}
                    </TableHead>
                  )}
                  {isColumnVisible('age') && (
                    <TableHead
                      className="text-center cursor-pointer hover:text-blue-500"
                      onClick={() => handleSort('age')}
                    >
                      Age {renderSortIndicator('age')}
                    </TableHead>
                  )}
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedDaemonSets.map((daemonSet) => (
                  <TableRow
                    key={`${daemonSet.metadata?.namespace}-${daemonSet.metadata?.name}`}
                    className={`bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30 ${hasWarningState(daemonSet) ? 'bg-yellow-50 dark:bg-yellow-900/10' : ''
                      } ${selectedDaemonSets.has(`${daemonSet.metadata?.namespace}/${daemonSet.metadata?.name}`) ? 'bg-blue-50 dark:bg-gray-800/30' : ''
                      }`}
                    onClick={(e) => handleDaemonSetClick(e, daemonSet)}
                    onContextMenu={(e) => handleContextMenu(e, daemonSet)}
                  >
                    <TableCell className="font-medium" onClick={() => handleDaemonSetDetails(daemonSet)}>
                      <div className="hover:text-blue-500 hover:underline">
                        {daemonSet.metadata?.name}
                      </div>
                    </TableCell>
                    {isColumnVisible('namespace') && (
                      <TableCell>
                        <div className="hover:text-blue-500 hover:underline" onClick={() => navigate(`/dashboard/explore/namespaces`)}>
                          {daemonSet.metadata?.namespace}
                        </div>
                      </TableCell>
                    )}
                    {isColumnVisible('desired') && (
                      <TableCell className="text-center">
                        {daemonSet.status?.desiredNumberScheduled || 0}
                      </TableCell>
                    )}
                    {isColumnVisible('current') && (
                      <TableCell className="text-center">
                        {daemonSet.status?.currentNumberScheduled || 0}
                      </TableCell>
                    )}
                    {isColumnVisible('ready') && (
                      <TableCell className="text-center">
                        {daemonSet.status?.numberReady || 0}
                      </TableCell>
                    )}
                    {isColumnVisible('upToDate') && (
                      <TableCell className="text-center">
                        {daemonSet.status?.updatedNumberScheduled || 0}
                      </TableCell>
                    )}
                    {isColumnVisible('available') && (
                      <TableCell className="text-center">
                        {daemonSet.status?.numberAvailable || 0}
                      </TableCell>
                    )}
                    {isColumnVisible('age') && (
                      <TableCell className="text-center">
                        {calculateAge(daemonSet.metadata?.creationTimestamp?.toString())}
                      </TableCell>
                    )}
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className='dark:bg-[#0B0D13]/40 backdrop-blur-sm text-gray-800 dark:text-gray-300 '>
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            handleAskAI(daemonSet);
                          }} className='hover:text-gray-700 dark:hover:text-gray-500'>
                            <Sparkles className="mr-2 h-4 w-4" />
                            Ask AI
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => handleViewDaemonSet(e, daemonSet)} className='hover:text-gray-700 dark:hover:text-gray-500'>
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-500 dark:text-red-400 focus:text-red-500 dark:focus:text-red-400 hover:text-red-700 dark:hover:text-red-500"
                            onClick={(e) => handleDeleteDaemonSet(e, daemonSet)}
                          >
                            <Trash className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Resource Filter Sidebar */}
      <ResourceFilterSidebar
        isOpen={showFilterSidebar}
        onClose={() => setShowFilterSidebar(false)}
        title="DaemonSets Table"
        columns={columnConfig}
        onColumnToggle={handleColumnToggle}
        onResetToDefault={handleResetToDefault}
        className="w-1/3"
      />
    </div>
  );
};

export default DaemonSets;