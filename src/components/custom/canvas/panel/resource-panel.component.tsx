import React, { useEffect } from 'react';
import { Panel } from '@xyflow/react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, Check, ChevronDown, ChevronRight, Activity, AlertTriangle, ChevronUp, ChartLine, Tag, Terminal, Container, Move, ArrowUpLeft, ArrowUpRight, ArrowDownLeft, ArrowDownRight } from 'lucide-react';
import { useState } from 'react';
import { K8sResourceData } from '@/utils/kubernetes-graph.utils';
import { KubeResourceIconMap, KubeResourceType } from '@/constants/kuberesource-icon-map.constant';
import { useCluster } from '@/contexts/clusterContext';
import { OPERATOR_URL } from '@/config';
import { getPodMetrics, PodMetrics } from '@/api/internal/metrics';

type PanelPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

interface ResourceDetailsPanelProps {
  resource: K8sResourceData | null;
  onClose: () => void;
}

// Define types for container status to fix implicit any errors
interface ContainerState {
  running?: { startedAt: string };
  terminated?: {
    containerID: string;
    exitCode: number;
    finishedAt: string;
    reason: string;
    startedAt: string;
  };
  waiting?: { reason: string; message: string };
}

interface ContainerStatus {
  containerID: string;
  image: string;
  imageID: string;
  name: string;
  ready: boolean;
  restartCount: number;
  started: boolean;
  state: ContainerState;
  lastState?: ContainerState;
}

interface ResourceUsage {
  value: string;
  percentage?: number;
  requested?: string;
  limits?: string;
}

interface PodResourceMetrics {
  cpu: ResourceUsage;
  memory: ResourceUsage;
}

