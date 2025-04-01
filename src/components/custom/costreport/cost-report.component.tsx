import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ArrowRight, Server, AlertCircle, Loader2 } from "lucide-react";
import { useCluster } from '@/contexts/clusterContext';
import { getOpenCostStatus } from '@/api/cost';
import { kubeProxyRequest } from '@/api/cluster';
import { useNavigate } from 'react-router-dom';
interface CostData {
  monthlyCost: number;
  changePercentage: number;
  lastUpdated: Date | null;
}

const CostOverviewReport = () => {
  const { currentContext } = useCluster();
  const navigate = useNavigate();
  const [isOpenCostInstalled, setIsOpenCostInstalled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clusterMetrics, setClusterMetrics] = useState({ pods: 0, namespaces: 0 });
  const [costData, setCostData] = useState<CostData>({
    monthlyCost: 0,
    changePercentage: 0,
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

        // Fetch basic cluster metrics regardless of OpenCost status
        await fetchClusterMetrics();

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

  const fetchClusterMetrics = async () => {
    if (!currentContext?.name) return;

    try {

      const podsResponse = await kubeProxyRequest(
        currentContext.name, 
        'api/v1/pods?limit=1',
        'GET'
      );

      const namespacesResponse = await kubeProxyRequest(
        currentContext.name, 
        'api/v1/namespaces?limit=1',
        'GET'
      );

      setClusterMetrics({
        pods: podsResponse.metadata?.remainingItemCount + 1 || 0,
        namespaces: namespacesResponse.metadata?.remainingItemCount + 1 || 0
      });
    } catch (err) {
      console.error('Error fetching cluster metrics:', err);
    }
  };

  const fetchCostData = async () => {
    if (!currentContext?.name || !isOpenCostInstalled) return;

    try {
      // Define constants
      const OPENCOST_NAMESPACE = 'opencost';
      const OPENCOST_SERVICE = 'opencost:9090';

      // Build path for monthly cost data
      const costPath = `api/v1/namespaces/${OPENCOST_NAMESPACE}/services/${OPENCOST_SERVICE}/proxy/model/allocation/compute`;
      const costParams = new URLSearchParams({
        window: '7d',      
        aggregate: 'cluster',  // aggregate by cluster
        includeIdle: 'true',   // include idle resources
        accumulate: 'true'     // accumulate costs
      }).toString();

      // Previous month for comparison
      const prevCostPath = `api/v1/namespaces/${OPENCOST_NAMESPACE}/services/${OPENCOST_SERVICE}/proxy/model/allocation/compute`;
      const prevCostParams = new URLSearchParams({
        window: '60d',        
        offset: '30d',         // offset by 30 days to get previous month
        aggregate: 'cluster',  // aggregate by cluster
        includeIdle: 'true',   // include idle resources
        accumulate: 'true'     // accumulate costs
      }).toString();

      const costFullPath = `${costPath}?${costParams}`;
      const prevCostFullPath = `${prevCostPath}?${prevCostParams}`;

      // Fetch both current month and previous month cost data
      const [currentResponse, prevResponse] = await Promise.all([
        kubeProxyRequest(currentContext.name, costFullPath, 'GET'),
        kubeProxyRequest(currentContext.name, prevCostFullPath, 'GET')
      ]);

      // Extract data or use default values
      let monthlyCost = 0;
      let prevMonthCost = 0;
      
      if (currentResponse?.data && currentResponse.data.length > 0) {
        const clusterData = currentResponse.data[0][currentContext.name];
        const idleData = currentResponse.data[0]['__idle__'];
        
        monthlyCost = (clusterData?.totalCost || 0) + (idleData?.totalCost || 0);
      }
      
      if (prevResponse?.data && prevResponse.data.length > 0) {
        const prevClusterData = prevResponse.data[0][currentContext.name];
        const prevIdleData = prevResponse.data[0]['__idle__'];
        
        prevMonthCost = (prevClusterData?.totalCost || 0) + (prevIdleData?.totalCost || 0);
      }

      // Calculate percentage change
      const changePercentage = prevMonthCost > 0 
        ? ((monthlyCost - prevMonthCost) / prevMonthCost) * 100 
        : 0;

      setCostData({
        monthlyCost: monthlyCost,
        changePercentage: changePercentage,
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
    <Card className="bg-white dark:bg-gray-800/20 border-gray-200/50 dark:border-gray-700/30 shadow-lg">
      <CardContent className="p-6">
        <Tabs defaultValue="balance" className="w-full">
          <TabsList className="bg-gray-100 dark:bg-gray-900/30 mb-4">
            <TabsTrigger className='text-gray-700 dark:text-gray-300' value="balance">Cloud Cost</TabsTrigger>
            <TabsTrigger className='text-gray-700 dark:text-gray-300' value="audience">Resources</TabsTrigger>
            {/* <TabsTrigger className='text-gray-700 dark:text-gray-300' value="refunds">Alerts</TabsTrigger> */}
          </TabsList>
          
          <TabsContent value="balance" className="mt-0">
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300">Monthly Spend</h2>
                {isOpenCostInstalled ? (
                  <span className={`px-2 py-0.5 ${costData.changePercentage >= 0 ? 'bg-green-500/20 text-green-500 dark:text-green-400' : 'bg-red-500/20 text-red-500 dark:text-red-400'} text-xs rounded-full`}>
                    {costData.changePercentage >= 0 ? '+' : ''}{costData.changePercentage.toFixed(1)}%
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-gray-500/20 text-gray-500 dark:text-gray-400 text-xs rounded-full">
                    Not Available
                  </span>
                )}
              </div>
              
              <div className="text-5xl font-bold text-gray-900 dark:text-white">
                {isOpenCostInstalled ? (
                  <>
                    <span className="text-gray-500 dark:text-gray-400">$</span>
                    {Math.round(costData.monthlyCost)}
                    <span className="text-gray-500 dark:text-gray-400">.{Math.round((costData.monthlyCost % 1) * 100).toString().padStart(2, '0')}</span>
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
              
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Running {clusterMetrics.pods} pods across {clusterMetrics.namespaces} namespaces.
              </div>
              
              <div className="flex justify-end">
                {isOpenCostInstalled ? (
                  <Button className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-white gap-2" onClick={() => navigate('/dashboard/cost')}>
                    Details <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-2" onClick={handleInstallOpenCost}>
                    Install OpenCost <ArrowRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="audience" className="mt-0">
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300">Resource Utilization</h2>
              <p className="text-gray-500 dark:text-gray-400">
                {isOpenCostInstalled 
                  ? "View detailed resource utilization and cost data on the Cost Overview page." 
                  : "Install OpenCost to track resource utilization and costs."}
              </p>
              <div className="flex justify-end">
                {isOpenCostInstalled ? (
                  <Button className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-white gap-2" onClick={() => window.location.href = '/costs'}>
                    View Details <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-2" onClick={handleInstallOpenCost}>
                    Install OpenCost <ArrowRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
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