import React, { useState, useEffect, useMemo } from 'react';
import { listResources } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';
import { useNamespace } from '@/contexts/useNamespace';
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, MoreVertical, Search, ArrowUpDown, ArrowUp, ArrowDown, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from 'react-router-dom';
import { calculateAge } from '@/utils/age';
import { NamespaceSelector, ErrorComponent } from '@/components/custom';
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
import { Trash2, Eye, Sparkles } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { deleteResource } from '@/api/internal/resources';
import { useDrawer } from '@/contexts/useDrawer';
import { resourceToEnrichedSearchResult } from '@/utils/resource-to-enriched.utils';
import { toast } from '@/hooks/use-toast';
import { useReconMode } from '@/contexts/useRecon';
import { getStoredColumnConfig, saveColumnConfig, clearColumnConfig } from '@/utils/columnConfigStorage';


// Define types for NetworkPolicy (not directly exported from kubernetes-client-node)
interface IPBlock {
  cidr: string;
  except?: string[];
}

interface NetworkPolicyPeer {
  ipBlock?: IPBlock;
  namespaceSelector?: {
    matchLabels?: { [key: string]: string };
    matchExpressions?: Array<{
      key: string;
      operator: string;
      values?: string[];
    }>;
  };
  podSelector?: {
    matchLabels?: { [key: string]: string };
    matchExpressions?: Array<{
      key: string;
      operator: string;
      values?: string[];
    }>;
  };
}

interface NetworkPolicyPort {
  port?: number | string;
  endPort?: number;
  protocol?: string;
}

interface NetworkPolicyIngressRule {
  from?: NetworkPolicyPeer[];
  ports?: NetworkPolicyPort[];
}

interface NetworkPolicyEgressRule {
  to?: NetworkPolicyPeer[];
  ports?: NetworkPolicyPort[];
}

interface NetworkPolicySpec {
  podSelector: {
    matchLabels?: { [key: string]: string };
    matchExpressions?: Array<{
      key: string;
      operator: string;
      values?: string[];
    }>;
  };
  policyTypes?: string[];
  ingress?: NetworkPolicyIngressRule[];
  egress?: NetworkPolicyEgressRule[];
}

interface V1NetworkPolicy {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    namespace?: string;
    creationTimestamp?: string;
    labels?: { [key: string]: string };
    annotations?: { [key: string]: string };
  };
  spec?: NetworkPolicySpec;
}

// Define sorting types
type SortDirection = 'asc' | 'desc' | null;
type SortField = 'name' | 'namespace' | 'podSelector' | 'policyTypes' | 'age' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

