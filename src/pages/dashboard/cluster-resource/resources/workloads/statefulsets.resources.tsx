import React, { useState, useEffect, useMemo } from 'react';
import { getStatefulSets } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';
import { useNamespace } from '@/contexts/useNamespace';
import { V1StatefulSet } from '@kubernetes/client-node';
import { useReconMode } from '@/contexts/useRecon';
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, MoreVertical, Search, ArrowUpDown, ArrowUp, ArrowDown, GitCompareArrows } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from 'react-router-dom';
import { calculateAge } from '@/utils/age';
import { NamespaceSelector, ErrorComponent, ScaleDialog, ResourceFilterSidebar, type ColumnConfig } from '@/components/custom';
import { Filter } from 'lucide-react';
import { useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, RefreshCw, Scale, Pause, Play, Sparkles } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Eye, Trash } from "lucide-react";
import { OPERATOR_URL, OPERATOR_WS_URL } from '@/config';
import { useDrawer } from '@/contexts/useDrawer';
import { resourceToEnrichedSearchResult } from '@/utils/resource-to-enriched.utils';
import { toast } from '@/hooks/use-toast';
import { getStoredColumnConfig, saveColumnConfig, clearColumnConfig } from '@/utils/columnConfigStorage';
import { useDriftAnalysis } from '@/contexts/useDriftAnalysis';

// Define sorting types
type SortDirection = 'asc' | 'desc' | null;
type SortField = 'name' | 'namespace' | 'ready' | 'current' | 'updated' | 'serviceName' | 'podManagement' | 'age' | 'labels' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

