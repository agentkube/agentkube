import React, { useEffect, useState, useMemo } from 'react';
import { useCluster } from '@/contexts/clusterContext';
import { kubeProxyRequest } from '@/api/cluster';
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Cpu, Database, HardDrive, Network, AlertCircle, Loader2, Gauge, Search, ArrowUpDown, ArrowUp, ArrowDown, MoreVertical, Sparkles } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { get, forEach, round, sortBy } from 'lodash';
import { AggregatedNodeCost, OpenCostAllocationResponse } from '@/types/opencost';
import { useDrawer } from '@/contexts/useDrawer';
import { toast } from '@/hooks/use-toast';

interface NodeCostDistributionProps {
  timeRange: string;
  onReload: () => Promise<void>;
}

// Define sorting types
type SortDirection = 'asc' | 'desc' | null;
type SortField = 'name' | 'instanceType' | 'totalCost' | 'percentage' | 'efficiency' | 'cpuCost' | 'ramCost' | 'pvCost' | 'networkCost' | 'gpuCost' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

const NodeCostDistribution: React.FC<NodeCostDistributionProps> = ({ timeRange, onReload }) => {
  const { currentContext } = useCluster();
  const { addStructuredContent } = useDrawer();
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [nodeCosts, setNodeCosts] = useState<AggregatedNodeCost[]>([]);
  const [idleCost, setIdleCost] = useState<AggregatedNodeCost | null>(null);
  const [unallocatedCost, setUnallocatedCost] = useState<AggregatedNodeCost | null>(null);
  const [clusterTotalCost, setClusterTotalCost] = useState<number>(0);
  const [openCostConfig, setOpenCostConfig] = useState({
    namespace: 'opencost',
    service: 'opencost:9090'
  });
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sort, setSort] = useState<SortState>({
    field: null,
    direction: null
  });

  useEffect(() => {
    if (!currentContext) return;

    try {
      const savedConfig = localStorage.getItem(`${currentContext.name}.openCostConfig`);
      if (savedConfig) {
        const parsedConfig = JSON.parse(savedConfig);
        if (parsedConfig.externalConfig?.opencost) {
          setOpenCostConfig(parsedConfig.externalConfig.opencost);
        }
      }
    } catch (err) {
      console.error('Error loading saved OpenCost config:', err);
    }
  }, [currentContext]);

  useEffect(() => {
    const fetchCostData = async () => {
      if (!currentContext?.name) {
        setLoading(false);
        setError("No cluster selected. Please select a cluster to view cost data.");
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const OPENCOST_NAMESPACE = openCostConfig.namespace;
        const OPENCOST_SERVICE = openCostConfig.service;

        // Build path and query parameters
        const path = `api/v1/namespaces/${OPENCOST_NAMESPACE}/services/${OPENCOST_SERVICE}/proxy/model/allocation/compute`;
        const queryParams = new URLSearchParams({
          window: timeRange,        // Last 7 days
          aggregate: 'node',   // Aggregate by node
          includeIdle: 'true', // Include idle resources
          accumulate: 'true'   // Accumulate the values (matching rangeToCumulative behavior)
        }).toString();

        const fullPath = `${path}?${queryParams}`;

        // Request cost data via kube proxy
        const response = await kubeProxyRequest(
          currentContext.name,
          fullPath,
          'GET'
        ) as OpenCostAllocationResponse;

        if (!response.data || response.data.length === 0 || !response.data[0]) {
          setError("No cost data available for the selected time period");
          setLoading(false);
          return;
        }

        // Extract the single allocation set (since we're using accumulate=true)
        const allocationSet = response.data[0];

        // Process data in similar fashion to rangeToCumulative and cumulativeToTotals functions
        let processedNodes: AggregatedNodeCost[] = [];
        let idle: AggregatedNodeCost | null = null;
        let unallocated: AggregatedNodeCost | null = null;
        let totalCost = 0;

        // Process each node in the allocation set
        forEach(allocationSet, (allocation, nodeName) => {
          const hrs = get(allocation, "minutes", 0) / 60.0;

          // Special handling for idle and unallocated costs
          if (nodeName === '__idle__') {
            idle = {
              name: 'Idle Resources',
              instanceType: 'N/A',
              totalCost: allocation.totalCost || 0,
              cpuCost: allocation.cpuCost || 0,
              ramCost: allocation.ramCost || 0,
              pvCost: allocation.pvCost || 0,
              networkCost: (allocation.networkCost || 0) +
                (allocation.networkCrossZoneCost || 0) +
                (allocation.networkCrossRegionCost || 0) +
                (allocation.networkInternetCost || 0),
              gpuCost: allocation.gpuCost || 0,
              externalCost: allocation.externalCost || 0,
              sharedCost: allocation.sharedCost || 0,
              cpuEfficiency: 0,
              ramEfficiency: 0,
              totalEfficiency: 0,
              cpuReqCoreHrs: 0,
              cpuUseCoreHrs: 0,
              ramReqByteHrs: 0,
              ramUseByteHrs: 0
            };
            return;
          }

          if (nodeName === '__unallocated__') {
            unallocated = {
              name: 'Unallocated Resources',
              instanceType: 'N/A',
              totalCost: allocation.totalCost || 0,
              cpuCost: allocation.cpuCost || 0,
              ramCost: allocation.ramCost || 0,
              pvCost: allocation.pvCost || 0,
              networkCost: (allocation.networkCost || 0) +
                (allocation.networkCrossZoneCost || 0) +
                (allocation.networkCrossRegionCost || 0) +
                (allocation.networkInternetCost || 0),
              gpuCost: allocation.gpuCost || 0,
              externalCost: allocation.externalCost || 0,
              sharedCost: allocation.sharedCost || 0,
              cpuEfficiency: allocation.cpuEfficiency || 0,
              ramEfficiency: allocation.ramEfficiency || 0,
              totalEfficiency: allocation.totalEfficiency || 0,
              cpuReqCoreHrs: get(allocation, "cpuCoreRequestAverage", 0) * hrs,
              cpuUseCoreHrs: get(allocation, "cpuCoreUsageAverage", 0) * hrs,
              ramReqByteHrs: get(allocation, "ramByteRequestAverage", 0) * hrs,
              ramUseByteHrs: get(allocation, "ramByteUsageAverage", 0) * hrs
            };
            return;
          }

          // Extract instance type if available
          const instanceType = get(allocation, 'properties.labels["node.kubernetes.io/instance-type"]', '') ||
            get(allocation, 'properties.instanceType', '') ||
            'unknown';

          // Calculate network costs by summing all network-related costs
          const networkCost = (allocation.networkCost || 0) +
            (allocation.networkCrossZoneCost || 0) +
            (allocation.networkCrossRegionCost || 0) +
            (allocation.networkInternetCost || 0);

          // Create node cost object
          const nodeCost: AggregatedNodeCost = {
            name: nodeName,
            instanceType,
            totalCost: allocation.totalCost || 0,
            cpuCost: allocation.cpuCost || 0,
            ramCost: allocation.ramCost || 0,
            pvCost: allocation.pvCost || 0,
            networkCost,
            gpuCost: allocation.gpuCost || 0,
            externalCost: allocation.externalCost || 0,
            sharedCost: allocation.sharedCost || 0,
            cpuEfficiency: allocation.cpuEfficiency || 0,
            ramEfficiency: allocation.ramEfficiency || 0,
            totalEfficiency: allocation.totalEfficiency || 0,
            cpuReqCoreHrs: get(allocation, "cpuCoreRequestAverage", 0) * hrs,
            cpuUseCoreHrs: get(allocation, "cpuCoreUsageAverage", 0) * hrs,
            ramReqByteHrs: get(allocation, "ramByteRequestAverage", 0) * hrs,
            ramUseByteHrs: get(allocation, "ramByteUsageAverage", 0) * hrs
          };

          processedNodes.push(nodeCost);
          totalCost += nodeCost.totalCost;
        });

        // Sort nodes by total cost (descending)
        const sortedNodes = sortBy(processedNodes, node => -node.totalCost);

        setNodeCosts(sortedNodes);
        setIdleCost(idle);
        setUnallocatedCost(unallocated);
        setClusterTotalCost(totalCost);
      } catch (err) {
        console.error("Error fetching OpenCost data:", err);
        setNodeCosts([]);
        setIdleCost(null);
        setUnallocatedCost(null);
        setClusterTotalCost(0);
        setError(null);
      } finally {
        setLoading(false);
      }
    };

    fetchCostData();
  }, [currentContext]);

  // Filter nodes based on search query
  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) {
      return nodeCosts;
    }

    const lowercaseQuery = searchQuery.toLowerCase();
    return nodeCosts.filter(node =>
      node.name.toLowerCase().includes(lowercaseQuery) ||
      node.instanceType.toLowerCase().includes(lowercaseQuery)
    );
  }, [nodeCosts, searchQuery]);

  // Sort nodes based on sort state
  const sortedNodes = useMemo(() => {
    if (!sort.field || !sort.direction) {
      return filteredNodes;
    }

    return [...filteredNodes].sort((a, b) => {
      const sortMultiplier = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'name':
          return a.name.localeCompare(b.name) * sortMultiplier;
        case 'instanceType':
          return a.instanceType.localeCompare(b.instanceType) * sortMultiplier;
        case 'totalCost':
          return (a.totalCost - b.totalCost) * sortMultiplier;
        case 'percentage':
          const percentageA = clusterTotalCost > 0 ? (a.totalCost / clusterTotalCost) * 100 : 0;
          const percentageB = clusterTotalCost > 0 ? (b.totalCost / clusterTotalCost) * 100 : 0;
          return (percentageA - percentageB) * sortMultiplier;
        case 'efficiency':
          return (a.totalEfficiency - b.totalEfficiency) * sortMultiplier;
        case 'cpuCost':
          return (a.cpuCost - b.cpuCost) * sortMultiplier;
        case 'ramCost':
          return (a.ramCost - b.ramCost) * sortMultiplier;
        case 'pvCost':
          return (a.pvCost - b.pvCost) * sortMultiplier;
        case 'networkCost':
          return (a.networkCost - b.networkCost) * sortMultiplier;
        case 'gpuCost':
          return (a.gpuCost - b.gpuCost) * sortMultiplier;
        default:
          return 0;
      }
    });
  }, [filteredNodes, sort.field, sort.direction, clusterTotalCost]);

  // Handle column sort click
  const handleSort = (field: SortField) => {
    setSort(prevSort => {
      if (prevSort.field === field) {
        if (prevSort.direction === 'asc') {
          return { field, direction: 'desc' };
        } else if (prevSort.direction === 'desc') {
          return { field: null, direction: null };
        } else {
          return { field, direction: 'asc' };
        }
      }
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

  // Get color based on percentage of total cost
  const getPercentageColor = (percentage: number): string => {
    if (percentage < 20) return "bg-green-500";
    if (percentage < 50) return "bg-blue-500";
    if (percentage < 80) return "bg-amber-500";
    return "bg-red-500";
  };

  // Get color for efficiency 
  const getEfficiencyColor = (efficiency: number): string => {
    if (efficiency < 0.20) return "text-red-500";
    if (efficiency < 0.50) return "text-amber-500";
    if (efficiency < 0.80) return "text-blue-500";
    return "text-green-500";
  };

  // Format efficiency value
  const formatEfficiency = (efficiency: number): string => {
    return `${round(efficiency * 100, 1)}%`;
  };

  // Format cost with 2 decimal places
  const formatCost = (cost: number): string => {
    return cost.toFixed(2);
  };

  const handleAskAi = (node: AggregatedNodeCost) => {
    const percentage = clusterTotalCost > 0 ? (node.totalCost / clusterTotalCost) * 100 : 0;

    const structuredContent = `**${node.name} Node Cost Analysis**

**Node:** ${node.name}
**Instance Type:** ${node.instanceType}
**Total Cost:** $${formatCost(node.totalCost)} (${round(percentage, 1)}% of cluster total)
**Efficiency:** ${formatEfficiency(node.totalEfficiency)}

**Resource Breakdown:**
• CPU Cost: $${formatCost(node.cpuCost)}
• Memory Cost: $${formatCost(node.ramCost)}
• Storage Cost: $${formatCost(node.pvCost)}
${node.networkCost > 0 ? `• Network Cost: $${formatCost(node.networkCost)}` : ''}
${node.gpuCost > 0 ? `• GPU Cost: $${formatCost(node.gpuCost)}` : ''}

**Resource Utilization:**
• CPU Efficiency: ${formatEfficiency(node.cpuEfficiency)}
• Memory Efficiency: ${formatEfficiency(node.ramEfficiency)}

**Time Range:** ${timeRange}
**Cluster:** ${currentContext?.name || 'Unknown'}`;

    addStructuredContent(structuredContent, `${node.name} Node Analysis`);
    toast({
      title: "Added to Chat",
      description: `${node.name} node cost data added to chat context`
    });
  };

  if (loading) {
    return (
      <Card className="bg-white dark:bg-gray-800/20 border-gray-200/50 dark:border-gray-700/30 shadow-none">
        <CardContent className="p-6 flex justify-center items-center min-h-[200px]">
          <div className="flex flex-col items-center">
            <Loader2 className="h-8 w-8 animate-spin text-gray-500 mb-2" />
            <p className="text-gray-500">Loading cost data...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-white dark:bg-gray-800/20 border-gray-200/50 dark:border-gray-700/30 shadow-none">
        <CardContent className="p-6">
          <Alert className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/30">
            <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
            <AlertDescription className="text-red-600 dark:text-red-400">{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (nodeCosts.length === 0) {
    return (
      <Card className="bg-white dark:bg-gray-800/20 border-gray-200/50 dark:border-gray-700/30 shadow-none">
        <CardContent className="p-6">
          <Alert>
            <AlertDescription>No node cost data available. Make sure OpenCost is properly installed in your cluster.</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Calculate the total values across all resources
  const calculateTotals = () => {
    let totalCpuCost = 0;
    let totalRamCost = 0;
    let totalGpuCost = 0;
    let totalPvCost = 0;
    let totalNetworkCost = 0;
    let grandTotalCost = 0;

    // Add all node costs
    nodeCosts.forEach(node => {
      totalCpuCost += node.cpuCost || 0;
      totalRamCost += node.ramCost || 0;
      totalGpuCost += node.gpuCost || 0;
      totalPvCost += node.pvCost || 0;
      totalNetworkCost += node.networkCost || 0;
      grandTotalCost += node.totalCost || 0;
    });

    // Add idle costs if present
    if (idleCost) {
      totalCpuCost += idleCost.cpuCost || 0;
      totalRamCost += idleCost.ramCost || 0;
      totalGpuCost += idleCost.gpuCost || 0;
      totalPvCost += idleCost.pvCost || 0;
      totalNetworkCost += idleCost.networkCost || 0;
      grandTotalCost += idleCost.totalCost || 0;
    }

    // Add unallocated costs if present
    if (unallocatedCost) {
      totalCpuCost += unallocatedCost.cpuCost || 0;
      totalRamCost += unallocatedCost.ramCost || 0;
      totalGpuCost += unallocatedCost.gpuCost || 0;
      totalPvCost += unallocatedCost.pvCost || 0;
      totalNetworkCost += unallocatedCost.networkCost || 0;
      grandTotalCost += unallocatedCost.totalCost || 0;
    }

    // Calculate weighted average efficiency for active nodes only (excluding idle)
    let weightedEfficiency = 0;
    let totalActiveResourceCost = 0;

    nodeCosts.forEach(node => {
      const resourceCost = node.cpuCost + node.ramCost; // Only include CPU and RAM in efficiency calculation
      weightedEfficiency += node.totalEfficiency * resourceCost;
      totalActiveResourceCost += resourceCost;
    });

    if (unallocatedCost) {
      const resourceCost = unallocatedCost.cpuCost + unallocatedCost.ramCost;
      weightedEfficiency += unallocatedCost.totalEfficiency * resourceCost;
      totalActiveResourceCost += resourceCost;
    }

    const avgEfficiency = totalActiveResourceCost > 0 ?
      weightedEfficiency / totalActiveResourceCost : 0;

    return {
      cpuCost: totalCpuCost,
      ramCost: totalRamCost,
      gpuCost: totalGpuCost,
      pvCost: totalPvCost,
      networkCost: totalNetworkCost,
      totalCost: grandTotalCost,
      efficiency: avgEfficiency
    };
  };

  const totals = calculateTotals();

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <Card className="bg-white dark:bg-gray-800/20 border-gray-200/50 dark:border-gray-700/30 shadow-none">
        <CardContent className="p-6">
          <h2 className="text-sm uppercase font-light text-gray-700 dark:text-gray-300 mb-4">Summary</h2>

          <div className="grid grid-cols-4 gap-1">
            <Card className="bg-gray-50 dark:bg-transparent rounded-md border border-gray-200 dark:border-gray-800/50 shadow-none min-h-44">
              <CardContent className="py-2 flex flex-col h-full">
                <h2 className="text-sm uppercase font-medium text-gray-800 dark:text-gray-500 mb-auto">Total Cost</h2>
                <div className="mt-auto">
                  <p className="text-5xl font-light text-gray-600 dark:text-gray-400 mb-1">${formatCost(totals.totalCost)}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-50 dark:bg-transparent rounded-md border border-gray-200 dark:border-gray-800/50 shadow-none min-h-44">
              <CardContent className="py-2 flex flex-col h-full">
                <div className="flex items-center gap-1 mb-auto">
                  <Cpu className="h-3 w-3 text-blue-500" />
                  <h2 className="text-sm font-medium text-gray-800 dark:text-gray-500 uppercase">CPU</h2>
                </div>
                <div className="mt-auto">
                  <p className="text-5xl font-light text-blue-600 dark:text-blue-400 mb-1">${formatCost(totals.cpuCost)}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-50 dark:bg-transparent rounded-md border border-gray-200 dark:border-gray-800/50 shadow-none min-h-44">
              <CardContent className="py-2 flex flex-col h-full">
                <div className="flex items-center gap-1 mb-auto">
                  <Database className="h-3 w-3 text-indigo-500" />
                  <h2 className="text-sm font-medium text-gray-800 dark:text-gray-500 uppercase">Memory</h2>
                </div>
                <div className="mt-auto">
                  <p className="text-5xl font-light text-purple-600 dark:text-purple-400 mb-1">${formatCost(totals.ramCost)}</p>
                </div>
              </CardContent>
            </Card>

            {totals.pvCost > 0 && (
              <Card className="bg-gray-50 dark:bg-transparent rounded-md border border-gray-200 dark:border-gray-800/50 shadow-none min-h-44">
                <CardContent className="py-2 flex flex-col h-full">
                  <div className="flex items-center gap-1 mb-auto">
                    <HardDrive className="h-3 w-3 text-purple-500" />
                    <h2 className="text-sm font-medium text-gray-800 dark:text-gray-500 uppercase">Storage</h2>
                  </div>
                  <div className="mt-auto">
                    <p className="text-5xl font-light text-orange-600 dark:text-orange-400 mb-1">${formatCost(totals.pvCost)}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {totals.networkCost > 0 && (
              <Card className="bg-gray-50 dark:bg-transparent rounded-md border border-gray-200 dark:border-gray-800/50 shadow-none min-h-44">
                <CardContent className="py-2 flex flex-col h-full">
                  <div className="flex items-center gap-1 mb-auto">
                    <Network className="h-3 w-3 text-green-500" />
                    <h2 className="text-sm font-medium text-gray-800 dark:text-gray-500 uppercase">Network</h2>
                  </div>
                  <div className="mt-auto">
                    <p className="text-5xl font-light text-green-600 dark:text-green-400 mb-1">${formatCost(totals.networkCost)}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {totals.gpuCost > 0 && (
              <Card className="bg-gray-50 dark:bg-transparent rounded-md border border-gray-200 dark:border-gray-800/50 shadow-none min-h-44">
                <CardContent className="py-2 flex flex-col h-full">
                  <div className="flex items-center gap-1 mb-auto">
                    <svg className="h-3 w-3 text-yellow-500" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M4 4h16v16H4V4zm1 1v14h14V5H5zm11 9v3h1v-3h-1zm-8 2v1h3v-1H8zm4 0v1h2v-1h-2z" />
                    </svg>
                    <h2 className="text-sm font-medium text-gray-800 dark:text-gray-500 uppercase">GPU</h2>
                  </div>
                  <div className="mt-auto">
                    <p className="text-5xl font-light text-yellow-600 dark:text-yellow-400 mb-1">${formatCost(totals.gpuCost)}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="bg-gray-50 dark:bg-transparent rounded-md border border-gray-200 dark:border-gray-800/50 shadow-none min-h-44">
              <CardContent className="py-2 flex flex-col h-full">
                <div className="flex items-center gap-1 mb-auto">
                  <Gauge className={`h-3 w-3 ${getEfficiencyColor(totals.efficiency)}`} />
                  <h2 className="text-sm font-medium text-gray-800 dark:text-gray-500 uppercase">Efficiency</h2>
                </div>
                <div className="mt-auto">
                  <p className={`text-5xl font-light mb-1 ${getEfficiencyColor(totals.efficiency)}`}>
                    {formatEfficiency(totals.efficiency)}
                  </p>
                  <div className="w-full h-1 bg-gray-200 dark:bg-gray-800/30 rounded-[0.3rem] mt-1">
                    <div
                      className={`h-1 rounded-[0.3rem] ${totals.efficiency < 0.20 ? 'bg-red-500' :
                          totals.efficiency < 0.50 ? 'bg-amber-500' :
                            totals.efficiency < 0.80 ? 'bg-blue-500' :
                              'bg-green-500'
                        }`}
                      style={{ width: `${Math.min(totals.efficiency * 100, 100)}%` }}
                    ></div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      {/* Header with Search */}
      <div className="flex items-center justify-between">
        <div>
          <div className="w-96 mt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
              <Input
                type="text"
                placeholder="Search nodes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </div>
      </div>

      {/* No results message */}
      {sortedNodes.length === 0 && searchQuery && (
        <Alert className="my-6 bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <AlertDescription>
            No nodes matching "{searchQuery}"
          </AlertDescription>
        </Alert>
      )}

      {/* Nodes Table */}
      {sortedNodes.length > 0 && (
        <Card className="text-gray-800 dark:text-gray-300 bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <div className="rounded-md border">
            <Table className="bg-gray-50 dark:bg-transparent rounded-2xl">
              <TableHeader>
                <TableRow className="border-b border-gray-400 dark:border-gray-800/80">
                  <TableHead
                    className="cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('name')}
                  >
                    Node Name {renderSortIndicator('name')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:text-blue-500 w-[140px]"
                    onClick={() => handleSort('instanceType')}
                  >
                    Instance Type {renderSortIndicator('instanceType')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('totalCost')}
                  >
                    Total Cost {renderSortIndicator('totalCost')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('percentage')}
                  >
                    Percentage {renderSortIndicator('percentage')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('efficiency')}
                  >
                    Efficiency {renderSortIndicator('efficiency')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('cpuCost')}
                  >
                    CPU {renderSortIndicator('cpuCost')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('ramCost')}
                  >
                    Memory {renderSortIndicator('ramCost')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('pvCost')}
                  >
                    Storage {renderSortIndicator('pvCost')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('networkCost')}
                  >
                    Network {renderSortIndicator('networkCost')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('gpuCost')}
                  >
                    GPU {renderSortIndicator('gpuCost')}
                  </TableHead>
                  <TableHead className="w-[50px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedNodes.map((node) => {
                  const percentage = clusterTotalCost > 0 ? (node.totalCost / clusterTotalCost) * 100 : 0;

                  return (
                    <TableRow
                      key={node.name}
                      className="bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:bg-gray-300/50 dark:hover:bg-gray-800/30"
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center">
                          <div className={`w-3 h-3 rounded-full ${getPercentageColor(percentage)} mr-3 opacity-80`}></div>
                          <span>{node.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>{node.instanceType}</TableCell>
                      <TableCell className="text-center font-bold">
                        ${formatCost(node.totalCost)}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="mx-auto">
                          <span className="mr-4">{round(percentage, 1)}%</span>
                          <div className="w-16 h-1 bg-gray-200 dark:bg-gray-700/30 rounded-full">
                            <div
                              className={`h-1 ${getPercentageColor(percentage)} rounded-full`}
                              style={{ width: `${Math.min(percentage, 100)}%` }}
                            ></div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center">
                          <Gauge className={`h-3 w-3 ${getEfficiencyColor(node.totalEfficiency)} mr-2`} />
                          <span className={`${getEfficiencyColor(node.totalEfficiency)}`}>
                            {formatEfficiency(node.totalEfficiency)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center">
                          <Cpu className="h-3 w-3 text-blue-500 mr-1" />
                          ${formatCost(node.cpuCost)}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center">
                          <Database className="h-3 w-3 text-indigo-500 mr-1" />
                          ${formatCost(node.ramCost)}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {node.pvCost > 0 ? (
                          <div className="flex items-center justify-center">
                            <HardDrive className="h-3 w-3 text-purple-500 mr-1" />
                            ${formatCost(node.pvCost)}
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {node.networkCost > 0 ? (
                          <div className="flex items-center justify-center">
                            <Network className="h-3 w-3 text-green-500 mr-1" />
                            ${formatCost(node.networkCost)}
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {node.gpuCost > 0 ? (
                          <div className="flex items-center justify-center">
                            <svg className="h-3 w-3 text-yellow-500 mr-1" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M4 4h16v16H4V4zm1 1v14h14V5H5zm11 9v3h1v-3h-1zm-8 2v1h3v-1H8zm4 0v1h2v-1h-2z" />
                            </svg>
                            ${formatCost(node.gpuCost)}
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="dark:bg-card/40 backdrop-blur-md border-gray-800/50">
                            <DropdownMenuItem
                              className="hover:text-gray-700 dark:hover:text-gray-500"
                              onClick={() => handleAskAi(node)}
                            >
                              <Sparkles className="mr-2 h-4 w-4" />
                              Ask Agentkube
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Idle costs section */}
      {idleCost && idleCost.totalCost > 0 && (
        <Card className="bg-white dark:bg-gray-800/20 border-gray-200/50 dark:border-gray-700/30 shadow-none">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-gray-400 mr-2 opacity-80"></div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Idle Resources</span>
              </div>
              <span className="text-sm font-bold text-gray-900 dark:text-white">
                ${formatCost(idleCost.totalCost)}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                <Cpu className="h-3 w-3 text-blue-500 mr-1" />
                CPU: ${formatCost(idleCost.cpuCost)}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                <Database className="h-3 w-3 text-indigo-500 mr-1" />
                Memory: ${formatCost(idleCost.ramCost)}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Unallocated costs section */}
      {unallocatedCost && unallocatedCost.totalCost > 0 && (
        <Card className="bg-white dark:bg-gray-800/20 border-gray-200/50 dark:border-gray-700/30 shadow-none">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-yellow-400 mr-2 opacity-80"></div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Unallocated Resources</span>
              </div>
              <span className="text-sm font-bold text-gray-900 dark:text-white">
                ${formatCost(unallocatedCost.totalCost)}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {unallocatedCost.cpuCost > 0 && (
                <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                  <Cpu className="h-3 w-3 text-blue-500 mr-1" />
                  CPU: ${formatCost(unallocatedCost.cpuCost)}
                </div>
              )}
              {unallocatedCost.ramCost > 0 && (
                <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                  <Database className="h-3 w-3 text-indigo-500 mr-1" />
                  Memory: ${formatCost(unallocatedCost.ramCost)}
                </div>
              )}
              {unallocatedCost.pvCost >= 0 && (
                <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                  <HardDrive className="h-3 w-3 text-purple-500 mr-1" />
                  Storage: ${formatCost(unallocatedCost.pvCost)}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default NodeCostDistribution;