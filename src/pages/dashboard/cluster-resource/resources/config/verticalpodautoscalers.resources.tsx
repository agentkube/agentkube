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
import { NamespaceSelector, ErrorComponent } from '@/components/custom';
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

// Define types for VerticalPodAutoscaler
interface CrossVersionObjectReference {
  apiVersion?: string;
  kind: string;
  name: string;
}

interface ResourceList {
  cpu?: string;
  memory?: string;
  [key: string]: string | undefined;
}

interface ContainerResourcePolicy {
  containerName: string;
  mode?: string;
  minAllowed?: ResourceList;
  maxAllowed?: ResourceList;
  controlledResources?: string[];
  controlledValues?: string;
}

interface PodResourcePolicy {
  containerPolicies: ContainerResourcePolicy[];
}

interface VerticalPodAutoscalerUpdatePolicy {
  updateMode?: string;
  minReplicas?: number;
}

interface VerticalPodAutoscalerSpec {
  targetRef: CrossVersionObjectReference;
  updatePolicy?: VerticalPodAutoscalerUpdatePolicy;
  resourcePolicy?: PodResourcePolicy;
}

interface ContainerRecommendation {
  containerName: string;
  target?: ResourceList;
  lowerBound?: ResourceList;
  upperBound?: ResourceList;
  uncappedTarget?: ResourceList;
}

interface VerticalPodAutoscalerRecommendation {
  containerRecommendations: ContainerRecommendation[];
}

interface VerticalPodAutoscalerCondition {
  type: string;
  status: string;
  lastTransitionTime: string;
  reason: string;
  message: string;
}

interface VerticalPodAutoscalerStatus {
  recommendation?: VerticalPodAutoscalerRecommendation;
  conditions?: VerticalPodAutoscalerCondition[];
}

interface V1VerticalPodAutoscaler {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    namespace?: string;
    creationTimestamp?: string;
    labels?: { [key: string]: string };
    annotations?: { [key: string]: string };
  };
  spec?: VerticalPodAutoscalerSpec;
  status?: VerticalPodAutoscalerStatus;
}

// Define sorting types
type SortDirection = 'asc' | 'desc' | null;
type SortField = 'name' | 'namespace' | 'target' | 'mode' | 'conditions' | 'age' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

