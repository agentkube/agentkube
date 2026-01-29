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
import { NamespaceSelector } from '@/components/custom';
import ResourceFilterSidebar, { type ColumnConfig } from '@/components/custom/resourcefiltersidebar/resourcefiltersidebar.component';
import { useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Trash } from "lucide-react";
import { Trash2, Eye } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { deleteResource } from '@/api/internal/resources';
import { useReconMode } from '@/contexts/useRecon';
import { toast } from '@/hooks/use-toast';
import { getStoredColumnConfig, saveColumnConfig, clearColumnConfig } from '@/utils/columnConfigStorage';

// Define types for PodDisruptionBudget
interface LabelSelector {
  matchLabels?: { [key: string]: string };
  matchExpressions?: Array<{
    key: string;
    operator: string;
    values?: string[];
  }>;
}

interface PodDisruptionBudgetSpec {
  minAvailable?: string | number;
  maxUnavailable?: string | number;
  selector?: LabelSelector;
}

interface PodDisruptionBudgetStatus {
  observedGeneration?: number;
  disruptionsAllowed: number;
  currentHealthy: number;
  desiredHealthy: number;
  expectedPods: number;
  disruptedPods?: { [podName: string]: string }; // pod name -> disruption time
}

interface V1PodDisruptionBudget {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    namespace?: string;
    creationTimestamp?: string;
    labels?: { [key: string]: string };
    annotations?: { [key: string]: string };
  };
  spec?: PodDisruptionBudgetSpec;
  status?: PodDisruptionBudgetStatus;
}

// Define sorting types
type SortDirection = 'asc' | 'desc' | null;
type SortField = 'name' | 'namespace' | 'selector' | 'minAvailable' | 'maxUnavailable' | 'healthy' | 'disruptions' | 'age' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

// Default column configuration
const defaultColumnConfig: ColumnConfig[] = [
  { key: 'name', label: 'Name', visible: true, canToggle: false },
  { key: 'namespace', label: 'Namespace', visible: true, canToggle: true },
  { key: 'selector', label: 'Selector', visible: true, canToggle: true },
  { key: 'budget', label: 'Budget', visible: true, canToggle: true },
  { key: 'healthy', label: 'Healthy Pods', visible: true, canToggle: true },
  { key: 'disruptions', label: 'Disruptions', visible: true, canToggle: true },
  { key: 'age', label: 'Age', visible: true, canToggle: true },
  { key: 'actions', label: 'Actions', visible: true, canToggle: false }
];

