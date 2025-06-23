import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Download,
  RefreshCcw
} from "lucide-react";
import { useCluster } from '@/contexts/clusterContext';
import NamespaceCostDistribution from './components/namespace-cost-distribution.component';
import ServiceCostDistribution from './components/service-cost-distribution.component';
import NodeCostDistribution from './components/node-cost-distribution.component';
import CostSummary from './components/cost-summary.component';
import PodCostDistribution from './components/pod-cost-distribution.component';
import { OpenCostInstaller } from '@/components/custom';
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
    <div className="max-h-[92vh] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-700 scrollbar-track-transparent [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-400/30 dark:[&::-webkit-scrollbar-thumb]:bg-gray-700/30 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-gray-400/50 dark:[&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">
      <div className="p-6 max-w-6xl mx-auto space-y-6">
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
          <div className="flex flex-col sm:flex-row gap-3">
            <Select defaultValue={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-32 dark:bg-gray-900 dark:text-white dark:border-gray-800/50">
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
              <Button
                variant="outline"
                size="icon"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex items-center gap-1"
              >
                <RefreshCcw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                variant="outline"
                className="flex items-center gap-1"
              >
                <Download className="h-4 w-4" />
                Export
              </Button>
            </div>
          </div>
        </div>

        <CostSummary
          timeRange={timeRange}
          onReload={handleRefresh}
        />

        <Tabs defaultValue="namespaces" className="w-full">
          <TabsList className="bg-gray-100 dark:bg-gray-900/30 mb-4">
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