const VerticalPodAutoscalers: React.FC = () => {
  const navigate = useNavigate();
  const { currentContext } = useCluster();
  const { selectedNamespaces } = useNamespace();
  const { isReconMode } = useReconMode();
  const [vpas, setVpas] = useState<V1VerticalPodAutoscaler[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Column filtering state
  const defaultColumnConfig: ColumnConfig[] = [
    { key: 'name', label: 'Name', visible: true, canToggle: false },
    { key: 'namespace', label: 'Namespace', visible: true, canToggle: true },
    { key: 'target', label: 'Target', visible: true, canToggle: true },
    { key: 'mode', label: 'Mode', visible: true, canToggle: true },
    { key: 'conditions', label: 'Conditions', visible: true, canToggle: true },
    { key: 'recommendations', label: 'Recommendations', visible: true, canToggle: true },
    { key: 'age', label: 'Age', visible: true, canToggle: true },
    { key: 'actions', label: 'Actions', visible: true, canToggle: false }
  ];
  
  const [columnConfig, setColumnConfig] = useState<ColumnConfig[]>(() => 
    getStoredColumnConfig('verticalpodautoscalers', defaultColumnConfig)
  );
  const [showFilterSidebar, setShowFilterSidebar] = useState(false);

  // --- Start of Multi-select ---

  const [selectedVpas, setSelectedVpas] = useState<Set<string>>(new Set());
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [activeVpa, setActiveVpa] = useState<V1VerticalPodAutoscaler | null>(null);
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

  // Add click handler for VPA selection with cmd/ctrl key
  const handleVpaClick = (e: React.MouseEvent, vpa: V1VerticalPodAutoscaler) => {
    const vpaKey = `${vpa.metadata?.namespace}/${vpa.metadata?.name}`;

    if (e.metaKey || e.ctrlKey) {
      // Prevent navigation when using multi-select
      e.preventDefault();
      e.stopPropagation();

      setSelectedVpas(prev => {
        const newSelection = new Set(prev);
        if (newSelection.has(vpaKey)) {
          newSelection.delete(vpaKey);
        } else {
          newSelection.add(vpaKey);
        }
        return newSelection;
      });
    } else if (!selectedVpas.has(vpaKey)) {
      // Clear selection on regular click (unless clicking on already selected VPA)
      setSelectedVpas(new Set());
      handleVpaDetails(vpa);
    } else {
      handleVpaDetails(vpa);
    }
  };

  // Add context menu handlers
  const handleContextMenu = (e: React.MouseEvent, vpa: V1VerticalPodAutoscaler) => {
    e.preventDefault();
    e.stopPropagation();

    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setActiveVpa(vpa);
    setShowContextMenu(true);

    // Multi-select support: if VPA isn't in selection, make it the only selection
    const vpaKey = `${vpa.metadata?.namespace}/${vpa.metadata?.name}`;
    if (!selectedVpas.has(vpaKey)) {
      setSelectedVpas(new Set([vpaKey]));
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

        if (isOutsideTable && !isContextMenuClick && !isAlertDialogClick && selectedVpas.size > 0) {
          setSelectedVpas(new Set());
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedVpas]);

  // Handle view action - only available for a single VPA
  const handleViewVpa = () => {
    setShowContextMenu(false);

    if (activeVpa && activeVpa.metadata?.name && activeVpa.metadata?.namespace) {
      navigate(`/dashboard/explore/verticalpodautoscalers/${activeVpa.metadata.namespace}/${activeVpa.metadata.name}`);
    }
  };

  const handleViewVpaMenuItem = (e: React.MouseEvent, vpa: V1VerticalPodAutoscaler) => {
    e.stopPropagation();
    if (vpa.metadata?.name && vpa.metadata?.namespace) {
      navigate(`/dashboard/explore/verticalpodautoscalers/${vpa.metadata.namespace}/${vpa.metadata.name}`);
    }
  };

  const handleDeleteVpaMenuItem = (e: React.MouseEvent, vpa: V1VerticalPodAutoscaler) => {
    e.stopPropagation();
    
    if (isReconMode) {
      toast({
        title: "Recon Mode",
        description: "This action can't be performed while recon mode is on. Disable recon mode to proceed.",
        variant: "recon"
      });
      return;
    }
    
    setActiveVpa(vpa);
    setSelectedVpas(new Set([`${vpa.metadata?.namespace}/${vpa.metadata?.name}`]));
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
  const deleteVpas = async () => {
    setShowDeleteDialog(false);

    try {
      if (selectedVpas.size === 0 && activeVpa) {
        // Delete single active VPA
        await deleteVpa(activeVpa);
      } else {
        // Delete all selected VPAs
        for (const vpaKey of selectedVpas) {
          const [namespace, name] = vpaKey.split('/');
          const vpaToDelete = vpas.find(v =>
            v.metadata?.namespace === namespace && v.metadata?.name === name
          );

          if (vpaToDelete) {
            await deleteVpa(vpaToDelete);
          }
        }
      }

      // Clear selection after deletion
      setSelectedVpas(new Set());

      // Refresh VPA list after deletion
      if (currentContext && selectedNamespaces.length > 0) {
        const fetchVpas = async () => {
          try {
            setLoading(true);

            // Fetch VPAs for each selected namespace
            const vpaPromises = selectedNamespaces.map(async (namespace) => {
              try {
                return await listResources(currentContext.name, 'verticalpodautoscalers', {
                  namespace,
                  apiGroup: 'autoscaling.k8s.io',
                  apiVersion: 'v1'
                });
              } catch (err) {
                console.warn(`Failed to fetch VPAs for namespace ${namespace}:`, err);
                return [];
              }
            });

            const results = await Promise.all(vpaPromises);
            const allVpas = results.flat();

            setVpas(allVpas);
            if (allVpas.length > 0) {
              setError(null);
            }
          } catch (err) {
            console.error('Failed to fetch vertical pod autoscalers:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch vertical pod autoscalers');
          } finally {
            setLoading(false);
          }
        };

        fetchVpas();
      }

    } catch (error) {
      console.error('Failed to delete VPA(s):', error);
      setError(error instanceof Error ? error.message : 'Failed to delete VPA(s)');
    }
  };

  // Delete VPA function
  const deleteVpa = async (vpa: V1VerticalPodAutoscaler) => {
    if (!currentContext || !vpa.metadata?.name || !vpa.metadata?.namespace) return;

    await deleteResource(
      currentContext.name,
      'verticalpodautoscalers',
      vpa.metadata.name,
      {
        namespace: vpa.metadata.namespace,
        apiGroup: 'autoscaling.k8s.io',
        apiVersion: 'v1'
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
          {selectedVpas.size > 1
            ? `${selectedVpas.size} VPAs selected`
            : activeVpa?.metadata?.name || 'VPA actions'}
        </div>

        <div
          className={`px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center ${selectedVpas.size > 1 ? 'text-gray-400 dark:text-gray-600 pointer-events-none' : ''}`}
          onClick={selectedVpas.size <= 1 ? handleViewVpa : undefined}
          title={selectedVpas.size > 1 ? "Select only one VPA to view" : ""}
        >
          <Eye className="h-4 w-4 mr-2" />
          View
        </div>

        <div
          className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center text-red-600 dark:text-red-400"
          onClick={handleDeleteClick}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete {selectedVpas.size > 1 ? `(${selectedVpas.size})` : ''}
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
            <AlertDialogTitle>Confirm VPA Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedVpas.size > 1
                ? `${selectedVpas.size} Vertical Pod Autoscalers`
                : `"${activeVpa?.metadata?.name}"`}?
              This action cannot be undone.

              <div className="mt-2 text-amber-600 dark:text-amber-400">
                Warning: Deleting Vertical Pod Autoscalers will stop automatic resource recommendations
                and adjustments for targeted workloads.
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteVpas}
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
    setColumnConfig(prev => {
      const updated = prev.map(col =>
        col.key === columnKey && col.canToggle !== false
          ? { ...col, visible }
          : col
      );
      // Save to localStorage
      saveColumnConfig('verticalpodautoscalers', updated);
      return updated;
    });
  };

  const handleResetToDefault = () => {
    const resetConfig = defaultColumnConfig.map(col => ({ ...col, visible: true }));
    setColumnConfig(resetConfig);
    // Clear from localStorage to use defaults
    clearColumnConfig('verticalpodautoscalers');
  };

  const isColumnVisible = (columnKey: string): boolean => {
    const column = columnConfig.find(col => col.key === columnKey);
    return column ? column.visible : true;
  };

  // Fetch VPAs for all selected namespaces
  useEffect(() => {
    const fetchAllVPAs = async () => {
      if (!currentContext || selectedNamespaces.length === 0) {
        setVpas([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // If no namespaces are selected, fetch from all namespaces
        let allVpas: V1VerticalPodAutoscaler[] = [];

        if (selectedNamespaces.length === 0) {
          try {
            const vpasData = await listResources(currentContext.name, 'verticalpodautoscalers', {
              apiGroup: 'autoscaling.k8s.io',
              apiVersion: 'v1'
            });
            allVpas = vpasData;
          } catch (err) {
            console.error('Failed to fetch VPAs:', err);
            setError('Failed to fetch Vertical Pod Autoscalers. VPA CRD might not be installed in the cluster.');
            allVpas = [];
          }
        } else {
          // Fetch VPAs for each selected namespace
          const vpaPromises = selectedNamespaces.map(async (namespace) => {
            try {
              return await listResources(currentContext.name, 'verticalpodautoscalers', {
                namespace,
                apiGroup: 'autoscaling.k8s.io',
                apiVersion: 'v1'
              });
            } catch (err) {
              console.warn(`Failed to fetch VPAs for namespace ${namespace}:`, err);
              return [];
            }
          });

          const results = await Promise.all(vpaPromises);
          allVpas = results.flat();
        }

        setVpas(allVpas);
        if (allVpas.length > 0) {
          setError(null);
        }
      } catch (err) {
        console.error('Failed to fetch vertical pod autoscalers:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch vertical pod autoscalers');
      } finally {
        setLoading(false);
      }
    };

    fetchAllVPAs();
  }, [currentContext, selectedNamespaces]);

  // Filter VPAs based on search query
  const filteredVpas = useMemo(() => {
    if (!searchQuery.trim()) {
      return vpas;
    }

    const lowercaseQuery = searchQuery.toLowerCase();

    return vpas.filter(vpa => {
      const name = vpa.metadata?.name?.toLowerCase() || '';
      const namespace = vpa.metadata?.namespace?.toLowerCase() || '';
      const targetKind = vpa.spec?.targetRef?.kind?.toLowerCase() || '';
      const targetName = vpa.spec?.targetRef?.name?.toLowerCase() || '';
      const updateMode = vpa.spec?.updatePolicy?.updateMode?.toLowerCase() || '';
      const labels = vpa.metadata?.labels || {};
      const annotations = vpa.metadata?.annotations || {};

      // Check if any container policy matches the query
      const policyMatches = (vpa.spec?.resourcePolicy?.containerPolicies || []).some(policy => {
        if (!policy) return false;
        const containerName = policy.containerName?.toLowerCase() || '';
        const mode = policy.mode?.toLowerCase() || '';

        return containerName.includes(lowercaseQuery) || mode.includes(lowercaseQuery);
      });

      // Check if any recommendation matches the query
      const recommendationMatches = (vpa.status?.recommendation?.containerRecommendations || []).some(rec => {
        if (!rec) return false;
        const containerName = rec.containerName?.toLowerCase() || '';
        return containerName.includes(lowercaseQuery);
      });

      // Check if any condition matches the query
      const conditionMatches = (vpa.status?.conditions || []).some(condition => {
        if (!condition) return false;
        const type = condition.type?.toLowerCase() || '';
        const status = condition.status?.toLowerCase() || '';
        const reason = condition.reason?.toLowerCase() || '';

        return type.includes(lowercaseQuery) ||
          status.includes(lowercaseQuery) ||
          reason.includes(lowercaseQuery);
      });

      // Check if name, namespace, target, or any constraint contains the query
      if (
        name.includes(lowercaseQuery) ||
        namespace.includes(lowercaseQuery) ||
        targetKind.includes(lowercaseQuery) ||
        targetName.includes(lowercaseQuery) ||
        updateMode.includes(lowercaseQuery) ||
        policyMatches ||
        recommendationMatches ||
        conditionMatches
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
  }, [vpas, searchQuery]);

  // Sort VPAs based on sort state
  const sortedVpas = useMemo(() => {
    if (!sort.field || !sort.direction) {
      return filteredVpas;
    }

    return [...filteredVpas].sort((a, b) => {
      const sortMultiplier = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'name':
          return (a.metadata?.name || '').localeCompare(b.metadata?.name || '') * sortMultiplier;

        case 'namespace':
          return (a.metadata?.namespace || '').localeCompare(b.metadata?.namespace || '') * sortMultiplier;

        case 'target': {
          const targetA = `${a.spec?.targetRef?.kind || ''}/${a.spec?.targetRef?.name || ''}`;
          const targetB = `${b.spec?.targetRef?.kind || ''}/${b.spec?.targetRef?.name || ''}`;
          return targetA.localeCompare(targetB) * sortMultiplier;
        }

        case 'mode': {
          const modeA = a.spec?.updatePolicy?.updateMode || 'Auto';
          const modeB = b.spec?.updatePolicy?.updateMode || 'Auto';
          return modeA.localeCompare(modeB) * sortMultiplier;
        }

        case 'conditions': {
          // Sort by "Ready" condition status
          const getReadyStatus = (vpa: V1VerticalPodAutoscaler): string => {
            const readyCondition = (vpa.status?.conditions || []).find(c => c?.type === 'Ready');
            return readyCondition?.status || 'Unknown';
          };

          const statusA = getReadyStatus(a);
          const statusB = getReadyStatus(b);

          // True before False before Unknown
          if (statusA === statusB) return 0;
          if (statusA === 'True') return -1 * sortMultiplier;
          if (statusB === 'True') return 1 * sortMultiplier;
          if (statusA === 'False') return -1 * sortMultiplier;
          if (statusB === 'False') return 1 * sortMultiplier;
          return 0;
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
  }, [filteredVpas, sort.field, sort.direction]);

  const handleVpaDetails = (vpa: V1VerticalPodAutoscaler) => {
    if (vpa.metadata?.name && vpa.metadata?.namespace) {
      navigate(`/dashboard/explore/verticalpodautoscalers/${vpa.metadata.namespace}/${vpa.metadata.name}`);
    }
  };

  // Format target reference
  const formatTargetRef = (vpa: V1VerticalPodAutoscaler): JSX.Element => {
    const kind = vpa.spec?.targetRef?.kind || '';
    const name = vpa.spec?.targetRef?.name || '';

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


  // Format update mode
  const formatUpdateMode = (vpa: V1VerticalPodAutoscaler): JSX.Element => {
    const mode = vpa.spec?.updatePolicy?.updateMode || 'Auto';

    let colorClass = 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300';

    switch (mode) {
      case 'Off':
        colorClass = 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
        break;
      case 'Initial':
        colorClass = 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300';
        break;
      case 'Recreate':
        colorClass = 'bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300';
        break;
      case 'Auto':
      default:
        colorClass = 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300';
        break;
    }

    return (
      <div className="flex items-center justify-center">
        <span className={`px-2 py-1 rounded-[0.3rem] text-xs font-medium ${colorClass}`}>
          {mode}
        </span>
      </div>
    );
  };

  // Format conditions
  const formatConditions = (vpa: V1VerticalPodAutoscaler): JSX.Element => {
    const conditions = vpa.status?.conditions || [];

    if (conditions.length === 0) {
      return <span className="text-gray-500 dark:text-gray-400">No conditions</span>;
    }

    // Get ready condition
    const readyCondition = conditions.find(c => c.type === 'Ready');

    // Get recommendation condition
    const recCondition = conditions.find(c => c.type === 'RecommendationProvided');

    return (
      <div className="space-y-1">
        {readyCondition && (
          <div className="flex items-center">
            <span className="font-medium mr-2">Ready:</span>
            <span className={`text-sm ${readyCondition.status === 'True'
              ? 'text-green-600 dark:text-green-400'
              : 'text-red-600 dark:text-red-400'
              }`}>
              {readyCondition.status}
            </span>
          </div>
        )}

        {recCondition && (
          <div className="flex items-center">
            <span className="font-medium mr-2">Recommendation:</span>
            <span className={`text-sm ${recCondition.status === 'True'
              ? 'text-green-600 dark:text-green-400'
              : 'text-red-600 dark:text-red-400'
              }`}>
              {recCondition.status}
            </span>
          </div>
        )}

        {/* Show count of other conditions if there are more */}
        {conditions.length > 2 && (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            +{conditions.length - 2} more conditions
          </div>
        )}
      </div>
    );
  };

  // Format recommendations
  const formatRecommendations = (vpa: V1VerticalPodAutoscaler): JSX.Element => {
    const recommendations = vpa.status?.recommendation?.containerRecommendations || [];

    if (recommendations.length === 0) {
      return <span className="text-gray-500 dark:text-gray-400">No recommendations</span>;
    }

    return (
      <div className="space-y-2">
        {recommendations.slice(0, 2).map((rec, index) => (
          <div key={index} className="space-y-1">
            <div className="text-sm font-medium">{rec.containerName}</div>
            {rec.target && (
              <div className="flex flex-col text-xs pl-2">
                {Object.entries(rec.target).map(([resource, value]) => (
                  <div key={resource} className="flex justify-between">
                    <span className="font-medium">{resource}:</span>
                    <span className="text-green-600 dark:text-green-400">{value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {recommendations.length > 2 && (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            +{recommendations.length - 2} more containers
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
          <h1 className='text-5xl font-[Anton] uppercase font-bold text-gray-800/30 dark:text-gray-700/50'>Vertical Pod Autoscalers</h1>
          <div className="w-full md:w-96 mt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
              <Input
                type="text"
                placeholder="Search by name, namespace, target, or mode..."
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

      {/* Special note about VPA being a CRD */}
      {vpas.length === 0 && (
        <Alert className="my-6 bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <AlertDescription>
            {searchQuery
              ? `No vertical pod autoscalers matching "${searchQuery}"`
              : selectedNamespaces.length === 0
                ? "Please select at least one namespace"
                : "No vertical pod autoscalers found. VPA is not part of standard Kubernetes and requires the VPA controller to be installed in your cluster."}
          </AlertDescription>
        </Alert>
      )}

      {/* VPA table */}
      {vpas.length > 0 && (
        <Card className="bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <div className="rounded-md border">
            {renderContextMenu()}
            {renderDeleteDialog()}
            <Table className="bg-gray-50 dark:bg-transparent rounded-2xl">
              <TableHeader>
                <TableRow className="border-b border-gray-400 dark:border-gray-800/80">
                  {isColumnVisible('name') && (
                    <TableHead
                      className="cursor-pointer hover:text-blue-500"
                      onClick={() => handleSort('name')}
                    >
                      Name {renderSortIndicator('name')}
                    </TableHead>
                  )}
                  {isColumnVisible('namespace') && (
                    <TableHead
                      className="cursor-pointer hover:text-blue-500"
                      onClick={() => handleSort('namespace')}
                    >
                      Namespace {renderSortIndicator('namespace')}
                    </TableHead>
                  )}
                  {isColumnVisible('target') && (
                    <TableHead
                      className="cursor-pointer hover:text-blue-500"
                      onClick={() => handleSort('target')}
                    >
                      Target {renderSortIndicator('target')}
                    </TableHead>
                  )}
                  {isColumnVisible('mode') && (
                    <TableHead
                      className="text-center cursor-pointer hover:text-blue-500"
                      onClick={() => handleSort('mode')}
                    >
                      Mode {renderSortIndicator('mode')}
                    </TableHead>
                  )}
                  {isColumnVisible('conditions') && (
                    <TableHead
                      className="cursor-pointer hover:text-blue-500"
                      onClick={() => handleSort('conditions')}
                    >
                      Conditions {renderSortIndicator('conditions')}
                    </TableHead>
                  )}
                  {isColumnVisible('recommendations') && (
                    <TableHead>
                      Recommendations
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
                  {isColumnVisible('actions') && (
                    <TableHead className="w-[50px]"></TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedVpas.map((vpa) => (
                  <TableRow
                    key={`${vpa.metadata?.namespace}-${vpa.metadata?.name}`}
                    className={`bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30 ${selectedVpas.has(`${vpa.metadata?.namespace}/${vpa.metadata?.name}`) ? 'bg-blue-50 dark:bg-gray-800/30' : ''
                      }`}
                    onClick={(e) => handleVpaClick(e, vpa)}
                    onContextMenu={(e) => handleContextMenu(e, vpa)}
                  >
                    {isColumnVisible('name') && (
                      <TableCell className="font-medium" onClick={() => handleVpaDetails(vpa)}>
                        <div className="hover:text-blue-500 hover:underline">
                          {vpa.metadata?.name}
                        </div>
                      </TableCell>
                    )}
                    {isColumnVisible('namespace') && (
                      <TableCell>
                        <div className="hover:text-blue-500 hover:underline" onClick={() => navigate(`/dashboard/explore/namespaces`)}>
                          {vpa.metadata?.namespace}
                        </div>
                      </TableCell>
                    )}
                    {isColumnVisible('target') && (
                      <TableCell>
                        {formatTargetRef(vpa)}
                      </TableCell>
                    )}
                    {isColumnVisible('mode') && (
                      <TableCell className="text-center">
                        {formatUpdateMode(vpa)}
                      </TableCell>
                    )}
                    {isColumnVisible('conditions') && (
                      <TableCell>
                        {formatConditions(vpa)}
                      </TableCell>
                    )}
                    {isColumnVisible('recommendations') && (
                      <TableCell>
                        {formatRecommendations(vpa)}
                      </TableCell>
                    )}
                    {isColumnVisible('age') && (
                      <TableCell className="text-center">
                        {calculateAge(vpa.metadata?.creationTimestamp?.toString())}
                      </TableCell>
                    )}
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
                        <DropdownMenuContent align="end" className='dark:bg-[#0B0D13]/40 backdrop-blur-sm text-gray-800 dark:text-gray-300'>
                          <DropdownMenuItem onClick={(e) => handleViewVpaMenuItem(e, vpa)} className='hover:text-gray-700 dark:hover:text-gray-500'>
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-500 dark:text-red-400 focus:text-red-500 dark:focus:text-red-400 hover:text-red-700 dark:hover:text-red-500"
                            onClick={(e) => handleDeleteVpaMenuItem(e, vpa)}
                          >
                            <Trash className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      </TableCell>
                    )}
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
        title="Vertical Pod Autoscalers Table"
        columns={columnConfig}
        onColumnToggle={handleColumnToggle}
        onResetToDefault={handleResetToDefault}
        resourceType="verticalpodautoscalers"
      />
    </div>
  );
};

export default VerticalPodAutoscalers;