const PodDisruptionBudgets: React.FC = () => {
  const navigate = useNavigate();
  const { currentContext } = useCluster();
  const { selectedNamespaces } = useNamespace();
  const { isReconMode } = useReconMode();
  const [pdbs, setPdbs] = useState<V1PodDisruptionBudget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Column filtering state
  const [columnConfig, setColumnConfig] = useState<ColumnConfig[]>(() =>
    getStoredColumnConfig('poddisruptionbudgets', defaultColumnConfig)
  );
  const [showFilterSidebar, setShowFilterSidebar] = useState(false);

  // --- Start of Multi-select ---
  const [selectedPdbs, setSelectedPdbs] = useState<Set<string>>(new Set());
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [activePdb, setActivePdb] = useState<V1PodDisruptionBudget | null>(null);
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

  const handlePdbClick = (e: React.MouseEvent, pdb: V1PodDisruptionBudget) => {
    const pdbKey = `${pdb.metadata?.namespace}/${pdb.metadata?.name}`;

    if (e.metaKey || e.ctrlKey) {
      // Prevent navigation when using multi-select
      e.preventDefault();
      e.stopPropagation();

      setSelectedPdbs(prev => {
        const newSelection = new Set(prev);
        if (newSelection.has(pdbKey)) {
          newSelection.delete(pdbKey);
        } else {
          newSelection.add(pdbKey);
        }
        return newSelection;
      });
    } else if (!selectedPdbs.has(pdbKey)) {
      // Clear selection on regular click (unless clicking on already selected PDB)
      setSelectedPdbs(new Set());
      handlePdbDetails(pdb);
    } else {
      handlePdbDetails(pdb);
    }
  };

  // Add context menu handlers
  const handleContextMenu = (e: React.MouseEvent, pdb: V1PodDisruptionBudget) => {
    e.preventDefault();
    e.stopPropagation();

    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setActivePdb(pdb);
    setShowContextMenu(true);

    // Multi-select support: if PDB isn't in selection, make it the only selection
    const pdbKey = `${pdb.metadata?.namespace}/${pdb.metadata?.name}`;
    if (!selectedPdbs.has(pdbKey)) {
      setSelectedPdbs(new Set([pdbKey]));
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

        if (isOutsideTable && !isContextMenuClick && !isAlertDialogClick && selectedPdbs.size > 0) {
          setSelectedPdbs(new Set());
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedPdbs]);

  // Handle view action - only available for a single PDB
  const handleViewPdb = () => {
    setShowContextMenu(false);

    if (activePdb && activePdb.metadata?.name && activePdb.metadata?.namespace) {
      navigate(`/dashboard/explore/poddisruptionbudgets/${activePdb.metadata.namespace}/${activePdb.metadata.name}`);
    }
  };

  // Helper function for dropdown menu actions
  const handleViewPdbMenuItem = (e: React.MouseEvent, pdb: V1PodDisruptionBudget) => {
    e.stopPropagation();
    if (pdb.metadata?.name && pdb.metadata?.namespace) {
      navigate(`/dashboard/explore/poddisruptionbudgets/${pdb.metadata.namespace}/${pdb.metadata.name}`);
    }
  };

  const handleDeletePdbMenuItem = (e: React.MouseEvent, pdb: V1PodDisruptionBudget) => {
    e.stopPropagation();

    if (isReconMode) {
      toast({
        title: "Recon Mode",
        description: "This action can't be performed while recon mode is on. Disable recon mode to proceed.",
        variant: "recon"
      });
      return;
    }

    setActivePdb(pdb);
    setSelectedPdbs(new Set([`${pdb.metadata?.namespace}/${pdb.metadata?.name}`]));
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
  const deletePdbs = async () => {
    setShowDeleteDialog(false);

    try {
      if (selectedPdbs.size === 0 && activePdb) {
        // Delete single active PDB
        await deletePdb(activePdb);
      } else {
        // Delete all selected PDBs
        for (const pdbKey of selectedPdbs) {
          const [namespace, name] = pdbKey.split('/');
          const pdbToDelete = pdbs.find(p =>
            p.metadata?.namespace === namespace && p.metadata?.name === name
          );

          if (pdbToDelete) {
            await deletePdb(pdbToDelete);
          }
        }
      }

      // Clear selection after deletion
      setSelectedPdbs(new Set());

      // Refresh PDB list after deletion
      if (currentContext && selectedNamespaces.length > 0) {
        const fetchPdbs = async () => {
          try {
            setLoading(true);

            // Fetch PDBs for each selected namespace
            const pdbPromises = selectedNamespaces.map(async (namespace) => {
              try {
                // Try v1 first
                return await listResources(currentContext.name, 'poddisruptionbudgets', {
                  namespace,
                  apiGroup: 'policy',
                  apiVersion: 'v1'
                });
              } catch (err) {
                // Fallback to v1beta1
                try {
                  return await listResources(currentContext.name, 'poddisruptionbudgets', {
                    namespace,
                    apiGroup: 'policy',
                    apiVersion: 'v1beta1'
                  });
                } catch (fallbackErr) {
                  return [];
                }
              }
            });

            const results = await Promise.all(pdbPromises);
            const allPdbs = results.flat();

            setPdbs(allPdbs);
            if (allPdbs.length > 0) {
              setError(null);
            }
          } catch (err) {
            console.error('Failed to fetch pod disruption budgets:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch pod disruption budgets');
          } finally {
            setLoading(false);
          }
        };

        fetchPdbs();
      }

    } catch (error) {
      console.error('Failed to delete PDB(s):', error);
      setError(error instanceof Error ? error.message : 'Failed to delete PDB(s)');
    }
  };

  // Delete PDB function
  const deletePdb = async (pdb: V1PodDisruptionBudget) => {
    if (!currentContext || !pdb.metadata?.name || !pdb.metadata?.namespace) return;

    // Determine API version based on pdb's apiVersion field
    const apiVersion = pdb.apiVersion?.includes('v1beta1') ? 'v1beta1' : 'v1';

    await deleteResource(
      currentContext.name,
      'poddisruptionbudgets',
      pdb.metadata.name,
      {
        namespace: pdb.metadata.namespace,
        apiGroup: 'policy',
        apiVersion: apiVersion
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
        className="fixed z-50 min-w-[180px] bg-white dark:bg-card backdrop-blur-sm rounded-md shadow-lg border border-gray-300 dark:border-gray-800/60 py-1 text-sm"
        style={{
          left: `${contextMenuPosition.x}px`,
          top: shouldShowAbove
            ? `${contextMenuPosition.y - menuHeight}px`
            : `${contextMenuPosition.y}px`,
        }}
      >
        <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 font-medium border-b border-gray-200 dark:border-gray-800/60">
          {selectedPdbs.size > 1
            ? `${selectedPdbs.size} PDBs selected`
            : activePdb?.metadata?.name || 'PDB actions'}
        </div>

        <div
          className={`px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center ${selectedPdbs.size > 1 ? 'text-gray-400 dark:text-gray-600 pointer-events-none' : ''}`}
          onClick={selectedPdbs.size <= 1 ? handleViewPdb : undefined}
          title={selectedPdbs.size > 1 ? "Select only one PDB to view" : ""}
        >
          <Eye className="h-4 w-4 mr-2" />
          View
        </div>

        <div
          className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center text-red-600 dark:text-red-400"
          onClick={handleDeleteClick}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete {selectedPdbs.size > 1 ? `(${selectedPdbs.size})` : ''}
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
            <AlertDialogTitle>Confirm PDB Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedPdbs.size > 1
                ? `${selectedPdbs.size} Pod Disruption Budgets`
                : `"${activePdb?.metadata?.name}"`}?
              This action cannot be undone.

              <div className="mt-2 text-amber-600 dark:text-amber-400">
                Warning: Deleting Pod Disruption Budgets may impact the availability guarantees for your workloads during voluntary disruptions.
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deletePdbs}
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

  // Column management functions
  const handleColumnToggle = (columnKey: string, visible: boolean) => {
    const updated = columnConfig.map(col =>
      col.key === columnKey ? { ...col, visible } : col
    );
    setColumnConfig(updated);
    saveColumnConfig('poddisruptionbudgets', updated);
  };

  const handleColumnReorder = (reorderedColumns: ColumnConfig[]) => {
    setColumnConfig(reorderedColumns);
    // Save to localStorage
    saveColumnConfig('poddisruptionbudgets', reorderedColumns);
  };

  const handleResetToDefault = () => {
    setColumnConfig(defaultColumnConfig);
    clearColumnConfig('poddisruptionbudgets');
  };

  const isColumnVisible = (columnKey: string): boolean => {
    const column = columnConfig.find(col => col.key === columnKey);
    return column ? column.visible : true;
  };

  // Helper function to render table header based on column key
  const renderTableHeader = (column: ColumnConfig) => {
    if (!column.visible || column.key === 'actions') {
      return null;
    }

    const sortFieldMap: Record<string, SortField> = {
      name: 'name',
      namespace: 'namespace',
      selector: 'selector',
      healthy: 'healthy',
      disruptions: 'disruptions',
      age: 'age'
      // Note: 'budget' is not sortable
    };

    const sortField = sortFieldMap[column.key];
    const isCenterColumn = ['budget', 'healthy', 'disruptions', 'age'].includes(column.key);
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
  const renderTableCell = (pdb: V1PodDisruptionBudget, column: ColumnConfig) => {
    if (!column.visible || column.key === 'actions') {
      return null;
    }

    switch (column.key) {
      case 'name':
        return (
          <TableCell key={column.key} className="font-medium" onClick={() => handlePdbDetails(pdb)}>
            <div className="hover:text-blue-500 hover:underline">
              {pdb.metadata?.name}
            </div>
          </TableCell>
        );

      case 'namespace':
        return (
          <TableCell key={column.key}>
            <div className="hover:text-blue-500 hover:underline" onClick={() => navigate(`/dashboard/explore/namespaces/${pdb.metadata?.namespace}`)}>
              {pdb.metadata?.namespace}
            </div>
          </TableCell>
        );

      case 'selector':
        return (
          <TableCell key={column.key}>
            {formatSelector(pdb)}
          </TableCell>
        );

      case 'budget':
        return (
          <TableCell key={column.key}>
            {formatBudget(pdb)}
          </TableCell>
        );

      case 'healthy':
        return (
          <TableCell key={column.key}>
            {formatPodStatus(pdb)}
          </TableCell>
        );

      case 'disruptions':
        return (
          <TableCell key={column.key}>
            {formatDisruptions(pdb)}
          </TableCell>
        );

      case 'age':
        return (
          <TableCell key={column.key} className="text-center">
            {calculateAge(pdb.metadata?.creationTimestamp?.toString())}
          </TableCell>
        );

      default:
        return null;
    }
  };

  // Fetch PDBs for all selected namespaces
  useEffect(() => {
    const fetchAllPDBs = async () => {
      if (!currentContext || selectedNamespaces.length === 0) {
        setPdbs([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // If no namespaces are selected, fetch from all namespaces
        let allPdbs: V1PodDisruptionBudget[] = [];

        if (selectedNamespaces.length === 0) {
          try {
            // First try v1 API
            const pdbsData = await listResources(currentContext.name, 'poddisruptionbudgets', {
              apiGroup: 'policy',
              apiVersion: 'v1'
            });
            allPdbs = pdbsData;
          } catch (err) {
            console.warn('Failed to fetch PDBs with policy/v1, falling back to policy/v1beta1:', err);

            try {
              // Fallback to v1beta1 API for older clusters
              const pdbsData = await listResources(currentContext.name, 'poddisruptionbudgets', {
                apiGroup: 'policy',
                apiVersion: 'v1beta1'
              });
              allPdbs = pdbsData;
            } catch (fallbackErr) {
              console.error('Failed to fetch PDBs:', fallbackErr);
              setError('Failed to fetch PodDisruptionBudgets. Your cluster may not support this resource type.');
              allPdbs = [];
            }
          }
        } else {
          // Fetch PDBs for each selected namespace
          const pdbPromises = selectedNamespaces.map(async (namespace) => {
            try {
              // Try v1 first
              return await listResources(currentContext.name, 'poddisruptionbudgets', {
                namespace,
                apiGroup: 'policy',
                apiVersion: 'v1'
              });
            } catch (err) {
              console.warn(`Failed to fetch PDBs for namespace ${namespace} with policy/v1, falling back to policy/v1beta1:`, err);

              try {
                // Fallback to v1beta1
                return await listResources(currentContext.name, 'poddisruptionbudgets', {
                  namespace,
                  apiGroup: 'policy',
                  apiVersion: 'v1beta1'
                });
              } catch (fallbackErr) {
                console.warn(`Failed to fetch PDBs for namespace ${namespace}:`, fallbackErr);
                return [];
              }
            }
          });

          const results = await Promise.all(pdbPromises);
          allPdbs = results.flat();
        }

        setPdbs(allPdbs);
        if (allPdbs.length > 0) {
          setError(null);
        }
      } catch (err) {
        console.error('Failed to fetch pod disruption budgets:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch pod disruption budgets');
      } finally {
        setLoading(false);
      }
    };

    fetchAllPDBs();
  }, [currentContext, selectedNamespaces]);

  // Filter PDBs based on search query
  const filteredPdbs = useMemo(() => {
    if (!searchQuery.trim()) {
      return pdbs;
    }

    const lowercaseQuery = searchQuery.toLowerCase();

    return pdbs.filter(pdb => {
      const name = pdb.metadata?.name?.toLowerCase() || '';
      const namespace = pdb.metadata?.namespace?.toLowerCase() || '';
      const labels = pdb.metadata?.labels || {};
      const annotations = pdb.metadata?.annotations || {};

      // Check selector if present
      let selectorString = '';
      if (pdb.spec?.selector?.matchLabels) {
        selectorString = Object.entries(pdb.spec.selector.matchLabels)
          .map(([k, v]) => `${k}=${v}`)
          .join(',');
      }

      if (pdb.spec?.selector?.matchExpressions) {
        selectorString += pdb.spec.selector.matchExpressions
          .map(expr => {
            if (expr.operator === 'In' || expr.operator === 'NotIn') {
              return `${expr.key} ${expr.operator.toLowerCase()} (${expr.values?.join(',') || ''})`;
            } else {
              return `${expr.key} ${expr.operator.toLowerCase()}`;
            }
          })
          .join(',');
      }

      // Check disrupted pods if present
      const disruptedPods = Object.keys(pdb.status?.disruptedPods || {}).join(',').toLowerCase();

      // Check if name, namespace, or selector contains the query
      if (
        name.includes(lowercaseQuery) ||
        namespace.includes(lowercaseQuery) ||
        selectorString.toLowerCase().includes(lowercaseQuery) ||
        disruptedPods.includes(lowercaseQuery)
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
  }, [pdbs, searchQuery]);

  // Sort PDBs based on sort state
  const sortedPdbs = useMemo(() => {
    if (!sort.field || !sort.direction) {
      return filteredPdbs;
    }

    return [...filteredPdbs].sort((a, b) => {
      const sortMultiplier = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'name':
          return (a.metadata?.name || '').localeCompare(b.metadata?.name || '') * sortMultiplier;

        case 'namespace':
          return (a.metadata?.namespace || '').localeCompare(b.metadata?.namespace || '') * sortMultiplier;

        case 'selector': {
          const getSelectorString = (pdb: V1PodDisruptionBudget): string => {
            if (!pdb.spec?.selector) return '';

            let result = '';
            if (pdb.spec.selector.matchLabels) {
              result = Object.entries(pdb.spec.selector.matchLabels)
                .map(([k, v]) => `${k}=${v}`)
                .join(',');
            }
            return result;
          };

          return getSelectorString(a).localeCompare(getSelectorString(b)) * sortMultiplier;
        }

        case 'minAvailable': {
          const getMinAvailable = (pdb: V1PodDisruptionBudget): number => {
            if (pdb.spec?.minAvailable === undefined) return -1;
            if (typeof pdb.spec.minAvailable === 'number') return pdb.spec.minAvailable;

            // Handle percentage values by converting to a number between 0-100
            const minStr = pdb.spec.minAvailable.toString();
            if (minStr.endsWith('%')) {
              return parseFloat(minStr.slice(0, -1));
            }
            return parseInt(minStr, 10) || 0;
          };

          return (getMinAvailable(a) - getMinAvailable(b)) * sortMultiplier;
        }

        case 'maxUnavailable': {
          const getMaxUnavailable = (pdb: V1PodDisruptionBudget): number => {
            if (pdb.spec?.maxUnavailable === undefined) return -1;
            if (typeof pdb.spec.maxUnavailable === 'number') return pdb.spec.maxUnavailable;

            // Handle percentage values by converting to a number between 0-100
            const maxStr = pdb.spec.maxUnavailable.toString();
            if (maxStr.endsWith('%')) {
              return parseFloat(maxStr.slice(0, -1));
            }
            return parseInt(maxStr, 10) || 0;
          };

          return (getMaxUnavailable(a) - getMaxUnavailable(b)) * sortMultiplier;
        }

        case 'healthy': {
          const currentHealthyA = a.status?.currentHealthy || 0;
          const currentHealthyB = b.status?.currentHealthy || 0;
          return (currentHealthyA - currentHealthyB) * sortMultiplier;
        }

        case 'disruptions': {
          const disruptionsAllowedA = a.status?.disruptionsAllowed || 0;
          const disruptionsAllowedB = b.status?.disruptionsAllowed || 0;
          return (disruptionsAllowedA - disruptionsAllowedB) * sortMultiplier;
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
  }, [filteredPdbs, sort.field, sort.direction]);

  const handlePdbDetails = (pdb: V1PodDisruptionBudget) => {
    if (pdb.metadata?.name && pdb.metadata?.namespace) {
      navigate(`/dashboard/explore/poddisruptionbudgets/${pdb.metadata.namespace}/${pdb.metadata.name}`);
    }
  };

  // Format selector for display
  const formatSelector = (pdb: V1PodDisruptionBudget): JSX.Element => {
    if (!pdb.spec?.selector) {
      return <span className="text-gray-500 dark:text-gray-400">No selector</span>;
    }

    const { matchLabels, matchExpressions } = pdb.spec.selector;
    const hasLabels = matchLabels && Object.keys(matchLabels).length > 0;
    const hasExpressions = matchExpressions && matchExpressions.length > 0;

    if (!hasLabels && !hasExpressions) {
      return <span className="text-gray-500 dark:text-gray-400">Empty selector</span>;
    }

    return (
      <div className="space-y-1">
        {hasLabels && (
          <div className="space-y-1">
            {Object.entries(matchLabels!).slice(0, 2).map(([key, value]) => (
              <div key={key} className="flex items-center">
                <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300 mr-1">
                  {key}
                </span>
                <span className="text-xs">
                  = {value}
                </span>
              </div>
            ))}
            {Object.keys(matchLabels!).length > 2 && (
              <div className="text-xs text-gray-500 dark:text-gray-400">
                +{Object.keys(matchLabels!).length - 2} more labels
              </div>
            )}
          </div>
        )}

        {hasExpressions && (
          <div className="space-y-1">
            {matchExpressions!.slice(0, 2).map((expr, idx) => (
              <div key={idx} className="flex items-center">
                <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300 mr-1">
                  {expr.key}
                </span>
                <span className="text-xs">
                  {expr.operator.toLowerCase()} {expr.values?.join(', ')}
                </span>
              </div>
            ))}
            {matchExpressions!.length > 2 && (
              <div className="text-xs text-gray-500 dark:text-gray-400">
                +{matchExpressions!.length - 2} more expressions
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Format min/max available for display
  const formatBudget = (pdb: V1PodDisruptionBudget): JSX.Element => {
    const { minAvailable, maxUnavailable } = pdb.spec || {};

    if (minAvailable !== undefined) {
      return (
        <div className="flex items-center">
          <span className="font-medium mr-2">Min Available:</span>
          <span className="px-2 py-1 rounded-[0.3rem] text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300">
            {minAvailable.toString()}
          </span>
        </div>
      );
    } else if (maxUnavailable !== undefined) {
      return (
        <div className="flex items-center">
          <span className="font-medium mr-2">Max Unavailable:</span>
          <span className="px-2 py-1 rounded-[0.3rem] text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
            {maxUnavailable.toString()}
          </span>
        </div>
      );
    } else {
      return <span className="text-gray-500 dark:text-gray-400">No budget defined</span>;
    }
  };

  // Format pod status
  const formatPodStatus = (pdb: V1PodDisruptionBudget): JSX.Element => {
    if (!pdb.status) {
      return <span className="text-gray-500 dark:text-gray-400">Status unknown</span>;
    }

    const { currentHealthy, desiredHealthy, expectedPods } = pdb.status;

    // Calculate health percentage
    const healthPercentage = expectedPods > 0
      ? Math.round((currentHealthy / expectedPods) * 100)
      : 0;

    // Determine status class based on health percentage
    let statusClass = '';
    if (healthPercentage >= 90) {
      statusClass = 'text-green-600 dark:text-green-400';
    } else if (healthPercentage >= 70) {
      statusClass = 'text-amber-600 dark:text-amber-400';
    } else {
      statusClass = 'text-red-600 dark:text-red-400';
    }

    return (
      <div className="space-y-1">
        <div className="flex justify-between">
          <span className="text-sm">Current:</span>
          <span className={`text-sm font-medium ${statusClass}`}>
            {currentHealthy} / {expectedPods}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm">Desired:</span>
          <span className="text-sm">
            {desiredHealthy}
          </span>
        </div>
      </div>
    );
  };

  // Format disruptions
  const formatDisruptions = (pdb: V1PodDisruptionBudget): JSX.Element => {
    if (!pdb.status) {
      return <span className="text-gray-500 dark:text-gray-400">Status unknown</span>;
    }

    const { disruptionsAllowed, disruptedPods } = pdb.status;
    const disruptedCount = disruptedPods ? Object.keys(disruptedPods).length : 0;

    // Determine status class
    let statusClass = 'text-green-600 dark:text-green-400';
    if (disruptionsAllowed === 0) {
      statusClass = 'text-amber-600 dark:text-amber-400';
    }

    return (
      <div className="space-y-1">
        <div className="flex justify-between">
          <span className="text-sm">Allowed:</span>
          <span className={`text-sm font-medium ${statusClass}`}>
            {disruptionsAllowed}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm">Current:</span>
          <span className="text-sm">
            {disruptedCount}
          </span>
        </div>
        {disruptedCount > 0 && (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {disruptedCount === 1 ? '1 pod disrupted' : `${disruptedCount} pods disrupted`}
          </div>
        )}
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
      <Alert className="m-6 bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
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
          <h1 className='text-5xl font-[Anton] uppercase font-bold text-gray-800/30 dark:text-gray-700/50'>Pod Disruption Budgets</h1>
          <div className="w-full md:w-96 mt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
              <Input
                type="text"
                placeholder="Search by name, namespace, selector..."
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
          >
            <Filter className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Special note about PDB being a CRD */}
      {pdbs.length === 0 && (
        <Alert className="my-6 bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <AlertDescription>
            {searchQuery
              ? `No pod disruption budgets matching "${searchQuery}"`
              : selectedNamespaces.length === 0
                ? "Please select at least one namespace"
                : "No pod disruption budgets found in the selected namespaces."}
          </AlertDescription>
        </Alert>
      )}

      {/* PDB table */}
      {pdbs.length > 0 && (
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
                {sortedPdbs.map((pdb) => (
                  <TableRow
                    key={`${pdb.metadata?.namespace}-${pdb.metadata?.name}`}
                    className={`bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30 ${selectedPdbs.has(`${pdb.metadata?.namespace}/${pdb.metadata?.name}`) ? 'bg-blue-50 dark:bg-gray-800/30' : ''
                      }`}
                    onClick={(e) => handlePdbClick(e, pdb)}
                    onContextMenu={(e) => handleContextMenu(e, pdb)}
                  >
                    {columnConfig.map(col => renderTableCell(pdb, col))}
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
                        <DropdownMenuContent align="end" className='dark:bg-card/40 backdrop-blur-sm text-gray-800 dark:text-gray-300'>
                          <DropdownMenuItem onClick={(e) => handleViewPdbMenuItem(e, pdb)} className='hover:text-gray-700 dark:hover:text-gray-500'>
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-500 dark:text-red-400 focus:text-red-500 dark:focus:text-red-400 hover:text-red-700 dark:hover:text-red-500"
                            onClick={(e) => handleDeletePdbMenuItem(e, pdb)}
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

      {/* Filter Sidebar */}
      <ResourceFilterSidebar
        isOpen={showFilterSidebar}
        onClose={() => setShowFilterSidebar(false)}
        title="Pod Disruption Budgets Table"
        columns={columnConfig}
        onColumnToggle={handleColumnToggle}
        onColumnReorder={handleColumnReorder}
        onResetToDefault={handleResetToDefault}
        resourceType="poddisruptionbudgets"
      />
    </div>
  );
};

export default PodDisruptionBudgets;