import React, { useState, useEffect, useMemo } from 'react';
import { listResources } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, MoreVertical, Search, ArrowUpDown, ArrowUp, ArrowDown, Eye, Trash2, Sparkles } from "lucide-react";
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
import { Trash } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { deleteResource } from '@/api/internal/resources';
import { OPERATOR_URL } from '@/config';
import { useDrawer } from '@/contexts/useDrawer';
import { resourceToEnrichedSearchResult } from '@/utils/resource-to-enriched.utils';
import { toast } from '@/hooks/use-toast';
import { useReconMode } from '@/contexts/useRecon';
// Define types for PolicyRule and ClusterRole
interface PolicyRule {
  apiGroups: string[];
  resources: string[];
  verbs: string[];
  resourceNames?: string[];
  nonResourceURLs?: string[];
}

interface V1ClusterRole {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    creationTimestamp?: string;
    labels?: { [key: string]: string };
    annotations?: { [key: string]: string };
    uid?: string;
  };
  rules?: PolicyRule[];
  aggregationRule?: {
    clusterRoleSelectors?: {
      matchLabels?: { [key: string]: string };
      matchExpressions?: Array<{
        key: string;
        operator: string;
        values: string[];
      }>;
    }[];
  };
}

// Define sorting types
type SortDirection = 'asc' | 'desc' | null;
type SortField = 'name' | 'rulesCount' | 'age' | 'type' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

