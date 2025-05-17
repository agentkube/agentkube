import React, { useState, useEffect, useMemo } from 'react';
import { getSecrets } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';
import { useNamespace } from '@/contexts/useNamespace';
import { V1Secret } from '@kubernetes/client-node';
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, MoreVertical, Search, ArrowUpDown, ArrowUp, ArrowDown, LockIcon } from "lucide-react";
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

// Define sorting types
type SortDirection = 'asc' | 'desc' | null;
type SortField = 'name' | 'namespace' | 'type' | 'dataCount' | 'age' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

const Secrets: React.FC = () => {
  const navigate = useNavigate();
  const { currentContext } = useCluster();
  const { selectedNamespaces } = useNamespace();
  const [secrets, setSecrets] = useState<V1Secret[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // --- Start of Multi-select ---
  const [selectedSecrets, setSelectedSecrets] = useState<Set<string>>(new Set());
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [activeSecret, setActiveSecret] = useState<V1Secret | null>(null);
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
  
  // Add click handler for secret selection with cmd/ctrl key
  const handleSecretClick = (e: React.MouseEvent, secret: V1Secret) => {
    const secretKey = `${secret.metadata?.namespace}/${secret.metadata?.name}`;

    if (e.metaKey || e.ctrlKey) {
      // Prevent navigation when using multi-select
      e.preventDefault();
      e.stopPropagation();

      setSelectedSecrets(prev => {
        const newSelection = new Set(prev);
        if (newSelection.has(secretKey)) {
          newSelection.delete(secretKey);
        } else {
          newSelection.add(secretKey);
        }
        return newSelection;
      });
    } else if (!selectedSecrets.has(secretKey)) {
      // Clear selection on regular click (unless clicking on already selected secret)
      setSelectedSecrets(new Set());
      handleSecretDetails(secret);
    } else {
      handleSecretDetails(secret);
    }
  };

  // Add context menu handlers
  const handleContextMenu = (e: React.MouseEvent, secret: V1Secret) => {
    e.preventDefault();
    e.stopPropagation();

    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setActiveSecret(secret);
    setShowContextMenu(true);

    // Multi-select support: if secret isn't in selection, make it the only selection
    const secretKey = `${secret.metadata?.namespace}/${secret.metadata?.name}`;
    if (!selectedSecrets.has(secretKey)) {
      setSelectedSecrets(new Set([secretKey]));
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

        if (isOutsideTable && !isContextMenuClick && !isAlertDialogClick && selectedSecrets.size > 0) {
          setSelectedSecrets(new Set());
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedSecrets]);

  // Handle view action - only available for a single secret
  const handleViewSecret = () => {
    setShowContextMenu(false);

    if (activeSecret && activeSecret.metadata?.name && activeSecret.metadata?.namespace) {
      navigate(`/dashboard/explore/secrets/${activeSecret.metadata.namespace}/${activeSecret.metadata.name}`);
    }
  };

  // Handle delete action
  const handleDeleteClick = () => {
    setShowContextMenu(false);
    setShowDeleteDialog(true);
  };

  // Perform actual deletion
  const deleteSecrets = async () => {
    setShowDeleteDialog(false);

    try {
      if (selectedSecrets.size === 0 && activeSecret) {
        // Delete single active secret
        await deleteSecret(activeSecret);
      } else {
        // Delete all selected secrets
        for (const secretKey of selectedSecrets) {
          const [namespace, name] = secretKey.split('/');
          const secretToDelete = secrets.find(s =>
            s.metadata?.namespace === namespace && s.metadata?.name === name
          );

          if (secretToDelete) {
            await deleteSecret(secretToDelete);
          }
        }
      }

      // Clear selection after deletion
      setSelectedSecrets(new Set());

      // Refresh secret list after deletion
      if (currentContext && selectedNamespaces.length > 0) {
        const fetchSecrets = async () => {
          try {
            setLoading(true);

            // Fetch secrets for each selected namespace
            const secretPromises = selectedNamespaces.map(namespace =>
              getSecrets(currentContext.name, namespace)
            );

            const results = await Promise.all(secretPromises);
            const allSecrets = results.flat();

            setSecrets(allSecrets);
            setError(null);
          } catch (err) {
            console.error('Failed to fetch secrets:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch secrets');
          } finally {
            setLoading(false);
          }
        };

        fetchSecrets();
      }

    } catch (error) {
      console.error('Failed to delete secret(s):', error);
      setError(error instanceof Error ? error.message : 'Failed to delete secret(s)');
    }
  };

  // Delete secret function
  const deleteSecret = async (secret: V1Secret) => {
    if (!currentContext || !secret.metadata?.name || !secret.metadata?.namespace) return;

    await deleteResource(
      currentContext.name,
      'secrets',
      secret.metadata.name,
      { namespace: secret.metadata.namespace }
    );
  };

  // Check if selected secrets contain system secrets
  const hasSystemSecrets = () => {
    if (selectedSecrets.size === 0 && activeSecret) {
      return isSystemSecret(activeSecret);
    }

    return Array.from(selectedSecrets).some(secretKey => {
      const [namespace, name] = secretKey.split('/');
      const secret = secrets.find(s =>
        s.metadata?.namespace === namespace && s.metadata?.name === name
      );
      return secret ? isSystemSecret(secret) : false;
    });
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
          {selectedSecrets.size > 1
            ? `${selectedSecrets.size} Secrets selected`
            : activeSecret?.metadata?.name || 'Secret actions'}
        </div>

        <div
          className={`px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center ${selectedSecrets.size > 1 ? 'text-gray-400 dark:text-gray-600 pointer-events-none' : ''}`}
          onClick={selectedSecrets.size <= 1 ? handleViewSecret : undefined}
          title={selectedSecrets.size > 1 ? "Select only one secret to view" : ""}
        >
          <Eye className="h-4 w-4 mr-2" />
          View
        </div>

        <div
          className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center text-red-600 dark:text-red-400"
          onClick={handleDeleteClick}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete {selectedSecrets.size > 1 ? `(${selectedSecrets.size})` : ''}
        </div>
      </div>,
      document.body
    );
  };

  // Delete confirmation dialog
  const renderDeleteDialog = () => {
    const systemSecretWarning = hasSystemSecrets();

    return (
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-gray-100 dark:bg-[#0B0D13]">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Secret Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedSecrets.size > 1
                ? `${selectedSecrets.size} Secrets`
                : `"${activeSecret?.metadata?.name}"`}?
              This action cannot be undone.

              <div className="mt-2 text-amber-600 dark:text-amber-400">
                Warning: Deleting Secrets may impact applications that depend on them.
                {systemSecretWarning && (
                  <div className="mt-1 font-medium">
                    You are deleting system Secrets! This may severely impact your cluster functionality.
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteSecrets}
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

  // Fetch secrets for all selected namespaces
  useEffect(() => {
    const fetchAllSecrets = async () => {
      if (!currentContext || selectedNamespaces.length === 0) {
        setSecrets([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // If no namespaces are selected, fetch from all namespaces
        if (selectedNamespaces.length === 0) {
          const secretsData = await getSecrets(currentContext.name);
          setSecrets(secretsData);
          return;
        }

        // Fetch secrets for each selected namespace
        const secretPromises = selectedNamespaces.map(namespace =>
          getSecrets(currentContext.name, namespace)
        );

        const results = await Promise.all(secretPromises);

        // Flatten the array of secret arrays
        const allSecrets = results.flat();
        setSecrets(allSecrets);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch secrets:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch secrets');
      } finally {
        setLoading(false);
      }
    };

    fetchAllSecrets();
  }, [currentContext, selectedNamespaces]);

  // Filter secrets based on search query
  const filteredSecrets = useMemo(() => {
    if (!searchQuery.trim()) {
      return secrets;
    }

    const lowercaseQuery = searchQuery.toLowerCase();

    return secrets.filter(secret => {
      const name = secret.metadata?.name?.toLowerCase() || '';
      const namespace = secret.metadata?.namespace?.toLowerCase() || '';
      const type = secret.type?.toLowerCase() || '';
      const labels = secret.metadata?.labels || {};
      const annotations = secret.metadata?.annotations || {};

      // Check if any data key contains the query
      const dataKeys = Object.keys(secret.data || {});
      const dataKeyMatches = dataKeys.some(key => key.toLowerCase().includes(lowercaseQuery));

      // Check if name, namespace, type, or any data key contains the query
      if (
        name.includes(lowercaseQuery) ||
        namespace.includes(lowercaseQuery) ||
        type.includes(lowercaseQuery) ||
        dataKeyMatches
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
  }, [secrets, searchQuery]);

  // Sort secrets based on sort state
  const sortedSecrets = useMemo(() => {
    if (!sort.field || !sort.direction) {
      return filteredSecrets;
    }

    return [...filteredSecrets].sort((a, b) => {
      const sortMultiplier = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'name':
          return (a.metadata?.name || '').localeCompare(b.metadata?.name || '') * sortMultiplier;

        case 'namespace':
          return (a.metadata?.namespace || '').localeCompare(b.metadata?.namespace || '') * sortMultiplier;

        case 'type': {
          const typeA = a.type || 'Opaque';
          const typeB = b.type || 'Opaque';
          return typeA.localeCompare(typeB) * sortMultiplier;
        }

        case 'dataCount': {
          const countA = Object.keys(a.data || {}).length;
          const countB = Object.keys(b.data || {}).length;
          return (countA - countB) * sortMultiplier;
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
  }, [filteredSecrets, sort.field, sort.direction]);

  const handleSecretDetails = (secret: V1Secret) => {
    if (secret.metadata?.name && secret.metadata?.namespace) {
      navigate(`/dashboard/explore/secrets/${secret.metadata.namespace}/${secret.metadata.name}`);
    }
  };

  // Format secret type for display
  const formatSecretType = (type: string | undefined): string => {
    if (!type) return 'Opaque';

    // If it's a kubernetes.io type, extract the main part
    if (type.startsWith('kubernetes.io/')) {
      return type.replace('kubernetes.io/', '');
    }

    return type;
  };

  // Format data keys for display
  const formatDataKeys = (secret: V1Secret): JSX.Element => {
    const dataKeys = Object.keys(secret.data || {});

    if (dataKeys.length === 0) {
      return <span className="text-gray-500 dark:text-gray-400">No data</span>;
    }

    // If there are too many keys, show a summary
    if (dataKeys.length > 3) {
      return (
        <div>
          <div className="mb-1">{dataKeys.slice(0, 3).join(', ')}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            +{dataKeys.length - 3} more keys
          </div>
        </div>
      );
    }

    return <div>{dataKeys.join(', ')}</div>;
  };

  // Get secret type badge class
  const getSecretTypeBadgeClass = (type: string | undefined): string => {
    const normalizedType = formatSecretType(type);

    switch (normalizedType) {
      case 'tls':
      case 'TLS':
      case 'certificate':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300';
      case 'dockerconfigjson':
      case 'dockercfg':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300';
      case 'basic-auth':
      case 'ssh-auth':
      case 'service-account-token':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300';
      case 'bootstrap':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  // Check if this is a special system secret
  const isSystemSecret = (secret: V1Secret): boolean => {
    const name = secret.metadata?.name || '';
    const type = secret.type || '';

    // Service account tokens
    if (name.startsWith('default-token-') || type === 'kubernetes.io/service-account-token') {
      return true;
    }

    // Cert secrets generated by cert-manager
    if (name.includes('-tls') && (type === 'kubernetes.io/tls' || type === 'tls.crt')) {
      return true;
    }

    // Docker registry credentials created by Kubernetes
    if (name.includes('registry') && type === 'kubernetes.io/dockerconfigjson') {
      return true;
    }

    return false;
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
          <h1 className='text-5xl font-[Anton] uppercase font-bold text-gray-800/30 dark:text-gray-700/50'>Secrets</h1>
          <div className="w-full md:w-96 mt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
              <Input
                type="text"
                placeholder="Search by name, namespace, type, or key..."
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
      {sortedSecrets.length === 0 && (
        <Alert className="my-6 bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <AlertDescription>
            {searchQuery
              ? `No secrets matching "${searchQuery}"`
              : selectedNamespaces.length === 0
                ? "Please select at least one namespace"
                : "No secrets found in the selected namespaces"}
          </AlertDescription>
        </Alert>
      )}

      {/* Secrets table */}
      {sortedSecrets.length > 0 && (
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
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('type')}
                  >
                    Type {renderSortIndicator('type')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:text-blue-500 text-center"
                    onClick={() => handleSort('dataCount')}
                  >
                    Data {renderSortIndicator('dataCount')}
                  </TableHead>
                  <TableHead>
                    Keys
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
                {sortedSecrets.map((secret) => (
                  <TableRow
                    key={`${secret.metadata?.namespace}-${secret.metadata?.name}`}
                    className={`bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30 ${isSystemSecret(secret) ? 'opacity-60' : ''
                      } ${selectedSecrets.has(`${secret.metadata?.namespace}/${secret.metadata?.name}`) ? 'bg-blue-50 dark:bg-gray-800/30' : ''
                      }`}
                    onClick={(e) => handleSecretClick(e, secret)}
                    onContextMenu={(e) => handleContextMenu(e, secret)}
                  >
                    <TableCell className="font-medium" onClick={() => handleSecretDetails(secret)}>
                      <div className="hover:text-blue-500 hover:underline flex items-center">
                        {isSystemSecret(secret) && (
                          <LockIcon className="w-4 h-4 mr-1 text-gray-500 dark:text-gray-400" />
                        )}
                        {secret.metadata?.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="hover:text-blue-500 hover:underline" onClick={() => navigate(`/dashboard/explore/namespaces`)}>
                        {secret.metadata?.namespace}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`px-2 py-1 rounded-[0.3rem] text-xs font-medium ${getSecretTypeBadgeClass(secret.type)}`}>
                        {formatSecretType(secret.type)}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="px-2 py-1 rounded-[0.3rem] text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
                        {Object.keys(secret.data || {}).length}
                      </span>
                    </TableCell>
                    <TableCell>
                      {formatDataKeys(secret)}
                    </TableCell>
                    <TableCell className="text-center">
                      {calculateAge(secret.metadata?.creationTimestamp?.toString())}
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

export default Secrets;