import React, { useState, useEffect, useCallback } from 'react';
import { VisualChart, ChartDataPoint, GradientConfig } from '../visualchart';
import { Button } from '@/components/ui/button';
import { Cpu, MemoryStick, Activity, Network, Search, RefreshCw, Sparkles } from 'lucide-react';
import { kubeProxyRequest } from '@/api/cluster';
import { useCluster } from '@/contexts/clusterContext';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useDrawer } from '@/contexts/useDrawer';
import { toast } from '@/hooks/use-toast';

interface MetricsProps {
	resourceName: string;
	namespace: string;
	kind: string;
}

interface MetricData {
	timestamp: number;
	value: number;
}

interface PrometheusConfig {
	namespace: string;
	service: string;
}

interface Pod {
	name: string;
	namespace: string;
	status: string;
	ready: string;
	restarts: number;
	age: string;
}

interface Namespace {
	name: string;
	status: string;
}

const DEFAULT_GRADIENT: GradientConfig = {
	type: 'linear',
	direction: 'vertical',
	colors: [
		{ offset: 0, color: '#3b82f6', opacity: 0.8 },
		{ offset: 0.5, color: '#1e40af', opacity: 0.4 },
		{ offset: 1, color: '#1e40af', opacity: 0.1 },
	],
};

const CPU_GRADIENT: GradientConfig = {
	type: 'linear',
	direction: 'vertical',
	colors: [
		{ offset: 0, color: '#06b6d4', opacity: 0.8 },
		{ offset: 0.6, color: '#0891b2', opacity: 0 },
		{ offset: 1, color: '#0891b2', opacity: 0 },
	],
};

const MEMORY_GRADIENT: GradientConfig = {
	type: 'linear',
	direction: 'vertical',
	colors: [
		{ offset: 0, color: '#10b981', opacity: 0.8 },
		{ offset: 0.6, color: '#059669', opacity: 0 },
		{ offset: 1, color: '#059669', opacity: 0 },
	],
};

const NETWORK_GRADIENT: GradientConfig = {
	type: 'linear',
	direction: 'vertical',
	colors: [
		{ offset: 0, color: '#8b5cf6', opacity: 0.8 },
		{ offset: 0.5, color: '#7c3aed', opacity: 0.4 },
		{ offset: 1, color: '#7c3aed', opacity: 0.1 },
	],
};

const DISK_READ_GRADIENT: GradientConfig = {
	type: 'linear',
	direction: 'vertical',
	colors: [
		{ offset: 0, color: '#10b981', opacity: 0.8 },
		{ offset: 0.6, color: '#059669', opacity: 0.3 },
		{ offset: 1, color: '#059669', opacity: 0 },
	],
};

const DISK_WRITE_GRADIENT: GradientConfig = {
	type: 'linear',
	direction: 'vertical',
	colors: [
		{ offset: 0, color: '#f97316', opacity: 0.8 },
		{ offset: 0.6, color: '#ea580c', opacity: 0.3 },
		{ offset: 1, color: '#ea580c', opacity: 0 },
	],
};

