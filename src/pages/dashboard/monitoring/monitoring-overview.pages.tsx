import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, BarChart, Bar
} from 'recharts';
import { listResources, getResource } from '@/api/internal/resources';
import { getPodMetrics, PodMetrics } from '@/api/internal/metrics';
import { useCluster } from '@/contexts/clusterContext';
import { useNamespace } from '@/contexts/useNamespace';
import { V1Pod, V1Namespace } from '@kubernetes/client-node';

// Component imports
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, AlertCircle, Cpu, HardDrive, Activity, Loader2 } from "lucide-react";

const PodMonitoringOverview = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentContext } = useCluster();
  
  const { namespaces, loading: namespacesLoading, error: namespacesError } = useNamespace();
  const [pods, setPods] = useState<V1Pod[]>([]);
  const [selectedNamespace, setSelectedNamespace] = useState<string>('');
  const [selectedPod, setSelectedPod] = useState<string>('');
  const [podDetails, setPodDetails] = useState<V1Pod | null>(null);
  const [podMetrics, setPodMetrics] = useState<PodMetrics | null>(null);
  const [timeRange, setTimeRange] = useState<'1h' | '6h' | '24h'>('1h');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Metrics data for charts (derived from podMetrics)
  const [metricsData, setMetricsData] = useState<any[]>([]);
  
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
          fetchPodMetrics(namespace, firstPodName);
          
          // Update URL with namespace and pod
          setSearchParams({
            namespace,
            pod: firstPodName
          });
        }
      } else if (selectedPod) {
        fetchPodDetails(namespace, selectedPod);
        fetchPodMetrics(namespace, selectedPod);
      }
    } catch (err) {
      console.error('Error fetching pods:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch pods');
    } finally {
      setLoading(false);
    }
  };
  
  // Fetch pod details
  const fetchPodDetails = async (namespace: string, podName: string) => {
    if (!currentContext || !namespace || !podName) return;
    
    try {
      // Fetch the pod to get its details
      const pod = await getResource<'pods'>(
        currentContext.name,
        'pods',
        podName,
        namespace
      );
      
      setPodDetails(pod);
    } catch (err) {
      console.error('Error fetching pod details:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch pod details');
    }
  };
  
  // Fetch metrics for the selected pod using our metrics API
  const fetchPodMetrics = async (namespace: string, podName: string) => {
    if (!currentContext || !namespace || !podName) return;
    
    try {
      setRefreshing(true);
      
      // Call our metrics API
      const metrics = await getPodMetrics(currentContext.name, namespace, podName);
      setPodMetrics(metrics);
      
      // Process metrics history for charts
      const formattedData = processMetricsForCharts(metrics, timeRange);
      setMetricsData(formattedData);
      
      setError(null);
    } catch (err) {
      console.error('Error fetching pod metrics:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch pod metrics');
    } finally {
      setRefreshing(false);
    }
  };
  
  // Process metrics history data for charts (keeping your existing format)
  const processMetricsForCharts = (metrics: PodMetrics, timeRangeFilter: string) => {
    if (!metrics || !metrics.history || metrics.history.length === 0) {
      return [];
    }
    
    // Sort history by timestamp
    const sortedHistory = [...metrics.history].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    // Filter based on time range if needed
    let filteredHistory = sortedHistory;
    if (timeRangeFilter) {
      const now = new Date();
      const cutoff = new Date();
      
      if (timeRangeFilter === '1h') cutoff.setHours(now.getHours() - 1);
      else if (timeRangeFilter === '6h') cutoff.setHours(now.getHours() - 6);
      else if (timeRangeFilter === '24h') cutoff.setHours(now.getHours() - 24);
      
      filteredHistory = sortedHistory.filter(point => 
        new Date(point.timestamp) >= cutoff
      );
    }
    
    // Format data to match your chart expectations
    return filteredHistory.map(point => ({
      time: new Date(point.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      date: new Date(point.timestamp).toLocaleDateString(),
      cpu: Math.round(point.cpu * 100), // Convert to percentage
      memory: Math.round(point.memory / metrics.memory.requestedMemoryMiB * 100), // Convert to percentage of requested
      // For network data - if available in your API, add it here
      network_in: 0, // Placeholder
      network_out: 0, // Placeholder
    }));
  };
  
  // Handle namespace change
  const handleNamespaceChange = (value: string) => {
    setSelectedNamespace(value);
    setSelectedPod(''); // Reset pod selection
    setPodMetrics(null); // Clear metrics
    setMetricsData([]); // Clear chart data
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
    fetchPodMetrics(selectedNamespace, value);
    
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
    if (selectedNamespace && selectedPod && podMetrics) {
      // Reprocess existing metrics data for new time range
      const formattedData = processMetricsForCharts(podMetrics, value);
      setMetricsData(formattedData);
      
      // Optionally refetch with new time range parameter
      // fetchPodMetrics(selectedNamespace, selectedPod);
    }
  };
  
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
        <Alert variant="destructive" className="bg-transparent dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error loading monitoring data</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      </div>
    );
  }
  
  return (
    <div className="max-h-[92vh] overflow-y-auto
          scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent
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
              disabled={!selectedPod || refreshing}
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
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
        
        {/* Pod Basic Info (if pod is selected) */}
        {podDetails && (
          <Card className="mb-6 bg-transparent dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
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
        
        {/* Main Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* CPU Usage Chart */}
          <Card className="bg-transparent dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center">
                <Cpu className="mr-2 h-5 w-5 text-blue-500" />
                CPU Usage {podMetrics && `(Current: ${podMetrics.cpu.currentUsage})`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                {metricsData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={metricsData}>
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
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-500">
                    {refreshing ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Loading metrics...</span>
                      </div>
                    ) : (
                      <span>No metrics data available</span>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          
          {/* Memory Usage Chart */}
          <Card className="bg-transparent dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center">
                <HardDrive className="mr-2 h-5 w-5 text-emerald-500" />
                Memory Usage {podMetrics && `(Current: ${podMetrics.memory.currentUsage})`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                {metricsData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={metricsData}>
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
                        domain={[0, 100]}
                        unit="%"
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'rgba(0, 0, 0, 0.3)', border: 'none', color: '#fff', backdropFilter: 'blur(8px)' }}
                        formatter={(value) => [`${value}%`, 'Memory Usage']}
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
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-500">
                    {refreshing ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Loading metrics...</span>
                      </div>
                    ) : (
                      <span>No metrics data available</span>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Network Chart */}
        {/* Note: This is preserved from your original design, but populated with placeholders since your API doesn't include network metrics */}
        <Card className="mb-6 bg-transparent dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center">
              <Activity className="mr-2 h-5 w-5 text-purple-500" />
              Network Traffic
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {metricsData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={metricsData}>
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
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  {refreshing ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Loading metrics...</span>
                    </div>
                  ) : (
                    <span>Network metrics not available</span>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        
        {/* Container Details (if available) */}
        {podMetrics && podMetrics.containers.length > 0 && (
          <Card className="mb-6 bg-transparent dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
            <CardHeader className="pb-3">
              <CardTitle>Container Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {podMetrics.containers.map(container => (
                  <div key={container.name} className="border p-4 rounded-lg dark:border-gray-800">
                    <h3 className="text-lg font-medium mb-3">{container.name}</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">CPU Usage</h4>
                        <p>{container.cpu.currentUsage} ({container.cpu.usagePercentage}% of request)</p>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">CPU Request</h4>
                        <p>{container.cpu.requestedCPU}</p>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Memory Usage</h4>
                        <p>{container.memory.currentUsage} ({Math.round(container.memory.usagePercentage)}% of request)</p>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Memory Request</h4>
                        <p>{container.memory.requestedMemory}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default PodMonitoringOverview;