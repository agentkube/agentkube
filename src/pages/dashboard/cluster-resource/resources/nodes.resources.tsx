import React, { useState, useEffect, useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MoreVertical, Loader2, Search, ArrowUpDown, ArrowUp, ArrowDown, Eye, Trash, Server, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getNodes } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';
import { useNavigate } from 'react-router-dom';
import { V1Node, V1Taint, V1NodeCondition } from '@kubernetes/client-node';
import { ErrorComponent, ResourceFilterSidebar, type ColumnConfig } from '@/components/custom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { OPERATOR_URL } from '@/config';
import { useDrawer } from '@/contexts/useDrawer';
import { resourceToEnrichedSearchResult } from '@/utils/resource-to-enriched.utils';
import { toast } from '@/hooks/use-toast';
import { Filter } from 'lucide-react';
import { getStoredColumnConfig, saveColumnConfig, clearColumnConfig } from '@/utils/columnConfigStorage';

interface UnitToggleProps {
  activeUnit: 'MiB' | 'GiB';
  onUnitChange: (unit: 'MiB' | 'GiB') => void;
}

type SortDirection = 'asc' | 'desc' | null;
type SortField = 'name' | 'role' | 'version' | 'cpu' | 'memory' | 'disk' | 'taints' | 'conditions' | 'age' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

// Default column configuration
const defaultColumnConfig: ColumnConfig[] = [
  { key: 'name', label: 'Name', visible: true, canToggle: false },
  { key: 'cpu', label: 'CPU', visible: true, canToggle: true },
  { key: 'memory', label: 'Memory', visible: true, canToggle: true },
  { key: 'disk', label: 'Disk', visible: true, canToggle: true },
  { key: 'taints', label: 'Taints', visible: true, canToggle: true },
  { key: 'roles', label: 'Roles', visible: true, canToggle: true },
  { key: 'version', label: 'Version', visible: true, canToggle: true },
  { key: 'age', label: 'Age', visible: true, canToggle: true },
  { key: 'conditions', label: 'Conditions', visible: true, canToggle: true },
  { key: 'actions', label: 'Actions', visible: true, canToggle: false }
];


const UnitToggle: React.FC<UnitToggleProps> = ({ activeUnit, onUnitChange }) => (
  <div className="flex gap-1 px-1 bg-gray-200 dark:bg-transparent rounded-lg">
    <button
      className={`px-2 py-1 text-xs rounded-md ${activeUnit === 'MiB'
        ? 'bg-white shadow-sm dark:bg-gray-800/30'
        : 'text-gray-600 hover:bg-gray-300 dark:text-gray-400 dark:hover:bg-gray-800/30'}`}
      onClick={() => onUnitChange('MiB')}
    >
      MiB
    </button>
    <button
      className={`px-2 py-1 text-xs rounded-md ${activeUnit === 'GiB'
        ? 'bg-white shadow-sm dark:bg-gray-800/30'
        : 'text-gray-600 hover:bg-gray-300 dark:text-gray-400 dark:hover:bg-gray-800/30'}`}
      onClick={() => onUnitChange('GiB')}
    >
      GiB
    </button>
  </div>
);

// Parse CPU string (handles 'm' suffix for millicores and 'n' suffix for nanocores)
const parseCpuValue = (cpuStr: string): number => {
  if (cpuStr.endsWith('m')) {
    return parseFloat(cpuStr.slice(0, -1)) / 1000;
  } else if (cpuStr.endsWith('n')) {
    return parseFloat(cpuStr.slice(0, -1)) / 1000000000;
  }
  return parseFloat(cpuStr);
};

// Convert Ki to Mi or Gi
const convertUnit = (valueInKi: string, toUnit: 'MiB' | 'GiB'): string => {
  const numericValue = parseInt(valueInKi.replace('Ki', ''));
  if (toUnit === 'MiB') {
    return `${(numericValue / 1024).toFixed(2)} MiB`;
  } else {
    return `${(numericValue / 1024 / 1024).toFixed(2)} GiB`;
  }
};

// Calculate node age in human readable format
const calculateAge = (creationTimestamp: string | undefined): string => {
  if (!creationTimestamp) return 'N/A';

  const created = new Date(creationTimestamp);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days > 0) return `${days}d`;

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours > 0) return `${hours}h`;

  const minutes = Math.floor(diffMs / (1000 * 60));
  return `${minutes}m`;
};

