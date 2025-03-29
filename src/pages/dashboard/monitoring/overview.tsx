import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';
import { listResources, getResource } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';
import { useNamespace } from '@/contexts/useNamespace';
import { V1Pod, V1Namespace } from '@kubernetes/client-node';
import { OPERATOR_URL } from '@/config';

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, AlertCircle, Cpu, HardDrive, Activity } from "lucide-react";

// Interface for metrics data
interface MetricData {
  timestamp: string;
  cpu: number; 
  memory: number;
  network_in?: number;
  network_out?: number;
}

// Interface for pod metrics from the API
interface PodMetric {
  metadata: {
    name: string;
    namespace: string;
    creationTimestamp: string;
  };
  timestamp: string;
  window: string;
  containers: {
    name: string;
    usage: {
      cpu: string;
      memory: string;
    };
  }[];
}

// Helper function to parse CPU usage from metrics API (e.g., "100m" -> 0.1)
const parseCpuUsage = (cpuStr: string): number => {
  if (cpuStr.endsWith('m')) {
    return parseFloat(cpuStr.slice(0, -1)) / 1000;
  } else if (cpuStr.endsWith('n')) {
    return parseFloat(cpuStr.slice(0, -1)) / 1000000000;
  }
  return parseFloat(cpuStr);
};

// Helper function to parse memory usage from metrics API (e.g., "10Mi" -> 10)
const parseMemoryUsage = (memStr: string): number => {
  if (memStr.endsWith('Ki')) {
    return parseFloat(memStr.slice(0, -2)) / 1024;
  } else if (memStr.endsWith('Mi')) {
    return parseFloat(memStr.slice(0, -2));
  } else if (memStr.endsWith('Gi')) {
    return parseFloat(memStr.slice(0, -2)) * 1024;
  } else if (memStr.endsWith('Ti')) {
    return parseFloat(memStr.slice(0, -2)) * 1024 * 1024;
  }
  // Assume bytes if no unit
  return parseFloat(memStr) / (1024 * 1024);
};

