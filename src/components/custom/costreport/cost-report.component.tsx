import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ArrowRight, AlertCircle, Loader2, ArrowUpRight, Download, Cpu, Database, HardDrive, Network, Gauge, Zap } from "lucide-react";
import { useCluster } from '@/contexts/clusterContext';
import { getOpenCostStatus } from '@/api/cost';
import { kubeProxyRequest } from '@/api/cluster';
import { useNavigate } from 'react-router-dom';
import { Progress } from '@/components/ui/progress';
// OpenCost API Response Interface
interface OpenCostClusterData {
  name: string;
  properties: {
    cluster: string;
  };
  window: {
    start: string;
    end: string;
  };
  start: string;
  end: string;
  minutes: number;
  cpuCores: number;
  cpuCoreRequestAverage: number;
  cpuCoreUsageAverage: number;
  cpuCoreHours: number;
  cpuCost: number;
  cpuCostAdjustment: number;
  cpuCostIdle: number;
  cpuEfficiency: number;
  gpuCount: number;
  gpuHours: number;
  gpuCost: number;
  gpuCostAdjustment: number;
  gpuCostIdle: number;
  gpuEfficiency: number;
  networkTransferBytes: number;
  networkReceiveBytes: number;
  networkCost: number;
  networkCrossZoneCost: number;
  networkCrossRegionCost: number;
  networkInternetCost: number;
  networkCostAdjustment: number;
  loadBalancerCost: number;
  loadBalancerCostAdjustment: number;
  pvBytes: number;
  pvByteHours: number;
  pvCost: number;
  pvs: null;
  pvCostAdjustment: number;
  ramBytes: number;
  ramByteRequestAverage: number;
  ramByteUsageAverage: number;
  ramByteHours: number;
  ramCost: number;
  ramCostAdjustment: number;
  ramCostIdle: number;
  ramEfficiency: number;
  externalCost: number;
  sharedCost: number;
  totalCost: number;
  totalEfficiency: number;
  lbAllocations: null;
  gpuAllocation: null;
}

interface CostData {
  current: OpenCostClusterData | null;
  lastUpdated: Date | null;
}

