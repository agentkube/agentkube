import React, { useEffect, useState } from 'react';
import { useCluster } from '@/contexts/clusterContext';
import { kubeProxyRequest } from '@/api/cluster';
import { Card, CardContent } from "@/components/ui/card";
import { Cpu, Database, HardDrive, Network, AlertCircle, Loader2, Gauge } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { get, forEach, round, sortBy } from 'lodash';
import { AggregatedNodeCost, OpenCostAllocationResponse } from '@/types/opencost';

interface NodeCostDistributionProps {
  timeRange: string;
  onReload: () => Promise<void>;
}

const NodeCostDistribution: React.FC<NodeCostDistributionProps> = ({ timeRange, onReload }) => {
  const { currentContext } = useCluster();
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [nodeCosts, setNodeCosts] = useState<AggregatedNodeCost[]>([]);
  const [idleCost, setIdleCost] = useState<AggregatedNodeCost | null>(null);
  const [unallocatedCost, setUnallocatedCost] = useState<AggregatedNodeCost | null>(null);
  const [clusterTotalCost, setClusterTotalCost] = useState<number>(0);
  
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
        
        // Define OpenCost service params
        const OPENCOST_NAMESPACE = 'opencost';
        const OPENCOST_SERVICE = 'opencost:9090';
        
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
        setError(err instanceof Error ? err.message : "Failed to fetch cost data");
      } finally {
        setLoading(false);
      }
    };
    
    fetchCostData();
  }, [currentContext]);
  
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
  
  if (loading) {
    return (
      <Card className="bg-white dark:bg-gray-800/20 border-gray-200/50 dark:border-gray-700/30 shadow-lg">
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
      <Card className="bg-white dark:bg-gray-800/20 border-gray-200/50 dark:border-gray-700/30 shadow-lg">
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
      <Card className="bg-white dark:bg-gray-800/20 border-gray-200/50 dark:border-gray-700/30 shadow-lg">
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
    <div className="space-y-4">
      {/* Summary Card */}
      <Card className="bg-white dark:bg-gray-800/20 border-gray-200/50 dark:border-gray-700/30 shadow-lg">
        <CardContent className="p-6">
          <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-4">Cost Summary</h2>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
              <div className="text-xs text-gray-500 dark:text-gray-400">Total Cost</div>
              <div className="text-lg font-bold text-gray-900 dark:text-white">${formatCost(totals.totalCost)}</div>
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
              <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                <Cpu className="h-3 w-3 text-blue-500 mr-1" />
                CPU
              </div>
              <div className="text-lg font-bold text-gray-900 dark:text-white">${formatCost(totals.cpuCost)}</div>
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
              <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                <Database className="h-3 w-3 text-indigo-500 mr-1" />
                Memory
              </div>
              <div className="text-lg font-bold text-gray-900 dark:text-white">${formatCost(totals.ramCost)}</div>
            </div>
            
            {totals.pvCost > 0 && (
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                  <HardDrive className="h-3 w-3 text-purple-500 mr-1" />
                  Storage
                </div>
                <div className="text-lg font-bold text-gray-900 dark:text-white">${formatCost(totals.pvCost)}</div>
              </div>
            )}
            
            {totals.networkCost > 0 && (
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                  <Network className="h-3 w-3 text-green-500 mr-1" />
                  Network
                </div>
                <div className="text-lg font-bold text-gray-900 dark:text-white">${formatCost(totals.networkCost)}</div>
              </div>
            )}
            
            {totals.gpuCost > 0 && (
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                  <svg className="h-3 w-3 text-yellow-500 mr-1" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M4 4h16v16H4V4zm1 1v14h14V5H5zm11 9v3h1v-3h-1zm-8 2v1h3v-1H8zm4 0v1h2v-1h-2z"/>
                  </svg>
                  GPU
                </div>
                <div className="text-lg font-bold text-gray-900 dark:text-white">${formatCost(totals.gpuCost)}</div>
              </div>
            )}
            
            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
              <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                <Gauge className={`h-3 w-3 ${getEfficiencyColor(totals.efficiency)} mr-1`} />
                Efficiency
              </div>
              <div className={`text-lg font-bold ${getEfficiencyColor(totals.efficiency)}`}>
                {formatEfficiency(totals.efficiency)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Node Distribution Card */}
      <Card className="bg-white dark:bg-gray-800/20 border-gray-200/50 dark:border-gray-700/30 shadow-lg">
        <CardContent className="p-6">
          <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-4">Node Cost Distribution</h2>
          
          <div className="space-y-5">
            {nodeCosts.map((node) => {
              // Calculate node's percentage of total cost
              const percentage = clusterTotalCost > 0 ? (node.totalCost / clusterTotalCost) * 100 : 0;
              
              return (
                <div key={node.name} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center">
                        <div className={`w-3 h-3 rounded-full ${getPercentageColor(percentage)} mr-2 opacity-80`}></div>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{node.name}</span>
                      </div>
                      <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 ml-5">
                        <span className="mr-4">{node.instanceType}</span>
                        <div className="flex items-center">
                          <Gauge className={`h-3 w-3 ${getEfficiencyColor(node.totalEfficiency)} mr-1`} />
                          <span className={`${getEfficiencyColor(node.totalEfficiency)}`}>
                            Efficiency: {formatEfficiency(node.totalEfficiency)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">${formatCost(node.totalCost)}</span>
                  </div>
                  <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full">
                    <div 
                      className={`h-2 ${getPercentageColor(percentage)} rounded-full`}
                      style={{ width: `${Math.min(percentage, 100)}%` }}
                    ></div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1">
                    <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                      <Cpu className="h-3 w-3 text-blue-500 mr-1" />
                      CPU: ${formatCost(node.cpuCost)}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                      <Database className="h-3 w-3 text-indigo-500 mr-1" />
                      Memory: ${formatCost(node.ramCost)}
                    </div>
                    {node.pvCost > 0 && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                        <HardDrive className="h-3 w-3 text-purple-500 mr-1" />
                        Storage: ${formatCost(node.pvCost)}
                      </div>
                    )}
                    {node.networkCost > 0 && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                        <Network className="h-3 w-3 text-green-500 mr-1" />
                        Network: ${formatCost(node.networkCost)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Idle costs if available */}
          {idleCost && idleCost.totalCost > 0 && (
            <div className="mt-8 pt-5 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded-full bg-gray-400 mr-2 opacity-80"></div>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Idle Resources</span>
                </div>
                <span className="text-sm font-bold text-gray-900 dark:text-white">
                  ${formatCost(idleCost.totalCost)}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                  <Cpu className="h-3 w-3 text-blue-500 mr-1" />
                  CPU: ${formatCost(idleCost.cpuCost)}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                  <Database className="h-3 w-3 text-indigo-500 mr-1" />
                  Memory: ${formatCost(idleCost.ramCost)}
                </div>
              </div>
            </div>
          )}
          
          {/* Unallocated costs if available */}
          {unallocatedCost && unallocatedCost.totalCost > 0 && (
            <div className="mt-5 pt-5 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded-full bg-yellow-400 mr-2 opacity-80"></div>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Unallocated Resources</span>
                </div>
                <span className="text-sm font-bold text-gray-900 dark:text-white">
                  ${formatCost(unallocatedCost.totalCost)}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
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
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default NodeCostDistribution;