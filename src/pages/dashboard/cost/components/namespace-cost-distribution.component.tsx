import React, { useEffect, useState } from 'react';
import { useCluster } from '@/contexts/clusterContext';
import { kubeProxyRequest } from '@/api/cluster';
import { OpenCostAllocationResponse } from '@/types/opencost';
import { Card, CardContent } from "@/components/ui/card";
import { Cpu, Database, HardDrive, Network, AlertCircle, Loader2, Gauge } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { get, round } from 'lodash';

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

const NamespaceCostDistribution: React.FC = () => {
  const { currentContext } = useCluster();
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
        const OPENCOST_NAMESPACE = 'opencost';
        const OPENCOST_SERVICE = 'opencost:9090';
        
        // Build path and query parameters
        const path = `api/v1/namespaces/${OPENCOST_NAMESPACE}/services/${OPENCOST_SERVICE}/proxy/model/allocation/compute`;
        const queryParams = new URLSearchParams({
          window: '48h',           // 48-hour window
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
        setError(err instanceof Error ? err.message : "Failed to fetch namespace cost data");
      } finally {
        setLoading(false);
      }
    };
    
    fetchNamespaceCostData();
  }, [currentContext]);

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

  if (loading) {
    return (
      <Card className="bg-white dark:bg-gray-800/20 border-gray-200/50 dark:border-gray-700/30 shadow-lg">
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

  if (costData.namespaces.length === 0) {
    return (
      <Card className="bg-white dark:bg-gray-800/20 border-gray-200/50 dark:border-gray-700/30 shadow-lg">
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
    <div className="space-y-4">
      {/* Summary Card */}
      <Card className="bg-white dark:bg-gray-800/20 border-gray-200/50 dark:border-gray-700/30 shadow-lg">
        <CardContent className="p-6">
          <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-4">Namespace Cost Summary</h2>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
              <div className="text-xs text-gray-500 dark:text-gray-400">Total Cost</div>
              <div className="text-lg font-bold text-gray-900 dark:text-white">${formatCost(costData.totalCost)}</div>
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
              <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                <Cpu className="h-3 w-3 text-blue-500 mr-1" />
                CPU
              </div>
              <div className="text-lg font-bold text-gray-900 dark:text-white">${formatCost(costData.cpuCost)}</div>
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
              <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                <Database className="h-3 w-3 text-indigo-500 mr-1" />
                Memory
              </div>
              <div className="text-lg font-bold text-gray-900 dark:text-white">${formatCost(costData.ramCost)}</div>
            </div>
            
            {costData.pvCost > 0 && (
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                  <HardDrive className="h-3 w-3 text-purple-500 mr-1" />
                  Storage
                </div>
                <div className="text-lg font-bold text-gray-900 dark:text-white">${formatCost(costData.pvCost)}</div>
              </div>
            )}
            
            {networkCost > 0 && (
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                  <Network className="h-3 w-3 text-green-500 mr-1" />
                  Network
                </div>
                <div className="text-lg font-bold text-gray-900 dark:text-white">${formatCost(networkCost)}</div>
              </div>
            )}
            
            {gpuCost > 0 && (
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                  <svg className="h-3 w-3 text-yellow-500 mr-1" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M4 4h16v16H4V4zm1 1v14h14V5H5zm11 9v3h1v-3h-1zm-8 2v1h3v-1H8zm4 0v1h2v-1h-2z"/>
                  </svg>
                  GPU
                </div>
                <div className="text-lg font-bold text-gray-900 dark:text-white">${formatCost(gpuCost)}</div>
              </div>
            )}
            
            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
              <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                <Gauge className={`h-3 w-3 ${getEfficiencyColor(costData.efficiency)} mr-1`} />
                Efficiency
              </div>
              <div className={`text-lg font-bold ${getEfficiencyColor(costData.efficiency)}`}>
                {round(costData.efficiency, 1)}%
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Namespace Distribution Card */}
      <Card className="bg-white dark:bg-gray-800/20 border-gray-200/50 dark:border-gray-700/30 shadow-lg">
        <CardContent className="p-6">
          <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-4">Namespace Cost Distribution</h2>
          
          <div className="space-y-5">
            {costData.namespaces.map((ns, idx) => {
              // Safely access possibly undefined values
              const nsNetworkCost = ns.resources.network ?? 0;
              const nsGpuCost = ns.resources.gpu ?? 0;
              
              return (
                <div key={idx} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center">
                        <div className={`w-3 h-3 rounded-full ${getPercentageColor(ns.percentage)} mr-2 opacity-80`}></div>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{ns.name}</span>
                      </div>
                      <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 ml-5">
                        <Gauge className={`h-3 w-3 ${getEfficiencyColor(ns.efficiency)} mr-1`} />
                        <span className={`${getEfficiencyColor(ns.efficiency)}`}>
                          Efficiency: {round(ns.efficiency, 1)}%
                        </span>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">${formatCost(ns.cost)}</span>
                  </div>
                  <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full">
                    <div 
                      className={`h-2 ${getPercentageColor(ns.percentage)} rounded-full`}
                      style={{ width: `${Math.min(ns.percentage, 100)}%` }}
                    ></div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1">
                    <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                      <Cpu className="h-3 w-3 text-blue-500 mr-1" />
                      CPU: ${formatCost(ns.resources.cpu)}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                      <Database className="h-3 w-3 text-indigo-500 mr-1" />
                      Memory: ${formatCost(ns.resources.memory)}
                    </div>
                    {ns.resources.storage > 0 && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                        <HardDrive className="h-3 w-3 text-purple-500 mr-1" />
                        Storage: ${formatCost(ns.resources.storage)}
                      </div>
                    )}
                    {nsNetworkCost > 0 && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                        <Network className="h-3 w-3 text-green-500 mr-1" />
                        Network: ${formatCost(nsNetworkCost)}
                      </div>
                    )}
                    {nsGpuCost > 0 && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                        <svg className="h-3 w-3 text-yellow-500 mr-1" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M4 4h16v16H4V4zm1 1v14h14V5H5zm11 9v3h1v-3h-1zm-8 2v1h3v-1H8zm4 0v1h2v-1h-2z"/>
                        </svg>
                        GPU: ${formatCost(nsGpuCost)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default NamespaceCostDistribution;