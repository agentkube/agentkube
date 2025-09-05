import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useCluster } from '@/contexts/clusterContext';
import { kubeProxyRequest } from '@/api/cluster';
import { OpenCostAllocationResponse } from '@/types/opencost';
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Cpu, Database, HardDrive, Network, AlertCircle, Loader2, Gauge, Search, ArrowUpDown, ArrowUp, ArrowDown, MoreVertical, Sparkles } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { get, round } from 'lodash';
import { useDrawer } from '@/contexts/useDrawer';
import { toast } from '@/hooks/use-toast';

interface ResourceCost {
  cpu: number;
  memory: number;
  storage: number;
  network?: number;
  gpu?: number;
  total: number;
}

interface NamespaceCost {
  name: string;
  cost: number;
  percentage: number;
  efficiency: number;
  resources: ResourceCost;
}

interface NamespaceCostSummary {
  namespaces: NamespaceCost[];
  totalCost: number;
  cpuCost: number;
  ramCost: number;
  pvCost: number;
  networkCost: number;
  gpuCost: number;
  efficiency: number;
}

interface NamespaceCostDistributionProps {
  timeRange: string;
  onReload: () => Promise<void>;
}

// Define sorting types
type SortDirection = 'asc' | 'desc' | null;
type SortField = 'name' | 'cost' | 'percentage' | 'efficiency' | 'cpu' | 'memory' | 'storage' | 'network' | 'gpu' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

