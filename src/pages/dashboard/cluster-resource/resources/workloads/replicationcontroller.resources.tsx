import React, { useState, useEffect, useMemo } from 'react';
import { listResources } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';
import { useNamespace } from '@/contexts/useNamespace';
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
import { Trash2, Scale, Sparkles } from "lucide-react";
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
type SortField = 'name' | 'namespace' | 'ready' | 'desired' | 'selector' | 'age' | 'labels' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

const ReplicationControllers: React.FC = () => {
  const navigate = useNavigate();
  const { currentContext } = useCluster();
  const { selectedNamespaces } = useNamespace();
  const [replicationControllers, setReplicationControllers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const { addResourceContext } = useDrawer();
  // --- Start of Multi-select ---
  const [selectedReplicationControllers, setSelectedReplicationControllers] = useState<Set<string>>(new Set());
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [activeReplicationController, setActiveReplicationController] = useState<any | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);

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



  // Add click handler for ReplicationController selection with cmd/ctrl key
  const handleReplicationControllerClick = (e: React.MouseEvent, rc: any) => {
    const rcKey = `${rc.metadata?.namespace}/${rc.metadata?.name}`;

    if (e.metaKey || e.ctrlKey) {
      // Prevent navigation when using multi-select
      e.preventDefault();
      e.stopPropagation();

      setSelectedReplicationControllers(prev => {
        const newSelection = new Set(prev);
        if (newSelection.has(rcKey)) {
          newSelection.delete(rcKey);
        } else {
          newSelection.add(rcKey);
        }
        return newSelection;
      });
    } else if (!selectedReplicationControllers.has(rcKey)) {
      // Clear selection on regular click (unless clicking on already selected RC)
      setSelectedReplicationControllers(new Set());
      handleReplicationControllerDetails(rc);
    } else {
      handleReplicationControllerDetails(rc);
    }
  };

  // Add context menu handlers
  const handleContextMenu = (e: React.MouseEvent, rc: any) => {
    e.preventDefault();
    e.stopPropagation();

    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setActiveReplicationController(rc);
    setShowContextMenu(true);

    // Multi-select support: if RC isn't in selection, make it the only selection
    const rcKey = `${rc.metadata?.namespace}/${rc.metadata?.name}`;
    if (!selectedReplicationControllers.has(rcKey)) {
      setSelectedReplicationControllers(new Set([rcKey]));
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

        if (isOutsideTable && !isContextMenuClick && !isAlertDialogClick && selectedReplicationControllers.size > 0) {
          setSelectedReplicationControllers(new Set());
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedReplicationControllers]);

  // Handle scale action for ReplicationControllers
  const handleScaleReplicationControllers = async () => {
    setShowContextMenu(false);

    try {
      if (selectedReplicationControllers.size === 0 && activeReplicationController) {
        await promptAndScaleReplicationController(activeReplicationController);
      } else if (selectedReplicationControllers.size === 1) {
        // If exactly one RC is selected, use prompt
        const rcKey = Array.from(selectedReplicationControllers)[0];
        const [namespace, name] = rcKey.split('/');
        const rcToScale = replicationControllers.find(rc =>
          rc.metadata?.namespace === namespace && rc.metadata?.name === name
        );

        if (rcToScale) {
          await promptAndScaleReplicationController(rcToScale);
        }
      } else {
        // If multiple RCs are selected, ask for a single value to apply to all
        const currentCount = prompt(`Enter replica count to apply to all ${selectedReplicationControllers.size} selected ReplicationControllers:`, "1");
        if (currentCount !== null) {
          const count = parseInt(currentCount, 10);
          if (!isNaN(count) && count >= 0) {
            for (const rcKey of selectedReplicationControllers) {
              const [namespace, name] = rcKey.split('/');
              const rcToScale = replicationControllers.find(rc =>
                rc.metadata?.namespace === namespace && rc.metadata?.name === name
              );

              if (rcToScale) {
                await scaleReplicationController(rcToScale, count);
              }
            }
          }
        }
      }

      // Refresh RC list
      await fetchAllReplicationControllers();

    } catch (error) {
      console.error('Failed to scale ReplicationController(s):', error);
      setError(error instanceof Error ? error.message : 'Failed to scale ReplicationController(s)');
    }
  };

  // Prompt for and scale a single ReplicationController
  const promptAndScaleReplicationController = async (rc: any) => {
    const currentReplicas = rc.spec?.replicas || 0;
    const newReplicas = prompt(`Enter new replica count (current: ${currentReplicas}):`, String(currentReplicas));

    if (newReplicas !== null) {
      const replicaCount = parseInt(newReplicas, 10);

      if (!isNaN(replicaCount) && replicaCount >= 0) {
        await scaleReplicationController(rc, replicaCount);
      }
    }
  };

  // Scale ReplicationController function
  const scaleReplicationController = async (rc: any, replicas: number) => {
    if (!currentContext || !rc.metadata?.name || !rc.metadata?.namespace) return;

    await fetch(`${OPERATOR_URL}/clusters/${currentContext.name}/api/v1/namespaces/${rc.metadata.namespace}/replicationcontrollers/${rc.metadata.name}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/strategic-merge-patch+json',
      },
      body: JSON.stringify({
        spec: {
          replicas: replicas
        }
      }),
    });
  };

  const handleViewReplicationController = (e: React.MouseEvent, rc: any) => {
    e.stopPropagation();
    if (rc.metadata?.name && rc.metadata?.namespace) {
      navigate(`/dashboard/explore/replicationcontrollers/${rc.metadata.namespace}/${rc.metadata.name}`);
    }
  };

  const handleDeleteReplicationController = (e: React.MouseEvent, rc: any) => {
    e.stopPropagation();
    setActiveReplicationController(rc);
    setSelectedReplicationControllers(new Set([`${rc.metadata?.namespace}/${rc.metadata?.name}`]));
    setShowDeleteDialog(true);
  };

  const handleAskAI = (rc: any) => {
    try {
      // Convert replicationController to EnrichedSearchResult format
      const resourceContext = resourceToEnrichedSearchResult(
        rc,
        'replicationcontrollers',
        true, // namespaced
        '', // ReplicationController is in the core API group (empty string)
        'v1'
      );
      
      // Add to chat context and open drawer
      addResourceContext(resourceContext);
      
      // Show success toast
      toast({
        title: "Added to Chat",
        description: `ReplicationController "${rc.metadata?.name}" has been added to chat context`
      });
    } catch (error) {
      console.error('Error adding replicationController to chat:', error);
      toast({
        title: "Error",
        description: "Failed to add replicationController to chat context",
        variant: "destructive"
      });
    }
  };

  // Handle delete action
  const handleDeleteClick = () => {
    setShowContextMenu(false);
    setShowDeleteDialog(true);
  };

  // Perform actual deletion
  const deleteReplicationControllers = async () => {
    setShowDeleteDialog(false);
    setDeleteLoading(true);

    try {
      if (selectedReplicationControllers.size === 0 && activeReplicationController) {
        // Delete single active RC
        await deleteReplicationController(activeReplicationController);
      } else {
        // Delete all selected RCs
        for (const rcKey of selectedReplicationControllers) {
          const [namespace, name] = rcKey.split('/');
          const rcToDelete = replicationControllers.find(rc =>
            rc.metadata?.namespace === namespace && rc.metadata?.name === name
          );

          if (rcToDelete) {
            await deleteReplicationController(rcToDelete);
          }
        }
      }

      // Clear selection after deletion
      setSelectedReplicationControllers(new Set());

      // Refresh RC list
      await fetchAllReplicationControllers();

    } catch (error) {
      console.error('Failed to delete ReplicationController(s):', error);
      setError(error instanceof Error ? error.message : 'Failed to delete ReplicationController(s)');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Delete ReplicationController function
  const deleteReplicationController = async (rc: any) => {
    if (!currentContext || !rc.metadata?.name || !rc.metadata?.namespace) return;

    // We use the propagationPolicy Background to properly clean up resources
    await fetch(`${OPERATOR_URL}/clusters/${currentContext.name}/api/v1/namespaces/${rc.metadata.namespace}/replicationcontrollers/${rc.metadata.name}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        propagationPolicy: "Background"
      }),
    });
  };

  // Render the context menu
  const renderContextMenu = () => {
    if (!showContextMenu || !contextMenuPosition) return null;

    // Calculate if we need to show the menu above or below the click position
    const windowHeight = window.innerHeight;
    const menuHeight = 120; // Approximate context menu height
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
          {selectedReplicationControllers.size > 1
            ? `${selectedReplicationControllers.size} controllers selected`
            : activeReplicationController?.metadata?.name || 'ReplicationController actions'}
        </div>

        <div
          className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center"
          onClick={handleScaleReplicationControllers}
        >
          <Scale className="h-4 w-4 mr-2" />
          Scale {selectedReplicationControllers.size > 1 ? `(${selectedReplicationControllers.size})` : ''}
        </div>

        <div
          className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center text-red-600 dark:text-red-400"
          onClick={handleDeleteClick}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete {selectedReplicationControllers.size > 1 ? `(${selectedReplicationControllers.size})` : ''}
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
            <AlertDialogTitle>Confirm ReplicationController Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedReplicationControllers.size > 1
                ? `${selectedReplicationControllers.size} replication controllers`
                : `"${activeReplicationController?.metadata?.name}"`}?
              This action cannot be undone and will remove all associated pods unless you select the orphan policy.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteReplicationControllers}
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

  // Add sorting state
  const [sort, setSort] = useState<SortState>({
    field: null,
    direction: null
  });


  const fetchAllReplicationControllers = async () => {
    if (!currentContext || selectedNamespaces.length === 0) {
      setReplicationControllers([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // If no namespaces are selected, fetch from all namespaces
      if (selectedNamespaces.length === 0) {
        const replicationControllersData = await listResources(currentContext.name, 'replicationcontrollers');
        setReplicationControllers(replicationControllersData);
        return;
      }

      // Fetch replication controllers for each selected namespace
      const replicationControllerPromises = selectedNamespaces.map(namespace =>
        listResources(currentContext.name, 'replicationcontrollers', {
          namespace
        })
      );

      const results = await Promise.all(replicationControllerPromises);

      // Flatten the array of replication controller arrays
      const allReplicationControllers = results.flat();
      setReplicationControllers(allReplicationControllers);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch replication controllers:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch replication controllers');
    } finally {
      setLoading(false);
    }
  };
  // Fetch replication controllers for all selected namespaces
  useEffect(() => {


    fetchAllReplicationControllers();
  }, [currentContext, selectedNamespaces]);

  // Filter replication controllers based on search query
  const filteredReplicationControllers = useMemo(() => {
    if (!searchQuery.trim()) {
      return replicationControllers;
    }

    const lowercaseQuery = searchQuery.toLowerCase();

    return replicationControllers.filter(rc => {
      const name = rc.metadata?.name?.toLowerCase() || '';
      const namespace = rc.metadata?.namespace?.toLowerCase() || '';
      const labels = rc.metadata?.labels || {};
      const selector = rc.spec?.selector || {};

      // Check if name or namespace contains the query
      if (
        name.includes(lowercaseQuery) ||
        namespace.includes(lowercaseQuery)
      ) {
        return true;
      }

      // Check if any label contains the query
      const hasMatchingLabel = Object.entries(labels).some(
        ([key, value]) =>
          key.toLowerCase().includes(lowercaseQuery) ||
          (typeof value === 'string' && value.toLowerCase().includes(lowercaseQuery))
      );

      // Check if any selector contains the query
      const hasMatchingSelector = Object.entries(selector).some(
        ([key, value]) =>
          key.toLowerCase().includes(lowercaseQuery) ||
          (typeof value === 'string' && value.toLowerCase().includes(lowercaseQuery))
      );

      return hasMatchingLabel || hasMatchingSelector;
    });
  }, [replicationControllers, searchQuery]);

  // Sort replication controllers based on sort state
  const sortedReplicationControllers = useMemo(() => {
    if (!sort.field || !sort.direction) {
      return filteredReplicationControllers;
    }

    return [...filteredReplicationControllers].sort((a, b) => {
      const sortMultiplier = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'name':
          return (a.metadata?.name || '').localeCompare(b.metadata?.name || '') * sortMultiplier;

        case 'namespace':
          return (a.metadata?.namespace || '').localeCompare(b.metadata?.namespace || '') * sortMultiplier;

        case 'ready': {
          const readyA = a.status?.readyReplicas || 0;
          const readyB = b.status?.readyReplicas || 0;
          const totalA = a.spec?.replicas || 0;
          const totalB = b.spec?.replicas || 0;

          // Calculate ready percentage for more accurate sorting
          const percentA = totalA > 0 ? readyA / totalA : 0;
          const percentB = totalB > 0 ? readyB / totalB : 0;

          return (percentA - percentB) * sortMultiplier;
        }

        case 'desired': {
          const desiredA = a.spec?.replicas || 0;
          const desiredB = b.spec?.replicas || 0;
          return (desiredA - desiredB) * sortMultiplier;
        }

        case 'selector': {
          const selectorA = formatSelector(a.spec?.selector);
          const selectorB = formatSelector(b.spec?.selector);
          return selectorA.localeCompare(selectorB) * sortMultiplier;
        }

        case 'age': {
          const timeA = a.metadata?.creationTimestamp ? new Date(a.metadata.creationTimestamp).getTime() : 0;
          const timeB = b.metadata?.creationTimestamp ? new Date(b.metadata.creationTimestamp).getTime() : 0;
          return (timeA - timeB) * sortMultiplier;
        }

        case 'labels': {
          const labelsCountA = Object.keys(a.metadata?.labels || {}).length;
          const labelsCountB = Object.keys(b.metadata?.labels || {}).length;
          return (labelsCountA - labelsCountB) * sortMultiplier;
        }

        default:
          return 0;
      }
    });
  }, [filteredReplicationControllers, sort.field, sort.direction]);

  const handleReplicationControllerDetails = (rc: any) => {
    if (rc.metadata?.name && rc.metadata?.namespace) {
      navigate(`/dashboard/explore/replicationcontrollers/${rc.metadata.namespace}/${rc.metadata.name}`);
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
      return <ArrowUpDown className="ml-1 h-4 w-4 inline opacity-20" />;
    }

    if (sort.direction === 'asc') {
      return <ArrowUp className="ml-1 h-4 w-4 inline text-blue-500" />;
    }

    if (sort.direction === 'desc') {
      return <ArrowDown className="ml-1 h-4 w-4 inline text-blue-500" />;
    }

    return null;
  };

  // Check if replication controller has warning state
  const hasWarningState = (rc: any): boolean => {
    const desiredReplicas = rc.spec?.replicas || 0;
    const readyReplicas = rc.status?.readyReplicas || 0;
    const availableReplicas = rc.status?.availableReplicas || 0;

    return readyReplicas < desiredReplicas || availableReplicas < desiredReplicas;
  };

  // Format selector as string
  const formatSelector = (selector: Record<string, string> | undefined): string => {
    if (!selector || Object.keys(selector).length === 0) {
      return '-';
    }

    return Object.entries(selector)
      .map(([key, value]) => `${key}=${value}`)
      .join(', ');
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
          <h1 className='text-5xl font-[Anton] uppercase font-bold text-gray-800/30 dark:text-gray-700/50'>ReplicationControllers</h1>
          <div className="w-full md:w-96 mt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
              <Input
                type="text"
                placeholder="Search by name, namespace, or selector..."
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
      {sortedReplicationControllers.length === 0 && (
        <Alert className="my-6 bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <AlertDescription>
            {searchQuery
              ? `No replication controllers matching "${searchQuery}"`
              : selectedNamespaces.length === 0
                ? "Please select at least one namespace"
                : "No replication controllers found in the selected namespaces"}
          </AlertDescription>
        </Alert>
      )}

      {/* ReplicationControllers table */}
      {sortedReplicationControllers.length > 0 && (
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
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('ready')}
                  >
                    Ready {renderSortIndicator('ready')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('desired')}
                  >
                    Desired {renderSortIndicator('desired')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('selector')}
                  >
                    Selector {renderSortIndicator('selector')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('age')}
                  >
                    Age {renderSortIndicator('age')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('labels')}
                  >
                    Labels {renderSortIndicator('labels')}
                  </TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedReplicationControllers.map((rc) => (
                  <TableRow
                    key={`${rc.metadata?.namespace}-${rc.metadata?.name}`}
                    className={`bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30 ${hasWarningState(rc) ? 'bg-yellow-50 dark:bg-yellow-900/10' : ''
                      } ${selectedReplicationControllers.has(`${rc.metadata?.namespace}/${rc.metadata?.name}`) ? 'bg-blue-50 dark:bg-gray-800/30' : ''
                      }`}
                    onClick={(e) => handleReplicationControllerClick(e, rc)}
                    onContextMenu={(e) => handleContextMenu(e, rc)}
                  >
                    <TableCell className="font-medium">
                      <div className="hover:text-blue-500 hover:underline">
                        {rc.metadata?.name}
                      </div>
                    </TableCell>
                    <TableCell>{rc.metadata?.namespace}</TableCell>
                    <TableCell className="text-center">
                      {`${rc.status?.readyReplicas || 0}/${rc.spec?.replicas || 0}`}
                    </TableCell>
                    <TableCell className="text-center">
                      {rc.spec?.replicas || 0}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        <span className="text-sm text-gray-600 dark:text-gray-300">
                          {formatSelector(rc.spec?.selector)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {calculateAge(rc.metadata?.creationTimestamp?.toString())}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {rc.metadata?.labels &&
                          Object.entries(rc.metadata.labels)
                            .slice(0, 3) // Show at most 3 labels
                            .map(([key, value]) => (
                              <span
                                key={key}
                                className="px-2 py-1 rounded-[0.3rem] text-xs font-medium bg-gray-200 dark:bg-gray-900/20 border border-gray-300 dark:border-gray-800/80 text-gray-700 dark:text-gray-300"
                              >
                                {key}: {value as string}
                              </span>
                            ))}
                        {rc.metadata?.labels &&
                          Object.keys(rc.metadata.labels).length > 3 && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              +{Object.keys(rc.metadata.labels).length - 3} more
                            </span>
                          )}
                      </div>
                    </TableCell>
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
                            handleAskAI(rc);
                          }} className='hover:text-gray-700 dark:hover:text-gray-500'>
                            <Sparkles className="mr-2 h-4 w-4" />
                            Ask AI
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => handleViewReplicationController(e, rc)} className='hover:text-gray-700 dark:hover:text-gray-500'>
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-500 dark:text-red-400 focus:text-red-500 dark:focus:text-red-400 hover:text-red-700 dark:hover:text-red-500"
                            onClick={(e) => handleDeleteReplicationController(e, rc)}
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
    </div>
  );
};

export default ReplicationControllers;