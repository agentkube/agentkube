import React, { useState, useEffect, useMemo } from 'react';
import { getIngresses } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';
import { useNamespace } from '@/contexts/useNamespace';
import { V1Ingress } from '@kubernetes/client-node';
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

// Define sorting types
type SortDirection = 'asc' | 'desc' | null;
type SortField = 'name' | 'namespace' | 'hosts' | 'address' | 'ports' | 'age' | 'class' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

const Ingresses: React.FC = () => {
  const navigate = useNavigate();
  const { currentContext } = useCluster();
  const { selectedNamespaces } = useNamespace();
  const [ingresses, setIngresses] = useState<V1Ingress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const { isReconMode } = useReconMode();

  // Column visibility state
  const [showFilterSidebar, setShowFilterSidebar] = useState(false);
  
  const defaultColumnConfig: ColumnConfig[] = [
    { key: 'name', label: 'Name', visible: true, canToggle: false }, // Required column
    { key: 'namespace', label: 'Namespace', visible: true, canToggle: true },
    { key: 'class', label: 'Class', visible: true, canToggle: true },
    { key: 'hosts', label: 'Hosts & Paths', visible: true, canToggle: true },
    { key: 'address', label: 'Address', visible: true, canToggle: true },
    { key: 'age', label: 'Age', visible: true, canToggle: true },
    { key: 'actions', label: 'Actions', visible: true, canToggle: false } // Required column
  ];
  
  const [columnConfig, setColumnConfig] = useState<ColumnConfig[]>(() => 
    getStoredColumnConfig('ingresses', defaultColumnConfig)
  );
  // --- Start of Multi-select ---
  const [selectedIngresses, setSelectedIngresses] = useState<Set<string>>(new Set());
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [activeIngress, setActiveIngress] = useState<V1Ingress | null>(null);
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

  // Add click handler for Ingress selection with cmd/ctrl key
  const handleIngressClick = (e: React.MouseEvent, ingress: V1Ingress) => {
    if (!ingress.metadata?.namespace || !ingress.metadata?.name) return;

    const ingressKey = `${ingress.metadata.namespace}/${ingress.metadata.name}`;

    if (e.metaKey || e.ctrlKey) {
      // Prevent navigation when using multi-select
      e.preventDefault();
      e.stopPropagation();

      setSelectedIngresses(prev => {
        const newSelection = new Set(prev);
        if (newSelection.has(ingressKey)) {
          newSelection.delete(ingressKey);
        } else {
          newSelection.add(ingressKey);
        }
        return newSelection;
      });
    } else if (!selectedIngresses.has(ingressKey)) {
      // Clear selection on regular click (unless clicking on already selected ingress)
      setSelectedIngresses(new Set());
      handleIngressDetails(ingress);
    } else {
      handleIngressDetails(ingress);
    }
  };

  // Add context menu handlers
  const handleContextMenu = (e: React.MouseEvent, ingress: V1Ingress) => {
    if (!ingress.metadata?.namespace || !ingress.metadata?.name) return;

    e.preventDefault();
    e.stopPropagation();

    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setActiveIngress(ingress);
    setShowContextMenu(true);

    // Multi-select support: if ingress isn't in selection, make it the only selection
    const ingressKey = `${ingress.metadata.namespace}/${ingress.metadata.name}`;
    if (!selectedIngresses.has(ingressKey)) {
      setSelectedIngresses(new Set([ingressKey]));
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

        if (isOutsideTable && !isContextMenuClick && !isAlertDialogClick && selectedIngresses.size > 0) {
          setSelectedIngresses(new Set());
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedIngresses]);



  const handleDeleteIngressMenuItem = (e: React.MouseEvent, ingress: V1Ingress) => {
    e.stopPropagation();
    if (isReconMode) {
      toast({
        title: "Recon Mode",
        description: "This action can't be performed while recon mode is on. Disable recon mode to proceed.",
        variant: "recon"
      });
      return;
    }

    setActiveIngress(ingress);
    setSelectedIngresses(new Set([`${ingress.metadata?.namespace}/${ingress.metadata?.name}`]));
    setShowDeleteDialog(true);
  };

  const handleAskAI = (ingress: V1Ingress) => {
    try {
      // Convert ingress to EnrichedSearchResult format
      const resourceContext = resourceToEnrichedSearchResult(
        ingress,
        'ingresses',
        true, // namespaced
        'networking.k8s.io',
        'v1'
      );
      
      // Add to chat context and open drawer
      addResourceContext(resourceContext);
      
      // Show success toast
      toast({
        title: "Added to Chat",
        description: `Ingress "${ingress.metadata?.name}" has been added to chat context`
      });
    } catch (error) {
      console.error('Error adding ingress to chat:', error);
      toast({
        title: "Error",
        description: "Failed to add ingress to chat context",
        variant: "destructive"
      });
    }
  };

  // Handle view ingress details
  const handleViewIngress = () => {
    setShowContextMenu(false);
    if (activeIngress) {
      handleIngressDetails(activeIngress);
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
  const deleteIngresses = async () => {
    setShowDeleteDialog(false);

    try {
      if (selectedIngresses.size === 0 && activeIngress) {
        // Delete single active Ingress
        await deleteIngress(activeIngress);
      } else {
        // Delete all selected Ingresses
        for (const ingressKey of selectedIngresses) {
          const [namespace, name] = ingressKey.split('/');
          const ingressToDelete = ingresses.find(i =>
            i.metadata?.namespace === namespace && i.metadata?.name === name
          );

          if (ingressToDelete) {
            await deleteIngress(ingressToDelete);
          }
        }
      }

      // Clear selection after deletion
      setSelectedIngresses(new Set());

      // Refresh Ingresses list after deletion
      if (currentContext && selectedNamespaces.length > 0) {
        // Fetch ingresses for each selected namespace
        const ingressPromises = selectedNamespaces.map(namespace =>
          getIngresses(currentContext.name, namespace)
        );

        const results = await Promise.all(ingressPromises);

        // Flatten the array of ingress arrays
        const allIngresses = results.flat();
        setIngresses(allIngresses);
        setError(null);
      }

    } catch (error) {
      console.error('Failed to delete Ingress(es):', error);
      setError(error instanceof Error ? error.message : 'Failed to delete Ingress(es)');
    }
  };

  // Delete Ingress function
  const deleteIngress = async (ingress: V1Ingress) => {
    if (!currentContext || !ingress.metadata?.name || !ingress.metadata?.namespace) return;

    await deleteResource(
      currentContext.name,
      'ingresses',
      ingress.metadata.name,
      {
        namespace: ingress.metadata.namespace,
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
    const menuHeight = 120; // Approximate context menu height
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
          {selectedIngresses.size > 1
            ? `${selectedIngresses.size} Ingresses selected`
            : activeIngress?.metadata?.name || 'Ingress actions'}
        </div>

        {selectedIngresses.size <= 1 && (
          <div
            className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center"
            onClick={handleViewIngress}
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
          Delete {selectedIngresses.size > 1 ? `(${selectedIngresses.size})` : ''}
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
            <AlertDialogTitle>Confirm Ingress Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedIngresses.size > 1
                ? `${selectedIngresses.size} ingresses`
                : `"${activeIngress?.metadata?.name}"`}?
              This action cannot be undone.

              <div className="mt-2 text-amber-600 dark:text-amber-400">
                Warning: Deleting ingresses will remove their routing rules, which might affect external access to your services.
                {activeIngress &&
                  activeIngress.status?.loadBalancer?.ingress &&
                  activeIngress.status?.loadBalancer?.ingress.length > 0 && (
                    <div className="mt-1">
                      This ingress has active load balancer endpoints. Deleting it may not automatically remove associated cloud provider resources.
                    </div>
                  )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteIngresses}
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
    saveColumnConfig('ingresses', newConfig);
  };

  const handleColumnReorder = (reorderedColumns: ColumnConfig[]) => {
    setColumnConfig(reorderedColumns);
    saveColumnConfig('ingresses', reorderedColumns);
  };

  const handleResetToDefault = () => {
    const resetConfig = defaultColumnConfig.map(col => ({ ...col, visible: true }));
    setColumnConfig(resetConfig);
    clearColumnConfig('ingresses');
  };

  const isColumnVisible = (columnKey: string) => {
    const column = columnConfig.find(col => col.key === columnKey);
    return column?.visible ?? true;
  };

  // Fetch ingresses for all selected namespaces
  useEffect(() => {
    const fetchAllIngresses = async () => {
      if (!currentContext || selectedNamespaces.length === 0) {
        setIngresses([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // If no namespaces are selected, fetch from all namespaces
        if (selectedNamespaces.length === 0) {
          const ingressesData = await getIngresses(currentContext.name);
          setIngresses(ingressesData);
          return;
        }

        // Fetch ingresses for each selected namespace
        const ingressPromises = selectedNamespaces.map(namespace =>
          getIngresses(currentContext.name, namespace)
        );

        const results = await Promise.all(ingressPromises);

        // Flatten the array of ingress arrays
        const allIngresses = results.flat();
        setIngresses(allIngresses);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch ingresses:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch ingresses');
      } finally {
        setLoading(false);
      }
    };

    fetchAllIngresses();
  }, [currentContext, selectedNamespaces]);

  // Filter ingresses based on search query
  const filteredIngresses = useMemo(() => {
    if (!searchQuery.trim()) {
      return ingresses;
    }

    const lowercaseQuery = searchQuery.toLowerCase();

    return ingresses.filter(ingress => {
      const name = ingress.metadata?.name?.toLowerCase() || '';
      const namespace = ingress.metadata?.namespace?.toLowerCase() || '';
      const labels = ingress.metadata?.labels || {};
      const annotations = ingress.metadata?.annotations || {};
      const ingressClass = ingress.spec?.ingressClassName?.toLowerCase() || '';

      // Check if any host contains the query
      const hostMatches = ingress.spec?.rules?.some(rule => {
        const host = rule.host?.toLowerCase() || '';
        return host.includes(lowercaseQuery);
      });

      // Check if any address contains the query
      const addressMatches = ingress.status?.loadBalancer?.ingress?.some(ingress => {
        const ip = ingress.ip?.toLowerCase() || '';
        const hostname = ingress.hostname?.toLowerCase() || '';
        return ip.includes(lowercaseQuery) || hostname.includes(lowercaseQuery);
      });

      // Check if any path contains the query
      const pathMatches = ingress.spec?.rules?.some(rule => {
        return rule.http?.paths?.some(path => {
          const pathText = path.path?.toLowerCase() || '';
          const serviceName = path.backend?.service?.name?.toLowerCase() || '';
          const servicePort = path.backend?.service?.port?.number?.toString() || '';
          const portName = path.backend?.service?.port?.name?.toLowerCase() || '';

          return (
            pathText.includes(lowercaseQuery) ||
            serviceName.includes(lowercaseQuery) ||
            servicePort.includes(lowercaseQuery) ||
            portName.includes(lowercaseQuery)
          );
        });
      });

      // Check if name, namespace, class, or any matched fields contains the query
      if (
        name.includes(lowercaseQuery) ||
        namespace.includes(lowercaseQuery) ||
        ingressClass.includes(lowercaseQuery) ||
        hostMatches ||
        addressMatches ||
        pathMatches
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
  }, [ingresses, searchQuery]);

  // Sort ingresses based on sort state
  const sortedIngresses = useMemo(() => {
    if (!sort.field || !sort.direction) {
      return filteredIngresses;
    }

    return [...filteredIngresses].sort((a, b) => {
      const sortMultiplier = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'name':
          return (a.metadata?.name || '').localeCompare(b.metadata?.name || '') * sortMultiplier;

        case 'namespace':
          return (a.metadata?.namespace || '').localeCompare(b.metadata?.namespace || '') * sortMultiplier;

        case 'class': {
          const classA = a.spec?.ingressClassName || getIngressClassFromAnnotation(a) || 'default';
          const classB = b.spec?.ingressClassName || getIngressClassFromAnnotation(b) || 'default';
          return classA.localeCompare(classB) * sortMultiplier;
        }

        case 'hosts': {
          // Count number of hosts
          const hostsA = a.spec?.rules?.length || 0;
          const hostsB = b.spec?.rules?.length || 0;

          // If number of hosts is different, sort by that
          if (hostsA !== hostsB) {
            return (hostsA - hostsB) * sortMultiplier;
          }

          // If same number, compare first host lexicographically
          const firstHostA = a.spec?.rules?.[0]?.host || '';
          const firstHostB = b.spec?.rules?.[0]?.host || '';
          return firstHostA.localeCompare(firstHostB) * sortMultiplier;
        }

        case 'address': {
          const addressesA = a.status?.loadBalancer?.ingress || [];
          const addressesB = b.status?.loadBalancer?.ingress || [];

          // Sort by number of addresses first
          if (addressesA.length !== addressesB.length) {
            return (addressesA.length - addressesB.length) * sortMultiplier;
          }

          // If both have an address, compare the first one
          if (addressesA.length > 0 && addressesB.length > 0) {
            const addrA = addressesA[0].ip || addressesA[0].hostname || '';
            const addrB = addressesB[0].ip || addressesB[0].hostname || '';
            return addrA.localeCompare(addrB) * sortMultiplier;
          }

          return 0;
        }

        case 'ports': {
          // Count total number of paths with services
          const countPaths = (ingress: V1Ingress) => {
            return ingress.spec?.rules?.reduce((total, rule) => {
              return total + (rule.http?.paths?.length || 0);
            }, 0) || 0;
          };

          const pathsA = countPaths(a);
          const pathsB = countPaths(b);

          return (pathsA - pathsB) * sortMultiplier;
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
  }, [filteredIngresses, sort.field, sort.direction]);

  // Helper to extract ingress class from deprecated annotation
  const getIngressClassFromAnnotation = (ingress: V1Ingress): string | undefined => {
    return ingress.metadata?.annotations?.['kubernetes.io/ingress.class'];
  };

  const handleIngressDetails = (ingress: V1Ingress) => {
    if (ingress.metadata?.name && ingress.metadata?.namespace) {
      navigate(`/dashboard/explore/ingresses/${ingress.metadata.namespace}/${ingress.metadata.name}`);
    }
  };

  // Format hosts with paths for display
  const formatHostsAndPaths = (ingress: V1Ingress): JSX.Element => {
    const rules = ingress.spec?.rules || [];
    if (rules.length === 0) {
      return <div className="text-gray-500 dark:text-gray-400">No rules defined</div>;
    }

    return (
      <div className="space-y-1 text-sm">
        {rules.map((rule, ruleIndex) => {
          const host = rule.host || '*';
          const paths = rule.http?.paths || [];

          return (
            <div key={ruleIndex} className="mb-1">
              <div className="font-medium">{host}</div>
              {paths.length > 0 ? (
                <ul className="list-disc list-inside pl-2 text-gray-600 dark:text-gray-400">
                  {paths.map((path, pathIndex) => {
                    const pathPattern = path.path || '/';
                    const serviceName = path.backend?.service?.name;
                    const servicePort = path.backend?.service?.port?.number || path.backend?.service?.port?.name;
                    const pathType = path.pathType;

                    return (
                      <li key={pathIndex} className="text-xs">
                        {pathPattern} {pathType && <span className="text-gray-500">({pathType})</span>} → {serviceName}:{servicePort}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="text-xs text-gray-500 dark:text-gray-400 pl-2">No paths defined</div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // Format ingress class name
  const formatIngressClass = (ingress: V1Ingress): string => {
    return ingress.spec?.ingressClassName ||
      getIngressClassFromAnnotation(ingress) ||
      'default';
  };

  // Format address for display
  const formatIngressAddress = (ingress: V1Ingress): string => {
    const addresses = ingress.status?.loadBalancer?.ingress || [];
    if (addresses.length === 0) {
      return '<pending>';
    }

    return addresses
      .map(addr => addr.ip || addr.hostname)
      .filter(Boolean)
      .join(', ');
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
      class: 'class',
      hosts: 'hosts',
      address: 'address',
      age: 'age'
    };

    const sortField = sortFieldMap[column.key];
    const isCenterColumn = ['class', 'address', 'age'].includes(column.key);

    return (
      <TableHead
        key={column.key}
        className={`${sortField ? 'cursor-pointer hover:text-blue-500' : ''} ${isCenterColumn ? 'text-center' : ''}`}
        onClick={() => sortField && handleSort(sortField)}
      >
        {column.label} {sortField && renderSortIndicator(sortField)}
      </TableHead>
    );
  };

  // Helper function to render table cell based on column key
  const renderTableCell = (ingress: V1Ingress, column: ColumnConfig) => {
    if (!column.visible || column.key === 'actions') {
      return null;
    }

    switch (column.key) {
      case 'name':
        return (
          <TableCell key={column.key} className="font-medium" onClick={() => handleIngressDetails(ingress)}>
            <div className="hover:text-blue-500 hover:underline">
              {ingress.metadata?.name}
            </div>
          </TableCell>
        );

      case 'namespace':
        return (
          <TableCell key={column.key}>
            <div className="hover:text-blue-500 hover:underline" onClick={() => navigate(`/dashboard/explore/namespaces`)}>
              {ingress.metadata?.namespace}
            </div>
          </TableCell>
        );

      case 'class':
        return (
          <TableCell key={column.key} className="text-center">
            <span className="px-2 py-1 rounded-[0.3rem] text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
              {formatIngressClass(ingress)}
            </span>
          </TableCell>
        );

      case 'hosts':
        return (
          <TableCell key={column.key}>
            {formatHostsAndPaths(ingress)}
          </TableCell>
        );

      case 'address':
        return (
          <TableCell key={column.key} className="text-center">
            {formatIngressAddress(ingress)}
          </TableCell>
        );

      case 'age':
        return (
          <TableCell key={column.key} className="text-center">
            {calculateAge(ingress.metadata?.creationTimestamp?.toString())}
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
          <h1 className='text-5xl font-[Anton] uppercase font-bold text-gray-800/30 dark:text-gray-700/50'>Ingresses</h1>
          <div className="w-full md:w-96 mt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
              <Input
                type="text"
                placeholder="Search by name, host, path, or service..."
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

      {/* Ingresses table */}
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
              {sortedIngresses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-gray-500 dark:text-gray-400">
                    {searchQuery
                      ? `No ingresses matching "${searchQuery}"`
                      : selectedNamespaces.length === 0
                        ? "Please select at least one namespace"
                        : "No ingresses found in the selected namespaces"}
                  </TableCell>
                </TableRow>
              ) : (
                sortedIngresses.map((ingress) => (
                  <TableRow
                    key={`${ingress.metadata?.namespace}-${ingress.metadata?.name}`}
                    className={`bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30 ${ingress.metadata?.namespace && ingress.metadata?.name &&
                      selectedIngresses.has(`${ingress.metadata.namespace}/${ingress.metadata.name}`)
                      ? 'bg-blue-50 dark:bg-gray-800/30'
                      : ''
                      }`}
                    onClick={(e) => handleIngressClick(e, ingress)}
                    onContextMenu={(e) => handleContextMenu(e, ingress)}
                  >
                    {columnConfig.map(col => renderTableCell(ingress, col))}
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
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            handleAskAI(ingress);
                          }} className='hover:text-gray-700 dark:hover:text-gray-500'>
                            <Sparkles className="mr-2 h-4 w-4" />
                            Ask AI
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={handleViewIngress} className='hover:text-gray-700 dark:hover:text-gray-500'>
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-500 dark:text-red-400 focus:text-red-500 dark:focus:text-red-400 hover:text-red-700 dark:hover:text-red-500"
                            onClick={(e) => handleDeleteIngressMenuItem(e, ingress)}
                          >
                            <Trash className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Resource Filter Sidebar */}
      <ResourceFilterSidebar
        isOpen={showFilterSidebar}
        onClose={() => setShowFilterSidebar(false)}
        title="Ingresses Table"
        columns={columnConfig}
        onColumnToggle={handleColumnToggle}
        onColumnReorder={handleColumnReorder}
        onResetToDefault={handleResetToDefault}
        resourceType="ingresses"
        className="w-1/3"
      />
    </div>
  );
};

export default Ingresses;