import React, { useState, useEffect, useMemo } from 'react';
import { listResources } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';
import { useNamespace } from '@/contexts/useNamespace';
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, MoreVertical, Search, ArrowUpDown, ArrowUp, ArrowDown, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from 'react-router-dom';
import { calculateAge } from '@/utils/age';
import { ErrorComponent, NamespaceSelector, ResourceFilterSidebar, type ColumnConfig } from '@/components/custom';
import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, Eye } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Trash } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { deleteResource } from '@/api/internal/resources';
import { useReconMode } from '@/contexts/useRecon';
import { toast } from '@/hooks/use-toast';
import { getStoredColumnConfig, saveColumnConfig, clearColumnConfig } from '@/utils/columnConfigStorage';

// Define types for HorizontalPodAutoscaler (both v1 and v2)
interface CrossVersionObjectReference {
  apiVersion?: string;
  kind: string;
  name: string;
}

interface MetricSpec {
  type: string;
  resource?: {
    name: string;
    target: {
      type: string;
      averageUtilization?: number;
      averageValue?: string;
      value?: string;
    };
  };
  pods?: {
    metric: {
      name: string;
    };
    target: {
      type: string;
      averageValue: string;
    };
  };
  object?: {
    metric: {
      name: string;
    };
    target: {
      type: string;
      value?: string;
      averageValue?: string;
    };
  };
  external?: {
    metric: {
      name: string;
    };
    target: {
      type: string;
      value?: string;
      averageValue?: string;
    };
  };
  containerResource?: {
    name: string;
    container: string;
    target: {
      type: string;
      averageUtilization?: number;
      averageValue?: string;
    };
  };
}

interface MetricStatus {
  type: string;
  resource?: {
    name: string;
    current: {
      averageUtilization?: number;
      averageValue?: string;
    };
  };
  pods?: {
    metric: {
      name: string;
    };
    current: {
      averageValue: string;
    };
  };
  object?: {
    metric: {
      name: string;
    };
    current: {
      value?: string;
      averageValue?: string;
    };
  };
  external?: {
    metric: {
      name: string;
    };
    current: {
      value?: string;
      averageValue?: string;
    };
  };
  containerResource?: {
    name: string;
    container: string;
    current: {
      averageUtilization?: number;
      averageValue?: string;
    };
  };
}

interface HorizontalPodAutoscalerStatus {
  observedGeneration?: number;
  lastScaleTime?: string;
  currentReplicas: number;
  desiredReplicas: number;
  currentMetrics?: MetricStatus[];
  conditions?: Array<{
    type: string;
    status: string;
    lastTransitionTime: string;
    reason: string;
    message: string;
  }>;
}

interface V1HorizontalPodAutoscaler {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    namespace?: string;
    creationTimestamp?: string;
    labels?: { [key: string]: string };
    annotations?: { [key: string]: string };
  };
  spec?: {
    scaleTargetRef: CrossVersionObjectReference;
    minReplicas?: number;
    maxReplicas: number;
    metrics?: MetricSpec[];
    targetCPUUtilizationPercentage?: number; // v1 only
    behavior?: {
      scaleUp?: {
        stabilizationWindowSeconds?: number;
        policies?: Array<{
          type: string;
          value: number;
          periodSeconds: number;
        }>;
        selectPolicy?: string;
      };
      scaleDown?: {
        stabilizationWindowSeconds?: number;
        policies?: Array<{
          type: string;
          value: number;
          periodSeconds: number;
        }>;
        selectPolicy?: string;
      };
    };
  };
  status?: HorizontalPodAutoscalerStatus;
}

// Define sorting types
type SortDirection = 'asc' | 'desc' | null;
type SortField = 'name' | 'namespace' | 'target' | 'minReplicas' | 'maxReplicas' | 'currentReplicas' | 'age' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

