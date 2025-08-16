import React, { useEffect, useState } from 'react';
import { kubeProxyRequest } from '@/api/cluster';
import { useCluster } from '@/contexts/clusterContext';

// Component imports
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { RefreshCw, Cpu, Database, Activity, Loader2, Terminal, Container, ChevronDown, ChevronRight } from "lucide-react";
import { SiDocker } from '@icons-pack/react-simple-icons';

// Define metrics interfaces based on what the pods.resources.tsx expects
interface ContainerMetrics {
  name: string;
  usage: {
    cpu: string;
    memory: string;
  };
}

interface PodMetrics {
  metadata: {
    name: string;
    namespace: string;
    creationTimestamp?: string;
  };
  timestamp: string;
  window: string;
  containers: ContainerMetrics[];
}

interface PodMetricsComponentProps {
  namespace: string;
  podName: string;
}

const PodMetricsComponent: React.FC<PodMetricsComponentProps> = ({ namespace, podName }) => {
  const { currentContext } = useCluster();
  const [podMetrics, setPodMetrics] = useState<PodMetrics | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedContainers, setExpandedContainers] = useState<Set<string>>(new Set());

  // Fetch metrics for the pod using kubeProxyRequest
  const fetchPodMetrics = async () => {
    if (!currentContext || !namespace || !podName) return;

    try {
      setRefreshing(true);

      // Use the same approach as pods.resources.tsx to fetch metrics
      const metricsApiPath = `apis/metrics.k8s.io/v1beta1/namespaces/${namespace}/pods/${podName}`;

      const data = await kubeProxyRequest(currentContext.name, metricsApiPath, 'GET');
      setPodMetrics(data);
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

  // Toggle container expansion
  const toggleContainer = (containerName: string) => {
    const newExpanded = new Set(expandedContainers);
    if (newExpanded.has(containerName)) {
      newExpanded.delete(containerName);
    } else {
      newExpanded.add(containerName);
    }
    setExpandedContainers(newExpanded);
  };


  // Parse resource quantities (reusing logic from pods.resources.tsx)
  const parseQuantity = (quantity: string): number => {
    if (!quantity) return 0;

    if (quantity.endsWith('m')) {
      return parseFloat(quantity.slice(0, -1)) / 1000;
    } else if (quantity.endsWith('n')) {
      return parseFloat(quantity.slice(0, -1)) / 1000000000;
    } else if (quantity.endsWith('Mi')) {
      return parseFloat(quantity.slice(0, -2));
    } else if (quantity.endsWith('Ki')) {
      return parseFloat(quantity.slice(0, -2)) / 1024;
    } else if (quantity.endsWith('Gi')) {
      return parseFloat(quantity.slice(0, -2)) * 1024;
    }

    return parseFloat(quantity);
  };

  // Format resource value (reusing logic from pods.resources.tsx)
  const formatResourceValue = (value: number, type: 'cpu' | 'memory'): string => {
    if (type === 'cpu') {
      if (value < 0.01) {
        return `${(value * 1000).toFixed(0)}m`;
      }
      return value.toFixed(2);
    } else {
      if (value < 1) {
        return `${(value * 1024).toFixed(0)}Ki`;
      } else if (value > 1024) {
        return `${(value / 1024).toFixed(2)}Gi`;
      }
      return `${value.toFixed(0)}Mi`;
    }
  };

  // Process metrics data for display
  const processedMetrics = podMetrics ? (() => {
    // Aggregate container metrics
    let totalCpu = 0;
    let totalMemory = 0;

    podMetrics.containers.forEach((container: ContainerMetrics) => {
      const cpuValue = parseQuantity(container.usage.cpu);
      const memoryValue = parseQuantity(container.usage.memory);
      totalCpu += cpuValue;
      totalMemory += memoryValue;
    });

    return {
      cpu: {
        value: formatResourceValue(totalCpu, 'cpu'),
        rawValue: totalCpu
      },
      memory: {
        value: formatResourceValue(totalMemory, 'memory'),
        rawValue: totalMemory
      },
      containers: podMetrics.containers.map((container: ContainerMetrics) => ({
        name: container.name,
        cpu: {
          value: formatResourceValue(parseQuantity(container.usage.cpu), 'cpu'),
          rawValue: parseQuantity(container.usage.cpu)
        },
        memory: {
          value: formatResourceValue(parseQuantity(container.usage.memory), 'memory'),
          rawValue: parseQuantity(container.usage.memory)
        }
      }))
    };
  })() : null;

  return (
    <div className="space-y-2">
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

      {/* Pod Metrics Cards - styled like nodes viewer */}
      {processedMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-transparent p-4">
            <div className='flex items-end justify-between mt-6'>
              <div>
                <div className="text-5xl font-light">
                  {processedMetrics.cpu.value}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 ">
                  Current CPU consumption
                </div>
              </div>

              <div className="flex items-center gap-2 ">
                <Cpu className="h-4 w-4 text-green-500" />
                <h3 className="text-sm uppercase font-medium">CPU Usage</h3>
              </div>
            </div>


            <Progress value={Math.min(processedMetrics.cpu.rawValue * 20, 100)} className="h-1 mt-2 dark:bg-gray-400/10" />
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-transparent p-4">
            <div className='flex items-end justify-between mt-6'>
              <div>
                <div className="text-5xl font-light">
                  {processedMetrics.memory.value}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 ">
                  Current memory consumption
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-purple-500" />
                <h3 className="text-sm uppercase font-medium">Memory Usage</h3>
              </div>
            </div>


            <Progress value={Math.min(processedMetrics.memory.rawValue / 10, 100)} className="h-1 mt-2 dark:bg-gray-400/10" />
          </div>
        </div>
      )}


      {/* Container Metrics - collapsible with same card design */}
      {processedMetrics && processedMetrics.containers.length > 0 && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-transparent p-4 mb-2">
          <h2 className="text-sm uppercase font-medium dark:text-gray-400 mb-4 flex items-center gap-2">

            Container Metrics
          </h2>
          <div className="space-y-4">
            {processedMetrics.containers.map((container) => (
              <div key={container.name} className="space-y-2">
                <button
                  onClick={() => toggleContainer(container.name)}
                  className="w-full flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-transparent border hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <div className='flex items-center gap-2'>
                    <Container className="h-5 w-5" />
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">{container.name}</h3>
                  </div>
                  {expandedContainers.has(container.name) ? (
                    <ChevronDown className="h-4 w-4 text-gray-500" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-500" />
                  )}
                </button>

                {expandedContainers.has(container.name) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-transparent p-4">
                      <div className='flex items-end justify-between mt-6'>
                        <div>
                          <div className="text-5xl font-light">
                            {container.cpu.value}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Container CPU consumption
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Cpu className="h-4 w-4 text-green-500" />
                          <h3 className="text-sm uppercase font-medium">CPU Usage</h3>
                        </div>
                      </div>

                      <Progress value={Math.min(container.cpu.rawValue * 20, 100)} className="h-1 mt-2 dark:bg-gray-400/10" />
                    </div>

                    <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-transparent p-4">
                      <div className='flex items-end justify-between mt-6'>
                        <div>
                          <div className="text-5xl font-light">
                            {container.memory.value}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Container memory consumption
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Database className="h-4 w-4 text-purple-500" />
                          <h3 className="text-sm uppercase font-medium">Memory Usage</h3>
                        </div>
                      </div>

                      <Progress value={Math.min(container.memory.rawValue / 10, 100)} className="h-1 mt-2 dark:bg-gray-400/10" />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Show empty state when no metrics are available */}
      {(!processedMetrics || error) && !refreshing && (
        <div className="flex flex-col items-center justify-center py-12 text-gray-500">
          <Activity className="h-12 w-12 mb-4 opacity-50" />
          <p className="text-lg font-medium mb-2">No pod metrics available</p>
          <p className="text-sm">Metrics may not be available if the metrics server is not installed or the pod is not running.</p>
        </div>
      )}
    </div>
  );
};

export default PodMetricsComponent;