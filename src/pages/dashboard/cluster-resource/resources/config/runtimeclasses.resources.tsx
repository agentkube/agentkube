import React, { useState, useEffect, useMemo } from 'react';
import { listResources } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, MoreVertical, Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from 'react-router-dom';
import { calculateAge } from '@/utils/age';
import { ErrorComponent } from '@/components/custom';
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

// Define types for RuntimeClass
interface Overhead {
  podFixed?: { [key: string]: string };
}

interface Scheduling {
  nodeSelector?: { [key: string]: string };
  tolerations?: Array<{
    key?: string;
    operator?: string;
    effect?: string;
    value?: string;
    tolerationSeconds?: number;
  }>;
}

interface V1RuntimeClass {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    creationTimestamp?: string;
    labels?: { [key: string]: string };
    annotations?: { [key: string]: string };
    generation?: number;
  };
  handler: string;
  overhead?: Overhead;
  scheduling?: Scheduling;
}

// Define sorting types
type SortDirection = 'asc' | 'desc' | null;
type SortField = 'name' | 'handler' | 'overhead' | 'scheduling' | 'age' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

const RuntimeClasses: React.FC = () => {
  const navigate = useNavigate();
  const { currentContext } = useCluster();
  const [runtimeClasses, setRuntimeClasses] = useState<V1RuntimeClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const { isReconMode } = useReconMode();
  // --- Start of Multi-select ---
  const [selectedRuntimeClasses, setSelectedRuntimeClasses] = useState<Set<string>>(new Set());
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [activeRuntimeClass, setActiveRuntimeClass] = useState<V1RuntimeClass | null>(null);
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

  // Add click handler for RuntimeClass selection with cmd/ctrl key
  const handleRuntimeClassClick = (e: React.MouseEvent, runtimeClass: V1RuntimeClass) => {
    const runtimeClassKey = runtimeClass.metadata?.name || '';

    if (e.metaKey || e.ctrlKey) {
      // Prevent navigation when using multi-select
      e.preventDefault();
      e.stopPropagation();

      setSelectedRuntimeClasses(prev => {
        const newSelection = new Set(prev);
        if (newSelection.has(runtimeClassKey)) {
          newSelection.delete(runtimeClassKey);
        } else {
          newSelection.add(runtimeClassKey);
        }
        return newSelection;
      });
    } else if (!selectedRuntimeClasses.has(runtimeClassKey)) {
      // Clear selection on regular click (unless clicking on already selected runtimeClass)
      setSelectedRuntimeClasses(new Set());
      handleRuntimeClassDetails(runtimeClass);
    } else {
      handleRuntimeClassDetails(runtimeClass);
    }
  };

  // Add context menu handlers
  const handleContextMenu = (e: React.MouseEvent, runtimeClass: V1RuntimeClass) => {
    e.preventDefault();
    e.stopPropagation();

    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setActiveRuntimeClass(runtimeClass);
    setShowContextMenu(true);

    // Multi-select support: if runtimeClass isn't in selection, make it the only selection
    const runtimeClassKey = runtimeClass.metadata?.name || '';
    if (!selectedRuntimeClasses.has(runtimeClassKey)) {
      setSelectedRuntimeClasses(new Set([runtimeClassKey]));
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

        if (isOutsideTable && !isContextMenuClick && !isAlertDialogClick && selectedRuntimeClasses.size > 0) {
          setSelectedRuntimeClasses(new Set());
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedRuntimeClasses]);

  // Handle view action - only available for a single RuntimeClass
  const handleViewRuntimeClass = () => {
    setShowContextMenu(false);

    if (activeRuntimeClass && activeRuntimeClass.metadata?.name) {
      navigate(`/dashboard/explore/runtimeclasses/${activeRuntimeClass.metadata.name}`);
    }
  };

  // Helper function for dropdown menu actions
  const handleViewRuntimeClassMenuItem = (e: React.MouseEvent, runtimeClass: V1RuntimeClass) => {
    e.stopPropagation();
    if (runtimeClass.metadata?.name) {
      navigate(`/dashboard/explore/runtimeclasses/${runtimeClass.metadata.name}`);
    }
  };

  const handleDeleteRuntimeClassMenuItem = (e: React.MouseEvent, runtimeClass: V1RuntimeClass) => {
    e.stopPropagation();
    if (isReconMode) {
      toast({
        title: "Recon Mode",
        description: "This action can't be performed while recon mode is on. Disable recon mode to proceed.",
        variant: "recon"
      });
      return;
    }

    setActiveRuntimeClass(runtimeClass);
    setSelectedRuntimeClasses(new Set([runtimeClass.metadata?.name || '']));
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
  const deleteRuntimeClasses = async () => {
    setShowDeleteDialog(false);

    try {
      if (selectedRuntimeClasses.size === 0 && activeRuntimeClass) {
        // Delete single active RuntimeClass
        await deleteRuntimeClass(activeRuntimeClass);
      } else {
        // Delete all selected RuntimeClasses
        for (const runtimeClassName of selectedRuntimeClasses) {
          const runtimeClassToDelete = runtimeClasses.find(rc => rc.metadata?.name === runtimeClassName);

          if (runtimeClassToDelete) {
            await deleteRuntimeClass(runtimeClassToDelete);
          }
        }
      }

      // Clear selection after deletion
      setSelectedRuntimeClasses(new Set());

      // Refresh RuntimeClass list after deletion
      if (currentContext) {
        const fetchRuntimeClasses = async () => {
          try {
            setLoading(true);

            // Try v1 API first
            try {
              const runtimeClassesData = await listResources(currentContext.name, 'runtimeclasses', {
                apiGroup: 'node.k8s.io',
                apiVersion: 'v1'
              });
              setRuntimeClasses(runtimeClassesData);
            } catch (err) {
              // Fallback to v1beta1
              try {
                const runtimeClassesData = await listResources(currentContext.name, 'runtimeclasses', {
                  apiGroup: 'node.k8s.io',
                  apiVersion: 'v1beta1'
                });
                setRuntimeClasses(runtimeClassesData);
              } catch (fallbackErr) {
                console.error('Failed to fetch RuntimeClasses:', fallbackErr);
                setError('Failed to fetch RuntimeClasses. Your cluster may not support this resource type.');
                setRuntimeClasses([]);
              }
            }

            setError(null);
          } catch (err) {
            console.error('Failed to fetch runtime classes:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch runtime classes');
          } finally {
            setLoading(false);
          }
        };

        fetchRuntimeClasses();
      }

    } catch (error) {
      console.error('Failed to delete RuntimeClass(es):', error);
      setError(error instanceof Error ? error.message : 'Failed to delete RuntimeClass(es)');
    }
  };

  // Delete RuntimeClass function
  const deleteRuntimeClass = async (runtimeClass: V1RuntimeClass) => {
    if (!currentContext || !runtimeClass.metadata?.name) return;

    // Determine API version based on runtimeClass's apiVersion field
    const apiVersion = runtimeClass.apiVersion?.includes('v1beta1') ? 'v1beta1' : 'v1';

    await deleteResource(
      currentContext.name,
      'runtimeclasses',
      runtimeClass.metadata.name,
      {
        apiGroup: 'node.k8s.io',
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
        className="fixed z-50 min-w-[180px] bg-white dark:bg-[#0B0D13] backdrop-blur-sm rounded-md shadow-lg border border-gray-300 dark:border-gray-800/60 py-1 text-sm"
        style={{
          left: `${contextMenuPosition.x}px`,
          top: shouldShowAbove
            ? `${contextMenuPosition.y - menuHeight}px`
            : `${contextMenuPosition.y}px`,
        }}
      >
        <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 font-medium border-b border-gray-200 dark:border-gray-800/60">
          {selectedRuntimeClasses.size > 1
            ? `${selectedRuntimeClasses.size} RuntimeClasses selected`
            : activeRuntimeClass?.metadata?.name || 'RuntimeClass actions'}
        </div>

        <div
          className={`px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center ${selectedRuntimeClasses.size > 1 ? 'text-gray-400 dark:text-gray-600 pointer-events-none' : ''}`}
          onClick={selectedRuntimeClasses.size <= 1 ? handleViewRuntimeClass : undefined}
          title={selectedRuntimeClasses.size > 1 ? "Select only one RuntimeClass to view" : ""}
        >
          <Eye className="h-4 w-4 mr-2" />
          View
        </div>

        <div
          className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center text-red-600 dark:text-red-400"
          onClick={handleDeleteClick}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete {selectedRuntimeClasses.size > 1 ? `(${selectedRuntimeClasses.size})` : ''}
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
            <AlertDialogTitle>Confirm RuntimeClass Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedRuntimeClasses.size > 1
                ? `${selectedRuntimeClasses.size} RuntimeClasses`
                : `"${activeRuntimeClass?.metadata?.name}"`}?
              This action cannot be undone.

              <div className="mt-2 text-amber-600 dark:text-amber-400">
                Warning: Deleting RuntimeClasses may impact pods that reference them.
                Pods that specify a deleted RuntimeClass will fail to schedule.
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteRuntimeClasses}
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
    field: 'name',
    direction: 'asc'
  });

  // Fetch RuntimeClasses (these are cluster-scoped resources)
  useEffect(() => {
    const fetchRuntimeClasses = async () => {
      if (!currentContext) {
        setRuntimeClasses([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Try v1 API first
        try {
          const runtimeClassesData = await listResources(currentContext.name, 'runtimeclasses', {
            apiGroup: 'node.k8s.io',
            apiVersion: 'v1'
          });
          setRuntimeClasses(runtimeClassesData);
        } catch (err) {
          console.warn('Failed to fetch RuntimeClasses with node.k8s.io/v1, falling back to v1beta1:', err);

          // Fallback to v1beta1
          try {
            const runtimeClassesData = await listResources(currentContext.name, 'runtimeclasses', {
              apiGroup: 'node.k8s.io',
              apiVersion: 'v1beta1'
            });
            setRuntimeClasses(runtimeClassesData);
          } catch (fallbackErr) {
            console.error('Failed to fetch RuntimeClasses:', fallbackErr);
            setError('Failed to fetch RuntimeClasses. Your cluster may not support this resource type.');
            setRuntimeClasses([]);
          }
        }

        setError(null);
      } catch (err) {
        console.error('Failed to fetch runtime classes:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch runtime classes');
      } finally {
        setLoading(false);
      }
    };

    fetchRuntimeClasses();
  }, [currentContext]);

  // Filter RuntimeClasses based on search query
  const filteredRuntimeClasses = useMemo(() => {
    if (!searchQuery.trim()) {
      return runtimeClasses;
    }

    const lowercaseQuery = searchQuery.toLowerCase();

    return runtimeClasses.filter(rc => {
      const name = rc.metadata?.name?.toLowerCase() || '';
      const handler = rc.handler.toLowerCase();
      const labels = rc.metadata?.labels || {};
      const annotations = rc.metadata?.annotations || {};

      // Check nodeSelector if present
      let nodeSelectorString = '';
      if (rc.scheduling?.nodeSelector) {
        nodeSelectorString = Object.entries(rc.scheduling.nodeSelector)
          .map(([k, v]) => `${k}=${v}`)
          .join(',')
          .toLowerCase();
      }

      // Check tolerations if present
      let tolerationsString = '';
      if (rc.scheduling?.tolerations) {
        tolerationsString = rc.scheduling.tolerations
          .map(toleration => {
            const key = toleration.key || '';
            const value = toleration.value || '';
            const operator = toleration.operator || '';
            const effect = toleration.effect || '';
            return `${key}:${value}:${operator}:${effect}`;
          })
          .join(',')
          .toLowerCase();
      }

      // Check overhead if present
      let overheadString = '';
      if (rc.overhead?.podFixed) {
        overheadString = Object.entries(rc.overhead.podFixed)
          .map(([k, v]) => `${k}=${v}`)
          .join(',')
          .toLowerCase();
      }

      // Check if name, handler, nodeSelector, tolerations, or overhead contains the query
      if (
        name.includes(lowercaseQuery) ||
        handler.includes(lowercaseQuery) ||
        nodeSelectorString.includes(lowercaseQuery) ||
        tolerationsString.includes(lowercaseQuery) ||
        overheadString.includes(lowercaseQuery)
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
  }, [runtimeClasses, searchQuery]);

  // Sort RuntimeClasses based on sort state
  const sortedRuntimeClasses = useMemo(() => {
    if (!sort.field || !sort.direction) {
      return filteredRuntimeClasses;
    }

    return [...filteredRuntimeClasses].sort((a, b) => {
      const sortMultiplier = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'name':
          return (a.metadata?.name || '').localeCompare(b.metadata?.name || '') * sortMultiplier;

        case 'handler':
          return a.handler.localeCompare(b.handler) * sortMultiplier;

        case 'overhead': {
          const hasOverheadA = Boolean(a.overhead && a.overhead.podFixed && Object.keys(a.overhead.podFixed).length > 0);
          const hasOverheadB = Boolean(b.overhead && b.overhead.podFixed && Object.keys(b.overhead.podFixed).length > 0);

          // Sort by whether they have overhead defined
          if (hasOverheadA !== hasOverheadB) {
            return (hasOverheadA ? -1 : 1) * sortMultiplier;
          }

          // If both have overhead, sort by the count of resources
          if (hasOverheadA && hasOverheadB) {
            const countA = Object.keys(a.overhead!.podFixed!).length;
            const countB = Object.keys(b.overhead!.podFixed!).length;
            return (countA - countB) * sortMultiplier;
          }

          return 0;
        }

        case 'scheduling': {
          const hasSchedulingA = Boolean(a.scheduling);
          const hasSchedulingB = Boolean(b.scheduling);

          // Sort by whether they have scheduling defined
          if (hasSchedulingA !== hasSchedulingB) {
            return (hasSchedulingA ? -1 : 1) * sortMultiplier;
          }

          // If both have scheduling, sort by complexity (nodeSelector + tolerations)
          if (hasSchedulingA && hasSchedulingB) {
            const nodeSelectorCountA = a.scheduling!.nodeSelector ? Object.keys(a.scheduling!.nodeSelector).length : 0;
            const nodeSelectorCountB = b.scheduling!.nodeSelector ? Object.keys(b.scheduling!.nodeSelector).length : 0;
            const tolerationsCountA = a.scheduling!.tolerations ? a.scheduling!.tolerations.length : 0;
            const tolerationsCountB = b.scheduling!.tolerations ? b.scheduling!.tolerations.length : 0;

            const complexityA = nodeSelectorCountA + tolerationsCountA;
            const complexityB = nodeSelectorCountB + tolerationsCountB;

            return (complexityA - complexityB) * sortMultiplier;
          }

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
  }, [filteredRuntimeClasses, sort.field, sort.direction]);

  const handleRuntimeClassDetails = (runtimeClass: V1RuntimeClass) => {
    if (runtimeClass.metadata?.name) {
      navigate(`/dashboard/explore/runtimeclasses/${runtimeClass.metadata.name}`);
    }
  };

  // Format handler for display
  const formatHandler = (runtimeClass: V1RuntimeClass): JSX.Element => {
    return (
      <div className="flex items-center">
        <span className="px-2 py-1 rounded-[0.3rem] text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
          {runtimeClass.handler}
        </span>
      </div>
    );
  };

  // Format overhead for display
  const formatOverhead = (runtimeClass: V1RuntimeClass): JSX.Element => {
    if (!runtimeClass.overhead || !runtimeClass.overhead.podFixed || Object.keys(runtimeClass.overhead.podFixed).length === 0) {
      return <span className="text-gray-500 dark:text-gray-400">None</span>;
    }

    return (
      <div className="space-y-1">
        {Object.entries(runtimeClass.overhead.podFixed).map(([resource, value]) => (
          <div key={resource} className="flex justify-between">
            <span className="text-sm font-medium">{resource}:</span>
            <span className="text-sm">{value}</span>
          </div>
        ))}
      </div>
    );
  };

  // Format scheduling for display
  const formatScheduling = (runtimeClass: V1RuntimeClass): JSX.Element => {
    if (!runtimeClass.scheduling) {
      return <span className="text-gray-500 dark:text-gray-400">None</span>;
    }

    const { nodeSelector, tolerations } = runtimeClass.scheduling;
    const hasNodeSelector = nodeSelector && Object.keys(nodeSelector).length > 0;
    const hasTolerations = tolerations && tolerations.length > 0;

    if (!hasNodeSelector && !hasTolerations) {
      return <span className="text-gray-500 dark:text-gray-400">Empty</span>;
    }

    return (
      <div className="space-y-2">
        {hasNodeSelector && (
          <div>
            <div className="text-xs font-medium mb-1">Node Selector:</div>
            <div className="space-y-1">
              {Object.entries(nodeSelector!).slice(0, 2).map(([key, value]) => (
                <div key={key} className="flex items-center">
                  <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300 mr-1">
                    {key}
                  </span>
                  <span className="text-xs">
                    = {value}
                  </span>
                </div>
              ))}
              {Object.keys(nodeSelector!).length > 2 && (
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  +{Object.keys(nodeSelector!).length - 2} more
                </div>
              )}
            </div>
          </div>
        )}

        {hasTolerations && (
          <div>
            <div className="text-xs font-medium mb-1">Tolerations:</div>
            <div className="text-xs">
              {tolerations!.length} {tolerations!.length === 1 ? 'toleration' : 'tolerations'}
            </div>
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
      <div>
        <h1 className='text-5xl font-[Anton] uppercase font-bold text-gray-800/30 dark:text-gray-700/50'>Runtime Classes</h1>
        <div className="w-full md:w-96 mt-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
            <Input
              type="text"
              placeholder="Search by name, handler, or scheduling..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
      </div>

      {/* No results message */}
      {sortedRuntimeClasses.length === 0 && (
        <Alert className="my-6 bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <AlertDescription>
            {searchQuery
              ? `No runtime classes matching "${searchQuery}"`
              : "No runtime classes found in the cluster."}
          </AlertDescription>
        </Alert>
      )}

      {/* RuntimeClass table */}
      {sortedRuntimeClasses.length > 0 && (
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
                    onClick={() => handleSort('handler')}
                  >
                    Handler {renderSortIndicator('handler')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('overhead')}
                  >
                    Overhead {renderSortIndicator('overhead')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('scheduling')}
                  >
                    Scheduling {renderSortIndicator('scheduling')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('age')}
                  >
                    Age {renderSortIndicator('age')}
                  </TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRuntimeClasses.map((runtimeClass) => (
                  <TableRow
                    key={runtimeClass.metadata?.name}
                    className={`bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30 ${selectedRuntimeClasses.has(runtimeClass.metadata?.name || '') ? 'bg-blue-50 dark:bg-gray-800/30' : ''
                      }`}
                    onClick={(e) => handleRuntimeClassClick(e, runtimeClass)}
                    onContextMenu={(e) => handleContextMenu(e, runtimeClass)}
                  >
                    <TableCell className="font-medium" onClick={() => handleRuntimeClassDetails(runtimeClass)}>
                      <div className="hover:text-blue-500 hover:underline">
                        {runtimeClass.metadata?.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      {formatHandler(runtimeClass)}
                    </TableCell>
                    <TableCell>
                      {formatOverhead(runtimeClass)}
                    </TableCell>
                    <TableCell>
                      {formatScheduling(runtimeClass)}
                    </TableCell>
                    <TableCell className="text-center">
                      {calculateAge(runtimeClass.metadata?.creationTimestamp?.toString())}
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
                        <DropdownMenuContent align="end" className='dark:bg-[#0B0D13]/40 backdrop-blur-sm text-gray-800 dark:text-gray-300'>
                          <DropdownMenuItem onClick={(e) => handleViewRuntimeClassMenuItem(e, runtimeClass)} className='hover:text-gray-700 dark:hover:text-gray-500'>
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-500 dark:text-red-400 focus:text-red-500 dark:focus:text-red-400 hover:text-red-700 dark:hover:text-red-500"
                            onClick={(e) => handleDeleteRuntimeClassMenuItem(e, runtimeClass)}
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

export default RuntimeClasses;