export const ResourceDetailsPanel = ({ resource, onClose }: ResourceDetailsPanelProps) => {
  const [copied, setCopied] = useState(false);
  const [showAllLabels, setShowAllLabels] = useState(false);
  const [showAllConditions, setShowAllConditions] = useState(false);
  const [showMetrics, setShowMetrics] = useState(false);
  const [isMetricsServerAvailable, setIsMetricsServerAvailable] = useState<boolean>(false);
  const [metricsCheckComplete, setMetricsCheckComplete] = useState<boolean>(false);
  const [resourceMetrics, setResourceMetrics] = useState<Record<string, PodResourceMetrics>>({});
  const [detailedMetrics, setDetailedMetrics] = useState<PodMetrics | null>(null);
  const [showContainers, setShowContainers] = useState(false);
  const [panelPosition, setPanelPosition] = useState<PanelPosition>('top-right');
  const [showPositionDropdown, setShowPositionDropdown] = useState(false);

  const { currentContext } = useCluster();

  const positionOptions = [
    { value: 'top-left' as PanelPosition, label: 'Top Left', icon: ArrowUpLeft },
    { value: 'top-right' as PanelPosition, label: 'Top Right', icon: ArrowUpRight },
    { value: 'bottom-left' as PanelPosition, label: 'Bottom Left', icon: ArrowDownLeft },
    { value: 'bottom-right' as PanelPosition, label: 'Bottom Right', icon: ArrowDownRight },
  ];

  const handlePositionChange = (newPosition: PanelPosition) => {
    setPanelPosition(newPosition);
    setShowPositionDropdown(false);
  };

  const renderConditions = (conditions: any[]) => {
    if (!conditions || conditions.length === 0) return null;
    const conditionCount = conditions.length;
    return (
      <div>
        {/* Collapsible Header */}
        <button
          onClick={() => setShowAllConditions(!showAllConditions)}
          className="w-full flex items-center justify-between py-2 rounded-[0.3rem]"
        >
          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-300 flex items-center">
            <Activity size={14} className="mr-1" />
            Events ({conditionCount})
          </h4>
          <div className="flex items-center text-xs text-blue-600 dark:text-blue-400">
            {showAllConditions ? (
              <ChevronUp size={14} className="ml-1" />
            ) : (
              <ChevronDown size={14} className="ml-1" />
            )}
          </div>
        </button>

        {/* Collapsible Content */}
        {showAllConditions && (
          <div className="mt-2 space-y-2">
            {conditions.map((condition, index) => (
              <div key={index} className="p-2 bg-gray-50 dark:bg-transparent dark:text-gray-200 rounded-[0.3rem] border border-gray-400 dark:border-gray-700/50">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium dark:text-gray-200">{condition.type}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-[0.3rem] ${condition.status === 'True'
                    ? 'bg-emerald-200 dark:bg-green-500/10 text-green-500'
                    : 'bg-red-100 dark:bg-red-500/10 text-red-800 dark:text-red-400'
                    }`}>
                    {condition.status}
                  </span>
                </div>
                {condition.reason && (
                  <div className="text-xs mt-1 text-gray-600 dark:text-gray-400">
                    Reason: {condition.reason}
                  </div>
                )}
                {condition.message && (
                  <div className="text-xs mt-0.5 text-gray-600 dark:text-gray-300 line-clamp-2" title={condition.message}>
                    {condition.message}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

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

  const checkMetricsServerAvailability = async (): Promise<boolean> => {
    try {
      if (!currentContext) return false;
      const metricsApiUrl = `${OPERATOR_URL}/clusters/${currentContext.name}/apis/metrics.k8s.io/v1beta1`;
      const response = await fetch(metricsApiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      return response.ok;
    } catch (err) {
      console.error('Metrics server check failed:', err);
      return false;
    }
  };

  // Fetch metrics for the specific pod
  const fetchPodMetrics = async () => {
    if (!currentContext || resource?.resourceType !== 'pods' || !resource.resourceName || !resource.namespace) {
      return;
    }

    try {
      // Use your detailed metrics API instead of the basic one
      const metrics = await getPodMetrics(currentContext.name, resource.namespace, resource.resourceName);
      setDetailedMetrics(metrics);

      // Also set the basic metrics for compatibility with existing code
      const podKey = `${resource.namespace}/${resource.resourceName}`;
      const metricsMap: Record<string, PodResourceMetrics> = {
        [podKey]: {
          cpu: {
            value: metrics.cpu.currentUsage,
            percentage: metrics.cpu.usagePercentage,
            requested: metrics.cpu.requestedCPU,
            limits: metrics.cpu.limitCPU
          },
          memory: {
            value: metrics.memory.currentUsage,
            percentage: metrics.memory.usagePercentage,
            requested: metrics.memory.requestedMemory,
            limits: metrics.memory.limitMemory
          }
        }
      };
      setResourceMetrics(metricsMap);
    } catch (err) {
      console.error('Failed to fetch pod metrics:', err);
    }
  };

  // Get resource metrics
  const getResourceMetrics = (resourceName: string, namespace?: string): PodResourceMetrics | null => {
    if (resource?.resourceType !== 'pods' || !resourceMetrics) return null;

    const podKey = `${namespace}/${resourceName}`;
    return resourceMetrics[podKey] || null;
  };

  // Check if metrics are available/setup
  const isMetricsSetup = () => {
    return metricsCheckComplete && isMetricsServerAvailable;
  };


  useEffect(() => {
    const checkMetrics = async () => {
      const available = await checkMetricsServerAvailability();
      setIsMetricsServerAvailable(available);
      setMetricsCheckComplete(true);

      if (available && resource?.resourceType === 'pods') {
        await fetchPodMetrics();
      }
    };

    if (resource) {
      checkMetrics();
    }
  }, [resource, currentContext]);

  if (!resource) return null;

  // Helper to render metrics section
  const renderMetrics = () => {
    if (resource.resourceType !== 'pods') return null;

    const metricsAvailable = isMetricsSetup();
    const metrics = detailedMetrics; // Use detailed metrics instead

    return (
      <div className="my-3">
        <div className="flex items-center justify-between py-2 rounded-md cursor-pointer"
          onClick={() => setShowMetrics(!showMetrics)}
        >
          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-300 flex items-center">
            <ChartLine size={14} className="mr-1" />
            Metrics
          </h4>
          <button className="flex items-center text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors">
            {showMetrics ? (
              <ChevronUp size={14} className="ml-1" />
            ) : (
              <ChevronDown size={14} className="ml-1" />
            )}
          </button>
        </div>

        {showMetrics && (
          <div className="space-y-2">
            {!metricsAvailable ? (
              <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-[0.3rem] border border-yellow-200 dark:border-yellow-800/50">
                <div className="flex items-center mb-1">
                  <AlertTriangle size={14} className="text-yellow-600 dark:text-yellow-400 mr-2" />
                  <span className="text-xs font-medium text-yellow-800 dark:text-yellow-300">
                    Metrics Not Available
                  </span>
                </div>
                <p className="text-xs text-yellow-700 dark:text-yellow-400">
                  Metrics server is not setup or metrics data is not available for this resource.
                </p>
              </div>
            ) : metrics ? (
              <div className="space-y-3">
                {/* CPU Metrics */}
                <div className="p-2 bg-gray-50 dark:bg-gray-800/10 rounded-[0.3rem] border border-gray-400 dark:border-gray-700/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">CPU</span>
                    <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                      {metrics.cpu.currentUsage}
                    </span>
                  </div>

                  {/* CPU Usage Bar */}
                  <div className="mb-2">
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                      <span>Usage</span>
                      <span>{metrics.cpu.usagePercentage.toFixed(1)}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full">
                      <div
                        className={`h-full rounded-full ${metrics.cpu.usagePercentage > 90
                            ? 'bg-red-500'
                            : metrics.cpu.usagePercentage > 70
                              ? 'bg-yellow-500'
                              : 'bg-green-500'
                          }`}
                        style={{ width: `${Math.min(metrics.cpu.usagePercentage, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* CPU Details */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500 dark:text-gray-400">Requested:</span>
                      <span className="text-gray-700 dark:text-gray-300">{metrics.cpu.requestedCPU}</span>
                    </div>
                    {metrics.cpu.limitCPU && metrics.cpu.limitCPU !== '0' && (
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500 dark:text-gray-400">Limits:</span>
                        <span className="text-gray-700 dark:text-gray-300">{metrics.cpu.limitCPU}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Memory Metrics */}
                <div className="p-2 bg-gray-50 dark:bg-gray-800/10 rounded-[0.3rem] border border-gray-400 dark:border-gray-700/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Memory</span>
                    <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                      {metrics.memory.currentUsage}
                    </span>
                  </div>

                  {/* Memory Usage Bar */}
                  <div className="mb-2">
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                      <span>Usage</span>
                      <span>{metrics.memory.usagePercentage.toFixed(1)}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full">
                      <div
                        className={`h-full rounded-full ${metrics.memory.usagePercentage > 90
                            ? 'bg-red-500'
                            : metrics.memory.usagePercentage > 70
                              ? 'bg-yellow-500'
                              : 'bg-green-500'
                          }`}
                        style={{ width: `${Math.min(metrics.memory.usagePercentage, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Memory Details */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500 dark:text-gray-400">Requested:</span>
                      <span className="text-gray-700 dark:text-gray-300">{metrics.memory.requestedMemory}</span>
                    </div>
                    {metrics.memory.limitMemory && metrics.memory.limitMemory !== '0' && (
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500 dark:text-gray-400">Limits:</span>
                        <span className="text-gray-700 dark:text-gray-300">{metrics.memory.limitMemory}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Container Breakdown if multiple containers */}
                {metrics.containers.length > 1 && (
                  <div className="space-y-2">
                    <h5 className="text-xs font-medium text-gray-500 dark:text-gray-300">Container Breakdown</h5>
                    {metrics.containers.map((container, index) => (
                      <div key={index} className="p-2 bg-gray-50 dark:bg-gray-800/5 rounded-[0.3rem] border border-gray-300 dark:border-gray-700/30">
                        <div className="text-xs font-medium mb-1">{container.name}</div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">CPU: </span>
                            <span className="font-semibold">{container.cpu.currentUsage}</span>
                            <span className="text-gray-400 ml-1">({container.cpu.usagePercentage}%)</span>
                          </div>
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">Memory: </span>
                            <span className="font-semibold">{container.memory.currentUsage}</span>
                            <span className="text-gray-400 ml-1">({container.memory.usagePercentage.toFixed(0)}%)</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-2 bg-gray-50 dark:bg-gray-800/30 rounded-[0.3rem] border border-gray-400 dark:border-gray-700/50">
                <span className="text-xs text-gray-600 dark:text-gray-400">No metrics data available</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };


  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(resource.resourceName);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  // Content based on resource type
  const renderResourceSpecificDetails = () => {
    const status = resource.status as Record<string, any>;
    const replicas = status?.replicas as Record<string, any> | undefined;

    switch (resource.resourceType) {
      case 'pods': {
        const podPhase = replicas?.phase as string | undefined;
        const podIP = replicas?.podIP as string | undefined;
        const containerStatuses = replicas?.containerStatuses as ContainerStatus[] | undefined;

        return (
          <div className="pt-1">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-300 mb-2">Pod Details</h3>

            {/* Phase/Status */}
            <div className='grid grid-cols-2 gap-x-2'>
              {podPhase && (
                <div className="mb-2">
                  <h4 className="text-xs font-medium text-gray-500 dark:text-gray-300">Status</h4>
                  <span
                    className={`inline-block mt-1 px-2 py-1 rounded-[0.3rem] text-xs ${podPhase === 'Running'
                      ? 'bg-emerald-200 dark:bg-green-500/10 text-green-800 dark:text-green-400'
                      : podPhase === 'Pending'
                        ? 'bg-yellow-100 dark:bg-yellow-500/10 text-yellow-800 dark:text-yellow-400'
                        : 'bg-gray-100 dark:bg-gray-500/10 text-gray-800 dark:text-gray-300'
                      }`}
                  >
                    {podPhase}
                  </span>
                </div>
              )}

              {/* Pod IP */}
              {podIP && (
                <div className="mb-2">
                  <h4 className="text-xs font-medium text-gray-500 dark:text-gray-300">Pod IP</h4>
                  <p className="mt-1 text-sm text-gray-900 dark:text-gray-200 px-2 py-0.5  w-fit bg-gray-200 dark:bg-gray-700/50 rounded-[0.3rem]">{podIP}</p>
                </div>
              )}
            </div>

            {/* Container Information */}
            {containerStatuses && containerStatuses.length > 0 && (
              <div className="mt-2">
                {/* Collapsible Header */}
                <button
                  onClick={() => setShowContainers(!showContainers)}
                  className="w-full flex items-center justify-between py-2 rounded-[0.3rem]"
                >
                  <h4 className="text-xs font-medium text-gray-500 dark:text-gray-300 flex items-center">
                    <Container size={14} className="mr-1" />
                    Containers ({containerStatuses.length})
                  </h4>
                  <div className="flex items-center text-xs text-blue-600 dark:text-blue-400">
                    {showContainers ? (
                      <ChevronUp size={14} className="ml-1" />
                    ) : (
                      <ChevronDown size={14} className="ml-1" />
                    )}
                  </div>
                </button>

                {/* Collapsible Content */}
                {showContainers && (
                  <div className="mt-2 space-y-2">
                    {containerStatuses.map((container, index) => (
                      <div key={index} className="p-2 bg-gray-50 dark:bg-gray-800/30 rounded-[0.3rem] border border-gray-400 dark:border-gray-700/50">
                        <p className="text-sm font-medium dark:text-gray-200">{container.name}</p>
                        <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                          <div className='flex space-x-0.5'>
                            <span className="text-gray-500 dark:text-gray-400">Image:</span>
                            <p className="truncate text-gray-700 dark:text-gray-300" title={container.image}>
                              {container.image.split(':')[0].split('/').pop()}:{container.image.split(':')[1] || 'latest'}
                            </p>
                          </div>
                          <div className='flex space-x-0.5'>
                            <span className="text-gray-500 dark:text-gray-400">State:</span>
                            <span className="dark:text-gray-300">
                              {container.state.running ? 'Running' :
                                container.state.terminated ? 'Terminated' : 'Waiting'}
                            </span>
                          </div>
                          {/* Additional container details */}
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">Ready:</span>
                            <span className={`ml-1 ${container.ready ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                              {container.ready ? 'Yes' : 'No'}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">Restarts:</span>
                            <span className={`ml-1 ${container.restartCount > 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-700 dark:text-gray-300'}`}>
                              {container.restartCount}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Metrics Section */}
            {renderMetrics()}

            {/* Render conditions */}
            {renderConditions(status?.conditions)}
          </div>
        );
      }

      case 'deployments': {
        // Extract deployment-specific data
        const availableReplicas = replicas?.availableReplicas;
        const readyReplicas = replicas?.readyReplicas;
        const totalReplicas = replicas?.replicas;
        const updatedReplicas = replicas?.updatedReplicas;

        return (
          <div className="pt-4">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-300 mb-2">Deployment Details</h3>

            {/* Replicas Information */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <h4 className="text-xs font-medium text-gray-500 dark:text-gray-300">Available</h4>
                <p className="text-sm mt-1">
                  <span className={availableReplicas > 0 ? "text-green-600 dark:text-green-400 font-medium" : "text-gray-600 dark:text-gray-400"}>
                    {availableReplicas || 0}
                  </span>
                  {totalReplicas ? ` / ${totalReplicas}` : ''}
                </p>
              </div>
              <div>
                <h4 className="text-xs font-medium text-gray-500 dark:text-gray-300">Ready</h4>
                <p className="text-sm mt-1">
                  <span className={readyReplicas > 0 ? "text-green-600 dark:text-green-400 font-medium" : "text-gray-600 dark:text-gray-400"}>
                    {readyReplicas || 0}
                  </span>
                  {totalReplicas ? ` / ${totalReplicas}` : ''}
                </p>
              </div>
              <div>
                <h4 className="text-xs font-medium text-gray-500 dark:text-gray-300">Updated</h4>
                <p className="text-sm mt-1">
                  <span className={updatedReplicas > 0 ? "text-blue-600 dark:text-blue-400 font-medium" : "text-gray-600 dark:text-gray-400"}>
                    {updatedReplicas || 0}
                  </span>
                  {totalReplicas ? ` / ${totalReplicas}` : ''}
                </p>
              </div>
              {replicas?.observedGeneration && (
                <div>
                  <h4 className="text-xs font-medium text-gray-500 dark:text-gray-300">Generation</h4>
                  <p className="text-sm mt-1 text-gray-600 dark:text-gray-400">
                    {replicas.observedGeneration}
                  </p>
                </div>
              )}
            </div>

            {/* Render conditions */}
            {renderConditions(status?.conditions)}
          </div>
        );
      }

      case 'replicasets': {
        // Extract replicaset-specific data
        const availableReplicas = replicas?.availableReplicas;
        const fullyLabeledReplicas = replicas?.fullyLabeledReplicas;
        const totalReplicas = replicas?.replicas;
        const readyReplicas = replicas?.readyReplicas;

        return (
          <div className="pt-4">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-300 mb-2">ReplicaSet Details</h3>

            {/* Replicas Information */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <h4 className="text-xs font-medium text-gray-500 dark:text-gray-300">Total</h4>
                <p className="text-sm mt-1 text-gray-600 dark:text-gray-300 font-medium">
                  {totalReplicas || 0}
                </p>
              </div>
              {availableReplicas !== undefined && (
                <div>
                  <h4 className="text-xs font-medium text-gray-500 dark:text-gray-300">Available</h4>
                  <p className="text-sm mt-1">
                    <span className={availableReplicas > 0 ? "text-green-600 dark:text-green-400 font-medium" : "text-gray-600 dark:text-gray-400"}>
                      {availableReplicas}
                    </span>
                  </p>
                </div>
              )}
              {readyReplicas !== undefined && (
                <div>
                  <h4 className="text-xs font-medium text-gray-500 dark:text-gray-300">Ready</h4>
                  <p className="text-sm mt-1">
                    <span className={readyReplicas > 0 ? "text-green-600 dark:text-green-400 font-medium" : "text-gray-600 dark:text-gray-400"}>
                      {readyReplicas}
                    </span>
                  </p>
                </div>
              )}
              {fullyLabeledReplicas !== undefined && (
                <div>
                  <h4 className="text-xs font-medium text-gray-500 dark:text-gray-300">Fully Labeled</h4>
                  <p className="text-sm mt-1 text-gray-600 dark:text-gray-400">
                    {fullyLabeledReplicas}
                  </p>
                </div>
              )}
              {replicas?.observedGeneration && (
                <div>
                  <h4 className="text-xs font-medium text-gray-500 dark:text-gray-300">Generation</h4>
                  <p className="text-sm mt-1 text-gray-600 dark:text-gray-400">
                    {replicas.observedGeneration}
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      }

      case 'services': {
        // Extract service-specific data
        const loadBalancer = replicas?.loadBalancer as Record<string, any> | undefined;
        const clusterIP = replicas?.clusterIP;
        const type = replicas?.type;
        const ports = replicas?.ports as any[] | undefined;

        return (
          <div className="pt-4">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-300 mb-2">Service Details</h3>

            {type && (
              <div className="mb-2">
                <h4 className="text-xs font-medium text-gray-500 dark:text-gray-300">Type</h4>
                <p className="text-sm mt-1 text-gray-900 dark:text-gray-200">{type}</p>
              </div>
            )}

            {clusterIP && (
              <div className="mb-2">
                <h4 className="text-xs font-medium text-gray-500 dark:text-gray-300">Cluster IP</h4>
                <p className="text-sm mt-1 text-gray-900 dark:text-gray-200">{clusterIP}</p>
              </div>
            )}

            {loadBalancer && loadBalancer.ingress && loadBalancer.ingress.length > 0 && (
              <div className="mb-2">
                <h4 className="text-xs font-medium text-gray-500 dark:text-gray-300">LoadBalancer</h4>
                {loadBalancer.ingress.map((ing: any, idx: number) => (
                  <p key={idx} className="text-sm mt-1 text-gray-900 dark:text-gray-200">
                    {ing.ip || ing.hostname}
                  </p>
                ))}
              </div>
            )}

            {ports && ports.length > 0 && (
              <div className="mb-2">
                <h4 className="text-xs font-medium text-gray-500 dark:text-gray-300 mb-1">Ports</h4>
                <div className="space-y-1">
                  {ports.map((port, idx) => (
                    <div key={idx} className="text-xs">
                      <span className="text-gray-800 dark:text-gray-200">{port.port}</span>
                      {port.targetPort && (
                        <span className="text-gray-600 dark:text-gray-400"> → {port.targetPort}</span>
                      )}
                      {port.protocol && (
                        <span className="text-gray-500 dark:text-gray-400"> ({port.protocol})</span>
                      )}
                      {port.name && (
                        <span className="text-gray-500 dark:text-gray-400 ml-1">{port.name}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      }

      case 'endpoints': {
        const subsets = replicas?.subsets as any[] | undefined;

        return (
          <div className="pt-4">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-300 mb-2">Endpoints Details</h3>

            {subsets && subsets.length > 0 ? (
              <div className="mb-2">
                <h4 className="text-xs font-medium text-gray-500 dark:text-gray-300 mb-1">Addresses</h4>
                {subsets.map((subset, subsetIdx) => (
                  <div key={subsetIdx} className="mb-2">
                    {subset.addresses && subset.addresses.length > 0 ? (
                      <div className="space-y-1">
                        {subset.addresses.map((addr: any, addrIdx: number) => (
                          <p key={addrIdx} className="text-sm text-green-700 dark:text-green-400">
                            {addr.ip}{addr.targetRef?.name ? ` (${addr.targetRef.name})` : ''}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400">No ready addresses</p>
                    )}

                    {subset.notReadyAddresses && subset.notReadyAddresses.length > 0 && (
                      <div className="mt-1">
                        <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400">Not Ready</h5>
                        <div className="space-y-1 mt-1">
                          {subset.notReadyAddresses.map((addr: any, addrIdx: number) => (
                            <p key={addrIdx} className="text-sm text-red-600 dark:text-red-400">
                              {addr.ip}{addr.targetRef?.name ? ` (${addr.targetRef.name})` : ''}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">No endpoints found</p>
            )}
          </div>
        );
      }

      case 'networkpolicies': {
        return (
          <div className="pt-4">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-300 mb-2">Network Policy Details</h3>

            <p className="text-sm text-gray-600 dark:text-gray-400">
              Network policies define how pods communicate with each other and other network endpoints.
            </p>
          </div>
        );
      }

      case 'daemonsets': {
        // Extract daemonset-specific data
        const currentNumberScheduled = replicas?.currentNumberScheduled;
        const desiredNumberScheduled = replicas?.desiredNumberScheduled;
        const numberAvailable = replicas?.numberAvailable;
        const numberMisscheduled = replicas?.numberMisscheduled;
        const numberReady = replicas?.numberReady;
        const updatedNumberScheduled = replicas?.updatedNumberScheduled;

        return (
          <div className="pt-4">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-300 mb-2">DaemonSet Details</h3>

            {/* Replicas Information */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <h4 className="text-xs font-medium text-gray-500 dark:text-gray-300">Desired</h4>
                <p className="text-sm mt-1 text-gray-600 dark:text-gray-400 font-medium">
                  {desiredNumberScheduled || 0}
                </p>
              </div>
              <div>
                <h4 className="text-xs font-medium text-gray-500 dark:text-gray-300">Current</h4>
                <p className="text-sm mt-1">
                  <span className={currentNumberScheduled === desiredNumberScheduled ? "text-green-600 dark:text-green-400 font-medium" : "text-orange-600 dark:text-orange-400 font-medium"}>
                    {currentNumberScheduled || 0}
                  </span>
                </p>
              </div>
              <div>
                <h4 className="text-xs font-medium text-gray-500 dark:text-gray-300">Ready</h4>
                <p className="text-sm mt-1">
                  <span className={numberReady === desiredNumberScheduled ? "text-green-600 dark:text-green-400 font-medium" : "text-orange-600 dark:text-orange-400 font-medium"}>
                    {numberReady || 0}
                  </span>
                </p>
              </div>
              <div>
                <h4 className="text-xs font-medium text-gray-500 dark:text-gray-300">Available</h4>
                <p className="text-sm mt-1">
                  <span className={numberAvailable === desiredNumberScheduled ? "text-green-600 dark:text-green-400 font-medium" : "text-orange-600 dark:text-orange-400 font-medium"}>
                    {numberAvailable || 0}
                  </span>
                </p>
              </div>
              <div>
                <h4 className="text-xs font-medium text-gray-500 dark:text-gray-300">Updated</h4>
                <p className="text-sm mt-1">
                  <span className={updatedNumberScheduled === desiredNumberScheduled ? "text-green-600 dark:text-green-400 font-medium" : "text-orange-600 dark:text-orange-400 font-medium"}>
                    {updatedNumberScheduled || 0}
                  </span>
                </p>
              </div>
              {numberMisscheduled !== undefined && numberMisscheduled > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-gray-500 dark:text-gray-300">Misscheduled</h4>
                  <p className="text-sm mt-1 text-red-600 dark:text-red-400 font-medium">
                    {numberMisscheduled}
                  </p>
                </div>
              )}
              {replicas?.observedGeneration && (
                <div>
                  <h4 className="text-xs font-medium text-gray-500 dark:text-gray-300">Generation</h4>
                  <p className="text-sm mt-1 text-gray-600 dark:text-gray-400">
                    {replicas.observedGeneration}
                  </p>
                </div>
              )}
            </div>

            {/* Render conditions */}
            {renderConditions(status?.conditions)}
          </div>
        );
      }

      case 'statefulsets': {
        // Extract statefulset-specific data
        const replicas = status?.replicas as Record<string, any> | undefined;
        const availableReplicas = replicas?.availableReplicas;
        const readyReplicas = replicas?.readyReplicas;
        const totalReplicas = replicas?.replicas;
        const updatedReplicas = replicas?.updatedReplicas;
        const currentRevision = replicas?.currentRevision;
        const updateRevision = replicas?.updateRevision;
        const currentReplicas = replicas?.currentReplicas;

        return (
          <div className="pt-4">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-300 mb-2">StatefulSet Details</h3>

            {/* Replicas Information */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <h4 className="text-xs font-medium text-gray-500 dark:text-gray-300">Total</h4>
                <p className="text-sm mt-1 text-gray-600 dark:text-gray-400 font-medium">
                  {totalReplicas || 0}
                </p>
              </div>
              <div>
                <h4 className="text-xs font-medium text-gray-500 dark:text-gray-300">Available</h4>
                <p className="text-sm mt-1">
                  <span className={availableReplicas === totalReplicas ? "text-green-600 dark:text-green-400 font-medium" : "text-orange-600 dark:text-orange-400 font-medium"}>
                    {availableReplicas || 0}
                  </span>
                  {totalReplicas ? ` / ${totalReplicas}` : ''}
                </p>
              </div>
              <div>
                <h4 className="text-xs font-medium text-gray-500 dark:text-gray-300">Ready</h4>
                <p className="text-sm mt-1">
                  <span className={readyReplicas === totalReplicas ? "text-green-600 dark:text-green-400 font-medium" : "text-orange-600 dark:text-orange-400 font-medium"}>
                    {readyReplicas || 0}
                  </span>
                  {totalReplicas ? ` / ${totalReplicas}` : ''}
                </p>
              </div>
              <div>
                <h4 className="text-xs font-medium text-gray-500 dark:text-gray-300">Updated</h4>
                <p className="text-sm mt-1">
                  <span className={updatedReplicas === totalReplicas ? "text-green-600 dark:text-green-400 font-medium" : "text-orange-600 dark:text-orange-400 font-medium"}>
                    {updatedReplicas || 0}
                  </span>
                  {totalReplicas ? ` / ${totalReplicas}` : ''}
                </p>
              </div>
              {currentReplicas !== undefined && (
                <div>
                  <h4 className="text-xs font-medium text-gray-500 dark:text-gray-300">Current</h4>
                  <p className="text-sm mt-1 text-gray-600 dark:text-gray-400">
                    {currentReplicas}
                  </p>
                </div>
              )}
              {replicas?.observedGeneration && (
                <div>
                  <h4 className="text-xs font-medium text-gray-500 dark:text-gray-300">Generation</h4>
                  <p className="text-sm mt-1 text-gray-600 dark:text-gray-400">
                    {replicas.observedGeneration}
                  </p>
                </div>
              )}
            </div>

            {/* Revision information */}
            {(currentRevision || updateRevision) && (
              <div className="mt-3 mb-3">
                <h4 className="text-xs font-medium text-gray-500 dark:text-gray-300 mb-1">Revisions</h4>
                <div className="space-y-1">
                  {currentRevision && (
                    <div className="text-xs">
                      <span className="text-gray-500 dark:text-gray-400">Current:</span>
                      <span className="text-gray-800 dark:text-gray-200 ml-1 font-mono text-xs">{currentRevision}</span>
                    </div>
                  )}
                  {updateRevision && (
                    <div className="text-xs">
                      <span className="text-gray-500 dark:text-gray-400">Update:</span>
                      <span className="text-gray-800 dark:text-gray-200 ml-1 font-mono text-xs">{updateRevision}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Render conditions */}
            {renderConditions(status?.conditions)}
          </div>
        );
      }

      default: {
        // Default case for other resource types
        return (
          <div className="pt-4">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-300 mb-2">Details</h3>

            {status?.age && (
              <div className="mb-2">
                <h4 className="text-xs font-medium text-gray-500 dark:text-gray-300">Age</h4>
                <p className="text-sm mt-1 text-gray-900 dark:text-gray-200">{status.age}</p>
              </div>
            )}

            {renderConditions(status?.conditions)}
          </div>
        );
      }
    }
  };

  const iconKey = resource.resourceType.toLowerCase() as KubeResourceType;
  const icon = KubeResourceIconMap[iconKey] || KubeResourceIconMap.default;

  const renderLabels = () => {
    if (!resource.labels || Object.keys(resource.labels).length === 0) return null;

    const labelEntries = Object.entries(resource.labels);
    const labelCount = labelEntries.length;

    return (
      <div>
        {/* Collapsible Header */}
        <button
          onClick={() => setShowAllLabels(!showAllLabels)}
          className="w-full flex items-center justify-between py-2 rounded-[0.3rem]"
        >
          <h3 className="text-xs font-medium text-gray-500 dark:text-gray-300 flex items-center">
            <Tag size={14} className="mr-1" />
            Labels ({labelCount})
          </h3>
          <div className="flex items-center text-xs text-blue-600 dark:text-blue-400">
            {showAllLabels ? (
              <ChevronUp size={14} className="ml-1" />
            ) : (
              <ChevronDown size={14} className="ml-1" />
            )}
          </div>
        </button>

        {/* Collapsible Content */}
        {showAllLabels && (
          <div className="mt-2">
            <div className="flex flex-wrap gap-1">
              {labelEntries.map(([key, value]) => (
                <div
                  key={key}
                  className="text-xs px-1 py-0.5 bg-blue-100 dark:bg-blue-500/10 text-blue-800 dark:text-blue-300 border border-blue-800 dark:border-blue-500/30 rounded-[0.3rem]"
                >
                  {key}: {value}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <AnimatePresence>
      {resource && (
        <Panel position={panelPosition}>
          <motion.div
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 300, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="w-80 bg-gray-100 dark:bg-[#0B0D13]/50 backdrop-blur-xl rounded-xl shadow-xl text-gray-600 overflow-y-auto max-h-[calc(100vh-4rem)]"
          >
            <div className="p-4">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 font-[Anton] uppercase flex items-center gap-2">
                  <div className="flex-shrink-0">
                    <img src={icon} alt={resource.resourceType} className="w-6 h-6" />
                  </div>
                  {resource.resourceType}
                  <button
                    onClick={handleCopy}
                    className="text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-gray-100 focus:outline-none ml-2"
                    title="Copy resource name"
                  >
                    {copied ? <Check size={16} className="text-green-500" /> : <Copy size={14} />}
                  </button>
                </h2>
                <div className="flex items-center gap-2 relative">
                  <div className="relative">
                    <button
                      onClick={() => setShowPositionDropdown(!showPositionDropdown)}
                      className="text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-gray-100 flex items-center gap-1"
                      title="Change panel position"
                    >
                      <Move className='h-3 w-3 rotate-45' />
                    </button>
                    
                    {showPositionDropdown && (
                      <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800/20 backdrop-blur-md rounded-lg shadow-lg z-50 min-w-[140px]">
                        {positionOptions.map((option) => (
                          <button
                            key={option.value}
                            onClick={() => handlePositionChange(option.value)}
                            className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 ${
                              panelPosition === option.value
                                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                : 'text-gray-700 dark:text-gray-300'
                            } first:rounded-t-lg last:rounded-b-lg`}
                          >
                            <option.icon size={14} />
                            {option.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={onClose} className="text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-gray-100">
                    <X className='h-4 w-4' />
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-x-2">
                  <div>
                    <h3 className="text-xs font-medium text-gray-500 dark:text-gray-300">Name</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-xs text-gray-900 dark:text-gray-300 break-words">{resource.resourceName}</p>
                    </div>
                  </div>

                  <div>
                    {resource.namespace && (
                      <>
                        <h3 className="text-xs font-medium text-gray-500 dark:text-gray-300">Namespace</h3>
                        <p className="mt-1 text-xs cursor-pointer text-blue-600 dark:text-blue-400 hover:underline dark:border-gray-500/30 w-fit">
                          {resource.namespace}
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {/* Resource-specific details based on type */}
                {renderResourceSpecificDetails()}

                {/* Labels */}
                {renderLabels()}
              </div>
            </div>
          </motion.div>
        </Panel>
      )}
    </AnimatePresence>
  );
};