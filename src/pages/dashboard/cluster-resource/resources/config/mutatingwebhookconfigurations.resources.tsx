import React, { useState, useEffect, useMemo } from 'react';
import { listResources } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, MoreVertical, Search, ArrowUpDown, ArrowUp, ArrowDown, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from 'react-router-dom';
import { calculateAge } from '@/utils/age';
import { ErrorComponent } from '@/components/custom';
import ResourceFilterSidebar, { type ColumnConfig } from '@/components/custom/resourcefiltersidebar/resourcefiltersidebar.component';
import { useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Trash } from "lucide-react";
import { Trash2, Eye } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { deleteResource } from '@/api/internal/resources';
import { useReconMode } from '@/contexts/useRecon';
import { toast } from '@/hooks/use-toast';
import { getStoredColumnConfig, saveColumnConfig, clearColumnConfig } from '@/utils/columnConfigStorage';
// Define types for MutatingWebhookConfiguration
interface Rule {
  apiGroups?: string[];
  apiVersions?: string[];
  operations?: string[];
  resources?: string[];
  scope?: string;
}

interface SideEffectClass {
  name: string;
}

interface WebhookClientConfig {
  url?: string;
  service?: {
    namespace?: string;
    name?: string;
    path?: string;
    port?: number;
  };
  caBundle?: string;
}

interface Webhook {
  name: string;
  clientConfig: WebhookClientConfig;
  rules?: Rule[];
  failurePolicy?: string;
  sideEffects?: string;
  admissionReviewVersions?: string[];
  timeoutSeconds?: number;
  matchPolicy?: string;
  namespaceSelector?: {
    matchLabels?: { [key: string]: string };
    matchExpressions?: Array<{
      key: string;
      operator: string;
      values?: string[];
    }>;
  };
  objectSelector?: {
    matchLabels?: { [key: string]: string };
    matchExpressions?: Array<{
      key: string;
      operator: string;
      values?: string[];
    }>;
  };
  reinvocationPolicy?: string;
}

interface V1MutatingWebhookConfiguration {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    creationTimestamp?: string;
    labels?: { [key: string]: string };
    annotations?: { [key: string]: string };
  };
  webhooks?: Webhook[];
}

// Define sorting types
type SortDirection = 'asc' | 'desc' | null;
type SortField = 'name' | 'webhookCount' | 'apiGroups' | 'age' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

