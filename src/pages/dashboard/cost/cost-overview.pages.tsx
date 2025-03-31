import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Download,
  Database,
  HardDrive,
  Cpu,
  RefreshCcw
} from "lucide-react";
import { useCluster } from '@/contexts/clusterContext';
import DailyCostTrend from './components/dailycost-trend.component';
import NamespaceCostDistribution from './components/namespace-cost-distribution.component';
import ServiceCostDistribution from './components/service-cost-distribution.component';
import NodeCostDistribution from './components/node-cost-distribution.component';
import CostSummary from './components/cost-summary.component';
import PodCostDistribution from './components/pod-cost-distribution.component';
import { OpenCostInstaller } from '@/components/custom';
// Types for cost data
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
  resources: ResourceCost;
}

interface ServiceCost {
  name: string;
  namespace: string;
  cost: number;
  percentage: number;
  resources: ResourceCost;
}

interface NodeCost {
  name: string;
  cost: number;
  percentage: number;
  resources: ResourceCost;
  instanceType?: string;
  instanceCost?: number;
}

interface CostData {
  totalCost: number;
  window: string;
  resources: ResourceCost;
  efficiency: number;
  namespaces: NamespaceCost[];
  services: ServiceCost[];
  nodes: NodeCost[];
  daily: {
    date: string;
    cost: number;
  }[];
}

