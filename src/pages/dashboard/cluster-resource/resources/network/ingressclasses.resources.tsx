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
import { Trash2, ExternalLink, Star } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { deleteResource } from '@/api/internal/resources';
import { OPERATOR_URL } from '@/config';

// Define types for IngressClass (not directly exported from kubernetes-client-node)
interface IngressClassSpec {
  controller: string;
  parameters?: {
    apiGroup?: string;
    kind: string;
    name: string;
    namespace?: string;
    scope?: string;
  };
}

interface V1IngressClass {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    creationTimestamp?: string;
    labels?: { [key: string]: string };
    annotations?: { [key: string]: string };
  };
  spec?: IngressClassSpec;
}

// Define sorting types
type SortDirection = 'asc' | 'desc' | null;
type SortField = 'name' | 'controller' | 'default' | 'age' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

const IngressClasses: React.FC = () => {
  const navigate = useNavigate();
  const { currentContext } = useCluster();
  const [ingressClasses, setIngressClasses] = useState<V1IngressClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // --- Start of Multi-select ---
  const [selectedIngressClasses, setSelectedIngressClasses] = useState<Set<string>>(new Set());
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [activeIngressClass, setActiveIngressClass] = useState<V1IngressClass | null>(null);
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
  
  // Add click handler for IngressClass selection with cmd/ctrl key
  const handleIngressClassClick = (e: React.MouseEvent, ingressClass: V1IngressClass) => {
    if (!ingressClass.metadata?.name) return;

    const ingressClassKey = ingressClass.metadata.name;

    if (e.metaKey || e.ctrlKey) {
      // Prevent navigation when using multi-select
      e.preventDefault();
      e.stopPropagation();

      setSelectedIngressClasses(prev => {
        const newSelection = new Set(prev);
        if (newSelection.has(ingressClassKey)) {
          newSelection.delete(ingressClassKey);
        } else {
          newSelection.add(ingressClassKey);
        }
        return newSelection;
      });
    } else if (!selectedIngressClasses.has(ingressClassKey)) {
      // Clear selection on regular click (unless clicking on already selected ingress class)
      setSelectedIngressClasses(new Set());
      handleIngressClassDetails(ingressClass);
    } else {
      handleIngressClassDetails(ingressClass);
    }
  };

  // Add context menu handlers
  const handleContextMenu = (e: React.MouseEvent, ingressClass: V1IngressClass) => {
    if (!ingressClass.metadata?.name) return;

    e.preventDefault();
    e.stopPropagation();

    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setActiveIngressClass(ingressClass);
    setShowContextMenu(true);

    // Multi-select support: if ingress class isn't in selection, make it the only selection
    const ingressClassKey = ingressClass.metadata.name;
    if (!selectedIngressClasses.has(ingressClassKey)) {
      setSelectedIngressClasses(new Set([ingressClassKey]));
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

        if (isOutsideTable && !isContextMenuClick && !isAlertDialogClick && selectedIngressClasses.size > 0) {
          setSelectedIngressClasses(new Set());
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedIngressClasses]);

  // Handle view ingress class details
  const handleViewIngressClass = () => {
    setShowContextMenu(false);
    if (activeIngressClass) {
      handleIngressClassDetails(activeIngressClass);
    }
  };

  // Handle setting as default IngressClass
  const handleSetAsDefault = async () => {
    setShowContextMenu(false);

    try {
      if (!currentContext || !activeIngressClass || !activeIngressClass.metadata?.name) {
        return;
      }

      // First, unset any current default IngressClass
      for (const ingressClass of ingressClasses) {
        if (isDefaultIngressClass(ingressClass) && ingressClass.metadata?.name !== activeIngressClass.metadata?.name) {
          await unsetDefaultIngressClass(ingressClass);
        }
      }

      // Then set the selected one as default
      await setDefaultIngressClass(activeIngressClass);

      // Refresh the list
      if (currentContext) {
        const refreshedIngressClasses = await listResources(currentContext.name, 'ingressclasses', {
          apiGroup: 'networking.k8s.io',
          apiVersion: 'v1'
        });
        setIngressClasses(refreshedIngressClasses);
      }

    } catch (error) {
      console.error('Failed to set default IngressClass:', error);
      setError(error instanceof Error ? error.message : 'Failed to set default IngressClass');
    }
  };

  // Set IngressClass as default
  const setDefaultIngressClass = async (ingressClass: V1IngressClass) => {
    if (!currentContext || !ingressClass.metadata?.name) return;

    // Create a patch to add the default annotation
    const patch = [
      {
        op: 'add',
        path: '/metadata/annotations',
        value: {
          ...(ingressClass.metadata?.annotations || {}),
          'ingressclass.kubernetes.io/is-default-class': 'true'
        }
      }
    ];

    // If there are no annotations, we need to create the path first
    if (!ingressClass.metadata?.annotations) {
      patch[0].path = '/metadata/annotations';
    }

    // Apply the patch
    await fetch(`${OPERATOR_URL}/clusters/${currentContext.name}/apis/networking.k8s.io/v1/ingressclasses/${ingressClass.metadata.name}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json-patch+json',
      },
      body: JSON.stringify(patch),
    });
  };

  // Unset IngressClass as default
  const unsetDefaultIngressClass = async (ingressClass: V1IngressClass) => {
    if (!currentContext || !ingressClass.metadata?.name) return;

    // Copy annotations and remove default flag
    const annotations = { ...(ingressClass.metadata?.annotations || {}) };
    delete annotations['ingressclass.kubernetes.io/is-default-class'];

    // Create a patch to update the annotations
    const patch = [
      {
        op: 'replace',
        path: '/metadata/annotations',
        value: annotations
      }
    ];

    // Apply the patch
    await fetch(`${OPERATOR_URL}/clusters/${currentContext.name}/apis/networking.k8s.io/v1/ingressclasses/${ingressClass.metadata.name}`, {
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
  const deleteIngressClasses = async () => {
    setShowDeleteDialog(false);

    try {
      if (selectedIngressClasses.size === 0 && activeIngressClass) {
        // Delete single active IngressClass
        await deleteIngressClass(activeIngressClass);
      } else {
        // Delete all selected IngressClasses
        for (const ingressClassName of selectedIngressClasses) {
          const ingressClassToDelete = ingressClasses.find(ic =>
            ic.metadata?.name === ingressClassName
          );

          if (ingressClassToDelete) {
            await deleteIngressClass(ingressClassToDelete);
          }
        }
      }

      // Clear selection after deletion
      setSelectedIngressClasses(new Set());

      // Refresh IngressClasses list after deletion
      if (currentContext) {
        const refreshedIngressClasses = await listResources(currentContext.name, 'ingressclasses', {
          apiGroup: 'networking.k8s.io',
          apiVersion: 'v1'
        });
        setIngressClasses(refreshedIngressClasses);
      }

    } catch (error) {
      console.error('Failed to delete IngressClass(es):', error);
      setError(error instanceof Error ? error.message : 'Failed to delete IngressClass(es)');
    }
  };

  // Delete IngressClass function
  const deleteIngressClass = async (ingressClass: V1IngressClass) => {
    if (!currentContext || !ingressClass.metadata?.name) return;

    await deleteResource(
      currentContext.name,
      'ingressclasses',
      ingressClass.metadata.name,
      {
        apiGroup: 'networking.k8s.io',
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

    // Check if we can set as default
    const isCurrentlyDefault = activeIngressClass && isDefaultIngressClass(activeIngressClass);
    const canSetDefault = selectedIngressClasses.size <= 1 && !isCurrentlyDefault;

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
          {selectedIngressClasses.size > 1
            ? `${selectedIngressClasses.size} IngressClasses selected`
            : activeIngressClass?.metadata?.name || 'IngressClass actions'}
        </div>

        {selectedIngressClasses.size <= 1 && (
          <div
            className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center"
            onClick={handleViewIngressClass}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            View Details
          </div>
        )}

        <div
          className={`px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center ${!canSetDefault ? 'text-gray-400 dark:text-gray-600 pointer-events-none' : ''
            }`}
          onClick={canSetDefault ? handleSetAsDefault : undefined}
          title={!canSetDefault && isCurrentlyDefault ? "Already default IngressClass" : ""}
        >
          <Star className="h-4 w-4 mr-2" />
          Set as Default
        </div>

        <div
          className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center text-red-600 dark:text-red-400"
          onClick={handleDeleteClick}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete {selectedIngressClasses.size > 1 ? `(${selectedIngressClasses.size})` : ''}
        </div>
      </div>,
      document.body
    );
  };

  // Delete confirmation dialog
  const renderDeleteDialog = () => {
    // Check if any of the selected IngressClasses are default
    const anyDefaultSelected = () => {
      if (selectedIngressClasses.size === 0 && activeIngressClass) {
        return isDefaultIngressClass(activeIngressClass);
      }

      return Array.from(selectedIngressClasses).some(name => {
        const ingressClass = ingressClasses.find(ic => ic.metadata?.name === name);
        return ingressClass && isDefaultIngressClass(ingressClass);
      });
    };

    // Count how many ingresses might be affected
    const countAffectedIngresses = () => {
      // This would require fetching ingresses and checking their class
      // For now, we just warn if deleting default class
      return anyDefaultSelected() ? "multiple" : "no";
    };

    return (
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-gray-100 dark:bg-[#0B0D13]">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm IngressClass Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedIngressClasses.size > 1
                ? `${selectedIngressClasses.size} ingress classes`
                : `"${activeIngressClass?.metadata?.name}"`}?
              This action cannot be undone.

              <div className="mt-2 text-amber-600 dark:text-amber-400">
                Warning: Deleting IngressClasses may affect Ingress resources that reference them.
                {anyDefaultSelected() && (
                  <div className="mt-1 font-medium">
                    You are about to delete a default IngressClass. This may affect all Ingresses that don't explicitly specify a class.
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteIngressClasses}
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

  // Fetch ingress classes (cluster-scoped resources)
  useEffect(() => {
    const fetchIngressClasses = async () => {
      if (!currentContext) {
        setIngressClasses([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const ingressClassesData = await listResources(currentContext.name, 'ingressclasses', {
          apiGroup: 'networking.k8s.io',
          apiVersion: 'v1'
        });
        setIngressClasses(ingressClassesData);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch ingress classes:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch ingress classes');
      } finally {
        setLoading(false);
      }
    };

    fetchIngressClasses();
  }, [currentContext]);

  // Filter ingress classes based on search query
  const filteredIngressClasses = useMemo(() => {
    if (!searchQuery.trim()) {
      return ingressClasses;
    }

    const lowercaseQuery = searchQuery.toLowerCase();

    return ingressClasses.filter(ingressClass => {
      const name = ingressClass.metadata?.name?.toLowerCase() || '';
      const controller = ingressClass.spec?.controller?.toLowerCase() || '';
      const labels = ingressClass.metadata?.labels || {};
      const annotations = ingressClass.metadata?.annotations || {};
      const parametersKind = ingressClass.spec?.parameters?.kind?.toLowerCase() || '';
      const parametersName = ingressClass.spec?.parameters?.name?.toLowerCase() || '';

      // Check parameters if they exist
      const parametersMatch =
        parametersKind.includes(lowercaseQuery) ||
        parametersName.includes(lowercaseQuery);

      // Check if name, controller, or parameters contains the query
      if (
        name.includes(lowercaseQuery) ||
        controller.includes(lowercaseQuery) ||
        parametersMatch
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
  }, [ingressClasses, searchQuery]);

  // Sort ingress classes based on sort state
  const sortedIngressClasses = useMemo(() => {
    if (!sort.field || !sort.direction) {
      return filteredIngressClasses;
    }

    return [...filteredIngressClasses].sort((a, b) => {
      const sortMultiplier = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'name':
          return (a.metadata?.name || '').localeCompare(b.metadata?.name || '') * sortMultiplier;

        case 'controller':
          return (a.spec?.controller || '').localeCompare(b.spec?.controller || '') * sortMultiplier;

        case 'default': {
          const isDefaultA = isDefaultIngressClass(a);
          const isDefaultB = isDefaultIngressClass(b);

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
  }, [filteredIngressClasses, sort.field, sort.direction]);

  // Check if an ingress class is the default
  const isDefaultIngressClass = (ingressClass: V1IngressClass): boolean => {
    const annotations = ingressClass.metadata?.annotations || {};
    return annotations['ingressclass.kubernetes.io/is-default-class'] === 'true';
  };

  const handleIngressClassDetails = (ingressClass: V1IngressClass) => {
    if (ingressClass.metadata?.name) {
      navigate(`/dashboard/explore/ingressclasses/${ingressClass.metadata.name}`);
    }
  };

  // Format parameters for display
  const formatParameters = (ingressClass: V1IngressClass): string => {
    const params = ingressClass.spec?.parameters;
    if (!params) {
      return 'None';
    }

    let result = `${params.kind}: ${params.name}`;
    if (params.namespace) {
      result += ` (namespace: ${params.namespace})`;
    }
    if (params.scope) {
      result += ` (scope: ${params.scope})`;
    }
    return result;
  };

  // Get a color class based on the default status
  const getDefaultColorClass = (isDefault: boolean): string => {
    return isDefault
      ? 'bg-green-200 text-green-800 dark:bg-green-900/30 dark:text-green-400'
      : 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
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
          scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent
          [&::-webkit-scrollbar]:w-1.5 
          [&::-webkit-scrollbar-track]:bg-transparent 
          [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">
      <div className='flex items-center justify-between md:flex-row gap-4 items-start md:items-end'>
        <div>
          <h1 className='text-5xl font-[Anton] uppercase font-bold text-gray-800/30 dark:text-gray-700/50'>Ingress Classes</h1>
          <div className="w-full md:w-96 mt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
              <Input
                type="text"
                placeholder="Search by name, controller, or parameters..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </div>
      </div>

      {/* No results message */}
      {sortedIngressClasses.length === 0 && (
        <Alert className="my-6 bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <AlertDescription>
            {searchQuery
              ? `No ingress classes matching "${searchQuery}"`
              : "No ingress classes found in the cluster"}
          </AlertDescription>
        </Alert>
      )}

      {/* IngressClasses table */}
      {sortedIngressClasses.length > 0 && (
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
                    onClick={() => handleSort('controller')}
                  >
                    Controller {renderSortIndicator('controller')}
                  </TableHead>
                  <TableHead>
                    Parameters
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('default')}
                  >
                    Default {renderSortIndicator('default')}
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
                {sortedIngressClasses.map((ingressClass) => (
                  <TableRow
                    key={ingressClass.metadata?.name}
                    className={`bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30 ${ingressClass.metadata?.name &&
                        selectedIngressClasses.has(ingressClass.metadata.name)
                        ? 'bg-blue-50 dark:bg-gray-800/30'
                        : ''
                      }`}
                    onClick={(e) => handleIngressClassClick(e, ingressClass)}
                    onContextMenu={(e) => handleContextMenu(e, ingressClass)}
                  >
                    <TableCell className="font-medium">
                      <div className="hover:text-blue-500 hover:underline">
                        {ingressClass.metadata?.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="px-2 py-1 rounded-[0.3rem] text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
                        {ingressClass.spec?.controller || 'Unknown'}
                      </span>
                    </TableCell>
                    <TableCell>
                      {formatParameters(ingressClass)}
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={`px-2 py-1 rounded-[0.3rem] text-xs font-medium ${getDefaultColorClass(isDefaultIngressClass(ingressClass))}`}
                      >
                        {isDefaultIngressClass(ingressClass) ? 'Default' : '-'}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {calculateAge(ingressClass.metadata?.creationTimestamp?.toString())}
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

export default IngressClasses;