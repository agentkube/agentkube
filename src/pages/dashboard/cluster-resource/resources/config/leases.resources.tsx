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
import { Trash2, Eye } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { deleteResource } from '@/api/internal/resources';

// Define types for Lease
interface LeaseSpec {
  holderIdentity?: string;
  leaseDurationSeconds?: number;
  acquireTime?: string;
  renewTime?: string;
  leaseTransitions?: number;
}

interface V1Lease {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    namespace?: string;
    creationTimestamp?: string;
    labels?: { [key: string]: string };
    annotations?: { [key: string]: string };
  };
  spec?: LeaseSpec;
}

// Define sorting types
type SortDirection = 'asc' | 'desc' | null;
type SortField = 'name' | 'namespace' | 'holder' | 'duration' | 'renewTime' | 'age' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

const Leases: React.FC = () => {
  const navigate = useNavigate();
  const { currentContext } = useCluster();
  const { selectedNamespaces } = useNamespace();
  const [leases, setLeases] = useState<V1Lease[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // --- Start of Multi-select ---
  const [selectedLeases, setSelectedLeases] = useState<Set<string>>(new Set());
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [activeLease, setActiveLease] = useState<V1Lease | null>(null);
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
  
  // Add click handler for Lease selection with cmd/ctrl key
  const handleLeaseClick = (e: React.MouseEvent, lease: V1Lease) => {
    const leaseKey = `${lease.metadata?.namespace}/${lease.metadata?.name}`;

    if (e.metaKey || e.ctrlKey) {
      // Prevent navigation when using multi-select
      e.preventDefault();
      e.stopPropagation();

      setSelectedLeases(prev => {
        const newSelection = new Set(prev);
        if (newSelection.has(leaseKey)) {
          newSelection.delete(leaseKey);
        } else {
          newSelection.add(leaseKey);
        }
        return newSelection;
      });
    } else if (!selectedLeases.has(leaseKey)) {
      // Clear selection on regular click (unless clicking on already selected lease)
      setSelectedLeases(new Set());
      handleLeaseDetails(lease);
    } else {
      handleLeaseDetails(lease);
    }
  };

  // Add context menu handlers
  const handleContextMenu = (e: React.MouseEvent, lease: V1Lease) => {
    e.preventDefault();
    e.stopPropagation();

    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setActiveLease(lease);
    setShowContextMenu(true);

    // Multi-select support: if lease isn't in selection, make it the only selection
    const leaseKey = `${lease.metadata?.namespace}/${lease.metadata?.name}`;
    if (!selectedLeases.has(leaseKey)) {
      setSelectedLeases(new Set([leaseKey]));
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

        if (isOutsideTable && !isContextMenuClick && !isAlertDialogClick && selectedLeases.size > 0) {
          setSelectedLeases(new Set());
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedLeases]);

  // Handle view action - only available for a single Lease
  const handleViewLease = () => {
    setShowContextMenu(false);

    if (activeLease && activeLease.metadata?.name && activeLease.metadata?.namespace) {
      navigate(`/dashboard/explore/leases/${activeLease.metadata.namespace}/${activeLease.metadata.name}`);
    }
  };

  // Handle delete action
  const handleDeleteClick = () => {
    setShowContextMenu(false);
    setShowDeleteDialog(true);
  };

  // Perform actual deletion
  const deleteLeases = async () => {
    setShowDeleteDialog(false);

    try {
      if (selectedLeases.size === 0 && activeLease) {
        // Delete single active Lease
        await deleteLease(activeLease);
      } else {
        // Delete all selected Leases
        for (const leaseKey of selectedLeases) {
          const [namespace, name] = leaseKey.split('/');
          const leaseToDelete = leases.find(l =>
            l.metadata?.namespace === namespace && l.metadata?.name === name
          );

          if (leaseToDelete) {
            await deleteLease(leaseToDelete);
          }
        }
      }

      // Clear selection after deletion
      setSelectedLeases(new Set());

      // Refresh Lease list after deletion
      if (currentContext && selectedNamespaces.length > 0) {
        const fetchLeases = async () => {
          try {
            setLoading(true);

            // Fetch leases for each selected namespace
            const leasePromises = selectedNamespaces.map(async (namespace) => {
              try {
                return await listResources(currentContext.name, 'leases', {
                  namespace,
                  apiGroup: 'coordination.k8s.io',
                  apiVersion: 'v1'
                });
              } catch (err) {
                console.warn(`Failed to fetch Leases for namespace ${namespace}:`, err);
                return [];
              }
            });

            const results = await Promise.all(leasePromises);
            const allLeases = results.flat();

            setLeases(allLeases);
            if (allLeases.length > 0) {
              setError(null);
            }
          } catch (err) {
            console.error('Failed to fetch leases:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch leases');
          } finally {
            setLoading(false);
          }
        };

        fetchLeases();
      }

    } catch (error) {
      console.error('Failed to delete Lease(s):', error);
      setError(error instanceof Error ? error.message : 'Failed to delete Lease(s)');
    }
  };

  // Delete Lease function
  const deleteLease = async (lease: V1Lease) => {
    if (!currentContext || !lease.metadata?.name || !lease.metadata?.namespace) return;

    await deleteResource(
      currentContext.name,
      'leases',
      lease.metadata.name,
      {
        namespace: lease.metadata.namespace,
        apiGroup: 'coordination.k8s.io',
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
          {selectedLeases.size > 1
            ? `${selectedLeases.size} Leases selected`
            : activeLease?.metadata?.name || 'Lease actions'}
        </div>

        <div
          className={`px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center ${selectedLeases.size > 1 ? 'text-gray-400 dark:text-gray-600 pointer-events-none' : ''}`}
          onClick={selectedLeases.size <= 1 ? handleViewLease : undefined}
          title={selectedLeases.size > 1 ? "Select only one Lease to view" : ""}
        >
          <Eye className="h-4 w-4 mr-2" />
          View
        </div>

        <div
          className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center text-red-600 dark:text-red-400"
          onClick={handleDeleteClick}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete {selectedLeases.size > 1 ? `(${selectedLeases.size})` : ''}
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
            <AlertDialogTitle>Confirm Lease Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedLeases.size > 1
                ? `${selectedLeases.size} Leases`
                : `"${activeLease?.metadata?.name}"`}?
              This action cannot be undone.

              <div className="mt-2 text-amber-600 dark:text-amber-400">
                Warning: Deleting Leases may affect leader election and heartbeat mechanisms for Kubernetes components.
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteLeases}
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
    field: 'renewTime',
    direction: 'desc'
  });

  // Fetch Leases for all selected namespaces
  useEffect(() => {
    const fetchAllLeases = async () => {
      if (!currentContext || selectedNamespaces.length === 0) {
        setLeases([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // If no namespaces are selected, fetch from all namespaces
        let allLeases: V1Lease[] = [];

        if (selectedNamespaces.length === 0) {
          try {
            const leasesData = await listResources(currentContext.name, 'leases', {
              apiGroup: 'coordination.k8s.io',
              apiVersion: 'v1'
            });
            allLeases = leasesData;
          } catch (err) {
            console.error('Failed to fetch Leases:', err);
            setError('Failed to fetch Leases. Your cluster may not support this resource type.');
            allLeases = [];
          }
        } else {
          // Fetch Leases for each selected namespace
          const leasePromises = selectedNamespaces.map(async (namespace) => {
            try {
              return await listResources(currentContext.name, 'leases', {
                namespace,
                apiGroup: 'coordination.k8s.io',
                apiVersion: 'v1'
              });
            } catch (err) {
              console.warn(`Failed to fetch Leases for namespace ${namespace}:`, err);
              return [];
            }
          });

          const results = await Promise.all(leasePromises);
          allLeases = results.flat();
        }

        setLeases(allLeases);
        if (allLeases.length > 0) {
          setError(null);
        }
      } catch (err) {
        console.error('Failed to fetch leases:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch leases');
      } finally {
        setLoading(false);
      }
    };

    fetchAllLeases();
  }, [currentContext, selectedNamespaces]);

  // Filter Leases based on search query
  const filteredLeases = useMemo(() => {
    if (!searchQuery.trim()) {
      return leases;
    }

    const lowercaseQuery = searchQuery.toLowerCase();

    return leases.filter(lease => {
      const name = lease.metadata?.name?.toLowerCase() || '';
      const namespace = lease.metadata?.namespace?.toLowerCase() || '';
      const holderIdentity = lease.spec?.holderIdentity?.toLowerCase() || '';
      const labels = lease.metadata?.labels || {};
      const annotations = lease.metadata?.annotations || {};

      // Check if name, namespace, or holderIdentity contains the query
      if (
        name.includes(lowercaseQuery) ||
        namespace.includes(lowercaseQuery) ||
        holderIdentity.includes(lowercaseQuery)
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
  }, [leases, searchQuery]);

  // Sort Leases based on sort state
  const sortedLeases = useMemo(() => {
    if (!sort.field || !sort.direction) {
      return filteredLeases;
    }

    return [...filteredLeases].sort((a, b) => {
      const sortMultiplier = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'name':
          return (a.metadata?.name || '').localeCompare(b.metadata?.name || '') * sortMultiplier;

        case 'namespace':
          return (a.metadata?.namespace || '').localeCompare(b.metadata?.namespace || '') * sortMultiplier;

        case 'holder': {
          const holderA = a.spec?.holderIdentity || '';
          const holderB = b.spec?.holderIdentity || '';
          return holderA.localeCompare(holderB) * sortMultiplier;
        }

        case 'duration': {
          const durationA = a.spec?.leaseDurationSeconds || 0;
          const durationB = b.spec?.leaseDurationSeconds || 0;
          return (durationA - durationB) * sortMultiplier;
        }

        case 'renewTime': {
          const renewTimeA = a.spec?.renewTime ? new Date(a.spec.renewTime).getTime() : 0;
          const renewTimeB = b.spec?.renewTime ? new Date(b.spec.renewTime).getTime() : 0;
          return (renewTimeA - renewTimeB) * sortMultiplier;
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
  }, [filteredLeases, sort.field, sort.direction]);

  const handleLeaseDetails = (lease: V1Lease) => {
    if (lease.metadata?.name && lease.metadata?.namespace) {
      navigate(`/dashboard/explore/leases/${lease.metadata.namespace}/${lease.metadata.name}`);
    }
  };

  // Format holder identity for display
  const formatHolder = (lease: V1Lease): JSX.Element => {
    const holder = lease.spec?.holderIdentity || '';

    if (!holder) {
      return <span className="text-gray-500 dark:text-gray-400">No holder</span>;
    }

    // Try to extract component name from the holder identity
    // Common formats: component_name_uuid, component-name-uuid, or component.name.uuid
    let displayName = holder;

    // Try to extract a cleaner name by removing UUIDs, IPs, etc.
    if (holder.includes('_')) {
      // Split by underscore and take parts that don't look like UUIDs or IPs
      const parts = holder.split('_');
      // Take first few parts that might represent the component name
      displayName = parts.slice(0, 2).join('_');
    } else if (holder.includes('-')) {
      // Split by dash and take parts that don't look like UUIDs or IPs
      const parts = holder.split('-');
      // If we have many parts, it might be a UUID-style ID
      if (parts.length > 3) {
        // Take first couple of parts that might represent the component name
        displayName = parts.slice(0, 2).join('-');
      }
    } else if (holder.includes('.')) {
      // Split by dot and take first part which is often the component name
      displayName = holder.split('.')[0];
    }

    // Truncate if still too long
    if (displayName.length > 30) {
      displayName = displayName.substring(0, 27) + '...';
    }

    return (
      <div className="flex flex-col">
        <span className="text-sm font-medium">{displayName}</span>
        {displayName !== holder && (
          <span className="text-xs text-gray-500 dark:text-gray-400" title={holder}>
            {holder.length > 30 ? holder.substring(0, 27) + '...' : holder}
          </span>
        )}
      </div>
    );
  };

  // Format lease duration for display
  const formatDuration = (lease: V1Lease): JSX.Element => {
    const duration = lease.spec?.leaseDurationSeconds;

    if (duration === undefined) {
      return <span className="text-gray-500 dark:text-gray-400">N/A</span>;
    }

    // Format seconds into a readable format
    if (duration < 60) {
      return <span>{duration}s</span>;
    } else if (duration < 3600) {
      const minutes = Math.floor(duration / 60);
      const seconds = duration % 60;
      return <span>{minutes}m {seconds}s</span>;
    } else {
      const hours = Math.floor(duration / 3600);
      const minutes = Math.floor((duration % 3600) / 60);
      return <span>{hours}h {minutes}m</span>;
    }
  };

  // Format renew time for display and highlight if stale
  const formatRenewTime = (lease: V1Lease): JSX.Element => {
    const renewTime = lease.spec?.renewTime;
    const leaseDuration = lease.spec?.leaseDurationSeconds || 0;

    if (!renewTime) {
      return <span className="text-gray-500 dark:text-gray-400">Never</span>;
    }

    const renewDate = new Date(renewTime);
    const now = new Date();

    // Calculate how long ago the lease was renewed
    const diffSeconds = Math.floor((now.getTime() - renewDate.getTime()) / 1000);

    // Format the renewal time
    let timeAgo: string;
    if (diffSeconds < 60) {
      timeAgo = `${diffSeconds}s ago`;
    } else if (diffSeconds < 3600) {
      timeAgo = `${Math.floor(diffSeconds / 60)}m ago`;
    } else if (diffSeconds < 86400) {
      timeAgo = `${Math.floor(diffSeconds / 3600)}h ${Math.floor((diffSeconds % 3600) / 60)}m ago`;
    } else {
      timeAgo = `${Math.floor(diffSeconds / 86400)}d ago`;
    }

    // Determine if the lease might be stale (renewal time + lease duration has passed)
    const isStale = leaseDuration > 0 && diffSeconds > leaseDuration;

    // Color based on staleness
    let textColor = 'text-green-600 dark:text-green-400';
    if (isStale) {
      textColor = 'text-red-600 dark:text-red-400';
    } else if (leaseDuration > 0 && diffSeconds > leaseDuration / 2) {
      textColor = 'text-amber-600 dark:text-amber-400';
    }

    return (
      <div className="flex flex-col">
        <span className={`text-sm font-medium ${textColor}`}>
          {timeAgo}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {renewDate.toLocaleString()}
        </span>
      </div>
    );
  };

  // Format lease transition count for display
  const formatTransitions = (lease: V1Lease): JSX.Element => {
    const transitions = lease.spec?.leaseTransitions;

    if (transitions === undefined) {
      return <span className="text-gray-500 dark:text-gray-400">N/A</span>;
    }

    return <span>{transitions}</span>;
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
          <h1 className='text-5xl font-[Anton] uppercase font-bold text-gray-800/30 dark:text-gray-700/50'>Leases</h1>
          <div className="w-full md:w-96 mt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
              <Input
                type="text"
                placeholder="Search by name, namespace, or holder..."
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

      {/* Special note about Leases */}
      {leases.length === 0 && (
        <Alert className="my-6 bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <AlertDescription>
            {searchQuery
              ? `No leases matching "${searchQuery}"`
              : selectedNamespaces.length === 0
                ? "Please select at least one namespace"
                : "No leases found in the selected namespaces. Leases are typically used for leader election and heartbeats by Kubernetes components."}
          </AlertDescription>
        </Alert>
      )}

      {/* Leases table */}
      {leases.length > 0 && (
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
                    onClick={() => handleSort('holder')}
                  >
                    Holder {renderSortIndicator('holder')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('duration')}
                  >
                    Duration {renderSortIndicator('duration')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('renewTime')}
                  >
                    Last Renewed {renderSortIndicator('renewTime')}
                  </TableHead>
                  <TableHead>
                    Transitions
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
                {sortedLeases.map((lease) => (
                  <TableRow
                    key={`${lease.metadata?.namespace}-${lease.metadata?.name}`}
                    className={`bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30 ${selectedLeases.has(`${lease.metadata?.namespace}/${lease.metadata?.name}`) ? 'bg-blue-50 dark:bg-gray-800/30' : ''
                      }`}
                    onClick={(e) => handleLeaseClick(e, lease)}
                    onContextMenu={(e) => handleContextMenu(e, lease)}
                  >
                    <TableCell className="font-medium" onClick={() => handleLeaseDetails(lease)}>
                      <div className="hover:text-blue-500 hover:underline">
                        {lease.metadata?.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="hover:text-blue-500 hover:underline" onClick={() => navigate(`/dashboard/explore/namespaces/${lease.metadata?.namespace}`)}>
                        {lease.metadata?.namespace}
                      </div>
                    </TableCell>
                    <TableCell>
                      {formatHolder(lease)}
                    </TableCell>
                    <TableCell>
                      {formatDuration(lease)}
                    </TableCell>
                    <TableCell>
                      {formatRenewTime(lease)}
                    </TableCell>
                    <TableCell>
                      {formatTransitions(lease)}
                    </TableCell>
                    <TableCell className="text-center">
                      {calculateAge(lease.metadata?.creationTimestamp?.toString())}
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

export default Leases;