const Metrics: React.FC<MetricsProps> = ({ resourceName, namespace, kind }) => {
	const { currentContext } = useCluster();
	const { addStructuredContent } = useDrawer();
	const [cpuData, setCpuData] = useState<MetricData[]>([]);
	const [memoryData, setMemoryData] = useState<MetricData[]>([]);
	const [networkInData, setNetworkInData] = useState<MetricData[]>([]);
	const [networkOutData, setNetworkOutData] = useState<MetricData[]>([]);
	const [diskReadData, setDiskReadData] = useState<MetricData[]>([]);
	const [diskWriteData, setDiskWriteData] = useState<MetricData[]>([]);
	const [showDiskRead, setShowDiskRead] = useState(true);
	const [showDiskWrite, setShowDiskWrite] = useState(true);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [timeRange, setTimeRange] = useState<'5m' | '15m' | '1h' | '6h' | '24h'>('1h');
	const [showPodDialog, setShowPodDialog] = useState(false);
	const [selectedPod, setSelectedPod] = useState(resourceName);
	const [selectedNamespace, setSelectedNamespace] = useState(namespace);
	const [pods, setPods] = useState<Pod[]>([]);
	const [namespaces, setNamespaces] = useState<Namespace[]>([]);
	const [loadingPods, setLoadingPods] = useState(false);
	const [searchQuery, setSearchQuery] = useState('');
	const [selectedNamespaceFilter, setSelectedNamespaceFilter] = useState<string>('');

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

	// Fetch available namespaces
	const fetchNamespaces = useCallback(async () => {
		if (!currentContext) return;

		try {
			const response = await kubeProxyRequest(currentContext.name, 'api/v1/namespaces', 'GET');

			if (response && response.items) {
				const fetchedNamespaces = response.items.map((item: any) => ({
					name: item.metadata.name,
					status: item.status.phase || 'Unknown',
				}));
				setNamespaces(fetchedNamespaces);
			}
		} catch (err) {
			console.error('Error fetching namespaces:', err);
		}
	}, [currentContext]);

	// Fetch pods from specific namespace or all namespaces
	const fetchPods = useCallback(async (targetNamespace?: string) => {
		if (!currentContext) return;

		setLoadingPods(true);
		try {
			const path = targetNamespace
				? `api/v1/namespaces/${targetNamespace}/pods`
				: 'api/v1/pods';

			const response = await kubeProxyRequest(currentContext.name, path, 'GET');

			if (response && response.items) {
				const fetchedPods = response.items.map((item: any) => ({
					name: item.metadata.name,
					namespace: item.metadata.namespace,
					status: item.status.phase || 'Unknown',
					ready: `${item.status.containerStatuses?.filter((c: any) => c.ready).length || 0}/${item.status.containerStatuses?.length || 0}`,
					restarts: item.status.containerStatuses?.reduce((acc: number, c: any) => acc + (c.restartCount || 0), 0) || 0,
					age: item.metadata.creationTimestamp ?
						Math.floor((Date.now() - new Date(item.metadata.creationTimestamp).getTime()) / (1000 * 60 * 60 * 24)) + 'd' :
						'Unknown',
				}));
				setPods(fetchedPods);
			}
		} catch (err) {
			console.error('Error fetching pods:', err);
			setPods([]);
		} finally {
			setLoadingPods(false);
		}
	}, [currentContext]);

	// Load pods when dialog opens
	useEffect(() => {
		if (showPodDialog) {
			fetchNamespaces();
			fetchPods(selectedNamespaceFilter || undefined);
		}
	}, [showPodDialog, selectedNamespaceFilter, fetchNamespaces, fetchPods]);

	// Fetch metrics data from Prometheus
	const fetchMetrics = useCallback(async () => {
		if (!currentContext) return;

		setLoading(true);
		setError(null);

		try {
			const config = getMonitoringConfig();
			const basePath = `api/v1/namespaces/${config.namespace}/services/${config.service}/proxy/api/v1/query_range`;

			// Calculate time range
			const now = Math.floor(Date.now() / 1000);
			const timeRangeSeconds = {
				'5m': 300,
				'15m': 900,
				'1h': 3600,
				'6h': 21600,
				'24h': 86400,
			}[timeRange];

			const start = now - timeRangeSeconds;
			const step = Math.max(Math.floor(timeRangeSeconds / 60), 15); // At least 15s step, max 60 points

			// CPU Usage Query - rate(container_cpu_usage_seconds_total{pod="<POD_NAME>", namespace="<NAMESPACE>", container!=""}[5m]) * 1000
			const cpuQuery = `rate(container_cpu_usage_seconds_total{pod="${selectedPod}", namespace="${selectedNamespace}", container!=""}[5m]) * 1000`;
			const cpuParams = new URLSearchParams({
				query: cpuQuery,
				start: start.toString(),
				end: now.toString(),
				step: step.toString(),
			});

			// Memory Usage Query
			const memoryQuery = `container_memory_usage_bytes{pod="${selectedPod}", namespace="${selectedNamespace}", container!=""} / 1024 / 1024`; // Convert to MB
			const memoryParams = new URLSearchParams({
				query: memoryQuery,
				start: start.toString(),
				end: now.toString(),
				step: step.toString(),
			});

			// Network In Query
			const networkInQuery = `rate(container_network_receive_bytes_total{pod="${selectedPod}", namespace="${selectedNamespace}"}[5m])`;
			const networkInParams = new URLSearchParams({
				query: networkInQuery,
				start: start.toString(),
				end: now.toString(),
				step: step.toString(),
			});

			// Network Out Query
			const networkOutQuery = `rate(container_network_transmit_bytes_total{pod="${selectedPod}", namespace="${selectedNamespace}"}[5m])`;
			const networkOutParams = new URLSearchParams({
				query: networkOutQuery,
				start: start.toString(),
				end: now.toString(),
				step: step.toString(),
			});

			// Disk Read Query
			const diskReadQuery = `rate(container_fs_reads_bytes_total{pod="${selectedPod}", namespace="${selectedNamespace}"}[5m]) / 1024`;
			const diskReadParams = new URLSearchParams({
				query: diskReadQuery,
				start: start.toString(),
				end: now.toString(),
				step: step.toString(),
			});

			// Disk Write Query
			const diskWriteQuery = `rate(container_fs_writes_bytes_total{pod="${selectedPod}", namespace="${selectedNamespace}"}[5m]) / 1024`;
			const diskWriteParams = new URLSearchParams({
				query: diskWriteQuery,
				start: start.toString(),
				end: now.toString(),
				step: step.toString(),
			});

			// Execute all queries in parallel
			const [cpuResponse, memoryResponse, networkInResponse, networkOutResponse, diskReadResponse, diskWriteResponse] = await Promise.all([
				kubeProxyRequest(currentContext.name, `${basePath}?${cpuParams}`, 'GET'),
				kubeProxyRequest(currentContext.name, `${basePath}?${memoryParams}`, 'GET'),
				kubeProxyRequest(currentContext.name, `${basePath}?${networkInParams}`, 'GET'),
				kubeProxyRequest(currentContext.name, `${basePath}?${networkOutParams}`, 'GET'),
				kubeProxyRequest(currentContext.name, `${basePath}?${diskReadParams}`, 'GET'),
				kubeProxyRequest(currentContext.name, `${basePath}?${diskWriteParams}`, 'GET'),
			]);

			// Process CPU data
			if (cpuResponse.status === 'success' && cpuResponse.data?.result?.length > 0) {
				const values = cpuResponse.data.result[0].values || [];
				const processedData = values.map(([timestamp, value]: [number, string]) => ({
					timestamp: timestamp * 1000, // Convert to milliseconds
					value: parseFloat(value),
				}));
				setCpuData(processedData);
			} else {
				setCpuData([]);
			}

			// Process Memory data
			if (memoryResponse.status === 'success' && memoryResponse.data?.result?.length > 0) {
				const values = memoryResponse.data.result[0].values || [];
				const processedData = values.map(([timestamp, value]: [number, string]) => ({
					timestamp: timestamp * 1000,
					value: parseFloat(value),
				}));
				setMemoryData(processedData);
			} else {
				setMemoryData([]);
			}

			// Process Network In data
			if (networkInResponse.status === 'success' && networkInResponse.data?.result?.length > 0) {
				const values = networkInResponse.data.result[0].values || [];
				const processedData = values.map(([timestamp, value]: [number, string]) => ({
					timestamp: timestamp * 1000,
					value: parseFloat(value) / 1024, // Convert to KB/s
				}));
				setNetworkInData(processedData);
			} else {
				setNetworkInData([]);
			}

			// Process Network Out data
			if (networkOutResponse.status === 'success' && networkOutResponse.data?.result?.length > 0) {
				const values = networkOutResponse.data.result[0].values || [];
				const processedData = values.map(([timestamp, value]: [number, string]) => ({
					timestamp: timestamp * 1000,
					value: parseFloat(value) / 1024, // Convert to KB/s
				}));
				setNetworkOutData(processedData);
			} else {
				setNetworkOutData([]);
			}

			// Process Disk Read data
			if (diskReadResponse.status === 'success' && diskReadResponse.data?.result?.length > 0) {
				const values = diskReadResponse.data.result[0].values || [];
				const processedData = values.map(([timestamp, value]: [number, string]) => ({
					timestamp: timestamp * 1000,
					value: parseFloat(value), // Already converted to KB/s in query
				}));
				setDiskReadData(processedData);
			} else {
				setDiskReadData([]);
			}

			// Process Disk Write data
			if (diskWriteResponse.status === 'success' && diskWriteResponse.data?.result?.length > 0) {
				const values = diskWriteResponse.data.result[0].values || [];
				const processedData = values.map(([timestamp, value]: [number, string]) => ({
					timestamp: timestamp * 1000,
					value: parseFloat(value), // Already converted to KB/s in query
				}));
				setDiskWriteData(processedData);
			} else {
				setDiskWriteData([]);
			}

		} catch (err) {
			console.error('Error fetching metrics:', err);
			setError('Failed to fetch metrics data');
		} finally {
			setLoading(false);
		}
	}, [currentContext, selectedPod, selectedNamespace, timeRange, getMonitoringConfig]);

	useEffect(() => {
		fetchMetrics();
	}, [fetchMetrics]);

	// Convert metric data to chart data
	const convertToChartData = (data: MetricData[]): ChartDataPoint[] => {
		return data.map(point => ({
			x: new Date(point.timestamp).toLocaleTimeString('en-US', {
				hour: '2-digit',
				minute: '2-digit',
				second: timeRange === '5m' || timeRange === '15m' ? '2-digit' : undefined,
			}),
			y: point.value,
		}));
	};

	// Format value based on metric type
	const formatValue = (value: number, unit: string): string => {
		if (unit === 'millicores') {
			return `${value.toFixed(2)}m`;
		} else if (unit === 'MB') {
			return `${value.toFixed(1)} MB`;
		} else if (unit === 'KB/s') {
			return `${value.toFixed(1)} KB/s`;
		}
		return value.toFixed(2);
	};

	// Filter pods based on search query and namespace
	const filteredPods = pods.filter(pod => {
		const matchesSearch = pod.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
			pod.namespace.toLowerCase().includes(searchQuery.toLowerCase());
		const matchesNamespace = !selectedNamespaceFilter || pod.namespace === selectedNamespaceFilter;
		return matchesSearch && matchesNamespace;
	});

	// Handle pod selection
	const handlePodSelect = (pod: Pod) => {
		setSelectedPod(pod.name);
		setSelectedNamespace(pod.namespace);
		setShowPodDialog(false);
		setSearchQuery('');
		setSelectedNamespaceFilter('');
	};

	// Handle Ask Agentkube functionality
	const handleAskAgentkube = (metricType: 'cpu' | 'memory' | 'network' | 'disk') => {
		let data: MetricData[] = [];
		let unit = '';
		let title = '';
		let promqlQuery = '';

		switch (metricType) {
			case 'cpu':
				data = cpuData;
				unit = 'millicores';
				title = 'CPU Usage';
				promqlQuery = `rate(container_cpu_usage_seconds_total{pod="${selectedPod}", namespace="${selectedNamespace}", container!=""}[5m]) * 1000`;
				break;
			case 'memory':
				data = memoryData;
				unit = 'MB';
				title = 'Memory Usage';
				promqlQuery = `container_memory_usage_bytes{pod="${selectedPod}", namespace="${selectedNamespace}", container!=""} / 1024 / 1024`;
				break;
			case 'network':
				data = [...networkInData, ...networkOutData];
				unit = 'KB/s';
				title = 'Network I/O';
				promqlQuery = `rate(container_network_receive_bytes_total{pod="${selectedPod}", namespace="${selectedNamespace}"}[5m]) + rate(container_network_transmit_bytes_total{pod="${selectedPod}", namespace="${selectedNamespace}"}[5m])`;
				break;
			case 'disk':
				data = [...diskReadData, ...diskWriteData];
				unit = 'KB/s';
				title = 'Disk I/O';
				promqlQuery = `Disk Read: rate(container_fs_reads_bytes_total{pod="${selectedPod}", namespace="${selectedNamespace}"}[5m]) / 1024\nDisk Write: rate(container_fs_writes_bytes_total{pod="${selectedPod}", namespace="${selectedNamespace}"}[5m]) / 1024`;
				break;
		}

		const currentValue = data.length > 0 ? data[data.length - 1].value : 0;
		const avgValue = data.length > 0 ? data.reduce((sum, point) => sum + point.value, 0) / data.length : 0;
		const maxValue = data.length > 0 ? Math.max(...data.map(point => point.value)) : 0;

		const structuredContent = `**${title} Metrics for ${kind}/${selectedPod}**

**Resource:** ${selectedPod}
**Namespace:** ${selectedNamespace}
**Time Range:** ${timeRange}

**Current Value:** ${formatValue(currentValue, unit)}
**Average Value:** ${formatValue(avgValue, unit)}
**Peak Value:** ${formatValue(maxValue, unit)}

**Data Points:** ${data.length} measurements
**Metric Type:** ${metricType.toUpperCase()}

**PromQL Query:**
\`\`\`promql
${promqlQuery}
\`\`\`

Please analyze these ${title.toLowerCase()} metrics and provide insights or recommendations. You can use the PromQL query above to understand how these metrics are calculated.`;

		addStructuredContent(structuredContent, `${title}: ${selectedPod}`);
		toast({
			title: "Added to Chat",
			description: `${title} metrics added to chat context`
		});
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center h-64">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex flex-col items-center justify-center h-64 text-center">
				<div className="text-red-500 mb-2">� Error loading metrics</div>
				<div className="text-sm text-gray-500 dark:text-gray-400 mb-4">{error}</div>
				<Button onClick={fetchMetrics} size="sm" variant="outline">
					Retry
				</Button>
			</div>
		);
	}

	return (
		<TooltipProvider>
		<div className="space-y-2 pb-10">
			{/* Header with Pod Selection and Time Range */}
			<div className="flex justify-between items-center">
				<div className="flex items-center gap-3">
				</div>
				<div className="flex gap-0.5">
					{(['5m', '15m', '1h', '6h', '24h'] as const).map((range) => (
						<button
							key={range}
							onClick={() => setTimeRange(range)}
							className={`px-3 py-1 text-xs rounded transition-colors ${timeRange === range
								? 'bg-gray-700/50 text-white'
								: 'bg-gray-200 dark:bg-transparent text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600/40'
								}`}
						>
							{range}
						</button>
					))}
				</div>
			</div>

			{/* Charts Grid */}
			<div className="grid grid-cols-1 gap-2">
				{/* CPU Usage Chart */}
				<div className="bg-gray-50 min-h-64 dark:bg-gray-800/20 rounded-lg ">
					<div className="text-xs flex justify-between dark:bg-gray-800/40  items-center gap-2 mb-2 p-2 rounded-t-md">
						<div className='flex items-center gap-1'>
							<Cpu className="h-4 w-4 text-blue-500" />
							<h4 className="text-gray-900 dark:text-gray-400 uppercase">CPU Usage</h4>
						</div>
						<Tooltip>
							<TooltipTrigger asChild>
								<Sparkles 
									className='h-4 w-4 text-green-400 cursor-pointer hover:text-green-300' 
									onClick={() => handleAskAgentkube('cpu')}
								/>
							</TooltipTrigger>
							<TooltipContent className='p-1' side="left">
								<p>Ask Agentkube</p>
							</TooltipContent>
						</Tooltip>
					</div>
					<div className="h-68 p-2">
						{cpuData.length > 0 ? (
							<VisualChart
								type="area"
								data={[{
									label: 'CPU (millicores)',
									data: convertToChartData(cpuData),
									borderColor: '#06b6d4',
									backgroundColor: '#06b6d4',
								}]}
								gradient={CPU_GRADIENT}
								className='h-64'
								showLegend={false}
								yAxisUnit="m"
								formatValue={(value) => formatValue(value, 'millicores')}
								animate={true}
								customOptions={{
									scales: {
										y: {
											min: 0,
											suggestedMax: Math.max(1, Math.max(...cpuData.map(d => d.value)) * 1.1),
											grid: {
												color: 'rgba(156, 163, 175, 0.1)',
											},
										},
										x: {
											grid: {
												color: 'rgba(156, 163, 175, 0.1)',
											},
										},
									},
								}}
							/>
						) : (
							<div className="flex items-center justify-center h-full text-gray-500">
								No CPU data available
							</div>
						)}
					</div>
				</div>

				{/* Memory Usage Chart */}
				<div className="bg-gray-50  min-h-64 dark:bg-gray-800/20 rounded-lg ">
					<div className="text-xs flex justify-between dark:bg-gray-800/40  items-center gap-2 mb-2 p-2 rounded-t-md">
						<div className='flex items-center gap-1'>
							<MemoryStick className="h-4 w-4 text-green-500" />
							<h4 className="text-gray-900 dark:text-gray-400 uppercase">Memory Usage</h4>
						</div>
						<Tooltip>
							<TooltipTrigger asChild>
								<Sparkles 
									className='h-4 w-4 text-green-400 cursor-pointer hover:text-green-300' 
									onClick={() => handleAskAgentkube('memory')}
								/>
							</TooltipTrigger>
							<TooltipContent className='p-1' side="left">
								<p>Ask Agentkube</p>
							</TooltipContent>
						</Tooltip>
					</div>
					<div className="h-68 p-2">
						{memoryData.length > 0 ? (
							<VisualChart
								type="area"
								data={[{
									label: 'Memory (MB)',
									data: convertToChartData(memoryData),
									borderColor: '#10b981',
									backgroundColor: '#10b981',
								}]}
								gradient={MEMORY_GRADIENT}
								className='h-64'
								showLegend={false}
								yAxisUnit=" MB"
								formatValue={(value) => formatValue(value, 'MB')}
								animate={true}
								customOptions={{
									scales: {
										y: {
											min: 0,
											suggestedMax: Math.max(1, Math.max(...memoryData.map(d => d.value)) * 1.1),
											grid: {
												color: 'rgba(156, 163, 175, 0.1)',
											},
										},
										x: {
											grid: {
												color: 'rgba(156, 163, 175, 0.1)',
											},
										},
									},
								}}
							/>
						) : (
							<div className="flex items-center justify-center h-full text-gray-500">
								No memory data available
							</div>
						)}
					</div>
				</div>

				{/* Network I/O Chart */}
				<div className="bg-gray-50  min-h-64 dark:bg-gray-800/20 rounded-lg ">
					<div className="text-xs flex justify-between dark:bg-gray-800/40  items-center gap-2 mb-2 p-2 rounded-t-md">
						<div className='flex items-center gap-1'>
							<Network className="h-4 w-4 text-purple-500" />
							<h4 className="text-gray-900 dark:text-gray-400 uppercase">Network I/O</h4>
						</div>
						<Tooltip>
							<TooltipTrigger asChild>
								<Sparkles 
									className='h-4 w-4 text-green-400 cursor-pointer hover:text-green-300' 
									onClick={() => handleAskAgentkube('network')}
								/>
							</TooltipTrigger>
							<TooltipContent className='p-1' side="left">
								<p>Ask Agentkube</p>
							</TooltipContent>
						</Tooltip>
					</div>
					<div className="h-68 p-2">
						{(networkInData.length > 0 || networkOutData.length > 0) ? (
							<VisualChart
								type="line"
								data={[
									{
										label: 'Network In (KB/s)',
										data: convertToChartData(networkInData),
										borderColor: '#8b5cf6',
										backgroundColor: 'transparent',
									},
									{
										label: 'Network Out (KB/s)',
										data: convertToChartData(networkOutData),
										borderColor: '#ec4899',
										backgroundColor: 'transparent',
									},
								]}
								className='h-64'
								showLegend={true}
								yAxisUnit=" KB/s"
								formatValue={(value) => formatValue(value, 'KB/s')}
								animate={true}
								customOptions={{
									scales: {
										y: {
											min: 0,
											suggestedMax: Math.max(1, Math.max(...networkInData.map(d => d.value), ...networkOutData.map(d => d.value)) * 1.1),
											grid: {
												color: 'rgba(156, 163, 175, 0.1)',
											},
										},
										x: {
											grid: {
												color: 'rgba(156, 163, 175, 0.1)',
											},
										},
									},
								}}
							/>
						) : (
							<div className="flex items-center justify-center h-full text-gray-500">
								No network data available
							</div>
						)}
					</div>
				</div>

				{/* Disk I/O Chart */}
				<div className="bg-gray-50  min-h-64 dark:bg-gray-800/20 rounded-lg ">
					<div className="text-xs flex justify-between dark:bg-gray-800/40  items-center gap-2 mb-2 p-2 rounded-t-md">
						<div className='flex items-center gap-1'>
							<Activity className="h-4 w-4 text-orange-500" />
							<h4 className="text-gray-900 dark:text-gray-400 uppercase">Disk I/O</h4>
						</div>
						<div className="flex items-center gap-2">
							{/* Filter buttons */}
							<div className="flex gap-1">
								<button
									onClick={() => setShowDiskRead(!showDiskRead)}
									className={`px-2 py-1 text-xs rounded transition-colors ${
										showDiskRead
											? 'bg-gray-500/10 text-gray-400 border border-gray-500/10'
											: 'bg-transparent text-gray-500 border border-transparent hover:bg-gray-600/40'
									}`}
								>
									Read
								</button>
								<button
									onClick={() => setShowDiskWrite(!showDiskWrite)}
									className={`px-2 py-1 text-xs rounded transition-colors ${
										showDiskWrite
											? 'bg-gray-500/10 text-gray-400 border border-gray-500/10'
											: 'bg-transparent text-gray-500 border border-transparent hover:bg-gray-600/40'
									}`}
								>
									Write
								</button>
							</div>
							<Tooltip>
								<TooltipTrigger asChild>
									<Sparkles 
										className='h-4 w-4 text-green-400 cursor-pointer hover:text-green-300' 
										onClick={() => handleAskAgentkube('disk')}
									/>
								</TooltipTrigger>
								<TooltipContent className='p-1' side="left">
									<p>Ask Agentkube</p>
								</TooltipContent>
							</Tooltip>
						</div>
					</div>
					<div className="h-68 p-2">
						{(diskReadData.length > 0 || diskWriteData.length > 0) ? (
							<VisualChart
								type="area"
								data={[
									...(showDiskRead ? [{
										label: 'Disk Read (KB/s)',
										data: convertToChartData(diskReadData),
										borderColor: '#10b981',
										backgroundColor: '#10b981',
									}] : []),
									...(showDiskWrite ? [{
										label: 'Disk Write (KB/s)',
										data: convertToChartData(diskWriteData),
										borderColor: '#f97316',
										backgroundColor: '#f97316',
									}] : []),
								]}
								gradient={showDiskRead && !showDiskWrite ? DISK_READ_GRADIENT : showDiskWrite && !showDiskRead ? DISK_WRITE_GRADIENT : undefined}
								className='h-64'
								showLegend={true}
								yAxisUnit=" KB/s"
								formatValue={(value) => formatValue(value, 'KB/s')}
								animate={true}
								customOptions={{
									scales: {
										y: {
											min: 0,
											suggestedMax: Math.max(1, 
												...(showDiskRead ? diskReadData.map((d: MetricData) => d.value) : []),
												...(showDiskWrite ? diskWriteData.map((d: MetricData) => d.value) : [])
											) * 1.1,
											grid: {
												color: 'rgba(156, 163, 175, 0.1)',
											},
										},
										x: {
											grid: {
												color: 'rgba(156, 163, 175, 0.1)',
											},
										},
									},
								}}
							/>
						) : (
							<div className="flex items-center justify-center h-full text-gray-500">
								No disk I/O data available
							</div>
						)}
					</div>
				</div>
			</div>


			{/* Pod Selection Dialog */}
			<Dialog open={showPodDialog} onOpenChange={setShowPodDialog}>
				<DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
					<DialogHeader>
						<DialogTitle>Select Pod for Metrics</DialogTitle>
						<DialogDescription>
							Choose a pod to view its metrics. You can filter by namespace and search by name.
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-4">
						{/* Search and Filter Controls */}
						<div className="flex gap-4">
							{/* Search Input */}
							<div className="relative flex-1">
								<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
								<Input
									placeholder="Search pods..."
									value={searchQuery}
									onChange={(e) => setSearchQuery(e.target.value)}
									className="pl-10"
								/>
							</div>

							{/* Namespace Filter */}
							<div className="w-48">
								<select
									value={selectedNamespaceFilter}
									onChange={(e) => setSelectedNamespaceFilter(e.target.value)}
									className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-sm"
								>
									<option value="">All namespaces</option>
									{namespaces.map((ns) => (
										<option key={ns.name} value={ns.name}>
											{ns.name}
										</option>
									))}
								</select>
							</div>

							{/* Refresh Button */}
							<Button
								variant="outline"
								size="sm"
								onClick={() => fetchPods(selectedNamespaceFilter || undefined)}
								disabled={loadingPods}
								className="flex items-center gap-2"
							>
								<RefreshCw className={`h-4 w-4 ${loadingPods ? 'animate-spin' : ''}`} />
								Refresh
							</Button>
						</div>

						{/* Pods List */}
						<div className="border rounded-lg max-h-96 overflow-auto">
							{loadingPods ? (
								<div className="flex items-center justify-center p-8">
									<div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
									<span className="ml-2">Loading pods...</span>
								</div>
							) : filteredPods.length === 0 ? (
								<div className="text-center p-8 text-gray-500">
									{pods.length === 0 ? 'No pods found' : 'No pods match your search criteria'}
								</div>
							) : (
								<div className="p-2">
									<table className="w-full text-sm">
										<thead>
											<tr className="border-b border-gray-200 dark:border-gray-700">
												<th className="text-left p-2 font-medium text-gray-900 dark:text-white">Name</th>
												<th className="text-left p-2 font-medium text-gray-900 dark:text-white">Namespace</th>
												<th className="text-left p-2 font-medium text-gray-900 dark:text-white">Status</th>
												<th className="text-left p-2 font-medium text-gray-900 dark:text-white">Ready</th>
												<th className="text-left p-2 font-medium text-gray-900 dark:text-white">Restarts</th>
												<th className="text-left p-2 font-medium text-gray-900 dark:text-white">Age</th>
											</tr>
										</thead>
										<tbody>
											{filteredPods.map((pod) => (
												<tr
													key={`${pod.namespace}/${pod.name}`}
													onClick={() => handlePodSelect(pod)}
													className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors ${selectedPod === pod.name && selectedNamespace === pod.namespace
														? 'bg-blue-50 dark:bg-blue-900/20'
														: ''
														}`}
												>
													<td className="p-2">
														<div className="font-medium text-gray-900 dark:text-white">{pod.name}</div>
													</td>
													<td className="p-2">
														<span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs">
															{pod.namespace}
														</span>
													</td>
													<td className="p-2">
														<span
															className={`px-2 py-1 rounded text-xs ${pod.status === 'Running'
																? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
																: pod.status === 'Pending'
																	? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300'
																	: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
																}`}
														>
															{pod.status}
														</span>
													</td>
													<td className="p-2 text-gray-600 dark:text-gray-400">{pod.ready}</td>
													<td className="p-2 text-gray-600 dark:text-gray-400">{pod.restarts}</td>
													<td className="p-2 text-gray-600 dark:text-gray-400">{pod.age}</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							)}
						</div>
					</div>

					<DialogFooter>
						<Button variant="outline" onClick={() => setShowPodDialog(false)}>
							Cancel
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
		</TooltipProvider>
	);
};

export default Metrics;