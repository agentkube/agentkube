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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Trash } from "lucide-react";
import { Trash2, Eye, Sparkles } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { deleteResource } from '@/api/internal/resources';
import { useDrawer } from '@/contexts/useDrawer';
import { resourceToEnrichedSearchResult } from '@/utils/resource-to-enriched.utils';
import { toast } from '@/hooks/use-toast';
import { useReconMode } from '@/contexts/useRecon';
import { ResourceFilterSidebar, type ColumnConfig } from '@/components/custom';
import { Filter } from 'lucide-react';
import { getStoredColumnConfig, saveColumnConfig, clearColumnConfig } from '@/utils/columnConfigStorage';

// Define types for Endpoints (not available in kubernetes-client-node)
interface V1EndpointPort {
  name?: string;
  port?: number;
  protocol?: string;
  appProtocol?: string;
}

interface V1EndpointAddress {
  ip?: string;
  hostname?: string;
  nodeName?: string;
  targetRef?: {
    kind?: string;
    namespace?: string;
    name?: string;
    uid?: string;
  };
}

interface V1EndpointSubset {
  addresses?: V1EndpointAddress[];
  notReadyAddresses?: V1EndpointAddress[];
  ports?: V1EndpointPort[];
}

interface V1Endpoints {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    namespace?: string;
    creationTimestamp?: string;
    labels?: { [key: string]: string };
    annotations?: { [key: string]: string };
  };
  subsets?: V1EndpointSubset[];
}

// Define sorting types
type SortDirection = 'asc' | 'desc' | null;
type SortField = 'name' | 'namespace' | 'endpoints' | 'ports' | 'age' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