const PodMonitoringOverview = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentContext } = useCluster();
  
  const { namespaces, loading: namespacesLoading, error: namespacesError } = useNamespace();
  const [pods, setPods] = useState<V1Pod[]>([]);
  const [selectedNamespace, setSelectedNamespace] = useState<string>('');
  const [selectedPod, setSelectedPod] = useState<string>('');
  const [podDetails, setPodDetails] = useState<V1Pod | null>(null);
  const [timeRange, setTimeRange] = useState<'1h' | '6h' | '24h'>('1h');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  
  // Store the metrics data history
  const [metricsHistory, setMetricsHistory] = useState<MetricData[]>([]);
  // Store the current metrics
  const [currentMetrics, setCurrentMetrics] = useState<PodMetric | null>(null);
  // Store the metrics polling interval ID
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  
  // Initialize from URL params or defaults
  useEffect(() => {
    if (currentContext) {
      const namespaceParam = searchParams.get('namespace');
      const podParam = searchParams.get('pod');
      
      if (namespaceParam) {
        setSelectedNamespace(namespaceParam);
        fetchPods(namespaceParam);
      } else if (namespaces.length > 0) {
        // Use namespaces from the context instead of fetching them again
        initializeNamespace();
      }
      
      if (podParam) {
        setSelectedPod(podParam);
      }
    }
  }, [currentContext, searchParams, namespaces]);
  
  // Initialize namespace from available namespaces
  const initializeNamespace = () => {
    if (namespaces.length > 0) {
      // Try to find default namespace first
      const defaultNamespace = namespaces.find(
        ns => ns.metadata?.name === 'default'
      ) || namespaces[0];
      
      if (defaultNamespace.metadata?.name) {
        setSelectedNamespace(defaultNamespace.metadata.name);
        fetchPods(defaultNamespace.metadata.name);
      }
    }
  };
  
  // Fetch pods in the selected namespace
  const fetchPods = async (namespace: string) => {
    if (!currentContext || !namespace) return;
    
    try {
      setLoading(true);
      const podList = await listResources<'pods'>(
        currentContext.name,
        'pods',
        { namespace }
      );
      
      setPods(podList);
      
      // Select first pod if none selected
      if ((!selectedPod || !podList.find(p => p.metadata?.name === selectedPod)) && podList.length > 0) {
        const firstPodName = podList[0].metadata?.name;
        if (firstPodName) {
          setSelectedPod(firstPodName);
          fetchPodDetails(namespace, firstPodName);
          
          // Update URL with namespace and pod
          setSearchParams({
            namespace,
            pod: firstPodName
          });
        }
      } else if (selectedPod) {
        fetchPodDetails(namespace, selectedPod);
      }
    } catch (err) {
      console.error('Error fetching pods:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch pods');
    } finally {
      setLoading(false);
    }
  };
  
  // Fetch details for a specific pod
  const fetchPodDetails = async (namespace: string, podName: string) => {
    if (!currentContext || !namespace || !podName) return;
    
    try {
      setLoading(true);
      
      // Fetch the pod to get its details
      const pod = await getResource<'pods'>(
        currentContext.name,
        'pods',
        podName,
        namespace
      );
      
      setPodDetails(pod);
      
      // Start fetching metrics
      startMetricsPolling(namespace, podName);
      
      setError(null);
    } catch (err) {
      console.error('Error fetching pod details:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch pod details');
    } finally {
      setLoading(false);
    }
  };
  
  // Fetch current metrics for the selected pod
  const fetchPodMetrics = useCallback(async (namespace: string, podName: string) => {
    if (!currentContext || !namespace || !podName) return;
    
    try {
      const metricsApiUrl = `${OPERATOR_URL}/clusters/${currentContext.name}/apis/metrics.k8s.io/v1beta1/namespaces/${namespace}/pods/${podName}`;
      
      const response = await fetch(metricsApiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        credentials: 'include', // Include cookies for auth
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch metrics: ${response.status} ${response.statusText}`);
      }
      
      const metricsData: PodMetric = await response.json();
      setCurrentMetrics(metricsData);
      
      // Process metrics data
      const timestamp = new Date().toISOString();
      let totalCpuUsage = 0;
      let totalMemoryUsage = 0;
      
      metricsData.containers.forEach(container => {
        totalCpuUsage += parseCpuUsage(container.usage.cpu);
        totalMemoryUsage += parseMemoryUsage(container.usage.memory);
      });
      
      // Create a new data point
      const newDataPoint: MetricData = {
        timestamp,
        cpu: Number(totalCpuUsage.toFixed(3)),
        memory: Number(totalMemoryUsage.toFixed(1)),
        // Note: Network metrics typically require additional metrics servers/exporters
        network_in: Math.floor(Math.random() * 100), // placeholder
        network_out: Math.floor(Math.random() * 80), // placeholder
      };
      
      // Update the metrics history
      setMetricsHistory(prev => {
        // Only keep the last X data points based on the selected time range
        // This is a simplification - a real implementation would use timestamps
        const maxDataPoints = timeRange === '1h' ? 60 : timeRange === '6h' ? 72 : 144;
        const updatedHistory = [...prev, newDataPoint];
        
        if (updatedHistory.length > maxDataPoints) {
          return updatedHistory.slice(updatedHistory.length - maxDataPoints);
        }
        
        return updatedHistory;
      });
      
      setMetricsError(null);
    } catch (err) {
      console.error('Error fetching pod metrics:', err);
      setMetricsError(err instanceof Error ? err.message : 'Failed to fetch pod metrics');
    }
  }, [currentContext, timeRange]);
  
  // Start polling for metrics
  const startMetricsPolling = useCallback((namespace: string, podName: string) => {
    // Clear any existing polling
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }
    
    // Reset metrics history when changing pods
    setMetricsHistory([]);
    
    // Initial fetch
    fetchPodMetrics(namespace, podName);
    
    // Set up polling interval (every 10 seconds)
    const interval = setInterval(() => {
      fetchPodMetrics(namespace, podName);
    }, 10000);
    
    setPollingInterval(interval);
    
    // Clean up interval on component unmount
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [fetchPodMetrics, pollingInterval]);
  
  // Clean up polling interval when component unmounts
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);
  
  // Handle namespace change
  const handleNamespaceChange = (value: string) => {
    setSelectedNamespace(value);
    setSelectedPod(''); // Reset pod selection
    fetchPods(value);
    
    // Update URL with new namespace
    setSearchParams({
      namespace: value
    });
  };
  
  // Handle pod change
  const handlePodChange = (value: string) => {
    setSelectedPod(value);
    fetchPodDetails(selectedNamespace, value);
    
    // Update URL with new pod
    setSearchParams({
      namespace: selectedNamespace,
      pod: value
    });
  };
  
  // Handle refresh
  const handleRefresh = () => {
    if (selectedNamespace && selectedPod) {
      fetchPodMetrics(selectedNamespace, selectedPod);
    }
  };
  
  // Handle time range change
  const handleTimeRangeChange = (value: '1h' | '6h' | '24h') => {
    setTimeRange(value);
    // No need to refresh - we'll just use the current history data
  };
  
  // Format the metrics data for charts
  const formattedMetricsData = useMemo(() => {
    return metricsHistory.map((dataPoint, index) => ({
      time: new Date(dataPoint.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      cpu: dataPoint.cpu * 100, // Convert to percentage (0-100)
      memory: dataPoint.memory,
      network_in: dataPoint.network_in,
      network_out: dataPoint.network_out,
      // Add index to ensure unique keys in charts
      index
    }));
  }, [metricsHistory]);
  
  // Loading state
  if ((loading || namespacesLoading) && !pods.length && !namespaces.length) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-96 mb-8" />
        <Skeleton className="h-36 w-full mb-4" />
        <Skeleton className="h-48 w-full mb-4" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  
  // Error state
  if ((error || namespacesError) && !pods.length && !namespaces.length) {
    const errorMessage = error || namespacesError;
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error loading monitoring data</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      </div>
    );
  }
  
  return (
    <div className="max-h-[92vh] overflow-y-auto
          scrollbar-thin scrollbar-thumb-gray-900 scrollbar-track-transparent
          [&::-webkit-scrollbar]:w-1.5 
          [&::-webkit-scrollbar-track]:bg-transparent 
          [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header and Selection Controls */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div>
            <h1 className="text-5xl font-[Anton] uppercase text-gray-800/30 dark:text-gray-700/50">Pod Monitoring</h1>
            <p className="text-gray-500 dark:text-gray-400">
              Real-time performance metrics for Kubernetes pods
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
            <Select 
              value={selectedNamespace} 
              onValueChange={handleNamespaceChange}
            >
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Select Namespace" />
              </SelectTrigger>
              <SelectContent className="bg-gray-100 dark:bg-gray-900/50 backdrop-blur-sm border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
                {namespaces.map((ns) => ns.metadata?.name ? (
                  <SelectItem key={ns.metadata.name} value={ns.metadata.name}>
                    {ns.metadata.name}
                  </SelectItem>
                ) : null)}
              </SelectContent>
            </Select>
            
            <Select 
              value={selectedPod} 
              onValueChange={handlePodChange}
              disabled={!selectedNamespace || pods.length === 0}
            >
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue placeholder="Select Pod" />
              </SelectTrigger>
              <SelectContent className="bg-gray-100 dark:bg-gray-900/50 backdrop-blur-sm border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
                {pods.map((pod) => pod.metadata?.name ? (
                  <SelectItem key={pod.metadata.name} value={pod.metadata.name}>
                    {pod.metadata.name}
                  </SelectItem>
                ) : null)}
              </SelectContent>
            </Select>
            
            <Button 
              variant="outline" 
              size="icon"
              onClick={handleRefresh}
              disabled={!selectedPod}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {/* Time Range Selector */}
        <div className="mb-6">
          <Tabs 
            defaultValue={timeRange} 
            onValueChange={(value: any) => handleTimeRangeChange(value)} 
            className="w-full sm:w-auto"
          >
            <TabsList>
              <TabsTrigger value="1h">Last Hour</TabsTrigger>
              <TabsTrigger value="6h">Last 6 Hours</TabsTrigger>
              <TabsTrigger value="24h">Last 24 Hours</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        
        {/* Error alert if needed */}
        {metricsError && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Metrics Error</AlertTitle>
            <AlertDescription>
              {metricsError}
              <div className="mt-2 text-sm">
                Make sure the Metrics Server is running on your cluster. Some lightweight Kubernetes distributions may not have Metrics Server installed by default.
              </div>
            </AlertDescription>
          </Alert>
        )}
        
        {/* Pod Basic Info (if pod is selected) */}
        {podDetails && (
          <Card className="mb-6 bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
            <CardHeader className="pb-3">
              <CardTitle>Pod Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Node</h3>
                  <p>{podDetails.spec?.nodeName || 'N/A'}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Status</h3>
                  <p>{podDetails.status?.phase || 'N/A'}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Restart Count</h3>
                  <p>{podDetails.status?.containerStatuses?.[0]?.restartCount || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        
        {/* No metrics data message */}
        {formattedMetricsData.length === 0 && selectedPod && !metricsError && (
          <Alert className="mb-6">
            <AlertDescription>
              Waiting for metrics data... This should appear within a few seconds.
            </AlertDescription>
          </Alert>
        )}
        
        {/* Main Charts Grid */}
        {formattedMetricsData.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* CPU Usage Chart */}
            <Card className="bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center">
                  <Cpu className="mr-2 h-5 w-5 text-blue-500" />
                  CPU Usage
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={formattedMetricsData}>
                      <defs>
                        <linearGradient id="cpuColor" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="gray" />
                      <XAxis 
                        dataKey="time" 
                        scale="band"
                        tick={{fontSize: 12}}
                      />
                      <YAxis 
                        tick={{fontSize: 12}}
                        domain={[0, 100]}
                        unit="%"
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'rgba(0, 0, 0, 0.3)', border: 'none', color: '#fff', backdropFilter: 'blur(8px)' }}
                        formatter={(value) => [`${value}%`, 'CPU Usage']}
                        labelFormatter={(time) => <span className='font-[Anton] uppercase'>Time <span className='text-gray-700 dark:text-gray-400'>{time}</span></span>}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="cpu" 
                        stroke="#3b82f6" 
                        fillOpacity={1} 
                        fill="url(#cpuColor)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            
            {/* Memory Usage Chart */}
            <Card className="bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center">
                  <HardDrive className="mr-2 h-5 w-5 text-emerald-500" />
                  Memory Usage (MB)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={formattedMetricsData}>
                      <defs>
                        <linearGradient id="memoryColor" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="gray" />
                      <XAxis 
                        dataKey="time" 
                        scale="band"
                        tick={{fontSize: 12}}
                      />
                      <YAxis 
                        tick={{fontSize: 12}}
                        unit="MB"
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'rgba(0, 0, 0, 0.3)', border: 'none', color: '#fff', backdropFilter: 'blur(8px)' }}
                        formatter={(value) => [`${value} MB`, 'Memory Usage']}
                        labelFormatter={(time) => <span className='font-[Anton] uppercase'>Time <span className='text-gray-700 dark:text-gray-400'>{time}</span></span>}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="memory" 
                        stroke="#10b981" 
                        fillOpacity={1} 
                        fill="url(#memoryColor)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
        
        {/* Network Chart */}
        {formattedMetricsData.length > 0 && (
          <Card className="mb-6 bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center">
                <Activity className="mr-2 h-5 w-5 text-purple-500" />
                Network Traffic (Simulated)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={formattedMetricsData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="gray" />
                    <XAxis 
                      dataKey="time" 
                      scale="band"
                      tick={{fontSize: 12}}
                    />
                    <YAxis 
                      tick={{fontSize: 12}}
                      unit="KB"
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'rgba(0, 0, 0, 0.3)', border: 'none', color: '#fff', backdropFilter: 'blur(8px)' }}
                      formatter={(value) => [`${value} KB`, '']}
                      labelFormatter={(time) => <span className='font-[Anton] uppercase'>Time <span className='text-gray-700 dark:text-gray-400'>{time}</span></span>}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="network_in" 
                      name="Inbound"
                      stroke="#8b5cf6" 
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 5 }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="network_out" 
                      name="Outbound"
                      stroke="#ec4899" 
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 italic text-center">
                Note: Network metrics are simulated. Real network metrics typically require additional metrics exporters.
              </div>
            </CardContent>
          </Card>
        )}
        
        {/* Current Metrics Card */}
        {currentMetrics && (
          <Card className="mb-6 bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
            <CardHeader className="pb-3">
              <CardTitle>Current Resource Usage</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {currentMetrics.containers.map(container => (
                  <div key={container.name} className="p-4 rounded-lg bg-gray-100 dark:bg-gray-800/30">
                    <h3 className="text-sm font-bold mb-2">{container.name}</h3>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-500 dark:text-gray-400">CPU:</span>
                      <span>{container.usage.cpu}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">Memory:</span>
                      <span>{container.usage.memory}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                Last updated: {new Date(currentMetrics.timestamp).toLocaleString()}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default PodMonitoringOverview;