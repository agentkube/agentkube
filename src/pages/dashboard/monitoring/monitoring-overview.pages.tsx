import React, { useCallback, useEffect, useState, useRef } from 'react';
import { motion } from "framer-motion";
import { SiGrafana, SiDatadog, SiNewrelic, SiPrometheus } from '@icons-pack/react-simple-icons';
import { SigNoz } from '@/assets/icons';
import { Check, ArrowUpRight, TriangleAlert, TrendingUp, Server, Network, Settings, Cpu, RefreshCw, ChevronDown, Play } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from '@/components/ui/button';
import { Line, ResponsiveContainer, Tooltip, Area, AreaChart, XAxis } from 'recharts';
import { ProxyConfigDialog } from '@/components/custom';
import { kubeProxyRequest } from '@/api/cluster';
import { useCluster } from '@/contexts/clusterContext';
import { getClusterConfig, updateClusterConfig } from '@/api/settings';
import { useToast } from '@/hooks/use-toast';
import MemoryDrilldown from './drilldowns/memory.drilldown';
import CpuDrilldown from './drilldowns/cpu.drilldown';
import DemoVideoDialog from '@/components/custom/demovideodialog/demovideodialog.component';
import MonitoringDashDialog from '@/components/custom/monitoringdash-dialog/monitoringdash-dialog.component';
import {
  ChartTooltip,
} from "@/components/ui/chart";
import { useNavigate } from 'react-router-dom';
import { DEMO_VIDEOS } from '@/constants/demo.constants';

interface DataSource {
  id: string;
  name: string;
  icon: React.ReactElement;
}

