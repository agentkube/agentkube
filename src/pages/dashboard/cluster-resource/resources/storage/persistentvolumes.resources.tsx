import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { getPersistentVolumes } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';
import { V1PersistentVolume } from '@kubernetes/client-node';
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, MoreVertical, Search, ArrowUpDown, ArrowUp, ArrowDown, Filter, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from 'react-router-dom';
import { calculateAge } from '@/utils/age';
import { ErrorComponent, ResourceFilterSidebar, type ColumnConfig } from '@/components/custom';
import { createPortal } from 'react-dom';
import { Trash2, Copy, Sparkles } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Eye, Trash } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { deleteResource } from '@/api/internal/resources';
import { OPERATOR_WS_URL } from '@/config';
import { useDrawer } from '@/contexts/useDrawer';
import { resourceToEnrichedSearchResult } from '@/utils/resource-to-enriched.utils';
import { toast } from '@/hooks/use-toast';
import { useReconMode } from '@/contexts/useRecon';
import { getStoredColumnConfig, saveColumnConfig, clearColumnConfig } from '@/utils/columnConfigStorage';

// Define sorting types
type SortDirection = 'asc' | 'desc' | null;
type SortField = 'name' | 'status' | 'claim' | 'capacity' | 'accessModes' | 'storageClass' | 'volumeType' | 'reclaimPolicy' | 'age' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

