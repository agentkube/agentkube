import React, { useEffect, useState } from 'react';
import { useCluster } from '@/contexts/clusterContext';
import { kubeProxyRequest } from '@/api/cluster';
import { OpenCostAllocationResponse, ServiceCost, ResourceCost } from '@/types/opencost';
import { Card, CardContent } from "@/components/ui/card";
import { Cpu, Database, HardDrive, Network, Gauge, AlertCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { get, forEach, round, sortBy } from 'lodash';

interface ServiceCostSummary {
  services: ServiceCost[];
  idleCost: number;
  totalCost: number;
  cpuCost: number;
  ramCost: number;
  pvCost: number;
  networkCost: number;
  gpuCost: number;
  efficiency: number;
}

const ServiceCostDistribution: React.FC = () => {
  const { currentContext } = useCluster();
  const [costData, setCostData] = useState<ServiceCostSummary>({
    services: [],
    idleCost: 0,
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
    const fetchServiceCostData = async () => {
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
        
        // Build path and query parameters for service data
        const path = `api/v1/namespaces/${OPENCOST_NAMESPACE}/services/${OPENCOST_SERVICE}/proxy/model/allocation/compute`;
        const queryParams = new URLSearchParams({
          window: '48h',        // 48-hour window
          aggregate: 'service', // aggregate by service
          includeIdle: 'true',  // include idle resources
          accumulate: 'true'    // accumulate the values
        }).toString();
        
        const fullPath = `${path}?${queryParams}`;
        
        // Directly use kubeProxyRequest
        const response = await kubeProxyRequest(currentContext.name, fullPath, 'GET') as OpenCostAllocationResponse;
        
        // Transform the data
        const transformedData = transformOpenCostServiceData(response.data);
        setCostData(transformedData);
      } catch (err) {
        console.error("Error fetching OpenCost service data:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch service cost data");
      } finally {
        setLoading(false);
      }
    };
    
    fetchServiceCostData();
  }, [currentContext]);

  // Transform OpenCost service data to the format expected by the component
  const transformOpenCostServiceData = (data: Record<string, any>[]): ServiceCostSummary => {
    // If no data is available, return empty array
    if (!data || data.length === 0 || !data[0]) {
      return { 
        services: [], 
        idleCost: 0, 
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
      const serviceData = data[0];
      
      // Extract idle cost
      const idleCost = serviceData['__idle__']?.totalCost || 0;
      const idleCpuCost = serviceData['__idle__']?.cpuCost || 0;
      const idleRamCost = serviceData['__idle__']?.ramCost || 0;
      const idlePvCost = serviceData['__idle__']?.pvCost || 0;
      const idleNetworkCost = (serviceData['__idle__']?.networkCost || 0) + 
                            (serviceData['__idle__']?.networkCrossZoneCost || 0) + 
                            (serviceData['__idle__']?.networkCrossRegionCost || 0) + 
                            (serviceData['__idle__']?.networkInternetCost || 0);
      const idleGpuCost = serviceData['__idle__']?.gpuCost || 0;
      
      // Initialize resource totals
      let totalCpuCost = idleCpuCost;
      let totalRamCost = idleRamCost;
      let totalPvCost = idlePvCost;
      let totalNetworkCost = idleNetworkCost;
      let totalGpuCost = idleGpuCost;
      let servicesTotalCost = 0;
      let weightedEfficiency = 0;
      let totalResourceCostForEfficiency = 0;
      
      // Transform each service entry to the expected format
      const services = Object.entries(serviceData)
        .filter(([name, _]) => name !== '__idle__' && name !== '__unallocated__')
        .map(([name, data]) => {
          const allocation = data as any;
          const cost = allocation.totalCost || 0;
          servicesTotalCost += cost; // Add to total as we process each service
          
          // Extract namespace from properties
          const namespace = allocation.properties?.namespace || 'unknown';
          
          // Extract controller information if available
          const controller = allocation.properties?.controller;
          const controllerKind = allocation.properties?.controllerKind;
          
          // Add to resource totals
          const cpuCost = allocation.cpuCost || 0;
          const ramCost = allocation.ramCost || 0;
          const pvCost = allocation.pvCost || 0;
          const networkCost = (allocation.networkCost || 0) + 
                            (allocation.networkCrossZoneCost || 0) + 
                            (allocation.networkCrossRegionCost || 0) + 
                            (allocation.networkInternetCost || 0);
          const gpuCost = allocation.gpuCost || 0;
          
          // Add to resource totals
          totalCpuCost += cpuCost;
          totalRamCost += ramCost;
          totalPvCost += pvCost;
          totalNetworkCost += networkCost;
          totalGpuCost += gpuCost;
          
          // Calculate weighted efficiency
          const efficiency = allocation.totalEfficiency || 0;
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
          
          return {
            name: name,
            namespace: namespace,
            controller: controller,
            controllerKind: controllerKind,
            cost: cost,
            percentage: 0, // We'll calculate percentage after we have all costs
            efficiency: efficiency * 100, // Convert to percentage
            resources: resources
          };
        })
        .sort((a, b) => b.cost - a.cost); // Sort by cost (highest first)
      
      // Calculate percentage based on total service cost
      services.forEach(service => {
        service.percentage = servicesTotalCost > 0 ? (service.cost / servicesTotalCost) * 100 : 0;
      });
      
      // Overall total cost
      const totalCost = servicesTotalCost + idleCost;
      
      // Calculate overall efficiency
      const averageEfficiency = totalResourceCostForEfficiency > 0 
        ? weightedEfficiency / totalResourceCostForEfficiency 
        : 0;
      
      return { 
        services, 
        idleCost, 
        totalCost,
        cpuCost: totalCpuCost,
        ramCost: totalRamCost,
        pvCost: totalPvCost,
        networkCost: totalNetworkCost,
        gpuCost: totalGpuCost,
        efficiency: averageEfficiency
      };
    } catch (error) {
      console.error("Error processing OpenCost service data:", error);
      return { 
        services: [], 
        idleCost: 0, 
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
            <p className="text-gray-500">Loading service cost data...</p>
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

  if (costData.services.length === 0) {
    return (
      <Card className="bg-white dark:bg-gray-800/20 border-gray-200/50 dark:border-gray-700/30 shadow-lg">
        <CardContent className="p-6">
          <Alert>
            <AlertDescription>No service cost data available. Make sure OpenCost is properly installed in your cluster.</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      <Card className="bg-white dark:bg-gray-800/20 border-gray-200/50 dark:border-gray-700/30 shadow-lg">
        <CardContent className="p-6">
          <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-4">Service Cost Summary</h2>
          
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
            
            {costData.networkCost > 0 && (
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                  <Network className="h-3 w-3 text-green-500 mr-1" />
                  Network
                </div>
                <div className="text-lg font-bold text-gray-900 dark:text-white">${formatCost(costData.networkCost)}</div>
              </div>
            )}
            
            {costData.gpuCost > 0 && (
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                  <svg className="h-3 w-3 text-yellow-500 mr-1" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M4 4h16v16H4V4zm1 1v14h14V5H5zm11 9v3h1v-3h-1zm-8 2v1h3v-1H8zm4 0v1h2v-1h-2z"/>
                  </svg>
                  GPU
                </div>
                <div className="text-lg font-bold text-gray-900 dark:text-white">${formatCost(costData.gpuCost)}</div>
              </div>
            )}
            
            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
              <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                <Gauge className={`h-3 w-3 ${getEfficiencyColor(costData.efficiency)} mr-1`} />
                Efficiency
              </div>
              <div className={`text-lg font-bold ${getEfficiencyColor(costData.efficiency)}`}>
                {formatEfficiency(costData.efficiency)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Service Distribution Card */}
      <Card className="bg-white dark:bg-gray-800/20 border-gray-200/50 dark:border-gray-700/30 shadow-lg">
        <CardContent className="p-6">
          <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-4">Service Cost Distribution</h2>
          
          <div className="space-y-5">
            {costData.services.map((service, idx) => (
              <div key={idx} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center">
                      <div className={`w-3 h-3 rounded-full ${getPercentageColor(service.percentage)} mr-2 opacity-80`}></div>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{service.name}</span>
                    </div>
                    <div className="flex items-center flex-wrap text-xs text-gray-500 dark:text-gray-400 ml-5">
                      <span className="mr-4">Namespace: {service.namespace}</span>
                      {service.controller && (
                        <span className="mr-4">
                          {service.controllerKind || 'Controller'}: {service.controller}
                        </span>
                      )}
                      <div className="flex items-center">
                        <Gauge className={`h-3 w-3 ${getEfficiencyColor(service.efficiency)} mr-1`} />
                        <span className={`${getEfficiencyColor(service.efficiency)}`}>
                          Efficiency: {service.efficiency.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-gray-900 dark:text-white">${formatCost(service.cost)}</span>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full">
                  <div 
                    className={`h-2 ${getPercentageColor(service.percentage)} rounded-full`}
                    style={{ width: `${Math.min(service.percentage, 100)}%` }}
                  ></div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1">
                  <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                    <Cpu className="h-3 w-3 text-blue-500 mr-1" />
                    CPU: ${formatCost(service.resources.cpu)}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                    <Database className="h-3 w-3 text-indigo-500 mr-1" />
                    Memory: ${formatCost(service.resources.memory)}
                  </div>
                  {service.resources.storage > 0 && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                      <HardDrive className="h-3 w-3 text-purple-500 mr-1" />
                      Storage: ${formatCost(service.resources.storage)}
                    </div>
                  )}
                  {(service.resources.network || 0) > 0 && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                      <Network className="h-3 w-3 text-green-500 mr-1" />
                      Network: ${formatCost(service.resources.network || 0)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          {/* Idle costs */}
          {costData.idleCost > 0 && (
            <div className="mt-8 pt-5 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded-full bg-gray-400 mr-2 opacity-80"></div>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Idle Resources</span>
                </div>
                <span className="text-sm font-bold text-gray-900 dark:text-white">
                  ${formatCost(costData.idleCost)}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ServiceCostDistribution;