const CostOverview: React.FC = () => {
  const { currentContext } = useCluster();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<string>("30d");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isOpenCostInstalled, setIsOpenCostInstalled] = useState(false); // Set to false to test installation UI
  const [costData, setCostData] = useState<CostData>({
    totalCost: 1427.32,
    window: "Last 30 days",
    resources: {
      cpu: 625.42,
      memory: 498.76,
      storage: 303.14,
      total: 1427.32
    },
    efficiency: 67,
    namespaces: [
      {
        name: "kube-system",
        cost: 370.80,
        percentage: 26,
        resources: { cpu: 162.5, memory: 129.7, storage: 78.6, total: 370.8 }
      },
      {
        name: "app-production",
        cost: 512.50,
        percentage: 36,
        resources: { cpu: 225.0, memory: 180.0, storage: 107.5, total: 512.5 }
      },
      {
        name: "app-staging",
        cost: 284.70,
        percentage: 20,
        resources: { cpu: 125.1, memory: 99.8, storage: 59.8, total: 284.7 }
      },
      {
        name: "monitoring",
        cost: 185.32,
        percentage: 13,
        resources: { cpu: 81.3, memory: 64.9, storage: 39.1, total: 185.3 }
      },
      {
        name: "database",
        cost: 74.00,
        percentage: 5,
        resources: { cpu: 31.5, memory: 24.4, storage: 18.1, total: 74.0 }
      }
    ],
    services: [
      {
        name: "app-frontend",
        namespace: "app-production",
        cost: 256.25,
        percentage: 18,
        resources: { cpu: 112.5, memory: 90.0, storage: 53.75, total: 256.25 }
      },
      {
        name: "app-backend",
        namespace: "app-production",
        cost: 199.42,
        percentage: 14,
        resources: { cpu: 87.5, memory: 70.0, storage: 41.92, total: 199.42 }
      },
      {
        name: "database-master",
        namespace: "database",
        cost: 199.42,
        percentage: 14,
        resources: { cpu: 87.5, memory: 70.0, storage: 41.92, total: 199.42 }
      },
      {
        name: "redis-cache",
        namespace: "app-production",
        cost: 142.44,
        percentage: 10,
        resources: { cpu: 62.5, memory: 50.0, storage: 29.94, total: 142.44 }
      },
      {
        name: "monitoring-stack",
        namespace: "monitoring",
        cost: 185.32,
        percentage: 13,
        resources: { cpu: 81.3, memory: 64.9, storage: 39.12, total: 185.32 }
      },
      {
        name: "staging-apps",
        namespace: "app-staging",
        cost: 284.70,
        percentage: 20,
        resources: { cpu: 125.1, memory: 99.8, storage: 59.8, total: 284.7 }
      },
      {
        name: "ingress-controller",
        namespace: "kube-system",
        cost: 142.33,
        percentage: 10,
        resources: { cpu: 62.5, memory: 50.0, storage: 29.83, total: 142.33 }
      }
    ],
    nodes: [
      {
        name: "node-1",
        cost: 356.82,
        percentage: 25,
        instanceType: "m5.xlarge",
        instanceCost: 0.192,
        resources: { cpu: 156.36, memory: 124.89, storage: 75.57, total: 356.82 }
      },
      {
        name: "node-2",
        cost: 356.82,
        percentage: 25,
        instanceType: "m5.xlarge",
        instanceCost: 0.192,
        resources: { cpu: 156.36, memory: 124.89, storage: 75.57, total: 356.82 }
      },
      {
        name: "node-3",
        cost: 356.82,
        percentage: 25,
        instanceType: "m5.xlarge",
        instanceCost: 0.192,
        resources: { cpu: 156.36, memory: 124.89, storage: 75.57, total: 356.82 }
      },
      {
        name: "node-4",
        cost: 356.86,
        percentage: 25,
        instanceType: "m5.xlarge",
        instanceCost: 0.192,
        resources: { cpu: 156.34, memory: 124.09, storage: 76.43, total: 356.86 }
      }
    ],
    daily: Array.from({ length: 30 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (29 - i));
      return {
        date: date.toISOString().split('T')[0],
        cost: 40 + Math.random() * 15 // Random cost between 40 and 55
      };
    })
  });

  // Simulate fetching OpenCost data
  useEffect(() => {
    const fetchCostData = async () => {
      if (!currentContext) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Simulate API call to check if OpenCost is installed
        await new Promise(resolve => setTimeout(resolve, 1000));

        // For demo purposes: 
        // - Uncomment to test the OpenCost not installed state
        // setIsOpenCostInstalled(false);

        // If OpenCost is installed, fetch cost data
        if (isOpenCostInstalled) {
          // Simulate API call to fetch cost data
          await new Promise(resolve => setTimeout(resolve, 500));

          // In a real implementation, this would be:
          // const response = await fetch(`${OPERATOR_URL}/clusters/${currentContext.name}/opencost/allocation/costs?window=${timeRange}`);
          // const data = await response.json();
          // setCostData(data);

          // Using dummy data for now
          setCostData({
            ...costData,
            window: timeRange === "7d" ? "Last 7 days" :
              timeRange === "30d" ? "Last 30 days" :
                timeRange === "90d" ? "Last 90 days" : "Custom"
          });
        }
      } catch (err) {
        console.error('Failed to fetch cost data:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch cost data');
        setIsOpenCostInstalled(false); // Assume error means OpenCost is not installed
      } finally {
        setLoading(false);
      }
    };

    fetchCostData();
  }, [currentContext, timeRange]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // In a real implementation, this would refresh the data from OpenCost
      await new Promise(resolve => setTimeout(resolve, 1000));
      // Would fetch latest data here
    } catch (err) {
      console.error('Error refreshing data:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Install OpenCost handler
  const handleInstallOpenCost = () => {
    console.log('Installing OpenCost...');
    // In a real implementation, this would call an API to install OpenCost
    setLoading(true);

    // Simulate installation
    setTimeout(() => {
      setIsOpenCostInstalled(true);
      setLoading(false);
    }, 2000);
  };

  if (!isOpenCostInstalled) {
    return (
      <OpenCostInstaller loading={loading} onInstall={handleInstallOpenCost} /> 
    );
  }

  return (
    <div
      className="
          max-h-[92vh] overflow-y-auto
      scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-700 scrollbar-track-transparent
      [&::-webkit-scrollbar]:w-1.5 
      [&::-webkit-scrollbar-track]:bg-transparent 
      [&::-webkit-scrollbar-thumb]:bg-gray-400/30 dark:[&::-webkit-scrollbar-thumb]:bg-gray-700/30 
      [&::-webkit-scrollbar-thumb]:rounded-full
      [&::-webkit-scrollbar-thumb:hover]:bg-gray-400/50 dark:[&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50
    ">
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Cost Overview</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">View and analyze your cluster costs</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Select defaultValue={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-32 dark:bg-gray-900 dark:text-white dark:border-gray-800/50">
                <SelectValue placeholder="Time Range" />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-900/20 backdrop-blur-sm dark:text-white dark:border-gray-700">
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
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

        {/* Cost Summary Card */}
        <CostSummary />
        {/* <Card className="bg-white dark:bg-gray-800/20 border-gray-200/50 dark:border-gray-700/30 shadow-lg">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="md:col-span-2 space-y-3">
                <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300">Total Cost</h2>
                <div className="text-5xl font-bold text-gray-900 dark:text-white">
                  <span className="text-gray-500 dark:text-gray-400">$</span>
                  {costData.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {costData.window}
                </div>

                <div className="pt-4">
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Efficiency Score</div>
                  <div className="flex items-center gap-3">
                    <div className="h-2 flex-grow bg-gray-200 dark:bg-gray-700 rounded-full">
                      <div
                        className={`h-2 ${costData.efficiency > 75 ? 'bg-green-500' : costData.efficiency > 50 ? 'bg-blue-500' : 'bg-amber-500'} rounded-full`}
                        style={{ width: `${costData.efficiency}%` }}
                      ></div>
                    </div>
                    <span className="text-lg font-bold text-gray-900 dark:text-white">{costData.efficiency}%</span>
                  </div>
                </div>
              </div>

              <div className="md:col-span-2">
                <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-3">Resource Breakdown</h2>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Cpu className="h-4 w-4 text-blue-500" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">CPU</span>
                    </div>
                    <div className="text-lg font-bold text-gray-900 dark:text-white">${costData.resources.cpu.toFixed(2)}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{Math.round(costData.resources.cpu / costData.totalCost * 100)}% of total</div>
                  </div>

                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Database className="h-4 w-4 text-indigo-500" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Memory</span>
                    </div>
                    <div className="text-lg font-bold text-gray-900 dark:text-white">${costData.resources.memory.toFixed(2)}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{Math.round(costData.resources.memory / costData.totalCost * 100)}% of total</div>
                  </div>

                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <HardDrive className="h-4 w-4 text-purple-500" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Storage</span>
                    </div>
                    <div className="text-lg font-bold text-gray-900 dark:text-white">${costData.resources.storage.toFixed(2)}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{Math.round(costData.resources.storage / costData.totalCost * 100)}% of total</div>
                  </div>
                </div>

                <DailyCostTrend dailyCostData={costData.daily} />
              </div>
            </div>
          </CardContent>
        </Card> */}

        {/* Detailed Breakdowns */}
        <Tabs defaultValue="namespaces" className="w-full">
          <TabsList className="bg-gray-100 dark:bg-gray-900/30 mb-4">
            <TabsTrigger className='text-gray-700 dark:text-gray-300' value="namespaces">Namespaces</TabsTrigger>
            <TabsTrigger className='text-gray-700 dark:text-gray-300' value="services">Services</TabsTrigger>
            <TabsTrigger className='text-gray-700 dark:text-gray-300' value="nodes">Nodes</TabsTrigger>
            <TabsTrigger className='text-gray-700 dark:text-gray-300' value="pods">Pods</TabsTrigger>
          </TabsList>

          {/* Namespaces Cost Distribution */}
          <TabsContent value="namespaces" className="mt-0">
            <NamespaceCostDistribution 
              // namespaces={costData.namespaces}
             />
          </TabsContent>
          {/* Services Cost Distribution */}
          <TabsContent value="services" className="mt-0">
            <ServiceCostDistribution 
                // services={costData.services} 
            />
          </TabsContent>
          {/* Nodes Cost Distribution */}
          <TabsContent value="nodes" className="mt-0">
            <NodeCostDistribution 
                // nodes={costData.nodes} 
            />
          </TabsContent>
          {/* Pods Cost Distribution */}
          <TabsContent value="pods" className="mt-0">
            <PodCostDistribution 
                // pods={costData.pods} 
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default CostOverview;