const NetworkPolicies: React.FC = () => {
  const navigate = useNavigate();
  const { currentContext } = useCluster();
  const { selectedNamespaces } = useNamespace();
  const [networkPolicies, setNetworkPolicies] = useState<V1NetworkPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const { isReconMode } = useReconMode();

  // Column filtering state
  const defaultColumnConfig: ColumnConfig[] = [
    { key: 'name', label: 'Name', visible: true, canToggle: false },
    { key: 'namespace', label: 'Namespace', visible: true, canToggle: true },
    { key: 'podSelector', label: 'Pod Selector', visible: true, canToggle: true },
    { key: 'policyTypes', label: 'Policy Types', visible: true, canToggle: true },
    { key: 'rules', label: 'Rules Summary', visible: true, canToggle: true },
    { key: 'age', label: 'Age', visible: true, canToggle: true },
    { key: 'actions', label: 'Actions', visible: true, canToggle: false }
  ];
  
  const [columnConfig, setColumnConfig] = useState<ColumnConfig[]>(() => 
    getStoredColumnConfig('networkpolicies', defaultColumnConfig)
  );
  const [showFilterSidebar, setShowFilterSidebar] = useState(false);

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
  const [selectedPolicies, setSelectedPolicies] = useState<Set<string>>(new Set());
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [activePolicy, setActivePolicy] = useState<V1NetworkPolicy | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const { addResourceContext } = useDrawer();

  const handleViewNetworkPolicy = (e: React.MouseEvent, policy: V1NetworkPolicy) => {
    e.stopPropagation();
    if (policy.metadata?.name && policy.metadata?.namespace) {
      navigate(`/dashboard/explore/networkpolicies/${policy.metadata.namespace}/${policy.metadata.name}`);
    }
  };

  const handleDeleteNetworkPolicyMenuItem = (e: React.MouseEvent, policy: V1NetworkPolicy) => {
    e.stopPropagation();
    if (isReconMode) {
      toast({
        title: "Recon Mode",
        description: "This action can't be performed while recon mode is on. Disable recon mode to proceed.",
        variant: "recon"
      });
      return;
    }

    setActivePolicy(policy);
    setSelectedPolicies(new Set([`${policy.metadata?.namespace}/${policy.metadata?.name}`]));
    setShowDeleteDialog(true);
  };

  const handlePolicyClick = (e: React.MouseEvent, policy: V1NetworkPolicy) => {
    if (!policy.metadata?.namespace || !policy.metadata?.name) return;

    const policyKey = `${policy.metadata.namespace}/${policy.metadata.name}`;

    if (e.metaKey || e.ctrlKey) {
      // Prevent navigation when using multi-select
      e.preventDefault();
      e.stopPropagation();

      setSelectedPolicies(prev => {
        const newSelection = new Set(prev);
        if (newSelection.has(policyKey)) {
          newSelection.delete(policyKey);
        } else {
          newSelection.add(policyKey);
        }
        return newSelection;
      });
    } else if (!selectedPolicies.has(policyKey)) {
      // Clear selection on regular click (unless clicking on already selected policy)
      setSelectedPolicies(new Set());
      handleNetworkPolicyDetails(policy);
    } else {
      handleNetworkPolicyDetails(policy);
    }
  };

  // Add context menu handlers
  const handleContextMenu = (e: React.MouseEvent, policy: V1NetworkPolicy) => {
    if (!policy.metadata?.namespace || !policy.metadata?.name) return;

    e.preventDefault();
    e.stopPropagation();

    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setActivePolicy(policy);
    setShowContextMenu(true);

    // Multi-select support: if policy isn't in selection, make it the only selection
    const policyKey = `${policy.metadata.namespace}/${policy.metadata.name}`;
    if (!selectedPolicies.has(policyKey)) {
      setSelectedPolicies(new Set([policyKey]));
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

        if (isOutsideTable && !isContextMenuClick && !isAlertDialogClick && selectedPolicies.size > 0) {
          setSelectedPolicies(new Set());
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedPolicies]);

  // Handle view policy details
  const handleViewPolicy = () => {
    setShowContextMenu(false);
    if (activePolicy) {
      handleNetworkPolicyDetails(activePolicy);
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

  const handleAskAI = (policy: V1NetworkPolicy) => {
    try {
      // Convert network policy to EnrichedSearchResult format
      const resourceContext = resourceToEnrichedSearchResult(
        policy,
        'networkpolicies',
        true, // namespaced
        'networking.k8s.io',
        'v1'
      );
      
      // Add to chat context and open drawer
      addResourceContext(resourceContext);
      
      // Show success toast
      toast({
        title: "Added to Chat",
        description: `NetworkPolicy "${policy.metadata?.name}" has been added to chat context`
      });
    } catch (error) {
      console.error('Error adding network policy to chat:', error);
      toast({
        title: "Error",
        description: "Failed to add network policy to chat context",
        variant: "destructive"
      });
    }
  };

  // Perform actual deletion
  const deletePolicies = async () => {
    setShowDeleteDialog(false);

    try {
      if (selectedPolicies.size === 0 && activePolicy) {
        // Delete single active NetworkPolicy
        await deleteNetworkPolicy(activePolicy);
      } else {
        // Delete all selected NetworkPolicies
        for (const policyKey of selectedPolicies) {
          const [namespace, name] = policyKey.split('/');
          const policyToDelete = networkPolicies.find(p =>
            p.metadata?.namespace === namespace && p.metadata?.name === name
          );

          if (policyToDelete) {
            await deleteNetworkPolicy(policyToDelete);
          }
        }
      }

      // Clear selection after deletion
      setSelectedPolicies(new Set());

      // Refresh NetworkPolicies list after deletion
      if (currentContext && selectedNamespaces.length > 0) {
        // Fetch network policies for each selected namespace
        const policyPromises = selectedNamespaces.map(namespace =>
          listResources(currentContext.name, 'networkpolicies', {
            namespace,
            apiGroup: 'networking.k8s.io',
            apiVersion: 'v1'
          })
        );

        const results = await Promise.all(policyPromises);

        // Flatten the array of policy arrays
        const allPolicies = results.flat();
        setNetworkPolicies(allPolicies);
        setError(null);
      }

    } catch (error) {
      console.error('Failed to delete NetworkPolicy(s):', error);
      setError(error instanceof Error ? error.message : 'Failed to delete NetworkPolicy(s)');
    }
  };

  // Delete NetworkPolicy function
  const deleteNetworkPolicy = async (policy: V1NetworkPolicy) => {
    if (!currentContext || !policy.metadata?.name || !policy.metadata?.namespace) return;

    await deleteResource(
      currentContext.name,
      'networkpolicies',
      policy.metadata.name,
      {
        namespace: policy.metadata.namespace,
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
          {selectedPolicies.size > 1
            ? `${selectedPolicies.size} Network Policies selected`
            : activePolicy?.metadata?.name || 'NetworkPolicy actions'}
        </div>

        {selectedPolicies.size <= 1 && (
          <div
            className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center"
            onClick={handleViewPolicy}
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
          Delete {selectedPolicies.size > 1 ? `(${selectedPolicies.size})` : ''}
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
            <AlertDialogTitle>Confirm NetworkPolicy Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedPolicies.size > 1
                ? `${selectedPolicies.size} network policies`
                : `"${activePolicy?.metadata?.name}"`}?
              This action cannot be undone.

              <div className="mt-2 text-amber-600 dark:text-amber-400">
                Warning: Deleting network policies may affect pod connectivity and could result in unintended network access or isolation.
                {activePolicy && activePolicy.spec?.policyTypes?.includes('Egress') && (
                  <div className="mt-1">
                    This policy includes egress rules. Deleting it may allow outbound traffic that was previously blocked.
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deletePolicies}
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
      col.key === columnKey && col.canToggle !== false
        ? { ...col, visible }
        : col
    );
    setColumnConfig(newConfig);
    saveColumnConfig('networkpolicies', newConfig);
  };

  const handleResetToDefault = () => {
    const resetConfig = defaultColumnConfig.map(col => ({ ...col, visible: true }));
    setColumnConfig(resetConfig);
    clearColumnConfig('networkpolicies');
  };

  const isColumnVisible = (columnKey: string): boolean => {
    const column = columnConfig.find(col => col.key === columnKey);
    return column ? column.visible : true;
  };

  // Fetch network policies for all selected namespaces
  useEffect(() => {
    const fetchAllNetworkPolicies = async () => {
      if (!currentContext || selectedNamespaces.length === 0) {
        setNetworkPolicies([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // If no namespaces are selected, fetch from all namespaces
        if (selectedNamespaces.length === 0) {
          const networkPoliciesData = await listResources(currentContext.name, 'networkpolicies', {
            apiGroup: 'networking.k8s.io',
            apiVersion: 'v1'
          });
          setNetworkPolicies(networkPoliciesData);
          return;
        }

        // Fetch network policies for each selected namespace
        const policyPromises = selectedNamespaces.map(namespace =>
          listResources(currentContext.name, 'networkpolicies', {
            namespace,
            apiGroup: 'networking.k8s.io',
            apiVersion: 'v1'
          })
        );

        const results = await Promise.all(policyPromises);

        // Flatten the array of policy arrays
        const allPolicies = results.flat();
        setNetworkPolicies(allPolicies);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch network policies:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch network policies');
      } finally {
        setLoading(false);
      }
    };

    fetchAllNetworkPolicies();
  }, [currentContext, selectedNamespaces]);

  // Filter network policies based on search query
  const filteredNetworkPolicies = useMemo(() => {
    if (!searchQuery.trim()) {
      return networkPolicies;
    }

    const lowercaseQuery = searchQuery.toLowerCase();

    return networkPolicies.filter(policy => {
      const name = policy.metadata?.name?.toLowerCase() || '';
      const namespace = policy.metadata?.namespace?.toLowerCase() || '';
      const labels = policy.metadata?.labels || {};
      const annotations = policy.metadata?.annotations || {};
      const policyTypes = policy.spec?.policyTypes?.join(' ').toLowerCase() || '';

      // Check if pod selector matches
      const podSelectorLabels = policy.spec?.podSelector?.matchLabels || {};
      const podSelectorMatch = Object.entries(podSelectorLabels).some(
        ([key, value]) =>
          key.toLowerCase().includes(lowercaseQuery) ||
          (typeof value === 'string' && value.toLowerCase().includes(lowercaseQuery))
      );

      // Check if any ingress rule contains the query
      const ingressRuleMatch = (policy.spec?.ingress || []).some(rule => {
        // Check ports
        const portMatch = (rule.ports || []).some(port => {
          const portStr = port.port?.toString().toLowerCase() || '';
          const protocol = port.protocol?.toLowerCase() || '';
          return portStr.includes(lowercaseQuery) || protocol.includes(lowercaseQuery);
        });

        // Check from selectors
        const fromMatch = (rule.from || []).some(peer => {
          // Check IP blocks
          if (peer.ipBlock?.cidr.toLowerCase().includes(lowercaseQuery)) {
            return true;
          }

          // Check namespace selector
          const nsLabels = peer.namespaceSelector?.matchLabels || {};
          if (Object.entries(nsLabels).some(
            ([key, value]) =>
              key.toLowerCase().includes(lowercaseQuery) ||
              (typeof value === 'string' && value.toLowerCase().includes(lowercaseQuery))
          )) {
            return true;
          }

          // Check pod selector
          const podLabels = peer.podSelector?.matchLabels || {};
          if (Object.entries(podLabels).some(
            ([key, value]) =>
              key.toLowerCase().includes(lowercaseQuery) ||
              (typeof value === 'string' && value.toLowerCase().includes(lowercaseQuery))
          )) {
            return true;
          }

          return false;
        });

        return portMatch || fromMatch;
      });

      // Check if any egress rule contains the query
      const egressRuleMatch = (policy.spec?.egress || []).some(rule => {
        // Check ports
        const portMatch = (rule.ports || []).some(port => {
          const portStr = port.port?.toString().toLowerCase() || '';
          const protocol = port.protocol?.toLowerCase() || '';
          return portStr.includes(lowercaseQuery) || protocol.includes(lowercaseQuery);
        });

        // Check to selectors
        const toMatch = (rule.to || []).some(peer => {
          // Check IP blocks
          if (peer.ipBlock?.cidr.toLowerCase().includes(lowercaseQuery)) {
            return true;
          }

          // Check namespace selector
          const nsLabels = peer.namespaceSelector?.matchLabels || {};
          if (Object.entries(nsLabels).some(
            ([key, value]) =>
              key.toLowerCase().includes(lowercaseQuery) ||
              (typeof value === 'string' && value.toLowerCase().includes(lowercaseQuery))
          )) {
            return true;
          }

          // Check pod selector
          const podLabels = peer.podSelector?.matchLabels || {};
          if (Object.entries(podLabels).some(
            ([key, value]) =>
              key.toLowerCase().includes(lowercaseQuery) ||
              (typeof value === 'string' && value.toLowerCase().includes(lowercaseQuery))
          )) {
            return true;
          }

          return false;
        });

        return portMatch || toMatch;
      });

      // Check if name, namespace, policy types, or any matched fields contains the query
      if (
        name.includes(lowercaseQuery) ||
        namespace.includes(lowercaseQuery) ||
        policyTypes.includes(lowercaseQuery) ||
        podSelectorMatch ||
        ingressRuleMatch ||
        egressRuleMatch
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
  }, [networkPolicies, searchQuery]);

  // Sort network policies based on sort state
  const sortedNetworkPolicies = useMemo(() => {
    if (!sort.field || !sort.direction) {
      return filteredNetworkPolicies;
    }

    return [...filteredNetworkPolicies].sort((a, b) => {
      const sortMultiplier = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'name':
          return (a.metadata?.name || '').localeCompare(b.metadata?.name || '') * sortMultiplier;

        case 'namespace':
          return (a.metadata?.namespace || '').localeCompare(b.metadata?.namespace || '') * sortMultiplier;

        case 'podSelector': {
          // Count the number of pod selector rules
          const countSelectorRules = (policy: V1NetworkPolicy): number => {
            const matchLabelsCount = Object.keys(policy.spec?.podSelector?.matchLabels || {}).length;
            const matchExpressionsCount = policy.spec?.podSelector?.matchExpressions?.length || 0;
            return matchLabelsCount + matchExpressionsCount;
          };

          const rulesA = countSelectorRules(a);
          const rulesB = countSelectorRules(b);

          return (rulesA - rulesB) * sortMultiplier;
        }

        case 'policyTypes': {
          const typesA = a.spec?.policyTypes || [];
          const typesB = b.spec?.policyTypes || [];

          // First compare by number of policy types
          if (typesA.length !== typesB.length) {
            return (typesA.length - typesB.length) * sortMultiplier;
          }

          // Then compare by the types themselves
          // Sort order: both types > Egress only > Ingress only > none
          const hasIngressA = typesA.includes('Ingress');
          const hasEgressA = typesA.includes('Egress');
          const hasIngressB = typesB.includes('Ingress');
          const hasEgressB = typesB.includes('Egress');

          const scoreA = (hasIngressA ? 1 : 0) + (hasEgressA ? 2 : 0);
          const scoreB = (hasIngressB ? 1 : 0) + (hasEgressB ? 2 : 0);

          return (scoreA - scoreB) * sortMultiplier;
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
  }, [filteredNetworkPolicies, sort.field, sort.direction]);

  const handleNetworkPolicyDetails = (policy: V1NetworkPolicy) => {
    if (policy.metadata?.name && policy.metadata?.namespace) {
      navigate(`/dashboard/explore/networkpolicies/${policy.metadata.namespace}/${policy.metadata.name}`);
    }
  };

  // Format pod selector for display
  const formatPodSelector = (policy: V1NetworkPolicy): JSX.Element | string => {
    const podSelector = policy.spec?.podSelector;

    if (!podSelector) {
      return 'None';
    }

    const matchLabels = podSelector.matchLabels || {};
    const matchExpressions = podSelector.matchExpressions || [];

    // If empty selector (matches all pods)
    if (Object.keys(matchLabels).length === 0 && matchExpressions.length === 0) {
      return (
        <span className="text-amber-600 dark:text-amber-400 font-medium">
          All Pods
        </span>
      );
    }

    return (
      <div className="space-y-1">
        {Object.keys(matchLabels).length > 0 && (
          <div className="text-sm">
            <span className="font-medium">Match Labels:</span>
            <div className="pl-2">
              {Object.entries(matchLabels).map(([key, value], index) => (
                <div key={index} className="text-xs">
                  {key}: {value}
                </div>
              ))}
            </div>
          </div>
        )}

        {matchExpressions.length > 0 && (
          <div className="text-sm">
            <span className="font-medium">Match Expressions:</span>
            <div className="pl-2">
              {matchExpressions.map((expr, index) => (
                <div key={index} className="text-xs">
                  {expr.key} {expr.operator} {expr.values?.join(', ')}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Format rules summary for display
  const formatRulesSummary = (policy: V1NetworkPolicy): JSX.Element => {
    const policyTypes = policy.spec?.policyTypes || [];
    const ingressRules = policy.spec?.ingress || [];
    const egressRules = policy.spec?.egress || [];

    const hasIngress = policyTypes.includes('Ingress');
    const hasEgress = policyTypes.includes('Egress');

    // Default deny all if type is specified but no rules
    const isIngressDenyAll = hasIngress && ingressRules.length === 0;
    const isEgressDenyAll = hasEgress && egressRules.length === 0;

    // Allow all if rule exists with no from/to
    const isIngressAllowAll = ingressRules.some(rule =>
      (!rule.from || rule.from.length === 0)
    );

    const isEgressAllowAll = egressRules.some(rule =>
      (!rule.to || rule.to.length === 0)
    );

    return (
      <div className="space-y-2">
        {hasIngress && (
          <div>
            <span className="font-medium">Ingress:</span>{' '}
            {isIngressDenyAll ? (
              <span className="text-red-600 dark:text-red-400">Deny All</span>
            ) : isIngressAllowAll ? (
              <span className="text-green-600 dark:text-green-400">Allow All</span>
            ) : (
              <span>{ingressRules.length} rule(s)</span>
            )}
          </div>
        )}

        {hasEgress && (
          <div>
            <span className="font-medium">Egress:</span>{' '}
            {isEgressDenyAll ? (
              <span className="text-red-600 dark:text-red-400">Deny All</span>
            ) : isEgressAllowAll ? (
              <span className="text-green-600 dark:text-green-400">Allow All</span>
            ) : (
              <span>{egressRules.length} rule(s)</span>
            )}
          </div>
        )}

        {!hasIngress && !hasEgress && (
          <span className="text-gray-500 dark:text-gray-400">No policy types defined</span>
        )}
      </div>
    );
  };

  // Get policy types badge class
  const getPolicyTypesBadgeClass = (type: string): string => {
    switch (type) {
      case 'Ingress':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300';
      case 'Egress':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
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
          <h1 className='text-5xl font-[Anton] uppercase font-bold text-gray-800/30 dark:text-gray-700/50'>Network Policies</h1>
          <div className="w-full md:w-96 mt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
              <Input
                type="text"
                placeholder="Search by name, namespace, selector, or rule..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </div>

        <div className="flex items-end gap-2">
          <div className="w-full md:w-96">
            <div className="text-sm font-medium mb-2">Namespaces</div>
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

      {/* No results message */}
      {sortedNetworkPolicies.length === 0 && (
        <Alert className="my-6 bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <AlertDescription>
            {searchQuery
              ? `No network policies matching "${searchQuery}"`
              : selectedNamespaces.length === 0
                ? "Please select at least one namespace"
                : "No network policies found in the selected namespaces"}
          </AlertDescription>
        </Alert>
      )}

      {/* NetworkPolicies table */}
      {sortedNetworkPolicies.length > 0 && (
        <Card className="bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <div className="rounded-md border">
            {renderContextMenu()}
            {renderDeleteDialog()}
            <Table className="bg-gray-50 dark:bg-transparent rounded-2xl">
              <TableHeader>
                <TableRow className="border-b border-gray-400 dark:border-gray-800/80">
                  {isColumnVisible('name') && (
                    <TableHead
                      className="cursor-pointer hover:text-blue-500"
                      onClick={() => handleSort('name')}
                    >
                      Name {renderSortIndicator('name')}
                    </TableHead>
                  )}
                  {isColumnVisible('namespace') && (
                    <TableHead
                      className="cursor-pointer hover:text-blue-500"
                      onClick={() => handleSort('namespace')}
                    >
                      Namespace {renderSortIndicator('namespace')}
                    </TableHead>
                  )}
                  {isColumnVisible('podSelector') && (
                    <TableHead
                      className="cursor-pointer hover:text-blue-500"
                      onClick={() => handleSort('podSelector')}
                    >
                      Pod Selector {renderSortIndicator('podSelector')}
                    </TableHead>
                  )}
                  {isColumnVisible('policyTypes') && (
                    <TableHead
                      className="text-center cursor-pointer hover:text-blue-500"
                      onClick={() => handleSort('policyTypes')}
                    >
                      Policy Types {renderSortIndicator('policyTypes')}
                    </TableHead>
                  )}
                  {isColumnVisible('rules') && (
                    <TableHead>
                      Rules Summary
                    </TableHead>
                  )}
                  {isColumnVisible('age') && (
                    <TableHead
                      className="text-center cursor-pointer hover:text-blue-500"
                      onClick={() => handleSort('age')}
                    >
                      Age {renderSortIndicator('age')}
                    </TableHead>
                  )}
                  {isColumnVisible('actions') && (
                    <TableHead className="w-[50px]"></TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedNetworkPolicies.map((policy) => (
                  <TableRow
                    key={`${policy.metadata?.namespace}-${policy.metadata?.name}`}
                    className={`bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30 ${policy.metadata?.namespace && policy.metadata?.name &&
                      selectedPolicies.has(`${policy.metadata.namespace}/${policy.metadata.name}`)
                      ? 'bg-blue-50 dark:bg-gray-800/30'
                      : ''
                      }`}
                    onClick={(e) => handlePolicyClick(e, policy)}
                    onContextMenu={(e) => handleContextMenu(e, policy)}
                  >
                    {isColumnVisible('name') && (
                      <TableCell className="font-medium" onClick={() => handleNetworkPolicyDetails(policy)}>
                        <div className="hover:text-blue-500 hover:underline">
                          {policy.metadata?.name}
                        </div>
                      </TableCell>
                    )}
                    {isColumnVisible('namespace') && (
                      <TableCell>
                        <div className="hover:text-blue-500 hover:underline" onClick={() => navigate(`/dashboard/explore/namespaces`)}>
                          {policy.metadata?.namespace}
                        </div>
                      </TableCell>
                    )}
                    {isColumnVisible('podSelector') && (
                      <TableCell>
                        {formatPodSelector(policy)}
                      </TableCell>
                    )}
                    {isColumnVisible('policyTypes') && (
                      <TableCell className="text-center">
                        <div className="flex flex-wrap justify-center gap-1">
                          {(policy.spec?.policyTypes || []).map((type, index) => (
                            <span
                              key={index}
                              className={`px-2 py-1 rounded-[0.3rem] text-xs font-medium ${getPolicyTypesBadgeClass(type)}`}
                            >
                              {type}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                    )}
                    {isColumnVisible('rules') && (
                      <TableCell>
                        {formatRulesSummary(policy)}
                      </TableCell>
                    )}
                    {isColumnVisible('age') && (
                      <TableCell className="text-center">
                        {calculateAge(policy.metadata?.creationTimestamp?.toString())}
                      </TableCell>
                    )}
                    {isColumnVisible('actions') && (
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
                            handleAskAI(policy);
                          }} className='hover:text-gray-700 dark:hover:text-gray-500'>
                            <Sparkles className="mr-2 h-4 w-4" />
                            Ask AI
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => handleViewNetworkPolicy(e, policy)} className='hover:text-gray-700 dark:hover:text-gray-500'>
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-500 dark:text-red-400 focus:text-red-500 dark:focus:text-red-400 hover:text-red-700 dark:hover:text-red-500"
                            onClick={(e) => handleDeleteNetworkPolicyMenuItem(e, policy)}
                          >
                            <Trash className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Filter Sidebar */}
      <ResourceFilterSidebar
        isOpen={showFilterSidebar}
        onClose={() => setShowFilterSidebar(false)}
        title="NetworkPolicies Table"
        columns={columnConfig}
        onColumnToggle={handleColumnToggle}
        onResetToDefault={handleResetToDefault}
        resourceType="networkpolicies"
      />
    </div>
  );
};

export default NetworkPolicies;