// Interface for node metrics
interface NodeMetrics {
  name: string;
  cpuUsage: string;
  cpuUsagePercentage: number;
  cpuConsumed: number; // Added for consumed CPU cores
  memoryUsage: string;
  memoryUsageKi: number;
  memoryUsagePercentage: number;
  memoryConsumed: number; // Added for consumed memory
  timestamp: string;
}

// Enhanced node info with additional properties for UI display
interface EnhancedNodeInfo {
  name: string;
  roles: string[];
  version: string;
  cpu: string;
  cpuCores: number;
  memory: string;
  memoryKi: number;
  disk: string;
  taints: V1Taint[];
  conditions: V1NodeCondition[];
  age: string;
  metrics?: NodeMetrics;
  raw: any; // Keep the raw node data for reference
}

const Nodes: React.FC = () => {
  const navigate = useNavigate();
  const [selectedNodeIndex, setSelectedNodeIndex] = useState(0);
  const [nodes, setNodes] = useState<EnhancedNodeInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [memoryUnit, setMemoryUnit] = useState<'MiB' | 'GiB'>('GiB');
  const [diskUnit, setDiskUnit] = useState<'MiB' | 'GiB'>('GiB');
  const { currentContext, isMetricsServerInstalled } = useCluster();
  const { addResourceContext } = useDrawer();
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sort, setSort] = useState<SortState>({
    field: null,
    direction: null
  });

  // Column visibility state
  const [showFilterSidebar, setShowFilterSidebar] = useState(false);
  const [columnConfig, setColumnConfig] = useState<ColumnConfig[]>(() =>
    getStoredColumnConfig('nodes', defaultColumnConfig)
  );


  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Cmd+F (Mac) or Ctrl+F (Windows)
      if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault(); // Prevent browser's default find behavior

        // Find the search input and focus it
        const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) {
      return nodes;
    }

    const lowercaseQuery = searchQuery.toLowerCase();

    return nodes.filter(node => {
      const name = node.name.toLowerCase();
      const version = node.version.toLowerCase();
      const role = node.roles.join(',').toLowerCase();
      const labels = node.raw.metadata?.labels || {};
      const annotations = node.raw.metadata?.annotations || {};

      // Check if any condition matches the query
      const conditionMatches = node.conditions.some(condition => {
        const type = condition.type.toLowerCase();
        const status = condition.status.toLowerCase();
        const reason = condition.reason?.toLowerCase() || '';

        return type.includes(lowercaseQuery) ||
          status.includes(lowercaseQuery) ||
          reason.includes(lowercaseQuery);
      });

      // Check if any taint matches the query
      const taintMatches = node.taints.some(taint => {
        const key = taint.key?.toLowerCase() || '';
        const effect = taint.effect?.toLowerCase() || '';

        return key.includes(lowercaseQuery) || effect.includes(lowercaseQuery);
      });

      // Check if name, version, or role contains the query
      if (
        name.includes(lowercaseQuery) ||
        version.includes(lowercaseQuery) ||
        role.includes(lowercaseQuery) ||
        conditionMatches ||
        taintMatches
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
  }, [nodes, searchQuery]);

  const sortedNodes = useMemo(() => {
    if (!sort.field || !sort.direction) {
      return filteredNodes;
    }

    return [...filteredNodes].sort((a, b) => {
      const sortMultiplier = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'name':
          return a.name.localeCompare(b.name) * sortMultiplier;

        case 'role': {
          const roleA = a.roles.includes('master') ? 'master' : 'worker';
          const roleB = b.roles.includes('master') ? 'master' : 'worker';
          return roleA.localeCompare(roleB) * sortMultiplier;
        }

        case 'version':
          return a.version.localeCompare(b.version) * sortMultiplier;

        case 'cpu':
          return (a.cpuCores - b.cpuCores) * sortMultiplier;

        case 'memory':
          return (a.memoryKi - b.memoryKi) * sortMultiplier;

        case 'disk': {
          const diskA = parseInt(a.disk.replace('Ki', ''));
          const diskB = parseInt(b.disk.replace('Ki', ''));
          return (diskA - diskB) * sortMultiplier;
        }

        case 'taints':
          return (a.taints.length - b.taints.length) * sortMultiplier;

        case 'conditions': {
          // Sort by "Ready" condition status
          const getReadyStatus = (node: EnhancedNodeInfo): string => {
            const readyCondition = node.conditions.find(c => c.type === 'Ready');
            return readyCondition?.status || 'Unknown';
          };

          const statusA = getReadyStatus(a);
          const statusB = getReadyStatus(b);

          // True before False before Unknown
          if (statusA === statusB) return 0;
          if (statusA === 'True') return -1 * sortMultiplier;
          if (statusB === 'True') return 1 * sortMultiplier;
          if (statusA === 'False') return -1 * sortMultiplier;
          if (statusB === 'False') return 1 * sortMultiplier;
          return 0;
        }

        case 'age': {
          const creationA = a.raw.metadata?.creationTimestamp ? new Date(a.raw.metadata.creationTimestamp).getTime() : 0;
          const creationB = b.raw.metadata?.creationTimestamp ? new Date(b.raw.metadata.creationTimestamp).getTime() : 0;
          return (creationA - creationB) * sortMultiplier;
        }

        default:
          return 0;
      }
    });
  }, [filteredNodes, sort.field, sort.direction]);

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


  // Function to fetch metrics and update nodes
  const fetchNodeMetrics = async () => {
    if (!currentContext || !isMetricsServerInstalled) return;

    try {
      setRefreshing(true);

      const response = await fetch(`${OPERATOR_URL}/clusters/${currentContext.name}/apis/metrics.k8s.io/v1beta1/nodes`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get metrics: ${response.statusText}`);
      }

      const data = await response.json();
      const metricsData = data.items || [];

      // Map metrics by node name for easy lookup
      const metricsMap = new Map<string, NodeMetrics>();

      for (const metric of metricsData) {
        const name = metric.metadata?.name;
        if (name) {
          metricsMap.set(name, {
            name,
            cpuUsage: metric.usage?.cpu || '0',
            cpuUsagePercentage: 0, // Will calculate after mapping to nodes
            cpuConsumed: 0, // Will calculate after mapping to nodes
            memoryUsage: metric.usage?.memory || '0Ki',
            memoryUsageKi: parseInt((metric.usage?.memory || '0Ki').replace('Ki', '')),
            memoryUsagePercentage: 0, // Will calculate after mapping to nodes
            memoryConsumed: 0, // Will calculate after mapping to nodes
            timestamp: metric.timestamp || ''
          });
        }
      }

      // Update nodes with metrics
      setNodes(prevNodes => {
        return prevNodes.map(node => {
          const nodeMetrics = metricsMap.get(node.name);
          if (nodeMetrics) {
            // Calculate percentages
            nodeMetrics.cpuUsagePercentage =
              (parseCpuValue(nodeMetrics.cpuUsage) / node.cpuCores) * 100;

            // Calculate consumed CPU cores
            nodeMetrics.cpuConsumed =
              (nodeMetrics.cpuUsagePercentage / 100) * node.cpuCores;

            nodeMetrics.memoryUsagePercentage =
              (nodeMetrics.memoryUsageKi / node.memoryKi) * 100;

            // Calculate consumed memory
            nodeMetrics.memoryConsumed =
              (nodeMetrics.memoryUsagePercentage / 100) * node.memoryKi;

            return { ...node, metrics: nodeMetrics };
          }
          return node;
        });
      });

    } catch (err) {
      console.error('Error fetching node metrics:', err);
    } finally {
      setRefreshing(false);
    }
  };

  // Fetch nodes initially
  useEffect(() => {
    const fetchNodes = async () => {
      if (!currentContext) {
        setError('No cluster context available');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const nodeList = await getNodes(currentContext.name);

        const enhancedNodes: EnhancedNodeInfo[] = nodeList.map((node: any) => {
          // Extract CPU, memory and storage capacity
          const capacity = node.status?.capacity || {};
          const cpu = capacity.cpu || "0";
          const cpuCores = parseInt(cpu);
          const memory = capacity.memory || "0Ki";
          const memoryKi = parseInt(memory.replace('Ki', ''));
          const disk = capacity['ephemeral-storage'] || "0Ki";

          // Extract node roles from labels
          const labels = node.metadata?.labels || {};
          const roles: string[] = [];

          if (labels['node-role.kubernetes.io/control-plane'] === '' ||
            labels['node-role.kubernetes.io/master'] === '') {
            roles.push('master');
          } else {
            roles.push('worker');
          }

          // Extract taints
          const taints = node.spec?.taints || [];

          // Extract conditions
          const conditions = node.status?.conditions || [];

          return {
            name: node.metadata?.name || 'unknown',
            roles,
            version: node.status?.nodeInfo?.kubeletVersion || 'unknown',
            cpu,
            cpuCores,
            memory,
            memoryKi,
            disk,
            taints,
            conditions,
            age: calculateAge(node.metadata?.creationTimestamp),
            raw: node
          };
        });

        setNodes(enhancedNodes);
        setError(null);

        // Fetch initial metrics after nodes are loaded (only if metrics server is installed)
        if (isMetricsServerInstalled) {
          await fetchNodeMetrics();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch nodes');
        console.error('Error fetching nodes:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchNodes();
  }, [currentContext]);

  // Set up metrics refresh interval
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (nodes.length > 0 && isMetricsServerInstalled) {
        fetchNodeMetrics();
      }
    }, 10000); // Refresh every 10 seconds

    return () => clearInterval(intervalId);
  }, [nodes, currentContext, isMetricsServerInstalled]);

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

  if (nodes.length === 0) {
    return (
      <Alert className="m-6 bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
        <AlertDescription>No nodes available</AlertDescription>
      </Alert>
    );
  }

  const selectedNode = nodes[selectedNodeIndex];

  const handleRowClick = (node: EnhancedNodeInfo, index: number) => {
    setSelectedNodeIndex(index);
  };

  const handleNodeDetails = (node: EnhancedNodeInfo) => {
    navigate(`/dashboard/explore/nodes/${node.name}`);
  };

  const handleAskAI = (node: EnhancedNodeInfo) => {
    try {
      // Convert node to EnrichedSearchResult format
      const resourceContext = resourceToEnrichedSearchResult(
        node.raw,
        'nodes',
        false, // not namespaced (cluster-scoped)
        '',
        'v1'
      );

      // Add to chat context and open drawer
      addResourceContext(resourceContext);

      // Show success toast
      toast({
        title: "Added to Chat",
        description: `Node "${node.name}" has been added to chat context`
      });
    } catch (error) {
      console.error('Error adding node to chat:', error);
      toast({
        title: "Error",
        description: "Failed to add node to chat context",
        variant: "destructive"
      });
    }
  };

  const getDisplayValue = (value: string, type: 'memory' | 'disk') => {
    const unit = type === 'memory' ? memoryUnit : diskUnit;
    return convertUnit(value.endsWith('Ki') ? value : value + 'Ki', unit);
  };

  // Column management functions
  const handleColumnToggle = (columnKey: string, visible: boolean) => {
    const updated = columnConfig.map(col =>
      col.key === columnKey ? { ...col, visible } : col
    );
    setColumnConfig(updated);
    saveColumnConfig('nodes', updated);
  };

  const handleColumnReorder = (reorderedColumns: ColumnConfig[]) => {
    setColumnConfig(reorderedColumns);
    // Save to localStorage
    saveColumnConfig('nodes', reorderedColumns);
  };

  const handleResetToDefault = () => {
    const resetConfig = defaultColumnConfig.map(col => ({ ...col, visible: true }));
    setColumnConfig(resetConfig);
    clearColumnConfig('nodes');
  };

  const isColumnVisible = (columnKey: string) => {
    const column = columnConfig.find(col => col.key === columnKey);
    return column?.visible ?? true;
  };

  // Helper function to render table header based on column key
  const renderTableHeader = (column: ColumnConfig) => {
    if (!column.visible || column.key === 'actions') {
      return null;
    }

    const sortFieldMap: Record<string, SortField> = {
      name: 'name',
      cpu: 'cpu',
      memory: 'memory',
      disk: 'disk',
      taints: 'taints',
      roles: 'role',
      version: 'version',
      age: 'age',
      conditions: 'conditions'
    };

    const sortField = sortFieldMap[column.key];

    return (
      <TableHead
        key={column.key}
        className="cursor-pointer hover:text-blue-500"
        onClick={() => sortField && handleSort(sortField)}
      >
        {column.label} {sortField && renderSortIndicator(sortField)}
      </TableHead>
    );
  };

  // Helper function to render table cell based on column key
  const renderTableCell = (node: EnhancedNodeInfo, column: ColumnConfig) => {
    if (!column.visible || column.key === 'actions') {
      return null;
    }

    switch (column.key) {
      case 'name':
        return (
          <TableCell key={column.key} className="font-medium">
            <div className='hover:text-blue-500 hover:underline' onClick={(e) => {
              e.stopPropagation();
              handleNodeDetails(node);
            }}>
              {node.name}
            </div>
          </TableCell>
        );

      case 'cpu':
        return (
          <TableCell key={column.key} className="text-center">
            <div className="flex flex-col items-center">
              {node.metrics && (
                <span className="text-gray-600 dark:text-blue-500">
                  <span className='text-gray-800 dark:text-gray-500'>
                    {node.metrics.cpuConsumed.toFixed(2)}{" "} / <span className='text-gray-800 dark:text-white'>{node.cpu}</span><br />
                  </span>
                  <span className='text-xs'>
                    ({node.metrics.cpuUsagePercentage.toFixed(1)}%)
                  </span>
                </span>
              )}
              {!node.metrics && (<>{node.cpu}</>)}
            </div>
          </TableCell>
        );

      case 'memory':
        return (
          <TableCell key={column.key} className="text-center">
            <div className="flex flex-col items-center">
              <span>{getDisplayValue(node.memory, 'memory')}</span>
              {node.metrics && (
                <span className="gap-2 text-xs text-gray-600 dark:text-green-400">
                  <span className='text-gray-800 dark:text-gray-500'>
                    {convertUnit(node.metrics.memoryConsumed.toString() + 'Ki', memoryUnit)}{" "}
                  </span>
                  ({node.metrics.memoryUsagePercentage.toFixed(1)}%)
                </span>
              )}
            </div>
          </TableCell>
        );

      case 'disk':
        return (
          <TableCell key={column.key} className="text-center">
            {getDisplayValue(node.disk, 'disk')}
          </TableCell>
        );

      case 'taints':
        return (
          <TableCell key={column.key} className="text-center">
            {node.taints.length}
          </TableCell>
        );

      case 'roles':
        return (
          <TableCell key={column.key}>
            {node.roles.includes("master") ?
              <span className="px-2 py-1 rounded-[0.3rem]  text-xs font-medium bg-red-500/30 dark:bg-red-800/20 text-red-800 dark:text-red-400">
                Control Plane
              </span> :
              <span
                className="px-2 py-1 rounded-[0.3rem] text-xs font-medium bg-yellow-400/50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-500">
                worker
              </span>
            }
          </TableCell>
        );

      case 'version':
        return (
          <TableCell key={column.key}>
            {node.version}
          </TableCell>
        );

      case 'age':
        return (
          <TableCell key={column.key}>
            {node.age}
          </TableCell>
        );

      case 'conditions':
        return (
          <TableCell key={column.key}>
            {node.conditions.map((condition: any) =>
              condition.type === 'Ready' && condition.status === 'True' && (
                <span key={condition.type} className="px-2 py-1 rounded-[0.3rem] text-xs font-medium bg-emerald-300 dark:bg-emerald-900/30 text-green-800 dark:text-green-300">
                  {condition.type}
                </span>
              )
            )}
          </TableCell>
        );

      default:
        return null;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className='flex items-center justify-between md:flex-row gap-4 md:items-end'>
        <div>
          <h1 className='text-5xl font-[Anton] uppercase text-foreground/20 font-medium'>Nodes</h1>
          <div className="w-full md:w-96 mt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
              <Input
                type="text"
                placeholder="Search by name, role, label, condition..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </div>

        <div className="flex items-end gap-2">
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

      {/* Resource Information Cards */}
      <div className="grid grid-cols-3 gap-1">
        <Card className="bg-transparent rounded-md border border-accent/40 shadow-none min-h-44">
          <CardContent className="py-2 flex flex-col h-full">
            <h2 className="text-sm uppercase font-medium text-gray-800 dark:text-gray-500 mb-auto">CPU</h2>
            <div className="mt-auto">
              <div className="flex items-baseline gap-2">
                <p className="text-5xl font-light text-blue-600 dark:text-blue-400 mb-1">{selectedNode.cpuCores}</p>
                {selectedNode.metrics && (
                  <div>
                    <p className="text-sm text-blue-800 dark:text-blue-400">
                      {selectedNode.metrics.cpuConsumed.toFixed(2)} ({selectedNode.metrics.cpuUsagePercentage.toFixed(1)}%)
                    </p>
                  </div>
                )}
              </div>
              <div className="w-full h-1 bg-accent/40 rounded-[0.3rem] mt-1">
                {selectedNode.metrics && (
                  <div
                    className="h-1 bg-blue-500 dark:bg-blue-400 rounded-[0.3rem]"
                    style={{ width: `${Math.min(selectedNode.metrics.cpuUsagePercentage, 100)}%` }}
                  ></div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-transparent rounded-md border border-accent/40 shadow-none min-h-44">
          <CardContent className="py-2 flex flex-col h-full">
            <div className="flex items-center justify-between gap-2 mb-auto">
              <h2 className="text-sm font-medium text-gray-800 dark:text-gray-500 uppercase">Memory</h2>
              <UnitToggle activeUnit={memoryUnit} onUnitChange={setMemoryUnit} />
            </div>
            <div className="mt-auto">
              <div className="flex items-baseline gap-2">
                <p className="text-5xl font-light text-purple-600 dark:text-purple-400 mb-2">
                  {getDisplayValue(selectedNode.memory, 'memory')}
                </p>
                {selectedNode.metrics && (
                  <div>
                    <p className="text-sm text-purple-800 dark:text-purple-400">
                      {convertUnit(selectedNode.metrics.memoryConsumed.toString() + 'Ki', memoryUnit)}({selectedNode.metrics.memoryUsagePercentage.toFixed(1)}%)
                    </p>
                  </div>
                )}
              </div>
              <div className="w-full h-1 bg-accent/40 rounded-[0.3rem]">
                {selectedNode.metrics && (
                  <div
                    className="h-1 bg-purple-500 dark:bg-purple-400 rounded-[0.3rem]"
                    style={{ width: `${Math.min(selectedNode.metrics.memoryUsagePercentage, 100)}%` }}
                  ></div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-transparent rounded-md border border-accent/40 shadow-none min-h-44">
          <CardContent className="py-2 flex flex-col h-full">
            <div className="flex items-center justify-between gap-2 mb-auto">
              <h2 className="text-sm font-medium text-gray-800 dark:text-gray-500 uppercase">Disk</h2>
              <UnitToggle activeUnit={diskUnit} onUnitChange={setDiskUnit} />
            </div>
            <div className="mt-auto">
              <p className="text-5xl font-light text-gray-600 dark:text-gray-400 mb-1">
                {getDisplayValue(selectedNode.disk, 'disk')}
              </p>
              <p className="flex item-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                <Server className='h-3 w-3' /> <span> {selectedNode.name}</span>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Nodes Table */}
      <Card className="bg-transparent border-accent/40 rounded-2xl shadow-none">
        <div className="rounded-md border">
          <Table className="bg-transparent rounded-2xl">
            <TableHeader>
              <TableRow className="border-b border-accent dark:border-accent/80">
                {columnConfig.map(col => renderTableHeader(col))}
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedNodes.map((node, index) => (
                <TableRow
                  key={node.name}
                  className={`bg-transparent border-b border-accent dark:border-accent/80 hover:cursor-pointer hover:bg-accent/20 ${selectedNodeIndex === index ? 'bg-accent/30' : ''}`}
                  onClick={() => handleRowClick(node, index)}
                >
                  {columnConfig.map(col => renderTableCell(node, col))}
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
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          handleAskAI(node);
                        }} className='hover:text-gray-700 dark:hover:text-gray-500'>
                          <Sparkles className="mr-2 h-4 w-4" />
                          Ask AI
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleNodeDetails(node)} className='hover:text-gray-700 dark:hover:text-gray-500'>
                          <Eye className="mr-2 h-4 w-4" />
                          View
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {filteredNodes.length === 0 && searchQuery && (
            <Alert className="m-6 bg-transparent border-accent/40 rounded-2xl shadow-none">
              <AlertDescription>No nodes matching "{searchQuery}"</AlertDescription>
            </Alert>
          )}
        </div>
      </Card>

      {/* Resource Filter Sidebar */}
      <ResourceFilterSidebar
        isOpen={showFilterSidebar}
        onClose={() => setShowFilterSidebar(false)}
        title="Nodes Table"
        columns={columnConfig}
        onColumnToggle={handleColumnToggle}
        onColumnReorder={handleColumnReorder}
        onResetToDefault={handleResetToDefault}
        resourceType="nodes"
        className="w-1/3"
      />
    </div>
  );
};

export default Nodes;