// Default column configuration
const defaultColumnConfig: ColumnConfig[] = [
  { key: 'name', label: 'Name', visible: true, canToggle: false },
  { key: 'status', label: 'Status', visible: true, canToggle: true },
  { key: 'claim', label: 'Claim', visible: true, canToggle: true },
  { key: 'capacity', label: 'Capacity', visible: true, canToggle: true },
  { key: 'accessModes', label: 'Access Modes', visible: true, canToggle: true },
  { key: 'storageClass', label: 'Storage Class', visible: true, canToggle: true },
  { key: 'reclaimPolicy', label: 'Reclaim Policy', visible: true, canToggle: true },
  { key: 'age', label: 'Age', visible: true, canToggle: true },
  { key: 'actions', label: 'Actions', visible: true, canToggle: false }
];
// Helper function to determine the volume type from the spec
const getVolumeType = (volume: V1PersistentVolume): string => {
  const spec = volume.spec;
  if (!spec) return 'Unknown';

  // Check for different volume types in order of likelihood
  if (spec.hostPath) return 'HostPath';
  if (spec.nfs) return 'NFS';
  if (spec.awsElasticBlockStore) return 'AWS EBS';
  if (spec.gcePersistentDisk) return 'GCE PD';
  if (spec.csi) return `CSI (${spec.csi.driver || 'unknown'})`;
  if (spec.iscsi) return 'iSCSI';
  if (spec.glusterfs) return 'GlusterFS';
  if (spec.rbd) return 'Ceph RBD';
  if (spec.cephfs) return 'CephFS';
  if (spec.azureDisk) return 'Azure Disk';
  if (spec.azureFile) return 'Azure File';
  if (spec.fc) return 'Fibre Channel';
  if (spec.local) return 'Local';

  // Check for other volume types
  const volumeKeys = Object.keys(spec).filter(key =>
    key !== 'accessModes' &&
    key !== 'persistentVolumeReclaimPolicy' &&
    key !== 'storageClassName' &&
    key !== 'volumeMode' &&
    key !== 'capacity' &&
    key !== 'nodeAffinity' &&
    key !== 'claimRef'
  );

  if (volumeKeys.length > 0) {
    return volumeKeys[0].charAt(0).toUpperCase() + volumeKeys[0].slice(1);
  }

  return 'Unknown';
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


// Get a color class based on the PV phase
const getStatusColorClass = (phase: string | undefined): string => {
  if (!phase) return 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300';

  switch (phase.toLowerCase()) {
    case 'bound':
      return 'bg-green-200 text-green-800 dark:bg-green-900/30 dark:text-green-400';
    case 'available':
      return 'bg-blue-200 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    case 'released':
      return 'bg-yellow-200 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
    case 'failed':
      return 'bg-red-200 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    case 'pending':
      return 'bg-orange-200 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
    default:
      return 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  }
};


const PersistentVolumes: React.FC = () => {
  const navigate = useNavigate();
  const { currentContext } = useCluster();
  const { isReconMode } = useReconMode();
  const [volumes, setVolumes] = useState<V1PersistentVolume[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectionIdRef = useRef<string | null>(null);

  // --- Start of Multi-select ---
  const [selectedVolumes, setSelectedVolumes] = useState<Set<string>>(new Set());
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [activeVolume, setActiveVolume] = useState<V1PersistentVolume | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const { addResourceContext } = useDrawer();

  // Column visibility state
  const [showFilterSidebar, setShowFilterSidebar] = useState(false);
  const [columnConfig, setColumnConfig] = useState<ColumnConfig[]>(() =>
    getStoredColumnConfig('persistentvolumes', defaultColumnConfig)
  );

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

  const handleViewVolume = (e: React.MouseEvent, volume: V1PersistentVolume) => {
    e.stopPropagation();
    if (volume.metadata?.name) {
      navigate(`/dashboard/explore/persistentvolumes/${volume.metadata.name}`);
    }
  };

  const handleDeleteVolumeMenuItem = (e: React.MouseEvent, volume: V1PersistentVolume) => {
    e.stopPropagation();

    if (isReconMode) {
      toast({
        title: "Recon Mode",
        description: "This action can't be performed while recon mode is on. Disable recon mode to proceed.",
        variant: "recon"
      });
      return;
    }

    setActiveVolume(volume);
    setSelectedVolumes(new Set([volume.metadata?.name || '']));
    setShowDeleteDialog(true);
  };
  // Add click handler for PV selection with cmd/ctrl key
  const handleVolumeClick = (e: React.MouseEvent, volume: V1PersistentVolume) => {
    const volumeKey = volume.metadata?.name || '';

    if (e.metaKey || e.ctrlKey) {
      // Prevent navigation when using multi-select
      e.preventDefault();
      e.stopPropagation();

      setSelectedVolumes(prev => {
        const newSelection = new Set(prev);
        if (newSelection.has(volumeKey)) {
          newSelection.delete(volumeKey);
        } else {
          newSelection.add(volumeKey);
        }
        return newSelection;
      });
    } else if (!selectedVolumes.has(volumeKey)) {
      // Clear selection on regular click (unless clicking on already selected volume)
      setSelectedVolumes(new Set());
      handleVolumeDetails(volume);
    } else {
      handleVolumeDetails(volume);
    }
  };

  // Add context menu handlers
  const handleContextMenu = (e: React.MouseEvent, volume: V1PersistentVolume) => {
    e.preventDefault();
    e.stopPropagation();

    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setActiveVolume(volume);
    setShowContextMenu(true);

    // Multi-select support: if volume isn't in selection, make it the only selection
    const volumeKey = volume.metadata?.name || '';
    if (!selectedVolumes.has(volumeKey)) {
      setSelectedVolumes(new Set([volumeKey]));
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

        if (isOutsideTable && !isContextMenuClick && !isAlertDialogClick && selectedVolumes.size > 0) {
          setSelectedVolumes(new Set());
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedVolumes]);


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

  const handleAskAI = (volume: V1PersistentVolume) => {
    try {
      // Convert persistent volume to EnrichedSearchResult format
      const resourceContext = resourceToEnrichedSearchResult(
        volume,
        'persistentvolumes',
        false, // not namespaced
        '',
        'v1'
      );

      // Add to chat context and open drawer
      addResourceContext(resourceContext);

      // Show success toast
      toast({
        title: "Added to Chat",
        description: `PersistentVolume "${volume.metadata?.name}" has been added to chat context`
      });
    } catch (error) {
      console.error('Error adding persistent volume to chat:', error);
      toast({
        title: "Error",
        description: "Failed to add persistent volume to chat context",
        variant: "destructive"
      });
    }
  };

  // Perform actual deletion
  const deleteVolumes = async () => {
    setShowDeleteDialog(false);
    setDeleteLoading(true);

    try {
      if (selectedVolumes.size === 0 && activeVolume) {
        // Delete single active PV
        await deletePV(activeVolume);
      } else {
        // Delete all selected PVs
        for (const volumeName of selectedVolumes) {
          const volumeToDelete = volumes.find(v => v.metadata?.name === volumeName);

          if (volumeToDelete) {
            await deletePV(volumeToDelete);
          }
        }
      }

      // Clear selection after deletion
      setSelectedVolumes(new Set());

      // Refresh PV list
      await fetchVolumes();

    } catch (error) {
      console.error('Failed to delete PV(s):', error);
      setError(error instanceof Error ? error.message : 'Failed to delete PV(s)');

      // Refresh the list even if some deletions failed to show current state
      try {
        await fetchVolumes();
      } catch (refreshError) {
        console.error('Failed to refresh PV list after deletion error:', refreshError);
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  // Delete PV function
  const deletePV = async (volume: V1PersistentVolume) => {
    if (!currentContext || !volume.metadata?.name) return;

    await deleteResource(
      currentContext.name,
      'persistentvolumes',
      volume.metadata.name
    );
  };

  // Render the context menu
  const renderContextMenu = () => {
    if (!showContextMenu || !contextMenuPosition) return null;

    // Calculate if we need to show the menu above or below the click position
    const windowHeight = window.innerHeight;
    const menuHeight = 150; // Approximate context menu height
    const shouldShowAbove = windowHeight - contextMenuPosition.y < menuHeight;

    // Check if PV is in a state where operations are allowed
    const isBound = activeVolume?.status?.phase === 'Bound';
    const isAvailable = activeVolume?.status?.phase === 'Available';

    return createPortal(
      <div
        ref={contextMenuRef}
        className="fixed z-50 min-w-[180px] bg-white dark:bg-card backdrop-blur-sm rounded-md shadow-lg border border-gray-300 dark:border-gray-800/60 py-1 text-sm"
        style={{
          left: `${contextMenuPosition.x}px`,
          top: shouldShowAbove
            ? `${contextMenuPosition.y - menuHeight}px`
            : `${contextMenuPosition.y}px`,
        }}
      >
        <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 font-medium border-b border-gray-200 dark:border-gray-800/60">
          {selectedVolumes.size > 1
            ? `${selectedVolumes.size} PVs selected`
            : activeVolume?.metadata?.name || 'PV actions'}
        </div>

        <div
          className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center text-red-600 dark:text-red-400"
          onClick={handleDeleteClick}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete {selectedVolumes.size > 1 ? `(${selectedVolumes.size})` : ''}
        </div>
      </div>,
      document.body
    );
  };

  // Delete confirmation dialog
  const renderDeleteDialog = () => {
    return (
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-gray-100 dark:bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm PV Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedVolumes.size > 1
                ? `${selectedVolumes.size} persistent volumes`
                : `"${activeVolume?.metadata?.name}"`}?
              This action cannot be undone.

              <div className="mt-2 text-amber-600 dark:text-amber-400">
                Warning: Deleting a PV may result in data loss. Make sure you have backed up any important data.
                {activeVolume?.spec?.claimRef && (
                  <div className="mt-1">
                    This volume is or was bound to a PVC. Deleting it may affect workloads.
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteVolumes}
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

  // Column management functions
  const handleColumnToggle = (columnKey: string, visible: boolean) => {
    const updated = columnConfig.map(col =>
      col.key === columnKey ? { ...col, visible } : col
    );
    setColumnConfig(updated);
    saveColumnConfig('persistentvolumes', updated);
  };

  const handleColumnReorder = (reorderedColumns: ColumnConfig[]) => {
    setColumnConfig(reorderedColumns);
    saveColumnConfig('persistentvolumes', reorderedColumns);
  };

  const handleResetToDefault = () => {
    const resetConfig = defaultColumnConfig.map(col => ({ ...col, visible: true }));
    setColumnConfig(resetConfig);
    clearColumnConfig('persistentvolumes');
  };

  // Add sorting state
  const [sort, setSort] = useState<SortState>({
    field: null,
    direction: null
  });

  // Handle incoming Kubernetes PV events
  const handlePvEvent = useCallback((kubeEvent: any) => {
    const { type, object: pv } = kubeEvent;

    if (!pv || !pv.metadata) return;

    setVolumes(prevVolumes => {
      const newVolumes = [...prevVolumes];
      const existingIndex = newVolumes.findIndex(
        v => v.metadata?.name === pv.metadata.name
      );

      switch (type) {
        case 'ADDED':
          if (existingIndex === -1) {
            newVolumes.push(pv);
          }
          break;

        case 'MODIFIED':
          if (existingIndex !== -1) {
            // Check if PV is being terminated
            if (pv.metadata.deletionTimestamp) {
              // Update the PV to show terminating state
              const updatedPv = {
                ...pv,
                status: {
                  ...pv.status,
                  phase: 'Terminating'
                }
              };
              newVolumes[existingIndex] = updatedPv;
            } else {
              // Normal modification
              newVolumes[existingIndex] = pv;
            }
          } else {
            // Sometimes MODIFIED events come before ADDED
            if (!pv.metadata.deletionTimestamp) {
              newVolumes.push(pv);
            }
          }
          break;

        case 'DELETED':
          if (existingIndex !== -1) {
            newVolumes.splice(existingIndex, 1);
          }
          break;

        case 'ERROR':
          setWsError(`Watch error: ${pv.message || 'Unknown error'}`);
          break;

        default:
          break;
      }

      return newVolumes;
    });
  }, []);

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
      // Create WebSocket connection to watch all PersistentVolumes (cluster-scoped resource)
      const clusterUrl = `${OPERATOR_WS_URL}/clusters/${currentContext.name}/api/v1/persistentvolumes?watch=1`;
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
            handlePvEvent(kubeEvent);
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

          // Only attempt to reconnect for unexpected closures
          if (event.code !== 1000 && event.code !== 1001 && currentContext) {
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
  }, [currentContext, handlePvEvent]);

  const fetchVolumes = async () => {
    if (!currentContext) {
      setVolumes([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const volumesData = await getPersistentVolumes(currentContext.name);
      setVolumes(volumesData);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch persistent volumes:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch persistent volumes');
    } finally {
      setLoading(false);
    }
  };

  // Initialize WebSocket connection when context changes
  useEffect(() => {
    if (!currentContext) {
      setVolumes([]);
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

    // Clear existing volumes when switching contexts
    setVolumes([]);
    setLoading(true);

    // First load existing PVs, then start WebSocket for real-time updates
    const initializeVolumes = async () => {
      try {
        // Load initial data using HTTP API
        await fetchVolumes();
        // Then start WebSocket watching for changes
        setTimeout(() => {
          connectWebSocket();
        }, 200);
      } catch (error) {
        console.error('Failed to initialize persistent volumes:', error);
        setLoading(false);
      }
    };

    initializeVolumes();

    // Cleanup function
    return () => {
      // Close WebSocket if component unmounts
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [currentContext]);

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

  // Filter volumes based on search query
  const filteredVolumes = useMemo(() => {
    if (!searchQuery.trim()) {
      return volumes;
    }

    const lowercaseQuery = searchQuery.toLowerCase();

    return volumes.filter(volume => {
      const name = volume.metadata?.name?.toLowerCase() || '';
      const storageClass = volume.spec?.storageClassName?.toLowerCase() || '';
      const status = volume.status?.phase?.toLowerCase() || '';
      const claimRef = volume.spec?.claimRef?.name?.toLowerCase() || '';
      const claimNamespace = volume.spec?.claimRef?.namespace?.toLowerCase() || '';
      const labels = volume.metadata?.labels || {};
      const pvType = getVolumeType(volume).toLowerCase();

      // Check if name, storage class, status, claim, or type contains the query
      if (
        name.includes(lowercaseQuery) ||
        storageClass.includes(lowercaseQuery) ||
        status.includes(lowercaseQuery) ||
        claimRef.includes(lowercaseQuery) ||
        claimNamespace.includes(lowercaseQuery) ||
        pvType.includes(lowercaseQuery)
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
  }, [volumes, searchQuery]);

  // Sort volumes based on sort state
  const sortedVolumes = useMemo(() => {
    if (!sort.field || !sort.direction) {
      return filteredVolumes;
    }

    return [...filteredVolumes].sort((a, b) => {
      const sortMultiplier = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'name':
          return (a.metadata?.name || '').localeCompare(b.metadata?.name || '') * sortMultiplier;

        case 'status': {
          const statusA = a.status?.phase || 'Unknown';
          const statusB = b.status?.phase || 'Unknown';

          // Define a custom order for status for better sorting
          const statusOrder: Record<string, number> = {
            'Bound': 1,
            'Available': 2,
            'Released': 3,
            'Pending': 4,
            'Failed': 5,
            'Unknown': 6
          };

          const orderA = statusOrder[statusA] || 7;
          const orderB = statusOrder[statusB] || 7;

          return (orderA - orderB) * sortMultiplier;
        }

        case 'claim': {
          const claimA = a.spec?.claimRef ? `${a.spec.claimRef.namespace}/${a.spec.claimRef.name}` : '';
          const claimB = b.spec?.claimRef ? `${b.spec.claimRef.namespace}/${b.spec.claimRef.name}` : '';

          // Sort volumes with claims before those without
          if (claimA && !claimB) return -1 * sortMultiplier;
          if (!claimA && claimB) return 1 * sortMultiplier;

          return claimA.localeCompare(claimB) * sortMultiplier;
        }

        case 'capacity': {
          // Get capacity for comparison
          const storageA = a.spec?.capacity?.storage || '';
          const storageB = b.spec?.capacity?.storage || '';

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
          const storageClassA = a.spec?.storageClassName || '';
          const storageClassB = b.spec?.storageClassName || '';
          return storageClassA.localeCompare(storageClassB) * sortMultiplier;
        }

        case 'volumeType': {
          const typeA = getVolumeType(a);
          const typeB = getVolumeType(b);
          return typeA.localeCompare(typeB) * sortMultiplier;
        }

        case 'reclaimPolicy': {
          const policyA = a.spec?.persistentVolumeReclaimPolicy || 'Retain';
          const policyB = b.spec?.persistentVolumeReclaimPolicy || 'Retain';

          // Custom ordering: Delete is "more dangerous" than Retain
          if (policyA === 'Delete' && policyB === 'Retain') return 1 * sortMultiplier;
          if (policyA === 'Retain' && policyB === 'Delete') return -1 * sortMultiplier;

          return policyA.localeCompare(policyB) * sortMultiplier;
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
  }, [filteredVolumes, sort.field, sort.direction]);

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


  const handleVolumeDetails = (volume: V1PersistentVolume) => {
    if (volume.metadata?.name) {
      navigate(`/dashboard/explore/persistentvolumes/${volume.metadata.name}`);
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

  // Helper function to render table header based on column key
  const renderTableHeader = (column: ColumnConfig) => {
    if (!column.visible || column.key === 'actions') {
      return null;
    }

    const sortFieldMap: Record<string, SortField> = {
      name: 'name',
      status: 'status',
      claim: 'claim',
      capacity: 'capacity',
      accessModes: 'accessModes',
      storageClass: 'storageClass',
      reclaimPolicy: 'reclaimPolicy',
      age: 'age'
    };

    const sortField = sortFieldMap[column.key];
    const isCenterColumn = ['status', 'claim', 'capacity', 'accessModes', 'storageClass', 'reclaimPolicy', 'age'].includes(column.key);

    const widthClass = column.key === 'status' ? 'w-[100px]' :
      column.key === 'capacity' ? 'w-[100px]' :
        column.key === 'accessModes' ? 'w-[150px]' :
          column.key === 'storageClass' ? 'w-[150px]' :
            column.key === 'age' ? 'w-[80px]' : '';

    return (
      <TableHead
        key={column.key}
        className={`cursor-pointer hover:text-blue-500 ${isCenterColumn ? 'text-center' : ''} ${widthClass}`}
        onClick={() => sortField && handleSort(sortField)}
      >
        {column.label} {sortField && renderSortIndicator(sortField)}
      </TableHead>
    );
  };

  // Helper function to render table cell based on column key
  const renderTableCell = (volume: V1PersistentVolume, column: ColumnConfig) => {
    if (!column.visible || column.key === 'actions') {
      return null;
    }

    switch (column.key) {
      case 'name':
        return (
          <TableCell key={column.key} className="font-medium">
            <div className="hover:text-blue-500 hover:underline">
              {volume.metadata?.name}
            </div>
          </TableCell>
        );

      case 'status':
        return (
          <TableCell key={column.key} className="text-center">
            <span className={`px-2 py-1 rounded-[0.3rem] text-xs font-medium ${getStatusColorClass(volume.status?.phase)}`}>
              {volume.status?.phase || 'Unknown'}
            </span>
          </TableCell>
        );

      case 'claim':
        return (
          <TableCell key={column.key} className="text-center">
            {volume.spec?.claimRef ? (
              <span className="text-sm">
                {volume.spec.claimRef.namespace}/{volume.spec.claimRef.name}
              </span>
            ) : (
              <span className="text-gray-500 dark:text-gray-400">-</span>
            )}
          </TableCell>
        );

      case 'capacity':
        return (
          <TableCell key={column.key} className="text-center">
            {formatStorage(volume.spec?.capacity?.storage)}
          </TableCell>
        );

      case 'accessModes':
        return (
          <TableCell key={column.key} className="text-center">
            <div className="flex flex-wrap justify-center gap-1">
              {volume.spec?.accessModes?.map((mode, index) => (
                <span
                  key={index}
                  className="px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300"
                >
                  {mode}
                </span>
              ))}
            </div>
          </TableCell>
        );

      case 'storageClass':
        return (
          <TableCell key={column.key} className="text-center">
            {volume.spec?.storageClassName || 'N/A'}
          </TableCell>
        );

      case 'reclaimPolicy':
        return (
          <TableCell key={column.key} className="text-center">
            <span
              className={`px-2 py-1 rounded-[0.3rem] text-xs font-medium ${volume.spec?.persistentVolumeReclaimPolicy === 'Delete'
                ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300'
                : 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300'
                }`}
            >
              {volume.spec?.persistentVolumeReclaimPolicy || 'Retain'}
            </span>
          </TableCell>
        );

      case 'age':
        return (
          <TableCell key={column.key} className="text-center">
            {calculateAge(volume.metadata?.creationTimestamp?.toString())}
          </TableCell>
        );

      default:
        return null;
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
          
          [&::-webkit-scrollbar]:w-1.5 
          [&::-webkit-scrollbar-track]:bg-transparent 
          [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">
      <div className='flex items-center justify-between md:flex-row gap-4 md:items-end'>
        <div>
          <h1 className='text-5xl font-[Anton] uppercase font-bold text-gray-800/30 dark:text-gray-700/50'>Persistent Volumes</h1>
          <div className="flex items-end gap-2 mt-2">
            <div className="w-full md:w-96">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search by name, status, or storage class..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (!wsConnected) {
                // Fallback to HTTP fetch if WebSocket is not connected
                fetchVolumes();
              } else {
                // Reconnect WebSocket
                connectWebSocket();
              }
            }}
            className="flex items-center gap-2 h-10 dark:text-gray-300/80"
            title={wsConnected ? "Reconnect WebSocket" : "Refresh volumes"}
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

      {/* Volumes table */}
      <Card className="bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
        <div className="rounded-md border">
          {renderContextMenu()}
          {renderDeleteDialog()}
          <Table className="bg-gray-50 dark:bg-transparent rounded-2xl">
            <TableHeader>
              <TableRow className="border-b border-gray-400 dark:border-gray-800/80">
                {columnConfig.map(col => renderTableHeader(col))}
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedVolumes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-gray-500 dark:text-gray-400">
                    {searchQuery
                      ? `No persistent volumes matching "${searchQuery}"`
                      : "No persistent volumes found in the cluster"}
                  </TableCell>
                </TableRow>
              ) : (
                sortedVolumes.map((volume) => (
                  <TableRow
                    key={volume.metadata?.name}
                    className={`bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30 ${selectedVolumes.has(volume.metadata?.name || '') ? 'bg-blue-50 dark:bg-gray-800/30' : ''
                      }`}
                    onClick={(e) => handleVolumeClick(e, volume)}
                    onContextMenu={(e) => handleContextMenu(e, volume)}
                  >
                    {columnConfig.map(col => renderTableCell(volume, col))}
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
                        <DropdownMenuContent align="end" className='dark:bg-card/40 backdrop-blur-sm text-gray-800 dark:text-gray-300 '>
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            handleAskAI(volume);
                          }} className='hover:text-gray-700 dark:hover:text-gray-500'>
                            <Sparkles className="mr-2 h-4 w-4" />
                            Ask AI
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => handleViewVolume(e, volume)} className='hover:text-gray-700 dark:hover:text-gray-500'>
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-500 dark:text-red-400 focus:text-red-500 dark:focus:text-red-400 hover:text-red-700 dark:hover:text-red-500"
                            onClick={(e) => handleDeleteVolumeMenuItem(e, volume)}
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
        title="Persistent Volumes Table"
        columns={columnConfig}
        onColumnToggle={handleColumnToggle}
        onColumnReorder={handleColumnReorder}
        onResetToDefault={handleResetToDefault}
        resourceType="persistentvolumes"
        className="w-1/3"
      />
    </div>
  );
};

export default PersistentVolumes;