const MonitoringOverview = () => {
  const { currentContext } = useCluster();
  const { toast } = useToast();
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState<boolean>(false);
  const [targets, setTargets] = useState<any>(null);
  const [metadata, setMetadata] = useState<any>({});
  const [targetAvailability, setTargetAvailability] = useState<number>(0);
  const [diskUsage, setDiskUsage] = useState<number>(0);
  const [currentCpuUsage, setCurrentCpuUsage] = useState<number>(0);
  const [peakCpuUsage, setPeakCpuUsage] = useState<number>(0);
  const [avgCpuUsage, setAvgCpuUsage] = useState<number>(0);
  const [cpuChartData, setCpuChartData] = useState<Array<{ value: number, time: string }>>([]);
  const [memoryUsagePercent, setMemoryUsagePercent] = useState<number>(0);
  const [usedMemoryGB, setUsedMemoryGB] = useState<number>(0);
  const [totalMemoryGB, setTotalMemoryGB] = useState<number>(0);
  const [topMemoryPods, setTopMemoryPods] = useState<Array<{ name: string, namespace: string, memoryGB: number }>>([]);
  const [requestRate, setRequestRate] = useState<number>(0);
  const [p99Latency, setP99Latency] = useState<number>(0);
  const [errorRate, setErrorRate] = useState<number>(0);
  const [errorRateDelta, setErrorRateDelta] = useState<number>(0);
  const [activePods, setActivePods] = useState<number>(0);
  const [totalPods, setTotalPods] = useState<number>(0);
  const [failedDeployments, setFailedDeployments] = useState<number>(0);
  const [apiServerSuccessRate, setApiServerSuccessRate] = useState<number>(0);
  const [cpuUsagePercent, setCpuUsagePercent] = useState<number>(0);
  const [totalCpuCores, setTotalCpuCores] = useState<number>(0);
  const [topCpuPods, setTopCpuPods] = useState<Array<{ name: string, namespace: string, cpuUsage: number }>>([]);
  const navigate = useNavigate();


  const [monitoringConfig, setMonitoringConfig] = useState<{
    namespace: string;
    service: string;
  }>({
    namespace: 'monitoring',
    service: 'kube-prometheus-stack-prometheus:9090'
  });
  const [selectedTimeRange, setSelectedTimeRange] = useState<string>('1H');
  const [selectedDataSource, setSelectedDataSource] = useState<DataSource>({
    id: 'grafana',
    name: 'Grafana',
    icon: <SiGrafana className="h-4 w-4" />
  });

  const [refreshInterval, setRefreshInterval] = useState<string>('Off');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [isMemoryDrilldownOpen, setIsMemoryDrilldownOpen] = useState<boolean>(false);
  const [isCpuDrilldownOpen, setIsCpuDrilldownOpen] = useState<boolean>(false);

  // For demo dialog and animation
  const [isDemoOpen, setIsDemoOpen] = useState<boolean>(false);
  const [isWatchDemoExpanded, setIsWatchDemoExpanded] = useState<boolean>(false);

  // For monitoring dashboard dialog
  const [isDashboardDialogOpen, setIsDashboardDialogOpen] = useState<boolean>(false);
  const [selectedDashboardTool, setSelectedDashboardTool] = useState<string>('');

  const loadMonitoringConfig = useCallback(async () => {
    if (!currentContext) return;

    try {
      // First try to load from cluster configuration
      try {
        const clusterConfig = await getClusterConfig(currentContext.name);
        if (clusterConfig.config?.prometheus) {
          const prometheusConfig = clusterConfig.config.prometheus;
          const monitoringConfig = {
            namespace: prometheusConfig.namespace || 'monitoring',
            service: prometheusConfig.service_address || prometheusConfig.service || 'kube-prometheus-stack-prometheus:9090'
          };
          setMonitoringConfig(monitoringConfig);

          // Also update localStorage to keep it in sync
          const configToSave = {
            externalConfig: {
              monitoring: monitoringConfig
            }
          };
          localStorage.setItem(`${currentContext.name}.monitoringConfig`, JSON.stringify(configToSave));
          return;
        }
      } catch (clusterError) {
        console.log('No cluster config found, falling back to localStorage:', clusterError);
      }

      // Fallback to localStorage if cluster config not available
      const savedConfig = localStorage.getItem(`${currentContext.name}.monitoringConfig`);
      if (savedConfig) {
        const parsedConfig = JSON.parse(savedConfig);
        if (parsedConfig.externalConfig?.monitoring) {
          setMonitoringConfig(parsedConfig.externalConfig.monitoring);
        }
      }
    } catch (err) {
      console.error('Error loading monitoring config:', err);
    }
  }, [currentContext]);

  const handleSaveConfig = async (config: { namespace: string; service: string }) => {
    if (!currentContext) return;

    setMonitoringConfig(config);

    try {
      // Save to cluster configuration (service maps to service_address)
      const prometheusConfig = {
        namespace: config.namespace,
        service_address: config.service,
      };

      await updateClusterConfig(currentContext.name, {
        prometheus: prometheusConfig
      });

      // Also save to localStorage for caching
      const configKey = `${currentContext.name}.monitoringConfig`;
      const configToSave = {
        externalConfig: {
          monitoring: config
        }
      };
      localStorage.setItem(configKey, JSON.stringify(configToSave));

      toast({
        title: "Configuration Saved",
        description: `Prometheus configuration saved for cluster ${currentContext.name}`,
      });
    } catch (err) {
      console.error('Error saving monitoring config:', err);
      toast({
        title: "Error",
        description: "Failed to save Prometheus configuration",
        variant: "destructive",
      });

      // Still save to localStorage as fallback
      try {
        const configKey = `${currentContext.name}.monitoringConfig`;
        const configToSave = {
          externalConfig: {
            monitoring: config
          }
        };
        localStorage.setItem(configKey, JSON.stringify(configToSave));
      } catch (localErr) {
        console.error('Error saving to localStorage:', localErr);
      }
    }
  };

  useEffect(() => {
    if (currentContext) {
      loadMonitoringConfig();
    }
  }, [currentContext, loadMonitoringConfig]);



  const fetchMetadata = useCallback(async () => {
    if (!currentContext || !monitoringConfig.namespace || !monitoringConfig.service) return;

    try {
      const servicePath = `api/v1/namespaces/${monitoringConfig.namespace}/services/${monitoringConfig.service}/proxy/api/v1/metadata`;
      const metadataResponse = await kubeProxyRequest(currentContext.name, servicePath, 'GET');

      if (metadataResponse.status === 'success') {
        setMetadata(metadataResponse.data);
      }
    } catch (err) {
      console.error('Error fetching Prometheus metadata:', err);
    }
  }, [currentContext, monitoringConfig]);

  const fetchTargets = useCallback(async () => {
    if (!currentContext || !monitoringConfig.namespace || !monitoringConfig.service) return;

    try {
      const servicePath = `api/v1/namespaces/${monitoringConfig.namespace}/services/${monitoringConfig.service}/proxy/api/v1/targets`;
      const targetsResponse = await kubeProxyRequest(currentContext.name, servicePath, 'GET');

      if (targetsResponse.status === 'success') {
        setTargets(targetsResponse.data);
      }
    } catch (err) {
      console.error('Error fetching Prometheus targets:', err);
    }
  }, [currentContext, monitoringConfig]);

  const fetchPrometheusMetrics = useCallback(async () => {
    if (!currentContext || !monitoringConfig.namespace || !monitoringConfig.service) return;

    try {
      // Fetch target availability
      const availabilityQuery = 'count(up == 1) / count(up) * 100';
      const availabilityPath = `api/v1/namespaces/${monitoringConfig.namespace}/services/${monitoringConfig.service}/proxy/api/v1/query`;
      const availabilityParams = new URLSearchParams({ query: availabilityQuery });
      const availabilityResponse = await kubeProxyRequest(currentContext.name, `${availabilityPath}?${availabilityParams}`, 'GET');

      if (availabilityResponse.status === 'success' && availabilityResponse.data?.result?.length > 0) {
        const availability = parseFloat(availabilityResponse.data.result[0].value[1]);
        setTargetAvailability(availability);
      }

      // Fetch disk usage
      const diskQuery = 'prometheus_tsdb_storage_blocks_bytes';
      const diskParams = new URLSearchParams({ query: diskQuery });
      const diskResponse = await kubeProxyRequest(currentContext.name, `${availabilityPath}?${diskParams}`, 'GET');

      if (diskResponse.status === 'success' && diskResponse.data?.result?.length > 0) {
        const bytes = parseFloat(diskResponse.data.result[0].value[1]);
        const gb = bytes / (1024 * 1024 * 1024); // Convert to GB
        setDiskUsage(gb);
      }
    } catch (err) {
      console.error('Error fetching Prometheus metrics:', err);
    }
  }, [currentContext, monitoringConfig]);


  // Add this function after the fetchPrometheusMetrics function
  const fetchCpuMetrics = useCallback(async () => {
    if (!currentContext || !monitoringConfig.namespace || !monitoringConfig.service) return;

    try {
      const basePath = `api/v1/namespaces/${monitoringConfig.namespace}/services/${monitoringConfig.service}/proxy/api/v1/query`;

      // Convert selectedTimeRange to PromQL format
      const timeRangeMap: { [key: string]: string } = {
        '1H': '1h',
        '6H': '6h',
        '24H': '24h',
        '7D': '7d'
      };
      const promTimeRange = timeRangeMap[selectedTimeRange] || '24h';

      // 1. Current CPU Usage
      const currentQuery = '100 - (avg by (cluster) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)';
      const currentParams = new URLSearchParams({ query: currentQuery });
      const currentResponse = await kubeProxyRequest(currentContext.name, `${basePath}?${currentParams}`, 'GET');

      if (currentResponse.status === 'success' && currentResponse.data?.result?.length > 0) {
        const current = parseFloat(currentResponse.data.result[0].value[1]);
        setCurrentCpuUsage(current);
      }

      // 2. Peak CPU Usage over time range
      const peakQuery = `max_over_time(( 100 - avg by (cluster) ( rate(node_cpu_seconds_total{mode="idle"}[5m]) ) * 100 )[${promTimeRange}:])`;
      const peakParams = new URLSearchParams({ query: peakQuery });
      const peakResponse = await kubeProxyRequest(currentContext.name, `${basePath}?${peakParams}`, 'GET');

      if (peakResponse.status === 'success' && peakResponse.data?.result?.length > 0) {
        const peak = parseFloat(peakResponse.data.result[0].value[1]);
        setPeakCpuUsage(peak);
      }

      // 3. Average CPU Usage over time range
      const avgQuery = `avg_over_time(( 100 - avg by (cluster) ( rate(node_cpu_seconds_total{mode="idle"}[5m]) ) * 100 )[${promTimeRange}:])`;
      const avgParams = new URLSearchParams({ query: avgQuery });
      const avgResponse = await kubeProxyRequest(currentContext.name, `${basePath}?${avgParams}`, 'GET');

      if (avgResponse.status === 'success' && avgResponse.data?.result?.length > 0) {
        const avg = parseFloat(avgResponse.data.result[0].value[1]);
        setAvgCpuUsage(avg);
      }

      // 4. CPU Usage time series for chart
      const now = Math.floor(Date.now() / 1000);
      const start = now - (parseInt(promTimeRange.replace(/[hd]/, '')) * (promTimeRange.includes('h') ? 3600 : 86400));
      const step = Math.floor((now - start) / 50); // 50 data points

      const rangeQuery = '100 - (avg by (cluster) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)';
      const rangeParams = new URLSearchParams({
        query: rangeQuery,
        start: start.toString(),
        end: now.toString(),
        step: step.toString()
      });

      const rangePath = `api/v1/namespaces/${monitoringConfig.namespace}/services/${monitoringConfig.service}/proxy/api/v1/query_range`;
      const rangeResponse = await kubeProxyRequest(currentContext.name, `${rangePath}?${rangeParams}`, 'GET');

      if (rangeResponse.status === 'success' && rangeResponse.data?.result?.length > 0) {
        const values = rangeResponse.data.result[0].values || [];
        const chartData = values.map((point: [number, string]) => {
          const date = new Date(point[0] * 1000);
          const timeFormat = selectedTimeRange === '7D'
            ? {
              month: 'short' as const,
              day: 'numeric' as const,
              hour: '2-digit' as const,
              minute: '2-digit' as const
            }
            : {
              hour: '2-digit' as const,
              minute: '2-digit' as const
            };

          return {
            value: parseFloat(point[1]),
            time: date.toLocaleString('en-US', timeFormat)
          };
        });
        setCpuChartData(chartData);
      }

    } catch (err) {
      console.error('Error fetching CPU metrics:', err);
    }
  }, [currentContext, monitoringConfig, selectedTimeRange]);

  const fetchMemoryMetrics = useCallback(async () => {
    if (!currentContext || !monitoringConfig.namespace || !monitoringConfig.service) return;

    try {
      const basePath = `api/v1/namespaces/${monitoringConfig.namespace}/services/${monitoringConfig.service}/proxy/api/v1/query`;

      // 1. Memory Usage Percentage
      const memoryPercentQuery = '100 * ( 1 - sum(node_memory_MemAvailable_bytes) / sum(node_memory_MemTotal_bytes) )';
      const memoryPercentParams = new URLSearchParams({ query: memoryPercentQuery });
      const memoryPercentResponse = await kubeProxyRequest(currentContext.name, `${basePath}?${memoryPercentParams}`, 'GET');

      if (memoryPercentResponse.status === 'success' && memoryPercentResponse.data?.result?.length > 0) {
        const percent = parseFloat(memoryPercentResponse.data.result[0].value[1]);
        setMemoryUsagePercent(percent);
      }

      // 2. Used Memory (GB)
      const usedMemoryQuery = '(sum(node_memory_MemTotal_bytes) - sum(node_memory_MemAvailable_bytes)) / 1024 / 1024 / 1024';
      const usedMemoryParams = new URLSearchParams({ query: usedMemoryQuery });
      const usedMemoryResponse = await kubeProxyRequest(currentContext.name, `${basePath}?${usedMemoryParams}`, 'GET');

      if (usedMemoryResponse.status === 'success' && usedMemoryResponse.data?.result?.length > 0) {
        const usedGB = parseFloat(usedMemoryResponse.data.result[0].value[1]);
        setUsedMemoryGB(usedGB);
      }

      // 3. Total Memory (GB)
      const totalMemoryQuery = 'sum(node_memory_MemTotal_bytes) / 1024 / 1024 / 1024';
      const totalMemoryParams = new URLSearchParams({ query: totalMemoryQuery });
      const totalMemoryResponse = await kubeProxyRequest(currentContext.name, `${basePath}?${totalMemoryParams}`, 'GET');

      if (totalMemoryResponse.status === 'success' && totalMemoryResponse.data?.result?.length > 0) {
        const totalGB = parseFloat(totalMemoryResponse.data.result[0].value[1]);
        setTotalMemoryGB(totalGB);
      }

      // 4. Top Memory Consuming Pods
      const topPodsQuery = 'topk(5, sum by (namespace, pod) (container_memory_usage_bytes{container!=""}) / 1024 / 1024 / 1024)';
      const topPodsParams = new URLSearchParams({ query: topPodsQuery });
      const topPodsResponse = await kubeProxyRequest(currentContext.name, `${basePath}?${topPodsParams}`, 'GET');

      if (topPodsResponse.status === 'success' && topPodsResponse.data?.result?.length > 0) {
        const pods = topPodsResponse.data.result.map((item: any) => ({
          name: item.metric.pod,
          namespace: item.metric.namespace,
          memoryGB: parseFloat(item.value[1])
        }));
        setTopMemoryPods(pods);
      }

    } catch (err) {
      console.error('Error fetching memory metrics:', err);
    }
  }, [currentContext, monitoringConfig]);

  // Add this new function after the fetchMemoryMetrics function:
  const fetchRequestMetrics = useCallback(async () => {
    if (!currentContext || !monitoringConfig.namespace || !monitoringConfig.service) return;

    try {
      const basePath = `api/v1/namespaces/${monitoringConfig.namespace}/services/${monitoringConfig.service}/proxy/api/v1/query`;

      // 1. Request Rate (req/sec)
      const requestRateQuery = 'sum(rate(http_requests_total[5m]))';
      const requestRateParams = new URLSearchParams({ query: requestRateQuery });
      const requestRateResponse = await kubeProxyRequest(currentContext.name, `${basePath}?${requestRateParams}`, 'GET');

      if (requestRateResponse.status === 'success' && requestRateResponse.data?.result?.length > 0) {
        const rate = parseFloat(requestRateResponse.data.result[0].value[1]);
        setRequestRate(rate);
      }

      // 2. P99 Latency (ms)
      const p99LatencyQuery = 'histogram_quantile(0.99, sum by (le) (rate(http_request_duration_seconds_bucket[5m]))) * 1000';
      const p99LatencyParams = new URLSearchParams({ query: p99LatencyQuery });
      const p99LatencyResponse = await kubeProxyRequest(currentContext.name, `${basePath}?${p99LatencyParams}`, 'GET');

      if (p99LatencyResponse.status === 'success' && p99LatencyResponse.data?.result?.length > 0) {
        const latency = parseFloat(p99LatencyResponse.data.result[0].value[1]);
        setP99Latency(latency);
      }

      // 3. Current Error Rate (%)
      const errorRateQuery = '(sum(rate(http_requests_total{code=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))) * 100';
      const errorRateParams = new URLSearchParams({ query: errorRateQuery });
      const errorRateResponse = await kubeProxyRequest(currentContext.name, `${basePath}?${errorRateParams}`, 'GET');

      if (errorRateResponse.status === 'success' && errorRateResponse.data?.result?.length > 0) {
        const currentErrorRate = parseFloat(errorRateResponse.data.result[0].value[1]);
        setErrorRate(currentErrorRate);
      }

      // 4. Error Rate Delta (compared to previous period)
      const errorRateDeltaQuery = '((sum(rate(http_requests_total{code=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))) - (sum(rate(http_requests_total{code=~"5.."}[5m] offset 5m)) / sum(rate(http_requests_total[5m] offset 5m)))) * 100';
      const errorRateDeltaParams = new URLSearchParams({ query: errorRateDeltaQuery });
      const errorRateDeltaResponse = await kubeProxyRequest(currentContext.name, `${basePath}?${errorRateDeltaParams}`, 'GET');

      if (errorRateDeltaResponse.status === 'success' && errorRateDeltaResponse.data?.result?.length > 0) {
        const delta = parseFloat(errorRateDeltaResponse.data.result[0].value[1]);
        setErrorRateDelta(delta);
      }

    } catch (err) {
      console.error('Error fetching request metrics:', err);
    }
  }, [currentContext, monitoringConfig]);

  const fetchPodsAndDeploymentsMetrics = useCallback(async () => {
    if (!currentContext || !monitoringConfig.namespace || !monitoringConfig.service) return;

    try {
      const basePath = `api/v1/namespaces/${monitoringConfig.namespace}/services/${monitoringConfig.service}/proxy/api/v1/query`;

      // 1. Active Pods (Running)
      const activePodsQuery = 'sum(count(kube_pod_status_phase{phase="Running"}) by (namespace))';
      const activePodsParams = new URLSearchParams({ query: activePodsQuery });
      const activePodsResponse = await kubeProxyRequest(currentContext.name, `${basePath}?${activePodsParams}`, 'GET');

      if (activePodsResponse.status === 'success' && activePodsResponse.data?.result?.length > 0) {
        const active = parseFloat(activePodsResponse.data.result[0].value[1]);
        setActivePods(active);
      }

      // 2. Total Pods (all phases)
      const totalPodsQuery = 'count(count by (namespace, pod) (kube_pod_status_phase))';
      const totalPodsParams = new URLSearchParams({ query: totalPodsQuery });
      const totalPodsResponse = await kubeProxyRequest(currentContext.name, `${basePath}?${totalPodsParams}`, 'GET');

      if (totalPodsResponse.status === 'success' && totalPodsResponse.data?.result?.length > 0) {
        const total = parseFloat(totalPodsResponse.data.result[0].value[1]);
        setTotalPods(total);
      }

      // 3. Failed Deployments (last 24h)
      const failedDeploymentsQuery = 'sum(increase(kube_deployment_status_condition{condition="Progressing", status="false"}[24h]))';
      const failedDeploymentsParams = new URLSearchParams({ query: failedDeploymentsQuery });
      const failedDeploymentsResponse = await kubeProxyRequest(currentContext.name, `${basePath}?${failedDeploymentsParams}`, 'GET');

      if (failedDeploymentsResponse.status === 'success' && failedDeploymentsResponse.data?.result?.length > 0) {
        const failed = parseFloat(failedDeploymentsResponse.data.result[0].value[1]);
        setFailedDeployments(failed);
      }

    } catch (err) {
      console.error('Error fetching pods and deployments metrics:', err);
    }
  }, [currentContext, monitoringConfig]);

  const fetchContainerCpuMetrics = useCallback(async () => {
    if (!currentContext || !monitoringConfig.namespace || !monitoringConfig.service) return;

    try {
      const basePath = `api/v1/namespaces/${monitoringConfig.namespace}/services/${monitoringConfig.service}/proxy/api/v1/query`;

      // 1. CPU Usage Percentage (current usage vs limits)
      const cpuUsageQuery = '100 * sum(rate(container_cpu_usage_seconds_total{image!=""}[5m])) / sum(kube_pod_container_resource_limits{resource="cpu"})';
      const cpuUsageParams = new URLSearchParams({ query: cpuUsageQuery });
      const cpuUsageResponse = await kubeProxyRequest(currentContext.name, `${basePath}?${cpuUsageParams}`, 'GET');

      if (cpuUsageResponse.status === 'success' && cpuUsageResponse.data?.result?.length > 0) {
        const percent = parseFloat(cpuUsageResponse.data.result[0].value[1]);
        setCpuUsagePercent(percent);
      }

      // 2. Total CPU Cores Used
      const totalCpuQuery = 'sum(rate(container_cpu_usage_seconds_total{image!=""}[5m]))';
      const totalCpuParams = new URLSearchParams({ query: totalCpuQuery });
      const totalCpuResponse = await kubeProxyRequest(currentContext.name, `${basePath}?${totalCpuParams}`, 'GET');

      if (totalCpuResponse.status === 'success' && totalCpuResponse.data?.result?.length > 0) {
        const totalCores = parseFloat(totalCpuResponse.data.result[0].value[1]);
        setTotalCpuCores(totalCores);
      }

      // 3. Top 5 CPU consuming pods
      const topCpuPodsQuery = 'topk(5, sum by (namespace, pod) (rate(container_cpu_usage_seconds_total{image!=""}[5m])))';
      const topCpuPodsParams = new URLSearchParams({ query: topCpuPodsQuery });
      const topCpuPodsResponse = await kubeProxyRequest(currentContext.name, `${basePath}?${topCpuPodsParams}`, 'GET');

      if (topCpuPodsResponse.status === 'success' && topCpuPodsResponse.data?.result?.length > 0) {
        const pods = topCpuPodsResponse.data.result.map((item: any) => ({
          name: item.metric.pod,
          namespace: item.metric.namespace,
          cpuUsage: parseFloat(item.value[1])
        }));
        setTopCpuPods(pods);
      }

    } catch (err) {
      console.error('Error fetching container CPU metrics:', err);
    }
  }, [currentContext, monitoringConfig]);

  // Add this new function after the fetchPodsAndDeploymentsMetrics function:
  const fetchApiServerMetrics = useCallback(async () => {
    if (!currentContext || !monitoringConfig.namespace || !monitoringConfig.service) return;

    try {
      const basePath = `api/v1/namespaces/${monitoringConfig.namespace}/services/${monitoringConfig.service}/proxy/api/v1/query`;

      // API Server Success Rate (%)
      const apiServerSuccessQuery = 'sum(rate(apiserver_request_total{code=~"2.."}[5m])) / sum(rate(apiserver_request_total[5m])) * 100';
      const apiServerSuccessParams = new URLSearchParams({ query: apiServerSuccessQuery });
      const apiServerSuccessResponse = await kubeProxyRequest(currentContext.name, `${basePath}?${apiServerSuccessParams}`, 'GET');

      if (apiServerSuccessResponse.status === 'success' && apiServerSuccessResponse.data?.result?.length > 0) {
        const successRate = parseFloat(apiServerSuccessResponse.data.result[0].value[1]);
        setApiServerSuccessRate(successRate);
      }

    } catch (err) {
      console.error('Error fetching API server metrics:', err);
    }
  }, [currentContext, monitoringConfig]);

  useEffect(() => {
    if (currentContext && monitoringConfig.namespace && monitoringConfig.service) {
      fetchMetadata();
      fetchTargets();
      fetchPrometheusMetrics();
      fetchCpuMetrics();
      fetchMemoryMetrics();
      fetchRequestMetrics();
      fetchPodsAndDeploymentsMetrics();
      fetchApiServerMetrics();
      fetchContainerCpuMetrics();
    }
  }, [currentContext?.name, monitoringConfig, fetchMetadata, fetchTargets, fetchPrometheusMetrics, fetchCpuMetrics, fetchMemoryMetrics, fetchRequestMetrics, fetchPodsAndDeploymentsMetrics, fetchApiServerMetrics, fetchContainerCpuMetrics]);

  useEffect(() => {
    if (currentContext && monitoringConfig.namespace && monitoringConfig.service) {
      fetchCpuMetrics();
    }
  }, [selectedTimeRange, fetchCpuMetrics]);

  const formatRequestRate = (rate: number): string => {
    if (rate >= 1000) {
      return `${(rate / 1000).toFixed(1)}K`;
    }
    return rate.toFixed(0);
  };

  const formatErrorRateDelta = (delta: number): string => {
    const sign = delta >= 0 ? '↑' : '↓';
    return `(${sign} ${Math.abs(delta).toFixed(2)}%)`;
  };

  const dataSources: DataSource[] = [
    {
      id: 'grafana',
      name: 'Grafana',
      icon: <SiGrafana className="h-4 w-4" />
    },
    {
      id: 'signoz',
      name: 'SigNoz',
      icon: <SigNoz className="h-4 w-4" />
    },
    {
      id: 'newrelic',
      name: 'New Relic',
      icon: <SiNewrelic className="h-4 w-4" />
    },
    {
      id: 'datadog',
      name: 'Datadog',
      icon: <SiDatadog className="h-4 w-4" />
    }
  ];

  const handleTimeRangeSelect = (timeRange: string) => {
    setSelectedTimeRange(timeRange);
    console.log(`Selected time range: ${timeRange}`);
    // Here you could add logic to fetch new data based on the selected time range
  };

  const refreshAllMetrics = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        fetchMetadata(),
        fetchTargets(),
        fetchPrometheusMetrics(),
        fetchCpuMetrics(),
        fetchMemoryMetrics(),
        fetchRequestMetrics(),
        fetchPodsAndDeploymentsMetrics(),
        fetchApiServerMetrics(),
        fetchContainerCpuMetrics()
      ]);
    } catch (error) {
      console.error('Error refreshing metrics:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchMetadata, fetchTargets, fetchPrometheusMetrics, fetchCpuMetrics, fetchMemoryMetrics, fetchRequestMetrics, fetchPodsAndDeploymentsMetrics, fetchApiServerMetrics, fetchContainerCpuMetrics]);

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
        refreshAllMetrics();
      }, intervalMs);
    }
  }, [refreshAllMetrics]);

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

  // Watch Demo button animation effect
  useEffect(() => {
    const expandTimer = setTimeout(() => {
      setIsWatchDemoExpanded(true);
    }, 500);

    const collapseTimer = setTimeout(() => {
      setIsWatchDemoExpanded(false);
    }, 3000); // 500ms + 2500ms = 3000ms total

    return () => {
      clearTimeout(expandTimer);
      clearTimeout(collapseTimer);
    };
  }, []);

  const handleManualRefresh = () => {
    refreshAllMetrics();
  };

  const handleOpenDashboard = (toolId: string) => {
    setSelectedDashboardTool(toolId);
    setIsDashboardDialogOpen(true);
  };

  return (
    <div className="
		      max-h-[93vh] overflow-y-auto
          
          [&::-webkit-scrollbar]:w-1.5 
          [&::-webkit-scrollbar-track]:bg-transparent 
          [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">
      <div className="p-6 mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-5xl dark:text-gray-500/40 font-[Anton] uppercase font-bold">Monitoring</h1>

          <div className="flex items-center gap-2">
            {/* Watch Demo Button */}
            <Button
              onClick={() => setIsDemoOpen(true)}
              className="flex items-center justify-between gap-2 relative overflow-hidden"
            >
              <motion.div
                initial={{ width: 40 }}
                animate={{
                  width: isWatchDemoExpanded ? 144 : 14
                }}
                transition={{
                  duration: 0.4,
                  ease: "easeInOut"
                }}
                className="flex items-center justify-between gap-2"
              >
                <Play className="w-4 h-4 flex-shrink-0" />
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{
                    opacity: isWatchDemoExpanded ? 1 : 0,
                    width: isWatchDemoExpanded ? 'auto' : 0
                  }}
                  transition={{
                    duration: 0.3,
                    delay: isWatchDemoExpanded ? 0.2 : 0,
                    ease: "easeOut"
                  }}
                  className="whitespace-nowrap text-sm overflow-hidden"
                >
                  Watch Demo
                </motion.span>
              </motion.div>
            </Button>

            {/* Data Source Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="flex items-center gap-2 bg-white dark:bg-transparent border border-gray-200 dark:border-gray-700/40 hover:bg-gray-50 dark:hover:dark:bg-gray-800/20 transition-colors">
                  <div className="w-4 h-4 text-gray-600 dark:text-gray-300">
                    {selectedDataSource.icon}
                  </div>
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    {selectedDataSource.name}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-48 bg-white dark:bg-card/40 backdrop-blur-md border border-gray-200 dark:border-gray-700/40"
              >
                {dataSources.map((source) => (
                  <DropdownMenuItem
                    key={source.id}
                    onClick={() => setSelectedDataSource(source)}
                    className="flex items-center justify-between px-3 py-2 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 text-gray-600 dark:text-gray-300">
                        {source.icon}
                      </div>
                      <span className="text-xs text-gray-700 dark:text-gray-300">
                        {source.name}
                      </span>
                    </div>
                    {selectedDataSource.id === source.id && (
                      <Check className="h-4 w-4 text-blue-500" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              onClick={() => handleOpenDashboard(selectedDataSource.id)}
              className="flex justify-between w-56"
            >
              Open {selectedDataSource.name} Dashboard
              <ArrowUpRight className="h-4 w-4 text-gray-600 dark:text-gray-300" />
            </Button>

            {/* Refresh Button */}
            <DropdownMenu>
              <div className="flex items-center">
                <Button
                  variant="outline"
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                  className="flex items-center gap-2 rounded-r-none border-r-0"
                >
                  <RefreshCw className={`h-4 w-4 text-gray-600 dark:text-gray-300 ${isRefreshing ? 'animate-spin' : ''}`} />
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
                className="w-20 bg-white dark:bg-card/40 backdrop-blur-md border border-gray-200 dark:border-gray-700/40"
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



            {/* Settings Button */}
            <Button
              variant="outline"

              onClick={() => setIsConfigDialogOpen(true)}
              className="flex items-center gap-2"
            >
              <Settings className="h-4 w-4 text-gray-600 dark:text-gray-300" />
            </Button>
          </div>
        </div>

        <ProxyConfigDialog
          isOpen={isConfigDialogOpen}
          onClose={() => setIsConfigDialogOpen(false)}
          onSave={handleSaveConfig}
          defaultConfig={monitoringConfig}
          serviceName="Prometheus"
          serviceDescription="Configure the Prometheus monitoring service connection details for metrics collection. This affects where pod metrics are queried from."
          defaultNamespace="monitoring"
          defaultService="kube-prometheus-stack-prometheus:9090"
        />

        {/* Main container */}
        <div className="grid grid-cols-4 grid-rows-6 gap-2 h-[750px]">
          {/* Row 1 */}
          {/* Active Pods - 1 col 1 row */}
          <div className="bg-gray-200/30 dark:bg-gray-800/20 rounded-lg p-4 col-span-1 row-span-1">
            <div className="text-gray-800 dark:text-gray-400 text-xs mb-2 flex justify-between items-center">
              ACTIVE PODS
              <div className="text-green-500">●</div>
            </div>
            <div className="text-4xl font-light text-black dark:text-white">{activePods}</div>
            <div className="text-gray-800 dark:text-gray-400 text-xs mt-1">/ {totalPods}</div>
          </div>

          {/* Request Rate & Latency - 2 col 2 row */}
          <div className="bg-gray-200/30 dark:bg-gray-800/20 rounded-lg p-4 col-span-2 row-span-2">
            <div className="text-gray-800 dark:text-gray-400 text-xs mb-4 flex justify-between items-center">
              REQUEST RATE & P99 LATENCY
              <TrendingUp />
            </div>
            <div className="flex items-end gap-4 mb-4">
              <div>
                <div className="text-4xl font-light text-black dark:text-white">{formatRequestRate(requestRate)}</div>
                <div className="text-gray-800 dark:text-gray-400 text-xs">req/sec</div>
              </div>
              <div>
                <div className="text-4xl font-light text-orange-400">{p99Latency.toFixed(0)}ms</div>
                <div className="text-gray-800 dark:text-gray-400 text-xs">p99 latency</div>
              </div>
            </div>
            <div className="text-gray-800 dark:text-gray-400 text-xs mb-2">ERROR RATE</div>
            <div className="text-red-400 text-sm font-medium">{errorRate.toFixed(2)}% {formatErrorRateDelta(errorRateDelta)}</div>
          </div>

          {/* CPU Usage Chart - 1 col 2 row */}
          <div className="bg-gray-200/30 dark:bg-gray-800/20 rounded-lg col-span-1 row-span-2">
            <div className='p-4'>
              <div className="text-gray-800 dark:text-gray-400 text-xs mb-4 flex justify-between items-center">
                CLUSTER CPU USAGE
                <div className="flex gap-0.5">
                  {['1H', '6H', '24H', '7D'].map((timeRange) => (
                    <button
                      key={timeRange}
                      className={`px-1 py-1 text-xs rounded transition-colors ${timeRange === selectedTimeRange
                        ? 'text-blue-400 bg-blue-400/10'
                        : 'text-gray-500 hover:text-gray-300'
                        }`}
                      onClick={() => handleTimeRangeSelect(timeRange)}
                    >
                      {timeRange}
                    </button>
                  ))}
                </div>
              </div>
              <div className='flex items-baseline space-x-2'>
                <div className="text-4xl font-light text-black dark:text-white">{currentCpuUsage.toFixed(1)}%</div>
                <div className="text-xs text-gray-800 dark:text-gray-400 mb-2">Current AVG</div>
              </div>
              <div className='flex space-x-2'>
                <div className="text-xs text-gray-800 dark:text-gray-400 mb-2">Peak: {peakCpuUsage.toFixed(1)}%</div>
                <div className="text-xs text-gray-800 dark:text-gray-400">AVG: {avgCpuUsage.toFixed(1)}%</div>
              </div>
            </div>
            {/* CPU usage chart */}
            <div className="h-32 mt-4 p-0">
              <ResponsiveContainer className="-ml-1 rounded-md" width="103%" height="100%">
                <AreaChart data={cpuChartData.length > 0 ? cpuChartData : [
                  ...Array.from({ length: 50 }, (_, i) => {
                    const now = new Date();
                    const timeOffset = (i * 2) * 60000; // 2 minutes intervals
                    const timePoint = new Date(now.getTime() - timeOffset);
                    const timeFormat = selectedTimeRange === '7D'
                      ? {
                        month: 'short' as const,
                        day: 'numeric' as const,
                        hour: '2-digit' as const,
                        minute: '2-digit' as const
                      }
                      : {
                        hour: '2-digit' as const,
                        minute: '2-digit' as const
                      };

                    return {
                      value: 0,
                      time: timePoint.toLocaleString('en-US', timeFormat)
                    };
                  }).reverse()
                ]}>
                  <defs>
                    <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6CC" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="time"
                    axisLine={false}
                    tickLine={false}
                    tick={false}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="rounded-lg border dark:bg-card/40 backdrop-blur-md max-w-sm p-3 shadow-lg">
                            <p className="text-xs font-medium text-muted-foreground mb-1">
                              Time: {label}
                            </p>
                            <p className="text-sm font-bold">
                              {parseFloat(payload[0].value as string).toFixed(2)}% CPU Usage
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#3b82f6"
                    fill="url(#cpuGradient)"
                    fillOpacity={1}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Row 2 */}
          {/* Failed Deployments - 1 col 1 row */}
          <div className="bg-gray-200/30 dark:bg-gray-800/20 rounded-lg p-4 col-span-1 row-span-1">
            <div className="text-gray-800 dark:text-gray-400 text-xs mb-2 flex justify-between items-center">
              FAILED DEPLOYMENTS

              <TriangleAlert className="text-red-500 dark:text-red-500/50" />
            </div>
            <div className="text-4xl font-light text-red-400">{failedDeployments.toFixed(2)}</div>
            <div className="text-gray-800 dark:text-gray-400 text-xs mt-1">last 24h</div>
          </div>

          {/* Row 3-6 */}
          {/* Memory Usage - 1 col 4 row */}
          <div className="flex flex-col bg-gray-200/30 dark:bg-gray-800/20 rounded-lg p-4 col-span-1 row-span-4">
            <div className="flex-1">
              <div className="text-gray-800 dark:text-gray-400 text-xs mb-4 flex justify-between items-center">
                MEMORY USAGE
                <div className=" w-6 h-6 flex items-center justify-center">
                  <div className="dark:text-gray-600 text-xs">
                    <Server />
                  </div>
                </div>
              </div>
              <div className="text-5xl font-light dark:text-white mb-4">{memoryUsagePercent.toFixed(1)}%</div>
              <div className="text-gray-800 dark:text-gray-400 text-xs mb-6">{usedMemoryGB.toFixed(1)}GB / {totalMemoryGB.toFixed(1)}GB</div>
              <div className="text-gray-800 dark:text-gray-400 text-xs mb-4">TOP CONSUMERS</div>
              {/* Top memory consuming pods */}
              <div className="space-y-2">
                {topMemoryPods.map((pod, index) => (
                  <div key={index} onClick={() => navigate(`/dashboard/explore/pods/${pod.namespace}/${pod.name}`)} className="flex justify-between group items-center bg-gray-200/60 dark:bg-gray-700/30 hover:dark:bg-gray-600/30 rounded p-2">
                    <span className="text-xs text-gray-700 dark:text-gray-300 truncate group-hover:text-blue-500 cursor-pointer pr-1">{pod.name}</span>
                    <span className="text-xs dark:text-white">{pod.memoryGB.toFixed(1)}GB</span>
                  </div>
                ))}
              </div>
            </div>


            <Button
              className='flex justify-between'
              onClick={() => setIsMemoryDrilldownOpen(true)}
            >
              Drilldown Memory Usage
              <ArrowUpRight />
            </Button>
          </div>

          {/* Container CPU Usage - 1 col 4 row */}
          <div className="flex flex-col bg-gray-800/10 dark:bg-slate-700/30  rounded-lg p-4 col-span-1 row-span-4">
            <div className="flex-1">
              <div className="text-gray-800 dark:text-gray-400 text-xs mb-4 flex justify-between items-center">
                CONTAINER CPU USAGE
                <div className=" w-6 h-6 flex items-center justify-center">
                  <div className="text-blue-600 dark:text-blue-500 text-xs">
                    <Cpu />
                  </div>
                </div>
              </div>
              <div className="text-5xl font-light dark:text-white mb-4">{cpuUsagePercent.toFixed(1)}%</div>
              <div className="text-gray-800 dark:text-gray-400 text-xs mb-2">{totalCpuCores.toFixed(2)} cores used</div>
              {/* Progress Bar */}
              <div className="mb-6">
                <div className="w-full bg-gray-700 rounded-full h-1">
                  <div
                    className="bg-blue-500 h-1 rounded-full"
                    style={{ width: `${Math.min(cpuUsagePercent, 100)}%` }}
                  ></div>
                </div>
              </div>
              <div className="text-gray-800 dark:text-gray-400 text-xs mb-4">TOP CPU CONSUMERS</div>
              {/* Top CPU consuming pods */}
              <div className="space-y-2">
                {topCpuPods.map((pod, index) => (
                  <div key={index} onClick={() => navigate(`/dashboard/explore/pods/${pod.namespace}/${pod.name}`)} className="flex justify-between group items-center bg-gray-200/60 dark:bg-gray-700/30 hover:dark:bg-gray-600/30 rounded p-2">
                    <span className="text-xs text-gray-700 dark:text-gray-300 truncate group-hover:text-blue-500 cursor-pointer pr-1">{pod.name}</span>
                    <span className="text-xs dark:text-white">{(pod.cpuUsage * 1000).toFixed(0)}m</span>
                  </div>
                ))}
              </div>
            </div>


            <Button
              className='flex justify-between'
              onClick={() => setIsCpuDrilldownOpen(true)}
            >
              Drilldown CPU Usage
              <ArrowUpRight />
            </Button>
          </div>


          {/* Prometheus Metrics - 1 col 3 row */}
          <div className="bg-gray-200/30 dark:bg-gray-800/20 rounded-lg p-4 col-span-1 row-span-3 flex flex-col">
            <div className="flex-1">
              <div className="text-gray-800 dark:text-gray-400 text-xs mb-4 flex justify-between items-center">
                PROMETHEUS METRICS
                <div className="text-orange-600">
                  <SiPrometheus />
                </div>
              </div>
              <div className="text-5xl font-light dark:text-white">{targetAvailability.toFixed(1)}%</div>
              <div className="text-gray-800 dark:text-gray-400 text-xs mb-2">Target availability</div>
              {/* Progress Bar */}
              <div className="my-4">
                <div className="w-full bg-gray-700 rounded-full h-1">
                  <div
                    className="bg-white h-1 rounded-full"
                    style={{ width: `${targetAvailability}%` }}
                  ></div>
                </div>
              </div>

              <div className="space-y-3 my-2">
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">Targets</span>
                  <span className="text-xs dark:text-white">{targets?.activeTargets?.length || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">Metrics</span>
                  <span className="text-xs dark:text-white">{Object.keys(metadata).length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">Disk Usage</span>
                  <span className="text-xs dark:text-white">{diskUsage.toFixed(1)}GB</span>
                </div>
              </div>
            </div>

            {/* View Metrics Button */}
            <Button className='flex justify-between'>
              Drilldown Metrics
              <ArrowUpRight />
            </Button>
          </div>

          {/* Service Mesh Health - 1 col 3 row */}
          <div className="bg-gray-200/30 dark:bg-gray-800/20 rounded-lg p-4 col-span-1 row-span-3">
            <div className="flex justify-between items-center mb-4">
              <div className="text-gray-800 dark:text-gray-400 text-xs">API SERVER</div>
              <div className="text-green-500">
                <Network />
              </div>
            </div>
            <div className="dark:text-white text-5xl font-light mb-2">{apiServerSuccessRate.toFixed(2)}%</div>
            <div className="text-gray-800 dark:text-gray-400 text-xs mb-2">SUCCESS RATE</div>
            {/* Service mesh circular progress */}
            <div className="relative w-56 h-56 mx-auto">
              <svg className="w-56 h-56 transform -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="35"
                  fill="none"
                  className="stroke-[#d2d3d3] dark:stroke-[#374151]"
                  strokeWidth="3"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="35"
                  fill="none"
                  stroke="rgb(34, 197, 94)"
                  strokeWidth="4"
                  strokeDasharray="200"
                  strokeDashoffset={220 - (apiServerSuccessRate / 100) * 220}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-lg font-light dark:text-white">{apiServerSuccessRate.toFixed(2)}%</div>
                <div className="text-xs text-gray-400">{apiServerSuccessRate >= 95 ? 'HEALTHY' : 'DEGRADED'}</div>
              </div>
            </div>
          </div>

          {/* Custom Dashboard - 2 col 1 row */}
          <div className="bg-gray-200 dark:bg-gray-600/40 hover:dark:bg-gray-500/30 cursor-pointer transition-color rounded-lg p-4 col-span-2 row-span-1 flex justify-between items-center">
            <div>
              <div className="text-gray-800 dark:text-gray-300/30 text-4xl font-medium w-10 font-[Anton] uppercase">Custom Dashboard</div>
            </div>

            <div className='h-full flex flex-col justify-between items-end'>
              <ArrowUpRight />
              <div className="text-black dark:text-gray-300 text-sm">COMING SOON</div>
            </div>
          </div>
        </div>

        {/* Memory Drilldown Drawer */}
        <MemoryDrilldown
          isOpen={isMemoryDrilldownOpen}
          onClose={() => setIsMemoryDrilldownOpen(false)}
          monitoringConfig={monitoringConfig}
        />

        {/* CPU Drilldown Drawer */}
        <CpuDrilldown
          isOpen={isCpuDrilldownOpen}
          onClose={() => setIsCpuDrilldownOpen(false)}
          monitoringConfig={monitoringConfig}
        />

        {/* Demo Dialog */}
        <DemoVideoDialog
          isOpen={isDemoOpen}
          onClose={() => setIsDemoOpen(false)}
          videoUrl={DEMO_VIDEOS.MONITORING_DEMO.videoUrl}
          title={DEMO_VIDEOS.MONITORING_DEMO.title}
        />

        {/* Monitoring Dashboard Dialog */}
        <MonitoringDashDialog
          isOpen={isDashboardDialogOpen}
          onClose={() => setIsDashboardDialogOpen(false)}
          clusterName={currentContext?.name || ''}
          selectedTool={selectedDashboardTool}
        />
      </div>
    </div>
  );
};

export default MonitoringOverview;