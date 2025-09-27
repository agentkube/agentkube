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

// Define types for PriorityClass
interface V1PriorityClass {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    creationTimestamp?: string;
    labels?: { [key: string]: string };
    annotations?: { [key: string]: string };
  };
  value: number;
  globalDefault?: boolean;
  description?: string;
  preemptionPolicy?: string; // "Never" or "PreemptLowerPriority"
}

// Define sorting types
type SortDirection = 'asc' | 'desc' | null;
type SortField = 'name' | 'value' | 'default' | 'preemption' | 'age' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

const PriorityClasses: React.FC = () => {
  const navigate = useNavigate();
  const { currentContext } = useCluster();
  const [priorityClasses, setPriorityClasses] = useState<V1PriorityClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const { isReconMode } = useReconMode();

  // --- Start of Multi-select ---
  const [selectedPriorityClasses, setSelectedPriorityClasses] = useState<Set<string>>(new Set());
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [activePriorityClass, setActivePriorityClass] = useState<V1PriorityClass | null>(null);
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

  // Add click handler for PriorityClass selection with cmd/ctrl key
  const handlePriorityClassClick = (e: React.MouseEvent, priorityClass: V1PriorityClass) => {
    const priorityClassKey = priorityClass.metadata?.name || '';

    if (e.metaKey || e.ctrlKey) {
      // Prevent navigation when using multi-select
      e.preventDefault();
      e.stopPropagation();

      setSelectedPriorityClasses(prev => {
        const newSelection = new Set(prev);
        if (newSelection.has(priorityClassKey)) {
          newSelection.delete(priorityClassKey);
        } else {
          newSelection.add(priorityClassKey);
        }
        return newSelection;
      });
    } else if (!selectedPriorityClasses.has(priorityClassKey)) {
      // Clear selection on regular click (unless clicking on already selected priorityClass)
      setSelectedPriorityClasses(new Set());
      handlePriorityClassDetails(priorityClass);
    } else {
      handlePriorityClassDetails(priorityClass);
    }
  };

  // Add context menu handlers
  const handleContextMenu = (e: React.MouseEvent, priorityClass: V1PriorityClass) => {
    e.preventDefault();
    e.stopPropagation();

    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setActivePriorityClass(priorityClass);
    setShowContextMenu(true);

    // Multi-select support: if priorityClass isn't in selection, make it the only selection
    const priorityClassKey = priorityClass.metadata?.name || '';
    if (!selectedPriorityClasses.has(priorityClassKey)) {
      setSelectedPriorityClasses(new Set([priorityClassKey]));
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

        if (isOutsideTable && !isContextMenuClick && !isAlertDialogClick && selectedPriorityClasses.size > 0) {
          setSelectedPriorityClasses(new Set());
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedPriorityClasses]);

  // Handle view action - only available for a single PriorityClass
  const handleViewPriorityClass = () => {
    setShowContextMenu(false);

    if (activePriorityClass && activePriorityClass.metadata?.name) {
      navigate(`/dashboard/explore/priorityclasses/${activePriorityClass.metadata.name}`);
    }
  };

  const handleViewPriorityClassMenuItem = (e: React.MouseEvent, priorityClass: V1PriorityClass) => {
    e.stopPropagation();
    if (priorityClass.metadata?.name) {
      navigate(`/dashboard/explore/priorityclasses/${priorityClass.metadata.name}`);
    }
  };

  const handleDeletePriorityClassMenuItem = (e: React.MouseEvent, priorityClass: V1PriorityClass) => {
    e.stopPropagation();
    if (isReconMode) {
      toast({
        title: "Recon Mode",
        description: "This action can't be performed while recon mode is on. Disable recon mode to proceed.",
        variant: "recon"
      });
      return;
    }

    setActivePriorityClass(priorityClass);
    setSelectedPriorityClasses(new Set([priorityClass.metadata?.name || '']));
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
  const deletePriorityClasses = async () => {
    setShowDeleteDialog(false);

    try {
      if (selectedPriorityClasses.size === 0 && activePriorityClass) {
        // Delete single active PriorityClass
        await deletePriorityClass(activePriorityClass);
      } else {
        // Delete all selected PriorityClasses
        for (const priorityClassName of selectedPriorityClasses) {
          const priorityClassToDelete = priorityClasses.find(pc => pc.metadata?.name === priorityClassName);

          if (priorityClassToDelete) {
            await deletePriorityClass(priorityClassToDelete);
          }
        }
      }

      // Clear selection after deletion
      setSelectedPriorityClasses(new Set());

      // Refresh PriorityClass list after deletion
      if (currentContext) {
        const fetchPriorityClasses = async () => {
          try {
            setLoading(true);

            // Try v1 API first
            try {
              const priorityClassesData = await listResources(currentContext.name, 'priorityclasses', {
                apiGroup: 'scheduling.k8s.io',
                apiVersion: 'v1'
              });
              setPriorityClasses(priorityClassesData);
            } catch (err) {
              // Fallback to v1alpha1 (for older clusters)
              try {
                const priorityClassesData = await listResources(currentContext.name, 'priorityclasses', {
                  apiGroup: 'scheduling.k8s.io',
                  apiVersion: 'v1alpha1'
                });
                setPriorityClasses(priorityClassesData);
              } catch (fallbackErr) {
                console.error('Failed to fetch PriorityClasses:', fallbackErr);
                setError('Failed to fetch PriorityClasses. Your cluster may not support this resource type.');
                setPriorityClasses([]);
              }
            }

            setError(null);
          } catch (err) {
            console.error('Failed to fetch priority classes:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch priority classes');
          } finally {
            setLoading(false);
          }
        };

        fetchPriorityClasses();
      }

    } catch (error) {
      console.error('Failed to delete PriorityClass(es):', error);
      setError(error instanceof Error ? error.message : 'Failed to delete PriorityClass(es)');
    }
  };

  // Delete PriorityClass function
  const deletePriorityClass = async (priorityClass: V1PriorityClass) => {
    if (!currentContext || !priorityClass.metadata?.name) return;

    // Determine API version based on priorityClass's apiVersion field
    const apiVersion = priorityClass.apiVersion?.includes('v1alpha1') ? 'v1alpha1' : 'v1';

    await deleteResource(
      currentContext.name,
      'priorityclasses',
      priorityClass.metadata.name,
      {
        apiGroup: 'scheduling.k8s.io',
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
          {selectedPriorityClasses.size > 1
            ? `${selectedPriorityClasses.size} PriorityClasses selected`
            : activePriorityClass?.metadata?.name || 'PriorityClass actions'}
        </div>

        <div
          className={`px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center ${selectedPriorityClasses.size > 1 ? 'text-gray-400 dark:text-gray-600 pointer-events-none' : ''}`}
          onClick={selectedPriorityClasses.size <= 1 ? handleViewPriorityClass : undefined}
          title={selectedPriorityClasses.size > 1 ? "Select only one PriorityClass to view" : ""}
        >
          <Eye className="h-4 w-4 mr-2" />
          View
        </div>

        <div
          className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center text-red-600 dark:text-red-400"
          onClick={handleDeleteClick}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete {selectedPriorityClasses.size > 1 ? `(${selectedPriorityClasses.size})` : ''}
        </div>
      </div>,
      document.body
    );
  };

  // Delete confirmation dialog
  const renderDeleteDialog = () => {
    // Check if we're trying to delete a system priority class
    const isSystemPriorityClass = (name?: string) => {
      return name?.startsWith('system-') || false;
    };

    // Check if any selected priority class is a system one
    const hasSystemPriorityClass = selectedPriorityClasses.size > 0
      ? Array.from(selectedPriorityClasses).some(name => isSystemPriorityClass(name))
      : isSystemPriorityClass(activePriorityClass?.metadata?.name);

    // Check if we're deleting a default priority class
    const isDefaultPriorityClass = activePriorityClass?.globalDefault ||
      (selectedPriorityClasses.size > 0 && priorityClasses.some(pc =>
        pc.globalDefault && selectedPriorityClasses.has(pc.metadata?.name || '')
      ));

    return (
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-gray-100 dark:bg-[#0B0D13]">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm PriorityClass Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedPriorityClasses.size > 1
                ? `${selectedPriorityClasses.size} PriorityClasses`
                : `"${activePriorityClass?.metadata?.name}"`}?
              This action cannot be undone.

              <div className="mt-2 text-amber-600 dark:text-amber-400">
                Warning: Deleting PriorityClasses may impact how pods are scheduled and preempted in your cluster.
                {isDefaultPriorityClass && (
                  <div className="mt-1 font-medium">
                    You are deleting a default PriorityClass! This may affect all pods that don't specify a priority class.
                  </div>
                )}
                {hasSystemPriorityClass && (
                  <div className="mt-1 font-medium">
                    You are deleting system PriorityClasses! This may severely impact cluster functionality.
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deletePriorityClasses}
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
    field: 'value',
    direction: 'desc'
  });

  // Fetch PriorityClasses (these are cluster-scoped resources)
  useEffect(() => {
    const fetchPriorityClasses = async () => {
      if (!currentContext) {
        setPriorityClasses([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Try v1 API first
        try {
          const priorityClassesData = await listResources(currentContext.name, 'priorityclasses', {
            apiGroup: 'scheduling.k8s.io',
            apiVersion: 'v1'
          });
          setPriorityClasses(priorityClassesData);
        } catch (err) {
          console.warn('Failed to fetch PriorityClasses with scheduling.k8s.io/v1, falling back to v1alpha1:', err);

          // Fallback to v1alpha1 (for older clusters)
          try {
            const priorityClassesData = await listResources(currentContext.name, 'priorityclasses', {
              apiGroup: 'scheduling.k8s.io',
              apiVersion: 'v1alpha1'
            });
            setPriorityClasses(priorityClassesData);
          } catch (fallbackErr) {
            console.error('Failed to fetch PriorityClasses:', fallbackErr);
            setError('Failed to fetch PriorityClasses. Your cluster may not support this resource type.');
            setPriorityClasses([]);
          }
        }

        setError(null);
      } catch (err) {
        console.error('Failed to fetch priority classes:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch priority classes');
      } finally {
        setLoading(false);
      }
    };

    fetchPriorityClasses();
  }, [currentContext]);

  // Filter PriorityClasses based on search query
  const filteredPriorityClasses = useMemo(() => {
    if (!searchQuery.trim()) {
      return priorityClasses;
    }

    const lowercaseQuery = searchQuery.toLowerCase();

    return priorityClasses.filter(pc => {
      const name = pc.metadata?.name?.toLowerCase() || '';
      const description = pc.description?.toLowerCase() || '';
      const labels = pc.metadata?.labels || {};
      const annotations = pc.metadata?.annotations || {};
      const preemptionPolicy = pc.preemptionPolicy?.toLowerCase() || '';
      const valueStr = pc.value.toString();

      // Check if name, description, or value contains the query
      if (
        name.includes(lowercaseQuery) ||
        description.includes(lowercaseQuery) ||
        preemptionPolicy.includes(lowercaseQuery) ||
        valueStr.includes(lowercaseQuery) ||
        (pc.globalDefault && 'default'.includes(lowercaseQuery))
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
  }, [priorityClasses, searchQuery]);

  // Sort PriorityClasses based on sort state
  const sortedPriorityClasses = useMemo(() => {
    if (!sort.field || !sort.direction) {
      return filteredPriorityClasses;
    }

    return [...filteredPriorityClasses].sort((a, b) => {
      const sortMultiplier = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'name':
          return (a.metadata?.name || '').localeCompare(b.metadata?.name || '') * sortMultiplier;

        case 'value':
          return (a.value - b.value) * sortMultiplier;

        case 'default':
          // Sort by globalDefault (true comes before false)
          if (a.globalDefault === b.globalDefault) return 0;
          return (a.globalDefault ? -1 : 1) * sortMultiplier;

        case 'preemption':
          // Sort by preemptionPolicy
          const policyA = a.preemptionPolicy || 'PreemptLowerPriority';
          const policyB = b.preemptionPolicy || 'PreemptLowerPriority';
          return policyA.localeCompare(policyB) * sortMultiplier;

        case 'age': {
          const timeA = a.metadata?.creationTimestamp ? new Date(a.metadata.creationTimestamp).getTime() : 0;
          const timeB = b.metadata?.creationTimestamp ? new Date(b.metadata.creationTimestamp).getTime() : 0;
          return (timeA - timeB) * sortMultiplier;
        }

        default:
          return 0;
      }
    });
  }, [filteredPriorityClasses, sort.field, sort.direction]);

  const handlePriorityClassDetails = (priorityClass: V1PriorityClass) => {
    if (priorityClass.metadata?.name) {
      navigate(`/dashboard/explore/priorityclasses/${priorityClass.metadata.name}`);
    }
  };

  // Format preemption policy for display
  const formatPreemptionPolicy = (priorityClass: V1PriorityClass): JSX.Element => {
    const policy = priorityClass.preemptionPolicy || 'PreemptLowerPriority';

    let colorClass = 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300';
    if (policy === 'Never') {
      colorClass = 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300';
    }

    return (
      <div className="flex items-center justify-center">
        <span className={`px-2 py-1 rounded-[0.3rem] text-xs font-medium ${colorClass}`}>
          {policy}
        </span>
      </div>
    );
  };

  // Format priority value and indicate if it's a default
  const formatPriorityValue = (priorityClass: V1PriorityClass): JSX.Element => {
    const value = priorityClass.value;

    // Determine color based on priority value
    let valueColorClass = 'text-gray-800 dark:text-gray-200';
    if (value < 0) {
      valueColorClass = 'text-red-600 dark:text-red-400';
    } else if (value === 0) {
      valueColorClass = 'text-blue-600 dark:text-blue-400';
    } else if (value > 1000000000) {
      valueColorClass = 'text-purple-600 dark:text-purple-400';
    } else if (value > 1000000) {
      valueColorClass = 'text-green-600 dark:text-green-400';
    }

    return (
      <div className="flex flex-col items-center">
        <span className={`font-medium ${valueColorClass}`}>
          {value.toLocaleString()}
        </span>
        {priorityClass.globalDefault && (
          <span className="mt-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
            Default
          </span>
        )}
      </div>
    );
  };

  // Format description with truncation
  const formatDescription = (priorityClass: V1PriorityClass): JSX.Element => {
    const description = priorityClass.description || '';

    if (!description) {
      return <span className="text-gray-500 dark:text-gray-400">No description</span>;
    }

    if (description.length > 100) {
      return (
        <div className="text-sm">
          {description.substring(0, 100)}...
        </div>
      );
    }

    return <div className="text-sm">{description}</div>;
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
        <h1 className='text-5xl font-[Anton] uppercase font-bold text-gray-800/30 dark:text-gray-700/50'>Priority Classes</h1>
        <div className="w-full md:w-96 mt-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
            <Input
              type="text"
              placeholder="Search by name, value, or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
      </div>

      {/* No results message */}
      {sortedPriorityClasses.length === 0 && (
        <Alert className="my-6 bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <AlertDescription>
            {searchQuery
              ? `No priority classes matching "${searchQuery}"`
              : "No priority classes found in the cluster."}
          </AlertDescription>
        </Alert>
      )}

      {/* PriorityClass table */}
      {sortedPriorityClasses.length > 0 && (
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
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('value')}
                  >
                    Priority Value {renderSortIndicator('value')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('preemption')}
                  >
                    Preemption {renderSortIndicator('preemption')}
                  </TableHead>
                  <TableHead>
                    Description
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
                {sortedPriorityClasses.map((priorityClass) => (
                  <TableRow
                    key={priorityClass.metadata?.name}
                    className={`bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30 ${selectedPriorityClasses.has(priorityClass.metadata?.name || '') ? 'bg-blue-50 dark:bg-gray-800/30' : ''
                      }`}
                    onClick={(e) => handlePriorityClassClick(e, priorityClass)}
                    onContextMenu={(e) => handleContextMenu(e, priorityClass)}
                  >
                    <TableCell className="font-medium" onClick={() => handlePriorityClassDetails(priorityClass)}>
                      <div className="hover:text-blue-500 hover:underline">
                        {priorityClass.metadata?.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {formatPriorityValue(priorityClass)}
                    </TableCell>
                    <TableCell className="text-center">
                      {formatPreemptionPolicy(priorityClass)}
                    </TableCell>
                    <TableCell>
                      {formatDescription(priorityClass)}
                    </TableCell>
                    <TableCell className="text-center">
                      {calculateAge(priorityClass.metadata?.creationTimestamp?.toString())}
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
                          <DropdownMenuItem onClick={(e) => handleViewPriorityClassMenuItem(e, priorityClass)} className='hover:text-gray-700 dark:hover:text-gray-500'>
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-500 dark:text-red-400 focus:text-red-500 dark:focus:text-red-400 hover:text-red-700 dark:hover:text-red-500"
                            onClick={(e) => handleDeletePriorityClassMenuItem(e, priorityClass)}
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

export default PriorityClasses;