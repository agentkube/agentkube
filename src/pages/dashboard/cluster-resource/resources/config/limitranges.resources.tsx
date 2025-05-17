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
import { NamespaceSelector, ErrorComponent } from '@/components/custom';
import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, Eye } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { deleteResource } from '@/api/internal/resources';

// Define types for LimitRange
interface LimitRangeItem {
  type: string;
  max?: { [key: string]: string };
  min?: { [key: string]: string };
  default?: { [key: string]: string };
  defaultRequest?: { [key: string]: string };
  maxLimitRequestRatio?: { [key: string]: string };
}

interface LimitRangeSpec {
  limits: LimitRangeItem[];
}

interface V1LimitRange {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    namespace?: string;
    creationTimestamp?: string;
    labels?: { [key: string]: string };
    annotations?: { [key: string]: string };
  };
  spec?: LimitRangeSpec;
}

// Define sorting types
type SortDirection = 'asc' | 'desc' | null;
type SortField = 'name' | 'namespace' | 'limitCount' | 'types' | 'age' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

const LimitRanges: React.FC = () => {
  const navigate = useNavigate();
  const { currentContext } = useCluster();
  const { selectedNamespaces } = useNamespace();
  const [limitRanges, setLimitRanges] = useState<V1LimitRange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // --- Start of Multi-select ---
  const [selectedLimitRanges, setSelectedLimitRanges] = useState<Set<string>>(new Set());
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [activeLimitRange, setActiveLimitRange] = useState<V1LimitRange | null>(null);
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
  
  // Add click handler for LimitRange selection with cmd/ctrl key
  const handleLimitRangeClick = (e: React.MouseEvent, limitRange: V1LimitRange) => {
    const limitRangeKey = `${limitRange.metadata?.namespace}/${limitRange.metadata?.name}`;

    if (e.metaKey || e.ctrlKey) {
      // Prevent navigation when using multi-select
      e.preventDefault();
      e.stopPropagation();

      setSelectedLimitRanges(prev => {
        const newSelection = new Set(prev);
        if (newSelection.has(limitRangeKey)) {
          newSelection.delete(limitRangeKey);
        } else {
          newSelection.add(limitRangeKey);
        }
        return newSelection;
      });
    } else if (!selectedLimitRanges.has(limitRangeKey)) {
      // Clear selection on regular click (unless clicking on already selected limitRange)
      setSelectedLimitRanges(new Set());
      handleLimitRangeDetails(limitRange);
    } else {
      handleLimitRangeDetails(limitRange);
    }
  };

  // Add context menu handlers
  const handleContextMenu = (e: React.MouseEvent, limitRange: V1LimitRange) => {
    e.preventDefault();
    e.stopPropagation();

    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setActiveLimitRange(limitRange);
    setShowContextMenu(true);

    // Multi-select support: if limitRange isn't in selection, make it the only selection
    const limitRangeKey = `${limitRange.metadata?.namespace}/${limitRange.metadata?.name}`;
    if (!selectedLimitRanges.has(limitRangeKey)) {
      setSelectedLimitRanges(new Set([limitRangeKey]));
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

        if (isOutsideTable && !isContextMenuClick && !isAlertDialogClick && selectedLimitRanges.size > 0) {
          setSelectedLimitRanges(new Set());
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedLimitRanges]);

  // Handle view action - only available for a single LimitRange
  const handleViewLimitRange = () => {
    setShowContextMenu(false);

    if (activeLimitRange && activeLimitRange.metadata?.name && activeLimitRange.metadata?.namespace) {
      navigate(`/dashboard/explore/limitranges/${activeLimitRange.metadata.namespace}/${activeLimitRange.metadata.name}`);
    }
  };

  // Handle delete action
  const handleDeleteClick = () => {
    setShowContextMenu(false);
    setShowDeleteDialog(true);
  };

  // Perform actual deletion
  const deleteLimitRanges = async () => {
    setShowDeleteDialog(false);

    try {
      if (selectedLimitRanges.size === 0 && activeLimitRange) {
        // Delete single active LimitRange
        await deleteLimitRange(activeLimitRange);
      } else {
        // Delete all selected LimitRanges
        for (const limitRangeKey of selectedLimitRanges) {
          const [namespace, name] = limitRangeKey.split('/');
          const limitRangeToDelete = limitRanges.find(lr =>
            lr.metadata?.namespace === namespace && lr.metadata?.name === name
          );

          if (limitRangeToDelete) {
            await deleteLimitRange(limitRangeToDelete);
          }
        }
      }

      // Clear selection after deletion
      setSelectedLimitRanges(new Set());

      // Refresh LimitRange list after deletion
      if (currentContext && selectedNamespaces.length > 0) {
        const fetchLimitRanges = async () => {
          try {
            setLoading(true);

            // Fetch limit ranges for each selected namespace
            const limitRangePromises = selectedNamespaces.map(namespace =>
              listResources(currentContext.name, 'limitranges', { namespace })
            );

            const results = await Promise.all(limitRangePromises);
            const allLimitRanges = results.flat();

            setLimitRanges(allLimitRanges);
            setError(null);
          } catch (err) {
            console.error('Failed to fetch limit ranges:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch limit ranges');
          } finally {
            setLoading(false);
          }
        };

        fetchLimitRanges();
      }

    } catch (error) {
      console.error('Failed to delete LimitRange(s):', error);
      setError(error instanceof Error ? error.message : 'Failed to delete LimitRange(s)');
    }
  };

  // Delete LimitRange function
  const deleteLimitRange = async (limitRange: V1LimitRange) => {
    if (!currentContext || !limitRange.metadata?.name || !limitRange.metadata?.namespace) return;

    await deleteResource(
      currentContext.name,
      'limitranges',
      limitRange.metadata.name,
      { namespace: limitRange.metadata.namespace }
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
          {selectedLimitRanges.size > 1
            ? `${selectedLimitRanges.size} LimitRanges selected`
            : activeLimitRange?.metadata?.name || 'LimitRange actions'}
        </div>

        <div
          className={`px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center ${selectedLimitRanges.size > 1 ? 'text-gray-400 dark:text-gray-600 pointer-events-none' : ''}`}
          onClick={selectedLimitRanges.size <= 1 ? handleViewLimitRange : undefined}
          title={selectedLimitRanges.size > 1 ? "Select only one LimitRange to view" : ""}
        >
          <Eye className="h-4 w-4 mr-2" />
          View
        </div>

        <div
          className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center text-red-600 dark:text-red-400"
          onClick={handleDeleteClick}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete {selectedLimitRanges.size > 1 ? `(${selectedLimitRanges.size})` : ''}
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
            <AlertDialogTitle>Confirm LimitRange Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedLimitRanges.size > 1
                ? `${selectedLimitRanges.size} LimitRanges`
                : `"${activeLimitRange?.metadata?.name}"`}?
              This action cannot be undone.

              <div className="mt-2 text-amber-600 dark:text-amber-400">
                Warning: Deleting LimitRanges may affect resource constraints in the namespace.
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteLimitRanges}
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

  // Fetch limit ranges for all selected namespaces
  useEffect(() => {
    const fetchAllLimitRanges = async () => {
      if (!currentContext || selectedNamespaces.length === 0) {
        setLimitRanges([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // If no namespaces are selected, fetch from all namespaces
        if (selectedNamespaces.length === 0) {
          const limitRangesData = await listResources(currentContext.name, 'limitranges');
          setLimitRanges(limitRangesData);
          return;
        }

        // Fetch limit ranges for each selected namespace
        const limitRangePromises = selectedNamespaces.map(namespace =>
          listResources(currentContext.name, 'limitranges', { namespace })
        );

        const results = await Promise.all(limitRangePromises);

        // Flatten the array of limit range arrays
        const allLimitRanges = results.flat();
        setLimitRanges(allLimitRanges);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch limit ranges:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch limit ranges');
      } finally {
        setLoading(false);
      }
    };

    fetchAllLimitRanges();
  }, [currentContext, selectedNamespaces]);

  // Filter limit ranges based on search query
  const filteredLimitRanges = useMemo(() => {
    if (!searchQuery.trim()) {
      return limitRanges;
    }

    const lowercaseQuery = searchQuery.toLowerCase();

    return limitRanges.filter(limitRange => {
      const name = limitRange.metadata?.name?.toLowerCase() || '';
      const namespace = limitRange.metadata?.namespace?.toLowerCase() || '';
      const labels = limitRange.metadata?.labels || {};
      const annotations = limitRange.metadata?.annotations || {};

      // Check if any limit type contains the query
      const typeMatches = (limitRange.spec?.limits || []).some(limit =>
        limit.type.toLowerCase().includes(lowercaseQuery)
      );

      // Check if any resource name contains the query
      const resourceMatches = (limitRange.spec?.limits || []).some(limit => {
        // Check all constraint types (max, min, default, etc.)
        return [
          ...Object.keys(limit.max || {}),
          ...Object.keys(limit.min || {}),
          ...Object.keys(limit.default || {}),
          ...Object.keys(limit.defaultRequest || {}),
          ...Object.keys(limit.maxLimitRequestRatio || {})
        ].some(key => key.toLowerCase().includes(lowercaseQuery));
      });

      // Check if name, namespace, types, or any resource contains the query
      if (
        name.includes(lowercaseQuery) ||
        namespace.includes(lowercaseQuery) ||
        typeMatches ||
        resourceMatches
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
  }, [limitRanges, searchQuery]);

  // Sort limit ranges based on sort state
  const sortedLimitRanges = useMemo(() => {
    if (!sort.field || !sort.direction) {
      return filteredLimitRanges;
    }

    return [...filteredLimitRanges].sort((a, b) => {
      const sortMultiplier = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'name':
          return (a.metadata?.name || '').localeCompare(b.metadata?.name || '') * sortMultiplier;

        case 'namespace':
          return (a.metadata?.namespace || '').localeCompare(b.metadata?.namespace || '') * sortMultiplier;

        case 'limitCount': {
          const countA = a.spec?.limits?.length || 0;
          const countB = b.spec?.limits?.length || 0;
          return (countA - countB) * sortMultiplier;
        }

        case 'types': {
          // Sort based on the types of limits (Container, Pod, etc.)
          const typesA = (a.spec?.limits || []).map(limit => limit.type).sort().join(',');
          const typesB = (b.spec?.limits || []).map(limit => limit.type).sort().join(',');
          return typesA.localeCompare(typesB) * sortMultiplier;
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
  }, [filteredLimitRanges, sort.field, sort.direction]);

  const handleLimitRangeDetails = (limitRange: V1LimitRange) => {
    if (limitRange.metadata?.name && limitRange.metadata?.namespace) {
      navigate(`/dashboard/explore/limitranges/${limitRange.metadata.namespace}/${limitRange.metadata.name}`);
    }
  };

  // Format limit types for display
  const formatLimitTypes = (limitRange: V1LimitRange): JSX.Element => {
    const limits = limitRange.spec?.limits || [];

    if (limits.length === 0) {
      return <span className="text-gray-500 dark:text-gray-400">None</span>;
    }

    return (
      <div className="flex flex-wrap gap-1">
        {limits.map((limit, index) => (
          <span
            key={index}
            className="px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300"
          >
            {limit.type}
          </span>
        ))}
      </div>
    );
  };

  // Format a single limit constraint for display
  const formatLimitConstraint = (
    type: string,
    constraints: { [key: string]: { [key: string]: string } }
  ): JSX.Element | null => {
    const entries = Object.entries(constraints);

    if (entries.length === 0) {
      return null;
    }

    return (
      <div className="mb-2">
        <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{type}</div>
        <div className="pl-2 space-y-1">
          {entries.map(([constraintType, resources]) => (
            <div key={constraintType} className="text-xs">
              <span className="font-medium">{constraintType}: </span>
              {Object.entries(resources).map(([resource, value], i, arr) => (
                <span key={resource}>
                  {resource}: {value}{i < arr.length - 1 ? ', ' : ''}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Format limits for display
  const formatLimits = (limitRange: V1LimitRange): JSX.Element => {
    const limits = limitRange.spec?.limits || [];

    if (limits.length === 0) {
      return <span className="text-gray-500 dark:text-gray-400">No limits defined</span>;
    }

    // Group constraints by type (Container, Pod, etc.)
    const constraintsByType: { [key: string]: { [key: string]: { [key: string]: string } } } = {};

    // Process each limit item
    limits.forEach(limit => {
      const type = limit.type;

      if (!constraintsByType[type]) {
        constraintsByType[type] = {};
      }

      // Add each constraint type (max, min, etc.) if it exists
      if (limit.max && Object.keys(limit.max).length > 0) {
        constraintsByType[type].max = limit.max;
      }

      if (limit.min && Object.keys(limit.min).length > 0) {
        constraintsByType[type].min = limit.min;
      }

      if (limit.default && Object.keys(limit.default).length > 0) {
        constraintsByType[type].default = limit.default;
      }

      if (limit.defaultRequest && Object.keys(limit.defaultRequest).length > 0) {
        constraintsByType[type].defaultRequest = limit.defaultRequest;
      }

      if (limit.maxLimitRequestRatio && Object.keys(limit.maxLimitRequestRatio).length > 0) {
        constraintsByType[type].maxLimitRequestRatio = limit.maxLimitRequestRatio;
      }
    });

    // Get a short preview if there are multiple types
    if (Object.keys(constraintsByType).length > 1) {
      // Take first type as preview
      const previewType = Object.keys(constraintsByType)[0];
      const remainingCount = Object.keys(constraintsByType).length - 1;

      return (
        <div>
          {formatLimitConstraint(previewType, constraintsByType[previewType])}
          <div className="text-xs text-gray-500 dark:text-gray-400">
            +{remainingCount} more resource types
          </div>
        </div>
      );
    }

    // If only one type, show all its constraints
    const onlyType = Object.keys(constraintsByType)[0];
    return formatLimitConstraint(onlyType, constraintsByType[onlyType]) ||
      <span className="text-gray-500 dark:text-gray-400">No constraints defined</span>;
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
          <h1 className='text-5xl font-[Anton] uppercase font-bold text-gray-800/30 dark:text-gray-700/50'>Limit Ranges</h1>
          <div className="w-full md:w-96 mt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
              <Input
                type="text"
                placeholder="Search by name, namespace, or resource type..."
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
      {sortedLimitRanges.length === 0 && (
        <Alert className="my-6">
          <AlertDescription>
            {searchQuery
              ? `No limit ranges matching "${searchQuery}"`
              : selectedNamespaces.length === 0
                ? "Please select at least one namespace"
                : "No limit ranges found in the selected namespaces"}
          </AlertDescription>
        </Alert>
      )}

      {/* LimitRanges table */}
      {sortedLimitRanges.length > 0 && (
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
                    onClick={() => handleSort('namespace')}
                  >
                    Namespace {renderSortIndicator('namespace')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('types')}
                  >
                    Types {renderSortIndicator('types')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('limitCount')}
                  >
                    Limit Count {renderSortIndicator('limitCount')}
                  </TableHead>
                  <TableHead>
                    Constraints
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
                {sortedLimitRanges.map((limitRange) => (
                  <TableRow
                    key={`${limitRange.metadata?.namespace}-${limitRange.metadata?.name}`}
                    className={`bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30 ${selectedLimitRanges.has(`${limitRange.metadata?.namespace}/${limitRange.metadata?.name}`) ? 'bg-blue-50 dark:bg-gray-800/30' : ''
                      }`}
                    onClick={(e) => handleLimitRangeClick(e, limitRange)}
                    onContextMenu={(e) => handleContextMenu(e, limitRange)}
                  >
                    <TableCell className="font-medium" onClick={() => handleLimitRangeDetails(limitRange)}>
                      <div className="hover:text-blue-500 hover:underline">
                        {limitRange.metadata?.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="hover:text-blue-500 hover:underline" onClick={() => navigate(`/dashboard/explore/namespaces`)}>
                        {limitRange.metadata?.namespace}
                      </div>
                    </TableCell>
                    <TableCell>
                      {formatLimitTypes(limitRange)}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="px-2 py-1 rounded-[0.3rem] text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
                        {limitRange.spec?.limits?.length || 0}
                      </span>
                    </TableCell>
                    <TableCell>
                      {formatLimits(limitRange)}
                    </TableCell>
                    <TableCell className="text-center">
                      {calculateAge(limitRange.metadata?.creationTimestamp?.toString())}
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

export default LimitRanges;