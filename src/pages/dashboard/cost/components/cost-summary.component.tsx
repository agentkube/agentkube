import React, { useEffect, useState } from 'react';
import { useCluster } from '@/contexts/clusterContext';
import { kubeProxyRequest } from '@/api/cluster';
import { OpenCostAllocationResponse, ClusterCostSummary, DailyCost } from '@/types/opencost';
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
      const OPENCOST_NAMESPACE = 'opencost';
      const OPENCOST_SERVICE = 'opencost:9090';

      // Build path and query parameters for daily trend data
      const trendPath = `api/v1/namespaces/${OPENCOST_NAMESPACE}/services/${OPENCOST_SERVICE}/proxy/model/allocation/compute`;
      const trendParams = new URLSearchParams({
        window: '7d',          // 7 day window
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
        kubeProxyRequest(currentContext.name, trendFullPath, 'GET') as Promise<OpenCostAllocationResponse>,
        kubeProxyRequest(currentContext.name, currentFullPath, 'GET') as Promise<OpenCostAllocationResponse>
      ]);

      // Transform and combine the data
      const transformedData = transformClusterCostData(
        trendResponse.data,
        currentResponse.data,
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
    trendData: Record<string, any>[],
    currentData: Record<string, any>[],
    clusterName: string
  ): ClusterCostSummary => {
    // If no data is available, return empty data
    if ((!trendData || trendData.length === 0) && (!currentData || currentData.length === 0)) {
      return createEmptyClusterCostSummary(clusterName);
    }

    try {
      // Process daily trend data
      const dailyDataPoints: DailyCost[] = [];

      if (trendData && trendData.length > 0) {
        // Process each daily data point
        for (const dailyData of trendData) {
          // Skip empty data points
          if (Object.keys(dailyData).length === 0) continue;

          // Find the idle entry and the cluster entry
          const idleEntry = dailyData['__idle__'];
          const clusterEntry = dailyData[clusterName];

          // Skip if we don't have both entries
          if (!idleEntry || !clusterEntry) continue;

          // Extract date from timestamp
          const date = new Date(clusterEntry.window.start);
          const formattedDate = date.toISOString().split('T')[0];

          // Add to daily data points
          dailyDataPoints.push({
            date: formattedDate,
            idleCost: idleEntry.totalCost || 0,
            activeCost: clusterEntry.totalCost || 0,
            totalCost: (idleEntry.totalCost || 0) + (clusterEntry.totalCost || 0),
            cost: (idleEntry.totalCost || 0) + (clusterEntry.totalCost || 0)
          });
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

      if (currentData && currentData.length > 0 && currentData[0]) {
        const currentDataPoint = currentData[0];
        const idleEntry = currentDataPoint['__idle__'];
        const clusterEntry = currentDataPoint[clusterName];

        if (idleEntry && clusterEntry) {
          // Extract costs from current data
          totalIdleCost = idleEntry.totalCost || 0;
          totalActiveCost = clusterEntry.totalCost || 0;
          totalCost = totalIdleCost + totalActiveCost;

          // Extract resource costs
          cpuCost = (idleEntry.cpuCost || 0) + (clusterEntry.cpuCost || 0);
          memoryCost = (idleEntry.ramCost || 0) + (clusterEntry.ramCost || 0);
          storageCost = (idleEntry.pvCost || 0) + (clusterEntry.pvCost || 0);

          // Calculate network costs (sum of all network-related costs)
          networkCost = (clusterEntry.networkCost || 0) +
            (clusterEntry.networkCrossZoneCost || 0) +
            (clusterEntry.networkCrossRegionCost || 0) +
            (clusterEntry.networkInternetCost || 0);

          // Extract GPU costs
          gpuCost = (idleEntry.gpuCost || 0) + (clusterEntry.gpuCost || 0);

          // Extract efficiency (convert to percentage)
          efficiency = (clusterEntry.totalEfficiency || 0) * 100;
        }
      }

      // Create and return the cluster cost summary
      return {
        clusterName,
        totalCost,
        idleCost: totalIdleCost,
        activeCost: totalActiveCost,
        window: "Last 48 hours",
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
      console.error("Error processing OpenCost cluster data:", error);
      return createEmptyClusterCostSummary(clusterName);
    }
  };

  // Helper to create empty cost summary when no data is available
  const createEmptyClusterCostSummary = (clusterName: string): ClusterCostSummary => {
    return {
      clusterName,
      totalCost: 0,
      idleCost: 0,
      activeCost: 0,
      window: "Last 48 hours",
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

  // Helper to get the background color for the efficiency indicator
  const getEfficiencyColor = (efficiency: number): string => {
    if (efficiency > 75) return 'bg-green-500';
    if (efficiency > 50) return 'bg-blue-500';
    if (efficiency > 25) return 'bg-amber-500';
    return 'bg-red-500';
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

  if (!costData) {
    return (
      <Card className="bg-white dark:bg-gray-800/20 border-gray-200/50 dark:border-gray-700/30 shadow-lg">
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
    <Card className="bg-white dark:bg-gray-800/20 border-gray-200/50 dark:border-gray-700/30 shadow-lg">
      <CardContent className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left column - Cost summary */}
          <div className="space-y-4">

            <div className="space-y-2">
              <div className="flex justify-between items-baseline">
                <h1 className="text-gray-500/30 dark:text-gray-400/40 text-4xl font-[Anton] uppercase">Total Cost</h1>
                <div className="text-3xl font-bold text-gray-900 dark:text-white">
                  ${formatCurrency(costData.totalCost)}
                </div>
              </div>

              <div className="text-xs text-gray-500 dark:text-gray-400">
                {costData.window}
              </div>

              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg">
                  <div className="text-sm text-gray-500 dark:text-gray-400">Active</div>
                  <div className="text-xl font-semibold text-green-600 dark:text-green-400">
                    ${formatCurrency(costData.activeCost)}
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg">
                  <div className="text-sm text-gray-500 dark:text-gray-400">Idle</div>
                  <div className="text-xl font-semibold text-gray-600 dark:text-gray-400">
                    ${formatCurrency(costData.idleCost)}
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 space-y-2">
              <div className="flex justify-between items-center">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Efficiency Score</div>
                <div className={`text-lg font-bold ${getEfficiencyTextColor(costData.efficiency)}`}>
                  {costData.efficiency.toFixed(1)}%
                </div>
              </div>
              <div className="h-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full">
                <div
                  className={`h-2 ${getEfficiencyColor(costData.efficiency)} rounded-full`}
                  style={{ width: `${Math.min(costData.efficiency, 100)}%` }}
                ></div>
              </div>
            </div>

            <div className="pt-4">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Cluster Breakdown</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Cpu className="h-4 w-4 text-blue-500" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">CPU</span>
                  </div>
                  <div className="text-lg font-bold text-gray-900 dark:text-white">${formatCurrency(costData.resources.cpu)}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {costData.resources.total > 0
                      ? Math.round(costData.resources.cpu / costData.resources.total * 100)
                      : 0}% of total
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Database className="h-4 w-4 text-indigo-500" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Memory</span>
                  </div>
                  <div className="text-lg font-bold text-gray-900 dark:text-white">${formatCurrency(costData.resources.memory)}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {costData.resources.total > 0
                      ? Math.round(costData.resources.memory / costData.resources.total * 100)
                      : 0}% of total
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <HardDrive className="h-4 w-4 text-purple-500" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Storage</span>
                  </div>
                  <div className="text-lg font-bold text-gray-900 dark:text-white">${formatCurrency(costData.resources.storage)}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {costData.resources.total > 0
                      ? Math.round(costData.resources.storage / costData.resources.total * 100)
                      : 0}% of total
                  </div>
                </div>

                {networkCost > 0 && (
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Network className="h-4 w-4 text-green-500" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Network</span>
                    </div>
                    <div className="text-lg font-bold text-gray-900 dark:text-white">${formatCurrency(networkCost)}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {costData.resources.total > 0
                        ? Math.round((networkCost / costData.resources.total) * 100)
                        : 0}% of total
                    </div>
                  </div>
                )}

                {gpuCost > 0 && (
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <svg className="h-4 w-4 text-yellow-500" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M4 4h16v16H4V4zm1 1v14h14V5H5zm11 9v3h1v-3h-1zm-8 2v1h3v-1H8zm4 0v1h2v-1h-2z" />
                      </svg>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">GPU</span>
                    </div>
                    <div className="text-lg font-bold text-gray-900 dark:text-white">${formatCurrency(gpuCost)}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {costData.resources.total > 0
                        ? Math.round((gpuCost / costData.resources.total) * 100)
                        : 0}% of total
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right column - Cost trend */}
          <div>
            <h2 className="text-4xl font-[Anton] uppercase font-semibold text-gray-700/30 dark:text-gray-300/30 mb-4">Daily Cost Trend</h2>
            {costData.daily.length > 0 ? (
              <DailyCostTrend dailyCostData={costData.daily} />
            ) : (
              <div className="flex justify-center items-center h-64 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                <p className="text-gray-500 dark:text-gray-400">No trend data available</p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default CostSummary;