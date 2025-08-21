import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Download,
  RefreshCcw,
  ChevronDown,
  Check,
  Settings
} from "lucide-react";
import { useCluster } from '@/contexts/clusterContext';
import NamespaceCostDistribution from './components/namespace-cost-distribution.component';
import ServiceCostDistribution from './components/service-cost-distribution.component';
import NodeCostDistribution from './components/node-cost-distribution.component';
import CostSummary from './components/cost-summary.component';
import PodCostDistribution from './components/pod-cost-distribution.component';
import { OpenCostInstaller } from '@/components/custom';
import ProxyConfigDialog from '@/components/custom/proxyconfigdialog/proxyconfigdialog.component';
import DeploymentCostDistribution from './components/deployment-cost-distribution.component';
import DaemonsetCostDistribution from './components/daemonset-cost-distribution.component';
import StatefulsetCostDistribution from './components/statefulset-cost-distribution.component';
import { getOpenCostStatus } from '@/api/cost';

const CostOverview: React.FC = () => {
  const { currentContext } = useCluster();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<string>("7d");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isOpenCostInstalled, setIsOpenCostInstalled] = useState<boolean | null>(null);
  const [openCostStatus, setOpenCostStatus] = useState<any>(null);
  const [refreshInterval, setRefreshInterval] = useState<string>('Off');
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);
  const [openCostConfig, setOpenCostConfig] = useState<{
    namespace: string;
    service: string;
  }>({
    namespace: 'opencost',
    service: 'opencost:9090'
  });

  // Check if OpenCost is installed
  useEffect(() => {
    const checkOpenCostStatus = async () => {
      if (!currentContext) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const statusData = await getOpenCostStatus(currentContext.name);
        console.log('OpenCost status:', statusData);
        setOpenCostStatus(statusData);
        setIsOpenCostInstalled(statusData.status.installed);
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

  const handleSaveConfig = useCallback((config: { namespace: string; service: string }) => {
    if (!currentContext) return;

    setOpenCostConfig(config);
    console.log('Saving OpenCost config:', config);
    
    try {
      const configKey = `${currentContext.name}.openCostConfig`;
      const configToSave = {
        externalConfig: {
          opencost: config
        }
      };
      localStorage.setItem(configKey, JSON.stringify(configToSave));
    } catch (err) {
      console.error('Error saving OpenCost config:', err);
    }
  }, [currentContext]);

  useEffect(() => {
    if (currentContext) {
      loadOpenCostConfig();
    }
  }, [currentContext, loadOpenCostConfig]);



  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Check OpenCost status again
      if (currentContext) {
        const statusData = await getOpenCostStatus(currentContext.name);
        setIsOpenCostInstalled(statusData.status.installed);
        setOpenCostStatus(statusData);
      }

    } catch (err) {
      console.error('Error refreshing data:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleInstallComplete = async () => {
    // After installation, check status again
    if (currentContext) {
      try {
        const statusData = await getOpenCostStatus(currentContext.name);
        setIsOpenCostInstalled(statusData.status.installed);
        setOpenCostStatus(statusData);
      } catch (err) {
        console.error('Failed to verify installation:', err);
      }
    }
  };

  const handleRefreshIntervalChange = useCallback((interval: string) => {
    setRefreshInterval(interval);
    
    // Clear existing timer
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    // Set up new timer if not 'Off'
    if (interval !== 'Off' && interval !== 'Auto') {
      const intervalMs = parseIntervalToMs(interval);
      refreshTimerRef.current = setInterval(() => {
        handleRefresh();
      }, intervalMs);
    }
  }, []);

  const parseIntervalToMs = (interval: string): number => {
    switch (interval) {
      case '5s': return 5000;
      case '10s': return 10000;
      case '30s': return 30000;
      case '1m': return 60000;
      case '5m': return 300000;
      case '15m': return 900000;
      case '30m': return 1800000;
      case '1h': return 3600000;
      case '2h': return 7200000;
      case '1d': return 86400000;
      default: return 60000;
    }
  };

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, []);

  // Show loading state
  if (loading && isOpenCostInstalled === null) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-700 dark:border-gray-300 mx-auto"></div>
          <p className="mt-4 text-gray-700 dark:text-gray-300">Checking OpenCost status...</p>
        </div>
      </div>
    );
  }


  if (isOpenCostInstalled === false) {
    return <OpenCostInstaller loading={loading} onInstall={handleInstallComplete}
    />;
  }

  return (
    <div className="max-h-[92vh] 
      overflow-y-auto
      [&::-webkit-scrollbar]:w-1.5 
      [&::-webkit-scrollbar-track]:bg-transparent 
      [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
      [&::-webkit-scrollbar-thumb]:rounded-full
      [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50
    ">
      <div className="p-6 mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-5xl dark:text-gray-500/40 font-[Anton] uppercase font-bold">Cost Overview</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">View and analyze your cluster costs</p>
            {openCostStatus?.status.version && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                OpenCost version: {openCostStatus.status.version.substring(0, 8)}...
              </p>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
 
            <Select defaultValue={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-32 dark:bg-transparent dark:text-white">
                <SelectValue placeholder="Time Range" />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-900/20 backdrop-blur-md dark:text-white dark:border-gray-700">
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="24h">Last 24 hours</SelectItem>
                <SelectItem value="48h">Last 48 hours</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="14d">Last 14 days</SelectItem>
                <SelectItem value="lastweek">Last Week</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              {/* Refresh Button */}
              <DropdownMenu>
                <div className="flex items-center">
                  <Button
                    variant="outline"
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="flex items-center gap-2 rounded-r-none border-r-0"
                  >
                    <RefreshCcw className={`h-4 w-4 text-gray-600 dark:text-gray-300 ${isRefreshing ? 'animate-spin' : ''}`} />
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      {refreshInterval}
                    </span>
                  </Button>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="flex items-center px-2 rounded-l-none"
                    >
                      <ChevronDown className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                    </Button>
                  </DropdownMenuTrigger>
                </div>
                <DropdownMenuContent
                  align="end"
                  className="w-20 bg-white dark:bg-[#0B0D13]/40 backdrop-blur-md border border-gray-200 dark:border-gray-700/40"
                >
                  {['Off', 'Auto', '5s', '10s', '30s', '1m', '5m', '15m', '30m', '1h', '2h', '1d'].map((interval) => (
                    <DropdownMenuItem
                      key={interval}
                      onClick={() => handleRefreshIntervalChange(interval)}
                      className="flex items-center justify-between px-3 py-2 cursor-pointer"
                    >
                      <span className="text-xs text-gray-700 dark:text-gray-300">
                        {interval}
                      </span>
                      {refreshInterval === interval && (
                        <Check className="h-4 w-4 text-blue-500" />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="outline"
                className="flex items-center gap-1"
              >
                <Download className="h-4 w-4" />
                Export
              </Button>
            </div>
            <Button
              variant="outline"
              onClick={() => setIsConfigDialogOpen(true)}
              className="flex items-center gap-1"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <ProxyConfigDialog
          isOpen={isConfigDialogOpen}
          onClose={() => setIsConfigDialogOpen(false)}
          onSave={handleSaveConfig}
          defaultConfig={openCostConfig}
          serviceName="OpenCost"
          serviceDescription="Configure the OpenCost service connection details if it's installed in a different namespace or with a custom service name."
          defaultNamespace="opencost"
          defaultService="opencost:9090"
        />

        <CostSummary
          timeRange={timeRange}
          onReload={handleRefresh}
        />

        <Tabs defaultValue="namespaces" className="w-full">
          <TabsList className="text-sm bg-gray-100 dark:bg-transparent mb-4">
            <TabsTrigger className='text-gray-700 dark:text-gray-300' value="namespaces">Namespaces</TabsTrigger>
            <TabsTrigger className='text-gray-700 dark:text-gray-300' value="services">Services</TabsTrigger>
            <TabsTrigger className='text-gray-700 dark:text-gray-300' value="nodes">Nodes</TabsTrigger>
            <TabsTrigger className='text-gray-700 dark:text-gray-300' value="pods">Pods</TabsTrigger>
            <TabsTrigger className='text-gray-700 dark:text-gray-300' value="deployments">Deployments</TabsTrigger>
            <TabsTrigger className='text-gray-700 dark:text-gray-300' value="daemonsets">Daemonsets</TabsTrigger>
            <TabsTrigger className='text-gray-700 dark:text-gray-300' value="statefulsets">Statefulsets</TabsTrigger>
          </TabsList>

          <TabsContent value="namespaces" className="mt-0">
            <NamespaceCostDistribution timeRange={timeRange} onReload={handleRefresh} />
          </TabsContent>
          <TabsContent value="services" className="mt-0">
            <ServiceCostDistribution timeRange={timeRange} onReload={handleRefresh} />
          </TabsContent>
          <TabsContent value="nodes" className="mt-0">
            <NodeCostDistribution timeRange={timeRange} onReload={handleRefresh} />
          </TabsContent>
          <TabsContent value="pods" className="mt-0">
            <PodCostDistribution timeRange={timeRange} onReload={handleRefresh} />
          </TabsContent>
          <TabsContent value="deployments" className="mt-0">
            <DeploymentCostDistribution timeRange={timeRange} onReload={handleRefresh} />
          </TabsContent>
          <TabsContent value="daemonsets" className="mt-0">
            <DaemonsetCostDistribution timeRange={timeRange} onReload={handleRefresh} />
          </TabsContent>
          <TabsContent value="statefulsets" className="mt-0">
            <StatefulsetCostDistribution timeRange={timeRange} onReload={handleRefresh} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default CostOverview;