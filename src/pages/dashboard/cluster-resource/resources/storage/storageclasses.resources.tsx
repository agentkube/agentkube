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
import { Trash2, Copy, Star } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { deleteResource } from '@/api/internal/resources';
import { OPERATOR_URL } from '@/config';

// Define sorting types
type SortDirection = 'asc' | 'desc' | null;
type SortField = 'name' | 'provisioner' | 'reclaimPolicy' | 'volumeBindingMode' | 'allowVolumeExpansion' | 'isDefault' | 'age' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

const StorageClasses: React.FC = () => {
  const navigate = useNavigate();
  const { currentContext } = useCluster();
  const [storageClasses, setStorageClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // --- Start of Multi-select ---
  const [selectedStorageClasses, setSelectedStorageClasses] = useState<Set<string>>(new Set());
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [activeStorageClass, setActiveStorageClass] = useState<any | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Cmd+F (Mac) or Ctrl+F (Windows)
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
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
  
  // Add click handler for StorageClass selection with cmd/ctrl key
  const handleStorageClassClick = (e: React.MouseEvent, storageClass: any) => {
    const scKey = storageClass.metadata?.name || '';

    if (e.metaKey || e.ctrlKey) {
      // Prevent navigation when using multi-select
      e.preventDefault();
      e.stopPropagation();

      setSelectedStorageClasses(prev => {
        const newSelection = new Set(prev);
        if (newSelection.has(scKey)) {
          newSelection.delete(scKey);
        } else {
          newSelection.add(scKey);
        }
        return newSelection;
      });
    } else if (!selectedStorageClasses.has(scKey)) {
      // Clear selection on regular click (unless clicking on already selected storage class)
      setSelectedStorageClasses(new Set());
      handleStorageClassDetails(storageClass);
    } else {
      handleStorageClassDetails(storageClass);
    }
  };

  // Add context menu handlers
  const handleContextMenu = (e: React.MouseEvent, storageClass: any) => {
    e.preventDefault();
    e.stopPropagation();

    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setActiveStorageClass(storageClass);
    setShowContextMenu(true);

    // Multi-select support: if storage class isn't in selection, make it the only selection
    const scKey = storageClass.metadata?.name || '';
    if (!selectedStorageClasses.has(scKey)) {
      setSelectedStorageClasses(new Set([scKey]));
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

        if (isOutsideTable && !isContextMenuClick && !isAlertDialogClick && selectedStorageClasses.size > 0) {
          setSelectedStorageClasses(new Set());
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedStorageClasses]);

  // Handle clone StorageClass
  const handleCloneStorageClass = async () => {
    setShowContextMenu(false);

    try {
      if (selectedStorageClasses.size === 0 && activeStorageClass) {
        // Clone single active StorageClass
        await cloneStorageClass(activeStorageClass);
      } else if (selectedStorageClasses.size === 1) {
        // Clone the selected StorageClass
        const scName = Array.from(selectedStorageClasses)[0];
        const scToClone = storageClasses.find(sc => sc.metadata?.name === scName);

        if (scToClone) {
          await cloneStorageClass(scToClone);
        }
      } else {
        // Alert user that multiple StorageClass cloning is not supported
        alert("Cloning multiple StorageClasses at once is not supported. Please select a single StorageClass to clone.");
      }

      // Refresh StorageClass list after cloning
      if (currentContext) {
        const refreshedStorageClasses = await listResources(currentContext.name, 'storageclasses', {
          apiGroup: 'storage.k8s.io',
          apiVersion: 'v1'
        });
        setStorageClasses(refreshedStorageClasses);
      }

    } catch (error) {
      console.error('Failed to clone StorageClass:', error);
      setError(error instanceof Error ? error.message : 'Failed to clone StorageClass');
    }
  };

  // Clone a StorageClass
  const cloneStorageClass = async (storageClass: any) => {
    if (!currentContext || !storageClass.metadata?.name) return;

    // Ask for the new StorageClass name
    const newName = prompt("Enter name for the cloned StorageClass:", `${storageClass.metadata.name}-clone`);
    if (!newName) return; // User cancelled

    // Create a new StorageClass based on the existing one
    const newStorageClass = {
      apiVersion: 'storage.k8s.io/v1',
      kind: 'StorageClass',
      metadata: {
        name: newName,
        // Copy labels but add a cloned-from label
        labels: {
          ...(storageClass.metadata.labels || {}),
          clonedFrom: storageClass.metadata.name
        },
        // Remove is-default-class annotations from clone
        annotations: {
          ...(storageClass.metadata.annotations || {}),
        }
      },
      // Copy all other fields
      provisioner: storageClass.provisioner,
      parameters: storageClass.parameters,
      reclaimPolicy: storageClass.reclaimPolicy,
      volumeBindingMode: storageClass.volumeBindingMode,
      allowVolumeExpansion: storageClass.allowVolumeExpansion,
      mountOptions: storageClass.mountOptions
    };

    // Remove default StorageClass annotations if any
    if (newStorageClass.metadata.annotations) {
      delete newStorageClass.metadata.annotations['storageclass.kubernetes.io/is-default-class'];
      delete newStorageClass.metadata.annotations['storageclass.beta.kubernetes.io/is-default-class'];
    }

    // Create the new StorageClass
    await fetch(`${OPERATOR_URL}/clusters/${currentContext.name}/apis/storage.k8s.io/v1/storageclasses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(newStorageClass),
    });
  };

  // Handle setting as default StorageClass
  const handleSetAsDefault = async () => {
    setShowContextMenu(false);

    try {
      if (!currentContext || (!activeStorageClass && selectedStorageClasses.size === 0)) {
        return;
      }

      let scToSetAsDefault: any;

      if (selectedStorageClasses.size === 0 && activeStorageClass) {
        scToSetAsDefault = activeStorageClass;
      } else if (selectedStorageClasses.size === 1) {
        const scName = Array.from(selectedStorageClasses)[0];
        scToSetAsDefault = storageClasses.find(sc => sc.metadata?.name === scName);
      } else {
        alert("Please select only one StorageClass to set as default.");
        return;
      }

      if (!scToSetAsDefault) return;

      // First, unset any current default StorageClass
      for (const sc of storageClasses) {
        if (isDefaultStorageClass(sc) && sc.metadata?.name !== scToSetAsDefault.metadata?.name) {
          await unsetDefaultStorageClass(sc);
        }
      }

      // Then set the selected one as default
      await setDefaultStorageClass(scToSetAsDefault);

      // Refresh the list
      if (currentContext) {
        const refreshedStorageClasses = await listResources(currentContext.name, 'storageclasses', {
          apiGroup: 'storage.k8s.io',
          apiVersion: 'v1'
        });
        setStorageClasses(refreshedStorageClasses);
      }

    } catch (error) {
      console.error('Failed to set default StorageClass:', error);
      setError(error instanceof Error ? error.message : 'Failed to set default StorageClass');
    }
  };

  // Set StorageClass as default
  const setDefaultStorageClass = async (storageClass: any) => {
    if (!currentContext || !storageClass.metadata?.name) return;

    // Create a patch to add the default annotation
    const patch = [
      {
        op: 'add',
        path: '/metadata/annotations',
        value: {
          ...(storageClass.metadata?.annotations || {}),
          'storageclass.kubernetes.io/is-default-class': 'true'
        }
      }
    ];

    // If there are no annotations, we need to create the path first
    if (!storageClass.metadata?.annotations) {
      patch[0].path = '/metadata/annotations';
    }

    // Apply the patch
    await fetch(`${OPERATOR_URL}/clusters/${currentContext.name}/apis/storage.k8s.io/v1/storageclasses/${storageClass.metadata.name}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json-patch+json',
      },
      body: JSON.stringify(patch),
    });
  };

  // Unset StorageClass as default
  const unsetDefaultStorageClass = async (storageClass: any) => {
    if (!currentContext || !storageClass.metadata?.name) return;

    // Copy annotations and remove default flags
    const annotations = { ...(storageClass.metadata?.annotations || {}) };
    delete annotations['storageclass.kubernetes.io/is-default-class'];
    delete annotations['storageclass.beta.kubernetes.io/is-default-class'];

    // Create a patch to update the annotations
    const patch = [
      {
        op: 'replace',
        path: '/metadata/annotations',
        value: annotations
      }
    ];

    // Apply the patch
    await fetch(`${OPERATOR_URL}/clusters/${currentContext.name}/apis/storage.k8s.io/v1/storageclasses/${storageClass.metadata.name}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json-patch+json',
      },
      body: JSON.stringify(patch),
    });
  };

  // Handle delete action
  const handleDeleteClick = () => {
    setShowContextMenu(false);
    setShowDeleteDialog(true);
  };

  // Perform actual deletion
  const deleteStorageClasses = async () => {
    setShowDeleteDialog(false);

    try {
      if (selectedStorageClasses.size === 0 && activeStorageClass) {
        // Delete single active StorageClass
        await deleteStorageClass(activeStorageClass);
      } else {
        // Delete all selected StorageClasses
        for (const scName of selectedStorageClasses) {
          const scToDelete = storageClasses.find(sc => sc.metadata?.name === scName);

          if (scToDelete) {
            await deleteStorageClass(scToDelete);
          }
        }
      }

      // Clear selection after deletion
      setSelectedStorageClasses(new Set());

      // Refresh StorageClass list after deletion
      if (currentContext) {
        const refreshedStorageClasses = await listResources(currentContext.name, 'storageclasses', {
          apiGroup: 'storage.k8s.io',
          apiVersion: 'v1'
        });
        setStorageClasses(refreshedStorageClasses);
      }

    } catch (error) {
      console.error('Failed to delete StorageClass(es):', error);
      setError(error instanceof Error ? error.message : 'Failed to delete StorageClass(es)');
    }
  };

  // Delete StorageClass function
  const deleteStorageClass = async (storageClass: any) => {
    if (!currentContext || !storageClass.metadata?.name) return;

    await deleteResource(
      currentContext.name,
      'storageclasses',
      storageClass.metadata.name,
      { apiGroup: 'storage.k8s.io', apiVersion: 'v1' }
    );
  };

  // Render the context menu
  const renderContextMenu = () => {
    if (!showContextMenu || !contextMenuPosition) return null;

    // Calculate if we need to show the menu above or below the click position
    const windowHeight = window.innerHeight;
    const menuHeight = 150; // Approximate context menu height
    const shouldShowAbove = windowHeight - contextMenuPosition.y < menuHeight;

    // Check if we can set as default (only one selected)
    const canSetDefault = selectedStorageClasses.size <= 1;
    const isCurrentlyDefault = activeStorageClass && isDefaultStorageClass(activeStorageClass);

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
          {selectedStorageClasses.size > 1
            ? `${selectedStorageClasses.size} StorageClasses selected`
            : activeStorageClass?.metadata?.name || 'StorageClass actions'}
        </div>

        <div
          className={`px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center ${!canSetDefault || isCurrentlyDefault ? 'text-gray-400 dark:text-gray-600 pointer-events-none' : ''
            }`}
          onClick={canSetDefault && !isCurrentlyDefault ? handleSetAsDefault : undefined}
          title={!canSetDefault ? "Select only one StorageClass" : (isCurrentlyDefault ? "Already default StorageClass" : "")}
        >
          <Star className="h-4 w-4 mr-2" />
          Set as Default
        </div>

        <div
          className={`px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center ${selectedStorageClasses.size > 1 ? 'text-gray-400 dark:text-gray-600 pointer-events-none' : ''
            }`}
          onClick={selectedStorageClasses.size <= 1 ? handleCloneStorageClass : undefined}
          title={selectedStorageClasses.size > 1 ? "Select only one StorageClass to clone" : ""}
        >
          <Copy className="h-4 w-4 mr-2" />
          Clone
        </div>

        <div
          className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center text-red-600 dark:text-red-400"
          onClick={handleDeleteClick}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete {selectedStorageClasses.size > 1 ? `(${selectedStorageClasses.size})` : ''}
        </div>
      </div>,
      document.body
    );
  };

  // Delete confirmation dialog
  const renderDeleteDialog = () => {
    // Check if any of the selected StorageClasses are default
    const anyDefaultSelected = () => {
      if (selectedStorageClasses.size === 0 && activeStorageClass) {
        return isDefaultStorageClass(activeStorageClass);
      }

      return Array.from(selectedStorageClasses).some(scName => {
        const sc = storageClasses.find(s => s.metadata?.name === scName);
        return sc && isDefaultStorageClass(sc);
      });
    };

    return (
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-gray-100 dark:bg-[#0B0D13]">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm StorageClass Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedStorageClasses.size > 1
                ? `${selectedStorageClasses.size} storage classes`
                : `"${activeStorageClass?.metadata?.name}"`}?
              This action cannot be undone.

              <div className="mt-2 text-amber-600 dark:text-amber-400">
                Warning: Deleting a StorageClass may prevent the creation of new PersistentVolumeClaims that reference it.
                {anyDefaultSelected() && (
                  <div className="mt-1 font-medium">
                    You are about to delete a default StorageClass. This may affect dynamic provisioning of PersistentVolumes.
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteStorageClasses}
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

  // Fetch all storage classes
  useEffect(() => {
    const fetchStorageClasses = async () => {
      if (!currentContext) {
        setStorageClasses([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const storageClassesData = await listResources(currentContext.name, 'storageclasses', {
          apiGroup: 'storage.k8s.io',
          apiVersion: 'v1'
        });
        setStorageClasses(storageClassesData);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch storage classes:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch storage classes');
      } finally {
        setLoading(false);
      }
    };

    fetchStorageClasses();
  }, [currentContext]);

  // Filter storage classes based on search query
  const filteredStorageClasses = useMemo(() => {
    if (!searchQuery.trim()) {
      return storageClasses;
    }

    const lowercaseQuery = searchQuery.toLowerCase();

    return storageClasses.filter(storageClass => {
      const name = storageClass.metadata?.name?.toLowerCase() || '';
      const provisioner = storageClass.provisioner?.toLowerCase() || '';
      const reclaimPolicy = storageClass.reclaimPolicy?.toLowerCase() || '';
      const volumeBindingMode = storageClass.volumeBindingMode?.toLowerCase() || '';
      const labels = storageClass.metadata?.labels || {};

      // Check if name, provisioner, reclaim policy, or volume binding mode contains the query
      if (
        name.includes(lowercaseQuery) ||
        provisioner.includes(lowercaseQuery) ||
        reclaimPolicy.includes(lowercaseQuery) ||
        volumeBindingMode.includes(lowercaseQuery)
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
  }, [storageClasses, searchQuery]);

  // Sort storage classes based on sort state
  const sortedStorageClasses = useMemo(() => {
    if (!sort.field || !sort.direction) {
      return filteredStorageClasses;
    }

    return [...filteredStorageClasses].sort((a, b) => {
      const sortMultiplier = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'name':
          return (a.metadata?.name || '').localeCompare(b.metadata?.name || '') * sortMultiplier;

        case 'provisioner':
          return (a.provisioner || '').localeCompare(b.provisioner || '') * sortMultiplier;

        case 'reclaimPolicy': {
          const policyA = a.reclaimPolicy || 'Delete';
          const policyB = b.reclaimPolicy || 'Delete';

          // Custom ordering: Delete is "more dangerous" than Retain
          if (policyA === 'Delete' && policyB === 'Retain') return 1 * sortMultiplier;
          if (policyA === 'Retain' && policyB === 'Delete') return -1 * sortMultiplier;

          return policyA.localeCompare(policyB) * sortMultiplier;
        }

        case 'volumeBindingMode': {
          const modeA = a.volumeBindingMode || 'Immediate';
          const modeB = b.volumeBindingMode || 'Immediate';
          return modeA.localeCompare(modeB) * sortMultiplier;
        }

        case 'allowVolumeExpansion': {
          const allowsA = a.allowVolumeExpansion || false;
          const allowsB = b.allowVolumeExpansion || false;

          // Sort true values before false values
          return (allowsA === allowsB ? 0 : allowsA ? -1 : 1) * sortMultiplier;
        }

        case 'isDefault': {
          const isDefaultA = isDefaultStorageClass(a);
          const isDefaultB = isDefaultStorageClass(b);

          // Sort default classes before non-default
          return (isDefaultA === isDefaultB ? 0 : isDefaultA ? -1 : 1) * sortMultiplier;
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
  }, [filteredStorageClasses, sort.field, sort.direction]);

  const handleStorageClassDetails = (storageClass: any) => {
    if (storageClass.metadata?.name) {
      navigate(`/dashboard/explore/storageclasses/${storageClass.metadata.name}`);
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

  // Get a color class based on the default storage class
  const getDefaultIndicatorClass = (isDefault: boolean): string => {
    return isDefault
      ? 'bg-green-200 text-green-800 dark:bg-green-900/30 dark:text-green-400'
      : 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  };

  // Check if storage class is default
  const isDefaultStorageClass = (storageClass: any): boolean => {
    const annotations = storageClass.metadata?.annotations || {};
    return (
      annotations['storageclass.kubernetes.io/is-default-class'] === 'true' ||
      annotations['storageclass.beta.kubernetes.io/is-default-class'] === 'true'
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
          scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent
          [&::-webkit-scrollbar]:w-1.5 
          [&::-webkit-scrollbar-track]:bg-transparent 
          [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">
      <div className='flex items-center justify-between md:flex-row gap-4 items-start md:items-end'>
        <div>
          <h1 className='text-5xl font-[Anton] uppercase font-bold text-gray-800/30 dark:text-gray-700/50'>Storage Classes</h1>
          <div className="w-full md:w-96 mt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
              <Input
                type="text"
                placeholder="Search by name, provisioner, or reclaim policy..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </div>
      </div>

      {/* No results message */}
      {sortedStorageClasses.length === 0 && (
        <Alert className="my-6 bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <AlertDescription>
            {searchQuery
              ? `No storage classes matching "${searchQuery}"`
              : "No storage classes found in the cluster"}
          </AlertDescription>
        </Alert>
      )}

      {/* Storage Classes table */}
      {sortedStorageClasses.length > 0 && (
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
                    onClick={() => handleSort('provisioner')}
                  >
                    Provisioner {renderSortIndicator('provisioner')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('reclaimPolicy')}
                  >
                    Reclaim Policy {renderSortIndicator('reclaimPolicy')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('volumeBindingMode')}
                  >
                    Volume Binding Mode {renderSortIndicator('volumeBindingMode')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('allowVolumeExpansion')}
                  >
                    Allow Volume Expansion {renderSortIndicator('allowVolumeExpansion')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('isDefault')}
                  >
                    Default Class {renderSortIndicator('isDefault')}
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
                {sortedStorageClasses.map((storageClass) => (
                  <TableRow
                    key={storageClass.metadata?.name}
                    className={`bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30 ${selectedStorageClasses.has(storageClass.metadata?.name || '') ? 'bg-blue-50 dark:bg-gray-800/30' : ''
                      }`}
                    onClick={(e) => handleStorageClassClick(e, storageClass)}
                    onContextMenu={(e) => handleContextMenu(e, storageClass)}
                  >
                    <TableCell className="font-medium">
                      <div className="hover:text-blue-500 hover:underline">
                        {storageClass.metadata?.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {storageClass.provisioner || 'Unknown'}
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={`px-2 py-1 rounded-[0.3rem] text-xs font-medium ${storageClass.reclaimPolicy === 'Delete'
                          ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300'
                          : 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300'
                          }`}
                      >
                        {storageClass.reclaimPolicy || 'Delete'}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="px-2 py-1 rounded-[0.3rem] text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
                        {storageClass.volumeBindingMode || 'Immediate'}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {storageClass.allowVolumeExpansion ? (
                        <span className="px-2 py-1 rounded-[0.3rem] text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300">
                          Yes
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded-[0.3rem] text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300">
                          No
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={`px-2 py-1 rounded-[0.3rem] text-xs font-medium ${getDefaultIndicatorClass(isDefaultStorageClass(storageClass))}`}
                      >
                        {isDefaultStorageClass(storageClass) ? 'Default' : '-'}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {calculateAge(storageClass.metadata?.creationTimestamp?.toString())}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          // Implement actions menu if needed
                        }}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
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

export default StorageClasses;