const MutatingWebhookConfigurations: React.FC = () => {
  const navigate = useNavigate();
  const { currentContext } = useCluster();
  const { isReconMode } = useReconMode();
  const [webhooks, setWebhooks] = useState<V1MutatingWebhookConfiguration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Column filtering state
  const defaultColumnConfig: ColumnConfig[] = [
    { key: 'name', label: 'Name', visible: true, canToggle: false },
    { key: 'webhooks', label: 'Webhooks', visible: true, canToggle: true },
    { key: 'rules', label: 'Rules', visible: true, canToggle: true },
    { key: 'endpoints', label: 'Endpoints', visible: true, canToggle: true },
    { key: 'failurePolicy', label: 'Failure Policy', visible: true, canToggle: true },
    { key: 'age', label: 'Age', visible: true, canToggle: true },
    { key: 'actions', label: 'Actions', visible: true, canToggle: false }
  ];

  const [columnConfig, setColumnConfig] = useState<ColumnConfig[]>(() =>
    getStoredColumnConfig('mutatingwebhookconfigurations', defaultColumnConfig)
  );
  const [showFilterSidebar, setShowFilterSidebar] = useState(false);

  // --- Start of Multi-select ---
  const [selectedWebhooks, setSelectedWebhooks] = useState<Set<string>>(new Set());
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [activeWebhook, setActiveWebhook] = useState<V1MutatingWebhookConfiguration | null>(null);
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

  // Add click handler for webhook selection with cmd/ctrl key
  const handleWebhookClick = (e: React.MouseEvent, webhook: V1MutatingWebhookConfiguration) => {
    const webhookKey = webhook.metadata?.name || '';

    if (e.metaKey || e.ctrlKey) {
      // Prevent navigation when using multi-select
      e.preventDefault();
      e.stopPropagation();

      setSelectedWebhooks(prev => {
        const newSelection = new Set(prev);
        if (newSelection.has(webhookKey)) {
          newSelection.delete(webhookKey);
        } else {
          newSelection.add(webhookKey);
        }
        return newSelection;
      });
    } else if (!selectedWebhooks.has(webhookKey)) {
      // Clear selection on regular click (unless clicking on already selected webhook)
      setSelectedWebhooks(new Set());
      handleWebhookDetails(webhook);
    } else {
      handleWebhookDetails(webhook);
    }
  };

  // Add context menu handlers
  const handleContextMenu = (e: React.MouseEvent, webhook: V1MutatingWebhookConfiguration) => {
    e.preventDefault();
    e.stopPropagation();

    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setActiveWebhook(webhook);
    setShowContextMenu(true);

    // Multi-select support: if webhook isn't in selection, make it the only selection
    const webhookKey = webhook.metadata?.name || '';
    if (!selectedWebhooks.has(webhookKey)) {
      setSelectedWebhooks(new Set([webhookKey]));
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

        if (isOutsideTable && !isContextMenuClick && !isAlertDialogClick && selectedWebhooks.size > 0) {
          setSelectedWebhooks(new Set());
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedWebhooks]);

  // Handle view action - only available for a single webhook
  const handleViewWebhook = () => {
    setShowContextMenu(false);

    if (activeWebhook && activeWebhook.metadata?.name) {
      navigate(`/dashboard/explore/mutatingwebhookconfigurations/${activeWebhook.metadata.name}`);
    }
  };


  const handleDeleteWebhookMenuItem = (e: React.MouseEvent, webhook: V1MutatingWebhookConfiguration) => {
    e.stopPropagation();

    if (isReconMode) {
      toast({
        title: "Recon Mode",
        description: "This action can't be performed while recon mode is on. Disable recon mode to proceed.",
        variant: "recon"
      });
      return;
    }

    setActiveWebhook(webhook);
    setSelectedWebhooks(new Set([webhook.metadata?.name || '']));
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
  const deleteWebhooks = async () => {
    setShowDeleteDialog(false);

    try {
      if (selectedWebhooks.size === 0 && activeWebhook) {
        // Delete single active webhook
        await deleteWebhook(activeWebhook);
      } else {
        // Delete all selected webhooks
        for (const webhookName of selectedWebhooks) {
          const webhookToDelete = webhooks.find(wh => wh.metadata?.name === webhookName);

          if (webhookToDelete) {
            await deleteWebhook(webhookToDelete);
          }
        }
      }

      // Clear selection after deletion
      setSelectedWebhooks(new Set());

      // Refresh webhook list after deletion
      if (currentContext) {
        const fetchWebhooks = async () => {
          try {
            setLoading(true);

            // Try v1 API first
            try {
              const webhooksData = await listResources(currentContext.name, 'mutatingwebhookconfigurations', {
                apiGroup: 'admissionregistration.k8s.io',
                apiVersion: 'v1'
              });
              setWebhooks(webhooksData);
            } catch (err) {
              // Fallback to v1beta1 (for older clusters)
              try {
                const webhooksData = await listResources(currentContext.name, 'mutatingwebhookconfigurations', {
                  apiGroup: 'admissionregistration.k8s.io',
                  apiVersion: 'v1beta1'
                });
                setWebhooks(webhooksData);
              } catch (fallbackErr) {
                console.error('Failed to fetch MutatingWebhookConfigurations:', fallbackErr);
                setError('Failed to fetch MutatingWebhookConfigurations. Your cluster may not support this resource type.');
                setWebhooks([]);
              }
            }

            setError(null);
          } catch (err) {
            console.error('Failed to fetch mutating webhook configurations:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch mutating webhook configurations');
          } finally {
            setLoading(false);
          }
        };

        fetchWebhooks();
      }

    } catch (error) {
      console.error('Failed to delete webhook(s):', error);
      setError(error instanceof Error ? error.message : 'Failed to delete webhook(s)');
    }
  };

  // Delete webhook function
  const deleteWebhook = async (webhook: V1MutatingWebhookConfiguration) => {
    if (!currentContext || !webhook.metadata?.name) return;

    // Determine API version based on webhook's apiVersion field
    const apiVersion = webhook.apiVersion?.includes('v1beta1') ? 'v1beta1' : 'v1';

    await deleteResource(
      currentContext.name,
      'mutatingwebhookconfigurations',
      webhook.metadata.name,
      {
        apiGroup: 'admissionregistration.k8s.io',
        apiVersion: apiVersion
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
        className="fixed z-50 min-w-[180px] bg-white dark:bg-card backdrop-blur-sm rounded-md shadow-lg border border-gray-300 dark:border-gray-800/60 py-1 text-sm"
        style={{
          left: `${contextMenuPosition.x}px`,
          top: shouldShowAbove
            ? `${contextMenuPosition.y - menuHeight}px`
            : `${contextMenuPosition.y}px`,
        }}
      >
        <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 font-medium border-b border-gray-200 dark:border-gray-800/60">
          {selectedWebhooks.size > 1
            ? `${selectedWebhooks.size} Webhooks selected`
            : activeWebhook?.metadata?.name || 'Webhook actions'}
        </div>

        <div
          className={`px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center ${selectedWebhooks.size > 1 ? 'text-gray-400 dark:text-gray-600 pointer-events-none' : ''}`}
          onClick={selectedWebhooks.size <= 1 ? handleViewWebhook : undefined}
          title={selectedWebhooks.size > 1 ? "Select only one webhook to view" : ""}
        >
          <Eye className="h-4 w-4 mr-2" />
          View
        </div>

        <div
          className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center text-red-600 dark:text-red-400"
          onClick={handleDeleteClick}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete {selectedWebhooks.size > 1 ? `(${selectedWebhooks.size})` : ''}
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
            <AlertDialogTitle>Confirm Webhook Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedWebhooks.size > 1
                ? `${selectedWebhooks.size} MutatingWebhookConfigurations`
                : `"${activeWebhook?.metadata?.name}"`}?
              This action cannot be undone.

              <div className="mt-2 text-amber-600 dark:text-amber-400">
                Warning: Deleting MutatingWebhookConfigurations may disrupt admission control operations in your cluster.
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteWebhooks}
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
    field: 'name',
    direction: 'asc'
  });

  // Column management functions
  const handleColumnToggle = (columnKey: string, visible: boolean) => {
    setColumnConfig(prev => {
      const updated = prev.map(col =>
        col.key === columnKey && col.canToggle !== false
          ? { ...col, visible }
          : col
      );
      // Save to localStorage
      saveColumnConfig('mutatingwebhookconfigurations', updated);
      return updated;
    });
  };

  const handleColumnReorder = (reorderedColumns: ColumnConfig[]) => {
    setColumnConfig(reorderedColumns);
    // Save to localStorage
    saveColumnConfig('mutatingwebhookconfigurations', reorderedColumns);
  };

  const handleResetToDefault = () => {
    const resetConfig = defaultColumnConfig.map(col => ({ ...col, visible: true }));
    setColumnConfig(resetConfig);
    // Clear from localStorage to use defaults
    clearColumnConfig('mutatingwebhookconfigurations');
  };

  const isColumnVisible = (columnKey: string): boolean => {
    const column = columnConfig.find(col => col.key === columnKey);
    return column ? column.visible : true;
  };

  // Helper function to render table header based on column key
  const renderTableHeader = (column: ColumnConfig) => {
    if (!column.visible || column.key === 'actions') {
      return null;
    }

    const sortFieldMap: Record<string, SortField> = {
      name: 'name',
      webhooks: 'webhookCount',
      age: 'age'
      // Note: 'rules', 'endpoints', 'failurePolicy' are not sortable
    };

    const sortField = sortFieldMap[column.key];
    const isCenterColumn = ['webhooks', 'failurePolicy', 'age'].includes(column.key);
    const isSortable = sortField !== undefined;

    return (
      <TableHead
        key={column.key}
        className={`${isSortable ? 'cursor-pointer hover:text-blue-500' : ''} ${isCenterColumn ? 'text-center' : ''}`}
        onClick={() => sortField && handleSort(sortField)}
      >
        {column.label} {sortField && renderSortIndicator(sortField)}
      </TableHead>
    );
  };

  // Helper function to render table cell based on column key
  const renderTableCell = (webhook: V1MutatingWebhookConfiguration, column: ColumnConfig) => {
    if (!column.visible || column.key === 'actions') {
      return null;
    }

    switch (column.key) {
      case 'name':
        return (
          <TableCell key={column.key} className="font-medium" onClick={() => handleWebhookDetails(webhook)}>
            <div className="hover:text-blue-500 hover:underline">
              {webhook.metadata?.name}
            </div>
          </TableCell>
        );

      case 'webhooks':
        return (
          <TableCell key={column.key} className="text-center">
            {formatWebhookCount(webhook)}
          </TableCell>
        );

      case 'rules':
        return (
          <TableCell key={column.key}>
            {formatRulesSummary(webhook)}
          </TableCell>
        );

      case 'endpoints':
        return (
          <TableCell key={column.key}>
            {formatEndpoints(webhook)}
          </TableCell>
        );

      case 'failurePolicy':
        return (
          <TableCell key={column.key}>
            {formatFailurePolicies(webhook)}
          </TableCell>
        );

      case 'age':
        return (
          <TableCell key={column.key} className="text-center">
            {calculateAge(webhook.metadata?.creationTimestamp?.toString())}
          </TableCell>
        );

      default:
        return null;
    }
  };

  // Fetch MutatingWebhookConfigurations (these are cluster-scoped resources)
  useEffect(() => {
    const fetchWebhooks = async () => {
      if (!currentContext) {
        setWebhooks([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Try v1 API first
        try {
          const webhooksData = await listResources(currentContext.name, 'mutatingwebhookconfigurations', {
            apiGroup: 'admissionregistration.k8s.io',
            apiVersion: 'v1'
          });
          setWebhooks(webhooksData);
        } catch (err) {
          console.warn('Failed to fetch MutatingWebhookConfigurations with admissionregistration.k8s.io/v1, falling back to v1beta1:', err);

          // Fallback to v1beta1 (for older clusters)
          try {
            const webhooksData = await listResources(currentContext.name, 'mutatingwebhookconfigurations', {
              apiGroup: 'admissionregistration.k8s.io',
              apiVersion: 'v1beta1'
            });
            setWebhooks(webhooksData);
          } catch (fallbackErr) {
            console.error('Failed to fetch MutatingWebhookConfigurations:', fallbackErr);
            setError('Failed to fetch MutatingWebhookConfigurations. Your cluster may not support this resource type.');
            setWebhooks([]);
          }
        }

        setError(null);
      } catch (err) {
        console.error('Failed to fetch mutating webhook configurations:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch mutating webhook configurations');
      } finally {
        setLoading(false);
      }
    };

    fetchWebhooks();
  }, [currentContext]);

  // Filter MutatingWebhookConfigurations based on search query
  const filteredWebhooks = useMemo(() => {
    if (!searchQuery.trim()) {
      return webhooks;
    }

    const lowercaseQuery = searchQuery.toLowerCase();

    return webhooks.filter(webhook => {
      const name = webhook.metadata?.name?.toLowerCase() || '';
      const labels = webhook.metadata?.labels || {};
      const annotations = webhook.metadata?.annotations || {};

      // Check webhook details
      let webhooksMatch = false;

      if (webhook.webhooks) {
        webhooksMatch = webhook.webhooks.some(wh => {
          // Check webhook name
          if (wh.name.toLowerCase().includes(lowercaseQuery)) {
            return true;
          }

          // Check service
          if (wh.clientConfig.service) {
            const service = wh.clientConfig.service;
            if (
              (service.name?.toLowerCase().includes(lowercaseQuery) || false) ||
              (service.namespace?.toLowerCase().includes(lowercaseQuery) || false)
            ) {
              return true;
            }
          }

          // Check URL
          if (wh.clientConfig.url?.toLowerCase().includes(lowercaseQuery)) {
            return true;
          }

          // Check rules
          if (wh.rules) {
            return wh.rules.some(rule => {
              const apiGroups = rule.apiGroups?.join(',').toLowerCase() || '';
              const resources = rule.resources?.join(',').toLowerCase() || '';
              const operations = rule.operations?.join(',').toLowerCase() || '';

              return (
                apiGroups.includes(lowercaseQuery) ||
                resources.includes(lowercaseQuery) ||
                operations.includes(lowercaseQuery)
              );
            });
          }

          // Check failure policy, side effects, etc.
          return (
            (wh.failurePolicy?.toLowerCase().includes(lowercaseQuery) || false) ||
            (wh.sideEffects?.toLowerCase().includes(lowercaseQuery) || false) ||
            (wh.matchPolicy?.toLowerCase().includes(lowercaseQuery) || false) ||
            (wh.reinvocationPolicy?.toLowerCase().includes(lowercaseQuery) || false)
          );
        });
      }

      // Check if name or any webhook contains the query
      if (name.includes(lowercaseQuery) || webhooksMatch) {
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
  }, [webhooks, searchQuery]);

  // Sort MutatingWebhookConfigurations based on sort state
  const sortedWebhooks = useMemo(() => {
    if (!sort.field || !sort.direction) {
      return filteredWebhooks;
    }

    return [...filteredWebhooks].sort((a, b) => {
      const sortMultiplier = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'name':
          return (a.metadata?.name || '').localeCompare(b.metadata?.name || '') * sortMultiplier;

        case 'webhookCount': {
          const countA = a.webhooks?.length || 0;
          const countB = b.webhooks?.length || 0;
          return (countA - countB) * sortMultiplier;
        }

        case 'apiGroups': {
          // Get unique API groups from all webhooks for sorting
          const getApiGroups = (wh: V1MutatingWebhookConfiguration): string[] => {
            const groups = new Set<string>();
            wh.webhooks?.forEach(webhook => {
              webhook.rules?.forEach(rule => {
                rule.apiGroups?.forEach(group => groups.add(group));
              });
            });
            return Array.from(groups).sort();
          };

          const groupsA = getApiGroups(a);
          const groupsB = getApiGroups(b);

          // First, compare by count of API groups
          if (groupsA.length !== groupsB.length) {
            return (groupsA.length - groupsB.length) * sortMultiplier;
          }

          // If count is the same, compare lexicographically using the first group
          return (groupsA[0] || '').localeCompare(groupsB[0] || '') * sortMultiplier;
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
  }, [filteredWebhooks, sort.field, sort.direction]);

  const handleWebhookDetails = (webhook: V1MutatingWebhookConfiguration) => {
    if (webhook.metadata?.name) {
      navigate(`/dashboard/explore/mutatingwebhookconfigurations/${webhook.metadata.name}`);
    }
  };

  // Format webhook count for display
  const formatWebhookCount = (webhook: V1MutatingWebhookConfiguration): JSX.Element => {
    const count = webhook.webhooks?.length || 0;

    return (
      <div className="flex items-center justify-center">
        <span className="px-2 py-1 rounded-[0.3rem] text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
          {count}
        </span>
      </div>
    );
  };

  // Format webhook rules summary
  const formatRulesSummary = (webhook: V1MutatingWebhookConfiguration): JSX.Element => {
    if (!webhook.webhooks || webhook.webhooks.length === 0) {
      return <span className="text-gray-500 dark:text-gray-400">No webhooks</span>;
    }

    // Collect all unique API groups
    const apiGroups = new Set<string>();
    webhook.webhooks.forEach(wh => {
      wh.rules?.forEach(rule => {
        rule.apiGroups?.forEach(group => apiGroups.add(group));
      });
    });

    // Collect all unique resources
    const resources = new Set<string>();
    webhook.webhooks.forEach(wh => {
      wh.rules?.forEach(rule => {
        rule.resources?.forEach(resource => resources.add(resource));
      });
    });

    // Display a summary
    return (
      <div className="space-y-2">
        {apiGroups.size > 0 && (
          <div>
            <div className="text-xs font-medium mb-1">API Groups:</div>
            <div className="flex flex-wrap gap-1">
              {Array.from(apiGroups).slice(0, 3).map(group => (
                <span key={group} className="px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
                  {group === '*' ? 'all' : group}
                </span>
              ))}
              {apiGroups.size > 3 && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  +{apiGroups.size - 3} more
                </span>
              )}
            </div>
          </div>
        )}

        {resources.size > 0 && (
          <div>
            <div className="text-xs font-medium mb-1">Resources:</div>
            <div className="flex flex-wrap gap-1">
              {Array.from(resources).slice(0, 3).map(resource => (
                <span key={resource} className="px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300">
                  {resource === '*' ? 'all' : resource}
                </span>
              ))}
              {resources.size > 3 && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  +{resources.size - 3} more
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Format service endpoints
  const formatEndpoints = (webhook: V1MutatingWebhookConfiguration): JSX.Element => {
    if (!webhook.webhooks || webhook.webhooks.length === 0) {
      return <span className="text-gray-500 dark:text-gray-400">None</span>;
    }

    const endpoints = new Set<string>();

    webhook.webhooks.forEach(wh => {
      if (wh.clientConfig.url) {
        // Format URL for display
        try {
          const url = new URL(wh.clientConfig.url);
          endpoints.add(`${url.hostname}${url.pathname}`);
        } catch {
          endpoints.add(wh.clientConfig.url);
        }
      } else if (wh.clientConfig.service) {
        const service = wh.clientConfig.service;
        const path = service.path || '';
        const port = service.port ? `:${service.port}` : '';
        endpoints.add(`${service.name}.${service.namespace}${port}${path}`);
      }
    });

    return (
      <div className="space-y-1">
        {Array.from(endpoints).slice(0, 3).map((endpoint, index) => (
          <div key={index} className="text-sm">
            {endpoint}
          </div>
        ))}
        {endpoints.size > 3 && (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            +{endpoints.size - 3} more
          </div>
        )}
      </div>
    );
  };

  // Format failure policies
  const formatFailurePolicies = (webhook: V1MutatingWebhookConfiguration): JSX.Element => {
    if (!webhook.webhooks || webhook.webhooks.length === 0) {
      return <span className="text-gray-500 dark:text-gray-400">None</span>;
    }

    const policies = new Map<string, number>();

    webhook.webhooks.forEach(wh => {
      const policy = wh.failurePolicy || 'Fail';
      policies.set(policy, (policies.get(policy) || 0) + 1);
    });

    return (
      <div className="space-y-1">
        {Array.from(policies.entries()).map(([policy, count]) => {
          let colorClass = 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300';

          if (policy === 'Fail') {
            colorClass = 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300';
          } else if (policy === 'Ignore') {
            colorClass = 'bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300';
          }

          return (
            <div key={policy} className="flex items-center">
              <span className={`px-2 py-1 rounded-[0.3rem] text-xs font-medium ${colorClass}`}>
                {policy}
              </span>
              {count > 1 && (
                <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                  ({count})
                </span>
              )}
            </div>
          );
        })}
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
          <h1 className='text-5xl font-[Anton] uppercase font-bold text-gray-800/30 dark:text-gray-700/50'>Mutating Webhook Configurations</h1>
          <div className="w-full md:w-96 mt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
              <Input
                type="text"
                placeholder="Search by name, API group, resource..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
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

      {/* MutatingWebhookConfiguration table */}
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
              {sortedWebhooks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-gray-500 dark:text-gray-400">
                    {searchQuery
                      ? `No mutating webhook configurations matching "${searchQuery}"`
                      : "No mutating webhook configurations found in the cluster. These are typically created by admission controller extensions."}
                  </TableCell>
                </TableRow>
              ) : (
                sortedWebhooks.map((webhook) => (
                  <TableRow
                    key={webhook.metadata?.name}
                    className={`bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30 ${selectedWebhooks.has(webhook.metadata?.name || '') ? 'bg-blue-50 dark:bg-gray-800/30' : ''
                      }`}
                    onClick={(e) => handleWebhookClick(e, webhook)}
                    onContextMenu={(e) => handleContextMenu(e, webhook)}
                  >
                    {columnConfig.map(col => renderTableCell(webhook, col))}
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
                          <DropdownMenuItem onClick={handleViewWebhook} className='hover:text-gray-700 dark:hover:text-gray-500'>
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-500 dark:text-red-400 focus:text-red-500 dark:focus:text-red-400 hover:text-red-700 dark:hover:text-red-500"
                            onClick={(e) => handleDeleteWebhookMenuItem(e, webhook)}
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

      {/* Filter Sidebar */}
      <ResourceFilterSidebar
        isOpen={showFilterSidebar}
        onClose={() => setShowFilterSidebar(false)}
        title="Mutating Webhook Configurations Table"
        columns={columnConfig}
        onColumnToggle={handleColumnToggle}
        onColumnReorder={handleColumnReorder}
        onResetToDefault={handleResetToDefault}
        resourceType="mutatingwebhookconfigurations"
      />
    </div>
  );
};

export default MutatingWebhookConfigurations;