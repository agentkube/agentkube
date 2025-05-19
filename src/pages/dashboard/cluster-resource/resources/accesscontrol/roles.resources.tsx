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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Eye, Trash } from "lucide-react";
import { Trash2, ExternalLink, Copy, UserPlus } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { deleteResource } from '@/api/internal/resources';
import { OPERATOR_URL } from '@/config';

// Define types for PolicyRule and Role
interface PolicyRule {
  apiGroups: string[];
  resources: string[];
  verbs: string[];
  resourceNames?: string[];
  nonResourceURLs?: string[];
}

interface V1Role {
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
  rules?: PolicyRule[];
}

// Define sorting types
type SortDirection = 'asc' | 'desc' | null;
type SortField = 'name' | 'namespace' | 'rulesCount' | 'age' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

const Roles: React.FC = () => {
  const navigate = useNavigate();
  const { currentContext } = useCluster();
  const { selectedNamespaces } = useNamespace();
  const [roles, setRoles] = useState<V1Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // --- Start of Multi-select ---
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set());
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [activeRole, setActiveRole] = useState<V1Role | null>(null);
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

  // Add click handler for Role selection with cmd/ctrl key
  const handleRoleClick = (e: React.MouseEvent, role: V1Role) => {
    if (!role.metadata?.namespace || !role.metadata?.name) return;

    const roleKey = `${role.metadata.namespace}/${role.metadata.name}`;

    if (e.metaKey || e.ctrlKey) {
      // Prevent navigation when using multi-select
      e.preventDefault();
      e.stopPropagation();

      setSelectedRoles(prev => {
        const newSelection = new Set(prev);
        if (newSelection.has(roleKey)) {
          newSelection.delete(roleKey);
        } else {
          newSelection.add(roleKey);
        }
        return newSelection;
      });
    } else if (!selectedRoles.has(roleKey)) {
      // Clear selection on regular click (unless clicking on already selected role)
      setSelectedRoles(new Set());
      handleRoleDetails(role);
    } else {
      handleRoleDetails(role);
    }
  };

  // Add context menu handlers
  const handleContextMenu = (e: React.MouseEvent, role: V1Role) => {
    if (!role.metadata?.namespace || !role.metadata?.name) return;

    e.preventDefault();
    e.stopPropagation();

    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setActiveRole(role);
    setShowContextMenu(true);

    // Multi-select support: if role isn't in selection, make it the only selection
    const roleKey = `${role.metadata.namespace}/${role.metadata.name}`;
    if (!selectedRoles.has(roleKey)) {
      setSelectedRoles(new Set([roleKey]));
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

        if (isOutsideTable && !isContextMenuClick && !isAlertDialogClick && selectedRoles.size > 0) {
          setSelectedRoles(new Set());
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedRoles]);

  // Handle view role details
  const handleViewRole = () => {
    setShowContextMenu(false);
    if (activeRole) {
      handleRoleDetails(activeRole);
    }
  };

  // Handle create role binding
  const handleCreateRoleBinding = () => {
    setShowContextMenu(false);

    if (!activeRole || !activeRole.metadata?.name || !activeRole.metadata?.namespace) {
      return;
    }

    // Navigate to create role binding page
    navigate(`/dashboard/explore/roles/${activeRole.metadata.namespace}/${activeRole.metadata.name}/create-binding`);
  };

  // Handle clone role
  const handleCloneRole = async () => {
    setShowContextMenu(false);

    try {
      if (!activeRole || !activeRole.metadata?.name || !activeRole.metadata?.namespace) {
        return;
      }

      // Ask for the new role name
      const newName = prompt("Enter name for the cloned Role:", `${activeRole.metadata.name}-clone`);
      if (!newName) return; // User cancelled

      // Create a new Role based on the existing one
      const newRole = {
        apiVersion: 'rbac.authorization.k8s.io/v1',
        kind: 'Role',
        metadata: {
          name: newName,
          namespace: activeRole.metadata.namespace,
          // Copy labels but add a cloned-from label
          labels: {
            ...(activeRole.metadata.labels || {}),
            clonedFrom: activeRole.metadata.name
          }
        },
        // Copy all rules
        rules: activeRole.rules
      };

      if (!currentContext) return;
      // Create the new Role
      await fetch(`${OPERATOR_URL}/clusters/${currentContext.name}/apis/rbac.authorization.k8s.io/v1/namespaces/${activeRole.metadata.namespace}/roles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newRole),
      });

      // Refresh roles list
      if (currentContext && selectedNamespaces.length > 0) {
        const rolePromises = selectedNamespaces.map(namespace =>
          listResources(currentContext.name, 'roles', {
            namespace,
            apiGroup: 'rbac.authorization.k8s.io',
            apiVersion: 'v1'
          })
        );

        const results = await Promise.all(rolePromises);
        setRoles(results.flat());
      }

    } catch (error) {
      console.error('Failed to clone Role:', error);
      setError(error instanceof Error ? error.message : 'Failed to clone Role');
    }
  };

  const handleViewRoleMenuItem = (e: React.MouseEvent, role: V1Role) => {
    e.stopPropagation();
    if (role.metadata?.name && role.metadata?.namespace) {
      navigate(`/dashboard/explore/roles/${role.metadata.namespace}/${role.metadata.name}`);
    }
  };

  const handleDeleteRoleMenuItem = (e: React.MouseEvent, role: V1Role) => {
    e.stopPropagation();
    setActiveRole(role);
    setSelectedRoles(new Set([`${role.metadata?.namespace}/${role.metadata?.name}`]));
    setShowDeleteDialog(true);
  };


  // Handle delete action
  const handleDeleteClick = () => {
    setShowContextMenu(false);
    setShowDeleteDialog(true);
  };

  // Perform actual deletion
  const deleteRoles = async () => {
    setShowDeleteDialog(false);

    try {
      if (selectedRoles.size === 0 && activeRole) {
        // Delete single active Role
        await deleteRole(activeRole);
      } else {
        // Delete all selected Roles
        for (const roleKey of selectedRoles) {
          const [namespace, name] = roleKey.split('/');
          const roleToDelete = roles.find(r =>
            r.metadata?.namespace === namespace && r.metadata?.name === name
          );

          if (roleToDelete) {
            await deleteRole(roleToDelete);
          }
        }
      }

      // Clear selection after deletion
      setSelectedRoles(new Set());

      // Refresh Roles list after deletion
      if (currentContext && selectedNamespaces.length > 0) {
        const rolePromises = selectedNamespaces.map(namespace =>
          listResources(currentContext.name, 'roles', {
            namespace,
            apiGroup: 'rbac.authorization.k8s.io',
            apiVersion: 'v1'
          })
        );

        const results = await Promise.all(rolePromises);
        setRoles(results.flat());
      }

    } catch (error) {
      console.error('Failed to delete Role(s):', error);
      setError(error instanceof Error ? error.message : 'Failed to delete Role(s)');
    }
  };

  // Delete Role function
  const deleteRole = async (role: V1Role) => {
    if (!currentContext || !role.metadata?.name || !role.metadata?.namespace) return;

    await deleteResource(
      currentContext.name,
      'roles',
      role.metadata.name,
      {
        namespace: role.metadata.namespace,
        apiGroup: 'rbac.authorization.k8s.io',
        apiVersion: 'v1'
      }
    );
  };

  // Check if role has high privileges (wildcard permissions)
  const hasHighPrivileges = (role: V1Role): boolean => {
    return (role.rules || []).some(rule =>
      rule.apiGroups.includes('*') ||
      rule.resources.includes('*') ||
      rule.verbs.includes('*')
    );
  };

  // Render the context menu
  const renderContextMenu = () => {
    if (!showContextMenu || !contextMenuPosition) return null;

    // Calculate if we need to show the menu above or below the click position
    const windowHeight = window.innerHeight;
    const menuHeight = 180; // Approximate context menu height
    const shouldShowAbove = windowHeight - contextMenuPosition.y < menuHeight;

    // Single selection options only available for single role
    const isSingleSelection = selectedRoles.size <= 1;

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
          {selectedRoles.size > 1
            ? `${selectedRoles.size} Roles selected`
            : activeRole?.metadata?.name || 'Role actions'}
        </div>

        {isSingleSelection && (
          <>
            <div
              className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center"
              onClick={handleViewRole}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View Details
            </div>

            <div
              className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center"
              onClick={handleCreateRoleBinding}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Create RoleBinding
            </div>

          </>
        )}

        <div
          className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center text-red-600 dark:text-red-400"
          onClick={handleDeleteClick}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete {selectedRoles.size > 1 ? `(${selectedRoles.size})` : ''}
        </div>
      </div>,
      document.body
    );
  };

  // Delete confirmation dialog
  const renderDeleteDialog = () => {
    // Check if any of the selected roles have high privileges
    const hasHighPrivilegedRoles = (): boolean => {
      if (selectedRoles.size === 0 && activeRole) {
        return hasHighPrivileges(activeRole);
      }

      return Array.from(selectedRoles).some(roleKey => {
        const [namespace, name] = roleKey.split('/');
        const role = roles.find(r => r.metadata?.namespace === namespace && r.metadata?.name === name);
        return role ? hasHighPrivileges(role) : false;
      });
    };

    return (
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-gray-100 dark:bg-[#0B0D13]">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Role Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedRoles.size > 1
                ? `${selectedRoles.size} roles`
                : `"${activeRole?.metadata?.name}"`}?
              This action cannot be undone.

              <div className="mt-2 text-amber-600 dark:text-amber-400">
                Warning: Deleting roles will affect access control for users and service accounts.
                {hasHighPrivilegedRoles() && (
                  <div className="mt-1 font-medium">
                    One or more selected roles have high-privilege permissions (wildcards).
                  </div>
                )}
                <div className="mt-1">
                  Note: RoleBindings that reference these roles will not be deleted but will become invalid.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteRoles}
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

  // Fetch roles for all selected namespaces
  useEffect(() => {
    const fetchAllRoles = async () => {
      if (!currentContext || selectedNamespaces.length === 0) {
        setRoles([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // If no namespaces are selected, fetch from all namespaces
        let allRoles: V1Role[] = [];

        if (selectedNamespaces.length === 0) {
          try {
            const rolesData = await listResources(currentContext.name, 'roles', {
              apiGroup: 'rbac.authorization.k8s.io',
              apiVersion: 'v1'
            });
            allRoles = rolesData;
          } catch (err) {
            console.error('Failed to fetch roles:', err);
            setError('Failed to fetch roles');
            allRoles = [];
          }
        } else {
          // Fetch roles for each selected namespace
          const rolePromises = selectedNamespaces.map(async (namespace) => {
            try {
              return await listResources(currentContext.name, 'roles', {
                namespace,
                apiGroup: 'rbac.authorization.k8s.io',
                apiVersion: 'v1'
              });
            } catch (err) {
              console.warn(`Failed to fetch roles for namespace ${namespace}:`, err);
              return [];
            }
          });

          const results = await Promise.all(rolePromises);
          allRoles = results.flat();
        }

        setRoles(allRoles);
        if (allRoles.length > 0) {
          setError(null);
        }
      } catch (err) {
        console.error('Failed to fetch roles:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch roles');
      } finally {
        setLoading(false);
      }
    };

    fetchAllRoles();
  }, [currentContext, selectedNamespaces]);

  // Filter roles based on search query
  const filteredRoles = useMemo(() => {
    if (!searchQuery.trim()) {
      return roles;
    }

    const lowercaseQuery = searchQuery.toLowerCase();

    return roles.filter(role => {
      const name = role.metadata?.name?.toLowerCase() || '';
      const namespace = role.metadata?.namespace?.toLowerCase() || '';
      const labels = role.metadata?.labels || {};
      const annotations = role.metadata?.annotations || {};

      // Check if any rule matches the query
      const ruleMatches = (role.rules || []).some(rule => {
        // Check API groups
        const apiGroupMatches = rule.apiGroups.some(group =>
          group.toLowerCase().includes(lowercaseQuery)
        );

        // Check resources
        const resourceMatches = rule.resources.some(resource =>
          resource.toLowerCase().includes(lowercaseQuery)
        );

        // Check verbs
        const verbMatches = rule.verbs.some(verb =>
          verb.toLowerCase().includes(lowercaseQuery)
        );

        // Check resource names if present
        const resourceNameMatches = (rule.resourceNames || []).some(resourceName =>
          resourceName.toLowerCase().includes(lowercaseQuery)
        );

        // Check non-resource URLs if present
        const nonResourceUrlMatches = (rule.nonResourceURLs || []).some(url =>
          url.toLowerCase().includes(lowercaseQuery)
        );

        return apiGroupMatches || resourceMatches || verbMatches || resourceNameMatches || nonResourceUrlMatches;
      });

      // Check if name or namespace contains the query
      if (name.includes(lowercaseQuery) || namespace.includes(lowercaseQuery) || ruleMatches) {
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
  }, [roles, searchQuery]);

  // Sort roles based on sort state
  const sortedRoles = useMemo(() => {
    if (!sort.field || !sort.direction) {
      return filteredRoles;
    }

    return [...filteredRoles].sort((a, b) => {
      const sortMultiplier = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'name':
          return (a.metadata?.name || '').localeCompare(b.metadata?.name || '') * sortMultiplier;

        case 'namespace':
          return (a.metadata?.namespace || '').localeCompare(b.metadata?.namespace || '') * sortMultiplier;

        case 'rulesCount': {
          const rulesCountA = a.rules?.length || 0;
          const rulesCountB = b.rules?.length || 0;
          return (rulesCountA - rulesCountB) * sortMultiplier;
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
  }, [filteredRoles, sort.field, sort.direction]);

  const handleRoleDetails = (role: V1Role) => {
    if (role.metadata?.name && role.metadata?.namespace) {
      navigate(`/dashboard/explore/roles/${role.metadata.namespace}/${role.metadata.name}`);
    }
  };

  // Format API groups and resources
  const formatApisAndResources = (role: V1Role): JSX.Element => {
    if (!role.rules || role.rules.length === 0) {
      return <span className="text-gray-500 dark:text-gray-400">No rules</span>;
    }

    // Get all unique API groups and resources
    const apiGroups = new Set<string>();
    const resources = new Set<string>();

    role.rules.forEach(rule => {
      rule.apiGroups.forEach(group => apiGroups.add(group));
      rule.resources.forEach(resource => resources.add(resource));
    });

    const apiGroupsArray = Array.from(apiGroups).filter(group => group !== "*");
    const hasWildcardAPI = apiGroups.has("*");
    const resourcesArray = Array.from(resources).filter(resource => resource !== "*");
    const hasWildcardResource = resources.has("*");

    return (
      <div className="space-y-2">
        <div>
          <div className="text-xs font-medium mb-1">API Groups:</div>
          <div className="flex flex-wrap gap-1">
            {hasWildcardAPI && (
              <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300">
                All (*)
              </span>
            )}
            {apiGroupsArray.slice(0, 2).map((group, i) => (
              <span key={i} className="px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
                {group === "" ? "core" : group}
              </span>
            ))}
            {apiGroupsArray.length > 2 && (
              <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300">
                +{apiGroupsArray.length - 2} more
              </span>
            )}
          </div>
        </div>

        <div>
          <div className="text-xs font-medium mb-1">Resources:</div>
          <div className="flex flex-wrap gap-1">
            {hasWildcardResource && (
              <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300">
                All (*)
              </span>
            )}
            {resourcesArray.slice(0, 2).map((resource, i) => (
              <span key={i} className="px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300">
                {resource}
              </span>
            ))}
            {resourcesArray.length > 2 && (
              <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300">
                +{resourcesArray.length - 2} more
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Format verbs (permissions)
  const formatVerbs = (role: V1Role): JSX.Element => {
    if (!role.rules || role.rules.length === 0) {
      return <span className="text-gray-500 dark:text-gray-400">None</span>;
    }

    // Get all unique verbs
    const verbs = new Set<string>();

    role.rules.forEach(rule => {
      rule.verbs.forEach(verb => verbs.add(verb));
    });

    const verbsArray = Array.from(verbs).filter(verb => verb !== "*");
    const hasWildcardVerb = verbs.has("*");

    return (
      <div>
        <div className="flex flex-wrap gap-1">
          {hasWildcardVerb && (
            <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300">
              All (*)
            </span>
          )}
          {verbsArray.slice(0, 4).map((verb, i) => (
            <span key={i} className="px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300">
              {verb}
            </span>
          ))}
          {verbsArray.length > 4 && (
            <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300">
              +{verbsArray.length - 4} more
            </span>
          )}
        </div>
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
      <div className='flex items-center justify-between md:flex-row gap-4 md:items-end'>
        <div>
          <h1 className='text-5xl font-[Anton] uppercase font-bold text-gray-800/30 dark:text-gray-700/50'>Roles</h1>
          <div className="w-full md:w-96 mt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
              <Input
                type="text"
                placeholder="Search by name, namespace, API groups, resources, or verbs..."
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
      {sortedRoles.length === 0 && (
        <Alert className="my-6">
          <AlertDescription>
            {searchQuery
              ? `No roles matching "${searchQuery}"`
              : selectedNamespaces.length === 0
                ? "Please select at least one namespace"
                : "No roles found in the selected namespaces"}
          </AlertDescription>
        </Alert>
      )}

      {/* Roles table */}
      {sortedRoles.length > 0 && (
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
                    onClick={() => handleSort('rulesCount')}
                  >
                    Rules {renderSortIndicator('rulesCount')}
                  </TableHead>
                  <TableHead>
                    API Groups / Resources
                  </TableHead>
                  <TableHead>
                    Permissions
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
                {sortedRoles.map((role) => (
                  <TableRow
                    key={`${role.metadata?.namespace}-${role.metadata?.name}`}
                    className={`bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30 ${role.metadata?.namespace && role.metadata?.name &&
                      selectedRoles.has(`${role.metadata.namespace}/${role.metadata.name}`)
                      ? 'bg-blue-50 dark:bg-gray-800/30'
                      : ''
                      }`}
                    onClick={(e) => handleRoleClick(e, role)}
                    onContextMenu={(e) => handleContextMenu(e, role)}
                  >
                    <TableCell className="font-medium" onClick={() => handleRoleDetails(role)}>
                      <div className="hover:text-blue-500 hover:underline">
                        {role.metadata?.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="hover:text-blue-500 hover:underline" onClick={() => navigate(`/dashboard/explore/namespaces`)}>
                        {role.metadata?.namespace}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {role.rules?.length || 0}
                    </TableCell>
                    <TableCell>
                      {formatApisAndResources(role)}
                    </TableCell>
                    <TableCell>
                      {formatVerbs(role)}
                    </TableCell>
                    <TableCell className="text-center">
                      {calculateAge(role.metadata?.creationTimestamp?.toString())}
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
                          <DropdownMenuItem onClick={(e) => handleViewRoleMenuItem(e, role)} className='hover:text-gray-700 dark:hover:text-gray-500'>
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-500 dark:text-red-400 focus:text-red-500 dark:focus:text-red-400 hover:text-red-700 dark:hover:text-red-500"
                            onClick={(e) => handleDeleteRoleMenuItem(e, role)}
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

export default Roles;