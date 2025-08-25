import React, { useState, useEffect, useCallback } from 'react';
import { SiKubernetes, SiGooglecloud, SiContainerd, SiDocker } from '@icons-pack/react-simple-icons';
import { AlertTriangle } from 'lucide-react';
import { kubeProxyRequest } from '@/api/cluster';
import { useCluster } from '@/contexts/clusterContext';

interface TelemetryOverviewProps {
  resourceName: string;
  namespace: string;
  kind: string;
}


interface PrometheusConfig {
  namespace: string;
  service: string;
}

// Runtime mapping for container runtime icons
const getRuntimeIcon = (runtime: string) => {
  const runtimeLower = runtime.toLowerCase();
  if (runtimeLower.includes('containerd')) return SiContainerd;
  if (runtimeLower.includes('docker')) return SiDocker;
  if (runtimeLower.includes('cri-o')) return SiDocker;
  return SiContainerd; // Default fallback
};


const TelemetryOverview: React.FC<TelemetryOverviewProps> = ({ resourceName, namespace }) => {
  const { currentContext } = useCluster();
  const [cpuUsagePercent, setCpuUsagePercent] = useState<number>(0);
  const [memoryUsagePercent, setMemoryUsagePercent] = useState<number>(0);
  const [networkUsagePercent, setNetworkUsagePercent] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Pod info state
  const [controlledBy, setControlledBy] = useState<string>('');
  const [nodeName, setNodeName] = useState<string>('');
  const [podIp, setPodIp] = useState<string>('');
  const [runtime, setRuntime] = useState<string>('');

  // Get monitoring config from localStorage
  const getMonitoringConfig = useCallback((): PrometheusConfig => {
    if (!currentContext) return { namespace: 'monitoring', service: 'prometheus:9090' };

    try {
      const savedConfig = localStorage.getItem(`${currentContext.name}.monitoringConfig`);
      if (savedConfig) {
        const parsedConfig = JSON.parse(savedConfig);
        if (parsedConfig.externalConfig?.monitoring) {
          return parsedConfig.externalConfig.monitoring;
        }
      }
    } catch (err) {
      console.error('Error loading monitoring config:', err);
    }
    
    return { namespace: 'monitoring', service: 'prometheus:9090' };
  }, [currentContext]);

  // Fetch pod info metrics from Prometheus
  const fetchPodInfo = useCallback(async () => {
    if (!currentContext) return;

    try {
      const config = getMonitoringConfig();
      const basePath = `api/v1/namespaces/${config.namespace}/services/${config.service}/proxy/api/v1/query`;
      
      // Query kube_pod_info for controlled by and node info
      const podInfoQuery = `kube_pod_info{pod="${resourceName}", namespace="${namespace}"}`;
      
      // Query kube_pod_container_info for runtime info
      const containerInfoQuery = `kube_pod_container_info{pod="${resourceName}", namespace="${namespace}"}`;

      const [podInfoResponse, containerInfoResponse] = await Promise.all([
        kubeProxyRequest(currentContext.name, `${basePath}?query=${encodeURIComponent(podInfoQuery)}`, 'GET'),
        kubeProxyRequest(currentContext.name, `${basePath}?query=${encodeURIComponent(containerInfoQuery)}`, 'GET'),
      ]);

      // Process pod info
      if (podInfoResponse.status === 'success' && podInfoResponse.data?.result?.length > 0) {
        const podInfo = podInfoResponse.data.result[0].metric;
        const controlledByValue = `${podInfo.created_by_kind}/${podInfo.created_by_name}`;
        setControlledBy(controlledByValue);
        setNodeName(podInfo.node || '');
        setPodIp(podInfo.pod_ip || '');
      }

      // Process container info for runtime
      if (containerInfoResponse.status === 'success' && containerInfoResponse.data?.result?.length > 0) {
        const containerInfo = containerInfoResponse.data.result[0].metric;
        const containerId = containerInfo.container_id || '';
        const runtimeType = containerId.split('://')[0] || 'containerd';
        setRuntime(runtimeType);
      }

    } catch (err) {
      console.error('Error fetching pod info:', err);
    }
  }, [currentContext, resourceName, namespace, getMonitoringConfig]);

  // Fetch percentage metrics from Prometheus
  const fetchPercentageMetrics = useCallback(async () => {
    if (!currentContext) return;

    setLoading(true);
    setError(null);
    
    try {
      const config = getMonitoringConfig();
      const basePath = `api/v1/namespaces/${config.namespace}/services/${config.service}/proxy/api/v1/query`;
      
      // CPU Usage % - relative to requests
      const cpuQuery = `100 * rate(container_cpu_usage_seconds_total{pod="${resourceName}", namespace="${namespace}", container!=""}[5m]) / on (namespace,pod,container) kube_pod_container_resource_requests{resource="cpu"}`;
      
      // Memory Usage % - relative to requests  
      const memoryQuery = `100 * container_memory_working_set_bytes{pod="${resourceName}", namespace="${namespace}", container!=""} / on (namespace,pod,container) kube_pod_container_resource_requests{resource="memory"}`;
      
      // Network Usage % - relative to peak usage over 1h
      const networkQuery = `100 * rate(container_network_receive_bytes_total{pod="${resourceName}", namespace="${namespace}"}[5m]) / max_over_time(rate(container_network_receive_bytes_total{pod="${resourceName}", namespace="${namespace}"}[5m])[1h:])`;

      const [cpuResponse, memoryResponse, networkResponse] = await Promise.all([
        kubeProxyRequest(currentContext.name, `${basePath}?query=${encodeURIComponent(cpuQuery)}`, 'GET'),
        kubeProxyRequest(currentContext.name, `${basePath}?query=${encodeURIComponent(memoryQuery)}`, 'GET'),
        kubeProxyRequest(currentContext.name, `${basePath}?query=${encodeURIComponent(networkQuery)}`, 'GET'),
      ]);

      // Process CPU percentage
      if (cpuResponse.status === 'success' && cpuResponse.data?.result?.length > 0) {
        const cpuValue = parseFloat(cpuResponse.data.result[0].value[1]);
        setCpuUsagePercent(Math.min(100, Math.max(0, cpuValue || 0)));
      } else {
        setCpuUsagePercent(0);
      }

      // Process Memory percentage
      if (memoryResponse.status === 'success' && memoryResponse.data?.result?.length > 0) {
        const memoryValue = parseFloat(memoryResponse.data.result[0].value[1]);
        setMemoryUsagePercent(Math.min(100, Math.max(0, memoryValue || 0)));
      } else {
        setMemoryUsagePercent(0);
      }

      // Process Network percentage
      if (networkResponse.status === 'success' && networkResponse.data?.result?.length > 0) {
        const networkValue = parseFloat(networkResponse.data.result[0].value[1]);
        setNetworkUsagePercent(Math.min(100, Math.max(0, networkValue || 0)));
      } else {
        setNetworkUsagePercent(0);
      }

    } catch (err) {
      console.error('Error fetching percentage metrics:', err);
      setError('Failed to fetch metrics data');
      // Set to 0 if metrics fetch fails
      setCpuUsagePercent(0);
      setMemoryUsagePercent(0);
      setNetworkUsagePercent(0);
    } finally {
      setLoading(false);
    }
  }, [currentContext, resourceName, namespace, getMonitoringConfig]);

  useEffect(() => {
    fetchPercentageMetrics();
    fetchPodInfo();
  }, [fetchPercentageMetrics, fetchPodInfo]);


  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Percentage Metrics Grid */}
      <div className="grid grid-cols-3 gap-1.5">
        <div className="bg-white dark:bg-gray-800/20 rounded-md p-4 min-h-44 flex flex-col">
          <div className="flex justify-between items-center mb-auto">
            <div className="uppercase text-xs text-gray-500">CPU Usage</div>
            {error && (
              <div className="relative group">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                <div className="absolute right-0 top-6 bg-black text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
                  Failed to fetch metrics
                </div>
              </div>
            )}
          </div>
          <div className="mt-auto">
            <div className="text-5xl font-light text-blue-600 dark:text-blue-400 mb-1">
              {cpuUsagePercent.toFixed(1)}%
            </div>
            <div className="w-full h-1 bg-gray-200 dark:bg-gray-800/30 rounded-[0.3rem]">
              <div
                className="h-1 bg-blue-500 dark:bg-blue-400 rounded-[0.3rem]"
                style={{ width: `${Math.min(cpuUsagePercent, 100)}%` }}
              ></div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800/20 rounded-lg p-4 min-h-44 flex flex-col">
          <div className="flex justify-between items-center mb-auto">
            <div className="uppercase text-xs text-gray-500">Memory Usage</div>
            {error && (
              <div className="relative group">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                <div className="absolute right-0 top-6 bg-black text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
                  Failed to fetch metrics
                </div>
              </div>
            )}
          </div>
          <div className="mt-auto">
            <div className="text-5xl font-light text-purple-600 dark:text-purple-400 mb-1">
              {memoryUsagePercent.toFixed(1)}%
            </div>
            <div className="w-full h-1 bg-gray-200 dark:bg-gray-800/50 rounded-[0.3rem]">
              <div
                className="h-1 bg-purple-500 dark:bg-purple-400 rounded-[0.3rem]"
                style={{ width: `${Math.min(memoryUsagePercent, 100)}%` }}
              ></div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800/20 rounded-lg p-4 min-h-44 flex flex-col">
          <div className="flex justify-between items-center mb-auto">
            <div className="uppercase text-xs text-gray-500">Network Usage</div>
            {error && (
              <div className="relative group">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                <div className="absolute right-0 top-6 bg-black text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
                  Failed to fetch metrics
                </div>
              </div>
            )}
          </div>
          <div className="mt-auto">
            <div className="text-5xl font-light text-green-600 dark:text-green-400 mb-1">
              {networkUsagePercent.toFixed(1)}%
            </div>
            <div className="w-full h-1 bg-gray-200 dark:bg-gray-800/50 rounded-[0.3rem]">
              <div
                className="h-1 bg-green-500 dark:bg-green-400 rounded-[0.3rem]"
                style={{ width: `${Math.min(networkUsagePercent, 100)}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>


      {/* Summary Container */}
      <div className="bg-gray-200 dark:bg-gray-800/20 rounded-lg">
        <div className='py-2 px-4 dark:bg-gray-800/40 rounded-t-lg'>
          <h3 className="uppercase text-xs font-medium text-gray-800 dark:text-gray-500">
            Summary
          </h3>
        </div>

        <div className="space-y-2 text-sm p-4">
          <div className="flex justify-between">
            <span className="text-gray-500">Runtime</span>
            <span className="text-gray-900 dark:text-white flex gap-1 items-center">
              {React.createElement(getRuntimeIcon(runtime), { className: 'h-4 w-4' })}
              {runtime || 'containerd'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Controlled By</span>
            <span className="text-gray-900 dark:text-white flex gap-1 items-center">
              <SiKubernetes className='h-4 w-4' />
              {controlledBy || 'Unknown'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Node</span>
            <span className="text-gray-900 dark:text-white flex gap-1 items-center">
              <SiGooglecloud className='h-4 w-4' />
              {nodeName || 'Unknown'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Pod IP</span>
            <span className="text-gray-900 dark:text-white">
              {podIp || 'Unknown'}
            </span>
          </div>
        </div>
      </div>

    </div>
  );
};

export default TelemetryOverview;