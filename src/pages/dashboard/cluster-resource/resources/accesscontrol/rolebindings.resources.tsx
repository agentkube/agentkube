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
import { Trash2, ExternalLink, Copy, UserPlus } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { deleteResource } from '@/api/internal/resources';

// Define types for Subject and RoleBinding
interface Subject {
  kind: string;
  name: string;
  namespace?: string;
  apiGroup?: string;
}

interface RoleRef {
  kind: string;
  name: string;
  apiGroup: string;
}

interface V1RoleBinding {
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
  subjects?: Subject[];
  roleRef: RoleRef;
}

// Define sorting types
type SortDirection = 'asc' | 'desc' | null;
type SortField = 'name' | 'namespace' | 'role' | 'subjects' | 'age' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

const RoleBindings: React.FC = () => {
  const navigate = useNavigate();
  const { currentContext } = useCluster();
  const { selectedNamespaces } = useNamespace();
  const [roleBindings, setRoleBindings] = useState<V1RoleBinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // --- Start of Multi-select ---
  const [selectedRoleBindings, setSelectedRoleBindings] = useState<Set<string>>(new Set());
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [activeRoleBinding, setActiveRoleBinding] = useState<V1RoleBinding | null>(null);
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
  
  // Add click handler for RoleBinding selection with cmd/ctrl key
  const handleRoleBindingClick = (e: React.MouseEvent, binding: V1RoleBinding) => {
    if (!binding.metadata?.namespace || !binding.metadata?.name) return;

    const bindingKey = `${binding.metadata.namespace}/${binding.metadata.name}`;

    if (e.metaKey || e.ctrlKey) {
      // Prevent navigation when using multi-select
      e.preventDefault();
      e.stopPropagation();

      setSelectedRoleBindings(prev => {
        const newSelection = new Set(prev);
        if (newSelection.has(bindingKey)) {
          newSelection.delete(bindingKey);
        } else {
          newSelection.add(bindingKey);
        }
        return newSelection;
      });
    } else if (!selectedRoleBindings.has(bindingKey)) {
      // Clear selection on regular click (unless clicking on already selected binding)
      setSelectedRoleBindings(new Set());
      handleRoleBindingDetails(binding);
    } else {
      handleRoleBindingDetails(binding);
    }
  };

  // Add context menu handlers
  const handleContextMenu = (e: React.MouseEvent, binding: V1RoleBinding) => {
    if (!binding.metadata?.namespace || !binding.metadata?.name) return;

    e.preventDefault();
    e.stopPropagation();

    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setActiveRoleBinding(binding);
    setShowContextMenu(true);

    // Multi-select support: if binding isn't in selection, make it the only selection
    const bindingKey = `${binding.metadata.namespace}/${binding.metadata.name}`;
    if (!selectedRoleBindings.has(bindingKey)) {
      setSelectedRoleBindings(new Set([bindingKey]));
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

        if (isOutsideTable && !isContextMenuClick && !isAlertDialogClick && selectedRoleBindings.size > 0) {
          setSelectedRoleBindings(new Set());
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedRoleBindings]);

  // Handle view role binding details
  const handleViewRoleBinding = () => {
    setShowContextMenu(false);
    if (activeRoleBinding) {
      handleRoleBindingDetails(activeRoleBinding);
    }
  };

  // Handle add subject
  const handleAddSubject = () => {
    setShowContextMenu(false);

    if (!activeRoleBinding || !activeRoleBinding.metadata?.name || !activeRoleBinding.metadata?.namespace) {
      return;
    }

    // Navigate to add subject page
    navigate(`/dashboard/explore/rolebindings/${activeRoleBinding.metadata.namespace}/${activeRoleBinding.metadata.name}/add-subject`);
  };

  // Handle clone role binding
  const handleCloneRoleBinding = async () => {
    setShowContextMenu(false);

    try {
      if (!activeRoleBinding || !activeRoleBinding.metadata?.name || !activeRoleBinding.metadata?.namespace) {
        return;
      }

      // Ask for the new role binding name
      const newName = prompt("Enter name for the cloned RoleBinding:", `${activeRoleBinding.metadata.name}-clone`);
      if (!newName) return; // User cancelled

      // Create a new RoleBinding based on the existing one
      const newRoleBinding = {
        apiVersion: 'rbac.authorization.k8s.io/v1',
        kind: 'RoleBinding',
        metadata: {
          name: newName,
          namespace: activeRoleBinding.metadata.namespace,
          // Copy labels but add a cloned-from label
          labels: {
            ...(activeRoleBinding.metadata.labels || {}),
            clonedFrom: activeRoleBinding.metadata.name
          }
        },
        // Copy roleRef and subjects
        roleRef: activeRoleBinding.roleRef,
        subjects: activeRoleBinding.subjects
      };

      if (!currentContext) return;

      // Create the new RoleBinding
      await fetch(`/operator/clusters/${currentContext.name}/apis/rbac.authorization.k8s.io/v1/namespaces/${activeRoleBinding.metadata.namespace}/rolebindings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newRoleBinding),
      });

      // Refresh role bindings list
      if (currentContext && selectedNamespaces.length > 0) {
        const roleBindingPromises = selectedNamespaces.map(namespace =>
          listResources(currentContext.name, 'rolebindings', {
            namespace,
            apiGroup: 'rbac.authorization.k8s.io',
            apiVersion: 'v1'
          })
        );

        const results = await Promise.all(roleBindingPromises);
        setRoleBindings(results.flat());
      }

    } catch (error) {
      console.error('Failed to clone RoleBinding:', error);
      setError(error instanceof Error ? error.message : 'Failed to clone RoleBinding');
    }
  };

  // Handle delete action
  const handleDeleteClick = () => {
    setShowContextMenu(false);
    setShowDeleteDialog(true);
  };

  // Perform actual deletion
  const deleteRoleBindings = async () => {
    setShowDeleteDialog(false);

    try {
      if (selectedRoleBindings.size === 0 && activeRoleBinding) {
        // Delete single active RoleBinding
        await deleteRoleBinding(activeRoleBinding);
      } else {
        // Delete all selected RoleBindings
        for (const bindingKey of selectedRoleBindings) {
          const [namespace, name] = bindingKey.split('/');
          const bindingToDelete = roleBindings.find(b =>
            b.metadata?.namespace === namespace && b.metadata?.name === name
          );

          if (bindingToDelete) {
            await deleteRoleBinding(bindingToDelete);
          }
        }
      }

      // Clear selection after deletion
      setSelectedRoleBindings(new Set());

      // Refresh RoleBindings list after deletion
      if (currentContext && selectedNamespaces.length > 0) {
        const roleBindingPromises = selectedNamespaces.map(namespace =>
          listResources(currentContext.name, 'rolebindings', {
            namespace,
            apiGroup: 'rbac.authorization.k8s.io',
            apiVersion: 'v1'
          })
        );

        const results = await Promise.all(roleBindingPromises);
        setRoleBindings(results.flat());
      }

    } catch (error) {
      console.error('Failed to delete RoleBinding(s):', error);
      setError(error instanceof Error ? error.message : 'Failed to delete RoleBinding(s)');
    }
  };

  // Delete RoleBinding function
  const deleteRoleBinding = async (binding: V1RoleBinding) => {
    if (!currentContext || !binding.metadata?.name || !binding.metadata?.namespace) return;

    await deleteResource(
      currentContext.name,
      'rolebindings',
      binding.metadata.name,
      {
        namespace: binding.metadata.namespace,
        apiGroup: 'rbac.authorization.k8s.io',
        apiVersion: 'v1'
      }
    );
  };

  // Check if binding has System:ServiceAccount subjects
  const hasServiceAccountSubjects = (binding: V1RoleBinding): boolean => {
    return (binding.subjects || []).some(subject =>
      subject.kind === 'ServiceAccount'
    );
  };

  // Render the context menu
  const renderContextMenu = () => {
    if (!showContextMenu || !contextMenuPosition) return null;

    // Calculate if we need to show the menu above or below the click position
    const windowHeight = window.innerHeight;
    const menuHeight = 180; // Approximate context menu height
    const shouldShowAbove = windowHeight - contextMenuPosition.y < menuHeight;

    // Single selection options only available for single role binding
    const isSingleSelection = selectedRoleBindings.size <= 1;

    return createPortal(
      <div
        ref={contextMenuRef}
        className="fixed z-50 min-w-[200px] bg-white dark:bg-[#0B0D13] backdrop-blur-sm rounded-md shadow-lg border border-gray-300 dark:border-gray-800/60 py-1 text-sm"
        style={{
          left: `${contextMenuPosition.x}px`,
          top: shouldShowAbove
            ? `${contextMenuPosition.y - menuHeight}px`
            : `${contextMenuPosition.y}px`,
        }}
      >
        <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 font-medium border-b border-gray-200 dark:border-gray-800/60">
          {selectedRoleBindings.size > 1
            ? `${selectedRoleBindings.size} RoleBindings selected`
            : activeRoleBinding?.metadata?.name || 'RoleBinding actions'}
        </div>

        {isSingleSelection && (
          <>
            <div
              className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center"
              onClick={handleViewRoleBinding}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View Details
            </div>

            <div
              className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center"
              onClick={handleAddSubject}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Add Subject
            </div>

            <div
              className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center"
              onClick={handleCloneRoleBinding}
            >
              <Copy className="h-4 w-4 mr-2" />
              Clone
            </div>
          </>
        )}

        <div
          className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center text-red-600 dark:text-red-400"
          onClick={handleDeleteClick}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete {selectedRoleBindings.size > 1 ? `(${selectedRoleBindings.size})` : ''}
        </div>
      </div>,
      document.body
    );
  };

  // Delete confirmation dialog
  const renderDeleteDialog = () => {
    // Check if any of the selected role bindings have ServiceAccount subjects
    const hasSASubjects = (): boolean => {
      if (selectedRoleBindings.size === 0 && activeRoleBinding) {
        return hasServiceAccountSubjects(activeRoleBinding);
      }

      return Array.from(selectedRoleBindings).some(bindingKey => {
        const [namespace, name] = bindingKey.split('/');
        const binding = roleBindings.find(b => b.metadata?.namespace === namespace && b.metadata?.name === name);
        return binding ? hasServiceAccountSubjects(binding) : false;
      });
    };

    return (
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-gray-100 dark:bg-[#0B0D13]">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm RoleBinding Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedRoleBindings.size > 1
                ? `${selectedRoleBindings.size} role bindings`
                : `"${activeRoleBinding?.metadata?.name}"`}?
              This action cannot be undone.

              <div className="mt-2 text-amber-600 dark:text-amber-400">
                Warning: Deleting role bindings will remove access permissions for the associated subjects.
                {hasSASubjects() && (
                  <div className="mt-1 font-medium">
                    One or more selected role bindings grant permissions to ServiceAccounts, which may affect workloads.
                  </div>
                )}
                <div className="mt-1">
                  Users, groups, and service accounts will lose the permissions granted by these bindings immediately.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteRoleBindings}
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

  // Fetch role bindings for all selected namespaces
  useEffect(() => {
    const fetchAllRoleBindings = async () => {
      if (!currentContext || selectedNamespaces.length === 0) {
        setRoleBindings([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // If no namespaces are selected, fetch from all namespaces
        let allRoleBindings: V1RoleBinding[] = [];

        if (selectedNamespaces.length === 0) {
          try {
            const roleBindingsData = await listResources(currentContext.name, 'rolebindings', {
              apiGroup: 'rbac.authorization.k8s.io',
              apiVersion: 'v1'
            });
            allRoleBindings = roleBindingsData;
          } catch (err) {
            console.error('Failed to fetch role bindings:', err);
            setError('Failed to fetch role bindings');
            allRoleBindings = [];
          }
        } else {
          // Fetch role bindings for each selected namespace
          const roleBindingPromises = selectedNamespaces.map(async (namespace) => {
            try {
              return await listResources(currentContext.name, 'rolebindings', {
                namespace,
                apiGroup: 'rbac.authorization.k8s.io',
                apiVersion: 'v1'
              });
            } catch (err) {
              console.warn(`Failed to fetch role bindings for namespace ${namespace}:`, err);
              return [];
            }
          });

          const results = await Promise.all(roleBindingPromises);
          allRoleBindings = results.flat();
        }

        setRoleBindings(allRoleBindings);
        if (allRoleBindings.length > 0) {
          setError(null);
        }
      } catch (err) {
        console.error('Failed to fetch role bindings:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch role bindings');
      } finally {
        setLoading(false);
      }
    };

    fetchAllRoleBindings();
  }, [currentContext, selectedNamespaces]);

  // Filter role bindings based on search query
  const filteredRoleBindings = useMemo(() => {
    if (!searchQuery.trim()) {
      return roleBindings;
    }

    const lowercaseQuery = searchQuery.toLowerCase();

    return roleBindings.filter(binding => {
      const name = binding.metadata?.name?.toLowerCase() || '';
      const namespace = binding.metadata?.namespace?.toLowerCase() || '';
      const roleName = binding.roleRef.name.toLowerCase();
      const labels = binding.metadata?.labels || {};
      const annotations = binding.metadata?.annotations || {};

      // Check if any subject matches the query
      const subjectMatches = (binding.subjects || []).some(subject => {
        const subjectKind = subject.kind.toLowerCase();
        const subjectName = subject.name.toLowerCase();
        const subjectNamespace = subject.namespace?.toLowerCase() || '';

        return subjectKind.includes(lowercaseQuery) ||
          subjectName.includes(lowercaseQuery) ||
          subjectNamespace.includes(lowercaseQuery);
      });

      // Check if name, namespace, or role reference contains the query
      if (
        name.includes(lowercaseQuery) ||
        namespace.includes(lowercaseQuery) ||
        roleName.includes(lowercaseQuery) ||
        binding.roleRef.kind.toLowerCase().includes(lowercaseQuery) ||
        subjectMatches
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
  }, [roleBindings, searchQuery]);

  // Sort role bindings based on sort state
  const sortedRoleBindings = useMemo(() => {
    if (!sort.field || !sort.direction) {
      return filteredRoleBindings;
    }

    return [...filteredRoleBindings].sort((a, b) => {
      const sortMultiplier = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'name':
          return (a.metadata?.name || '').localeCompare(b.metadata?.name || '') * sortMultiplier;

        case 'namespace':
          return (a.metadata?.namespace || '').localeCompare(b.metadata?.namespace || '') * sortMultiplier;

        case 'role':
          return (a.roleRef.name).localeCompare(b.roleRef.name) * sortMultiplier;

        case 'subjects': {
          // Sort by number of subjects
          const subjectsCountA = a.subjects?.length || 0;
          const subjectsCountB = b.subjects?.length || 0;
          return (subjectsCountA - subjectsCountB) * sortMultiplier;
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
  }, [filteredRoleBindings, sort.field, sort.direction]);

  const handleRoleBindingDetails = (binding: V1RoleBinding) => {
    if (binding.metadata?.name && binding.metadata?.namespace) {
      navigate(`/dashboard/explore/rolebindings/${binding.metadata.namespace}/${binding.metadata.name}`);
    }
  };

  // Format role reference
  const formatRoleRef = (binding: V1RoleBinding): JSX.Element => {
    const { kind, name } = binding.roleRef;

    return (
      <div className="flex items-center">
        <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300 mr-2">
          {kind}
        </span>
        <span className="hover:text-blue-500 hover:underline">
          {name}
        </span>
      </div>
    );
  };

  // Format subjects
  const formatSubjects = (binding: V1RoleBinding): JSX.Element => {
    const subjects = binding.subjects || [];

    if (subjects.length === 0) {
      return <span className="text-gray-500 dark:text-gray-400">No subjects</span>;
    }

    // Group subjects by kind
    const subjectsByKind: Record<string, Subject[]> = {};
    subjects.forEach(subject => {
      if (!subjectsByKind[subject.kind]) {
        subjectsByKind[subject.kind] = [];
      }
      subjectsByKind[subject.kind].push(subject);
    });

    return (
      <div className="space-y-2">
        {Object.entries(subjectsByKind).map(([kind, kindSubjects]) => (
          <div key={kind}>
            <div className="text-xs font-medium mb-1">{kind}s:</div>
            <div className="space-y-1">
              {kindSubjects.slice(0, 2).map((subject, index) => (
                <div key={index} className="flex items-center">
                  {subject.namespace && (
                    <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">
                      {subject.namespace}/
                    </span>
                  )}
                  <span className="text-xs">
                    {subject.name}
                  </span>
                </div>
              ))}
              {kindSubjects.length > 2 && (
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  +{kindSubjects.length - 2} more {kind.toLowerCase()}s
                </div>
              )}
            </div>
          </div>
        ))}
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

  // Format Subject Counts by Type
  const formatSubjectCounts = (binding: V1RoleBinding): JSX.Element => {
    const subjects = binding.subjects || [];

    if (subjects.length === 0) {
      return <span className="text-gray-500 dark:text-gray-400">None</span>;
    }

    // Count subjects by kind
    const countByKind: Record<string, number> = {};
    subjects.forEach(subject => {
      countByKind[subject.kind] = (countByKind[subject.kind] || 0) + 1;
    });

    return (
      <div className="flex flex-wrap gap-1">
        {Object.entries(countByKind).map(([kind, count]) => (
          <span
            key={kind}
            className="px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300"
          >
            {count} {kind}{count > 1 ? 's' : ''}
          </span>
        ))}
      </div>
    );
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
          <h1 className='text-5xl font-[Anton] uppercase font-bold text-gray-800/30 dark:text-gray-700/50'>Role Bindings</h1>
          <div className="w-full md:w-96 mt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
              <Input
                type="text"
                placeholder="Search by name, namespace, role, or subjects..."
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
      {sortedRoleBindings.length === 0 && (
        <Alert className="my-6">
          <AlertDescription>
            {searchQuery
              ? `No role bindings matching "${searchQuery}"`
              : selectedNamespaces.length === 0
                ? "Please select at least one namespace"
                : "No role bindings found in the selected namespaces"}
          </AlertDescription>
        </Alert>
      )}

      {/* RoleBindings table */}
      {sortedRoleBindings.length > 0 && (
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
                    onClick={() => handleSort('role')}
                  >
                    Role {renderSortIndicator('role')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('subjects')}
                  >
                    Subjects {renderSortIndicator('subjects')}
                  </TableHead>
                  <TableHead>
                    Subject Detail
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
                {sortedRoleBindings.map((binding) => (
                  <TableRow
                    key={`${binding.metadata?.namespace}-${binding.metadata?.name}`}
                    className={`bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30 ${binding.metadata?.namespace && binding.metadata?.name &&
                        selectedRoleBindings.has(`${binding.metadata.namespace}/${binding.metadata.name}`)
                        ? 'bg-blue-50 dark:bg-gray-800/30'
                        : ''
                      }`}
                    onClick={(e) => handleRoleBindingClick(e, binding)}
                    onContextMenu={(e) => handleContextMenu(e, binding)}
                  >
                    <TableCell className="font-medium" onClick={() => handleRoleBindingDetails(binding)}>
                      <div className="hover:text-blue-500 hover:underline">
                        {binding.metadata?.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="hover:text-blue-500 hover:underline" onClick={() => navigate(`/dashboard/explore/namespaces`)}>
                        {binding.metadata?.namespace}
                      </div>
                    </TableCell>
                    <TableCell>
                      {formatRoleRef(binding)}
                    </TableCell>
                    <TableCell>
                      {formatSubjectCounts(binding)}
                    </TableCell>
                    <TableCell>
                      {formatSubjects(binding)}
                    </TableCell>
                    <TableCell className="text-center">
                      {calculateAge(binding.metadata?.creationTimestamp?.toString())}
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

export default RoleBindings;