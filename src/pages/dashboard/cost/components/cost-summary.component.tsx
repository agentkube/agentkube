import React, { useEffect, useState } from 'react';
import { useCluster } from '@/contexts/clusterContext';
import { kubeProxyRequest } from '@/api/cluster';
import { ClusterCostSummary, DailyCost } from '@/types/opencost';
import { Card, CardContent } from "@/components/ui/card";
import { Cpu, Database, HardDrive, Network, AlertCircle, Loader2, Gauge } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import DailyCostTrend from './dailycost-trend.component';

interface CostSummaryProps {
  timeRange: string;
  onReload: () => Promise<void>;
}

const CostSummary: React.FC<CostSummaryProps> = ({ timeRange, onReload }) => {
  const { currentContext } = useCluster();
  const [costData, setCostData] = useState<ClusterCostSummary | null>(null);
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



  const fetchClusterCostData = async () => {
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

      // Build path and query parameters for daily trend data
      const trendPath = `api/v1/namespaces/${OPENCOST_NAMESPACE}/services/${OPENCOST_SERVICE}/proxy/model/allocation/compute`;
      const trendParams = new URLSearchParams({
        window: timeRange,     // use dynamic timeRange
        aggregate: 'cluster',  // aggregate by cluster
        includeIdle: 'true',   // include idle resources
        step: '24h',           // daily intervals
        accumulate: 'false'    // don't accumulate
      }).toString();

      const trendFullPath = `${trendPath}?${trendParams}`;

      // Build path and query parameters for current cost data
      const currentPath = `api/v1/namespaces/${OPENCOST_NAMESPACE}/services/${OPENCOST_SERVICE}/proxy/model/allocation/compute`;
      const currentParams = new URLSearchParams({
        window: timeRange,
        aggregate: 'cluster', // aggregate by cluster
        includeIdle: 'true',  // include idle resources
        accumulate: 'true'    // accumulate for accurate current state
      }).toString();

      const currentFullPath = `${currentPath}?${currentParams}`;

      // Fetch both trend data and current data in parallel
      const [trendResponse, currentResponse] = await Promise.all([
        kubeProxyRequest(currentContext.name, trendFullPath, 'GET'),
        kubeProxyRequest(currentContext.name, currentFullPath, 'GET')
      ]);

      // Handle different response structures - OpenCost might return data directly or nested
      const trendData = trendResponse?.data || trendResponse;
      const currentData = currentResponse?.data || currentResponse;

      // Transform and combine the data
      const transformedData = transformClusterCostData(
        trendData,
        currentData,
        currentContext.name
      );

      setCostData(transformedData);
    } catch (err) {
      console.error("Error fetching OpenCost data:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch cost data");
      setCostData(null);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    fetchClusterCostData();
  }, [currentContext, timeRange]);

  // useEffect(() => {
  //   const handleReload = async () => {
  //     if (onReload) {
  //       await onReload();
  //       await fetchClusterCostData();
  //     }
  //   };
  //   handleReload();
  // }, [onReload]);

  const transformClusterCostData = (
    trendData: any,
    currentData: any,
    clusterName: string
  ): ClusterCostSummary => {

    // Handle different OpenCost response formats
    let processedTrendData = trendData;
    let processedCurrentData = currentData;

    // OpenCost might return data directly as an object with timestamps as keys
    if (trendData && typeof trendData === 'object' && !Array.isArray(trendData)) {
      // Convert object to array of values
      processedTrendData = Object.values(trendData);
    }

    if (currentData && typeof currentData === 'object' && !Array.isArray(currentData)) {
      // Convert object to array of values
      processedCurrentData = Object.values(currentData);
    }

    // If no data is available, return empty data
    if ((!processedTrendData || processedTrendData.length === 0) && (!processedCurrentData || processedCurrentData.length === 0)) {
      return createEmptyClusterCostSummary(clusterName);
    }

    try {
      // Process daily trend data
      const dailyDataPoints: DailyCost[] = [];

      if (processedTrendData && processedTrendData.length > 0) {
        // Process each daily data point
        for (const dailyData of processedTrendData) {
          
          // Skip empty data points
          if (!dailyData || Object.keys(dailyData).length === 0) {
            continue;
          }

          // OpenCost cluster aggregation returns data with cluster name as key
          const clusterEntry = dailyData[clusterName];
          
          if (clusterEntry) {
            // Extract date from window
            const windowInfo = clusterEntry.window;
            let date;
            
            if (windowInfo?.start) {
              date = new Date(windowInfo.start);
            } else {
              date = new Date();
            }
            
            const formattedDate = date.toISOString().split('T')[0];

            // In cluster aggregation, there's no separate idle cost - it's all cluster cost
            const totalCost = clusterEntry.totalCost || 0;

            // Add to daily data points
            dailyDataPoints.push({
              date: formattedDate,
              idleCost: 0, // No separate idle cost in cluster aggregation
              activeCost: totalCost,
              totalCost: totalCost,
              cost: totalCost
            });
          }
        }

        // Sort daily data points by date
        dailyDataPoints.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      }

      // Process current accumulated data
      let totalIdleCost = 0;
      let totalActiveCost = 0;
      let totalCost = 0;
      let cpuCost = 0;
      let memoryCost = 0;
      let storageCost = 0;
      let networkCost = 0;
      let gpuCost = 0;
      let efficiency = 0;


      if (processedCurrentData && processedCurrentData.length > 0 && processedCurrentData[0]) {
        const currentDataPoint = processedCurrentData[0];
        
        const clusterEntry = currentDataPoint[clusterName];

        if (clusterEntry) {
          // Extract costs from current data - no separate idle in cluster aggregation
          totalIdleCost = 0; // No separate idle cost in cluster aggregation
          totalActiveCost = clusterEntry.totalCost || 0;
          totalCost = totalActiveCost;

          // Extract resource costs
          cpuCost = clusterEntry.cpuCost || 0;
          memoryCost = clusterEntry.ramCost || 0;
          storageCost = clusterEntry.pvCost || 0;

          // Calculate network costs (sum of all network-related costs)
          networkCost = (clusterEntry.networkCost || 0) +
            (clusterEntry.networkCrossZoneCost || 0) +
            (clusterEntry.networkCrossRegionCost || 0) +
            (clusterEntry.networkInternetCost || 0);

          // Extract GPU costs
          gpuCost = clusterEntry.gpuCost || 0;

          // Extract efficiency (convert to percentage)
          efficiency = (clusterEntry.totalEfficiency || 0) * 100;
        }
      }

      // Create window display text based on timeRange
      const getWindowDisplayText = (timeRange: string): string => {
        switch (timeRange) {
          case '24h': return 'Last 24 hours';
          case '48h': return 'Last 48 hours';
          case '7d': return 'Last 7 days';
          case '30d': return 'Last 30 days';
          default: return `Last ${timeRange}`;
        }
      };

      // Create and return the cluster cost summary
      return {
        clusterName,
        totalCost,
        idleCost: totalIdleCost,
        activeCost: totalActiveCost,
        window: getWindowDisplayText(timeRange),
        resources: {
          cpu: cpuCost,
          memory: memoryCost,
          storage: storageCost,
          network: networkCost,
          gpu: gpuCost,
          total: totalCost
        },
        efficiency,
        daily: dailyDataPoints
      };
    } catch (error) {
      return createEmptyClusterCostSummary(clusterName);
    }
  };

  // Helper to create empty cost summary when no data is available
  const createEmptyClusterCostSummary = (clusterName: string): ClusterCostSummary => {
    const getWindowDisplayText = (timeRange: string): string => {
      switch (timeRange) {
        case '24h': return 'Last 24 hours';
        case '48h': return 'Last 48 hours';
        case '7d': return 'Last 7 days';
        case '30d': return 'Last 30 days';
        default: return `Last ${timeRange}`;
      }
    };

    return {
      clusterName,
      totalCost: 0,
      idleCost: 0,
      activeCost: 0,
      window: getWindowDisplayText(timeRange),
      resources: {
        cpu: 0,
        memory: 0,
        storage: 0,
        network: 0,
        gpu: 0,
        total: 0
      },
      efficiency: 0,
      daily: []
    };
  };


  // Helper to get the text color for the efficiency value
  const getEfficiencyTextColor = (efficiency: number): string => {
    if (efficiency > 75) return 'text-green-600 dark:text-green-400';
    if (efficiency > 50) return 'text-blue-600 dark:text-blue-400';
    if (efficiency > 25) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
  };

  // Format currency values consistently
  const formatCurrency = (value: number): string => {
    return value.toFixed(2);
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

  if (!costData) {
    return (
      <Card className="bg-white dark:bg-gray-800/20 border-gray-200/50 dark:border-gray-700/30 shadow-none">
        <CardContent className="p-6">
          <Alert>
            <AlertDescription>No cost data available. Make sure OpenCost is properly installed in your cluster.</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Safely access possibly undefined values
  const networkCost = costData.resources.network ?? 0;
  const gpuCost = costData.resources.gpu ?? 0;

  return (
    <Card className="bg-white dark:bg-gray-800/20 border-gray-200/50 dark:border-gray-700/30 shadow-none">
      <CardContent className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left column - Cost summary */}
          <div className="flex flex-col space-y-2">



            <div className="space-y-1">
              <div className="flex justify-between items-baseline">
                <div>
                  <h1 className="text-3xl font-light"><span className='text-gray-500/30 dark:text-gray-400/40'>Total</span> Cost</h1>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {costData.window}
                  </div>
                </div>
                <div className="text-4xl font-light text-gray-900 dark:text-white">
                  ${formatCurrency(costData.totalCost)}
                </div>
              </div>



              <div className="grid grid-cols-2 gap-4 mt-4">
                <Card className="bg-transparent dark:bg-transparent rounded-md border border-gray-200 dark:border-gray-800/50 shadow-none min-h-36">
                  <CardContent className="py-2 flex flex-col h-full">
                    <div className="flex items-center gap-1 mb-auto">
                      <Database className="h-3 w-3 text-indigo-500" />
                      <h2 className="text-sm font-medium text-gray-800 dark:text-gray-500 uppercase">Active</h2>
                    </div>
                    <div className="mt-auto">
                      <p className="text-5xl font-light text-purple-600 dark:text-purple-400 mb-1">${formatCurrency(costData.activeCost)}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-transparent dark:bg-transparent rounded-md border border-gray-200 dark:border-gray-800/50 shadow-none min-h-36">
                  <CardContent className="py-2 flex flex-col h-full">
                    <div className="flex items-center gap-1 mb-auto">
                      <Database className="h-3 w-3 text-indigo-500" />
                      <h2 className="text-sm font-medium text-gray-800 dark:text-gray-500 uppercase">Idle</h2>
                    </div>
                    <div className="mt-auto">
                      <p className="text-5xl font-light text-purple-600 dark:text-purple-400 mb-1">${formatCurrency(costData.idleCost)}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

            </div>

            <div className="flex-1">
              <Card className="bg-transparent dark:bg-gray-700/10 rounded-md border border-gray-200 dark:border-gray-800/50 shadow-none h-full">
                <CardContent className="py-2 flex flex-col h-full">
                  <div className="flex items-center gap-1">
                    <Gauge className={`h-3 w-3 ${getEfficiencyTextColor(costData.efficiency).split(' ')[0]}`} />
                    <h2 className="text-sm uppercase font-medium text-gray-800 dark:text-gray-500">Efficiency</h2>
                  </div>
                  <div className="flex-1 flex items-center justify-center flex-col">
                    <p className={`text-6xl font-light mb-4 ${getEfficiencyTextColor(costData.efficiency)}`}>
                      {costData.efficiency.toFixed(1)}%
                    </p>
                    <div className="w-full h-2 bg-gray-200 dark:bg-gray-800/30 rounded-full">
                      <div
                        className={`h-2 rounded-full ${costData.efficiency > 75 ? 'bg-green-500' :
                          costData.efficiency > 50 ? 'bg-blue-500' :
                            costData.efficiency > 25 ? 'bg-amber-500' : 'bg-red-500'
                          }`}
                        style={{ width: `${Math.min(costData.efficiency, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>


          </div>

          {/* Right column - Cost trend */}
          <div className='space-y-2'>
            <div className="">
              <h3 className="text-sm uppercase font-light text-gray-700 dark:text-gray-300 mb-3">Cluster Breakdown</h3>
              <div className="grid grid-cols-3 gap-1">
                <Card className="bg-transparent dark:bg-transparent rounded-md border border-gray-200 dark:border-gray-800/50 shadow-none min-h-44">
                  <CardContent className="py-2 flex flex-col h-full">
                    <div className="flex items-center gap-1 mb-auto">
                      <Cpu className="h-3 w-3 text-blue-500" />
                      <h2 className="text-sm font-medium text-gray-800 dark:text-gray-500 uppercase">CPU</h2>
                    </div>
                    <div className="mt-auto">
                      <p className="text-5xl font-light text-blue-600 dark:text-blue-400 mb-1">${formatCurrency(costData.resources.cpu)}</p>
                      <div className="w-full h-1 bg-gray-200 dark:bg-gray-800/30 rounded-[0.3rem] mt-1">
                        <div
                          className="h-1 rounded-[0.3rem] bg-blue-500"
                          style={{
                            width: `${costData.resources.total > 0
                              ? Math.min((costData.resources.cpu / costData.resources.total) * 100, 100)
                              : 0}%`
                          }}
                        ></div>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {costData.resources.total > 0
                          ? Math.round(costData.resources.cpu / costData.resources.total * 100)
                          : 0}% of total
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-transparent dark:bg-transparent rounded-md border border-gray-200 dark:border-gray-800/50 shadow-none min-h-44">
                  <CardContent className="py-2 flex flex-col h-full">
                    <div className="flex items-center gap-1 mb-auto">
                      <Database className="h-3 w-3 text-indigo-500" />
                      <h2 className="text-sm font-medium text-gray-800 dark:text-gray-500 uppercase">Memory</h2>
                    </div>
                    <div className="mt-auto">
                      <p className="text-5xl font-light text-purple-600 dark:text-purple-400 mb-1">${formatCurrency(costData.resources.memory)}</p>
                      <div className="w-full h-1 bg-gray-200 dark:bg-gray-800/30 rounded-[0.3rem] mt-1">
                        <div
                          className="h-1 rounded-[0.3rem] bg-purple-500"
                          style={{
                            width: `${costData.resources.total > 0
                              ? Math.min((costData.resources.memory / costData.resources.total) * 100, 100)
                              : 0}%`
                          }}
                        ></div>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {costData.resources.total > 0
                          ? Math.round(costData.resources.memory / costData.resources.total * 100)
                          : 0}% of total
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-transparent dark:bg-transparent rounded-md border border-gray-200 dark:border-gray-800/50 shadow-none min-h-44">
                  <CardContent className="py-2 flex flex-col h-full">
                    <div className="flex items-center gap-1 mb-auto">
                      <HardDrive className="h-3 w-3 text-purple-500" />
                      <h2 className="text-sm font-medium text-gray-800 dark:text-gray-500 uppercase">Storage</h2>
                    </div>
                    <div className="mt-auto">
                      <p className="text-5xl font-light text-orange-600 dark:text-orange-400 mb-1">${formatCurrency(costData.resources.storage)}</p>
                      <div className="w-full h-1 bg-gray-200 dark:bg-gray-800/30 rounded-[0.3rem] mt-1">
                        <div
                          className="h-1 rounded-[0.3rem] bg-orange-500"
                          style={{
                            width: `${costData.resources.total > 0
                              ? Math.min((costData.resources.storage / costData.resources.total) * 100, 100)
                              : 0}%`
                          }}
                        ></div>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {costData.resources.total > 0
                          ? Math.round(costData.resources.storage / costData.resources.total * 100)
                          : 0}% of total
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {networkCost > 0 && (
                  <Card className="bg-transparent dark:bg-transparent rounded-md border border-gray-200 dark:border-gray-800/50 shadow-none min-h-44">
                    <CardContent className="py-2 flex flex-col h-full">
                      <div className="flex items-center gap-1 mb-auto">
                        <Network className="h-3 w-3 text-green-500" />
                        <h2 className="text-sm font-medium text-gray-800 dark:text-gray-500 uppercase">Network</h2>
                      </div>
                      <div className="mt-auto">
                        <p className="text-5xl font-light text-green-600 dark:text-green-400 mb-1">${formatCurrency(networkCost)}</p>
                        <div className="w-full h-1 bg-gray-200 dark:bg-gray-800/30 rounded-[0.3rem] mt-1">
                          <div
                            className="h-1 rounded-[0.3rem] bg-green-500"
                            style={{
                              width: `${costData.resources.total > 0
                                ? Math.min((networkCost / costData.resources.total) * 100, 100)
                                : 0}%`
                            }}
                          ></div>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {costData.resources.total > 0
                            ? Math.round((networkCost / costData.resources.total) * 100)
                            : 0}% of total
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {gpuCost > 0 && (
                  <Card className="bg-transparent dark:bg-transparent rounded-md border border-gray-200 dark:border-gray-800/50 shadow-none min-h-44">
                    <CardContent className="py-2 flex flex-col h-full">
                      <div className="flex items-center gap-1 mb-auto">
                        <svg className="h-3 w-3 text-yellow-500" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M4 4h16v16H4V4zm1 1v14h14V5H5zm11 9v3h1v-3h-1zm-8 2v1h3v-1H8zm4 0v1h2v-1h-2z" />
                        </svg>
                        <h2 className="text-sm font-medium text-gray-800 dark:text-gray-500 uppercase">GPU</h2>
                      </div>
                      <div className="mt-auto">
                        <p className="text-5xl font-light text-yellow-600 dark:text-yellow-400 mb-1">${formatCurrency(gpuCost)}</p>
                        <div className="w-full h-1 bg-gray-200 dark:bg-gray-800/30 rounded-[0.3rem] mt-1">
                          <div
                            className="h-1 rounded-[0.3rem] bg-yellow-500"
                            style={{
                              width: `${costData.resources.total > 0
                                ? Math.min((gpuCost / costData.resources.total) * 100, 100)
                                : 0}%`
                            }}
                          ></div>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {costData.resources.total > 0
                            ? Math.round((gpuCost / costData.resources.total) * 100)
                            : 0}% of total
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>

            <div>
              <h2 className="text-sm uppercase mb-2"><span className='text-gray-700/30 dark:text-gray-300/30 '>Daily</span> Cost Trend</h2>
              {costData.daily.length > 0 ? (
                <DailyCostTrend dailyCostData={costData.daily} />
              ) : (
                <div className="flex justify-center items-center h-64 bg-transparent dark:bg-gray-700/10 border dark:border-gray-700/30 rounded-lg">
                  <p className="text-gray-500 dark:text-gray-400">No trend data available</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default CostSummary;