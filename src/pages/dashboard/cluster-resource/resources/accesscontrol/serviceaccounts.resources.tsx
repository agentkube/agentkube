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
import { NamespaceSelector } from '@/components/custom';
import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, ExternalLink, Key } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { deleteResource } from '@/api/internal/resources';

// Define types for ServiceAccount
interface ServiceAccountSecret {
  name: string;
  namespace?: string;
}

interface ServiceAccountImagePullSecret {
  name: string;
}

interface V1ServiceAccount {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    namespace?: string;
    creationTimestamp?: string;
    labels?: { [key: string]: string };
    annotations?: { [key: string]: string };
    uid?: string;
  };
  secrets?: ServiceAccountSecret[];
  imagePullSecrets?: ServiceAccountImagePullSecret[];
  automountServiceAccountToken?: boolean;
}

// Define sorting types
type SortDirection = 'asc' | 'desc' | null;
type SortField = 'name' | 'namespace' | 'secrets' | 'tokens' | 'imagePullSecrets' | 'automount' | 'age' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

const ServiceAccounts: React.FC = () => {
  const navigate = useNavigate();
  const { currentContext } = useCluster();
  const { selectedNamespaces } = useNamespace();
  const [serviceAccounts, setServiceAccounts] = useState<V1ServiceAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // --- Start of Multi-select ---
  const [selectedServiceAccounts, setSelectedServiceAccounts] = useState<Set<string>>(new Set());
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [activeServiceAccount, setActiveServiceAccount] = useState<V1ServiceAccount | null>(null);
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
  
  // Add click handler for ServiceAccount selection with cmd/ctrl key
  const handleServiceAccountClick = (e: React.MouseEvent, serviceAccount: V1ServiceAccount) => {
    if (!serviceAccount.metadata?.namespace || !serviceAccount.metadata?.name) return;

    const saKey = `${serviceAccount.metadata.namespace}/${serviceAccount.metadata.name}`;

    if (e.metaKey || e.ctrlKey) {
      // Prevent navigation when using multi-select
      e.preventDefault();
      e.stopPropagation();

      setSelectedServiceAccounts(prev => {
        const newSelection = new Set(prev);
        if (newSelection.has(saKey)) {
          newSelection.delete(saKey);
        } else {
          newSelection.add(saKey);
        }
        return newSelection;
      });
    } else if (!selectedServiceAccounts.has(saKey)) {
      // Clear selection on regular click (unless clicking on already selected service account)
      setSelectedServiceAccounts(new Set());
      handleServiceAccountDetails(serviceAccount);
    } else {
      handleServiceAccountDetails(serviceAccount);
    }
  };

  // Add context menu handlers
  const handleContextMenu = (e: React.MouseEvent, serviceAccount: V1ServiceAccount) => {
    if (!serviceAccount.metadata?.namespace || !serviceAccount.metadata?.name) return;

    e.preventDefault();
    e.stopPropagation();

    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setActiveServiceAccount(serviceAccount);
    setShowContextMenu(true);

    // Multi-select support: if service account isn't in selection, make it the only selection
    const saKey = `${serviceAccount.metadata.namespace}/${serviceAccount.metadata.name}`;
    if (!selectedServiceAccounts.has(saKey)) {
      setSelectedServiceAccounts(new Set([saKey]));
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

        if (isOutsideTable && !isContextMenuClick && !isAlertDialogClick && selectedServiceAccounts.size > 0) {
          setSelectedServiceAccounts(new Set());
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedServiceAccounts]);

  // Handle view service account details
  const handleViewServiceAccount = () => {
    setShowContextMenu(false);
    if (activeServiceAccount) {
      handleServiceAccountDetails(activeServiceAccount);
    }
  };

  // Handle create token option
  const handleCreateToken = async () => {
    setShowContextMenu(false);

    if (!activeServiceAccount || !activeServiceAccount.metadata?.name || !activeServiceAccount.metadata?.namespace) {
      return;
    }

    try {
      // Navigate to token creation page or show dialog
      // You may want to implement a custom UI for this or navigate to a token creation page
      navigate(`/dashboard/explore/serviceaccounts/${activeServiceAccount.metadata.namespace}/${activeServiceAccount.metadata.name}/create-token`);
    } catch (error) {
      console.error('Failed to navigate to token creation:', error);
    }
  };

  // Handle delete action
  const handleDeleteClick = () => {
    setShowContextMenu(false);
    setShowDeleteDialog(true);
  };

  // Perform actual deletion
  const deleteServiceAccounts = async () => {
    setShowDeleteDialog(false);

    try {
      if (selectedServiceAccounts.size === 0 && activeServiceAccount) {
        // Delete single active ServiceAccount
        await deleteServiceAccount(activeServiceAccount);
      } else {
        // Delete all selected ServiceAccounts
        for (const saKey of selectedServiceAccounts) {
          const [namespace, name] = saKey.split('/');
          const saToDelete = serviceAccounts.find(sa =>
            sa.metadata?.namespace === namespace && sa.metadata?.name === name
          );

          if (saToDelete) {
            await deleteServiceAccount(saToDelete);
          }
        }
      }

      // Clear selection after deletion
      setSelectedServiceAccounts(new Set());

      // Refresh ServiceAccounts list after deletion
      if (currentContext && selectedNamespaces.length > 0) {
        // Fetch service accounts for each selected namespace
        const serviceAccountPromises = selectedNamespaces.map(namespace =>
          listResources(currentContext.name, 'serviceaccounts', { namespace })
        );

        const results = await Promise.all(serviceAccountPromises);
        setServiceAccounts(results.flat());
        setError(null);
      }

    } catch (error) {
      console.error('Failed to delete ServiceAccount(s):', error);
      setError(error instanceof Error ? error.message : 'Failed to delete ServiceAccount(s)');
    }
  };

  // Delete ServiceAccount function
  const deleteServiceAccount = async (serviceAccount: V1ServiceAccount) => {
    if (!currentContext || !serviceAccount.metadata?.name || !serviceAccount.metadata?.namespace) return;

    await deleteResource(
      currentContext.name,
      'serviceaccounts',
      serviceAccount.metadata.name,
      { namespace: serviceAccount.metadata.namespace }
    );
  };

  // Render the context menu
  const renderContextMenu = () => {
    if (!showContextMenu || !contextMenuPosition) return null;

    // Calculate if we need to show the menu above or below the click position
    const windowHeight = window.innerHeight;
    const menuHeight = 150; // Approximate context menu height
    const shouldShowAbove = windowHeight - contextMenuPosition.y < menuHeight;

    // Only allow token creation for a single service account
    const canCreateToken = selectedServiceAccounts.size <= 1;

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
          {selectedServiceAccounts.size > 1
            ? `${selectedServiceAccounts.size} ServiceAccounts selected`
            : activeServiceAccount?.metadata?.name || 'ServiceAccount actions'}
        </div>

        {selectedServiceAccounts.size <= 1 && (
          <>
            <div
              className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center"
              onClick={handleViewServiceAccount}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View Details
            </div>

            <div
              className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center"
              onClick={handleCreateToken}
            >
              <Key className="h-4 w-4 mr-2" />
              Create Token
            </div>
          </>
        )}

        <div
          className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center text-red-600 dark:text-red-400"
          onClick={handleDeleteClick}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete {selectedServiceAccounts.size > 1 ? `(${selectedServiceAccounts.size})` : ''}
        </div>
      </div>,
      document.body
    );
  };

  // Delete confirmation dialog
  const renderDeleteDialog = () => {
    // Check if we're deleting the default service account
    const isDefaultAccount = (sa: V1ServiceAccount): boolean => {
      return sa.metadata?.name === 'default';
    };

    const hasDefaultAccount = (): boolean => {
      if (selectedServiceAccounts.size === 0 && activeServiceAccount) {
        return isDefaultAccount(activeServiceAccount);
      }

      return Array.from(selectedServiceAccounts).some(saKey => {
        const [namespace, name] = saKey.split('/');
        return name === 'default';
      });
    };

    return (
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-gray-100 dark:bg-[#0B0D13]">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm ServiceAccount Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedServiceAccounts.size > 1
                ? `${selectedServiceAccounts.size} service accounts`
                : `"${activeServiceAccount?.metadata?.name}"`}?
              This action cannot be undone.

              <div className="mt-2 text-amber-600 dark:text-amber-400">
                Warning: Deleting service accounts will also delete their associated secrets and tokens.
                {hasDefaultAccount() && (
                  <div className="mt-1 font-medium">
                    You are about to delete a default service account. This may affect workloads that use it.
                  </div>
                )}
                <div className="mt-1">
                  Pods using these service accounts may lose their permissions and API access.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteServiceAccounts}
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

  // Fetch service accounts for all selected namespaces
  useEffect(() => {
    const fetchAllServiceAccounts = async () => {
      if (!currentContext || selectedNamespaces.length === 0) {
        setServiceAccounts([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // If no namespaces are selected, fetch from all namespaces
        let allServiceAccounts: V1ServiceAccount[] = [];

        if (selectedNamespaces.length === 0) {
          try {
            const serviceAccountsData = await listResources(currentContext.name, 'serviceaccounts');
            allServiceAccounts = serviceAccountsData;
          } catch (err) {
            console.error('Failed to fetch service accounts:', err);
            setError('Failed to fetch service accounts.');
            allServiceAccounts = [];
          }
        } else {
          // Fetch service accounts for each selected namespace
          const serviceAccountPromises = selectedNamespaces.map(async (namespace) => {
            try {
              return await listResources(currentContext.name, 'serviceaccounts', {
                namespace
              });
            } catch (err) {
              console.warn(`Failed to fetch service accounts for namespace ${namespace}:`, err);
              return [];
            }
          });

          const results = await Promise.all(serviceAccountPromises);
          allServiceAccounts = results.flat();
        }

        setServiceAccounts(allServiceAccounts);
        if (allServiceAccounts.length > 0) {
          setError(null);
        }
      } catch (err) {
        console.error('Failed to fetch service accounts:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch service accounts');
      } finally {
        setLoading(false);
      }
    };

    fetchAllServiceAccounts();
  }, [currentContext, selectedNamespaces]);

  // Filter service accounts based on search query
  const filteredServiceAccounts = useMemo(() => {
    if (!searchQuery.trim()) {
      return serviceAccounts;
    }

    const lowercaseQuery = searchQuery.toLowerCase();

    return serviceAccounts.filter(sa => {
      const name = sa.metadata?.name?.toLowerCase() || '';
      const namespace = sa.metadata?.namespace?.toLowerCase() || '';
      const labels = sa.metadata?.labels || {};
      const annotations = sa.metadata?.annotations || {};

      // Check secret names
      const secretMatches = (sa.secrets || []).some(secret =>
        secret.name.toLowerCase().includes(lowercaseQuery)
      );

      // Check image pull secret names
      const imagePullSecretMatches = (sa.imagePullSecrets || []).some(secret =>
        secret.name.toLowerCase().includes(lowercaseQuery)
      );

      // Check if name, namespace, or automount setting contains the query
      if (
        name.includes(lowercaseQuery) ||
        namespace.includes(lowercaseQuery) ||
        String(sa.automountServiceAccountToken).toLowerCase().includes(lowercaseQuery) ||
        secretMatches ||
        imagePullSecretMatches
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
  }, [serviceAccounts, searchQuery]);

  // Sort service accounts based on sort state
  const sortedServiceAccounts = useMemo(() => {
    if (!sort.field || !sort.direction) {
      return filteredServiceAccounts;
    }

    return [...filteredServiceAccounts].sort((a, b) => {
      const sortMultiplier = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'name':
          return (a.metadata?.name || '').localeCompare(b.metadata?.name || '') * sortMultiplier;

        case 'namespace':
          return (a.metadata?.namespace || '').localeCompare(b.metadata?.namespace || '') * sortMultiplier;

        case 'secrets': {
          const secretsA = a.secrets?.length || 0;
          const secretsB = b.secrets?.length || 0;
          return (secretsA - secretsB) * sortMultiplier;
        }

        case 'tokens': {
          // Count token secrets (secrets with "token" in the name)
          const tokenCountA = (a.secrets || [])
            .filter(secret => secret.name.includes('token')).length;
          const tokenCountB = (b.secrets || [])
            .filter(secret => secret.name.includes('token')).length;
          return (tokenCountA - tokenCountB) * sortMultiplier;
        }

        case 'imagePullSecrets': {
          const imagePullSecretsA = a.imagePullSecrets?.length || 0;
          const imagePullSecretsB = b.imagePullSecrets?.length || 0;
          return (imagePullSecretsA - imagePullSecretsB) * sortMultiplier;
        }

        case 'automount': {
          const automountA = a.automountServiceAccountToken === true ? 1 : 0;
          const automountB = b.automountServiceAccountToken === true ? 1 : 0;
          return (automountA - automountB) * sortMultiplier;
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
  }, [filteredServiceAccounts, sort.field, sort.direction]);

  const handleServiceAccountDetails = (serviceAccount: V1ServiceAccount) => {
    if (serviceAccount.metadata?.name && serviceAccount.metadata?.namespace) {
      navigate(`/dashboard/explore/serviceaccounts/${serviceAccount.metadata.namespace}/${serviceAccount.metadata.name}`);
    }
  };

  // Format secrets
  const formatSecrets = (serviceAccount: V1ServiceAccount): JSX.Element => {
    const secrets = serviceAccount.secrets || [];
    const tokenSecrets = secrets.filter(secret => secret.name.includes('token'));
    const otherSecrets = secrets.filter(secret => !secret.name.includes('token'));

    if (secrets.length === 0) {
      return <span className="text-gray-500 dark:text-gray-400">None</span>;
    }

    return (
      <div className="space-y-1">
        {otherSecrets.length > 0 && (
          <div className="text-sm">
            {otherSecrets.length} {otherSecrets.length === 1 ? 'secret' : 'secrets'}
          </div>
        )}
        {tokenSecrets.length > 0 && (
          <div className="text-sm text-blue-600 dark:text-blue-400">
            {tokenSecrets.length} {tokenSecrets.length === 1 ? 'token' : 'tokens'}
          </div>
        )}
      </div>
    );
  };

  // Format image pull secrets
  const formatImagePullSecrets = (serviceAccount: V1ServiceAccount): JSX.Element => {
    const imagePullSecrets = serviceAccount.imagePullSecrets || [];

    if (imagePullSecrets.length === 0) {
      return <span className="text-gray-500 dark:text-gray-400">None</span>;
    }

    return (
      <div className="space-y-1">
        <div className="text-sm">
          {imagePullSecrets.length} {imagePullSecrets.length === 1 ? 'pull secret' : 'pull secrets'}
        </div>
        {imagePullSecrets.slice(0, 2).map((secret, index) => (
          <div key={index} className="text-xs text-blue-600 dark:text-blue-400">
            {secret.name}
          </div>
        ))}
        {imagePullSecrets.length > 2 && (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            +{imagePullSecrets.length - 2} more
          </div>
        )}
      </div>
    );
  };

  // Format automount token setting
  const formatAutomountToken = (serviceAccount: V1ServiceAccount): JSX.Element => {
    // If undefined, Kubernetes defaults to true
    const automount = serviceAccount.automountServiceAccountToken !== false;

    return (
      <div className="flex items-center justify-center">
        <span className={`px-2 py-1 rounded-[0.3rem] text-xs font-medium ${automount
          ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300'
          : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
          }`}>
          {automount ? 'Enabled' : 'Disabled'}
        </span>
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
      <Alert className="m-6 bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
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
          <h1 className='text-5xl font-[Anton] uppercase font-bold text-gray-800/30 dark:text-gray-700/50'>Service Accounts</h1>
          <div className="w-full md:w-96 mt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
              <Input
                type="text"
                placeholder="Search by name, namespace, or secrets..."
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
      {sortedServiceAccounts.length === 0 && (
        <Alert className="my-6">
          <AlertDescription>
            {searchQuery
              ? `No service accounts matching "${searchQuery}"`
              : selectedNamespaces.length === 0
                ? "Please select at least one namespace"
                : "No service accounts found in the selected namespaces"}
          </AlertDescription>
        </Alert>
      )}

      {/* Service accounts table */}
      {sortedServiceAccounts.length > 0 && (
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
                    onClick={() => handleSort('secrets')}
                  >
                    Secrets {renderSortIndicator('secrets')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('imagePullSecrets')}
                  >
                    Image Pull Secrets {renderSortIndicator('imagePullSecrets')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('automount')}
                  >
                    Automount Token {renderSortIndicator('automount')}
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
                {sortedServiceAccounts.map((serviceAccount) => (
                  <TableRow
                    key={`${serviceAccount.metadata?.namespace}-${serviceAccount.metadata?.name}`}
                    className={`bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30 ${serviceAccount.metadata?.namespace && serviceAccount.metadata?.name &&
                        selectedServiceAccounts.has(`${serviceAccount.metadata.namespace}/${serviceAccount.metadata.name}`)
                        ? 'bg-blue-50 dark:bg-gray-800/30'
                        : ''
                      }`}
                    onClick={(e) => handleServiceAccountClick(e, serviceAccount)}
                    onContextMenu={(e) => handleContextMenu(e, serviceAccount)}
                  >
                    <TableCell className="font-medium" onClick={() => handleServiceAccountDetails(serviceAccount)}>
                      <div className="hover:text-blue-500 hover:underline">
                        {serviceAccount.metadata?.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="hover:text-blue-500 hover:underline" onClick={() => navigate(`/dashboard/explore/namespaces`)}>
                        {serviceAccount.metadata?.namespace}
                      </div>
                    </TableCell>
                    <TableCell>
                      {formatSecrets(serviceAccount)}
                    </TableCell>
                    <TableCell>
                      {formatImagePullSecrets(serviceAccount)}
                    </TableCell>
                    <TableCell className="text-center">
                      {formatAutomountToken(serviceAccount)}
                    </TableCell>
                    <TableCell className="text-center">
                      {calculateAge(serviceAccount.metadata?.creationTimestamp?.toString())}
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

export default ServiceAccounts;