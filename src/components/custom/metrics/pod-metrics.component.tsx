import React, { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';
import { getPodMetrics, PodMetrics } from '@/api/internal/metrics';
import { useCluster } from '@/contexts/clusterContext';

// Component imports
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, Cpu, Database, Activity, Loader2, Terminal } from "lucide-react";

interface PodMetricsComponentProps {
  namespace: string;
  podName: string;
}

const PodMetricsComponent: React.FC<PodMetricsComponentProps> = ({ namespace, podName }) => {
  const { currentContext } = useCluster();
  const [podMetrics, setPodMetrics] = useState<PodMetrics | null>(null);
  const [timeRange, setTimeRange] = useState<'1h' | '6h' | '24h'>('1h');
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Fetch metrics for the pod using our metrics API
  const fetchPodMetrics = async () => {
    if (!currentContext || !namespace || !podName) return;
    
    try {
      setRefreshing(true);
      
      // Call our metrics API
      const metrics = await getPodMetrics(currentContext.name, namespace, podName);
      setPodMetrics(metrics);
      setError(null);
    } catch (err) {
      console.error('Error fetching pod metrics:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch pod metrics');
      // We still set error for logging, but won't display it
    } finally {
      setRefreshing(false);
    }
  };

  // Initial fetch on component mount
  useEffect(() => {
    fetchPodMetrics();
    
    // Optional: Set up auto-refresh every 30 seconds
    // const refreshInterval = setInterval(fetchPodMetrics, 30000);
    // return () => clearInterval(refreshInterval);
  }, [currentContext, namespace, podName]);
  
  // Handle refresh button click
  const handleRefresh = () => {
    fetchPodMetrics();
  };
  
  // Handle time range change - this would be used for historical metrics
  const handleTimeRangeChange = (value: '1h' | '6h' | '24h') => {
    setTimeRange(value);
    // In a real implementation, you would refetch metrics with the new time range
    fetchPodMetrics();
  };

  // Format history data for charts if available
  const cpuMemoryChartData = podMetrics?.history.map(point => ({
    timestamp: new Date(point.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    cpu: point.cpu * 1000, // Convert to millicores for better visualization
    memory: point.memory // Already in MiB
  })) || [];
  
  return (
    <div className="space-y-6">
      {/* Controls section */}
      <div className="flex justify-end items-center">
     
        <Button 
          variant="outline" 
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2"
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>
        
      {/* Loading indicator when refreshing */}
      {refreshing && (
        <div className="flex justify-center">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Refreshing metrics...
          </div>
        </div>
      )}
        
      {/* Metrics Overview Cards - if metrics are available */}
      {podMetrics && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* CPU Usage Card */}
          <Card className="bg-transparent dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-medium flex items-center gap-2">
                <Cpu className="h-5 w-5 text-blue-500" />
                CPU Usage
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col space-y-6">
                <div className="flex items-center justify-center">
                  <div className="relative h-36 w-36">
                    <svg className="h-full w-full" viewBox="0 0 100 100">
                      {/* Background circle */}
                      <circle
                        className="text-gray-200 dark:text-gray-800"
                        strokeWidth="8"
                        stroke="currentColor"
                        fill="transparent"
                        r="46"
                        cx="50"
                        cy="50"
                      />
                      {/* Progress circle */}
                      <circle
                        className={podMetrics.cpu.usagePercentage >= 80 ? "text-red-500" : 
                                  podMetrics.cpu.usagePercentage >= 60 ? "text-yellow-500" : 
                                  "text-blue-500"}
                        strokeWidth="8"
                        strokeDasharray={`${podMetrics.cpu.usagePercentage * 2.89} 289`}
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="transparent"
                        r="46"
                        cx="50"
                        cy="50"
                        transform="rotate(-90 50 50)"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl font-bold">{podMetrics.cpu.usagePercentage}%</span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">of request</span>
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex flex-col">
                    <span className="text-gray-500 dark:text-gray-400">Current</span>
                    <span className="text-lg font-semibold">{podMetrics.cpu.currentUsage}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-gray-500 dark:text-gray-400">Requested</span>
                    <span className="text-lg font-semibold">{podMetrics.cpu.requestedCPU}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Memory Usage Card */}
          <Card className="bg-transparent dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-medium flex items-center gap-2">
                <Database className="h-5 w-5 text-emerald-500" />
                Memory Usage
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col space-y-6">
                <div className="flex items-center justify-center">
                  <div className="relative h-36 w-36">
                    <svg className="h-full w-full" viewBox="0 0 100 100">
                      {/* Background circle */}
                      <circle
                        className="text-gray-200 dark:text-gray-800"
                        strokeWidth="8"
                        stroke="currentColor"
                        fill="transparent"
                        r="46"
                        cx="50"
                        cy="50"
                      />
                      {/* Progress circle */}
                      <circle
                        className={podMetrics.memory.usagePercentage >= 80 ? "text-red-500" : 
                                  podMetrics.memory.usagePercentage >= 60 ? "text-yellow-500" : 
                                  "text-emerald-500"}
                        strokeWidth="8"
                        strokeDasharray={`${podMetrics.memory.usagePercentage * 2.89} 289`}
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="transparent"
                        r="46"
                        cx="50"
                        cy="50"
                        transform="rotate(-90 50 50)"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl font-bold">{Math.round(podMetrics.memory.usagePercentage)}%</span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">of request</span>
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex flex-col">
                    <span className="text-gray-500 dark:text-gray-400">Current</span>
                    <span className="text-lg font-semibold">{podMetrics.memory.currentUsage}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-gray-500 dark:text-gray-400">Requested</span>
                    <span className="text-lg font-semibold">{podMetrics.memory.requestedMemory}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
        
      {/* Historical Metrics Chart - if history data is available */}
      {podMetrics && cpuMemoryChartData.length > 1 && (
        <Card className="bg-transparent dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center">
              <Activity className="mr-2 h-5 w-5 text-purple-500" />
              Resource Usage History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cpuMemoryChartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="gray" />
                  <XAxis 
                    dataKey="timestamp" 
                    scale="band"
                    tick={{fontSize: 12}}
                  />
                  <YAxis 
                    yAxisId="left"
                    tick={{fontSize: 12}}
                    domain={[0, 'auto']}
                    label={{ value: 'CPU (millicores)', angle: -90, position: 'insideLeft' }}
                  />
                  <YAxis 
                    yAxisId="right"
                    orientation="right"
                    tick={{fontSize: 12}}
                    domain={[0, 'auto']}
                    label={{ value: 'Memory (MiB)', angle: -90, position: 'insideRight' }}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'rgba(0, 0, 0, 0.3)', border: 'none', color: '#fff', backdropFilter: 'blur(8px)' }}
                    formatter={(value, name) => [
                      name === 'cpu' ? `${value} millicores` : `${value} MiB`, 
                      name === 'cpu' ? 'CPU' : 'Memory'
                    ]}
                    labelFormatter={(time) => <span className='font-[Anton] uppercase'>Time <span className='text-gray-700 dark:text-gray-400'>{time}</span></span>}
                  />
                  <Legend />
                  <Line 
                    yAxisId="left"
                    type="monotone" 
                    dataKey="cpu" 
                    name="CPU"
                    stroke="#3b82f6" 
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
                  <Line 
                    yAxisId="right"
                    type="monotone" 
                    dataKey="memory" 
                    name="Memory"
                    stroke="#10b981" 
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
        
      {/* Container Details - if metrics are available */}
      {podMetrics && podMetrics.containers.length > 0 && (
        <Card className="bg-transparent dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <CardHeader>
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <Terminal className="h-5 w-5" />
              Container Metrics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {podMetrics.containers.map((container) => (
                <div key={container.name} className="border p-4 rounded-lg dark:border-gray-800">
                  <h3 className="text-lg font-medium mb-4">{container.name}</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm text-gray-500 dark:text-gray-400">CPU</h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>Current: <span className="font-semibold">{container.cpu.currentUsage}</span></div>
                        <div>Requested: <span className="font-semibold">{container.cpu.requestedCPU}</span></div>
                        <div>Limit: <span className="font-semibold">{container.cpu.limitCPU === '0' ? 'Not set' : container.cpu.limitCPU}</span></div>
                        <div>Usage: <span className={`font-semibold ${
                          container.cpu.usagePercentage >= 80 ? "text-red-500" : 
                          container.cpu.usagePercentage >= 60 ? "text-yellow-500" : 
                          "text-blue-500"
                        }`}>{container.cpu.usagePercentage}%</span></div>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm text-gray-500 dark:text-gray-400">Memory</h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>Current: <span className="font-semibold">{container.memory.currentUsage}</span></div>
                        <div>Requested: <span className="font-semibold">{container.memory.requestedMemory}</span></div>
                        <div>Limit: <span className="font-semibold">{container.memory.limitMemory === '0' ? 'Not set' : container.memory.limitMemory}</span></div>
                        <div>Usage: <span className={`font-semibold ${
                          container.memory.usagePercentage >= 80 ? "text-red-500" : 
                          container.memory.usagePercentage >= 60 ? "text-yellow-500" : 
                          "text-emerald-500"
                        }`}>{Math.round(container.memory.usagePercentage)}%</span></div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
        
      {/* Show empty charts when no metrics are available */}
      {(!podMetrics || error) && !refreshing && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* CPU Usage Card - Empty State */}
            <Card className="bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg font-medium flex items-center gap-2">
                  <Cpu className="h-5 w-5 text-blue-500" />
                  CPU Usage
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col space-y-6">
                  <div className="flex items-center justify-center">
                    <div className="relative h-36 w-36">
                      <svg className="h-full w-full" viewBox="0 0 100 100">
                        {/* Background circle */}
                        <circle
                          className="text-gray-200 dark:text-gray-800"
                          strokeWidth="8"
                          stroke="currentColor"
                          fill="transparent"
                          r="46"
                          cx="50"
                          cy="50"
                        />
                        {/* Empty progress circle */}
                        <circle
                          className="text-gray-300 dark:text-gray-700"
                          strokeWidth="8"
                          strokeDasharray="0 289"
                          strokeLinecap="round"
                          stroke="currentColor"
                          fill="transparent"
                          r="46"
                          cx="50"
                          cy="50"
                          transform="rotate(-90 50 50)"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-3xl font-bold">0%</span>
                        <span className="text-sm text-gray-500 dark:text-gray-400">of request</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex flex-col">
                      <span className="text-gray-500 dark:text-gray-400">Current</span>
                      <span className="text-lg font-semibold">0m</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-gray-500 dark:text-gray-400">Requested</span>
                      <span className="text-lg font-semibold">N/A</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Memory Usage Card - Empty State */}
            <Card className="bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg font-medium flex items-center gap-2">
                  <Database className="h-5 w-5 text-emerald-500" />
                  Memory Usage
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col space-y-6">
                  <div className="flex items-center justify-center">
                    <div className="relative h-36 w-36">
                      <svg className="h-full w-full" viewBox="0 0 100 100">
                        {/* Background circle */}
                        <circle
                          className="text-gray-200 dark:text-gray-800"
                          strokeWidth="8"
                          stroke="currentColor"
                          fill="transparent"
                          r="46"
                          cx="50"
                          cy="50"
                        />
                        {/* Empty progress circle */}
                        <circle
                          className="text-gray-300 dark:text-gray-700"
                          strokeWidth="8"
                          strokeDasharray="0 289"
                          strokeLinecap="round"
                          stroke="currentColor"
                          fill="transparent"
                          r="46"
                          cx="50"
                          cy="50"
                          transform="rotate(-90 50 50)"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-3xl font-bold">0%</span>
                        <span className="text-sm text-gray-500 dark:text-gray-400">of request</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex flex-col">
                      <span className="text-gray-500 dark:text-gray-400">Current</span>
                      <span className="text-lg font-semibold">0Mi</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-gray-500 dark:text-gray-400">Requested</span>
                      <span className="text-lg font-semibold">N/A</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Historical Metrics Chart - Empty State */}
          <Card className="bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center">
                <Activity className="mr-2 h-5 w-5 text-purple-500" />
                Resource Usage History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={[{timestamp: "now", cpu: 0, memory: 0}]}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="gray" />
                    <XAxis 
                      dataKey="timestamp" 
                      scale="band"
                      tick={{fontSize: 12}}
                    />
                    <YAxis 
                      yAxisId="left"
                      tick={{fontSize: 12}}
                      domain={[0, 10]}
                      label={{ value: 'CPU (millicores)', angle: -90, position: 'insideLeft' }}
                    />
                    <YAxis 
                      yAxisId="right"
                      orientation="right"
                      tick={{fontSize: 12}}
                      domain={[0, 10]}
                      label={{ value: 'Memory (MiB)', angle: -90, position: 'insideRight' }}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'rgba(0, 0, 0, 0.3)', border: 'none', color: '#fff', backdropFilter: 'blur(8px)' }}
                      formatter={(value, name) => [
                        name === 'cpu' ? `0 millicores` : `0 MiB`, 
                        name === 'cpu' ? 'CPU' : 'Memory'
                      ]}
                      labelFormatter={(time) => <span className='font-[Anton] uppercase'>Time <span className='text-gray-700 dark:text-gray-400'>{time}</span></span>}
                    />
                    <Legend />
                    <Line 
                      yAxisId="left"
                      type="monotone" 
                      dataKey="cpu" 
                      name="CPU"
                      stroke="#3b82f6" 
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line 
                      yAxisId="right"
                      type="monotone" 
                      dataKey="memory" 
                      name="Memory"
                      stroke="#10b981" 
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          
          {/* Container Metrics - Empty State */}
          <Card className="bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
            <CardHeader>
              <CardTitle className="text-lg font-medium flex items-center gap-2">
                <Terminal className="h-5 w-5" />
                Container Metrics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-6 text-gray-500">
                <p>No container metrics available</p>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default PodMetricsComponent;