const CostOverviewReport = () => {
  const { currentContext } = useCluster();
  const navigate = useNavigate();
  const [isOpenCostInstalled, setIsOpenCostInstalled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [costData, setCostData] = useState<CostData>({
    current: null,
    lastUpdated: null
  });

  useEffect(() => {
    const checkOpenCostStatus = async () => {
      if (!currentContext?.name) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        // Check if OpenCost is installed
        const statusData = await getOpenCostStatus(currentContext.name);
        setIsOpenCostInstalled(statusData.status.installed);

        // If OpenCost is installed, fetch cost data
        if (statusData.status.installed) {
          await fetchCostData();
        }
      } catch (err) {
        console.error('Failed to check OpenCost status:', err);
        setError(err instanceof Error ? err.message : 'Failed to check OpenCost status');
        setIsOpenCostInstalled(false);
      } finally {
        setLoading(false);
      }
    };

    checkOpenCostStatus();
  }, [currentContext]);

  // Set up interval for fetching cost data every 10 seconds
  useEffect(() => {
    if (!isOpenCostInstalled || !currentContext?.name) return;

    const interval = setInterval(async () => {
      await fetchCostData();
    }, 5000); // 5 seconds

    return () => clearInterval(interval);
  }, [isOpenCostInstalled, currentContext]);


  const fetchCostData = async () => {
    if (!currentContext?.name || !isOpenCostInstalled) return;

    try {
      // Define constants
      const OPENCOST_NAMESPACE = 'opencost';
      const OPENCOST_SERVICE = 'opencost:9090';

      // Build path for 24h cost data
      const costPath = `api/v1/namespaces/${OPENCOST_NAMESPACE}/services/${OPENCOST_SERVICE}/proxy/model/allocation/compute`;
      const costParams = new URLSearchParams({
        window: '24h',
        aggregate: 'cluster',
        includeIdle: 'true',
        step: '1d',
        accumulate: 'false'
      }).toString();

      const costFullPath = `${costPath}?${costParams}`;

      // Fetch current 24h cost data
      const currentResponse = await kubeProxyRequest(currentContext.name, costFullPath, 'GET');

      // Extract data directly from OpenCost API response
      let currentClusterData: OpenCostClusterData | null = null;

      // Handle current response
      const currentData = currentResponse?.data || currentResponse;
      console.log('OpenCost API Response:', currentResponse);
      console.log('Current Data:', currentData);
      console.log('Cluster Name:', currentContext.name);

      if (currentData && currentData.length > 0) {
        currentClusterData = currentData[0][currentContext.name] || null;
        console.log('Extracted Cluster Data:', currentClusterData);
      }

      setCostData({
        current: currentClusterData,
        lastUpdated: new Date()
      });
    } catch (err) {
      console.error('Error fetching cost data:', err);
      // Don't set error state here, just log it
    }
  };

  const handleInstallOpenCost = () => {
    navigate('/dashboard/cost');
  };

  if (loading) {
    return (
      <Card className="bg-white dark:bg-gray-800/20 border-gray-200/50 dark:border-gray-700/30 shadow-lg">
        <CardContent className="p-6">
          <div className="flex justify-center items-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
            <span className="ml-2 text-gray-500">Loading cost data...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-white dark:bg-gray-800/20 border-gray-200/50 dark:border-gray-700/30 shadow-lg">
        <CardContent className="p-6">
          <div className="flex items-center text-red-500 gap-2 mb-2">
            <AlertCircle className="h-5 w-5" />
            <p>Error loading cost data</p>
          </div>
          <p className="text-sm text-gray-500">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/20 border-gray-200/50 border dark:border-gray-600/30">
      <CardContent className="p-5">
        <Tabs defaultValue="balance" className="w-full text-xs">
          <TabsList className="bg-gray-100 dark:bg-gray-900/30 mb-2">
            <TabsTrigger className='text-gray-700 dark:text-gray-300' value="balance">Cloud Cost</TabsTrigger>
            <TabsTrigger className='text-gray-700 dark:text-gray-300' value="audience">Resources</TabsTrigger>
            {/* <TabsTrigger className='text-gray-700 dark:text-gray-300' value="refunds">Alerts</TabsTrigger> */}
          </TabsList>

          <TabsContent value="balance">
            <div className="flex flex-col h-full space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-light text-gray-700 dark:text-gray-300">Last 24h</h2>
              </div>
              { }
              <div className="text-5xl font-light text-gray-900 dark:text-white">
                {isOpenCostInstalled ? (
                  <>
                    <span className="text-gray-500 dark:text-gray-400">$</span>
                    <span>{(costData.current?.totalCost || 0).toFixed(2)}</span>
                  </>
                ) : (
                  <span className="text-gray-500 dark:text-gray-400">Not Configured</span>
                )}
              </div>

              {/* <div className="flex items-center gap-2 mt-4">
                <div className="flex -space-x-2">
                  {Array.from({ length: Math.min(7, Math.ceil(clusterMetrics.namespaces / 2)) }).map((_, i) => (
                    <div key={i} className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 dark:from-gray-600 dark:to-gray-700 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-xs text-gray-700 dark:text-gray-300">
                      <Server className="h-4 w-4" />
                    </div>
                  ))}
                  {clusterMetrics.namespaces > 7 && (
                    <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-400/30 border border-indigo-300 dark:border-indigo-400/50 flex items-center justify-center text-xs text-indigo-700 dark:text-indigo-200">
                      +{clusterMetrics.namespaces - 7}
                    </div>
                  )}
                </div>
              </div> */}

              <div className="text-xs text-gray-500 dark:text-gray-400">
                Cluster cost data from OpenCost
              </div>

              <div className="flex-grow"></div>

              {isOpenCostInstalled && (
                <div className="mt-auto">
                  <Button className="bg-gray-100 hover:bg-gray-200 dark:bg-transparent dark:hover:bg-gray-700 flex justify-between w-44 text-gray-800 dark:text-white gap-2" onClick={() => navigate('/dashboard/cost')}>
                    Details <ArrowUpRight className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {!isOpenCostInstalled && (
                <div className="mt-auto">
                  <Button variant="outline" className="flex justify-between w-56 gap-2" onClick={handleInstallOpenCost}>
                    Install OpenCost <Download className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="audience" className="mt-0">
            <div className="space-y-3">
              {isOpenCostInstalled ? (
                <>
                  <h2 className="text-sm font-light text-gray-700 dark:text-gray-300 mb-3">Resource Breakdown (24h)</h2>

                  <div className="grid grid-cols-3 gap-2">
                    {/* CPU Cost */}
                    <div className="bg-transparent dark:bg-transparent border border-gray-200 dark:border-gray-800/50 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Cpu className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        <span className="text-xs font-medium text-blue-700 dark:text-blue-300 uppercase">CPU</span>
                      </div>
                      <div className="text-lg font-light text-blue-800 dark:text-blue-100">
                        ${(costData.current?.cpuCost || 0).toFixed(3)}
                      </div>
                    </div>

                    {/* RAM Cost */}
                    <div className="bg-transparent dark:bg-transparent border border-gray-200 dark:border-gray-800/50 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Database className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                        <span className="text-xs font-medium text-purple-700 dark:text-purple-300 uppercase">RAM</span>
                      </div>
                      <div className="text-lg font-light text-purple-800 dark:text-purple-100">
                        ${(costData.current?.ramCost || 0).toFixed(3)}
                      </div>
                    </div>

                    {/* Storage Cost */}
                    <div className="bg-transparent dark:bg-transparent border border-gray-200 dark:border-gray-800/50 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <HardDrive className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                        <span className="text-xs font-medium text-orange-700 dark:text-orange-300 uppercase">Storage</span>
                      </div>
                      <div className="text-lg font-light text-orange-800 dark:text-orange-100">
                        ${(costData.current?.pvCost || 0).toFixed(3)}
                      </div>
                    </div>

                    {/* Network Cost */}
                    <div className="bg-transparent dark:bg-transparent border border-gray-200 dark:border-gray-800/50 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Network className="h-4 w-4 text-green-600 dark:text-green-400" />
                        <span className="text-xs font-medium text-green-700 dark:text-green-300 uppercase">Network</span>
                      </div>
                      <div className="text-lg font-light text-green-800 dark:text-green-100">
                        ${((costData.current?.networkCost || 0) +
                          (costData.current?.networkCrossZoneCost || 0) +
                          (costData.current?.networkCrossRegionCost || 0) +
                          (costData.current?.networkInternetCost || 0)).toFixed(3)}
                      </div>
                    </div>

                    {/* GPU Cost - only show if > 0 */}
                    {(costData.current?.gpuCost || 0) > 0 && (
                      <div className="bg-transparent dark:bg-transparent border border-gray-200 dark:border-gray-800/50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Zap className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                          <span className="text-xs font-medium text-yellow-700 dark:text-yellow-300 uppercase">GPU</span>
                        </div>
                        <div className="text-lg font-light text-yellow-800 dark:text-yellow-100">
                          ${(costData.current?.gpuCost || 0).toFixed(3)}
                        </div>
                      </div>
                    )}

                    {/* Efficiency */}
                    <div className={`${((costData.current?.totalEfficiency || 0) * 100) > 75 ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/30' :
                      ((costData.current?.totalEfficiency || 0) * 100) > 50 ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/30' :
                        ((costData.current?.totalEfficiency || 0) * 100) > 25 ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/30' :
                          'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/30'} col-span-2 border rounded-lg p-3`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Gauge className={`h-4 w-4 ${((costData.current?.totalEfficiency || 0) * 100) > 75 ? 'text-green-600 dark:text-green-400' :
                          ((costData.current?.totalEfficiency || 0) * 100) > 50 ? 'text-blue-600 dark:text-blue-400' :
                            ((costData.current?.totalEfficiency || 0) * 100) > 25 ? 'text-amber-600 dark:text-amber-400' :
                              'text-red-600 dark:text-red-400'}`} />
                        <span className={`text-xs font-medium uppercase ${((costData.current?.totalEfficiency || 0) * 100) > 75 ? 'text-green-700 dark:text-green-300' :
                          ((costData.current?.totalEfficiency || 0) * 100) > 50 ? 'text-blue-700 dark:text-blue-300' :
                            ((costData.current?.totalEfficiency || 0) * 100) > 25 ? 'text-amber-700 dark:text-amber-300' :
                              'text-red-700 dark:text-red-300'}`}>Efficiency</span>
                      </div>
                      <div className={`text-lg font-light ${((costData.current?.totalEfficiency || 0) * 100) > 75 ? 'text-green-800 dark:text-green-100' :
                        ((costData.current?.totalEfficiency || 0) * 100) > 50 ? 'text-blue-800 dark:text-blue-100' :
                          ((costData.current?.totalEfficiency || 0) * 100) > 25 ? 'text-amber-800 dark:text-amber-100' :
                            'text-red-800 dark:text-red-100'}`}>
                        {((costData.current?.totalEfficiency || 0) * 100).toFixed(1)}%
                        <Progress className='h-1' value={(costData.current?.totalEfficiency || 0) * 100} />
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <Button className="bg-gray-100 hover:bg-gray-200 dark:bg-transparent dark:hover:bg-gray-700 flex justify-between w-44 text-gray-800 dark:text-white gap-2" onClick={() => navigate('/dashboard/cost')}>
                      Full Details <ArrowUpRight className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300">Resource Utilization</h2>
                  <p className="text-gray-500 dark:text-gray-400">
                    Install OpenCost to track resource utilization and costs.
                  </p>
                  <div className="flex">
                    <Button variant="outline" onClick={handleInstallOpenCost}>
                      Install OpenCost <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          </TabsContent>

          {/* <TabsContent value="refunds" className="mt-0">
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300">Cost Alerts</h2>
              <p className="text-gray-500 dark:text-gray-400">
                {isOpenCostInstalled 
                  ? "No active cost alerts at this time." 
                  : "Install OpenCost to set up and receive cost alerts."}
              </p>
              <div className="flex justify-end">
                {isOpenCostInstalled ? (
                  <Button className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-white gap-2" onClick={() => window.location.href = '/costs'}>
                    Manage Alerts <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-2" onClick={handleInstallOpenCost}>
                    Install OpenCost <ArrowRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </TabsContent> */}
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default CostOverviewReport;