const NamespaceCostDistribution: React.FC<NamespaceCostDistributionProps> = ({ timeRange, onReload }) => {
  const { currentContext } = useCluster();
  const { addStructuredContent } = useDrawer();
  const [costData, setCostData] = useState<NamespaceCostSummary>({
    namespaces: [],
    totalCost: 0,
    cpuCost: 0,
    ramCost: 0,
    pvCost: 0,
    networkCost: 0,
    gpuCost: 0,
    efficiency: 0
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [openCostConfig, setOpenCostConfig] = useState({
    namespace: 'opencost',
    service: 'opencost:9090'
  });
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sort, setSort] = useState<SortState>({
    field: null,
    direction: null
  });

  const loadOpenCostConfig = useCallback(() => {
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
    if (currentContext) {
      loadOpenCostConfig();
    }
  }, [currentContext, loadOpenCostConfig]);

  useEffect(() => {
    const fetchNamespaceCostData = async () => {
      if (!currentContext?.name) {
        setLoading(false);
        setError("No cluster selected. Please select a cluster to view cost data.");
        return;
      }
      
      try {
        setLoading(true);
        setError(null);
        
        // Define constants
        const OPENCOST_NAMESPACE = openCostConfig.namespace;
        const OPENCOST_SERVICE = openCostConfig.service;
        
        // Build path and query parameters
        const path = `api/v1/namespaces/${OPENCOST_NAMESPACE}/services/${OPENCOST_SERVICE}/proxy/model/allocation/compute`;
        const queryParams = new URLSearchParams({
          window: timeRange,           // 48-hour window
          aggregate: 'namespace',  // aggregate by namespace
          includeIdle: 'true',     // include idle resources
          accumulate: 'true'       // accumulate the values
        }).toString();
        
        const fullPath = `${path}?${queryParams}`;
        
        // Directly use kubeProxyRequest
        const response = await kubeProxyRequest(currentContext.name, fullPath, 'GET') as OpenCostAllocationResponse;
        
        // Transform the data
        const transformedData = transformOpenCostNamespaceData(response.data);
        setCostData(transformedData);
      } catch (err) {
        console.error("Error fetching OpenCost namespace data:", err);
        setCostData({ 
          namespaces: [], 
          totalCost: 0,
          cpuCost: 0,
          ramCost: 0,
          pvCost: 0,
          networkCost: 0,
          gpuCost: 0,
          efficiency: 0
        });
        setError(null);
      } finally {
        setLoading(false);
      }
    };
    
    fetchNamespaceCostData();
  }, [currentContext, timeRange, openCostConfig]);

  // Filter namespaces based on search query
  const filteredNamespaces = useMemo(() => {
    if (!searchQuery.trim()) {
      return costData.namespaces;
    }

    const lowercaseQuery = searchQuery.toLowerCase();
    return costData.namespaces.filter(namespace =>
      namespace.name.toLowerCase().includes(lowercaseQuery)
    );
  }, [costData.namespaces, searchQuery]);

  // Sort namespaces based on sort state
  const sortedNamespaces = useMemo(() => {
    if (!sort.field || !sort.direction) {
      return filteredNamespaces;
    }

    return [...filteredNamespaces].sort((a, b) => {
      const sortMultiplier = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'name':
          return a.name.localeCompare(b.name) * sortMultiplier;
        case 'cost':
          return (a.cost - b.cost) * sortMultiplier;
        case 'percentage':
          return (a.percentage - b.percentage) * sortMultiplier;
        case 'efficiency':
          return (a.efficiency - b.efficiency) * sortMultiplier;
        case 'cpu':
          return (a.resources.cpu - b.resources.cpu) * sortMultiplier;
        case 'memory':
          return (a.resources.memory - b.resources.memory) * sortMultiplier;
        case 'storage':
          return (a.resources.storage - b.resources.storage) * sortMultiplier;
        case 'network':
          return ((a.resources.network || 0) - (b.resources.network || 0)) * sortMultiplier;
        case 'gpu':
          return ((a.resources.gpu || 0) - (b.resources.gpu || 0)) * sortMultiplier;
        default:
          return 0;
      }
    });
  }, [filteredNamespaces, sort.field, sort.direction]);

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

  // Transform OpenCost namespace data to the format expected by the component
  const transformOpenCostNamespaceData = (data: Record<string, any>[]): NamespaceCostSummary => {
    // If no data is available, return empty array
    if (!data || data.length === 0 || !data[0]) {
      return { 
        namespaces: [], 
        totalCost: 0,
        cpuCost: 0,
        ramCost: 0,
        pvCost: 0,
        networkCost: 0,
        gpuCost: 0,
        efficiency: 0
      };
    }

    try {
      // Extract the single allocation set (since we're using accumulate=true)
      const namespaceData = data[0];
      
      // Initialize resource totals
      let totalCpuCost = 0;
      let totalRamCost = 0;
      let totalPvCost = 0;
      let totalNetworkCost = 0;
      let totalGpuCost = 0;
      let namespacesTotalCost = 0;
      let weightedEfficiency = 0;
      let totalResourceCostForEfficiency = 0;
      
      // Calculate total cost across all namespaces (excluding __idle__ and __unallocated__)
      Object.entries(namespaceData).forEach(([name, data]) => {
        if (name !== '__idle__' && name !== '__unallocated__') {
          const allocation = data as any;
          namespacesTotalCost += allocation.totalCost || 0;
          
          // Add to resource totals
          totalCpuCost += allocation.cpuCost || 0;
          totalRamCost += allocation.ramCost || 0;
          totalPvCost += allocation.pvCost || 0;
          
          // Calculate network costs (sum of all network-related costs)
          const networkCost = (allocation.networkCost || 0) + 
                            (allocation.networkCrossZoneCost || 0) + 
                            (allocation.networkCrossRegionCost || 0) + 
                            (allocation.networkInternetCost || 0);
          totalNetworkCost += networkCost;
          
          // GPU costs
          totalGpuCost += allocation.gpuCost || 0;
          
          // Calculate weighted efficiency
          const efficiency = allocation.totalEfficiency || 0;
          const resourceCostForEfficiency = (allocation.cpuCost || 0) + (allocation.ramCost || 0);
          weightedEfficiency += efficiency * resourceCostForEfficiency;
          totalResourceCostForEfficiency += resourceCostForEfficiency;
        }
      });
      
      // Transform each namespace entry to the expected format
      const namespaces = Object.entries(namespaceData)
        .filter(([name, _]) => name !== '__idle__' && name !== '__unallocated__')
        .map(([name, data]) => {
          const allocation = data as any;
          const cost = allocation.totalCost || 0;
          const percentage = namespacesTotalCost > 0 ? (cost / namespacesTotalCost) * 100 : 0;
          
          // Extract efficiency metric - convert to percentage
          const efficiency = allocation.totalEfficiency != null ? 
            allocation.totalEfficiency * 100 : 0;
          
          // Calculate network costs (sum of all network-related costs)
          const networkCost = (allocation.networkCost || 0) + 
                            (allocation.networkCrossZoneCost || 0) + 
                            (allocation.networkCrossRegionCost || 0) + 
                            (allocation.networkInternetCost || 0);
          
          // Create resource cost breakdown
          const resources: ResourceCost = {
            cpu: allocation.cpuCost || 0,
            memory: allocation.ramCost || 0,
            storage: allocation.pvCost || 0,
            network: networkCost,
            gpu: allocation.gpuCost || 0,
            total: cost
          };
          
          return {
            name: name,
            cost: cost,
            percentage: percentage,
            efficiency: efficiency,
            resources: resources
          };
        })
        .sort((a, b) => b.cost - a.cost); // Sort by cost (highest first)
      
      // Calculate overall efficiency
      const averageEfficiency = totalResourceCostForEfficiency > 0 
        ? weightedEfficiency / totalResourceCostForEfficiency 
        : 0;
      
      return { 
        namespaces, 
        totalCost: namespacesTotalCost,
        cpuCost: totalCpuCost,
        ramCost: totalRamCost,
        pvCost: totalPvCost,
        networkCost: totalNetworkCost,
        gpuCost: totalGpuCost,
        efficiency: averageEfficiency * 100
      };
    } catch (error) {
      console.error("Error processing OpenCost namespace data:", error);
      return { 
        namespaces: [], 
        totalCost: 0,
        cpuCost: 0,
        ramCost: 0,
        pvCost: 0,
        networkCost: 0,
        gpuCost: 0,
        efficiency: 0 
      };
    }
  };

  // Calculate color based on percentage for bars
  const getPercentageColor = (percentage: number): string => {
    if (percentage < 20) return "bg-green-500";
    if (percentage < 50) return "bg-blue-500";
    if (percentage < 80) return "bg-amber-500";
    return "bg-red-500";
  };

  // Calculate color for efficiency 
  const getEfficiencyColor = (efficiency: number): string => {
    if (efficiency < 20) return "text-red-500";
    if (efficiency < 50) return "text-amber-500";
    if (efficiency < 80) return "text-blue-500";
    return "text-green-500";
  };
  
  // Format currency values consistently
  const formatCost = (value: number): string => {
    return value.toFixed(2);
  };

  const handleAskAi = (namespace: NamespaceCost) => {
    const structuredContent = `**${namespace.name} Namespace Cost Analysis**

**Total Cost:** $${formatCost(namespace.cost)} (${round(namespace.percentage, 1)}% of total)
**Efficiency:** ${round(namespace.efficiency, 1)}%

**Resource Breakdown:**
• CPU: $${formatCost(namespace.resources.cpu)}
• Memory: $${formatCost(namespace.resources.memory)}
• Storage: $${formatCost(namespace.resources.storage)}
${namespace.resources.network ? `• Network: $${formatCost(namespace.resources.network)}` : ''}
${namespace.resources.gpu ? `• GPU: $${formatCost(namespace.resources.gpu)}` : ''}

**Time Range:** ${timeRange}
**Cluster:** ${currentContext?.name || 'Unknown'}`;

    addStructuredContent(structuredContent, `${namespace.name} Cost Analysis`);
    toast({
      title: "Added to Chat",
      description: `${namespace.name} namespace cost data added to chat context`
    });
  };

  if (loading) {
    return (
      <Card className="bg-white dark:bg-gray-800/20 border-gray-200/50 dark:border-gray-700/30 shadow-none">
        <CardContent className="p-6 flex justify-center items-center min-h-[200px]">
          <div className="flex flex-col items-center">
            <Loader2 className="h-8 w-8 animate-spin text-gray-500 mb-2" />
            <p className="text-gray-500">Loading namespace cost data...</p>
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

  if (costData.namespaces.length === 0) {
    return (
      <Card className="bg-white dark:bg-gray-800/20 border-gray-200/50 dark:border-gray-700/30 shadow-none">
        <CardContent className="p-6">
          <Alert>
            <AlertDescription>No namespace cost data available. Make sure OpenCost is properly installed in your cluster.</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Safely access possibly undefined values
  const networkCost = costData.networkCost || 0;
  const gpuCost = costData.gpuCost || 0;

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
                  <p className="text-5xl font-light text-gray-600 dark:text-gray-400 mb-1">${formatCost(costData.totalCost)}</p>
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
                  <p className="text-5xl font-light text-blue-600 dark:text-blue-400 mb-1">${formatCost(costData.cpuCost)}</p>
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
                  <p className="text-5xl font-light text-purple-600 dark:text-purple-400 mb-1">${formatCost(costData.ramCost)}</p>
                </div>
              </CardContent>
            </Card>
            
            {costData.pvCost > 0 && (
              <Card className="bg-gray-50 dark:bg-transparent rounded-md border border-gray-200 dark:border-gray-800/50 shadow-none min-h-44">
                <CardContent className="py-2 flex flex-col h-full">
                  <div className="flex items-center gap-1 mb-auto">
                    <HardDrive className="h-3 w-3 text-purple-500" />
                    <h2 className="text-sm font-medium text-gray-800 dark:text-gray-500 uppercase">Storage</h2>
                  </div>
                  <div className="mt-auto">
                    <p className="text-5xl font-light text-orange-600 dark:text-orange-400 mb-1">${formatCost(costData.pvCost)}</p>
                  </div>
                </CardContent>
              </Card>
            )}
            
            {networkCost > 0 && (
              <Card className="bg-gray-50 dark:bg-transparent rounded-md border border-gray-200 dark:border-gray-800/50 shadow-none min-h-44">
                <CardContent className="py-2 flex flex-col h-full">
                  <div className="flex items-center gap-1 mb-auto">
                    <Network className="h-3 w-3 text-green-500" />
                    <h2 className="text-sm font-medium text-gray-800 dark:text-gray-500 uppercase">Network</h2>
                  </div>
                  <div className="mt-auto">
                    <p className="text-5xl font-light text-green-600 dark:text-green-400 mb-1">${formatCost(networkCost)}</p>
                  </div>
                </CardContent>
              </Card>
            )}
            
            {gpuCost > 0 && (
              <Card className="bg-gray-50 dark:bg-transparent rounded-md border border-gray-200 dark:border-gray-800/50 shadow-none min-h-44">
                <CardContent className="py-2 flex flex-col h-full">
                  <div className="flex items-center gap-1 mb-auto">
                    <svg className="h-3 w-3 text-yellow-500" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M4 4h16v16H4V4zm1 1v14h14V5H5zm11 9v3h1v-3h-1zm-8 2v1h3v-1H8zm4 0v1h2v-1h-2z"/>
                    </svg>
                    <h2 className="text-sm font-medium text-gray-800 dark:text-gray-500 uppercase">GPU</h2>
                  </div>
                  <div className="mt-auto">
                    <p className="text-5xl font-light text-yellow-600 dark:text-yellow-400 mb-1">${formatCost(gpuCost)}</p>
                  </div>
                </CardContent>
              </Card>
            )}
            
            <Card className="bg-gray-50 dark:bg-transparent rounded-md border border-gray-200 dark:border-gray-800/50 shadow-none min-h-44">
              <CardContent className="py-2 flex flex-col h-full">
                <div className="flex items-center gap-1 mb-auto">
                  <Gauge className={`h-3 w-3 ${getEfficiencyColor(costData.efficiency)}`} />
                  <h2 className="text-sm font-medium text-gray-800 dark:text-gray-500 uppercase">Efficiency</h2>
                </div>
                <div className="mt-auto">
                  <p className={`text-5xl font-light mb-1 ${getEfficiencyColor(costData.efficiency)}`}>
                    {round(costData.efficiency, 1)}%
                  </p>
                  <div className="w-full h-1 bg-gray-200 dark:bg-gray-800/30 rounded-[0.3rem] mt-1">
                    <div
                      className={`h-1 rounded-[0.3rem] ${
                        costData.efficiency < 20 ? 'bg-red-500' :
                        costData.efficiency < 50 ? 'bg-amber-500' :
                        costData.efficiency < 80 ? 'bg-blue-500' :
                        'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(costData.efficiency, 100)}%` }}
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
                placeholder="Search namespaces..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </div>
      </div>

      {/* No results message */}
      {sortedNamespaces.length === 0 && searchQuery && (
        <Alert className="my-6 bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <AlertDescription>
            No namespaces matching "${searchQuery}"
          </AlertDescription>
        </Alert>
      )}
      
      {/* Namespace Table */}
      {sortedNamespaces.length > 0 && (
        <Card className="text-gray-800 dark:text-gray-300 bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <div className="rounded-md border">
            <Table className="bg-gray-50 dark:bg-transparent rounded-2xl">
              <TableHeader>
                <TableRow className="border-b border-gray-400 dark:border-gray-800/80">
                  <TableHead
                    className="cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('name')}
                  >
                    Namespace {renderSortIndicator('name')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('cost')}
                  >
                    Total Cost {renderSortIndicator('cost')}
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
                    onClick={() => handleSort('cpu')}
                  >
                    CPU {renderSortIndicator('cpu')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('memory')}
                  >
                    Memory {renderSortIndicator('memory')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('storage')}
                  >
                    Storage {renderSortIndicator('storage')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('network')}
                  >
                    Network {renderSortIndicator('network')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('gpu')}
                  >
                    GPU {renderSortIndicator('gpu')}
                  </TableHead>
                  <TableHead className="w-[50px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedNamespaces.map((namespace) => {
                  const nsNetworkCost = namespace.resources.network ?? 0;
                  const nsGpuCost = namespace.resources.gpu ?? 0;
                  
                  return (
                    <TableRow
                      key={namespace.name}
                      className="bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:bg-gray-300/50 dark:hover:bg-gray-800/30"
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center">
                          <div className={`w-3 h-3 rounded-full ${getPercentageColor(namespace.percentage)} mr-3 opacity-80`}></div>
                          <span>{namespace.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center font-bold">
                        ${formatCost(namespace.cost)}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="mx-auto">
                          <span className="mr-4">{round(namespace.percentage, 1)}%</span>
                          <div className="w-16 h-1 bg-gray-200 dark:bg-gray-700/30 rounded-full">
                            <div 
                              className={`h-1 ${getPercentageColor(namespace.percentage)} rounded-full`}
                              style={{ width: `${Math.min(namespace.percentage, 100)}%` }}
                            ></div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center">
                          <Gauge className={`h-3 w-3 ${getEfficiencyColor(namespace.efficiency)} mr-2`} />
                          <span className={`${getEfficiencyColor(namespace.efficiency)}`}>
                            {round(namespace.efficiency, 1)}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center">
                          <Cpu className="h-3 w-3 text-blue-500 mr-1" />
                          ${formatCost(namespace.resources.cpu)}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center">
                          <Database className="h-3 w-3 text-indigo-500 mr-1" />
                          ${formatCost(namespace.resources.memory)}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {namespace.resources.storage > 0 ? (
                          <div className="flex items-center justify-center">
                            <HardDrive className="h-3 w-3 text-purple-500 mr-1" />
                            ${formatCost(namespace.resources.storage)}
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {nsNetworkCost > 0 ? (
                          <div className="flex items-center justify-center">
                            <Network className="h-3 w-3 text-green-500 mr-1" />
                            ${formatCost(nsNetworkCost)}
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {nsGpuCost > 0 ? (
                          <div className="flex items-center justify-center">
                            <svg className="h-3 w-3 text-yellow-500 mr-1" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M4 4h16v16H4V4zm1 1v14h14V5H5zm11 9v3h1v-3h-1zm-8 2v1h3v-1H8zm4 0v1h2v-1h-2z"/>
                            </svg>
                            ${formatCost(nsGpuCost)}
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
                          <DropdownMenuContent align="end" className="dark:bg-[#0B0D13]/40 backdrop-blur-md border-gray-800/50">
                            <DropdownMenuItem 
                              className="hover:text-gray-700 dark:hover:text-gray-500"
                              onClick={() => handleAskAi(namespace)}
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
    </div>
  );
};

export default NamespaceCostDistribution;