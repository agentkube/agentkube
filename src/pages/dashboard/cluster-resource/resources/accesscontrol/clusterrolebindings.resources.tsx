import React, { useState, useEffect, useMemo } from 'react';
import { listResources } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, MoreVertical, Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from 'react-router-dom';
import { calculateAge } from '@/utils/age';
import { useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Trash, Eye } from "lucide-react";
import { Trash2, ExternalLink, Copy, UserPlus, Sparkles } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { deleteResource } from '@/api/internal/resources';
import { OPERATOR_URL } from '@/config';
import { useDrawer } from '@/contexts/useDrawer';
import { resourceToEnrichedSearchResult } from '@/utils/resource-to-enriched.utils';
import { toast } from '@/hooks/use-toast';
import { useReconMode } from '@/contexts/useRecon';
// Define types for Subject and ClusterRoleBinding
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

interface V1ClusterRoleBinding {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
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
type SortField = 'name' | 'role' | 'subjects' | 'age' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

const ClusterRoleBindings: React.FC = () => {
  const navigate = useNavigate();
  const { currentContext } = useCluster();
  const [clusterRoleBindings, setClusterRoleBindings] = useState<V1ClusterRoleBinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const { isReconMode } = useReconMode();
  // --- Start of Multi-select ---
  const [selectedBindings, setSelectedBindings] = useState<Set<string>>(new Set());
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [activeBinding, setActiveBinding] = useState<V1ClusterRoleBinding | null>(null);
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

  // Add click handler for ClusterRoleBinding selection with cmd/ctrl key
  const handleBindingClick = (e: React.MouseEvent, binding: V1ClusterRoleBinding) => {
    if (!binding.metadata?.name) return;

    const bindingKey = binding.metadata.name;

    if (e.metaKey || e.ctrlKey) {
      // Prevent navigation when using multi-select
      e.preventDefault();
      e.stopPropagation();

      setSelectedBindings(prev => {
        const newSelection = new Set(prev);
        if (newSelection.has(bindingKey)) {
          newSelection.delete(bindingKey);
        } else {
          newSelection.add(bindingKey);
        }
        return newSelection;
      });
    } else if (!selectedBindings.has(bindingKey)) {
      // Clear selection on regular click (unless clicking on already selected binding)
      setSelectedBindings(new Set());
      handleClusterRoleBindingDetails(binding);
    } else {
      handleClusterRoleBindingDetails(binding);
    }
  };

  // Add context menu handlers
  const handleContextMenu = (e: React.MouseEvent, binding: V1ClusterRoleBinding) => {
    if (!binding.metadata?.name) return;

    e.preventDefault();
    e.stopPropagation();

    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setActiveBinding(binding);
    setShowContextMenu(true);

    // Multi-select support: if binding isn't in selection, make it the only selection
    const bindingKey = binding.metadata.name;
    if (!selectedBindings.has(bindingKey)) {
      setSelectedBindings(new Set([bindingKey]));
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

        if (isOutsideTable && !isContextMenuClick && !isAlertDialogClick && selectedBindings.size > 0) {
          setSelectedBindings(new Set());
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedBindings]);

  // Handle view cluster role binding details
  const handleViewBinding = () => {
    setShowContextMenu(false);
    if (activeBinding) {
      handleClusterRoleBindingDetails(activeBinding);
    }
  };

  // Handle add subject
  const handleAddSubject = () => {
    setShowContextMenu(false);

    if (!activeBinding || !activeBinding.metadata?.name) {
      return;
    }

    // Navigate to add subject page
    navigate(`/dashboard/explore/clusterrolebindings/${activeBinding.metadata.name}/add-subject`);
  };

  // Handle clone cluster role binding
  const handleCloneBinding = async () => {
    setShowContextMenu(false);

    try {
      if (!activeBinding || !activeBinding.metadata?.name) {
        return;
      }

      // Ask for the new cluster role binding name
      const newName = prompt("Enter name for the cloned ClusterRoleBinding:", `${activeBinding.metadata.name}-clone`);
      if (!newName) return; // User cancelled

      // Create a new ClusterRoleBinding based on the existing one
      const newBinding = {
        apiVersion: 'rbac.authorization.k8s.io/v1',
        kind: 'ClusterRoleBinding',
        metadata: {
          name: newName,
          // Copy labels but add a cloned-from label
          labels: {
            ...(activeBinding.metadata.labels || {}),
            clonedFrom: activeBinding.metadata.name
          }
        },
        // Copy roleRef and subjects
        roleRef: activeBinding.roleRef,
        subjects: activeBinding.subjects
      };

      if (!currentContext) return;

      // Create the new ClusterRoleBinding
      await fetch(`${OPERATOR_URL}/clusters/${currentContext.name}/apis/rbac.authorization.k8s.io/v1/clusterrolebindings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newBinding),
      });

      // Refresh cluster role bindings list
      if (currentContext) {
        const refreshedBindings = await listResources(currentContext.name, 'clusterrolebindings', {
          apiGroup: 'rbac.authorization.k8s.io',
          apiVersion: 'v1'
        });
        setClusterRoleBindings(refreshedBindings);
      }

    } catch (error) {
      console.error('Failed to clone ClusterRoleBinding:', error);
      setError(error instanceof Error ? error.message : 'Failed to clone ClusterRoleBinding');
    }
  };

  const handleAskAI = (binding: V1ClusterRoleBinding) => {
    try {
      // Convert binding to EnrichedSearchResult format
      const resourceContext = resourceToEnrichedSearchResult(
        binding,
        'clusterrolebindings',
        false, // cluster-scoped
        'rbac.authorization.k8s.io',
        'v1'
      );
      
      // Add to chat context
      addResourceContext(resourceContext);
      
      // Show success toast
      toast({
        title: "Added to Chat",
        description: `ClusterRoleBinding "${binding.metadata?.name}" has been added to chat context`
      });
    } catch (error) {
      console.error('Error adding cluster role binding to chat:', error);
      toast({
        title: "Error",
        description: "Failed to add cluster role binding to chat context",
        variant: "destructive"
      });
    }
  };

  // Helper function for dropdown menu actions
  const handleViewBindingMenuItem = (e: React.MouseEvent, binding: V1ClusterRoleBinding) => {
    e.stopPropagation();
    if (binding.metadata?.name) {
      navigate(`/dashboard/explore/clusterrolebindings/${binding.metadata.name}`);
    }
  };

  const handleDeleteBindingMenuItem = (e: React.MouseEvent, binding: V1ClusterRoleBinding) => {
    e.stopPropagation();
    if (isReconMode) {
      toast({
        title: "Recon Mode",
        description: "This action can't be performed while recon mode is on. Disable recon mode to proceed.",
        variant: "recon"
      });
      return;
    }

    setActiveBinding(binding);
    setSelectedBindings(new Set([binding.metadata?.name || '']));
    setShowDeleteDialog(true);
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
  const deleteBindings = async () => {
    setShowDeleteDialog(false);

    try {
      if (selectedBindings.size === 0 && activeBinding) {
        // Delete single active ClusterRoleBinding
        await deleteBinding(activeBinding);
      } else {
        // Delete all selected ClusterRoleBindings
        for (const bindingName of selectedBindings) {
          const bindingToDelete = clusterRoleBindings.find(b =>
            b.metadata?.name === bindingName
          );

          if (bindingToDelete) {
            await deleteBinding(bindingToDelete);
          }
        }
      }

      // Clear selection after deletion
      setSelectedBindings(new Set());

      // Refresh ClusterRoleBindings list after deletion
      if (currentContext) {
        const refreshedBindings = await listResources(currentContext.name, 'clusterrolebindings', {
          apiGroup: 'rbac.authorization.k8s.io',
          apiVersion: 'v1'
        });
        setClusterRoleBindings(refreshedBindings);
      }

    } catch (error) {
      console.error('Failed to delete ClusterRoleBinding(s):', error);
      setError(error instanceof Error ? error.message : 'Failed to delete ClusterRoleBinding(s)');
    }
  };

  // Delete ClusterRoleBinding function
  const deleteBinding = async (binding: V1ClusterRoleBinding) => {
    if (!currentContext || !binding.metadata?.name) return;

    await deleteResource(
      currentContext.name,
      'clusterrolebindings',
      binding.metadata.name,
      {
        apiGroup: 'rbac.authorization.k8s.io',
        apiVersion: 'v1'
      }
    );
  };

  // Check if binding is a system binding (starts with system:)
  const isSystemBinding = (binding: V1ClusterRoleBinding): boolean => {
    return (binding.metadata?.name || '').startsWith('system:');
  };

  // Check if binding has ServiceAccount subjects
  const hasServiceAccountSubjects = (binding: V1ClusterRoleBinding): boolean => {
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

    // Single selection options only available for single binding
    const isSingleSelection = selectedBindings.size <= 1;

    // Special warning if it's a system binding
    const isSystemClusterRoleBinding = activeBinding ? isSystemBinding(activeBinding) : false;

    return createPortal(
      <div
        ref={contextMenuRef}
        className="fixed z-50 min-w-[220px] bg-white dark:bg-[#0B0D13] backdrop-blur-sm rounded-md shadow-lg border border-gray-300 dark:border-gray-800/60 py-1 text-sm"
        style={{
          left: `${contextMenuPosition.x}px`,
          top: shouldShowAbove
            ? `${contextMenuPosition.y - menuHeight}px`
            : `${contextMenuPosition.y}px`,
        }}
      >
        <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 font-medium border-b border-gray-200 dark:border-gray-800/60">
          {selectedBindings.size > 1
            ? `${selectedBindings.size} ClusterRoleBindings selected`
            : activeBinding?.metadata?.name || 'ClusterRoleBinding actions'}
        </div>

        {isSingleSelection && (
          <>
            <div
              className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center"
              onClick={handleViewBinding}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View Details
            </div>

            <div
              className={`px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center ${isSystemClusterRoleBinding ? 'text-gray-400 dark:text-gray-600 pointer-events-none' : ''
                }`}
              onClick={!isSystemClusterRoleBinding ? handleAddSubject : undefined}
              title={isSystemClusterRoleBinding ? "System ClusterRoleBindings should not be modified" : ""}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Add Subject
            </div>
          </>
        )}

        <div
          className={`px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center text-red-600 dark:text-red-400 ${isSystemClusterRoleBinding ? 'text-gray-400 dark:text-gray-600 pointer-events-none' : ''
            }`}
          onClick={!isSystemClusterRoleBinding ? handleDeleteClick : undefined}
          title={isSystemClusterRoleBinding ? "System ClusterRoleBindings cannot be deleted" : ""}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete {selectedBindings.size > 1 ? `(${selectedBindings.size})` : ''}
        </div>

        {isSystemClusterRoleBinding && (
          <div className="px-3 py-2 text-xs text-amber-500 dark:text-amber-400 border-t border-gray-200 dark:border-gray-800/60 mt-1">
            System ClusterRoleBindings are managed by Kubernetes
          </div>
        )}
      </div>,
      document.body
    );
  };

  // Delete confirmation dialog
  const renderDeleteDialog = () => {
    // Check if any of the selected bindings have ServiceAccount subjects
    const hasSASubjects = (): boolean => {
      if (selectedBindings.size === 0 && activeBinding) {
        return hasServiceAccountSubjects(activeBinding);
      }

      return Array.from(selectedBindings).some(bindingName => {
        const binding = clusterRoleBindings.find(b => b.metadata?.name === bindingName);
        return binding ? hasServiceAccountSubjects(binding) : false;
      });
    };

    return (
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-gray-100 dark:bg-[#0B0D13]">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm ClusterRoleBinding Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedBindings.size > 1
                ? `${selectedBindings.size} cluster role bindings`
                : `"${activeBinding?.metadata?.name}"`}?
              This action cannot be undone.

              <div className="mt-2 text-amber-600 dark:text-amber-400">
                Warning: Deleting cluster role bindings will remove access permissions for the associated subjects across all namespaces.
                {hasSASubjects() && (
                  <div className="mt-1 font-medium">
                    One or more selected bindings grant permissions to ServiceAccounts, which may affect workloads cluster-wide.
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
              onClick={deleteBindings}
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

  // Fetch cluster role bindings (these are cluster-scoped resources)
  useEffect(() => {
    const fetchClusterRoleBindings = async () => {
      if (!currentContext) {
        setClusterRoleBindings([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Fetch cluster role bindings
        const clusterRoleBindingsData = await listResources(currentContext.name, 'clusterrolebindings', {
          apiGroup: 'rbac.authorization.k8s.io',
          apiVersion: 'v1'
        });

        setClusterRoleBindings(clusterRoleBindingsData);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch cluster role bindings:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch cluster role bindings');
      } finally {
        setLoading(false);
      }
    };

    fetchClusterRoleBindings();
  }, [currentContext]);

  // Filter cluster role bindings based on search query
  const filteredClusterRoleBindings = useMemo(() => {
    if (!searchQuery.trim()) {
      return clusterRoleBindings;
    }

    const lowercaseQuery = searchQuery.toLowerCase();

    return clusterRoleBindings.filter(binding => {
      const name = binding.metadata?.name?.toLowerCase() || '';
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

      // Check if name or role reference contains the query
      if (
        name.includes(lowercaseQuery) ||
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
  }, [clusterRoleBindings, searchQuery]);

  // Sort cluster role bindings based on sort state
  const sortedClusterRoleBindings = useMemo(() => {
    if (!sort.field || !sort.direction) {
      return filteredClusterRoleBindings;
    }

    return [...filteredClusterRoleBindings].sort((a, b) => {
      const sortMultiplier = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'name':
          return (a.metadata?.name || '').localeCompare(b.metadata?.name || '') * sortMultiplier;

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
  }, [filteredClusterRoleBindings, sort.field, sort.direction]);

  const handleClusterRoleBindingDetails = (binding: V1ClusterRoleBinding) => {
    if (binding.metadata?.name) {
      navigate(`/dashboard/explore/clusterrolebindings/${binding.metadata.name}`);
    }
  };

  // Format role reference
  const formatRoleRef = (binding: V1ClusterRoleBinding): JSX.Element => {
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
  const formatSubjects = (binding: V1ClusterRoleBinding): JSX.Element => {
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
                    <span className="text-xs text-gray-500 dark:text-gray-400">
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
  const formatSubjectCounts = (binding: V1ClusterRoleBinding): JSX.Element => {
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
            className="px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 dark:bg-transparent border border-gray-500/40 dark:border-gray-700/40 dark:text-gray-300"
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
          
          [&::-webkit-scrollbar]:w-1.5 
          [&::-webkit-scrollbar-track]:bg-transparent 
          [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">
      <div>
        <h1 className='text-5xl font-[Anton] uppercase font-bold text-gray-800/30 dark:text-gray-700/50'>Cluster Role Bindings</h1>
        <div className="w-full md:w-96 mt-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
            <Input
              type="text"
              placeholder="Search by name, role, or subjects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
      </div>

      {/* No results message */}
      {sortedClusterRoleBindings.length === 0 && (
        <Alert className="my-6">
          <AlertDescription>
            {searchQuery
              ? `No cluster role bindings matching "${searchQuery}"`
              : "No cluster role bindings found in the cluster."}
          </AlertDescription>
        </Alert>
      )}

      {/* ClusterRoleBindings table */}
      {sortedClusterRoleBindings.length > 0 && (
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
                {sortedClusterRoleBindings.map((binding) => (
                  <TableRow
                    key={binding.metadata?.uid || binding.metadata?.name}
                    className={`bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30 ${binding.metadata?.name &&
                      selectedBindings.has(binding.metadata.name)
                      ? 'bg-blue-50 dark:bg-gray-800/30'
                      : ''
                      }`}
                    onClick={(e) => handleBindingClick(e, binding)}
                    onContextMenu={(e) => handleContextMenu(e, binding)}
                  >
                    <TableCell className="font-medium" onClick={() => handleClusterRoleBindingDetails(binding)}>
                      <div className="hover:text-blue-500 hover:underline">
                        {binding.metadata?.name}
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
                            handleAskAI(binding);
                          }} className='hover:text-gray-700 dark:hover:text-gray-500'>
                            <Sparkles className="mr-2 h-4 w-4" />
                            Ask AI
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => handleViewBindingMenuItem(e, binding)} className='hover:text-gray-700 dark:hover:text-gray-500'>
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className={`text-red-500 dark:text-red-400 focus:text-red-500 dark:focus:text-red-400 hover:text-red-700 dark:hover:text-red-500 ${isSystemBinding(binding) ? 'opacity-50 pointer-events-none' : ''}`}
                            onClick={(e) => !isSystemBinding(binding) ? handleDeleteBindingMenuItem(e, binding) : undefined}
                            disabled={isSystemBinding(binding)}
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

export default ClusterRoleBindings;