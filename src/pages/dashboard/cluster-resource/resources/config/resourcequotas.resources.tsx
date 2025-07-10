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
import { ErrorComponent, NamespaceSelector } from '@/components/custom';
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

// Define types for ResourceQuota
interface ResourceQuotaSpec {
  hard: { [key: string]: string };
  scopes?: string[];
  scopeSelector?: {
    matchExpressions: Array<{
      scopeName: string;
      operator: string;
      values?: string[];
    }>;
  };
}

interface ResourceQuotaStatus {
  hard: { [key: string]: string };
  used: { [key: string]: string };
}

interface V1ResourceQuota {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    namespace?: string;
    creationTimestamp?: string;
    labels?: { [key: string]: string };
    annotations?: { [key: string]: string };
  };
  spec?: ResourceQuotaSpec;
  status?: ResourceQuotaStatus;
}

// Define sorting types
type SortDirection = 'asc' | 'desc' | null;
type SortField = 'name' | 'namespace' | 'resourceCount' | 'usagePercent' | 'age' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

const ResourceQuotas: React.FC = () => {
  const navigate = useNavigate();
  const { currentContext } = useCluster();
  const { selectedNamespaces } = useNamespace();
  const [resourceQuotas, setResourceQuotas] = useState<V1ResourceQuota[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // --- Start of Multi-select ---
  const [selectedQuotas, setSelectedQuotas] = useState<Set<string>>(new Set());
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [activeQuota, setActiveQuota] = useState<V1ResourceQuota | null>(null);
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

  // Add click handler for quota selection with cmd/ctrl key
  const handleQuotaClick = (e: React.MouseEvent, quota: V1ResourceQuota) => {
    const quotaKey = `${quota.metadata?.namespace}/${quota.metadata?.name}`;

    if (e.metaKey || e.ctrlKey) {
      // Prevent navigation when using multi-select
      e.preventDefault();
      e.stopPropagation();

      setSelectedQuotas(prev => {
        const newSelection = new Set(prev);
        if (newSelection.has(quotaKey)) {
          newSelection.delete(quotaKey);
        } else {
          newSelection.add(quotaKey);
        }
        return newSelection;
      });
    } else if (!selectedQuotas.has(quotaKey)) {
      // Clear selection on regular click (unless clicking on already selected quota)
      setSelectedQuotas(new Set());
      handleResourceQuotaDetails(quota);
    } else {
      handleResourceQuotaDetails(quota);
    }
  };

  // Add context menu handlers
  const handleContextMenu = (e: React.MouseEvent, quota: V1ResourceQuota) => {
    e.preventDefault();
    e.stopPropagation();

    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setActiveQuota(quota);
    setShowContextMenu(true);

    // Multi-select support: if quota isn't in selection, make it the only selection
    const quotaKey = `${quota.metadata?.namespace}/${quota.metadata?.name}`;
    if (!selectedQuotas.has(quotaKey)) {
      setSelectedQuotas(new Set([quotaKey]));
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

        if (isOutsideTable && !isContextMenuClick && !isAlertDialogClick && selectedQuotas.size > 0) {
          setSelectedQuotas(new Set());
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedQuotas]);

  // Handle view action
  const handleViewQuota = () => {
    setShowContextMenu(false);

    if (activeQuota && activeQuota.metadata?.name && activeQuota.metadata?.namespace) {
      navigate(`/dashboard/explore/resourcequotas/${activeQuota.metadata.namespace}/${activeQuota.metadata.name}`);
    }
  };

  const handleViewQuotaMenuItem = (e: React.MouseEvent, quota: V1ResourceQuota) => {
    e.stopPropagation();
    if (quota.metadata?.name && quota.metadata?.namespace) {
      navigate(`/dashboard/explore/resourcequotas/${quota.metadata.namespace}/${quota.metadata.name}`);
    }
  };

  const handleDeleteQuotaMenuItem = (e: React.MouseEvent, quota: V1ResourceQuota) => {
    e.stopPropagation();
    setActiveQuota(quota);
    setSelectedQuotas(new Set([`${quota.metadata?.namespace}/${quota.metadata?.name}`]));
    setShowDeleteDialog(true);
  };

  // Handle delete action
  const handleDeleteClick = () => {
    setShowContextMenu(false);
    setShowDeleteDialog(true);
  };

  // Perform actual deletion
  const deleteQuotas = async () => {
    setShowDeleteDialog(false);

    try {
      if (selectedQuotas.size === 0 && activeQuota) {
        // Delete single active quota
        await deleteQuota(activeQuota);
      } else {
        // Delete all selected quotas
        for (const quotaKey of selectedQuotas) {
          const [namespace, name] = quotaKey.split('/');
          const quotaToDelete = resourceQuotas.find(q =>
            q.metadata?.namespace === namespace && q.metadata?.name === name
          );

          if (quotaToDelete) {
            await deleteQuota(quotaToDelete);
          }
        }
      }

      // Clear selection after deletion
      setSelectedQuotas(new Set());

      // Refresh quota list after deletion
      if (currentContext && selectedNamespaces.length > 0) {
        const fetchQuotas = async () => {
          try {
            setLoading(true);

            // Fetch resource quotas for each selected namespace
            const quotaPromises = selectedNamespaces.map(namespace =>
              listResources(currentContext.name, 'resourcequotas', { namespace })
            );

            const results = await Promise.all(quotaPromises);
            const allQuotas = results.flat();

            setResourceQuotas(allQuotas);
            setError(null);
          } catch (err) {
            console.error('Failed to fetch resource quotas:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch resource quotas');
          } finally {
            setLoading(false);
          }
        };

        fetchQuotas();
      }

    } catch (error) {
      console.error('Failed to delete quota(s):', error);
      setError(error instanceof Error ? error.message : 'Failed to delete quota(s)');
    }
  };

  // Delete quota function
  const deleteQuota = async (quota: V1ResourceQuota) => {
    if (!currentContext || !quota.metadata?.name || !quota.metadata?.namespace) return;

    await deleteResource(
      currentContext.name,
      'resourcequotas',
      quota.metadata.name,
      { namespace: quota.metadata.namespace }
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
          {selectedQuotas.size > 1
            ? `${selectedQuotas.size} ResourceQuotas selected`
            : activeQuota?.metadata?.name || 'ResourceQuota actions'}
        </div>

        <div
          className={`px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center ${selectedQuotas.size > 1 ? 'text-gray-400 dark:text-gray-600 pointer-events-none' : ''}`}
          onClick={selectedQuotas.size <= 1 ? handleViewQuota : undefined}
          title={selectedQuotas.size > 1 ? "Select only one ResourceQuota to view" : ""}
        >
          <Eye className="h-4 w-4 mr-2" />
          View
        </div>

        <div
          className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center text-red-600 dark:text-red-400"
          onClick={handleDeleteClick}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete {selectedQuotas.size > 1 ? `(${selectedQuotas.size})` : ''}
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
            <AlertDialogTitle>Confirm ResourceQuota Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedQuotas.size > 1
                ? `${selectedQuotas.size} ResourceQuotas`
                : `"${activeQuota?.metadata?.name}"`}?
              This action cannot be undone.

              <div className="mt-2 text-amber-600 dark:text-amber-400">
                Warning: Deleting ResourceQuotas may affect resource limits and constraints in your namespace.
                This may impact the ability to create new resources.
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteQuotas}
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

  // Fetch resource quotas for all selected namespaces
  useEffect(() => {
    const fetchAllResourceQuotas = async () => {
      if (!currentContext || selectedNamespaces.length === 0) {
        setResourceQuotas([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // If no namespaces are selected, fetch from all namespaces
        if (selectedNamespaces.length === 0) {
          const resourceQuotasData = await listResources(currentContext.name, 'resourcequotas');
          setResourceQuotas(resourceQuotasData);
          return;
        }

        // Fetch resource quotas for each selected namespace
        const quotaPromises = selectedNamespaces.map(namespace =>
          listResources(currentContext.name, 'resourcequotas', { namespace })
        );

        const results = await Promise.all(quotaPromises);

        // Flatten the array of quota arrays
        const allQuotas = results.flat();
        setResourceQuotas(allQuotas);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch resource quotas:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch resource quotas');
      } finally {
        setLoading(false);
      }
    };

    fetchAllResourceQuotas();
  }, [currentContext, selectedNamespaces]);

  // Filter resource quotas based on search query
  const filteredResourceQuotas = useMemo(() => {
    if (!searchQuery.trim()) {
      return resourceQuotas;
    }

    const lowercaseQuery = searchQuery.toLowerCase();

    return resourceQuotas.filter(quota => {
      const name = quota.metadata?.name?.toLowerCase() || '';
      const namespace = quota.metadata?.namespace?.toLowerCase() || '';
      const labels = quota.metadata?.labels || {};
      const annotations = quota.metadata?.annotations || {};
      const scopes = quota.spec?.scopes?.join(' ').toLowerCase() || '';

      // Check if any resource name contains the query
      const resourceMatches = Object.keys(quota.spec?.hard || {}).some(
        key => key.toLowerCase().includes(lowercaseQuery)
      );

      // Check if name, namespace, scopes, or any resource contains the query
      if (
        name.includes(lowercaseQuery) ||
        namespace.includes(lowercaseQuery) ||
        scopes.includes(lowercaseQuery) ||
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
  }, [resourceQuotas, searchQuery]);

  // Calculate average usage percentage for a resource quota
  const calculateAverageUsage = (quota: V1ResourceQuota): number => {
    const hard = quota.status?.hard || {};
    const used = quota.status?.used || {};

    let totalPercentage = 0;
    let countedResources = 0;

    // For each hard limit, calculate percentage if used value exists
    Object.keys(hard).forEach(key => {
      if (used[key]) {
        const hardValue = parseResourceValue(hard[key]);
        const usedValue = parseResourceValue(used[key]);

        if (hardValue > 0) {
          totalPercentage += (usedValue / hardValue) * 100;
          countedResources++;
        }
      }
    });

    return countedResources > 0 ? totalPercentage / countedResources : 0;
  };

  // Parse resource value from string (handles units like m, Ki, Mi, Gi, etc.)
  const parseResourceValue = (value: string): number => {
    if (!value) return 0;

    // Handle CPU millicores (e.g., "100m")
    if (value.endsWith('m')) {
      return parseFloat(value.slice(0, -1)) / 1000;
    }

    // Handle binary units (Ki, Mi, Gi, etc.)
    if (value.endsWith('Ki')) {
      return parseFloat(value.slice(0, -2)) * 1024;
    }
    if (value.endsWith('Mi')) {
      return parseFloat(value.slice(0, -2)) * 1024 * 1024;
    }
    if (value.endsWith('Gi')) {
      return parseFloat(value.slice(0, -2)) * 1024 * 1024 * 1024;
    }
    if (value.endsWith('Ti')) {
      return parseFloat(value.slice(0, -2)) * 1024 * 1024 * 1024 * 1024;
    }

    // Handle decimal units (k, M, G, etc.)
    if (value.endsWith('k')) {
      return parseFloat(value.slice(0, -1)) * 1000;
    }
    if (value.endsWith('M')) {
      return parseFloat(value.slice(0, -1)) * 1000 * 1000;
    }
    if (value.endsWith('G')) {
      return parseFloat(value.slice(0, -1)) * 1000 * 1000 * 1000;
    }
    if (value.endsWith('T')) {
      return parseFloat(value.slice(0, -1)) * 1000 * 1000 * 1000 * 1000;
    }

    // Handle plain numbers
    return parseFloat(value);
  };

  // Sort resource quotas based on sort state
  const sortedResourceQuotas = useMemo(() => {
    if (!sort.field || !sort.direction) {
      return filteredResourceQuotas;
    }

    return [...filteredResourceQuotas].sort((a, b) => {
      const sortMultiplier = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'name':
          return (a.metadata?.name || '').localeCompare(b.metadata?.name || '') * sortMultiplier;

        case 'namespace':
          return (a.metadata?.namespace || '').localeCompare(b.metadata?.namespace || '') * sortMultiplier;

        case 'resourceCount': {
          const countA = Object.keys(a.spec?.hard || {}).length;
          const countB = Object.keys(b.spec?.hard || {}).length;
          return (countA - countB) * sortMultiplier;
        }

        case 'usagePercent': {
          const usageA = calculateAverageUsage(a);
          const usageB = calculateAverageUsage(b);
          return (usageA - usageB) * sortMultiplier;
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
  }, [filteredResourceQuotas, sort.field, sort.direction]);

  const handleResourceQuotaDetails = (quota: V1ResourceQuota) => {
    if (quota.metadata?.name && quota.metadata?.namespace) {
      navigate(`/dashboard/explore/resourcequotas/${quota.metadata.namespace}/${quota.metadata.name}`);
    }
  };

  // Format scopes for display
  const formatScopes = (quota: V1ResourceQuota): JSX.Element | string => {
    const scopes = quota.spec?.scopes || [];

    if (scopes.length === 0) {
      return <span className="text-gray-500 dark:text-gray-400">None</span>;
    }

    return (
      <div className="flex flex-wrap gap-1">
        {scopes.map((scope, index) => (
          <span
            key={index}
            className="px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300"
          >
            {scope}
          </span>
        ))}
      </div>
    );
  };

  // Format resources with usage for display
  const formatResourcesWithUsage = (quota: V1ResourceQuota): JSX.Element => {
    const hard = quota.status?.hard || {};
    const used = quota.status?.used || {};
    const resourceKeys = Object.keys(hard);

    if (resourceKeys.length === 0) {
      return <span className="text-gray-500 dark:text-gray-400">No resources defined</span>;
    }

    // Group resources by type for better display
    const resourceGroups = {
      cpu: resourceKeys.filter(key => key.endsWith('cpu')),
      memory: resourceKeys.filter(key => key.endsWith('memory')),
      storage: resourceKeys.filter(key => key.includes('storage')),
      pods: resourceKeys.filter(key => key.endsWith('pods')),
      other: resourceKeys.filter(key =>
        !key.endsWith('cpu') &&
        !key.endsWith('memory') &&
        !key.includes('storage') &&
        !key.endsWith('pods')
      )
    };

    // Only show the first few resources if there are many
    const MAX_RESOURCES_TO_SHOW = 3;
    let shownResources = 0;

    return (
      <div className="space-y-1 text-sm">
        {Object.entries(resourceGroups).map(([groupName, resources]) => {
          if (resources.length === 0) return null;

          return (
            <div key={groupName}>
              {resources.slice(0, MAX_RESOURCES_TO_SHOW - shownResources).map((key, index) => {
                shownResources++;

                const hardValue = hard[key];
                const usedValue = used[key] || '0';
                const usagePercent = parseResourceValue(usedValue) / parseResourceValue(hardValue) * 100;

                // Determine color based on usage
                let usageColor = 'text-green-600 dark:text-green-500';
                if (usagePercent > 90) {
                  usageColor = 'text-red-600 dark:text-red-500';
                } else if (usagePercent > 75) {
                  usageColor = 'text-amber-600 dark:text-amber-500';
                }

                return (
                  <div key={key} className="flex justify-between">
                    <span className="font-medium">{key}:</span>
                    <span className={usageColor}>
                      {usedValue}/{hardValue} ({Math.round(usagePercent)}%)
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Show indicator if there are more resources */}
        {resourceKeys.length > shownResources && (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            +{resourceKeys.length - shownResources} more resources
          </div>
        )}
      </div>
    );
  };

  // Calculate average usage and return appropriate color
  const getUsageDisplay = (quota: V1ResourceQuota): JSX.Element => {
    const avgUsage = calculateAverageUsage(quota);

    let usageColor = 'text-green-600 dark:text-green-500';
    if (avgUsage > 90) {
      usageColor = 'text-red-600 dark:text-red-500';
    } else if (avgUsage > 75) {
      usageColor = 'text-amber-600 dark:text-amber-500';
    }

    return (
      <div className={`font-medium ${usageColor}`}>
        {Math.round(avgUsage)}%
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
          <h1 className='text-5xl font-[Anton] uppercase font-bold text-gray-800/30 dark:text-gray-700/50'>Resource Quotas</h1>
          <div className="w-full md:w-96 mt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
              <Input
                type="text"
                placeholder="Search by name, namespace, or resource..."
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
      {sortedResourceQuotas.length === 0 && (
        <Alert className="my-6 bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <AlertDescription>
            {searchQuery
              ? `No resource quotas matching "${searchQuery}"`
              : selectedNamespaces.length === 0
                ? "Please select at least one namespace"
                : "No resource quotas found in the selected namespaces"}
          </AlertDescription>
        </Alert>
      )}

      {/* ResourceQuotas table */}
      {sortedResourceQuotas.length > 0 && (
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
                  <TableHead>
                    Scopes
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:text-blue-500 text-center"
                    onClick={() => handleSort('resourceCount')}
                  >
                    Resources {renderSortIndicator('resourceCount')}
                  </TableHead>
                  <TableHead>
                    Usage Details
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('usagePercent')}
                  >
                    Avg Usage {renderSortIndicator('usagePercent')}
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
                {sortedResourceQuotas.map((quota) => (
                  <TableRow
                    key={`${quota.metadata?.namespace}-${quota.metadata?.name}`}
                    className={`bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30 ${selectedQuotas.has(`${quota.metadata?.namespace}/${quota.metadata?.name}`) ? 'bg-blue-50 dark:bg-gray-800/30' : ''
                      }`}
                    onClick={(e) => handleQuotaClick(e, quota)}
                    onContextMenu={(e) => handleContextMenu(e, quota)}
                  >
                    <TableCell className="font-medium" onClick={() => handleResourceQuotaDetails(quota)}>
                      <div className="hover:text-blue-500 hover:underline">
                        {quota.metadata?.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="hover:text-blue-500 hover:underline" onClick={() => navigate(`/dashboard/explore/namespaces`)}>
                        {quota.metadata?.namespace}
                      </div>
                    </TableCell>
                    <TableCell>
                      {formatScopes(quota)}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="px-2 py-1 rounded-[0.3rem] text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
                        {Object.keys(quota.spec?.hard || {}).length}
                      </span>
                    </TableCell>
                    <TableCell>
                      {formatResourcesWithUsage(quota)}
                    </TableCell>
                    <TableCell className="text-center">
                      {getUsageDisplay(quota)}
                    </TableCell>
                    <TableCell className="text-center">
                      {calculateAge(quota.metadata?.creationTimestamp?.toString())}
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
                          <DropdownMenuItem onClick={(e) => handleViewQuotaMenuItem(e, quota)} className='hover:text-gray-700 dark:hover:text-gray-500'>
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-500 dark:text-red-400 focus:text-red-500 dark:focus:text-red-400 hover:text-red-700 dark:hover:text-red-500"
                            onClick={(e) => handleDeleteQuotaMenuItem(e, quota)}
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

export default ResourceQuotas;