import React, { useState, useEffect, useMemo } from 'react';
import { deleteResource, getNamespaces } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';
import { V1Namespace } from '@kubernetes/client-node';
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Search, ArrowUpDown, ArrowUp, ArrowDown, MoreVertical, Eye, Trash, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { calculateAge } from '@/utils/age';
import { DeletionDialog, ErrorComponent } from '@/components/custom';
import { useNavigate } from 'react-router-dom';
// Define sorting types
type SortDirection = 'asc' | 'desc' | null;
type SortField = 'name' | 'status' | 'age' | 'labels' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

const Namespaces: React.FC = () => {
  const { currentContext } = useCluster();
  const navigate = useNavigate();
  const [namespaces, setNamespaces] = useState<V1Namespace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [namespaceToDelete, setNamespaceToDelete] = useState<V1Namespace | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [sort, setSort] = useState<SortState>({
    field: null,
    direction: null
  });

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

  useEffect(() => {
    const fetchNamespaces = async () => {
      if (!currentContext) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const namespacesData = await getNamespaces(currentContext.name);
        setNamespaces(namespacesData);
      } catch (err) {
        console.error('Failed to fetch namespaces:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch namespaces');
      } finally {
        setLoading(false);
      }
    };

    fetchNamespaces();
  }, [currentContext]);

  // Filter namespaces based on search query
  const filteredNamespaces = useMemo(() => {
    if (!searchQuery.trim()) {
      return namespaces;
    }

    const lowercaseQuery = searchQuery.toLowerCase();

    return namespaces.filter(namespace => {
      const name = namespace.metadata?.name?.toLowerCase() || '';
      const status = namespace.status?.phase?.toLowerCase() || '';
      const labels = namespace.metadata?.labels || {};

      // Check if name or status contains the query
      if (name.includes(lowercaseQuery) || status.includes(lowercaseQuery)) {
        return true;
      }

      // Check if any label contains the query
      return Object.entries(labels).some(
        ([key, value]) =>
          key.toLowerCase().includes(lowercaseQuery) ||
          (typeof value === 'string' && value.toLowerCase().includes(lowercaseQuery))
      );
    });
  }, [namespaces, searchQuery]);

  // Sort namespaces based on sort state
  const sortedNamespaces = useMemo(() => {
    if (!sort.field || !sort.direction) {
      return filteredNamespaces;
    }

    return [...filteredNamespaces].sort((a, b) => {
      const sortMultiplier = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'name':
          return (a.metadata?.name || '').localeCompare(b.metadata?.name || '') * sortMultiplier;

        case 'status': {
          const statusA = a.status?.phase || 'Unknown';
          const statusB = b.status?.phase || 'Unknown';
          return statusA.localeCompare(statusB) * sortMultiplier;
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
  }, [filteredNamespaces, sort.field, sort.direction]);

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

  // Handlers for namespace actions
  const handleViewNamespace = (namespace: V1Namespace) => {
    navigate(`/dashboard/explore/namespaces/${namespace.metadata?.name}`);
  };

  const handleDeleteNamespace = (namespace: V1Namespace) => {
    setNamespaceToDelete(namespace);
    setShowDeleteDialog(true);
  };

  // Function to handle actual deletion
  const confirmNamespaceDeletion = async () => {
    if (!namespaceToDelete?.metadata?.name || !currentContext) {
      setShowDeleteDialog(false);
      return;
    }

    try {
      setDeleteLoading(true);

      await deleteResource(
        currentContext.name,
        'namespaces',
        namespaceToDelete.metadata.name
      );

      // Update the UI by removing the deleted namespace
      setNamespaces(prevNamespaces =>
        prevNamespaces.filter(ns => ns.metadata?.name !== namespaceToDelete.metadata?.name)
      );

      // Optional: Show success toast/notification if you have a notification system
    } catch (err) {
      console.error('Failed to delete namespace:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete namespace');
    } finally {
      setDeleteLoading(false);
      setShowDeleteDialog(false);
      setNamespaceToDelete(null);
    }
  };


  const handleEditNamespace = (namespace: V1Namespace) => {
    console.log('Edit namespace:', namespace.metadata?.name);
    // Implement edit functionality
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
      <div>
        <h1 className='text-5xl font-[Anton] uppercase font-bold text-gray-800/30 dark:text-gray-700/50'>Namespaces</h1>
        <div className="w-full md:w-96 mt-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
            <Input
              type="text"
              placeholder="Search by name, status, or label..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
      </div>
      {namespaceToDelete && (
        <DeletionDialog
          isOpen={showDeleteDialog}
          onClose={() => setShowDeleteDialog(false)}
          onConfirm={confirmNamespaceDeletion}
          title="Delete Namespace"
          description="Are you sure you want to delete this namespace? This will permanently remove all resources within this namespace including deployments, services, and pods."
          resourceName={namespaceToDelete.metadata?.name || ""}
          resourceType="namespace"
          isLoading={deleteLoading}
        />
      )}
      {sortedNamespaces.length === 0 ? (
        <Alert className="m-6 bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <AlertDescription>
            {searchQuery ? `No namespaces matching "${searchQuery}"` : "No namespaces found"}
          </AlertDescription>
        </Alert>
      ) : (
        <Card className="bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <div className="rounded-md border">
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
                    onClick={() => handleSort('status')}
                  >
                    Status {renderSortIndicator('status')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('age')}
                  >
                    Age {renderSortIndicator('age')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('labels')}
                  >
                    Labels {renderSortIndicator('labels')}
                  </TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedNamespaces.map((namespace) => (
                  <TableRow
                    key={namespace.metadata?.uid}
                    className="bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30"
                  >
                    <TableCell className="font-medium"
                      onClick={() => navigate(`/dashboard/explore/namespaces/${namespace.metadata?.name}`)}
                    >{namespace.metadata?.name}</TableCell>
                    <TableCell>
                      <span
                        className={`px-2 py-1 rounded-[0.3rem] text-xs font-medium ${namespace.status?.phase === 'Active'
                          ? 'bg-green-200 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'border border-yellow-800/40 dark:border-yellow-400/20 bg-yellow-400/50 dark:bg-yellow-900/10 text-yellow-800 dark:text-yellow-800'
                          }`}
                      >
                        {namespace.status?.phase || 'Unknown'}
                      </span>
                    </TableCell>
                    <TableCell>{calculateAge(namespace.metadata?.creationTimestamp?.toString())}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {namespace.metadata?.labels && Object.entries(namespace.metadata.labels).map(([key, value]) => (
                          <span
                            key={key}
                            className="px-2 py-1 rounded-[0.3rem] text-xs font-medium bg-gray-200 dark:bg-transparent dark:hover:bg-gray-800/50 border border-gray-300 dark:border-gray-800 text-gray-700 dark:text-gray-300"
                          >
                            {key}: {value}
                          </span>
                        ))}
                      </div>
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
                        <DropdownMenuContent align="end" className='dark:bg-[#0B0D13]/40 backdrop-blur-sm text-gray-800 dark:text-gray-300 '>
                          <DropdownMenuItem onClick={() => handleViewNamespace(namespace)} className='hover:text-gray-700 dark:hover:text-gray-500'>
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-500 dark:text-red-400 focus:text-red-500 dark:focus:text-red-400 hover:text-red-700 dark:hover:text-red-500"
                            onClick={() => handleDeleteNamespace(namespace)}

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

export default Namespaces;