const StatefulSets: React.FC = () => {
  const navigate = useNavigate();
  const { currentContext } = useCluster();
  const { selectedNamespaces } = useNamespace();
  const { addToDriftCheck, openDriftAnalysis } = useDriftAnalysis();
  const [statefulSets, setStatefulSets] = useState<V1StatefulSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [showScaleDialog, setShowScaleDialog] = useState(false);
  const [selectedResourcesForScaling, setSelectedResourcesForScaling] = useState<V1StatefulSet[]>([]);
  const { isReconMode } = useReconMode();
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectionIdRef = useRef<string | null>(null);

  // Column visibility state
  const [showFilterSidebar, setShowFilterSidebar] = useState(false);

  // Default column configuration
  const defaultColumnConfig: ColumnConfig[] = [
    { key: 'name', label: 'Name', visible: true, canToggle: false }, // Required column
    { key: 'namespace', label: 'Namespace', visible: true, canToggle: true },
    { key: 'ready', label: 'Ready', visible: true, canToggle: true },
    { key: 'current', label: 'Current', visible: true, canToggle: true },
    { key: 'updated', label: 'Updated', visible: true, canToggle: true },
    { key: 'serviceName', label: 'Service Name', visible: true, canToggle: true },
    { key: 'podManagement', label: 'Pod Management', visible: true, canToggle: true },
    { key: 'age', label: 'Age', visible: true, canToggle: true },
    { key: 'actions', label: 'Actions', visible: true, canToggle: false } // Required column
  ];

  const [columnConfig, setColumnConfig] = useState<ColumnConfig[]>(() =>
    getStoredColumnConfig('statefulsets', defaultColumnConfig)
  );

  // --- Start of Multi-select ---
  const [selectedStatefulSets, setSelectedStatefulSets] = useState<Set<string>>(new Set());
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [activeStatefulSet, setActiveStatefulSet] = useState<V1StatefulSet | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const { addResourceContext } = useDrawer();

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

  // Add click handler for StatefulSet selection with cmd/ctrl key
  const handleStatefulSetClick = (e: React.MouseEvent, statefulSet: V1StatefulSet) => {
    const statefulSetKey = `${statefulSet.metadata?.namespace}/${statefulSet.metadata?.name}`;

    if (e.metaKey || e.ctrlKey) {
      // Prevent navigation when using multi-select
      e.preventDefault();
      e.stopPropagation();

      setSelectedStatefulSets(prev => {
        const newSelection = new Set(prev);
        if (newSelection.has(statefulSetKey)) {
          newSelection.delete(statefulSetKey);
        } else {
          newSelection.add(statefulSetKey);
        }
        return newSelection;
      });
    } else if (!selectedStatefulSets.has(statefulSetKey)) {
      // Clear selection on regular click (unless clicking on already selected statefulSet)
      setSelectedStatefulSets(new Set());
      handleStatefulSetDetails(statefulSet);
    } else {
      handleStatefulSetDetails(statefulSet);
    }
  };

  // Add context menu handlers
  const handleContextMenu = (e: React.MouseEvent, statefulSet: V1StatefulSet) => {
    e.preventDefault();
    e.stopPropagation();

    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setActiveStatefulSet(statefulSet);
    setShowContextMenu(true);

    // Multi-select support: if statefulSet isn't in selection, make it the only selection
    const statefulSetKey = `${statefulSet.metadata?.namespace}/${statefulSet.metadata?.name}`;
    if (!selectedStatefulSets.has(statefulSetKey)) {
      setSelectedStatefulSets(new Set([statefulSetKey]));
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

        if (isOutsideTable && !isContextMenuClick && !isAlertDialogClick && selectedStatefulSets.size > 0) {
          setSelectedStatefulSets(new Set());
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedStatefulSets]);

  // Handle restart action for StatefulSets (rolling restart)
  const handleRestartStatefulSets = async () => {
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
      if (selectedStatefulSets.size === 0 && activeStatefulSet) {
        // Restart single active statefulSet
        await restartStatefulSet(activeStatefulSet);
      } else {
        // Restart all selected statefulSets
        for (const statefulSetKey of selectedStatefulSets) {
          const [namespace, name] = statefulSetKey.split('/');
          const statefulSetToRestart = statefulSets.find(s =>
            s.metadata?.namespace === namespace && s.metadata?.name === name
          );

          if (statefulSetToRestart) {
            await restartStatefulSet(statefulSetToRestart);
          }
        }
      }

      // Refresh statefulSet list
      // You can call your fetchAllStatefulSets function here

    } catch (error) {
      console.error('Failed to restart statefulSet(s):', error);
      setError(error instanceof Error ? error.message : 'Failed to restart statefulSet(s)');
    }
  };

  // Restart statefulSet by updating a restart annotation
  const restartStatefulSet = async (statefulSet: V1StatefulSet) => {
    if (!currentContext || !statefulSet.metadata?.name || !statefulSet.metadata?.namespace) return;

    // Common Kubernetes pattern to force a rolling restart:
    // Add or update a "kubectl.kubernetes.io/restartedAt" annotation with the current timestamp
    const annotations = statefulSet.spec?.template?.metadata?.annotations || {};
    const restartedAt = new Date().toISOString();

    await fetch(`${OPERATOR_URL}/clusters/${currentContext.name}/apis/apps/v1/namespaces/${statefulSet.metadata.namespace}/statefulsets/${statefulSet.metadata.name}`, {
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

  // Handle scale action for StatefulSets
  const handleScaleStatefulSets = () => {
    if (isReconMode) {
      toast({
        title: "Recon Mode",
        description: "This action can't be performed while recon mode is on. Disable recon mode to proceed.",
        variant: "recon"
      });
      return;
    }

    setShowContextMenu(false);

    // Determine which statefulSets to scale
    if (selectedStatefulSets.size === 0 && activeStatefulSet) {
      // Single active statefulSet
      setSelectedResourcesForScaling([activeStatefulSet]);
    } else {
      // Multiple selected statefulSets
      const statefulSetList = Array.from(selectedStatefulSets).map(key => {
        const [namespace, name] = key.split('/');
        return statefulSets.find(s =>
          s.metadata?.namespace === namespace && s.metadata?.name === name
        );
      }).filter(Boolean) as V1StatefulSet[];

      setSelectedResourcesForScaling(statefulSetList);
    }

    setShowScaleDialog(true);
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
  const deleteStatefulSets = async () => {
    setShowDeleteDialog(false);
    setDeleteLoading(true);

    try {
      if (selectedStatefulSets.size === 0 && activeStatefulSet) {
        // Delete single active statefulSet
        await deleteStatefulSet(activeStatefulSet);
      } else {
        // Delete all selected statefulSets
        for (const statefulSetKey of selectedStatefulSets) {
          const [namespace, name] = statefulSetKey.split('/');
          const statefulSetToDelete = statefulSets.find(s =>
            s.metadata?.namespace === namespace && s.metadata?.name === name
          );

          if (statefulSetToDelete) {
            await deleteStatefulSet(statefulSetToDelete);
          }
        }
      }

      // Clear selection after deletion
      setSelectedStatefulSets(new Set());

      // Refresh statefulSet list
      await fetchAllStatefulSets();

    } catch (error) {
      console.error('Failed to delete statefulSet(s):', error);
      setError(error instanceof Error ? error.message : 'Failed to delete statefulSet(s)');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Delete statefulSet function
  const deleteStatefulSet = async (statefulSet: V1StatefulSet) => {
    if (!currentContext || !statefulSet.metadata?.name || !statefulSet.metadata?.namespace) return;

    // To configure deletion options, we can set propagationPolicy, for StatefulSets
    // "Orphan" preserves the PVCs, so let's offer that option
    // This could be enhanced with a radio button selection in the dialog
    const deletePolicy = "Background"; // or "Orphan" to keep PVCs

    await fetch(`${OPERATOR_URL}/clusters/${currentContext.name}/apis/apps/v1/namespaces/${statefulSet.metadata.namespace}/statefulsets/${statefulSet.metadata.name}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        propagationPolicy: deletePolicy
      }),
    });
  };

  // Render the context menu
  const renderContextMenu = () => {
    if (!showContextMenu || !contextMenuPosition) return null;

    // Calculate if we need to show the menu above or below the click position
    const windowHeight = window.innerHeight;
    const menuHeight = 200; // Approximate context menu height
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
          {selectedStatefulSets.size > 1
            ? `${selectedStatefulSets.size} statefulsets selected`
            : activeStatefulSet?.metadata?.name || 'StatefulSet actions'}
        </div>

        <div
          className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center"
          onClick={handleScaleStatefulSets}
        >
          <Scale className="h-4 w-4 mr-2" />
          Scale {selectedStatefulSets.size > 1 ? `(${selectedStatefulSets.size})` : ''}
        </div>

        <div
          className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center"
          onClick={handleRestartStatefulSets}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Restart {selectedStatefulSets.size > 1 ? `(${selectedStatefulSets.size})` : ''}
        </div>

        <div
          className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center text-red-600 dark:text-red-400"
          onClick={handleDeleteClick}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete {selectedStatefulSets.size > 1 ? `(${selectedStatefulSets.size})` : ''}
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
            <AlertDialogTitle>Confirm StatefulSet Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedStatefulSets.size > 1
                ? `${selectedStatefulSets.size} statefulsets`
                : `"${activeStatefulSet?.metadata?.name}"`}?
              This action cannot be undone. Associated pods will be deleted.

              <div className="mt-2 text-amber-600 dark:text-amber-400">
                Warning: This may delete or preserve persistent volumes depending on your deletion policy.
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteStatefulSets}
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

  const handleViewStatefulSet = (e: React.MouseEvent, statefulSet: V1StatefulSet) => {
    e.stopPropagation();
    if (statefulSet.metadata?.name && statefulSet.metadata?.namespace) {
      navigate(`/dashboard/explore/statefulsets/${statefulSet.metadata.namespace}/${statefulSet.metadata.name}`);
    }
  };

  const handleDeleteStatefulSet = (e: React.MouseEvent, statefulSet: V1StatefulSet) => {
    e.stopPropagation();
    if (isReconMode) {
      toast({
        title: "Recon Mode",
        description: "This action can't be performed while recon mode is on. Disable recon mode to proceed.",
        variant: "recon"
      });
      return;
    }

    setActiveStatefulSet(statefulSet);
    setSelectedStatefulSets(new Set([`${statefulSet.metadata?.namespace}/${statefulSet.metadata?.name}`]));
    setShowDeleteDialog(true);
  };

  const handleAskAI = (statefulSet: V1StatefulSet) => {
    try {
      const resourceContext = resourceToEnrichedSearchResult(
        statefulSet,
        'statefulsets',
        true,
        'apps',
        'v1'
      );

      addResourceContext(resourceContext);

      toast({
        title: "Added to Chat",
        description: `StatefulSet "${statefulSet.metadata?.name}" has been added to chat context`
      });
    } catch (error) {
      console.error('Error adding statefulset to chat:', error);
      toast({
        title: "Error",
        description: "Failed to add statefulset to chat context",
        variant: "destructive"
      });
    }
  };

  const handleDriftCheck = (statefulSet: V1StatefulSet) => {
    try {
      const namespace = statefulSet.metadata?.namespace || '';
      const kind = statefulSet.kind || 'StatefulSet';
      const name = statefulSet.metadata?.name || '';
      const resourceId = `${namespace}/${kind}/${name}`;

      // Add to drift check
      addToDriftCheck(resourceId);

      // Open drift analysis panel
      openDriftAnalysis();

      // Show success toast
      toast({
        title: "Added to Drift Analysis",
        description: `StatefulSet "${name}" has been added to drift check`
      });
    } catch (error) {
      console.error('Error adding statefulset to drift check:', error);
      toast({
        title: "Error",
        description: "Failed to add statefulset to drift check",
        variant: "destructive"
      });
    }
  };

  // Column management functions
  const handleColumnToggle = (columnKey: string, visible: boolean) => {
    setColumnConfig(prev => {
      const updated = prev.map(col =>
        col.key === columnKey ? { ...col, visible } : col
      );
      // Save to localStorage
      saveColumnConfig('statefulsets', updated);
      return updated;
    });
  };

  const handleColumnReorder = (reorderedColumns: ColumnConfig[]) => {
    setColumnConfig(reorderedColumns);
    // Save to localStorage
    saveColumnConfig('statefulsets', reorderedColumns);
  };

  const handleResetToDefault = () => {
    const resetConfig = defaultColumnConfig.map(col => ({ ...col, visible: true }));
    setColumnConfig(resetConfig);
    // Clear from localStorage to use defaults
    clearColumnConfig('statefulsets');
  };

  const isColumnVisible = (columnKey: string) => {
    const column = columnConfig.find(col => col.key === columnKey);
    return column?.visible ?? true;
  };

  // Helper function to render table header based on column key
  const renderTableHeader = (column: ColumnConfig) => {
    if (!column.visible || column.key === 'actions') {
      return null;
    }

    const sortFieldMap: Record<string, SortField> = {
      name: 'name',
      namespace: 'namespace',
      ready: 'ready',
      current: 'current',
      updated: 'updated',
      serviceName: 'serviceName',
      podManagement: 'podManagement',
      age: 'age'
    };

    const sortField = sortFieldMap[column.key];
    const isCenterColumn = ['ready', 'current', 'updated', 'age'].includes(column.key);

    return (
      <TableHead
        key={column.key}
        className={`cursor-pointer hover:text-blue-500 ${isCenterColumn ? 'text-center' : ''}`}
        onClick={() => sortField && handleSort(sortField)}
      >
        {column.label} {sortField && renderSortIndicator(sortField)}
      </TableHead>
    );
  };

  // Helper function to render table cell based on column key
  const renderTableCell = (statefulSet: V1StatefulSet, column: ColumnConfig) => {
    if (!column.visible || column.key === 'actions') {
      return null;
    }

    switch (column.key) {
      case 'name':
        return (
          <TableCell key={column.key} className="font-medium" onClick={() => handleStatefulSetDetails(statefulSet)}>
            <div className="flex items-center gap-2">
              <div className="hover:text-blue-500 hover:underline">
                {statefulSet.metadata?.name}
              </div>
              {hasWarningState(statefulSet) && (
                <Sparkles
                  className="h-4 w-4 text-yellow-500 hover:text-yellow-600 cursor-pointer transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAskAI(statefulSet);
                  }}
                />
              )}
            </div>
          </TableCell>
        );

      case 'namespace':
        return (
          <TableCell key={column.key}>
            <div className="hover:text-blue-500 hover:underline" onClick={() => navigate(`/dashboard/explore/namespaces`)}>
              {statefulSet.metadata?.namespace}
            </div>
          </TableCell>
        );

      case 'ready':
        return (
          <TableCell key={column.key} className="text-center">
            {`${statefulSet.status?.readyReplicas || 0}/${statefulSet.spec?.replicas || 0}`}
          </TableCell>
        );

      case 'current':
        return (
          <TableCell key={column.key} className="text-center">
            {statefulSet.status?.currentReplicas || 0}
          </TableCell>
        );

      case 'updated':
        return (
          <TableCell key={column.key} className="text-center">
            {statefulSet.status?.updatedReplicas || 0}
          </TableCell>
        );

      case 'serviceName':
        return (
          <TableCell key={column.key}>
            {statefulSet.spec?.serviceName || '-'}
          </TableCell>
        );

      case 'podManagement':
        return (
          <TableCell key={column.key}>
            <span className="px-2 py-1 rounded-[0.3rem] text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
              {statefulSet.spec?.podManagementPolicy || 'OrderedReady'}
            </span>
          </TableCell>
        );

      case 'age':
        return (
          <TableCell key={column.key} className="text-center">
            {calculateAge(statefulSet.metadata?.creationTimestamp?.toString())}
          </TableCell>
        );

      default:
        return null;
    }
  };
  // --- End of Multi-select ---

  // Add sorting state
  const [sort, setSort] = useState<SortState>({
    field: null,
    direction: null
  });

  // Handle incoming Kubernetes statefulset events
  const handleStatefulSetEvent = useCallback((kubeEvent: any) => {
    const { type, object: statefulSet } = kubeEvent;

    if (!statefulSet || !statefulSet.metadata) return;

    // Filter: only process statefulsets from selected namespaces
    if (selectedNamespaces.length > 0 && !selectedNamespaces.includes(statefulSet.metadata.namespace)) {
      return; // Skip statefulsets not in selected namespaces
    }

    setStatefulSets(prevStatefulSets => {
      const newStatefulSets = [...prevStatefulSets];
      const existingIndex = newStatefulSets.findIndex(
        s => s.metadata?.namespace === statefulSet.metadata.namespace &&
          s.metadata?.name === statefulSet.metadata.name
      );

      switch (type) {
        case 'ADDED':
          if (existingIndex === -1) {
            newStatefulSets.push(statefulSet);
          }
          break;

        case 'MODIFIED':
          if (existingIndex !== -1) {
            // Check if statefulset is being terminated
            if (statefulSet.metadata.deletionTimestamp) {
              // Update the statefulset to show terminating state
              const updatedStatefulSet = {
                ...statefulSet,
                status: {
                  ...statefulSet.status,
                  phase: 'Terminating'
                }
              };
              newStatefulSets[existingIndex] = updatedStatefulSet;
            } else {
              // Normal modification
              newStatefulSets[existingIndex] = statefulSet;
            }
          } else {
            // Sometimes MODIFIED events come before ADDED
            if (!statefulSet.metadata.deletionTimestamp) {
              newStatefulSets.push(statefulSet);
            }
          }
          break;

        case 'DELETED':
          if (existingIndex !== -1) {
            newStatefulSets.splice(existingIndex, 1);
          }
          break;

        case 'ERROR':
          setWsError(`Watch error: ${statefulSet.message || 'Unknown error'}`);
          break;

        default:
          break;
      }

      return newStatefulSets;
    });
  }, [selectedNamespaces]);

  // WebSocket connection management
  const connectWebSocket = useCallback(() => {
    if (!currentContext) {
      return;
    }

    // Create a connection ID based only on context (one connection per cluster)
    const connectionId = currentContext.name;

    // Don't create a new connection if we already have one for the same cluster
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && connectionIdRef.current === connectionId) {
      return;
    }

    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Clear any existing reconnection timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    try {
      // Create single WebSocket connection to watch ALL namespaces
      // We'll filter client-side to show only selected namespaces
      const clusterUrl = `${OPERATOR_WS_URL}/clusters/${currentContext.name}/apis/apps/v1/statefulsets?watch=1`;
      const ws = new WebSocket(clusterUrl);
      wsRef.current = ws;
      connectionIdRef.current = connectionId;

      ws.onopen = () => {
        // Only proceed if this is still the current connection
        if (connectionIdRef.current === connectionId) {
          setWsConnected(true);
          setWsError(null);
          setLoading(false);
          // Direct connection - no need to send REQUEST messages, 
          // WebSocket will automatically start receiving Kubernetes watch events
        }
      };

      ws.onmessage = (event) => {
        // Only process messages if this is still the current connection
        if (connectionIdRef.current !== connectionId) {
          return;
        }

        try {
          // Direct Kubernetes API watch response (no multiplexer wrapping)
          const kubeEvent = JSON.parse(event.data);

          // Handle Kubernetes watch event directly
          if (kubeEvent.type && kubeEvent.object) {
            handleStatefulSetEvent(kubeEvent);
          } else if (kubeEvent.type === 'ERROR') {
            setWsError(kubeEvent.object?.message || 'WebSocket error');
          }
        } catch (err) {
          console.warn('Failed to parse WebSocket message:', err);
        }
      };

      ws.onclose = (event) => {
        // Only handle close if this is still the current connection
        if (connectionIdRef.current === connectionId) {
          setWsConnected(false);
          wsRef.current = null;
          connectionIdRef.current = null;

          // Only attempt to reconnect for unexpected closures and if we still have context/namespaces
          if (event.code !== 1000 && event.code !== 1001 && currentContext && selectedNamespaces.length > 0) {
            reconnectTimeoutRef.current = setTimeout(() => {
              connectWebSocket();
            }, 5000);
          }
        }
      };

      ws.onerror = (error) => {
        // Only handle error if this is still the current connection
        if (connectionIdRef.current === connectionId) {
          console.error('WebSocket error:', error);
          setWsError('WebSocket connection failed');
          setWsConnected(false);
        }
      };

    } catch (err) {
      console.error('Failed to create WebSocket:', err);
      setWsError(err instanceof Error ? err.message : 'Failed to connect WebSocket');
      setLoading(false);
    }
  }, [currentContext, handleStatefulSetEvent]);

  // Fetch stateful sets for all selected namespaces
  const fetchAllStatefulSets = async () => {
    if (!currentContext || selectedNamespaces.length === 0) {
      setStatefulSets([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // If no namespaces are selected, fetch from all namespaces
      if (selectedNamespaces.length === 0) {
        const statefulSetsData = await getStatefulSets(currentContext.name);
        setStatefulSets(statefulSetsData);
        return;
      }

      // Fetch stateful sets for each selected namespace
      const statefulSetPromises = selectedNamespaces.map(namespace =>
        getStatefulSets(currentContext.name, namespace)
      );

      const results = await Promise.all(statefulSetPromises);

      // Flatten the array of stateful set arrays
      const allStatefulSets = results.flat();
      setStatefulSets(allStatefulSets);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch stateful sets:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch stateful sets');
    } finally {
      setLoading(false);
    }
  };

  // Initialize WebSocket connection when context or namespaces change
  useEffect(() => {
    if (!currentContext) {
      setStatefulSets([]);
      setLoading(false);
      // Close existing WebSocket connection
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      setWsConnected(false);
      connectionIdRef.current = null;
      return;
    }

    // Clear existing statefulsets when switching contexts/namespaces
    setStatefulSets([]);

    // If no namespaces selected, don't connect and show empty state
    if (selectedNamespaces.length === 0) {
      setLoading(false);
      // Close existing WebSocket connection
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      setWsConnected(false);
      connectionIdRef.current = null;
      return;
    }

    setLoading(true);

    // First load existing statefulsets, then start WebSocket for real-time updates
    const initializeStatefulSets = async () => {
      try {
        // Load initial data using HTTP API
        await fetchAllStatefulSets();
        // Then start WebSocket watching for changes
        setTimeout(() => {
          connectWebSocket();
        }, 200);
      } catch (error) {
        console.error('Failed to initialize statefulsets:', error);
        setLoading(false);
      }
    };

    initializeStatefulSets();

    // Cleanup function  
    return () => {
      // Close WebSocket if component unmounts
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [currentContext, selectedNamespaces.join(',')]);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  // Filter existing statefulsets when namespace selection changes
  useEffect(() => {
    if (selectedNamespaces.length === 0) {
      // No namespaces selected - show nothing
      setStatefulSets([]);
      return;
    }

    // Filter existing statefulsets based on new namespace selection
    setStatefulSets(prevStatefulSets =>
      prevStatefulSets.filter(statefulSet =>
        statefulSet.metadata?.namespace && selectedNamespaces.includes(statefulSet.metadata.namespace)
      )
    );
  }, [selectedNamespaces]);

  const handleScaleComplete = () => {
    // Refresh statefulSet list
    fetchAllStatefulSets();
  };

  // Filter stateful sets based on search query
  const filteredStatefulSets = useMemo(() => {
    if (!searchQuery.trim()) {
      return statefulSets;
    }

    const lowercaseQuery = searchQuery.toLowerCase();

    return statefulSets.filter(statefulSet => {
      const name = statefulSet.metadata?.name?.toLowerCase() || '';
      const namespace = statefulSet.metadata?.namespace?.toLowerCase() || '';
      const serviceName = statefulSet.spec?.serviceName?.toLowerCase() || '';
      const labels = statefulSet.metadata?.labels || {};

      // Check if name, namespace, or service name contains the query
      if (
        name.includes(lowercaseQuery) ||
        namespace.includes(lowercaseQuery) ||
        serviceName.includes(lowercaseQuery)
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
  }, [statefulSets, searchQuery]);

  // Sort stateful sets based on sort state
  const sortedStatefulSets = useMemo(() => {
    if (!sort.field || !sort.direction) {
      return filteredStatefulSets;
    }

    return [...filteredStatefulSets].sort((a, b) => {
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

        case 'current': {
          const currentA = a.status?.currentReplicas || 0;
          const currentB = b.status?.currentReplicas || 0;
          return (currentA - currentB) * sortMultiplier;
        }

        case 'updated': {
          const updatedA = a.status?.updatedReplicas || 0;
          const updatedB = b.status?.updatedReplicas || 0;
          return (updatedA - updatedB) * sortMultiplier;
        }

        case 'serviceName': {
          const serviceA = a.spec?.serviceName || '';
          const serviceB = b.spec?.serviceName || '';
          return serviceA.localeCompare(serviceB) * sortMultiplier;
        }

        case 'podManagement': {
          const policyA = a.spec?.podManagementPolicy || 'OrderedReady';
          const policyB = b.spec?.podManagementPolicy || 'OrderedReady';
          return policyA.localeCompare(policyB) * sortMultiplier;
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
  }, [filteredStatefulSets, sort.field, sort.direction]);

  const handleStatefulSetDetails = (statefulSet: V1StatefulSet) => {
    if (statefulSet.metadata?.name && statefulSet.metadata?.namespace) {
      navigate(`/dashboard/explore/statefulsets/${statefulSet.metadata.namespace}/${statefulSet.metadata.name}`);
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

  // Check if stateful set is in warning state
  const hasWarningState = (statefulSet: V1StatefulSet): boolean => {
    const desiredReplicas = statefulSet.spec?.replicas || 0;
    const readyReplicas = statefulSet.status?.readyReplicas || 0;
    const currentReplicas = statefulSet.status?.currentReplicas || 0;

    return readyReplicas < desiredReplicas || currentReplicas < desiredReplicas;
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
      <div className='flex items-center justify-between md:flex-row gap-4  md:items-end'>
        <div>
          <h1 className='text-5xl font-[Anton] uppercase font-bold text-gray-800/30 dark:text-gray-700/50'>StatefulSets</h1>
          <div className="w-full md:w-96 mt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
              <Input
                type="text"
                placeholder="Search by name, namespace, or service name..."
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
            onClick={() => {
              if (!wsConnected) {
                // Fallback to HTTP fetch if WebSocket is not connected
                fetchAllStatefulSets();
              } else {
                // Reconnect WebSocket
                connectWebSocket();
              }
            }}
            className="flex items-center gap-2 h-10 dark:text-gray-300/80"
            title={wsConnected ? "Reconnect WebSocket" : "Refresh statefulsets"}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
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

      {/* StatefulSets table */}
      <Card className="bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
        <div className="rounded-md border">
          {renderContextMenu()}
          {renderDeleteDialog()}
          <ScaleDialog
            isOpen={showScaleDialog}
            onClose={() => setShowScaleDialog(false)}
            onScaleComplete={handleScaleComplete}
            resources={selectedResourcesForScaling}
            resourceType="statefulset"
          />
          <Table className="bg-gray-50 dark:bg-transparent rounded-2xl">
            <TableHeader>
              <TableRow className="border-b border-gray-400 dark:border-gray-800/80">
                {columnConfig.map(col => renderTableHeader(col))}
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedStatefulSets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-gray-500 dark:text-gray-400">
                    {searchQuery
                      ? `No stateful sets matching "${searchQuery}"`
                      : selectedNamespaces.length === 0
                        ? "Please select at least one namespace"
                        : "No stateful sets found in the selected namespaces"}
                  </TableCell>
                </TableRow>
              ) : (
                sortedStatefulSets.map((statefulSet) => (
                  <TableRow
                    key={`${statefulSet.metadata?.namespace}-${statefulSet.metadata?.name}`}
                    className={`bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30 ${hasWarningState(statefulSet) ? 'bg-yellow-50 dark:bg-yellow-900/10' : ''
                      } ${selectedStatefulSets.has(`${statefulSet.metadata?.namespace}/${statefulSet.metadata?.name}`) ? 'bg-blue-50 dark:bg-gray-800/30' : ''
                      }`}
                    onClick={(e) => handleStatefulSetClick(e, statefulSet)}
                    onContextMenu={(e) => handleContextMenu(e, statefulSet)}
                  >
                    {columnConfig.map(col => renderTableCell(statefulSet, col))}
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
                        <DropdownMenuContent align="end" className='dark:bg-[#0B0D13]/40 backdrop-blur-sm text-gray-800 dark:text-gray-300'>
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            handleAskAI(statefulSet);
                          }} className='hover:text-gray-700 dark:hover:text-gray-500'>
                            <Sparkles className="mr-2 h-4 w-4" />
                            Ask AI
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            setActiveStatefulSet(statefulSet);
                            setSelectedStatefulSets(new Set([`${statefulSet.metadata?.namespace}/${statefulSet.metadata?.name}`]));
                            handleScaleStatefulSets();
                          }} className='hover:text-gray-700 dark:hover:text-gray-500'>
                            <Scale className="mr-2 h-4 w-4" />
                            Scale
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            setActiveStatefulSet(statefulSet);
                            setSelectedStatefulSets(new Set([`${statefulSet.metadata?.namespace}/${statefulSet.metadata?.name}`]));
                            handleRestartStatefulSets();
                          }} className='hover:text-gray-700 dark:hover:text-gray-500'>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Restart
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            handleDriftCheck(statefulSet);
                          }} className='hover:text-gray-700 dark:hover:text-gray-500'>
                            <GitCompareArrows className="mr-2 h-4 w-4" />
                            Drift Check
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => handleViewStatefulSet(e, statefulSet)} className='hover:text-gray-700 dark:hover:text-gray-500'>
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-500 dark:text-red-400 focus:text-red-500 dark:focus:text-red-400 hover:text-red-700 dark:hover:text-red-500"
                            onClick={(e) => handleDeleteStatefulSet(e, statefulSet)}
                          >
                            <Trash className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Resource Filter Sidebar */}
      <ResourceFilterSidebar
        isOpen={showFilterSidebar}
        onClose={() => setShowFilterSidebar(false)}
        title="StatefulSets Table"
        columns={columnConfig}
        onColumnToggle={handleColumnToggle}
        onColumnReorder={handleColumnReorder}
        onResetToDefault={handleResetToDefault}
        className="w-1/3"
        resourceType="statefulsets"
      />
    </div>
  );
};

export default StatefulSets;