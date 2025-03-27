import React, { useState, useEffect, useMemo } from 'react';
import { listResources } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';
import { useNamespace } from '@/contexts/useNamespace';
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, MoreVertical, Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from 'react-router-dom';
import { calculateAge } from '@/utils/age';
import { NamespaceSelector, ErrorComponent, ScaleDialog } from '@/components/custom';
import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, Scale } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";


// Define sorting types
type SortDirection = 'asc' | 'desc' | null;
type SortField = 'name' | 'namespace' | 'ready' | 'current' | 'desired' | 'owner' | 'age' | 'labels' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

const ReplicaSets: React.FC = () => {
  const navigate = useNavigate();
  const { currentContext } = useCluster();
  const { selectedNamespaces } = useNamespace();
  const [replicaSets, setReplicaSets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [showScaleDialog, setShowScaleDialog] = useState(false);
  const [selectedResourcesForScaling, setSelectedResourcesForScaling] = useState<any[]>([]);

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

  // --- Start of Multi-select ---
  const [selectedReplicaSets, setSelectedReplicaSets] = useState<Set<string>>(new Set());
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [activeReplicaSet, setActiveReplicaSet] = useState<any | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Add click handler for replicaSet selection with cmd/ctrl key
  const handleReplicaSetClick = (e: React.MouseEvent, replicaSet: any) => {
    const replicaSetKey = `${replicaSet.metadata?.namespace}/${replicaSet.metadata?.name}`;

    if (e.metaKey || e.ctrlKey) {
      // Prevent navigation when using multi-select
      e.preventDefault();
      e.stopPropagation();

      setSelectedReplicaSets(prev => {
        const newSelection = new Set(prev);
        if (newSelection.has(replicaSetKey)) {
          newSelection.delete(replicaSetKey);
        } else {
          newSelection.add(replicaSetKey);
        }
        return newSelection;
      });
    } else if (!selectedReplicaSets.has(replicaSetKey)) {
      // Clear selection on regular click (unless clicking on already selected replicaSet)
      setSelectedReplicaSets(new Set());
      handleReplicaSetDetails(replicaSet);
    } else {
      handleReplicaSetDetails(replicaSet);
    }
  };

  // Add context menu handlers
  const handleContextMenu = (e: React.MouseEvent, replicaSet: any) => {
    e.preventDefault();
    e.stopPropagation();

    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setActiveReplicaSet(replicaSet);
    setShowContextMenu(true);

    // Multi-select support: if replicaSet isn't in selection, make it the only selection
    const replicaSetKey = `${replicaSet.metadata?.namespace}/${replicaSet.metadata?.name}`;
    if (!selectedReplicaSets.has(replicaSetKey)) {
      setSelectedReplicaSets(new Set([replicaSetKey]));
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

        if (isOutsideTable && !isContextMenuClick && !isAlertDialogClick && selectedReplicaSets.size > 0) {
          setSelectedReplicaSets(new Set());
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedReplicaSets]);

  // Handle scale action
  const handleScaleReplicaSets = () => {
    setShowContextMenu(false);

    // Determine which replicaSets to scale
    if (selectedReplicaSets.size === 0 && activeReplicaSet) {
      // Single active replicaSet
      setSelectedResourcesForScaling([activeReplicaSet]);
    } else {
      // Multiple selected replicaSets
      const replicaSetList = Array.from(selectedReplicaSets).map(key => {
        const [namespace, name] = key.split('/');
        return replicaSets.find(rs =>
          rs.metadata?.namespace === namespace && rs.metadata?.name === name
        );
      }).filter(Boolean) as any[];

      setSelectedResourcesForScaling(replicaSetList);
    }

    setShowScaleDialog(true);
  };



  // Handle delete action
  const handleDeleteClick = () => {
    setShowContextMenu(false);
    setShowDeleteDialog(true);
  };

  // Perform actual deletion
  const deleteReplicaSets = async () => {
    setShowDeleteDialog(false);

    try {
      if (selectedReplicaSets.size === 0 && activeReplicaSet) {
        // Delete single active replicaSet
        await deleteReplicaSet(activeReplicaSet);
      } else {
        // Delete all selected replicaSets
        for (const replicaSetKey of selectedReplicaSets) {
          const [namespace, name] = replicaSetKey.split('/');
          const replicaSetToDelete = replicaSets.find(rs =>
            rs.metadata?.namespace === namespace && rs.metadata?.name === name
          );

          if (replicaSetToDelete) {
            await deleteReplicaSet(replicaSetToDelete);
          }
        }
      }

      // Clear selection after deletion
      setSelectedReplicaSets(new Set());

      // Refresh replicaSet list
      // You can call your fetchAllReplicaSets function here

    } catch (error) {
      console.error('Failed to delete replicaSet(s):', error);
      setError(error instanceof Error ? error.message : 'Failed to delete replicaSet(s)');
    }
  };

  // Delete replicaSet function
  const deleteReplicaSet = async (replicaSet: any) => {
    if (!currentContext || !replicaSet.metadata?.name || !replicaSet.metadata?.namespace) return;

    // Delete with orphan propagation policy to avoid deleting pods
    await fetch(`http://localhost:4688/api/v1/clusters/${currentContext.name}/apis/apps/v1/namespaces/${replicaSet.metadata.namespace}/replicasets/${replicaSet.metadata.name}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        propagationPolicy: "Orphan"
      }),
    });
  };

  // Render the context menu
  const renderContextMenu = () => {
    if (!showContextMenu || !contextMenuPosition) return null;

    // Calculate if we need to show the menu above or below the click position
    const windowHeight = window.innerHeight;
    const menuHeight = 150; // Approximate context menu height
    const shouldShowAbove = windowHeight - contextMenuPosition.y < menuHeight;

    // Check if the replicaSet is owned by a higher resource (like Deployment)
    const hasOwner = activeReplicaSet && !!getOwnerReference(activeReplicaSet);

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
          {selectedReplicaSets.size > 1
            ? `${selectedReplicaSets.size} replicasets selected`
            : activeReplicaSet?.metadata?.name || 'ReplicaSet actions'}
        </div>

        <div
          className={`px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center ${hasOwner ? 'text-gray-400 dark:text-gray-600' : ''}`}
          onClick={handleScaleReplicaSets}
          title={hasOwner ? "Scaling this ReplicaSet may be overridden by its controller" : ""}
        >
          <Scale className="h-4 w-4 mr-2" />
          Scale {selectedReplicaSets.size > 1 ? `(${selectedReplicaSets.size})` : ''}
        </div>

        <div
          className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center text-red-600 dark:text-red-400"
          onClick={handleDeleteClick}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete {selectedReplicaSets.size > 1 ? `(${selectedReplicaSets.size})` : ''}
        </div>
      </div>,
      document.body
    );
  };

  // Delete confirmation dialog
  const renderDeleteDialog = () => {
    const hasOwner = activeReplicaSet && !!getOwnerReference(activeReplicaSet);
    const ownerWarning = hasOwner ?
      "Note: This ReplicaSet is managed by a controller. Deleting it may cause the controller to create a replacement." : "";

    return (
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-gray-100 dark:bg-[#0B0D13]">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm ReplicaSet Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedReplicaSets.size > 1
                ? `${selectedReplicaSets.size} replicasets`
                : `"${activeReplicaSet?.metadata?.name}"`}?
              This action cannot be undone.
              {ownerWarning && (
                <div className="mt-2 text-amber-600 dark:text-amber-400">
                  {ownerWarning}
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteReplicaSets}
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

  // Fetch replica sets for all selected namespaces
  const fetchAllReplicaSets = async () => {
    if (!currentContext || selectedNamespaces.length === 0) {
      setReplicaSets([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // If no namespaces are selected, fetch from all namespaces
      if (selectedNamespaces.length === 0) {
        const replicaSetsData = await listResources(currentContext.name, 'replicasets', {
          apiGroup: 'apps'
        });
        setReplicaSets(replicaSetsData);
        return;
      }

      // Fetch replica sets for each selected namespace
      const replicaSetPromises = selectedNamespaces.map(namespace =>
        listResources(currentContext.name, 'replicasets', {
          namespace,
          apiGroup: 'apps'
        })
      );

      const results = await Promise.all(replicaSetPromises);

      // Flatten the array of replica set arrays
      const allReplicaSets = results.flat();
      setReplicaSets(allReplicaSets);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch replica sets:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch replica sets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllReplicaSets();
  }, [currentContext, selectedNamespaces]);

  const handleScaleComplete = () => {
    // Refresh replicaSet list
    fetchAllReplicaSets();
  };
  // Filter replica sets based on search query
  const filteredReplicaSets = useMemo(() => {
    if (!searchQuery.trim()) {
      return replicaSets;
    }

    const lowercaseQuery = searchQuery.toLowerCase();

    return replicaSets.filter(replicaSet => {
      const name = replicaSet.metadata?.name?.toLowerCase() || '';
      const namespace = replicaSet.metadata?.namespace?.toLowerCase() || '';
      const ownerReference = replicaSet.metadata?.ownerReferences?.[0]?.name?.toLowerCase() || '';
      const labels = replicaSet.metadata?.labels || {};

      // Check if name, namespace, or owner reference contains the query
      if (
        name.includes(lowercaseQuery) ||
        namespace.includes(lowercaseQuery) ||
        ownerReference.includes(lowercaseQuery)
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
  }, [replicaSets, searchQuery]);

  // Sort replica sets based on sort state
  const sortedReplicaSets = useMemo(() => {
    if (!sort.field || !sort.direction) {
      return filteredReplicaSets;
    }

    return [...filteredReplicaSets].sort((a, b) => {
      const sortMultiplier = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'name':
          return (a.metadata?.name || '').localeCompare(b.metadata?.name || '') * sortMultiplier;

        case 'namespace':
          return (a.metadata?.namespace || '').localeCompare(b.metadata?.namespace || '') * sortMultiplier;

        case 'ready': {
          const readyA = a.status?.readyReplicas || 0;
          const readyB = b.status?.readyReplicas || 0;
          const totalA = a.spec?.replicas || 0;
          const totalB = b.spec?.replicas || 0;

          // Calculate ready percentage for more accurate sorting
          const percentA = totalA > 0 ? readyA / totalA : 0;
          const percentB = totalB > 0 ? readyB / totalB : 0;

          return (percentA - percentB) * sortMultiplier;
        }

        case 'current': {
          const currentA = a.status?.replicas || 0;
          const currentB = b.status?.replicas || 0;
          return (currentA - currentB) * sortMultiplier;
        }

        case 'desired': {
          const desiredA = a.spec?.replicas || 0;
          const desiredB = b.spec?.replicas || 0;
          return (desiredA - desiredB) * sortMultiplier;
        }

        case 'owner': {
          const ownerA = getOwnerReference(a);
          const ownerB = getOwnerReference(b);

          // First sort by owner kind
          const kindA = ownerA?.kind || '';
          const kindB = ownerB?.kind || '';
          const kindCompare = kindA.localeCompare(kindB);

          if (kindCompare !== 0) {
            return kindCompare * sortMultiplier;
          }

          // Then by owner name
          const nameA = ownerA?.name || '';
          const nameB = ownerB?.name || '';
          return nameA.localeCompare(nameB) * sortMultiplier;
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
  }, [filteredReplicaSets, sort.field, sort.direction]);

  // Get owner references
  const getOwnerReference = (replicaSet: any): { name: string, kind: string } | null => {
    const ownerRefs = replicaSet.metadata?.ownerReferences || [];
    if (ownerRefs.length > 0) {
      return {
        name: ownerRefs[0].name,
        kind: ownerRefs[0].kind
      };
    }
    return null;
  };

  const handleReplicaSetDetails = (replicaSet: any) => {
    if (replicaSet.metadata?.name && replicaSet.metadata?.namespace) {
      navigate(`/dashboard/explore/replicasets/${replicaSet.metadata.namespace}/${replicaSet.metadata.name}`);
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
      return <ArrowUpDown className="ml-1 h-4 w-4 inline opacity-20" />;
    }

    if (sort.direction === 'asc') {
      return <ArrowUp className="ml-1 h-4 w-4 inline text-blue-500" />;
    }

    if (sort.direction === 'desc') {
      return <ArrowDown className="ml-1 h-4 w-4 inline text-blue-500" />;
    }

    return null;
  };

  // Check if replica set has warning state
  const hasWarningState = (replicaSet: any): boolean => {
    const desiredReplicas = replicaSet.spec?.replicas || 0;
    const readyReplicas = replicaSet.status?.readyReplicas || 0;
    const availableReplicas = replicaSet.status?.availableReplicas || 0;

    return readyReplicas < desiredReplicas || availableReplicas < desiredReplicas;
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
          <h1 className='text-5xl font-[Anton] uppercase font-bold text-gray-800/30 dark:text-gray-700/50'>ReplicaSets</h1>
          <div className="w-full md:w-96 mt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
              <Input
                type="text"
                placeholder="Search by name, namespace, or owner..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </div>

        <div className="w-full md:w-96">
          <div className="text-sm font-medium mb-2">Namespaces</div>
          <NamespaceSelector />
        </div>
      </div>

      {/* No results message */}
      {sortedReplicaSets.length === 0 && (
        <Alert className="my-6 bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <AlertDescription>
            {searchQuery
              ? `No replica sets matching "${searchQuery}"`
              : selectedNamespaces.length === 0
                ? "Please select at least one namespace"
                : "No replica sets found in the selected namespaces"}
          </AlertDescription>
        </Alert>
      )}

      {/* ReplicaSets table */}
      {sortedReplicaSets.length > 0 && (
        <Card className="bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <div className="rounded-md border">
            {renderContextMenu()}
            {renderDeleteDialog()}
            <ScaleDialog
              isOpen={showScaleDialog}
              onClose={() => setShowScaleDialog(false)}
              onScaleComplete={handleScaleComplete}
              resources={selectedResourcesForScaling}
              resourceType="replicaset"
            />
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
                    onClick={() => handleSort('namespace')}
                  >
                    Namespace {renderSortIndicator('namespace')}
                  </TableHead>
                  <TableHead
                    className=" text-center cursor-pointer hover:text-blue-500 w-[100px]"
                    onClick={() => handleSort('ready')}
                  >
                    Ready {renderSortIndicator('ready')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500 w-[100px]"
                    onClick={() => handleSort('current')}
                  >
                    Current {renderSortIndicator('current')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500 w-[100px]"
                    onClick={() => handleSort('desired')}
                  >
                    Desired {renderSortIndicator('desired')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('owner')}
                  >
                    Owner {renderSortIndicator('owner')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500 w-[100px]"
                    onClick={() => handleSort('age')}
                  >
                    Age {renderSortIndicator('age')}
                  </TableHead>

                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedReplicaSets.map((replicaSet) => {
                  const owner = getOwnerReference(replicaSet);
                  return (
                    <TableRow
                      key={`${replicaSet.metadata?.namespace}-${replicaSet.metadata?.name}`}
                      className={`bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30 ${hasWarningState(replicaSet) ? 'bg-yellow-50 dark:bg-yellow-900/10' : ''
                        } ${selectedReplicaSets.has(`${replicaSet.metadata?.namespace}/${replicaSet.metadata?.name}`) ? 'bg-blue-50 dark:bg-gray-800/30' : ''
                        }`}
                      onClick={(e) => handleReplicaSetClick(e, replicaSet)}
                      onContextMenu={(e) => handleContextMenu(e, replicaSet)}
                    >
                      <TableCell className="font-medium">
                        <div className="hover:text-blue-500 hover:underline">
                          {replicaSet.metadata?.name}
                        </div>
                      </TableCell>
                      <TableCell>{replicaSet.metadata?.namespace}</TableCell>
                      <TableCell className="text-center">
                        {`${replicaSet.status?.readyReplicas || 0}/${replicaSet.spec?.replicas || 0}`}
                      </TableCell>
                      <TableCell className="text-center">
                        {replicaSet.status?.replicas || 0}
                      </TableCell>
                      <TableCell className="text-center">
                        {replicaSet.spec?.replicas || 0}
                      </TableCell>
                      <TableCell>
                        {owner ? (
                          <div className="flex items-center gap-1">
                            <span className="px-2 py-1 rounded-[0.3rem] text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300">
                              {owner.kind}
                            </span>
                            <span className="hover:text-blue-500 hover:underline">
                              {owner.name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-500 dark:text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {calculateAge(replicaSet.metadata?.creationTimestamp?.toString())}
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
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
};

export default ReplicaSets;