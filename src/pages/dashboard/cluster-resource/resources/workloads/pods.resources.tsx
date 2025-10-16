import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { getPods } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';
import { useNamespace } from '@/contexts/useNamespace';
import { V1Pod } from '@kubernetes/client-node';
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, MoreVertical, Search, ArrowUpDown, ArrowUp, ArrowDown, Trash2, RefreshCw, Sparkles, WandSparkles, TextSearch, SearchCode, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from 'react-router-dom';
import { calculateAge } from '@/utils/age';
import { NamespaceSelector, ErrorComponent } from '@/components/custom';
import { createPortal } from 'react-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Eye, Trash } from "lucide-react";
import { AlertDialog, AlertDialogHeader, AlertDialogCancel, AlertDialogFooter, AlertDialogDescription, AlertDialogTitle, AlertDialogContent, AlertDialogAction } from '@/components/ui/alert-dialog';
import { OPERATOR_URL, OPERATOR_WS_URL } from '@/config';
import { toast } from '@/hooks/use-toast';
import { toast as sooner } from "sonner"
import { useDrawer } from '@/contexts/useDrawer';
import BackgroundTaskDialog from '@/components/custom/backgroundtaskdialog/backgroundtaskdialog.component';
import { useBackgroundTask } from '@/contexts/useBackgroundTask';
import { SideDrawer } from '@/components/ui/sidedrawer.custom';
import Telemetry from '@/components/custom/telemetry/telemetry.component';
import { resourceToEnrichedSearchResult } from '@/utils/resource-to-enriched.utils';
import { useReconMode } from '@/contexts/useRecon';
import ResourceFilterSidebar, { type ColumnConfig } from '@/components/custom/resourcefiltersidebar/resourcefiltersidebar.component';
import { getStoredColumnConfig, saveColumnConfig, clearColumnConfig } from '@/utils/columnConfigStorage';

// Resource usage interfaces
interface ResourceUsage {
  value: string;
  percentage?: number;
  requested?: string;
  limits?: string;
}

interface PodResourceMetrics {
  cpu: ResourceUsage;
  memory: ResourceUsage;
}

interface ContainerMetrics {
  name: string;
  usage: {
    cpu: string;
    memory: string;
  };
}


// Define sorting types
type SortDirection = 'asc' | 'desc' | null;
type SortField = 'name' | 'namespace' | 'status' | 'ready' | 'restarts' | 'node' | 'ip' | 'age' | 'cpu' | 'memory' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

// Parse resource quantities
const parseQuantity = (quantity: string): number => {
  if (!quantity) return 0;

  if (quantity.endsWith('m')) {
    return parseFloat(quantity.slice(0, -1)) / 1000;
  } else if (quantity.endsWith('n')) {
    return parseFloat(quantity.slice(0, -1)) / 1000000000;
  } else if (quantity.endsWith('Mi')) {
    return parseFloat(quantity.slice(0, -2));
  } else if (quantity.endsWith('Ki')) {
    return parseFloat(quantity.slice(0, -2)) / 1024;
  } else if (quantity.endsWith('Gi')) {
    return parseFloat(quantity.slice(0, -2)) * 1024;
  }

  return parseFloat(quantity);
};

// Format resource value
const formatResourceValue = (value: number, type: 'cpu' | 'memory'): string => {
  if (type === 'cpu') {
    if (value < 0.01) {
      return `${(value * 1000).toFixed(0)}m`;
    }
    return value.toFixed(2);
  } else {
    if (value < 1) {
      return `${(value * 1024).toFixed(0)}Ki`;
    } else if (value > 1024) {
      return `${(value / 1024).toFixed(2)}Gi`;
    }
    return `${value.toFixed(0)}Mi`;
  }
};