const Endpoints: React.FC = () => {
  const navigate = useNavigate();
  const { currentContext } = useCluster();
  const { selectedNamespaces } = useNamespace();
  const [endpoints, setEndpoints] = useState<V1Endpoints[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const { isReconMode } = useReconMode();

  // Column visibility state
  const [showFilterSidebar, setShowFilterSidebar] = useState(false);

  const defaultColumnConfig: ColumnConfig[] = [
    { key: 'name', label: 'Name', visible: true, canToggle: false }, // Required column
    { key: 'namespace', label: 'Namespace', visible: true, canToggle: true },
    { key: 'endpoints', label: 'Endpoints (Ready)', visible: true, canToggle: true },
    { key: 'ports', label: 'Ports', visible: true, canToggle: true },
    { key: 'age', label: 'Age', visible: true, canToggle: true },
    { key: 'actions', label: 'Actions', visible: true, canToggle: false } // Required column
  ];

  const [columnConfig, setColumnConfig] = useState<ColumnConfig[]>(() =>
    getStoredColumnConfig('endpoints', defaultColumnConfig)
  );
  // --- Start of Multi-select ---
  const [selectedEndpoints, setSelectedEndpoints] = useState<Set<string>>(new Set());
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [activeEndpoint, setActiveEndpoint] = useState<V1Endpoints | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const { addResourceContext } = useDrawer();

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

  // Add click handler for Endpoint selection with cmd/ctrl key
  const handleEndpointClick = (e: React.MouseEvent, endpoint: V1Endpoints) => {
    if (!endpoint.metadata?.namespace || !endpoint.metadata?.name) return;

    const endpointKey = `${endpoint.metadata.namespace}/${endpoint.metadata.name}`;

    if (e.metaKey || e.ctrlKey) {
      // Prevent navigation when using multi-select
      e.preventDefault();
      e.stopPropagation();

      setSelectedEndpoints(prev => {
        const newSelection = new Set(prev);
        if (newSelection.has(endpointKey)) {
          newSelection.delete(endpointKey);
        } else {
          newSelection.add(endpointKey);
        }
        return newSelection;
      });
    } else if (!selectedEndpoints.has(endpointKey)) {
      // Clear selection on regular click (unless clicking on already selected endpoint)
      setSelectedEndpoints(new Set());
      handleEndpointDetails(endpoint);
    } else {
      handleEndpointDetails(endpoint);
    }
  };

  // Add context menu handlers
  const handleContextMenu = (e: React.MouseEvent, endpoint: V1Endpoints) => {
    if (!endpoint.metadata?.namespace || !endpoint.metadata?.name) return;

    e.preventDefault();
    e.stopPropagation();

    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setActiveEndpoint(endpoint);
    setShowContextMenu(true);

    // Multi-select support: if endpoint isn't in selection, make it the only selection
    const endpointKey = `${endpoint.metadata.namespace}/${endpoint.metadata.name}`;
    if (!selectedEndpoints.has(endpointKey)) {
      setSelectedEndpoints(new Set([endpointKey]));
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

        if (isOutsideTable && !isContextMenuClick && !isAlertDialogClick && selectedEndpoints.size > 0) {
          setSelectedEndpoints(new Set());
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedEndpoints]);


  const handleDeleteEndpointMenuItem = (e: React.MouseEvent, endpoint: V1Endpoints) => {
    e.stopPropagation();
    if (isReconMode) {
      toast({
        title: "Recon Mode",
        description: "This action can't be performed while recon mode is on. Disable recon mode to proceed.",
        variant: "recon"
      });
      return;
    }

    setActiveEndpoint(endpoint);
    setSelectedEndpoints(new Set([`${endpoint.metadata?.namespace}/${endpoint.metadata?.name}`]));
    setShowDeleteDialog(true);
  };

  const handleAskAI = (endpoint: V1Endpoints) => {
    try {
      // Convert endpoint to EnrichedSearchResult format
      const resourceContext = resourceToEnrichedSearchResult(
        endpoint,
        'endpoints',
        true, // namespaced
        '',
        'v1'
      );

      // Add to chat context and open drawer
      addResourceContext(resourceContext);

      // Show success toast
      toast({
        title: "Added to Chat",
        description: `Endpoint "${endpoint.metadata?.name}" has been added to chat context`
      });
    } catch (error) {
      console.error('Error adding endpoint to chat:', error);
      toast({
        title: "Error",
        description: "Failed to add endpoint to chat context",
        variant: "destructive"
      });
    }
  };
  // Handle view endpoint details
  const handleViewEndpoint = () => {
    setShowContextMenu(false);
    if (activeEndpoint) {
      handleEndpointDetails(activeEndpoint);
    }
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
  const deleteEndpoints = async () => {
    setShowDeleteDialog(false);

    try {
      if (selectedEndpoints.size === 0 && activeEndpoint) {
        // Delete single active Endpoint
        await deleteEndpoint(activeEndpoint);
      } else {
        // Delete all selected Endpoints
        for (const endpointKey of selectedEndpoints) {
          const [namespace, name] = endpointKey.split('/');
          const endpointToDelete = endpoints.find(e =>
            e.metadata?.namespace === namespace && e.metadata?.name === name
          );

          if (endpointToDelete) {
            await deleteEndpoint(endpointToDelete);
          }
        }
      }

      // Clear selection after deletion
      setSelectedEndpoints(new Set());

      // Refresh Endpoints list after deletion
      if (currentContext && selectedNamespaces.length > 0) {
        // Fetch endpoints for each selected namespace
        const endpointPromises = selectedNamespaces.map(namespace =>
          listResources(currentContext.name, 'endpoints', { namespace })
        );

        const results = await Promise.all(endpointPromises);

        // Flatten the array of endpoint arrays
        const allEndpoints = results.flat();
        setEndpoints(allEndpoints);
        setError(null);
      }

    } catch (error) {
      console.error('Failed to delete Endpoint(s):', error);
      setError(error instanceof Error ? error.message : 'Failed to delete Endpoint(s)');
    }
  };

  // Delete Endpoint function
  const deleteEndpoint = async (endpoint: V1Endpoints) => {
    if (!currentContext || !endpoint.metadata?.name || !endpoint.metadata?.namespace) return;

    await deleteResource(
      currentContext.name,
      'endpoints',
      endpoint.metadata.name,
      { namespace: endpoint.metadata.namespace }
    );
  };

  // Render the context menu
  const renderContextMenu = () => {
    if (!showContextMenu || !contextMenuPosition) return null;

    // Calculate if we need to show the menu above or below the click position
    const windowHeight = window.innerHeight;
    const menuHeight = 120; // Approximate context menu height
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
          {selectedEndpoints.size > 1
            ? `${selectedEndpoints.size} Endpoints selected`
            : activeEndpoint?.metadata?.name || 'Endpoint actions'}
        </div>

        {selectedEndpoints.size <= 1 && (
          <div
            className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center"
            onClick={handleViewEndpoint}
          >
            <Eye className="h-4 w-4 mr-2" />
            View
          </div>
        )}

        <div
          className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center text-red-600 dark:text-red-400"
          onClick={handleDeleteClick}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete {selectedEndpoints.size > 1 ? `(${selectedEndpoints.size})` : ''}
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
            <AlertDialogTitle>Confirm Endpoint Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedEndpoints.size > 1
                ? `${selectedEndpoints.size} endpoints`
                : `"${activeEndpoint?.metadata?.name}"`}?
              This action cannot be undone.

              <div className="mt-2 text-amber-600 dark:text-amber-400">
                Warning: Endpoints are typically managed automatically by Kubernetes Services.
                <div className="mt-1">
                  When you delete an Endpoint, it may be recreated immediately if there's an associated Service.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteEndpoints}
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
    const newConfig = columnConfig.map(col =>
      col.key === columnKey ? { ...col, visible } : col
    );
    setColumnConfig(newConfig);
    saveColumnConfig('endpoints', newConfig);
  };

  const handleColumnReorder = (reorderedColumns: ColumnConfig[]) => {
    setColumnConfig(reorderedColumns);
    saveColumnConfig('endpoints', reorderedColumns);
  };

  const handleResetToDefault = () => {
    const resetConfig = defaultColumnConfig.map(col => ({ ...col, visible: true }));
    setColumnConfig(resetConfig);
    clearColumnConfig('endpoints');
  };

  const isColumnVisible = (columnKey: string) => {
    const column = columnConfig.find(col => col.key === columnKey);
    return column?.visible ?? true;
  };

  // Fetch endpoints for all selected namespaces
  useEffect(() => {
    const fetchAllEndpoints = async () => {
      if (!currentContext || selectedNamespaces.length === 0) {
        setEndpoints([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // If no namespaces are selected, fetch from all namespaces
        if (selectedNamespaces.length === 0) {
          const endpointsData = await listResources(currentContext.name, 'endpoints');
          setEndpoints(endpointsData);
          return;
        }

        // Fetch endpoints for each selected namespace
        const endpointPromises = selectedNamespaces.map(namespace =>
          listResources(currentContext.name, 'endpoints', { namespace })
        );

        const results = await Promise.all(endpointPromises);

        // Flatten the array of endpoint arrays
        const allEndpoints = results.flat();
        setEndpoints(allEndpoints);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch endpoints:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch endpoints');
      } finally {
        setLoading(false);
      }
    };

    fetchAllEndpoints();
  }, [currentContext, selectedNamespaces]);

  // Filter endpoints based on search query
  const filteredEndpoints = useMemo(() => {
    if (!searchQuery.trim()) {
      return endpoints;
    }

    const lowercaseQuery = searchQuery.toLowerCase();

    return endpoints.filter(endpoint => {
      const name = endpoint.metadata?.name?.toLowerCase() || '';
      const namespace = endpoint.metadata?.namespace?.toLowerCase() || '';
      const labels = endpoint.metadata?.labels || {};

      // Check if any address contains the query
      const addressMatches = endpoint.subsets?.some(subset => {
        const allAddresses = [
          ...(subset.addresses || []),
          ...(subset.notReadyAddresses || [])
        ];

        return allAddresses.some(addr => {
          const ip = addr.ip?.toLowerCase() || '';
          const hostname = addr.hostname?.toLowerCase() || '';
          const nodeName = addr.nodeName?.toLowerCase() || '';
          const targetName = addr.targetRef?.name?.toLowerCase() || '';

          return (
            ip.includes(lowercaseQuery) ||
            hostname.includes(lowercaseQuery) ||
            nodeName.includes(lowercaseQuery) ||
            targetName.includes(lowercaseQuery)
          );
        });
      });

      // Check if any port contains the query
      const portMatches = endpoint.subsets?.some(subset => {
        return (subset.ports || []).some(port => {
          const portNumber = port.port?.toString() || '';
          const protocol = port.protocol?.toLowerCase() || '';
          const name = port.name?.toLowerCase() || '';

          return (
            portNumber.includes(lowercaseQuery) ||
            protocol.includes(lowercaseQuery) ||
            name.includes(lowercaseQuery)
          );
        });
      });

      // Check if name, namespace, or any matched fields contains the query
      if (
        name.includes(lowercaseQuery) ||
        namespace.includes(lowercaseQuery) ||
        addressMatches ||
        portMatches
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
  }, [endpoints, searchQuery]);

  // Sort endpoints based on sort state
  const sortedEndpoints = useMemo(() => {
    if (!sort.field || !sort.direction) {
      return filteredEndpoints;
    }

    return [...filteredEndpoints].sort((a, b) => {
      const sortMultiplier = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'name':
          return (a.metadata?.name || '').localeCompare(b.metadata?.name || '') * sortMultiplier;

        case 'namespace':
          return (a.metadata?.namespace || '').localeCompare(b.metadata?.namespace || '') * sortMultiplier;

        case 'endpoints': {
          // Count total addresses (ready and not ready)
          const countAddresses = (ep: V1Endpoints) => {
            return ep.subsets?.reduce((total, subset) => {
              return total +
                (subset.addresses?.length || 0) +
                (subset.notReadyAddresses?.length || 0);
            }, 0) || 0;
          };

          const addressesA = countAddresses(a);
          const addressesB = countAddresses(b);

          return (addressesA - addressesB) * sortMultiplier;
        }

        case 'ports': {
          // Count total ports across all subsets
          const countPorts = (ep: V1Endpoints) => {
            return ep.subsets?.reduce((total, subset) => {
              return total + (subset.ports?.length || 0);
            }, 0) || 0;
          };

          const portsA = countPorts(a);
          const portsB = countPorts(b);

          return (portsA - portsB) * sortMultiplier;
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
  }, [filteredEndpoints, sort.field, sort.direction]);

  const handleEndpointDetails = (endpoint: V1Endpoints) => {
    if (endpoint.metadata?.name && endpoint.metadata?.namespace) {
      navigate(`/dashboard/explore/endpoints/${endpoint.metadata.namespace}/${endpoint.metadata.name}`);
    }
  };

  // Format endpoint addresses for display
  const formatEndpointAddresses = (endpoint: V1Endpoints): JSX.Element => {
    const subsets = endpoint.subsets || [];
    if (subsets.length === 0) {
      return <div className="text-gray-500 dark:text-gray-400">No endpoints</div>;
    }

    return (
      <div className="space-y-1">
        {subsets.map((subset, subsetIndex) => {
          const readyAddresses = subset.addresses || [];
          const notReadyAddresses = subset.notReadyAddresses || [];

          if (readyAddresses.length === 0 && notReadyAddresses.length === 0) {
            return null;
          }

          return (
            <div key={subsetIndex} className="text-sm">
              {/* Ready addresses */}
              {readyAddresses.map((addr, addrIndex) => (
                <div key={`ready-${addrIndex}`} className="flex items-center">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-2"></span>
                  <span>
                    {addr.ip || addr.hostname || 'unknown'}
                    {addr.targetRef?.name && (
                      <span className="text-xs ml-1 text-gray-500 dark:text-gray-400">
                        ({addr.targetRef.kind?.toLowerCase()}: {addr.targetRef.name})
                      </span>
                    )}
                  </span>
                </div>
              ))}

              {/* Not ready addresses */}
              {notReadyAddresses.map((addr, addrIndex) => (
                <div key={`notready-${addrIndex}`} className="flex items-center">
                  <span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-2"></span>
                  <span>
                    {addr.ip || addr.hostname || 'unknown'}
                    {addr.targetRef?.name && (
                      <span className="text-xs ml-1 text-gray-500 dark:text-gray-400">
                        ({addr.targetRef.kind?.toLowerCase()}: {addr.targetRef.name})
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    );
  };

  // Format endpoint ports for display
  const formatEndpointPorts = (endpoint: V1Endpoints): string => {
    const ports: string[] = [];

    (endpoint.subsets || []).forEach(subset => {
      (subset.ports || []).forEach(port => {
        let portStr = `${port.port || ''}`;
        if (port.name) {
          portStr = `${port.name}:${portStr}`;
        }
        if (port.protocol && port.protocol !== 'TCP') {
          portStr += `/${port.protocol}`;
        }
        if (port.appProtocol) {
          portStr += ` (${port.appProtocol})`;
        }
        ports.push(portStr);
      });
    });

    return ports.join(', ') || '-';
  };

  // Get ready status counts
  const getReadyCounts = (endpoint: V1Endpoints): string => {
    let readyCount = 0;
    let notReadyCount = 0;

    (endpoint.subsets || []).forEach(subset => {
      readyCount += subset.addresses?.length || 0;
      notReadyCount += subset.notReadyAddresses?.length || 0;
    });

    if (readyCount === 0 && notReadyCount === 0) {
      return '-';
    }

    return `${readyCount}/${readyCount + notReadyCount}`;
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

  // Helper function to render table header based on column key
  const renderTableHeader = (column: ColumnConfig) => {
    if (!column.visible || column.key === 'actions') {
      return null;
    }

    const sortFieldMap: Record<string, SortField> = {
      name: 'name',
      namespace: 'namespace',
      endpoints: 'endpoints',
      ports: 'ports',
      age: 'age'
    };

    const sortField = sortFieldMap[column.key];
    const isCenterColumn = ['endpoints', 'ports', 'age'].includes(column.key);
    const isPortsColumn = column.key === 'ports';

    return (
      <TableHead
        key={column.key}
        className={`${sortField ? 'cursor-pointer hover:text-blue-500' : ''} ${isCenterColumn ? 'text-center' : ''} ${isPortsColumn ? 'w-[150px]' : ''}`}
        onClick={() => sortField && handleSort(sortField)}
      >
        {column.label} {sortField && renderSortIndicator(sortField)}
      </TableHead>
    );
  };

  // Helper function to render table cell based on column key
  const renderTableCell = (endpoint: V1Endpoints, column: ColumnConfig) => {
    if (!column.visible || column.key === 'actions') {
      return null;
    }

    switch (column.key) {
      case 'name':
        return (
          <TableCell key={column.key} className="font-medium" onClick={() => handleEndpointDetails(endpoint)}>
            <div className="hover:text-blue-500 hover:underline">
              {endpoint.metadata?.name}
            </div>
          </TableCell>
        );

      case 'namespace':
        return (
          <TableCell key={column.key}>
            <div className="hover:text-blue-500 hover:underline" onClick={() => navigate(`/dashboard/explore/namespaces/${endpoint.metadata?.namespace}`)}>
              {endpoint.metadata?.namespace}
            </div>
          </TableCell>
        );

      case 'endpoints':
        return (
          <TableCell key={column.key}>
            <div className="flex justify-between items-center">
              {formatEndpointAddresses(endpoint)}
              <div className="text-sm ml-2">
                {getReadyCounts(endpoint)}
              </div>
            </div>
          </TableCell>
        );

      case 'ports':
        return (
          <TableCell key={column.key} className="text-center">
            {formatEndpointPorts(endpoint)}
          </TableCell>
        );

      case 'age':
        return (
          <TableCell key={column.key} className="text-center">
            {calculateAge(endpoint.metadata?.creationTimestamp?.toString())}
          </TableCell>
        );

      default:
        return null;
    }
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
          <h1 className='text-5xl font-[Anton] uppercase font-bold text-gray-800/30 dark:text-gray-700/50'>Endpoints</h1>
          <div className="w-full md:w-96 mt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
              <Input
                type="text"
                placeholder="Search by name, namespace, IP, or port..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </div>

        <div className="flex items-end gap-2">
          <div className="w-full md:w-96">
            {/* <div className="text-sm font-medium mb-2">Namespaces</div> */}
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

      {/* No results message */}
      {sortedEndpoints.length === 0 && (
        <Alert className="my-6 bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <AlertDescription>
            {searchQuery
              ? `No endpoints matching "${searchQuery}"`
              : selectedNamespaces.length === 0
                ? "Please select at least one namespace"
                : "No endpoints found in the selected namespaces"}
          </AlertDescription>
        </Alert>
      )}

      {/* Endpoints table */}
      {sortedEndpoints.length > 0 && (
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
                {sortedEndpoints.map((endpoint) => (
                  <TableRow
                    key={`${endpoint.metadata?.namespace}-${endpoint.metadata?.name}`}
                    className={`bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30 ${endpoint.metadata?.namespace && endpoint.metadata?.name &&
                      selectedEndpoints.has(`${endpoint.metadata.namespace}/${endpoint.metadata.name}`)
                      ? 'bg-blue-50 dark:bg-gray-800/30'
                      : ''
                      }`}
                    onClick={(e) => handleEndpointClick(e, endpoint)}
                    onContextMenu={(e) => handleContextMenu(e, endpoint)}
                  >
                    {columnConfig.map(col => renderTableCell(endpoint, col))}
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
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            handleAskAI(endpoint);
                          }} className='hover:text-gray-700 dark:hover:text-gray-500'>
                            <Sparkles className="mr-2 h-4 w-4" />
                            Ask AI
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={handleViewEndpoint} className='hover:text-gray-700 dark:hover:text-gray-500'>
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-500 dark:text-red-400 focus:text-red-500 dark:focus:text-red-400 hover:text-red-700 dark:hover:text-red-500"
                            onClick={(e) => handleDeleteEndpointMenuItem(e, endpoint)}
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
        title="Endpoints Table"
        columns={columnConfig}
        onColumnToggle={handleColumnToggle}
        onColumnReorder={handleColumnReorder}
        onResetToDefault={handleResetToDefault}
        resourceType="endpoints"
        className="w-1/3"
      />
    </div>
  );
};

export default Endpoints;