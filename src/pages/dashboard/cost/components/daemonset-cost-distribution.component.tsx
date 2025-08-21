import React, { useEffect, useState } from 'react';
import { useCluster } from '@/contexts/clusterContext';
import { kubeProxyRequest } from '@/api/cluster';
import { OpenCostAllocationResponse, ResourceCost } from '@/types/opencost';
import { Card, CardContent } from "@/components/ui/card";
import { Cpu, Database, HardDrive, Network, AlertCircle, Loader2, Gauge } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { get, round } from 'lodash';
import { useNavigate } from 'react-router-dom';

interface DaemonsetCost {
  name: string;
  namespace: string;
  cost: number;
  percentage: number;
  efficiency: number;
  resources: ResourceCost;
  controllerKind: string;
}

interface DaemonsetCostSummary {
  daemonsets: DaemonsetCost[];
  totalCost: number;
  cpuCost: number;
  ramCost: number;
  pvCost: number;
  networkCost: number;
  gpuCost: number;
  efficiency: number;
}

interface DaemonsetCostDistributionProps {
  timeRange: string;
  onReload: () => Promise<void>;
}

const DaemonsetCostDistribution: React.FC<DaemonsetCostDistributionProps> = ({ timeRange, onReload }) => {
  const { currentContext } = useCluster();
  const navigate = useNavigate();
  const [costData, setCostData] = useState<DaemonsetCostSummary>({
    daemonsets: [],
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
    const fetchDaemonsetCostData = async () => {
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
          window: timeRange,
          aggregate: 'daemonset',  // aggregate by controller
          includeIdle: 'true',     // include idle resources
          accumulate: 'true'       // accumulate the values
        }).toString();
        
        const fullPath = `${path}?${queryParams}`;
        
        // Directly use kubeProxyRequest
        const response = await kubeProxyRequest(currentContext.name, fullPath, 'GET') as OpenCostAllocationResponse;
        
        // Transform the data
        const transformedData = transformOpenCostDaemonsetData(response.data);
        setCostData(transformedData);
      } catch (err) {
        console.error("Error fetching OpenCost daemonset data:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch daemonset cost data");
      } finally {
        setLoading(false);
      }
    };
    
    fetchDaemonsetCostData();
  }, [currentContext, timeRange]);

  // Transform OpenCost controller data to the format expected by the component
  const transformOpenCostDaemonsetData = (data: Record<string, any>[]): DaemonsetCostSummary => {
    // If no data is available, return empty array
    if (!data || data.length === 0 || !data[0]) {
      return { 
        daemonsets: [], 
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
      const controllerData = data[0];
      
      // Initialize resource totals
      let totalCpuCost = 0;
      let totalRamCost = 0;
      let totalPvCost = 0;
      let totalNetworkCost = 0;
      let totalGpuCost = 0;
      let daemonsetsTotalCost = 0;
      let weightedEfficiency = 0;
      let totalResourceCostForEfficiency = 0;
      
      // Filter only the DaemonSet resources and calculate total costs
      const daemonsets = Object.entries(controllerData)
        .filter(([name, data]) => {
          const allocation = data as any;
          // Filter out idle, unallocated, and non-daemonset controllers
          return name !== '__idle__' && 
                 name !== '__unallocated__' && 
                 allocation.properties?.controllerKind?.toLowerCase() === 'daemonset';
        })
        .map(([name, data]) => {
          const allocation = data as any;
          const cost = allocation.totalCost || 0;
          daemonsetsTotalCost += cost;
          
          // Extract namespace information
          const namespace = allocation.properties?.namespace || 'unknown';
          const controllerKind = allocation.properties?.controllerKind || 'DaemonSet';
          
          // Extract efficiency metric - convert to percentage
          const efficiency = allocation.totalEfficiency != null ? 
            allocation.totalEfficiency * 100 : 0;
          
          // Add to resource totals
          const cpuCost = allocation.cpuCost || 0;
          const ramCost = allocation.ramCost || 0;
          const pvCost = allocation.pvCost || 0;
          
          // Calculate network costs (sum of all network-related costs)
          const networkCost = (allocation.networkCost || 0) + 
                            (allocation.networkCrossZoneCost || 0) + 
                            (allocation.networkCrossRegionCost || 0) + 
                            (allocation.networkInternetCost || 0);
          
          // GPU costs
          const gpuCost = allocation.gpuCost || 0;
          
          // Add to resource totals
          totalCpuCost += cpuCost;
          totalRamCost += ramCost;
          totalPvCost += pvCost;
          totalNetworkCost += networkCost;
          totalGpuCost += gpuCost;
          
          // Calculate weighted efficiency
          const resourceCostForEfficiency = cpuCost + ramCost;
          weightedEfficiency += efficiency * resourceCostForEfficiency;
          totalResourceCostForEfficiency += resourceCostForEfficiency;
          
          // Create resource cost breakdown
          const resources: ResourceCost = {
            cpu: cpuCost,
            memory: ramCost,
            storage: pvCost,
            network: networkCost,
            gpu: gpuCost,
            total: cost
          };
          
          // Extract daemonset name from the controller name
          // Format is typically "namespace/daemonset-name"
          const daemonsetName = name.split('/').length > 1 ? name.split('/')[1] : name;
          
          return {
            name: daemonsetName,
            namespace: namespace,
            cost: cost,
            percentage: 0, // We'll calculate this after we have all costs
            efficiency: efficiency,
            resources: resources,
            controllerKind: controllerKind
          };
        })
        .sort((a, b) => b.cost - a.cost); // Sort by cost (highest first)
      
      // Calculate percentage based on total daemonset cost
      daemonsets.forEach(daemonset => {
        daemonset.percentage = daemonsetsTotalCost > 0 ? (daemonset.cost / daemonsetsTotalCost) * 100 : 0;
      });
      
      // Calculate overall efficiency
      const averageEfficiency = totalResourceCostForEfficiency > 0 
        ? weightedEfficiency / totalResourceCostForEfficiency 
        : 0;
      
      return { 
        daemonsets, 
        totalCost: daemonsetsTotalCost,
        cpuCost: totalCpuCost,
        ramCost: totalRamCost,
        pvCost: totalPvCost,
        networkCost: totalNetworkCost,
        gpuCost: totalGpuCost,
        efficiency: averageEfficiency
      };
    } catch (error) {
      console.error("Error processing OpenCost daemonset data:", error);
      return { 
        daemonsets: [], 
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
      <Card className="bg-white dark:bg-gray-800/20 border-gray-200/50 dark:border-gray-700/30 shadow-none">
        <CardContent className="p-6 flex justify-center items-center min-h-[200px]">
          <div className="flex flex-col items-center">
            <Loader2 className="h-8 w-8 animate-spin text-gray-500 mb-2" />
            <p className="text-gray-500">Loading daemonset cost data...</p>
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

  if (costData.daemonsets.length === 0) {
    return (
      <Card className="bg-white dark:bg-gray-800/20 border-gray-200/50 dark:border-gray-700/30 shadow-none">
        <CardContent className="p-6">
          <Alert>
            <AlertDescription>No daemonset cost data available. Make sure OpenCost is properly installed in your cluster.</AlertDescription>
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
      
      {/* DaemonSet Distribution Card */}
      <Card className="bg-white dark:bg-gray-800/20 border-gray-200/50 dark:border-gray-700/30 shadow-none">
        <CardContent className="p-6">
          <div className="space-y-5">
            {costData.daemonsets.map((daemonset, idx) => {
              // Safely access possibly undefined values
              const dsNetworkCost = daemonset.resources.network ?? 0;
              const dsGpuCost = daemonset.resources.gpu ?? 0;
              
              return (
                <div key={idx} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center">
                        <div className={`w-3 h-3 rounded-full ${getPercentageColor(daemonset.percentage)} mr-2 opacity-80`}></div>
                        <span className="text-md font-medium text-gray-700 dark:text-gray-300 cursor-pointer hover:underline hover:text-blue-600 dark:hover:text-blue-400"
                        onClick={() => {
                          navigate(`/dashboard/explore/daemonsets/${daemonset.namespace}/${daemonset.name}`);
                        }}
                        >{daemonset.name}</span>
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 ml-5">
                        <span className="cursor-pointer hover:underline text-blue-600 dark:text-blue-400" onClick={() => {
                          navigate(`/dashboard/explore/namespaces/${daemonset.namespace}`);
                        }}>Namespace: {daemonset.namespace}</span>
                      </div>
                      <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 ml-5 mt-1">
                        <Gauge className={`h-3 w-3 ${getEfficiencyColor(daemonset.efficiency)} mr-1`} />
                        <span className={`${getEfficiencyColor(daemonset.efficiency)}`}>
                          Efficiency: {round(daemonset.efficiency, 1)}%
                        </span>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">${formatCost(daemonset.cost)}</span>
                  </div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-[0.2rem]">
                    <div 
                      className={`h-3 ${getPercentageColor(daemonset.percentage)} rounded-[0.2rem]`}
                      style={{ width: `${Math.min(daemonset.percentage, 100)}%` }}
                    ></div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1">
                    <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                      <Cpu className="h-3 w-3 text-blue-500 mr-1" />
                      CPU: ${formatCost(daemonset.resources.cpu)}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                      <Database className="h-3 w-3 text-indigo-500 mr-1" />
                      Memory: ${formatCost(daemonset.resources.memory)}
                    </div>
                    {daemonset.resources.storage > 0 && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                        <HardDrive className="h-3 w-3 text-purple-500 mr-1" />
                        Storage: ${formatCost(daemonset.resources.storage)}
                      </div>
                    )}
                    {dsNetworkCost > 0 && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                        <Network className="h-3 w-3 text-green-500 mr-1" />
                        Network: ${formatCost(dsNetworkCost)}
                      </div>
                    )}
                    {dsGpuCost > 0 && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                        <svg className="h-3 w-3 text-yellow-500 mr-1" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M4 4h16v16H4V4zm1 1v14h14V5H5zm11 9v3h1v-3h-1zm-8 2v1h3v-1H8zm4 0v1h2v-1h-2z"/>
                        </svg>
                        GPU: ${formatCost(dsGpuCost)}
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

export default DaemonsetCostDistribution;