const HorizontalPodAutoscalers: React.FC = () => {
  const navigate = useNavigate();
  const { currentContext } = useCluster();
  const { selectedNamespaces } = useNamespace();
  const { isReconMode } = useReconMode();
  const [hpas, setHpas] = useState<V1HorizontalPodAutoscaler[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // --- Start of Multi-select ---
  const [selectedHpas, setSelectedHpas] = useState<Set<string>>(new Set());
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [activeHpa, setActiveHpa] = useState<V1HorizontalPodAutoscaler | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Column configuration state
  const [showFilterSidebar, setShowFilterSidebar] = useState(false);
  
  const defaultColumnConfig: ColumnConfig[] = [
    { key: 'name', label: 'Name', visible: true, canToggle: false }, // Required column
    { key: 'namespace', label: 'Namespace', visible: true, canToggle: true },
    { key: 'target', label: 'Target', visible: true, canToggle: true },
    { key: 'replicas', label: 'Replicas (Min/Max)', visible: true, canToggle: true },
    { key: 'metrics', label: 'Metrics', visible: true, canToggle: true },
    { key: 'age', label: 'Age', visible: true, canToggle: true },
    { key: 'actions', label: 'Actions', visible: true, canToggle: false } // Required column
  ];
  
  const [columnConfig, setColumnConfig] = useState<ColumnConfig[]>(() => 
    getStoredColumnConfig('horizontalpodautoscalers', defaultColumnConfig)
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

  const handleHpaClick = (e: React.MouseEvent, hpa: V1HorizontalPodAutoscaler) => {
    const hpaKey = `${hpa.metadata?.namespace}/${hpa.metadata?.name}`;

    if (e.metaKey || e.ctrlKey) {
      // Prevent navigation when using multi-select
      e.preventDefault();
      e.stopPropagation();

      setSelectedHpas(prev => {
        const newSelection = new Set(prev);
        if (newSelection.has(hpaKey)) {
          newSelection.delete(hpaKey);
        } else {
          newSelection.add(hpaKey);
        }
        return newSelection;
      });
    } else if (!selectedHpas.has(hpaKey)) {
      // Clear selection on regular click (unless clicking on already selected HPA)
      setSelectedHpas(new Set());
      handleHpaDetails(hpa);
    } else {
      handleHpaDetails(hpa);
    }
  };

  // Add context menu handlers
  const handleContextMenu = (e: React.MouseEvent, hpa: V1HorizontalPodAutoscaler) => {
    e.preventDefault();
    e.stopPropagation();

    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setActiveHpa(hpa);
    setShowContextMenu(true);

    // Multi-select support: if HPA isn't in selection, make it the only selection
    const hpaKey = `${hpa.metadata?.namespace}/${hpa.metadata?.name}`;
    if (!selectedHpas.has(hpaKey)) {
      setSelectedHpas(new Set([hpaKey]));
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

        if (isOutsideTable && !isContextMenuClick && !isAlertDialogClick && selectedHpas.size > 0) {
          setSelectedHpas(new Set());
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedHpas]);

  // Handle view action - only available for a single HPA
  const handleViewHpa = () => {
    setShowContextMenu(false);

    if (activeHpa && activeHpa.metadata?.name && activeHpa.metadata?.namespace) {
      navigate(`/dashboard/explore/horizontalpodautoscalers/${activeHpa.metadata.namespace}/${activeHpa.metadata.name}`);
    }
  };

  const handleDeleteHpaMenuItem = (e: React.MouseEvent, hpa: V1HorizontalPodAutoscaler) => {
    e.stopPropagation();
    
    if (isReconMode) {
      toast({
        title: "Recon Mode",
        description: "This action can't be performed while recon mode is on. Disable recon mode to proceed.",
        variant: "recon"
      });
      return;
    }
    
    setActiveHpa(hpa);
    setSelectedHpas(new Set([`${hpa.metadata?.namespace}/${hpa.metadata?.name}`]));
    setShowDeleteDialog(true);
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
  const deleteHpas = async () => {
    setShowDeleteDialog(false);

    try {
      if (selectedHpas.size === 0 && activeHpa) {
        // Delete single active HPA
        await deleteHpa(activeHpa);
      } else {
        // Delete all selected HPAs
        for (const hpaKey of selectedHpas) {
          const [namespace, name] = hpaKey.split('/');
          const hpaToDelete = hpas.find(h =>
            h.metadata?.namespace === namespace && h.metadata?.name === name
          );

          if (hpaToDelete) {
            await deleteHpa(hpaToDelete);
          }
        }
      }

      // Clear selection after deletion
      setSelectedHpas(new Set());

      // Refresh HPA list after deletion
      if (currentContext && selectedNamespaces.length > 0) {
        const fetchHPAs = async () => {
          try {
            setLoading(true);

            // Fetch HPAs for each selected namespace
            const hpaPromises = selectedNamespaces.map(async (namespace) => {
              try {
                // Try v2 first
                return await listResources(currentContext.name, 'horizontalpodautoscalers', {
                  namespace,
                  apiGroup: 'autoscaling',
                  apiVersion: 'v2'
                });
              } catch (err) {
                // Fallback to v1
                return await listResources(currentContext.name, 'horizontalpodautoscalers', {
                  namespace,
                  apiGroup: 'autoscaling',
                  apiVersion: 'v1'
                });
              }
            });

            const results = await Promise.all(hpaPromises);
            const allHpas = results.flat();

            setHpas(allHpas);
            setError(null);
          } catch (err) {
            console.error('Failed to fetch HPAs:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch HPAs');
          } finally {
            setLoading(false);
          }
        };

        fetchHPAs();
      }

    } catch (error) {
      console.error('Failed to delete HPA(s):', error);
      setError(error instanceof Error ? error.message : 'Failed to delete HPA(s)');
    }
  };

  // Delete HPA function
  const deleteHpa = async (hpa: V1HorizontalPodAutoscaler) => {
    if (!currentContext || !hpa.metadata?.name || !hpa.metadata?.namespace) return;

    await deleteResource(
      currentContext.name,
      'horizontalpodautoscalers',
      hpa.metadata.name,
      {
        namespace: hpa.metadata.namespace,
        apiGroup: 'autoscaling',
        apiVersion: hpa.apiVersion?.includes('v2') ? 'v2' : 'v1'
      }
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
          {selectedHpas.size > 1
            ? `${selectedHpas.size} HPAs selected`
            : activeHpa?.metadata?.name || 'HPA actions'}
        </div>

        <div
          className={`px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center ${selectedHpas.size > 1 ? 'text-gray-400 dark:text-gray-600 pointer-events-none' : ''}`}
          onClick={selectedHpas.size <= 1 ? handleViewHpa : undefined}
          title={selectedHpas.size > 1 ? "Select only one HPA to view" : ""}
        >
          <Eye className="h-4 w-4 mr-2" />
          View
        </div>

        <div
          className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center text-red-600 dark:text-red-400"
          onClick={handleDeleteClick}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete {selectedHpas.size > 1 ? `(${selectedHpas.size})` : ''}
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
            <AlertDialogTitle>Confirm HPA Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedHpas.size > 1
                ? `${selectedHpas.size} Horizontal Pod Autoscalers`
                : `"${activeHpa?.metadata?.name}"`}?
              This action cannot be undone.

              <div className="mt-2 text-amber-600 dark:text-amber-400">
                Warning: Deleting an HPA will affect autoscaling for the target resource.
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteHpas}
              className="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  };

  // Column management functions
  const handleColumnToggle = (columnKey: string, visible: boolean) => {
    const newConfig = columnConfig.map(col => {
      // Check if it's a top-level column
      if (col.key === columnKey) {
        return { ...col, visible };
      }

      // Check if it's a child column
      if (col.children) {
        const updatedChildren = col.children.map(child =>
          child.key === columnKey ? { ...child, visible } : child
        );

        // Check if any child was updated
        if (updatedChildren.some((child, index) => child !== col.children![index])) {
          return { ...col, children: updatedChildren };
        }
      }

      return col;
    });
    setColumnConfig(newConfig);
    saveColumnConfig('horizontalpodautoscalers', newConfig);
  };

  const handleColumnReorder = (reorderedColumns: ColumnConfig[]) => {
    setColumnConfig(reorderedColumns);
    // Save to localStorage
    saveColumnConfig('horizontalpodautoscalers', reorderedColumns);
  };

  const handleResetToDefault = () => {
    const resetConfig = defaultColumnConfig.map(col => ({ ...col, visible: true }));
    setColumnConfig(resetConfig);
    clearColumnConfig('horizontalpodautoscalers');
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

  // Helper function to render table header based on column key
  const renderTableHeader = (column: ColumnConfig) => {
    if (!column.visible || column.key === 'actions') {
      return null;
    }

    const sortFieldMap: Record<string, SortField> = {
      name: 'name',
      namespace: 'namespace',
      target: 'target',
      replicas: 'currentReplicas',
      age: 'age'
      // Note: 'metrics' is not sortable
    };

    const sortField = sortFieldMap[column.key];
    const isCenterColumn = ['replicas', 'metrics', 'age'].includes(column.key);
    const isSortable = sortField !== undefined;

    return (
      <TableHead
        key={column.key}
        className={`${isSortable ? 'cursor-pointer hover:text-blue-500' : ''} ${isCenterColumn ? 'text-center' : ''}`}
        onClick={() => sortField && handleSort(sortField)}
      >
        {column.label} {sortField && renderSortIndicator(sortField)}
      </TableHead>
    );
  };

  // Helper function to render table cell based on column key
  const renderTableCell = (hpa: V1HorizontalPodAutoscaler, column: ColumnConfig) => {
    if (!column.visible || column.key === 'actions') {
      return null;
    }

    switch (column.key) {
      case 'name':
        return (
          <TableCell key={column.key} className="font-medium" onClick={() => handleHpaDetails(hpa)}>
            <div className="hover:text-blue-500 hover:underline">
              {hpa.metadata?.name}
            </div>
          </TableCell>
        );

      case 'namespace':
        return (
          <TableCell key={column.key}>
            <div className="hover:text-blue-500 hover:underline" onClick={() => navigate(`/dashboard/explore/namespaces`)}>
              {hpa.metadata?.namespace}
            </div>
          </TableCell>
        );

      case 'target':
        return (
          <TableCell key={column.key}>
            {formatTargetRef(hpa)}
          </TableCell>
        );

      case 'replicas':
        return (
          <TableCell key={column.key} className="text-center">
            {formatReplicaStatus(hpa)}
          </TableCell>
        );

      case 'metrics':
        return (
          <TableCell key={column.key}>
            {formatMetrics(hpa)}
          </TableCell>
        );

      case 'age':
        return (
          <TableCell key={column.key} className="text-center">
            {calculateAge(hpa.metadata?.creationTimestamp?.toString())}
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

  // Fetch HPAs for all selected namespaces
  useEffect(() => {
    const fetchAllHPAs = async () => {
      if (!currentContext || selectedNamespaces.length === 0) {
        setHpas([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // If no namespaces are selected, fetch from all namespaces
        let allHpas: V1HorizontalPodAutoscaler[] = [];

        if (selectedNamespaces.length === 0) {
          // Try to fetch v2 first, then fallback to v1
          try {
            const hpasData = await listResources(currentContext.name, 'horizontalpodautoscalers', {
              apiGroup: 'autoscaling',
              apiVersion: 'v2'
            });
            allHpas = hpasData;
          } catch (err) {
            console.warn('Failed to fetch v2 HPAs, falling back to v1:', err);
            const hpasData = await listResources(currentContext.name, 'horizontalpodautoscalers', {
              apiGroup: 'autoscaling',
              apiVersion: 'v1'
            });
            allHpas = hpasData;
          }
        } else {
          // Fetch HPAs for each selected namespace
          const hpaPromises = selectedNamespaces.map(async (namespace) => {
            try {
              // Try v2 first
              return await listResources(currentContext.name, 'horizontalpodautoscalers', {
                namespace,
                apiGroup: 'autoscaling',
                apiVersion: 'v2'
              });
            } catch (err) {
              console.warn(`Failed to fetch v2 HPAs for namespace ${namespace}, falling back to v1:`, err);
              // Fallback to v1
              return await listResources(currentContext.name, 'horizontalpodautoscalers', {
                namespace,
                apiGroup: 'autoscaling',
                apiVersion: 'v1'
              });
            }
          });

          const results = await Promise.all(hpaPromises);
          allHpas = results.flat();
        }

        setHpas(allHpas);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch horizontal pod autoscalers:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch horizontal pod autoscalers');
      } finally {
        setLoading(false);
      }
    };

    fetchAllHPAs();
  }, [currentContext, selectedNamespaces]);

  // Filter HPAs based on search query
  const filteredHpas = useMemo(() => {
    if (!searchQuery.trim()) {
      return hpas;
    }

    const lowercaseQuery = searchQuery.toLowerCase();

    return hpas.filter(hpa => {
      const name = hpa.metadata?.name?.toLowerCase() || '';
      const namespace = hpa.metadata?.namespace?.toLowerCase() || '';
      const targetKind = hpa.spec?.scaleTargetRef.kind.toLowerCase() || '';
      const targetName = hpa.spec?.scaleTargetRef.name.toLowerCase() || '';
      const labels = hpa.metadata?.labels || {};
      const annotations = hpa.metadata?.annotations || {};

      // Check if any metric contains the query
      const metricMatches = (hpa.spec?.metrics || []).some(metric => {
        const metricType = metric.type.toLowerCase();

        if (metricType.includes(lowercaseQuery)) {
          return true;
        }

        // Check resource metrics
        if (metric.resource && metric.resource.name.toLowerCase().includes(lowercaseQuery)) {
          return true;
        }

        // Check pod metrics
        if (metric.pods && metric.pods.metric.name.toLowerCase().includes(lowercaseQuery)) {
          return true;
        }

        // Check object metrics
        if (metric.object && metric.object.metric.name.toLowerCase().includes(lowercaseQuery)) {
          return true;
        }

        // Check external metrics
        if (metric.external && metric.external.metric.name.toLowerCase().includes(lowercaseQuery)) {
          return true;
        }

        return false;
      });

      // Check if name, namespace, target, or any metric contains the query
      if (
        name.includes(lowercaseQuery) ||
        namespace.includes(lowercaseQuery) ||
        targetKind.includes(lowercaseQuery) ||
        targetName.includes(lowercaseQuery) ||
        metricMatches
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
  }, [hpas, searchQuery]);

  // Sort HPAs based on sort state
  const sortedHpas = useMemo(() => {
    if (!sort.field || !sort.direction) {
      return filteredHpas;
    }

    return [...filteredHpas].sort((a, b) => {
      const sortMultiplier = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'name':
          return (a.metadata?.name || '').localeCompare(b.metadata?.name || '') * sortMultiplier;

        case 'namespace':
          return (a.metadata?.namespace || '').localeCompare(b.metadata?.namespace || '') * sortMultiplier;

        case 'target': {
          const targetA = `${a.spec?.scaleTargetRef.kind}/${a.spec?.scaleTargetRef.name}`;
          const targetB = `${b.spec?.scaleTargetRef.kind}/${b.spec?.scaleTargetRef.name}`;
          return targetA.localeCompare(targetB) * sortMultiplier;
        }

        case 'minReplicas': {
          const minA = a.spec?.minReplicas || 1;
          const minB = b.spec?.minReplicas || 1;
          return (minA - minB) * sortMultiplier;
        }

        case 'maxReplicas': {
          const maxA = a.spec?.maxReplicas || 0;
          const maxB = b.spec?.maxReplicas || 0;
          return (maxA - maxB) * sortMultiplier;
        }

        case 'currentReplicas': {
          const currentA = a.status?.currentReplicas || 0;
          const currentB = b.status?.currentReplicas || 0;
          return (currentA - currentB) * sortMultiplier;
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
  }, [filteredHpas, sort.field, sort.direction]);

  const handleHpaDetails = (hpa: V1HorizontalPodAutoscaler) => {
    if (hpa.metadata?.name && hpa.metadata?.namespace) {
      navigate(`/dashboard/explore/horizontalpodautoscalers/${hpa.metadata.namespace}/${hpa.metadata.name}`);
    }
  };

  // Format target reference
  const formatTargetRef = (hpa: V1HorizontalPodAutoscaler): JSX.Element => {
    const kind = hpa.spec?.scaleTargetRef.kind || '';
    const name = hpa.spec?.scaleTargetRef.name || '';

    return (
      <div className="flex items-center">
        <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300 mr-2">
          {kind}
        </span>
        <span className="hover:text-blue-500 hover:underline">
          {name}
        </span>
      </div>
    );
  };

  // Format metrics for display
  const formatMetrics = (hpa: V1HorizontalPodAutoscaler): JSX.Element => {
    // Handle v1 HPA with targetCPUUtilizationPercentage
    if (hpa.spec?.targetCPUUtilizationPercentage !== undefined) {
      const targetCPU = hpa.spec.targetCPUUtilizationPercentage;
      const currentCPU = hpa.status?.currentMetrics?.[0]?.resource?.current?.averageUtilization;

      return (
        <div className="space-y-1">
          <div className="flex justify-between">
            <span className="text-sm">CPU:</span>
            <span className="text-sm">
              {currentCPU !== undefined ? `${currentCPU}% / ` : ''}
              {targetCPU}%
            </span>
          </div>
        </div>
      );
    }

    // Handle v2 HPA with metrics array
    const metrics = hpa.spec?.metrics || [];

    if (metrics.length === 0) {
      return <span className="text-gray-500 dark:text-gray-400">No metrics defined</span>;
    }

    // Get current metrics if available
    const currentMetrics = hpa.status?.currentMetrics || [];

    return (
      <div className="space-y-1">
        {metrics.slice(0, 2).map((metric, index) => {
          // Find matching current metric
          const currentMetric = currentMetrics.find(cm =>
            cm.type === metric.type &&
            (
              (metric.resource && cm.resource?.name === metric.resource.name) ||
              (metric.pods && cm.pods?.metric.name === metric.pods.metric.name) ||
              (metric.object && cm.object?.metric.name === metric.object.metric.name) ||
              (metric.external && cm.external?.metric.name === metric.external.metric.name) ||
              (metric.containerResource && cm.containerResource?.name === metric.containerResource.name &&
                cm.containerResource?.container === metric.containerResource.container)
            )
          );

          // Format based on metric type
          switch (metric.type) {
            case 'Resource': {
              if (!metric.resource) return null;

              const resourceName = metric.resource.name;
              const target = metric.resource.target;
              const current = currentMetric?.resource?.current;

              let targetDisplay = '';
              let currentDisplay = '';

              if (target.type === 'Utilization' && target.averageUtilization !== undefined) {
                targetDisplay = `${target.averageUtilization}%`;
                currentDisplay = current?.averageUtilization !== undefined ? `${current.averageUtilization}%` : '';
              } else if (target.type === 'AverageValue') {
                targetDisplay = target.averageValue || '';
                currentDisplay = current?.averageValue || '';
              } else if (target.type === 'Value') {
                targetDisplay = target.value || '';
                currentDisplay = current?.averageValue || '';
              }

              return (
                <div key={index} className="flex justify-between">
                  <span className="text-sm">{resourceName}:</span>
                  <span className="text-sm">
                    {currentDisplay ? `${currentDisplay} / ` : ''}
                    {targetDisplay}
                  </span>
                </div>
              );
            }

            case 'Pods':
            case 'Object':
            case 'External':
            case 'ContainerResource': {
              let metricName = '';
              let targetDisplay = '';
              let currentDisplay = '';

              if (metric.pods) {
                metricName = metric.pods.metric.name;
                targetDisplay = metric.pods.target.averageValue || '';
                currentDisplay = currentMetric?.pods?.current.averageValue || '';
              } else if (metric.object) {
                metricName = metric.object.metric.name;
                targetDisplay = metric.object.target.value || metric.object.target.averageValue || '';
                currentDisplay = currentMetric?.object?.current.value || currentMetric?.object?.current.averageValue || '';
              } else if (metric.external) {
                metricName = metric.external.metric.name;
                targetDisplay = metric.external.target.value || metric.external.target.averageValue || '';
                currentDisplay = currentMetric?.external?.current.value || currentMetric?.external?.current.averageValue || '';
              } else if (metric.containerResource) {
                metricName = `${metric.containerResource.container}/${metric.containerResource.name}`;
                if (metric.containerResource.target.type === 'Utilization') {
                  targetDisplay = `${metric.containerResource.target.averageUtilization}%`;
                  currentDisplay = currentMetric?.containerResource?.current.averageUtilization !== undefined
                    ? `${currentMetric.containerResource.current.averageUtilization}%`
                    : '';
                } else {
                  targetDisplay = metric.containerResource.target.averageValue || '';
                  currentDisplay = currentMetric?.containerResource?.current.averageValue || '';
                }
              }

              return (
                <div key={index} className="flex justify-between">
                  <span className="text-sm">{metricName}:</span>
                  <span className="text-sm">
                    {currentDisplay ? `${currentDisplay} / ` : ''}
                    {targetDisplay}
                  </span>
                </div>
              );
            }

            default:
              return null;
          }
        })}

        {metrics.length > 2 && (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            +{metrics.length - 2} more metrics
          </div>
        )}
      </div>
    );
  };

  // Format current/min/max replicas with scaling indicator
  const formatReplicaStatus = (hpa: V1HorizontalPodAutoscaler): JSX.Element => {
    const currentReplicas = hpa.status?.currentReplicas || 0;
    const desiredReplicas = hpa.status?.desiredReplicas || currentReplicas;
    const minReplicas = hpa.spec?.minReplicas || 1;
    const maxReplicas = hpa.spec?.maxReplicas || 0;

    // Determine if scaling is in progress
    const isScaling = currentReplicas !== desiredReplicas;

    // Determine color based on status
    let statusColor = 'text-gray-600 dark:text-gray-400';
    if (isScaling) {
      statusColor = 'text-amber-600 dark:text-amber-400';
    } else if (currentReplicas === maxReplicas) {
      statusColor = 'text-red-600 dark:text-red-400';
    } else if (currentReplicas === minReplicas) {
      statusColor = 'text-blue-600 dark:text-blue-400';
    } else {
      statusColor = 'text-green-600 dark:text-green-400';
    }

    return (
      <div className="flex flex-col items-center">
        <span className={`font-medium ${statusColor}`}>
          {currentReplicas} {isScaling && `→ ${desiredReplicas}`}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {minReplicas} / {maxReplicas}
        </span>
      </div>
    );
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
          <h1 className='text-5xl font-[Anton] uppercase font-bold text-gray-800/30 dark:text-gray-700/50'>Horizontal Pod Autoscalers</h1>
          <div className="w-full md:w-96 mt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
              <Input
                type="text"
                placeholder="Search by name, namespace, target, or metric..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </div>

        <div className="flex items-end gap-2">
          <div className="w-full md:w-96">
            <div className="text-sm font-medium mb-2">Namespaces</div>
            <NamespaceSelector />
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilterSidebar(true)}
            className="flex items-center gap-2 h-10 dark:text-gray-300/80"
            title="Filter columns"
          >
            <Filter className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* No results message */}
      {sortedHpas.length === 0 && (
        <Alert className="my-6">
          <AlertDescription>
            {searchQuery
              ? `No horizontal pod autoscalers matching "${searchQuery}"`
              : selectedNamespaces.length === 0
                ? "Please select at least one namespace"
                : "No horizontal pod autoscalers found in the selected namespaces"}
          </AlertDescription>
        </Alert>
      )}

      {/* HPA table */}
      {sortedHpas.length > 0 && (
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
                {sortedHpas.map((hpa) => (
                  <TableRow
                    key={`${hpa.metadata?.namespace}-${hpa.metadata?.name}`}
                    className={`bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30 ${selectedHpas.has(`${hpa.metadata?.namespace}/${hpa.metadata?.name}`) ? 'bg-blue-50 dark:bg-gray-800/30' : ''
                      }`}
                    onClick={(e) => handleHpaClick(e, hpa)}
                    onContextMenu={(e) => handleContextMenu(e, hpa)}
                  >
                    {columnConfig.map(col => renderTableCell(hpa, col))}
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
                          <DropdownMenuItem onClick={handleViewHpa} className='hover:text-gray-700 dark:hover:text-gray-500'>
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-500 dark:text-red-400 focus:text-red-500 dark:focus:text-red-400 hover:text-red-700 dark:hover:text-red-500"
                            onClick={(e) => handleDeleteHpaMenuItem(e, hpa)}
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
        title="HPA Columns"
        columns={columnConfig}
        onColumnToggle={handleColumnToggle}
        onColumnReorder={handleColumnReorder}
        onResetToDefault={handleResetToDefault}
        resourceType="horizontalpodautoscalers"
        className="w-1/3"
      />
    </div>
  );
};

export default HorizontalPodAutoscalers;