const Pods: React.FC = () => {
  const navigate = useNavigate();
  const { currentContext, isMetricsServerInstalled } = useCluster();
  const { selectedNamespaces } = useNamespace();
  const { isReconMode } = useReconMode();
  const [pods, setPods] = useState<V1Pod[]>([]);
  const [podsMetrics, setPodsMetrics] = useState<Record<string, PodResourceMetrics>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectionIdRef = useRef<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [tooltipVisible, setTooltipVisible] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [tooltipDelay, setTooltipDelay] = useState<NodeJS.Timeout | null>(null);

  const [selectedPods, setSelectedPods] = useState<Set<string>>(new Set());
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [activePod, setActivePod] = useState<V1Pod | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showBackgroundTaskDialog, setShowBackgroundTaskDialog] = useState(false);
  const [backgroundTaskPod, setBackgroundTaskPod] = useState<V1Pod | null>(null);
  const { isOpen: isBackgroundTaskOpen, resourceName, resourceType, onClose: closeBackgroundTask, openWithResource } = useBackgroundTask();
  const { addResourceContext } = useDrawer();
  
  // Telemetry drawer state
  const [isTelemetryDrawerOpen, setIsTelemetryDrawerOpen] = useState(false);
  const [telemetryPod, setTelemetryPod] = useState<V1Pod | null>(null);

  // Default column configuration
  const defaultColumnConfig: ColumnConfig[] = [
    { key: 'name', label: 'Name', visible: true, canToggle: false }, // Required column
    { key: 'namespace', label: 'Namespace', visible: true, canToggle: true },
    { key: 'status', label: 'Status', visible: true, canToggle: false }, // Required column
    { key: 'ready', label: 'Ready', visible: true, canToggle: true },
    { key: 'restarts', label: 'Restarts', visible: true, canToggle: true },
    { 
      key: 'resources', 
      label: 'Resources', 
      visible: true, 
      canToggle: true,
      children: [
        { key: 'cpu', label: 'CPU', visible: true, canToggle: true },
        { key: 'memory', label: 'Memory', visible: true, canToggle: true }
      ]
    },
    { key: 'node', label: 'Node', visible: true, canToggle: true },
    { key: 'ip', label: 'IP', visible: true, canToggle: true },
    { key: 'age', label: 'Age', visible: true, canToggle: true },
    { key: 'actions', label: 'Actions', visible: true, canToggle: false } // Required column
  ];
  
  const [columnConfig, setColumnConfig] = useState<ColumnConfig[]>(() => 
    getStoredColumnConfig('pods', defaultColumnConfig)
  );
  const [isFilterSidebarOpen, setIsFilterSidebarOpen] = useState(false);

  // Column management functions
  const handleColumnToggle = (columnKey: string, visible: boolean) => {
    setColumnConfig(prev => {
      const updated = prev.map(col => {
        // Check if it's a top-level column
        if (col.key === columnKey) {
          return { ...col, visible };
        }
        
        // Check if it's a child column
        if (col.children) {
          const updatedChildren = col.children.map(child => 
            child.key === columnKey ? { ...child, visible } : child
          );
          
          // Check if any child was actually updated by comparing the visible property
          const hasChanges = updatedChildren.some((child, index) => 
            child.visible !== col.children![index].visible
          );
          
          if (hasChanges) {
            return { ...col, children: updatedChildren };
          }
        }
        
        return col;
      });
      // Save to localStorage
      saveColumnConfig('pods', updated);
      return updated;
    });
  };

  const handleColumnReorder = (reorderedColumns: ColumnConfig[]) => {
    setColumnConfig(reorderedColumns);
    // Save to localStorage
    saveColumnConfig('pods', reorderedColumns);
  };

  const handleResetToDefault = () => {
    const resetConfig = defaultColumnConfig.map(col => ({ ...col, visible: true }));
    setColumnConfig(resetConfig);
    // Clear from localStorage to use defaults
    clearColumnConfig('pods');
  };

  const isColumnVisible = (columnKey: string) => {
    // Check if it's a top-level column
    const topLevelColumn = columnConfig.find(col => col.key === columnKey);
    if (topLevelColumn) {
      return topLevelColumn.visible;
    }

    // Check if it's a child column
    for (const col of columnConfig) {
      if (col.children) {
        const childColumn = col.children.find(child => child.key === columnKey);
        if (childColumn) {
          return childColumn.visible;
        }
      }
    }

    return true;
  };

  // Helper function to flatten column config (including children)
  const getFlattenedColumns = (): ColumnConfig[] => {
    const flattened: ColumnConfig[] = [];

    columnConfig.forEach(col => {
      if (col.children && col.children.length > 0) {
        // Only add visible children
        col.children.forEach(child => {
          if (child.visible) {
            flattened.push(child);
          }
        });
      } else {
        flattened.push(col);
      }
    });

    return flattened;
  };

  // Helper function to render table header based on column key
  const renderTableHeader = (column: ColumnConfig) => {
    if (!column.visible || column.key === 'actions') {
      return null;
    }

    const sortFieldMap: Record<string, SortField> = {
      name: 'name',
      namespace: 'namespace',
      status: 'status',
      ready: 'ready',
      restarts: 'restarts',
      cpu: 'cpu',
      memory: 'memory',
      node: 'node',
      ip: 'ip',
      age: 'age'
    };

    const sortField = sortFieldMap[column.key];
    const isNumericColumn = ['ready', 'restarts', 'cpu', 'memory', 'node', 'ip', 'age', 'status'].includes(column.key);

    return (
      <TableHead
        key={column.key}
        className={`cursor-pointer hover:text-blue-500 ${isNumericColumn ? 'text-center' : ''} ${
          column.key === 'namespace' ? 'w-[110px]' :
          column.key === 'ready' || column.key === 'restarts' ? 'w-[100px]' :
          column.key === 'cpu' || column.key === 'memory' ? 'w-[100px]' :
          column.key === 'age' ? 'w-[80px]' : ''
        }`}
        onClick={() => sortField && handleSort(sortField)}
      >
        {column.label} {sortField && renderSortIndicator(sortField)}
      </TableHead>
    );
  };

  // Helper function to render table cell based on column key
  const renderTableCell = (pod: V1Pod, column: ColumnConfig) => {
    if (!column.visible || column.key === 'actions') {
      return null;
    }

    const podKey = `${pod.metadata?.namespace}/${pod.metadata?.name}`;
    const podMetrics = podsMetrics[podKey];

    switch (column.key) {
      case 'name':
        return (
          <TableCell key={column.key} className="font-medium" onClick={() => handlePodDetails(pod)}>
            <div className="flex items-center gap-2">
              <div className="hover:text-blue-500 hover:underline">
                {pod.metadata?.name}
              </div>
              {isPodFailing(pod) && (
                <Sparkles
                  className="h-4 w-4 text-yellow-500 hover:text-yellow-600 cursor-pointer transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAskAI(pod);
                  }}
                />
              )}
            </div>
          </TableCell>
        );

      case 'namespace':
        return (
          <TableCell key={column.key}>
            <div className="hover:text-blue-500 hover:underline" onClick={(e) => {
              e.stopPropagation();
              navigate(`/dashboard/explore/namespaces`);
            }}>
              {pod.metadata?.namespace}
            </div>
          </TableCell>
        );

      case 'status':
        return (
          <TableCell key={column.key} className="text-center">
            <span className={`px-2 py-1 rounded-[0.3rem] text-xs font-medium ${getStatusColorClass(pod.status?.phase)}`}>
              {pod.status?.phase || 'Unknown'}
            </span>
          </TableCell>
        );

      case 'ready':
        return (
          <TableCell key={column.key} className="text-center">
            {getContainerStatuses(pod)}
          </TableCell>
        );

      case 'restarts':
        return (
          <TableCell key={column.key} className="text-center">
            <span className={getTotalRestarts(pod) > 0 ? 'text-red-600 dark:text-red-400 font-medium' : ''}>
              {getTotalRestarts(pod)}
            </span>
          </TableCell>
        );

      case 'cpu':
        return (
          <TableCell
            key={column.key}
            onMouseEnter={(e) => handleResourceMouseEnter(e, podKey, 'cpu')}
            onMouseLeave={handleResourceMouseLeave}
          >
            <div className="relative">
              {podMetrics?.cpu ? (
                <div>
                  <div className="flex items-center">
                    <span className="text-xs">{podMetrics.cpu.value}</span>
                    {podMetrics.cpu.percentage && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                        ({podMetrics.cpu.percentage.toFixed(0)}%)
                      </span>
                    )}
                  </div>
                  {renderResourceUsageBar(podMetrics.cpu, 'cpu')}
                </div>
              ) : (
                <span className="text-xs text-gray-500 dark:text-gray-400"></span>
              )}
            </div>
          </TableCell>
        );

      case 'memory':
        return (
          <TableCell
            key={column.key}
            onMouseEnter={(e) => handleResourceMouseEnter(e, podKey, 'memory')}
            onMouseLeave={handleResourceMouseLeave}
          >
            <div className="relative">
              {podMetrics?.memory ? (
                <div>
                  <div className="flex items-center">
                    <span className="text-xs">{podMetrics.memory.value}</span>
                    {podMetrics.memory.percentage && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                        ({podMetrics.memory.percentage.toFixed(0)}%)
                      </span>
                    )}
                  </div>
                  {renderResourceUsageBar(podMetrics.memory, 'memory')}
                </div>
              ) : (
                <span className="text-xs text-gray-500 dark:text-gray-400"></span>
              )}
            </div>
          </TableCell>
        );

      case 'node':
        return (
          <TableCell key={column.key} className="text-center">
            <div className="hover:text-blue-500 hover:underline" onClick={(e) => {
              e.stopPropagation();
              navigate(`/dashboard/explore/nodes/${pod.spec?.nodeName}`);
            }}>
              {pod.spec?.nodeName || '-'}
            </div>
          </TableCell>
        );

      case 'ip':
        return (
          <TableCell key={column.key} className="text-center">
            {pod.status?.podIP || '-'}
          </TableCell>
        );

      case 'age':
        return (
          <TableCell key={column.key} className="text-center">
            {calculateAge(pod.metadata?.creationTimestamp?.toString())}
          </TableCell>
        );

      default:
        return null;
    }
  };

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


  const handleInvestigatePod = (pod: V1Pod) => {
    // setBackgroundTaskPod(pod);
    // setShowBackgroundTaskDialog(true);
    openWithResource(pod.metadata?.name || '', 'Pod');
  };

  const handleTelemetryPod = (pod: V1Pod) => {
    setTelemetryPod(pod);
    setIsTelemetryDrawerOpen(true);
  };

  const handleAskAI = (pod: V1Pod) => {
    try {
      // Convert pod to EnrichedSearchResult format
      const resourceContext = resourceToEnrichedSearchResult(
        pod,
        'pods',
        true, // namespaced
        '',
        'v1'
      );
      
      // Add to chat context and open drawer
      addResourceContext(resourceContext);
      
      // Show success toast
      toast({
        title: "Added to Chat",
        description: `Pod "${pod.metadata?.name}" has been added to chat context`
      });
    } catch (error) {
      console.error('Error adding pod to chat:', error);
      toast({
        title: "Error",
        description: "Failed to add pod to chat context",
        variant: "destructive"
      });
    }
  };

  const handlePodClick = (e: React.MouseEvent, pod: V1Pod) => {
    const podKey = `${pod.metadata?.namespace}/${pod.metadata?.name}`;

    if (e.metaKey || e.ctrlKey) {
      // Prevent navigation when using multi-select
      e.preventDefault();
      e.stopPropagation();

      setSelectedPods(prev => {
        const newSelection = new Set(prev);
        if (newSelection.has(podKey)) {
          newSelection.delete(podKey);
        } else {
          newSelection.add(podKey);
        }
        return newSelection;
      });
    } else if (!selectedPods.has(podKey)) {
      // Clear selection on regular click (unless clicking on already selected pod)
      setSelectedPods(new Set());
      handlePodDetails(pod);
    } else {
      handlePodDetails(pod);
    }
  };

  // Add context menu handlers
  const handleContextMenu = (e: React.MouseEvent, pod: V1Pod) => {
    e.preventDefault();
    e.stopPropagation();

    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setActivePod(pod);
    setShowContextMenu(true);

    // Multi-select support: if pod isn't in selection, make it the only selection
    const podKey = `${pod.metadata?.namespace}/${pod.metadata?.name}`;
    if (!selectedPods.has(podKey)) {
      setSelectedPods(new Set([podKey]));
    }
  };

  // Close context menu when clicking outside
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

        if (isOutsideTable && !isContextMenuClick && !isAlertDialogClick && selectedPods.size > 0) {
          setSelectedPods(new Set());
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedPods]);

  // Handle restart action
  const handleRestartPods = async () => {
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
      if (selectedPods.size === 0 && activePod) {
        // Restart single active pod
        await restartPod(activePod);
      } else {
        // Restart all selected pods
        for (const podKey of selectedPods) {
          const [namespace, name] = podKey.split('/');
          const podToRestart = pods.find(p =>
            p.metadata?.namespace === namespace && p.metadata?.name === name
          );

          if (podToRestart) {
            await restartPod(podToRestart);
          }
        }
      }

      // No need to manually refresh with WebSocket - data updates automatically

    } catch (error) {
      console.error('Failed to restart pod(s):', error);
      setError(error instanceof Error ? error.message : 'Failed to restart pod(s)');
    }
  };

  const handleViewPod = (e: React.MouseEvent, pod: V1Pod) => {
    e.stopPropagation(); // Stop the event from bubbling up
    if (pod.metadata?.name && pod.metadata?.namespace) {
      navigate(`/dashboard/explore/pods/${pod.metadata.namespace}/${pod.metadata.name}`);
    }
  };

  const handleDeletePod = (e: React.MouseEvent, pod: V1Pod) => {
    e.stopPropagation(); // Stop the event from bubbling up
    
    if (isReconMode) {
      toast({
        title: "Recon Mode",
        description: "This action can't be performed while recon mode is on. Disable recon mode to proceed.",
        variant: "recon"
      });
      return;
    }
    
    setActivePod(pod);
    setSelectedPods(new Set([`${pod.metadata?.namespace}/${pod.metadata?.name}`]));
    setShowDeleteDialog(true);
  };

  // Restart pod function
  const restartPod = async (pod: V1Pod) => {
    if (!currentContext || !pod.metadata?.name || !pod.metadata?.namespace) return;

    // This implementation depends on your Kubernetes API setup
    // Option 1: If you have a direct API for pod restart:
    /*
    await fetch(`${OPERATOR_URL}/clusters/${currentContext.name}/api/v1/namespaces/${pod.metadata.namespace}/pods/${pod.metadata.name}/restart`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    */

    // Option 2: Delete and recreate approach (for deployments/statefulsets)
    // This is a simplified example - you may need to implement proper restart logic
    // based on the pod owner (Deployment, StatefulSet, etc.)
    const annotations = pod.metadata.annotations || {};
    const restartedAt = new Date().toISOString();

    // Update pod with restart annotation
    await fetch(`${OPERATOR_URL}/clusters/${currentContext.name}/api/v1/namespaces/${pod.metadata.namespace}/pods/${pod.metadata.name}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/strategic-merge-patch+json',
      },
      body: JSON.stringify({
        metadata: {
          annotations: {
            ...annotations,
            'kubectl.kubernetes.io/restartedAt': restartedAt,
          },
        },
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
  const deletePods = async () => {
    setShowDeleteDialog(false);
    setDeleteLoading(true);

    try {
      if (selectedPods.size === 0 && activePod) {
        // Delete single active pod
        await deletePod(activePod);
      } else {
        // Delete all selected pods
        for (const podKey of selectedPods) {
          const [namespace, name] = podKey.split('/');
          const podToDelete = pods.find(p =>
            p.metadata?.namespace === namespace && p.metadata?.name === name
          );

          if (podToDelete) {
            await deletePod(podToDelete);
          }
        }
      }

      // Clear selection after deletion
      setSelectedPods(new Set());

      // No need to manually refresh with WebSocket - data updates automatically

    } catch (error) {
      console.error('Failed to delete pod(s):', error);
      setError(error instanceof Error ? error.message : 'Failed to delete pod(s)');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Handle incoming Kubernetes pod events
  const handlePodEvent = useCallback((kubeEvent: any) => {
    const { type, object: pod } = kubeEvent;
    
    if (!pod || !pod.metadata) return;
    
    // Filter: only process pods from selected namespaces
    if (selectedNamespaces.length > 0 && !selectedNamespaces.includes(pod.metadata.namespace)) {
      return; // Skip pods not in selected namespaces
    }

    setPods(prevPods => {
      const newPods = [...prevPods];
      const existingIndex = newPods.findIndex(
        p => p.metadata?.namespace === pod.metadata.namespace && 
             p.metadata?.name === pod.metadata.name
      );

      switch (type) {
        case 'ADDED':
          if (existingIndex === -1) {
            newPods.push(pod);
          }
          break;

        case 'MODIFIED':
          if (existingIndex !== -1) {
            // Check if pod is being terminated
            if (pod.metadata.deletionTimestamp) {
              // Update the pod to show terminating state
              const updatedPod = {
                ...pod,
                status: {
                  ...pod.status,
                  phase: 'Terminating'
                }
              };
              newPods[existingIndex] = updatedPod;
            } else {
              // Normal modification
              newPods[existingIndex] = pod;
            }
          } else {
            // Sometimes MODIFIED events come before ADDED
            if (!pod.metadata.deletionTimestamp) {
              newPods.push(pod);
            }
          }
          break;

        case 'DELETED':
          if (existingIndex !== -1) {
            newPods.splice(existingIndex, 1);
          }
          break;

        case 'ERROR':
          setWsError(`Watch error: ${pod.message || 'Unknown error'}`);
          break;

        default:
          break;
      }

      return newPods;
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
      const clusterUrl = `${OPERATOR_WS_URL}/clusters/${currentContext.name}/api/v1/pods?watch=1`;
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
            handlePodEvent(kubeEvent);
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
  }, [currentContext, handlePodEvent]);

  // Fallback function for HTTP-based fetching (in case WebSocket fails)
  const fetchAllPods = async () => {
    if (!currentContext || selectedNamespaces.length === 0) {
      setPods([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // If no namespaces are selected, fetch from all namespaces
      if (selectedNamespaces.length === 0) {
        const podsData = await getPods(currentContext.name);
        setPods(podsData);
        return;
      }

      // Fetch pods for each selected namespace
      const podPromises = selectedNamespaces.map(namespace =>
        getPods(currentContext.name, namespace)
      );

      const results = await Promise.all(podPromises);

      // Flatten the array of pod arrays
      const allPods = results.flat();
      setPods(allPods);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch pods');
    } finally {
      setLoading(false);
    }
  };

  // Delete pod function
  const deletePod = async (pod: V1Pod) => {
    if (!currentContext || !pod.metadata?.name || !pod.metadata?.namespace) return;

    await fetch(`${OPERATOR_URL}/clusters/${currentContext.name}/api/v1/namespaces/${pod.metadata.namespace}/pods/${pod.metadata.name}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });
  };

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
          {selectedPods.size > 1
            ? `${selectedPods.size} pods selected`
            : activePod?.metadata?.name || 'Pod actions'}
        </div>

        <div
          className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center"
          onClick={handleRestartPods}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Restart {selectedPods.size > 1 ? `(${selectedPods.size})` : ''}
        </div>

        <div
          className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center text-red-600 dark:text-red-400"
          onClick={handleDeleteClick}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete {selectedPods.size > 1 ? `(${selectedPods.size})` : ''}
        </div>
      </div>,
      document.body
    );
  };

  // Delete confirmation dialog
  const renderDeleteDialog = () => {
    return (
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-gray-100 dark:bg-[#0B0D13]/90 backdrop-blur-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Pod Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedPods.size > 1
                ? `${selectedPods.size} pods`
                : `"${activePod?.metadata?.name}"`}?
              This action cannot be undone. Pods will enter terminating state and be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deletePods}
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

  // Fetch pods metrics
  const fetchPodsMetrics = async () => {
    if (!currentContext || selectedNamespaces.length === 0 || pods.length === 0 || !isMetricsServerInstalled) {
      return;
    }

    try {
      const metricsApiUrl = `${OPERATOR_URL}/clusters/${currentContext.name}/apis/metrics.k8s.io/v1beta1/pods`;

      // If specific namespaces are selected, use a comma-separated list
      // if (selectedNamespaces.length > 0) {
      //   const namespaceQuery = selectedNamespaces.join(',');
      //   // metricsApiUrl = `${OPERATOR_URL}/clusters/${currentContext.name}/apis/metrics.k8s.io/v1beta1/pods?fieldSelector=metadata.namespace in (${namespaceQuery})`;
      // }

      const response = await fetch(metricsApiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch metrics: ${response.statusText}`);
      }

      const data = await response.json();
      const metricsData = data.items || [];

      // Process metrics data
      const metricsMap: Record<string, PodResourceMetrics> = {};

      for (const podMetric of metricsData) {
        const podKey = `${podMetric.metadata.namespace}/${podMetric.metadata.name}`;
        const pod = pods.find(p =>
          p.metadata?.name === podMetric.metadata.name &&
          p.metadata?.namespace === podMetric.metadata.namespace
        );

        if (pod) {
          // Aggregate container metrics
          let totalCpu = 0;
          let totalMemory = 0;

          podMetric.containers.forEach((container: ContainerMetrics) => {
            const cpuValue = parseQuantity(container.usage.cpu);
            const memoryValue = parseQuantity(container.usage.memory);
            totalCpu += cpuValue;
            totalMemory += memoryValue;
          });

          // Get pod requests and limits
          let cpuRequest = 0;
          let cpuLimit = 0;
          let memoryRequest = 0;
          let memoryLimit = 0;

          (pod.spec?.containers || []).forEach(container => {
            const resources = container.resources || {};

            if (resources.requests) {
              cpuRequest += parseQuantity(resources.requests.cpu || '0');
              memoryRequest += parseQuantity(resources.requests.memory || '0');
            }

            if (resources.limits) {
              cpuLimit += parseQuantity(resources.limits.cpu || '0');
              memoryLimit += parseQuantity(resources.limits.memory || '0');
            }
          });

          metricsMap[podKey] = {
            cpu: {
              value: formatResourceValue(totalCpu, 'cpu'),
              percentage: cpuRequest > 0 ? (totalCpu / cpuRequest) * 100 : undefined,
              requested: cpuRequest > 0 ? formatResourceValue(cpuRequest, 'cpu') : undefined,
              limits: cpuLimit > 0 ? formatResourceValue(cpuLimit, 'cpu') : undefined
            },
            memory: {
              value: formatResourceValue(totalMemory, 'memory'),
              percentage: memoryRequest > 0 ? (totalMemory / memoryRequest) * 100 : undefined,
              requested: memoryRequest > 0 ? formatResourceValue(memoryRequest, 'memory') : undefined,
              limits: memoryLimit > 0 ? formatResourceValue(memoryLimit, 'memory') : undefined
            }
          };
        }
      }

      setPodsMetrics(metricsMap);
    } catch (err) {
      console.error('Failed to fetch pod metrics:', err);
    }
  };

  // Initialize WebSocket connection when context or namespaces change
  useEffect(() => {
    if (!currentContext) {
      setPods([]);
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

    // Clear existing pods when switching contexts/namespaces
    setPods([]);
    
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
    
    // First load existing pods, then start WebSocket for real-time updates
    const initializePods = async () => {
      try {
        // Load initial data using HTTP API
        await fetchAllPods();
        // Then start WebSocket watching for changes
        setTimeout(() => {
          connectWebSocket();
        }, 200);
      } catch (error) {
        console.error('Failed to initialize pods:', error);
        setLoading(false);
      }
    };
    
    initializePods();

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

  // Filter existing pods when namespace selection changes
  useEffect(() => {
    if (selectedNamespaces.length === 0) {
      // No namespaces selected - show nothing
      setPods([]);
      return;
    }
    
    // Filter existing pods based on new namespace selection
    setPods(prevPods => 
      prevPods.filter(pod => 
        pod.metadata?.namespace && selectedNamespaces.includes(pod.metadata.namespace)
      )
    );
  }, [selectedNamespaces]);

  // Fetch metrics when pods change
  useEffect(() => {
    if (pods.length > 0 && isMetricsServerInstalled) {
      fetchPodsMetrics();
    }
  }, [pods, isMetricsServerInstalled]);

  // Set up metrics refresh interval
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (pods.length > 0 && isMetricsServerInstalled) {
        fetchPodsMetrics();
      }
    }, 10000); // Refresh every 10 seconds

    return () => clearInterval(intervalId);
  }, [pods, isMetricsServerInstalled]);

  // Filter pods based on search query
  const filteredPods = useMemo(() => {
    if (!searchQuery.trim()) {
      return pods;
    }

    const lowercaseQuery = searchQuery.toLowerCase();

    return pods.filter(pod => {
      const name = pod.metadata?.name?.toLowerCase() || '';
      const namespace = pod.metadata?.namespace?.toLowerCase() || '';
      const status = pod.status?.phase?.toLowerCase() || '';
      const node = pod.spec?.nodeName?.toLowerCase() || '';
      const ip = pod.status?.podIP?.toLowerCase() || '';
      const labels = pod.metadata?.labels || {};

      // Check if name, namespace, status, node, or IP contains the query
      if (
        name.includes(lowercaseQuery) ||
        namespace.includes(lowercaseQuery) ||
        status.includes(lowercaseQuery) ||
        node.includes(lowercaseQuery) ||
        ip.includes(lowercaseQuery)
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
  }, [pods, searchQuery]);

  // Sort pods based on sort state
  const sortedPods = useMemo(() => {
    if (!sort.field || !sort.direction) {
      return filteredPods;
    }

    return [...filteredPods].sort((a, b) => {
      const sortMultiplier = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'name':
          return (a.metadata?.name || '').localeCompare(b.metadata?.name || '') * sortMultiplier;

        case 'namespace':
          return (a.metadata?.namespace || '').localeCompare(b.metadata?.namespace || '') * sortMultiplier;

        case 'status': {
          const statusA = a.status?.phase || 'Unknown';
          const statusB = b.status?.phase || 'Unknown';

          // Custom order for status: Running, Succeeded, Pending, Failed, Unknown
          const statusOrder: Record<string, number> = {
            'Running': 1,
            'Succeeded': 2,
            'Pending': 3,
            'Failed': 4,
            'Unknown': 5
          };

          const orderA = statusOrder[statusA] || 10;
          const orderB = statusOrder[statusB] || 10;

          return (orderA - orderB) * sortMultiplier;
        }

        case 'ready': {
          const containersA = a.status?.containerStatuses || [];
          const containersB = b.status?.containerStatuses || [];

          const totalA = containersA.length;
          const totalB = containersB.length;

          const readyA = containersA.filter(status => status.ready).length;
          const readyB = containersB.filter(status => status.ready).length;

          // Calculate ready percentage for more accurate sorting
          const percentA = totalA > 0 ? readyA / totalA : 0;
          const percentB = totalB > 0 ? readyB / totalB : 0;

          return (percentA - percentB) * sortMultiplier;
        }

        case 'restarts': {
          const restartsA = getTotalRestarts(a);
          const restartsB = getTotalRestarts(b);
          return (restartsA - restartsB) * sortMultiplier;
        }

        case 'node': {
          const nodeA = a.spec?.nodeName || '';
          const nodeB = b.spec?.nodeName || '';
          return nodeA.localeCompare(nodeB) * sortMultiplier;
        }

        case 'ip': {
          const ipA = a.status?.podIP || '';
          const ipB = b.status?.podIP || '';

          // IP address sorting (split by dots and compare segments as numbers)
          const ipPartsA = ipA.split('.').map(part => parseInt(part, 10) || 0);
          const ipPartsB = ipB.split('.').map(part => parseInt(part, 10) || 0);

          for (let i = 0; i < 4; i++) {
            const partA = ipPartsA[i] || 0;
            const partB = ipPartsB[i] || 0;

            if (partA !== partB) {
              return (partA - partB) * sortMultiplier;
            }
          }

          return 0;
        }

        case 'age': {
          const timeA = a.metadata?.creationTimestamp ? new Date(a.metadata.creationTimestamp).getTime() : 0;
          const timeB = b.metadata?.creationTimestamp ? new Date(b.metadata.creationTimestamp).getTime() : 0;
          return (timeA - timeB) * sortMultiplier;
        }

        case 'cpu': {
          const podKeyA = `${a.metadata?.namespace}/${a.metadata?.name}`;
          const podKeyB = `${b.metadata?.namespace}/${b.metadata?.name}`;
          const cpuA = podsMetrics[podKeyA]?.cpu?.value ? parseQuantity(podsMetrics[podKeyA].cpu.value) : 0;
          const cpuB = podsMetrics[podKeyB]?.cpu?.value ? parseQuantity(podsMetrics[podKeyB].cpu.value) : 0;
          return (cpuA - cpuB) * sortMultiplier;
        }

        case 'memory': {
          const podKeyA = `${a.metadata?.namespace}/${a.metadata?.name}`;
          const podKeyB = `${b.metadata?.namespace}/${b.metadata?.name}`;
          const memA = podsMetrics[podKeyA]?.memory?.value ? parseQuantity(podsMetrics[podKeyA].memory.value) : 0;
          const memB = podsMetrics[podKeyB]?.memory?.value ? parseQuantity(podsMetrics[podKeyB].memory.value) : 0;
          return (memA - memB) * sortMultiplier;
        }

        default:
          return 0;
      }
    });
  }, [filteredPods, sort.field, sort.direction, podsMetrics]);

  const handlePodDetails = (pod: V1Pod) => {
    if (pod.metadata?.name && pod.metadata?.namespace) {
      navigate(`/dashboard/explore/pods/${pod.metadata.namespace}/${pod.metadata.name}`);
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

  // Get container status counts
  const getContainerStatuses = (pod: V1Pod) => {
    const containerStatuses = pod.status?.containerStatuses || [];
    const total = containerStatuses.length;
    const ready = containerStatuses.filter(status => status.ready).length;
    return `${ready}/${total}`;
  };

  // Get a color class based on the pod phase
  const getStatusColorClass = (phase: string | undefined): string => {
    if (!phase) return 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300';

    switch (phase.toLowerCase()) {
      case 'running':
        return 'bg-green-200 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'pending':
        return 'bg-yellow-200 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'succeeded':
        return 'bg-blue-200 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'failed':
        return 'bg-red-200 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      case 'terminating':
        return 'bg-orange-200 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
      case 'unknown':
        return 'bg-purple-200 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
      default:
        return 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  // Function to check if pod is in a problematic state
  const hasPodWarnings = (pod: V1Pod): boolean => {
    // Check for restarts
    const hasRestarts = (pod.status?.containerStatuses || []).some(
      status => (status.restartCount || 0) > 0
    );

    // Check for container issues
    const hasContainerIssues = (pod.status?.containerStatuses || []).some(
      status => !status.ready && status.state?.waiting
    );

    // Check for non-running status
    const isNotRunning = pod.status?.phase !== 'Running' && pod.status?.phase !== 'Succeeded';

    return hasRestarts || hasContainerIssues || isNotRunning;
  };

  // Function to check if pod is in a failing state (should show sparkle icon)
  const isPodFailing = (pod: V1Pod): boolean => {
    const phase = pod.status?.phase?.toLowerCase();
    return phase === 'failed' || phase === 'error' || phase === 'crashloopbackoff' || 
           (pod.status?.containerStatuses || []).some(status => 
             status.state?.waiting?.reason === 'CrashLoopBackOff' ||
             status.state?.waiting?.reason === 'ImagePullBackOff' ||
             status.state?.waiting?.reason === 'ErrImagePull'
           );
  };

  // Get total restart count for a pod
  const getTotalRestarts = (pod: V1Pod): number => {
    return (pod.status?.containerStatuses || []).reduce(
      (total, status) => total + (status.restartCount || 0),
      0
    );
  };

  // Resource usage tooltip handlers
  const handleResourceMouseEnter = (
    e: React.MouseEvent<HTMLTableCellElement>,
    podKey: string,
    resourceType: 'cpu' | 'memory'
  ) => {
    if (podsMetrics[podKey]) {
      // Clear any existing timeout
      if (tooltipDelay) {
        clearTimeout(tooltipDelay);
      }

      const rect = e.currentTarget.getBoundingClientRect();

      // Set a small delay before showing the tooltip
      const delay = setTimeout(() => {
        setTooltipVisible(`${podKey}-${resourceType}`);
        setTooltipPosition({
          x: rect.left,
          y: rect.top
        });
      }, 100); // 100ms delay

      setTooltipDelay(delay);
    }
  };

  const handleResourceMouseLeave = () => {
    // Clear any pending tooltip display
    if (tooltipDelay) {
      clearTimeout(tooltipDelay);
      setTooltipDelay(null);
    }

    // Small delay before hiding to allow mouse to enter tooltip
    setTimeout(() => {
      setTooltipVisible(null);
    }, 100);
  };

  // Resource usage bar
  const renderResourceUsageBar = (
    usage: ResourceUsage,
    resourceType: 'cpu' | 'memory'
  ) => {
    // If no percentage is available but we have a value, show a default usage bar
    const hasValue = usage.value && usage.value !== '0' && usage.value !== '0Ki' && usage.value !== '0Mi';

    if (!usage.percentage && !hasValue) return null;

    // Determine color based on usage percentage or default to blue for values without requests
    let colorClass = 'bg-[#6875F5]';
    let percentWidth = 20;

    if (usage.percentage) {
      percentWidth = Math.min(usage.percentage, 100);

      if (usage.percentage > 90) {
        colorClass = 'bg-[#F05252]';
      } else if (usage.percentage > 70) {
        colorClass = 'bg-[#FACA16]';
      }
    }

    return (
      <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-800/40 rounded-full mt-1">
        <div
          className={`h-full rounded-full ${colorClass}`}
          style={{ width: `${percentWidth}%` }}
        ></div>
      </div>
    );
  };

  // Render resource usage tooltip
  const renderResourceTooltip = (
    podKey: string | null,
    resourceType: 'cpu' | 'memory' | null
  ) => {
    if (!podKey || !resourceType || !tooltipVisible) return null;

    const metrics = podsMetrics[podKey];
    if (!metrics) return null;

    const usage = resourceType === 'cpu' ? metrics.cpu : metrics.memory;

    // Use createPortal to render the tooltip at document level, preventing event issues
    return createPortal(
      <div
        className="fixed z-50 bg-white dark:bg-[#0B0D13]/40 backdrop-blur-sm min-w-[150px] p-3 rounded-md shadow-lg border border-gray-300 dark:border-gray-800 text-xs"
        style={{
          left: `${tooltipPosition.x + 10}px`,
          top: `${tooltipPosition.y - 80}px`,
          pointerEvents: 'none', // Make tooltip non-interactive to prevent event issues
        }}
      >
        <div className="font-[Anton] uppercase font-medium mb-1">{resourceType === 'cpu' ? 'CPU' : 'Memory'} Usage</div>
        <div className="text-gray-700 dark:text-gray-300">
          <div className="flex justify-between mb-1">
            <span>Current: </span>
            <span className="font-semibold">{usage.value}</span>
          </div>
          {usage.requested && (
            <div className="flex justify-between mb-1">
              <span>Requested: </span>
              <span className="font-semibold">{usage.requested}</span>
            </div>
          )}
          {usage.limits && (
            <div className="flex justify-between mb-1">
              <span>Limits:</span>{" "}
              <span className="font-semibold">{usage.limits}</span>
            </div>
          )}
          {usage.percentage && (
            <div className="flex justify-between mb-1">
              <span>Usage:</span>
              <span className={`${usage.percentage > 90 ? 'text-red-500' : usage.percentage > 70 ? 'text-yellow-500' : ''}`}>
                {usage.percentage.toFixed(1)}%
              </span>
            </div>
          )}
        </div>
      </div>,
      document.body
    );
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
          <h1 className='text-5xl font-[Anton] uppercase font-bold text-gray-800/30 dark:text-gray-700/50'>Pods</h1>
          <div className="w-full md:w-96 mt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
              <Input
                type="text"
                placeholder="Search by name, namespace, status, or node..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </div>

        <div className="w-full md:w-96 flex items-end gap-2">
          <div className="flex-1">
            <NamespaceSelector />
          </div>
          <Button
            variant="outline" 
            size="sm"
            onClick={() => {
              if (!wsConnected) {
                // Fallback to HTTP fetch if WebSocket is not connected
                fetchAllPods();
              } else {
                // Reconnect WebSocket
                connectWebSocket();
              }
            }}
            className="flex items-center gap-2 h-10 dark:text-gray-300/80"
            title={wsConnected ? "Reconnect WebSocket" : "Refresh pods"}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            variant="outline" 
            size="sm"
            onClick={() => setIsFilterSidebarOpen(true)}
            className="flex items-center gap-2 h-10 dark:text-gray-300/80"
            title="Filter columns"
          >
            <Filter className="h-4 w-4" />
          </Button>
        </div>
      </div>


      {/* No results message */}
      {sortedPods.length === 0 && !loading && (
        <Alert className="my-6 bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <AlertDescription>
            {searchQuery
              ? `No pods matching "${searchQuery}"`
              : selectedNamespaces.length === 0
                ? "Please select at least one namespace"
                : "No pods found in the selected namespaces"}
          </AlertDescription>
        </Alert>
      )}

      {/* Tooltip */}
      {tooltipVisible && (() => {
        const lastDashIndex = tooltipVisible.lastIndexOf('-');
        if (lastDashIndex === -1) return null;

        const resourceType = tooltipVisible.substring(lastDashIndex + 1) as 'cpu' | 'memory';
        const podKey = tooltipVisible.substring(0, lastDashIndex);

        return renderResourceTooltip(podKey, resourceType);
      })()}

      <BackgroundTaskDialog
        isOpen={isBackgroundTaskOpen}
        onClose={closeBackgroundTask}
        resourceName={resourceName}
        resourceType={resourceType}
      />

      {/* Telemetry Drawer */}
      <SideDrawer isOpen={isTelemetryDrawerOpen} onClose={() => setIsTelemetryDrawerOpen(false)} offsetTop='-top-6'>
        {telemetryPod && (
          <Telemetry
            resourceName={telemetryPod.metadata?.name || ''}
            namespace={telemetryPod.metadata?.namespace || ''}
            kind="Pod"
            onClose={() => setIsTelemetryDrawerOpen(false)}
          />
        )}
      </SideDrawer>

      {/* Pods table */}
      {sortedPods.length > 0 && (
        <Card className="text-gray-800 dark:text-gray-300 bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <div className="rounded-md border">
            {renderContextMenu()}
            {renderDeleteDialog()}
            <Table className="bg-gray-50 dark:bg-transparent rounded-2xl">
              <TableHeader>
                <TableRow className="border-b border-gray-400 dark:border-gray-800/80">
                  {getFlattenedColumns().map(col => renderTableHeader(col))}
                  {isColumnVisible('actions') && (
                    <TableHead className="w-[50px]"></TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedPods.map((pod) => {
                  const podKey = `${pod.metadata?.namespace}/${pod.metadata?.name}`;

                  return (
                    <TableRow
                      key={podKey}
                      className={`bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30 ${selectedPods.has(podKey) ? 'bg-blue-50 dark:bg-gray-800/30' : ''
                        }`}
                      onClick={(e) => handlePodClick(e, pod)}
                      onContextMenu={(e) => handleContextMenu(e, pod)}
                    >
                      {getFlattenedColumns().map(col => renderTableCell(pod, col))}
                      {isColumnVisible('actions') && (
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
                          <DropdownMenuContent align="end" className='dark:bg-[#0B0D13]/40 backdrop-blur-md border-gray-800/50'>
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              handleAskAI(pod);
                            }} className='hover:text-gray-700 dark:hover:text-gray-500'>
                              <Sparkles className="mr-2 h-4 w-4" />
                              Ask AI
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              handleInvestigatePod(pod);
                            }} className='hover:text-gray-700 dark:hover:text-gray-500'>
                              <TextSearch className="mr-2 h-4 w-4" />
                              Investigate
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              handleTelemetryPod(pod);
                            }} className='hover:text-gray-700 dark:hover:text-gray-500'>
                              <SearchCode className="mr-2 h-4 w-4" />
                              Telemetry
                            </DropdownMenuItem>

                            

                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              if (isReconMode) {
                                toast({
                                  title: "Recon Mode",
                                  description: "This action can't be performed while recon mode is on. Disable recon mode to proceed.",
                                  variant: "recon"
                                });
                                return;
                              }
                              // Set the active pod and trigger restart
                              setActivePod(pod);
                              setSelectedPods(new Set([`${pod.metadata?.namespace}/${pod.metadata?.name}`]));
                              handleRestartPods();
                            }} className='hover:text-gray-700 dark:hover:text-gray-500'>
                              <RefreshCw className="mr-2 h-4 w-4" />
                              Restart
                            </DropdownMenuItem>

                            <DropdownMenuItem onClick={(e) => handleViewPod(e, pod)} className='hover:text-gray-700 dark:hover:text-gray-500'>
                              <Eye className="mr-2 h-4 w-4" />
                              View
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              className="text-red-500 dark:text-red-400 focus:text-red-500 dark:focus:text-red-400 hover:text-red-700 dark:hover:text-red-500"
                              onClick={(e) => handleDeletePod(e, pod)}
                            >
                              <Trash className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Column Filter Sidebar */}
      <ResourceFilterSidebar
        isOpen={isFilterSidebarOpen}
        onClose={() => setIsFilterSidebarOpen(false)}
        title="Pod Columns"
        columns={columnConfig}
        onColumnToggle={handleColumnToggle}
        onColumnReorder={handleColumnReorder}
        onResetToDefault={handleResetToDefault}
        resourceType="pods"
      />
    </div>
  );
};

export default Pods;