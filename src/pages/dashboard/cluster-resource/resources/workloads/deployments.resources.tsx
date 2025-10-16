import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { getDeployments } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';
import { useNamespace } from '@/contexts/useNamespace';
import { V1Deployment } from '@kubernetes/client-node';
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, MoreVertical, Search, ArrowUpDown, ArrowUp, ArrowDown, Trash2, Pause, Play, Edit3, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from 'react-router-dom';
import { calculateAge } from '@/utils/age';
import { NamespaceSelector, ErrorComponent, ScaleDialog } from '@/components/custom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Eye, Trash } from "lucide-react";
import { AlertDialog, AlertDialogFooter, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogCancel, AlertDialogAction, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { createPortal } from 'react-dom';
import { OPERATOR_URL, OPERATOR_WS_URL } from '@/config';
import { useDrawer } from '@/contexts/useDrawer';
import { resourceToEnrichedSearchResult } from '@/utils/resource-to-enriched.utils';
import { toast } from '@/hooks/use-toast';
import { useReconMode } from '@/contexts/useRecon';
import { ResourceFilterSidebar, type ColumnConfig } from '@/components/custom';
import { Filter } from 'lucide-react';
import { getStoredColumnConfig, saveColumnConfig, clearColumnConfig } from '@/utils/columnConfigStorage';

// Define sorting types
type SortDirection = 'asc' | 'desc' | null;
type SortField = 'name' | 'namespace' | 'ready' | 'upToDate' | 'available' | 'replicas' | 'age' | 'labels' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

const Deployments: React.FC = () => {
  const navigate = useNavigate();
  const { currentContext } = useCluster();
  const { selectedNamespaces } = useNamespace();
  const { isReconMode } = useReconMode();
  const [deployments, setDeployments] = useState<V1Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [showScaleDialog, setShowScaleDialog] = useState(false);
  const [selectedResourcesForScaling, setSelectedResourcesForScaling] = useState<V1Deployment[]>([]);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectionIdRef = useRef<string | null>(null);

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

  const [selectedDeployments, setSelectedDeployments] = useState<Set<string>>(new Set());
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [activeDeployment, setActiveDeployment] = useState<V1Deployment | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const { addResourceContext } = useDrawer();

  // Column visibility state
  const [showFilterSidebar, setShowFilterSidebar] = useState(false);
  
  // Default column configuration
  const defaultColumnConfig: ColumnConfig[] = [
    { key: 'name', label: 'Name', visible: true, canToggle: false }, // Required column
    { key: 'namespace', label: 'Namespace', visible: true, canToggle: true },
    { key: 'ready', label: 'Ready', visible: true, canToggle: true },
    { key: 'upToDate', label: 'Up-to-date', visible: true, canToggle: true },
    { key: 'available', label: 'Available', visible: true, canToggle: true },
    { key: 'replicas', label: 'Replicas', visible: true, canToggle: true },
    { key: 'age', label: 'Age', visible: true, canToggle: true },
    { key: 'actions', label: 'Actions', visible: true, canToggle: false } // Required column
  ];
  
  const [columnConfig, setColumnConfig] = useState<ColumnConfig[]>(() => 
    getStoredColumnConfig('deployments', defaultColumnConfig)
  );

  // Add click handler for deployment selection with cmd/ctrl key
  const handleDeploymentClick = (e: React.MouseEvent, deployment: V1Deployment) => {
    const deploymentKey = `${deployment.metadata?.namespace}/${deployment.metadata?.name}`;

    if (e.metaKey || e.ctrlKey) {
      // Prevent navigation when using multi-select
      e.preventDefault();
      e.stopPropagation();

      setSelectedDeployments(prev => {
        const newSelection = new Set(prev);
        if (newSelection.has(deploymentKey)) {
          newSelection.delete(deploymentKey);
        } else {
          newSelection.add(deploymentKey);
        }
        return newSelection;
      });
    } else if (!selectedDeployments.has(deploymentKey)) {
      // Clear selection on regular click (unless clicking on already selected deployment)
      setSelectedDeployments(new Set());
      handleDeploymentDetails(deployment);
    } else {
      handleDeploymentDetails(deployment);
    }
  };

  // Add context menu handlers
  const handleContextMenu = (e: React.MouseEvent, deployment: V1Deployment) => {
    e.preventDefault();
    e.stopPropagation();

    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setActiveDeployment(deployment);
    setShowContextMenu(true);

    // Multi-select support: if deployment isn't in selection, make it the only selection
    const deploymentKey = `${deployment.metadata?.namespace}/${deployment.metadata?.name}`;
    if (!selectedDeployments.has(deploymentKey)) {
      setSelectedDeployments(new Set([deploymentKey]));
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

        if (isOutsideTable && !isContextMenuClick && !isAlertDialogClick && selectedDeployments.size > 0) {
          setSelectedDeployments(new Set());
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedDeployments]);

  // Handle restart action
  const handleRestartDeployments = async () => {
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
      if (selectedDeployments.size === 0 && activeDeployment) {
        // Restart single active deployment
        await restartDeployment(activeDeployment);
      } else {
        // Restart all selected deployments
        for (const deploymentKey of selectedDeployments) {
          const [namespace, name] = deploymentKey.split('/');
          const deploymentToRestart = deployments.find(d =>
            d.metadata?.namespace === namespace && d.metadata?.name === name
          );

          if (deploymentToRestart) {
            await restartDeployment(deploymentToRestart);
          }
        }
      }

      // Refresh deployment list
      // You can call your fetchAllDeployments function here

    } catch (error) {
      console.error('Failed to restart deployment(s):', error);
      setError(error instanceof Error ? error.message : 'Failed to restart deployment(s)');
    }
  };

  // Restart deployment function
  const restartDeployment = async (deployment: V1Deployment) => {
    if (!currentContext || !deployment.metadata?.name || !deployment.metadata?.namespace) return;

    // Common Kubernetes pattern to force a rolling restart:
    // Add or update a "kubectl.kubernetes.io/restartedAt" annotation with the current timestamp
    const annotations = deployment.metadata.annotations || {};
    const restartedAt = new Date().toISOString();

    await fetch(`${OPERATOR_URL}/clusters/${currentContext.name}/apis/apps/v1/namespaces/${deployment.metadata.namespace}/deployments/${deployment.metadata.name}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/strategic-merge-patch+json',
      },
      body: JSON.stringify({
        spec: {
          template: {
            metadata: {
              annotations: {
                'kubectl.kubernetes.io/restartedAt': restartedAt
              }
            }
          }
        }
      }),
    });
  };

  // Column management functions
  const handleColumnToggle = (columnKey: string, visible: boolean) => {
    setColumnConfig(prev => {
      const updated = prev.map(col =>
        col.key === columnKey ? { ...col, visible } : col
      );
      // Save to localStorage
      saveColumnConfig('deployments', updated);
      return updated;
    });
  };

  const handleColumnReorder = (reorderedColumns: ColumnConfig[]) => {
    setColumnConfig(reorderedColumns);
    // Save to localStorage
    saveColumnConfig('deployments', reorderedColumns);
  };

  const handleResetToDefault = () => {
    const resetConfig = defaultColumnConfig.map(col => ({ ...col, visible: true }));
    setColumnConfig(resetConfig);
    // Clear from localStorage to use defaults
    clearColumnConfig('deployments');
  };

  const isColumnVisible = (columnKey: string) => {
    const column = columnConfig.find(col => col.key === columnKey);
    return column?.visible ?? true;
  };

  // Helper function to render table header based on column key
  const renderTableHeader = (columnKey: string) => {
    const sortFieldMap: Record<string, SortField> = {
      name: 'name',
      namespace: 'namespace',
      ready: 'ready',
      upToDate: 'upToDate',
      available: 'available',
      replicas: 'replicas',
      age: 'age'
    };

    const sortField = sortFieldMap[columnKey];
    const column = columnConfig.find(col => col.key === columnKey);

    if (!column || !column.visible || columnKey === 'actions') {
      return null;
    }

    const isNumericColumn = ['ready', 'upToDate', 'available', 'replicas', 'age'].includes(columnKey);

    return (
      <TableHead
        key={columnKey}
        className={`cursor-pointer hover:text-blue-500 ${isNumericColumn ? 'text-center' : ''}`}
        onClick={() => sortField && handleSort(sortField)}
      >
        {column.label} {sortField && renderSortIndicator(sortField)}
      </TableHead>
    );
  };

  // Helper function to render table cell based on column key
  const renderTableCell = (deployment: V1Deployment, columnKey: string) => {
    const column = columnConfig.find(col => col.key === columnKey);

    if (!column || !column.visible || columnKey === 'actions') {
      return null;
    }

    const isNumericColumn = ['ready', 'upToDate', 'available', 'replicas', 'age'].includes(columnKey);

    let cellContent;
    switch (columnKey) {
      case 'name':
        cellContent = (
          <div className="hover:text-blue-500 hover:underline">
            {deployment.metadata?.name}
          </div>
        );
        break;
      case 'namespace':
        cellContent = (
          <div className="hover:text-blue-500 hover:underline" onClick={() => navigate(`/dashboard/explore/namespaces`)}>
            {deployment.metadata?.namespace}
          </div>
        );
        break;
      case 'ready':
        cellContent = `${deployment.status?.readyReplicas || 0}/${deployment.status?.replicas || 0}`;
        break;
      case 'upToDate':
        cellContent = deployment.status?.updatedReplicas || 0;
        break;
      case 'available':
        cellContent = deployment.status?.availableReplicas || 0;
        break;
      case 'replicas':
        cellContent = (
          <div className="flex flex-col items-center">
            <span>{deployment.spec?.replicas || 0}</span>
            {deployment.status?.replicas !== deployment.spec?.replicas && (
              <span className="text-xs text-amber-600 dark:text-amber-400">
                Scaling
              </span>
            )}
          </div>
        );
        break;
      case 'age':
        cellContent = calculateAge(deployment.metadata?.creationTimestamp?.toString());
        break;
      default:
        cellContent = null;
    }

    return (
      <TableCell
        key={columnKey}
        className={`${isNumericColumn ? 'text-center' : ''} ${columnKey === 'name' ? 'font-medium' : ''}`}
        onClick={columnKey === 'name' ? () => handleDeploymentDetails(deployment) : undefined}
      >
        {cellContent}
      </TableCell>
    );
  };

  // Handle scale action
  const handleScaleDeployment = () => {
    if (isReconMode) {
      toast({
        title: "Recon Mode",
        description: "This action can't be performed while recon mode is on. Disable recon mode to proceed.",
        variant: "recon"
      });
      return;
    }
    
    setShowContextMenu(false);

    // Determine which deployments to scale
    if (selectedDeployments.size === 0 && activeDeployment) {
      // Single active deployment
      setSelectedResourcesForScaling([activeDeployment]);
    } else {
      // Multiple selected deployments
      const deploymentList = Array.from(selectedDeployments).map(key => {
        const [namespace, name] = key.split('/');
        return deployments.find(d =>
          d.metadata?.namespace === namespace && d.metadata?.name === name
        );
      }).filter(Boolean) as V1Deployment[];

      setSelectedResourcesForScaling(deploymentList);
    }

    setShowScaleDialog(true);
  };

  // Scale deployment function
  const scaleDeployment = async (deployment: V1Deployment, replicas: number) => {
    if (!currentContext || !deployment.metadata?.name || !deployment.metadata?.namespace) return;

    await fetch(`${OPERATOR_URL}/clusters/${currentContext.name}/apis/apps/v1/namespaces/${deployment.metadata.namespace}/deployments/${deployment.metadata.name}`, {
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
  const handleScaleComplete = () => {
    // Refresh deployments list
    fetchAllDeployments();
  };

  // Handle pause/resume deployments
  const handlePauseResumeDeployment = async () => {
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
      if (selectedDeployments.size === 0 && activeDeployment) {
        // Toggle pause/resume on single active deployment
        const isPaused = isDeploymentPaused(activeDeployment);
        await pauseResumeDeployment(activeDeployment, !isPaused);
      } else {
        // Apply to all selected deployments
        for (const deploymentKey of selectedDeployments) {
          const [namespace, name] = deploymentKey.split('/');
          const deployment = deployments.find(d =>
            d.metadata?.namespace === namespace && d.metadata?.name === name
          );

          if (deployment) {
            const isPaused = isDeploymentPaused(deployment);
            await pauseResumeDeployment(deployment, !isPaused);
          }
        }
      }

      // Refresh deployment list

    } catch (error) {
      console.error('Failed to pause/resume deployment(s):', error);
      setError(error instanceof Error ? error.message : 'Failed to pause/resume deployment(s)');
    }
  };

  // Check if deployment is paused
  const isDeploymentPaused = (deployment: V1Deployment): boolean => {
    return deployment.spec?.paused === true;
  };

  // Pause/resume deployment function
  const pauseResumeDeployment = async (deployment: V1Deployment, pause: boolean) => {
    if (!currentContext || !deployment.metadata?.name || !deployment.metadata?.namespace) return;

    await fetch(`${OPERATOR_URL}/clusters/${currentContext.name}/apis/apps/v1/namespaces/${deployment.metadata.namespace}/deployments/${deployment.metadata.name}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/strategic-merge-patch+json',
      },
      body: JSON.stringify({
        spec: {
          paused: pause
        }
      }),
    });
  };

  const handleViewDeployment = (e: React.MouseEvent, deployment: V1Deployment) => {
    e.stopPropagation();
    if (deployment.metadata?.name && deployment.metadata?.namespace) {
      navigate(`/dashboard/explore/deployments/${deployment.metadata.namespace}/${deployment.metadata.name}`);
    }
  };

  const handleDeleteDeployment = (e: React.MouseEvent, deployment: V1Deployment) => {
    e.stopPropagation();
    
    if (isReconMode) {
      toast({
        title: "Recon Mode",
        description: "This action can't be performed while recon mode is on. Disable recon mode to proceed.",
        variant: "recon"
      });
      return;
    }
    
    setActiveDeployment(deployment);
    setSelectedDeployments(new Set([`${deployment.metadata?.namespace}/${deployment.metadata?.name}`]));
    setShowDeleteDialog(true);
  };

  const handleAskAI = (deployment: V1Deployment) => {
    try {
      // Convert deployment to EnrichedSearchResult format
      const resourceContext = resourceToEnrichedSearchResult(
        deployment,
        'deployments',
        true, // namespaced
        'apps',
        'v1'
      );
      
      // Add to chat context
      addResourceContext(resourceContext);
      
      // Show success toast
      toast({
        title: "Added to Chat",
        description: `Deployment "${deployment.metadata?.name}" has been added to chat context`
      });
    } catch (error) {
      console.error('Error adding deployment to chat:', error);
      toast({
        title: "Error",
        description: "Failed to add deployment to chat context",
        variant: "destructive"
      });
    }
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
  const deleteDeployments = async () => {
    setShowDeleteDialog(false);
    setDeleteLoading(true);

    try {
      if (selectedDeployments.size === 0 && activeDeployment) {
        // Delete single active deployment
        await deleteDeployment(activeDeployment);
      } else {
        // Delete all selected deployments
        for (const deploymentKey of selectedDeployments) {
          const [namespace, name] = deploymentKey.split('/');
          const deploymentToDelete = deployments.find(d =>
            d.metadata?.namespace === namespace && d.metadata?.name === name
          );

          if (deploymentToDelete) {
            await deleteDeployment(deploymentToDelete);
          }
        }
      }

      // Clear selection after deletion
      setSelectedDeployments(new Set());

      // Refresh deployment list
      await fetchAllDeployments();

    } catch (error) {
      console.error('Failed to delete deployment(s):', error);
      setError(error instanceof Error ? error.message : 'Failed to delete deployment(s)');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Delete deployment function
  const deleteDeployment = async (deployment: V1Deployment) => {
    if (!currentContext || !deployment.metadata?.name || !deployment.metadata?.namespace) return;

    await fetch(`${OPERATOR_URL}/clusters/${currentContext.name}/apis/apps/v1/namespaces/${deployment.metadata.namespace}/deployments/${deployment.metadata.name}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });
  };

  // Render the context menu
  const renderContextMenu = () => {
    if (!showContextMenu || !contextMenuPosition) return null;

    // Calculate if we need to show the menu above or below the click position
    const windowHeight = window.innerHeight;
    const menuHeight = 200; // Approximate context menu height
    const shouldShowAbove = windowHeight - contextMenuPosition.y < menuHeight;

    const isPaused = activeDeployment ? isDeploymentPaused(activeDeployment) : false;

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
          {selectedDeployments.size > 1
            ? `${selectedDeployments.size} deployments selected`
            : activeDeployment?.metadata?.name || 'Deployment actions'}
        </div>

        <div
          className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center"
          onClick={handleRestartDeployments}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Restart {selectedDeployments.size > 1 ? `(${selectedDeployments.size})` : ''}
        </div>

        <div
          className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center"
          onClick={handleScaleDeployment}
        >
          <Edit3 className="h-4 w-4 mr-2" />
          Scale
        </div>

        <div
          className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center"
          onClick={handlePauseResumeDeployment}
        >
          {isPaused ? (
            <>
              <Play className="h-4 w-4 mr-2" />
              Resume {selectedDeployments.size > 1 ? `(${selectedDeployments.size})` : ''}
            </>
          ) : (
            <>
              <Pause className="h-4 w-4 mr-2" />
              Pause {selectedDeployments.size > 1 ? `(${selectedDeployments.size})` : ''}
            </>
          )}
        </div>

        <div
          className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center text-red-600 dark:text-red-400"
          onClick={handleDeleteClick}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete {selectedDeployments.size > 1 ? `(${selectedDeployments.size})` : ''}
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
            <AlertDialogTitle>Confirm Deployment Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedDeployments.size > 1
                ? `${selectedDeployments.size} deployments`
                : `"${activeDeployment?.metadata?.name}"`}?
              This action cannot be undone and will remove all associated pods and replica sets.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteDeployments}
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

  // Add sorting state
  const [sort, setSort] = useState<SortState>({
    field: null,
    direction: null
  });

  // Handle incoming Kubernetes deployment events
  const handleDeploymentEvent = useCallback((kubeEvent: any) => {
    const { type, object: deployment } = kubeEvent;
    
    if (!deployment || !deployment.metadata) return;
    
    // Filter: only process deployments from selected namespaces
    if (selectedNamespaces.length > 0 && !selectedNamespaces.includes(deployment.metadata.namespace)) {
      return; // Skip deployments not in selected namespaces
    }

    setDeployments(prevDeployments => {
      const newDeployments = [...prevDeployments];
      const existingIndex = newDeployments.findIndex(
        d => d.metadata?.namespace === deployment.metadata.namespace && 
             d.metadata?.name === deployment.metadata.name
      );

      switch (type) {
        case 'ADDED':
          if (existingIndex === -1) {
            newDeployments.push(deployment);
          }
          break;

        case 'MODIFIED':
          if (existingIndex !== -1) {
            // Check if deployment is being terminated
            if (deployment.metadata.deletionTimestamp) {
              // Update the deployment to show terminating state
              const updatedDeployment = {
                ...deployment,
                status: {
                  ...deployment.status,
                  phase: 'Terminating'
                }
              };
              newDeployments[existingIndex] = updatedDeployment;
            } else {
              // Normal modification
              newDeployments[existingIndex] = deployment;
            }
          } else {
            // Sometimes MODIFIED events come before ADDED
            if (!deployment.metadata.deletionTimestamp) {
              newDeployments.push(deployment);
            }
          }
          break;

        case 'DELETED':
          if (existingIndex !== -1) {
            newDeployments.splice(existingIndex, 1);
          }
          break;

        case 'ERROR':
          setWsError(`Watch error: ${deployment.message || 'Unknown error'}`);
          break;

        default:
          break;
      }

      return newDeployments;
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
      const clusterUrl = `${OPERATOR_WS_URL}/clusters/${currentContext.name}/apis/apps/v1/deployments?watch=1`;
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
            handleDeploymentEvent(kubeEvent);
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
  }, [currentContext, handleDeploymentEvent]);

  // Fetch deployments for all selected namespaces
  const fetchAllDeployments = async () => {
    if (!currentContext || selectedNamespaces.length === 0) {
      setDeployments([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // If no namespaces are selected, fetch from all namespaces
      if (selectedNamespaces.length === 0) {
        const deploymentsData = await getDeployments(currentContext.name);
        setDeployments(deploymentsData);
        return;
      }

      // Fetch deployments for each selected namespace
      const deploymentPromises = selectedNamespaces.map(namespace =>
        getDeployments(currentContext.name, namespace)
      );

      const results = await Promise.all(deploymentPromises);

      // Flatten the array of deployment arrays
      const allDeployments = results.flat();
      setDeployments(allDeployments);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch deployments:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch deployments');
    } finally {
      setLoading(false);
    }
  };

  // Initialize WebSocket connection when context or namespaces change
  useEffect(() => {
    if (!currentContext) {
      setDeployments([]);
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

    // Clear existing deployments when switching contexts/namespaces
    setDeployments([]);
    
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
    
    // First load existing deployments, then start WebSocket for real-time updates
    const initializeDeployments = async () => {
      try {
        // Load initial data using HTTP API
        await fetchAllDeployments();
        // Then start WebSocket watching for changes
        setTimeout(() => {
          connectWebSocket();
        }, 200);
      } catch (error) {
        console.error('Failed to initialize deployments:', error);
        setLoading(false);
      }
    };
    
    initializeDeployments();

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

  // Filter existing deployments when namespace selection changes
  useEffect(() => {
    if (selectedNamespaces.length === 0) {
      // No namespaces selected - show nothing
      setDeployments([]);
      return;
    }
    
    // Filter existing deployments based on new namespace selection
    setDeployments(prevDeployments => 
      prevDeployments.filter(deployment => 
        deployment.metadata?.namespace && selectedNamespaces.includes(deployment.metadata.namespace)
      )
    );
  }, [selectedNamespaces]);

  // Filter deployments based on search query
  const filteredDeployments = useMemo(() => {
    if (!searchQuery.trim()) {
      return deployments;
    }

    const lowercaseQuery = searchQuery.toLowerCase();

    return deployments.filter(deployment => {
      const name = deployment.metadata?.name?.toLowerCase() || '';
      const namespace = deployment.metadata?.namespace?.toLowerCase() || '';
      const labels = deployment.metadata?.labels || {};

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
  }, [deployments, searchQuery]);

  // Sort deployments based on sort state
  const sortedDeployments = useMemo(() => {
    if (!sort.field || !sort.direction) {
      return filteredDeployments;
    }

    return [...filteredDeployments].sort((a, b) => {
      const sortMultiplier = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'name':
          return (a.metadata?.name || '').localeCompare(b.metadata?.name || '') * sortMultiplier;

        case 'namespace':
          return (a.metadata?.namespace || '').localeCompare(b.metadata?.namespace || '') * sortMultiplier;

        case 'ready': {
          const readyA = a.status?.readyReplicas || 0;
          const readyB = b.status?.readyReplicas || 0;
          const totalA = a.status?.replicas || 0;
          const totalB = b.status?.replicas || 0;

          // Calculate ready percentage for more accurate sorting
          const percentA = totalA > 0 ? readyA / totalA : 0;
          const percentB = totalB > 0 ? readyB / totalB : 0;

          return (percentA - percentB) * sortMultiplier;
        }

        case 'upToDate': {
          const updatedA = a.status?.updatedReplicas || 0;
          const updatedB = b.status?.updatedReplicas || 0;
          return (updatedA - updatedB) * sortMultiplier;
        }

        case 'available': {
          const availableA = a.status?.availableReplicas || 0;
          const availableB = b.status?.availableReplicas || 0;
          return (availableA - availableB) * sortMultiplier;
        }

        case 'replicas': {
          const replicasA = a.spec?.replicas || 0;
          const replicasB = b.spec?.replicas || 0;
          return (replicasA - replicasB) * sortMultiplier;
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
  }, [filteredDeployments, sort.field, sort.direction]);

  const handleDeploymentDetails = (deployment: V1Deployment) => {
    if (deployment.metadata?.name && deployment.metadata?.namespace) {
      navigate(`/dashboard/explore/deployments/${deployment.metadata.namespace}/${deployment.metadata.name}`);
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
          <h1 className='text-5xl font-[Anton] uppercase font-bold text-gray-800/30 dark:text-gray-700/50'>Deployments</h1>
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
            onClick={() => {
              if (!wsConnected) {
                // Fallback to HTTP fetch if WebSocket is not connected
                fetchAllDeployments();
              } else {
                // Reconnect WebSocket
                connectWebSocket();
              }
            }}
            className="flex items-center gap-2 h-10 dark:text-gray-300/80"
            title={wsConnected ? "Reconnect WebSocket" : "Refresh deployments"}
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

      {/* No results message */}
      {sortedDeployments.length === 0 && (
        <Alert className="my-6 bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <AlertDescription>
            {searchQuery
              ? `No deployments matching "${searchQuery}"`
              : selectedNamespaces.length === 0
                ? "Please select at least one namespace"
                : "No deployments found in the selected namespaces"}
          </AlertDescription>
        </Alert>
      )}

      {/* Deployments table */}
      {sortedDeployments.length > 0 && (
        <Card className="bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <div className="rounded-md border">
            {renderContextMenu()}
            {renderDeleteDialog()}
            <ScaleDialog
              isOpen={showScaleDialog}
              onClose={() => setShowScaleDialog(false)}
              onScaleComplete={handleScaleComplete}
              resources={selectedResourcesForScaling}
              resourceType="deployment"
            />
            <Table className="bg-gray-50 dark:bg-transparent rounded-2xl">
              <TableHeader>
                <TableRow className="border-b border-gray-400 dark:border-gray-800/80">
                  {columnConfig.map(col => renderTableHeader(col.key))}
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedDeployments.map((deployment) => (
                  <TableRow
                    key={`${deployment.metadata?.namespace}-${deployment.metadata?.name}`}
                    className={`bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30 ${selectedDeployments.has(`${deployment.metadata?.namespace}/${deployment.metadata?.name}`) ? 'bg-blue-50 dark:bg-gray-800/30' : ''
                      }`}
                    onClick={(e) => handleDeploymentClick(e, deployment)}
                    onContextMenu={(e) => handleContextMenu(e, deployment)}
                  >
                    {columnConfig.map(col => renderTableCell(deployment, col.key))}
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
                            handleAskAI(deployment);
                          }} className='hover:text-gray-700 dark:hover:text-gray-500'>
                            <Sparkles className="mr-2 h-4 w-4" />
                            Ask AI
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => handleViewDeployment(e, deployment)} className='hover:text-gray-700 dark:hover:text-gray-500'>
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-500 dark:text-red-400 focus:text-red-500 dark:focus:text-red-400 hover:text-red-700 dark:hover:text-red-500"
                            onClick={(e) => handleDeleteDeployment(e, deployment)}
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
        title="Deployments Table"
        columns={columnConfig}
        onColumnToggle={handleColumnToggle}
        onColumnReorder={handleColumnReorder}
        onResetToDefault={handleResetToDefault}
        className="w-1/3"
        resourceType="deployments"
      />
    </div>
  );
};

export default Deployments;