const ClusterRoles: React.FC = () => {
  const navigate = useNavigate();
  const { currentContext } = useCluster();
  const [clusterRoles, setClusterRoles] = useState<V1ClusterRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const { isReconMode } = useReconMode();
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

  // --- Start of Multi-select ---
  const [selectedClusterRoles, setSelectedClusterRoles] = useState<Set<string>>(new Set());
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [activeClusterRole, setActiveClusterRole] = useState<V1ClusterRole | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const { addResourceContext } = useDrawer();

  // Add click handler for ClusterRole selection with cmd/ctrl key
  const handleClusterRoleClick = (e: React.MouseEvent, clusterRole: V1ClusterRole) => {
    if (!clusterRole.metadata?.name) return;

    const clusterRoleKey = clusterRole.metadata.name;

    if (e.metaKey || e.ctrlKey) {
      // Prevent navigation when using multi-select
      e.preventDefault();
      e.stopPropagation();

      setSelectedClusterRoles(prev => {
        const newSelection = new Set(prev);
        if (newSelection.has(clusterRoleKey)) {
          newSelection.delete(clusterRoleKey);
        } else {
          newSelection.add(clusterRoleKey);
        }
        return newSelection;
      });
    } else if (!selectedClusterRoles.has(clusterRoleKey)) {
      // Clear selection on regular click (unless clicking on already selected cluster role)
      setSelectedClusterRoles(new Set());
      handleClusterRoleDetails(clusterRole);
    } else {
      handleClusterRoleDetails(clusterRole);
    }
  };

  // Add context menu handlers
  const handleContextMenu = (e: React.MouseEvent, clusterRole: V1ClusterRole) => {
    if (!clusterRole.metadata?.name) return;

    e.preventDefault();
    e.stopPropagation();

    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setActiveClusterRole(clusterRole);
    setShowContextMenu(true);

    // Multi-select support: if cluster role isn't in selection, make it the only selection
    const clusterRoleKey = clusterRole.metadata.name;
    if (!selectedClusterRoles.has(clusterRoleKey)) {
      setSelectedClusterRoles(new Set([clusterRoleKey]));
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

        if (isOutsideTable && !isContextMenuClick && !isAlertDialogClick && selectedClusterRoles.size > 0) {
          setSelectedClusterRoles(new Set());
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedClusterRoles]);

  // Handle view cluster role details
  const handleViewClusterRole = () => {
    setShowContextMenu(false);
    if (activeClusterRole) {
      handleClusterRoleDetails(activeClusterRole);
    }
  };

  const handleAskAI = (clusterRole: V1ClusterRole) => {
    try {
      // Convert cluster role to EnrichedSearchResult format
      const resourceContext = resourceToEnrichedSearchResult(
        clusterRole,
        'clusterroles',
        false, // cluster-scoped
        'rbac.authorization.k8s.io',
        'v1'
      );
      
      // Add to chat context
      addResourceContext(resourceContext);
      
      // Show success toast
      toast({
        title: "Added to Chat",
        description: `ClusterRole "${clusterRole.metadata?.name}" has been added to chat context`
      });
    } catch (error) {
      console.error('Error adding cluster role to chat:', error);
      toast({
        title: "Error",
        description: "Failed to add cluster role to chat context",
        variant: "destructive"
      });
    }
  };

  // Helper function for dropdown menu actions
  const handleViewClusterRoleMenuItem = (e: React.MouseEvent, clusterRole: V1ClusterRole) => {
    e.stopPropagation();
    if (clusterRole.metadata?.name) {
      navigate(`/dashboard/explore/clusterroles/${clusterRole.metadata.name}`);
    }
  };

  const handleDeleteClusterRoleMenuItem = (e: React.MouseEvent, clusterRole: V1ClusterRole) => {
    e.stopPropagation();
    if (isReconMode) {
      toast({
        title: "Recon Mode",
        description: "This action can't be performed while recon mode is on. Disable recon mode to proceed.",
        variant: "recon"
      });
      return;
    }

    setActiveClusterRole(clusterRole);
    setSelectedClusterRoles(new Set([clusterRole.metadata?.name || '']));
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
  const deleteClusterRoles = async () => {
    setShowDeleteDialog(false);

    try {
      if (selectedClusterRoles.size === 0 && activeClusterRole) {
        // Delete single active ClusterRole
        await deleteClusterRole(activeClusterRole);
      } else {
        // Delete all selected ClusterRoles
        for (const clusterRoleName of selectedClusterRoles) {
          const clusterRoleToDelete = clusterRoles.find(cr =>
            cr.metadata?.name === clusterRoleName
          );

          if (clusterRoleToDelete) {
            await deleteClusterRole(clusterRoleToDelete);
          }
        }
      }

      // Clear selection after deletion
      setSelectedClusterRoles(new Set());

      // Refresh ClusterRoles list after deletion
      if (currentContext) {
        const refreshedClusterRoles = await listResources(currentContext.name, 'clusterroles', {
          apiGroup: 'rbac.authorization.k8s.io',
          apiVersion: 'v1'
        });
        setClusterRoles(refreshedClusterRoles);
      }

    } catch (error) {
      console.error('Failed to delete ClusterRole(s):', error);
      setError(error instanceof Error ? error.message : 'Failed to delete ClusterRole(s)');
    }
  };

  // Delete ClusterRole function
  const deleteClusterRole = async (clusterRole: V1ClusterRole) => {
    if (!currentContext || !clusterRole.metadata?.name) return;

    await deleteResource(
      currentContext.name,
      'clusterroles',
      clusterRole.metadata.name,
      {
        apiGroup: 'rbac.authorization.k8s.io',
        apiVersion: 'v1'
      }
    );
  };

  // Check if cluster role has high privileges (wildcard permissions)
  const hasHighPrivileges = (clusterRole: V1ClusterRole): boolean => {
    return (clusterRole.rules || []).some(rule =>
      (Array.isArray(rule.apiGroups) && rule.apiGroups.includes('*')) ||
      (Array.isArray(rule.resources) && rule.resources.includes('*')) ||
      (Array.isArray(rule.verbs) && rule.verbs.includes('*'))
    );
  };

  // Check if it's a system cluster role (starts with system:)
  const isSystemRole = (clusterRole: V1ClusterRole): boolean => {
    return (clusterRole.metadata?.name || '').startsWith('system:');
  };

  // Render the context menu
  const renderContextMenu = () => {
    if (!showContextMenu || !contextMenuPosition) return null;

    // Calculate if we need to show the menu above or below the click position
    const windowHeight = window.innerHeight;
    const menuHeight = 180; // Approximate context menu height
    const shouldShowAbove = windowHeight - contextMenuPosition.y < menuHeight;

    // Single selection options only available for single cluster role
    const isSingleSelection = selectedClusterRoles.size <= 1;

    // Special warning if it's a system cluster role
    const isSystemClusterRole = activeClusterRole ? isSystemRole(activeClusterRole) : false;

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
          {selectedClusterRoles.size > 1
            ? `${selectedClusterRoles.size} ClusterRoles selected`
            : activeClusterRole?.metadata?.name || 'ClusterRole actions'}
        </div>

        {isSingleSelection && (
          <>
            <div
              className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center"
              onClick={handleViewClusterRole}
            >
              <Eye className="h-4 w-4 mr-2" />
              View
            </div>
          </>
        )}

        <div
          className={`px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center text-red-600 dark:text-red-400 ${isSystemClusterRole ? 'text-gray-400 dark:text-gray-600 pointer-events-none' : ''
            }`}
          onClick={!isSystemClusterRole ? handleDeleteClick : undefined}
          title={isSystemClusterRole ? "System ClusterRoles cannot be deleted" : ""}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete {selectedClusterRoles.size > 1 ? `(${selectedClusterRoles.size})` : ''}
        </div>

        {isSystemClusterRole && (
          <div className="px-3 py-2 text-xs text-amber-500 dark:text-amber-400 border-t border-gray-200 dark:border-gray-800/60 mt-1">
            System ClusterRoles are managed by Kubernetes
          </div>
        )}
      </div>,
      document.body
    );
  };

  // Delete confirmation dialog
  const renderDeleteDialog = () => {
    // Check if any of the selected cluster roles have high privileges
    const hasHighPrivilegedRoles = (): boolean => {
      if (selectedClusterRoles.size === 0 && activeClusterRole) {
        return hasHighPrivileges(activeClusterRole);
      }

      return Array.from(selectedClusterRoles).some(roleName => {
        const role = clusterRoles.find(r => r.metadata?.name === roleName);
        return role ? hasHighPrivileges(role) : false;
      });
    };

    return (
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-gray-100 dark:bg-[#0B0D13]">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm ClusterRole Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedClusterRoles.size > 1
                ? `${selectedClusterRoles.size} cluster roles`
                : `"${activeClusterRole?.metadata?.name}"`}?
              This action cannot be undone.

              <div className="mt-2 text-amber-600 dark:text-amber-400">
                Warning: Deleting cluster roles will affect access control for users and service accounts cluster-wide.
                {hasHighPrivilegedRoles() && (
                  <div className="mt-1 font-medium">
                    One or more selected roles have high-privilege permissions (wildcards).
                  </div>
                )}
                <div className="mt-1">
                  Note: ClusterRoleBindings that reference these roles will not be deleted but will become invalid.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteClusterRoles}
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

  // Fetch cluster roles (these are cluster-scoped resources)
  useEffect(() => {
    const fetchClusterRoles = async () => {
      if (!currentContext) {
        setClusterRoles([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Fetch cluster roles
        const clusterRolesData = await listResources(currentContext.name, 'clusterroles', {
          apiGroup: 'rbac.authorization.k8s.io',
          apiVersion: 'v1'
        });

        setClusterRoles(clusterRolesData);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch cluster roles:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch cluster roles');
      } finally {
        setLoading(false);
      }
    };

    fetchClusterRoles();
  }, [currentContext]);

  // Filter cluster roles based on search query
  const filteredClusterRoles = useMemo(() => {
    if (!searchQuery.trim()) {
      return clusterRoles;
    }

    const lowercaseQuery = searchQuery.toLowerCase();

    return clusterRoles.filter(clusterRole => {
      const name = clusterRole.metadata?.name?.toLowerCase() || '';
      const labels = clusterRole.metadata?.labels || {};
      const annotations = clusterRole.metadata?.annotations || {};

      // Check if any rule matches the query
      const ruleMatches = (clusterRole.rules || []).some(rule => {
        // Check API groups - ensure rule.apiGroups exists and is an array
        const apiGroupMatches = Array.isArray(rule.apiGroups) && rule.apiGroups.some(group =>
          group.toLowerCase().includes(lowercaseQuery)
        );

        // Check resources - ensure rule.resources exists and is an array
        const resourceMatches = Array.isArray(rule.resources) && rule.resources.some(resource =>
          resource.toLowerCase().includes(lowercaseQuery)
        );

        // Check verbs - ensure rule.verbs exists and is an array
        const verbMatches = Array.isArray(rule.verbs) && rule.verbs.some(verb =>
          verb.toLowerCase().includes(lowercaseQuery)
        );

        // Check resource names if present - ensure rule.resourceNames exists and is an array
        const resourceNameMatches = Array.isArray(rule.resourceNames) && rule.resourceNames.some(resourceName =>
          resourceName.toLowerCase().includes(lowercaseQuery)
        );

        // Check non-resource URLs if present - ensure rule.nonResourceURLs exists and is an array
        const nonResourceUrlMatches = Array.isArray(rule.nonResourceURLs) && rule.nonResourceURLs.some(url =>
          url.toLowerCase().includes(lowercaseQuery)
        );

        return apiGroupMatches || resourceMatches || verbMatches || resourceNameMatches || nonResourceUrlMatches;
      });

      // Check if name contains the query
      if (name.includes(lowercaseQuery) || ruleMatches) {
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

      // Check if aggregation rule selectors match - ensure clusterRole.aggregationRule exists
      const aggregationMatches = clusterRole.aggregationRule?.clusterRoleSelectors?.some(selector => {
        const matchLabelsMatches = selector.matchLabels ? Object.entries(selector.matchLabels).some(
          ([key, value]) =>
            key.toLowerCase().includes(lowercaseQuery) ||
            (typeof value === 'string' && value.toLowerCase().includes(lowercaseQuery))
        ) : false;

        const matchExpressionsMatches = Array.isArray(selector.matchExpressions) && selector.matchExpressions.some(
          expr =>
            expr.key.toLowerCase().includes(lowercaseQuery) ||
            expr.operator.toLowerCase().includes(lowercaseQuery) ||
            Array.isArray(expr.values) && expr.values.some(v => v.toLowerCase().includes(lowercaseQuery))
        );

        return matchLabelsMatches || matchExpressionsMatches;
      }) || false;

      return labelMatches || annotationMatches || aggregationMatches;
    });
  }, [clusterRoles, searchQuery]);

  // Sort cluster roles based on sort state
  const sortedClusterRoles = useMemo(() => {
    if (!sort.field || !sort.direction) {
      return filteredClusterRoles;
    }

    return [...filteredClusterRoles].sort((a, b) => {
      const sortMultiplier = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'name':
          return (a.metadata?.name || '').localeCompare(b.metadata?.name || '') * sortMultiplier;

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

        case 'type': {
          // Sort by whether it's an aggregated role or not
          const isAggregatedA = Boolean(a.aggregationRule);
          const isAggregatedB = Boolean(b.aggregationRule);

          if (isAggregatedA === isAggregatedB) {
            // If both are the same type, sort by name
            return (a.metadata?.name || '').localeCompare(b.metadata?.name || '') * sortMultiplier;
          }

          return (isAggregatedA ? 1 : -1) * sortMultiplier;
        }

        default:
          return 0;
      }
    });
  }, [filteredClusterRoles, sort.field, sort.direction]);

  const handleClusterRoleDetails = (clusterRole: V1ClusterRole) => {
    if (clusterRole.metadata?.name) {
      navigate(`/dashboard/explore/clusterroles/${clusterRole.metadata.name}`);
    }
  };

  // Format API groups and resources
  const formatApisAndResources = (clusterRole: V1ClusterRole): JSX.Element => {
    if (!clusterRole.rules || clusterRole.rules.length === 0) {
      return <span className="text-gray-500 dark:text-gray-400">No rules</span>;
    }

    // Get all unique API groups and resources
    const apiGroups = new Set<string>();
    const resources = new Set<string>();

    clusterRole.rules.forEach(rule => {
      // Check if apiGroups exists before iterating
      if (rule.apiGroups && Array.isArray(rule.apiGroups)) {
        rule.apiGroups.forEach(group => apiGroups.add(group));
      }

      // Check if resources exists before iterating
      if (rule.resources && Array.isArray(rule.resources)) {
        rule.resources.forEach(resource => resources.add(resource));
      }
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
              <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300">
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
              <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300">
                +{resourcesArray.length - 2} more
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };


  // Format verbs (permissions)
  const formatVerbs = (clusterRole: V1ClusterRole): JSX.Element => {
    if (!clusterRole.rules || clusterRole.rules.length === 0) {
      return <span className="text-gray-500 dark:text-gray-400">None</span>;
    }

    // Get all unique verbs
    const verbs = new Set<string>();

    clusterRole.rules.forEach(rule => {
      if (rule.verbs && Array.isArray(rule.verbs)) {
        rule.verbs.forEach(verb => verbs.add(verb));
      }
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
            <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300">
              +{verbsArray.length - 4} more
            </span>
          )}
        </div>
      </div>
    );
  };

  // Format role type (standard or aggregated)
  const formatRoleType = (clusterRole: V1ClusterRole): JSX.Element => {
    const isAggregated = Boolean(clusterRole.aggregationRule);

    return (
      <div className="flex items-center justify-center">
        <span className={`px-2 py-1 rounded-[0.3rem] text-xs font-medium ${isAggregated
          ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300'
          : 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300'
          }`}>
          {isAggregated ? 'Aggregated' : 'Standard'}
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
          
          [&::-webkit-scrollbar]:w-1.5 
          [&::-webkit-scrollbar-track]:bg-transparent 
          [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">
      <div>
        <h1 className='text-5xl font-[Anton] uppercase font-bold text-gray-800/30 dark:text-gray-700/50'>Cluster Roles</h1>
        <div className="w-full md:w-96 mt-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
            <Input
              type="text"
              placeholder="Search by name, API groups, resources, or verbs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
      </div>

      {/* No results message */}
      {sortedClusterRoles.length === 0 && (
        <Alert className="my-6">
          <AlertDescription>
            {searchQuery
              ? `No cluster roles matching "${searchQuery}"`
              : "No cluster roles found in the cluster."}
          </AlertDescription>
        </Alert>
      )}

      {/* ClusterRoles table */}
      {sortedClusterRoles.length > 0 && (
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
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('type')}
                  >
                    Type {renderSortIndicator('type')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:text-blue-500 w-[100px]"
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
                {sortedClusterRoles.map((clusterRole) => (
                  <TableRow
                    key={clusterRole.metadata?.uid || clusterRole.metadata?.name}
                    className={`bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30 ${clusterRole.metadata?.name &&
                      selectedClusterRoles.has(clusterRole.metadata.name)
                      ? 'bg-blue-50 dark:bg-gray-800/30'
                      : ''
                      }`}
                    onClick={(e) => handleClusterRoleClick(e, clusterRole)}
                    onContextMenu={(e) => handleContextMenu(e, clusterRole)}
                  >
                    <TableCell className="font-medium" onClick={() => handleClusterRoleDetails(clusterRole)}>
                      <div className="hover:text-blue-500 hover:underline">
                        {clusterRole.metadata?.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {formatRoleType(clusterRole)}
                    </TableCell>
                    <TableCell className="text-center">
                      {clusterRole.rules?.length || 0}
                    </TableCell>
                    <TableCell>
                      {formatApisAndResources(clusterRole)}
                    </TableCell>
                    <TableCell>
                      {formatVerbs(clusterRole)}
                    </TableCell>
                    <TableCell className="text-center">
                      {calculateAge(clusterRole.metadata?.creationTimestamp?.toString())}
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
                            handleAskAI(clusterRole);
                          }} className='hover:text-gray-700 dark:hover:text-gray-500'>
                            <Sparkles className="mr-2 h-4 w-4" />
                            Ask AI
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => handleViewClusterRoleMenuItem(e, clusterRole)} className='hover:text-gray-700 dark:hover:text-gray-500'>
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className={`text-red-500 dark:text-red-400 focus:text-red-500 dark:focus:text-red-400 hover:text-red-700 dark:hover:text-red-500 ${isSystemRole(clusterRole) ? 'opacity-50 pointer-events-none' : ''}`}
                            onClick={(e) => !isSystemRole(clusterRole) ? handleDeleteClusterRoleMenuItem(e, clusterRole) : undefined}
                            disabled={isSystemRole(clusterRole)}
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

export default ClusterRoles;