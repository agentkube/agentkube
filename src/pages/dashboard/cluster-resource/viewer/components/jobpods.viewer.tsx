import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { V1Pod, V1Job } from '@kubernetes/client-node';
import { listResources } from '@/api/internal/resources';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, MoreVertical, Search } from "lucide-react";
import { calculateAge } from '@/utils/age';
import { createPortal } from 'react-dom';
import { OPERATOR_URL } from '@/config';

// Resource usage interfaces
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

interface JobPodsProps {
  jobName: string;
  namespace: string;
  clusterName: string;
  job?: V1Job;
}

// Parse resource quantities
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

// Format resource value
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

const JobPods: React.FC<JobPodsProps> = ({ jobName, namespace, clusterName, job }) => {
  const navigate = useNavigate();
  const [pods, setPods] = useState<V1Pod[]>([]);
  const [podsMetrics, setPodsMetrics] = useState<Record<string, PodResourceMetrics>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [tooltipVisible, setTooltipVisible] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [tooltipDelay, setTooltipDelay] = useState<NodeJS.Timeout | null>(null);

  const fetchJobPods = async () => {
    if (!jobName || !namespace || !clusterName) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      // Create a label selector based on the job controller
      // Jobs use job-name label to identify their pods
      const labelSelector = `job-name=${jobName}`;
      
      // Fetch pods for this job
      const podsData = await listResources<'pods'>(
        clusterName,
        'pods',
        { 
          namespace,
          labelSelector 
        }
      );
      
      setPods(podsData);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch pods for job:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch pods for this job');
    } finally {
      setLoading(false);
    }
  };

  // Fetch pods metrics
  const fetchPodsMetrics = async () => {
    if (!clusterName || !namespace || pods.length === 0) {
      return;
    }

    try {
      const metricsApiUrl = `${OPERATOR_URL}/clusters/${clusterName}/apis/metrics.k8s.io/v1beta1/namespaces/${namespace}/pods`;

      const response = await fetch(metricsApiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch metrics: ${response.statusText}`);
      }

      const data = await response.json();
      const metricsData = data.items || [];

      // Process metrics data
      const metricsMap: Record<string, PodResourceMetrics> = {};

      for (const podMetric of metricsData) {
        const podKey = `${podMetric.metadata.namespace}/${podMetric.metadata.name}`;
        const pod = pods.find(p =>
          p.metadata?.name === podMetric.metadata.name &&
          p.metadata?.namespace === podMetric.metadata.namespace
        );

        if (pod) {
          // Aggregate container metrics
          let totalCpu = 0;
          let totalMemory = 0;

          podMetric.containers.forEach((container: ContainerMetrics) => {
            const cpuValue = parseQuantity(container.usage.cpu);
            const memoryValue = parseQuantity(container.usage.memory);
            totalCpu += cpuValue;
            totalMemory += memoryValue;
          });

          // Get pod requests and limits
          let cpuRequest = 0;
          let cpuLimit = 0;
          let memoryRequest = 0;
          let memoryLimit = 0;

          (pod.spec?.containers || []).forEach(container => {
            const resources = container.resources || {};

            if (resources.requests) {
              cpuRequest += parseQuantity(resources.requests.cpu || '0');
              memoryRequest += parseQuantity(resources.requests.memory || '0');
            }

            if (resources.limits) {
              cpuLimit += parseQuantity(resources.limits.cpu || '0');
              memoryLimit += parseQuantity(resources.limits.memory || '0');
            }
          });

          metricsMap[podKey] = {
            cpu: {
              value: formatResourceValue(totalCpu, 'cpu'),
              percentage: cpuRequest > 0 ? (totalCpu / cpuRequest) * 100 : undefined,
              requested: cpuRequest > 0 ? formatResourceValue(cpuRequest, 'cpu') : undefined,
              limits: cpuLimit > 0 ? formatResourceValue(cpuLimit, 'cpu') : undefined
            },
            memory: {
              value: formatResourceValue(totalMemory, 'memory'),
              percentage: memoryRequest > 0 ? (totalMemory / memoryRequest) * 100 : undefined,
              requested: memoryRequest > 0 ? formatResourceValue(memoryRequest, 'memory') : undefined,
              limits: memoryLimit > 0 ? formatResourceValue(memoryLimit, 'memory') : undefined
            }
          };
        }
      }

      setPodsMetrics(metricsMap);
    } catch (err) {
      console.error('Failed to fetch pod metrics:', err);
      // Don't set error state here to avoid blocking the entire component
    }
  };

  // Fetch pods on component mount
  useEffect(() => {
    fetchJobPods();
  }, [jobName, namespace, clusterName]);

  // Fetch metrics when pods change
  useEffect(() => {
    if (pods.length > 0) {
      fetchPodsMetrics();
    }
  }, [pods]);

  // Set up metrics refresh interval
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (pods.length > 0) {
        fetchPodsMetrics();
      }
    }, 10000); // Refresh every 10 seconds

    return () => clearInterval(intervalId);
  }, [pods]);

  // Filter pods based on search query
  const filteredPods = useMemo(() => {
    if (!searchQuery.trim()) {
      return pods;
    }

    const lowercaseQuery = searchQuery.toLowerCase();

    return pods.filter(pod => {
      const name = pod.metadata?.name?.toLowerCase() || '';
      const status = pod.status?.phase?.toLowerCase() || '';
      const ip = pod.status?.podIP?.toLowerCase() || '';
      const labels = pod.metadata?.labels || {};

      // Check if name, status, or IP contains the query
      if (
        name.includes(lowercaseQuery) ||
        status.includes(lowercaseQuery) ||
        ip.includes(lowercaseQuery)
      ) {
        return true;
      }

      // Check if any label contains the query
      return Object.entries(labels).some(
        ([key, value]) =>
          key.toLowerCase().includes(lowercaseQuery) ||
          (typeof value === 'string' && value.toLowerCase().includes(lowercaseQuery))
      );
    });
  }, [pods, searchQuery]);

  // Get container status counts
  const getContainerStatuses = (pod: V1Pod) => {
    const containerStatuses = pod.status?.containerStatuses || [];
    const total = containerStatuses.length;
    const ready = containerStatuses.filter(status => status.ready).length;
    return `${ready}/${total}`;
  };

  // Get a color class based on the pod phase
  const getStatusColorClass = (phase: string | undefined): string => {
    if (!phase) return 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300';

    switch (phase.toLowerCase()) {
      case 'running':
        return 'bg-green-200 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'pending':
        return 'bg-yellow-200 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'succeeded':
        return 'bg-blue-200 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'failed':
        return 'bg-red-200 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      case 'unknown':
        return 'bg-purple-200 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
      default:
        return 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  // Get total restart count for a pod
  const getTotalRestarts = (pod: V1Pod): number => {
    return (pod.status?.containerStatuses || []).reduce(
      (total, status) => total + (status.restartCount || 0),
      0
    );
  };

  // Navigate to pod details
  const handlePodDetails = (pod: V1Pod) => {
    if (pod.metadata?.name && pod.metadata?.namespace) {
      navigate(`/dashboard/explore/pods/${pod.metadata.namespace}/${pod.metadata.name}`);
    }
  };

  // Get pod status completion info
  const getPodCompletionInfo = (pod: V1Pod): { isCompleted: boolean; isSuccessful: boolean } => {
    const phase = pod.status?.phase?.toLowerCase();
    
    if (phase === 'succeeded') {
      return { isCompleted: true, isSuccessful: true };
    } else if (phase === 'failed') {
      return { isCompleted: true, isSuccessful: false };
    }
    
    return { isCompleted: false, isSuccessful: false };
  };

  // Resource usage tooltip handlers
  const handleResourceMouseEnter = (
    e: React.MouseEvent<HTMLTableCellElement>,
    podKey: string,
    resourceType: 'cpu' | 'memory'
  ) => {
    if (podsMetrics[podKey]) {
      // Clear any existing timeout
      if (tooltipDelay) {
        clearTimeout(tooltipDelay);
      }

      const rect = e.currentTarget.getBoundingClientRect();

      // Set a small delay before showing the tooltip
      const delay = setTimeout(() => {
        setTooltipVisible(`${podKey}-${resourceType}`);
        setTooltipPosition({
          x: rect.left,
          y: rect.top
        });
      }, 100); // 100ms delay

      setTooltipDelay(delay);
    }
  };

  const handleResourceMouseLeave = () => {
    // Clear any pending tooltip display
    if (tooltipDelay) {
      clearTimeout(tooltipDelay);
      setTooltipDelay(null);
    }

    // Small delay before hiding to allow mouse to enter tooltip
    setTimeout(() => {
      setTooltipVisible(null);
    }, 100);
  };

  // Render resource usage bar
  const renderResourceUsageBar = (
    usage: ResourceUsage,
    resourceType: 'cpu' | 'memory'
  ) => {
    // If no percentage is available but we have a value, show a default usage bar
    const hasValue = usage.value && usage.value !== '0' && usage.value !== '0Ki' && usage.value !== '0Mi';

    if (!usage.percentage && !hasValue) return null;

    // Determine color based on usage percentage or default to blue for values without requests
    let colorClass = 'bg-[#6875F5]';
    let percentWidth = 20; // Default value when no request is set but usage exists

    if (usage.percentage) {
      percentWidth = Math.min(usage.percentage, 100);

      if (usage.percentage > 90) {
        colorClass = 'bg-[#F05252]';
      } else if (usage.percentage > 70) {
        colorClass = 'bg-[#FACA16]';
      }
    }

    return (
      <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-800/40 rounded-full mt-1">
        <div
          className={`h-full rounded-full ${colorClass}`}
          style={{ width: `${percentWidth}%` }}
        ></div>
      </div>
    );
  };

  // Render resource usage tooltip
  const renderResourceTooltip = (
    podKey: string | null,
    resourceType: 'cpu' | 'memory' | null
  ) => {
    if (!podKey || !resourceType || !tooltipVisible) return null;

    const metrics = podsMetrics[podKey];
    if (!metrics) return null;

    const usage = resourceType === 'cpu' ? metrics.cpu : metrics.memory;

    // Use createPortal to render the tooltip at document level, preventing event issues
    return createPortal(
      <div
        className="fixed z-50 bg-white dark:bg-[#0B0D13]/40 backdrop-blur-sm min-w-[150px] p-3 rounded-md shadow-lg border border-gray-300 dark:border-gray-800 text-xs"
        style={{
          left: `${tooltipPosition.x + 10}px`,
          top: `${tooltipPosition.y - 80}px`,
          pointerEvents: 'none', // Make tooltip non-interactive to prevent event issues
        }}
      >
        <div className="font-medium mb-1">{resourceType === 'cpu' ? 'CPU' : 'Memory'} Usage</div>
        <div className="text-gray-700 dark:text-gray-300">
          <div className="flex justify-between mb-1">
            <span>Current: </span>
            <span className="font-semibold">{usage.value}</span>
          </div>
          {usage.requested && (
            <div className="flex justify-between mb-1">
              <span>Requested: </span>
              <span className="font-semibold">{usage.requested}</span>
            </div>
          )}
          {usage.limits && (
            <div className="flex justify-between mb-1">
              <span>Limits:</span>{" "}
              <span className="font-semibold">{usage.limits}</span>
            </div>
          )}
          {usage.percentage && (
            <div className="flex justify-between mb-1">
              <span>Usage:</span>
              <span className={`${usage.percentage > 90 ? 'text-red-500' : usage.percentage > 70 ? 'text-yellow-500' : ''}`}>
                {usage.percentage.toFixed(1)}%
              </span>
            </div>
          )}
        </div>
      </div>,
      document.body
    );
  };

  // Calculate pod success/failure stats
  const getJobPodStats = () => {
    let succeeded = 0;
    let failed = 0;
    let running = 0;
    let pending = 0;

    pods.forEach(pod => {
      const phase = pod.status?.phase?.toLowerCase();
      if (phase === 'succeeded') {
        succeeded++;
      } else if (phase === 'failed') {
        failed++;
      } else if (phase === 'running') {
        running++;
      } else if (phase === 'pending') {
        pending++;
      }
    });

    return { succeeded, failed, running, pending, total: pods.length };
  };

  // Loading state
  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-transparent p-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium">Job Pods</h2>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchJobPods}
            disabled={loading}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
        </div>
        <div className="flex justify-center items-center p-10">
          <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
        </div>
      </div>
    );
  }

  // Empty state
  if (pods.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-transparent p-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium">Job Pods</h2>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchJobPods}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
        </div>
        <div className="text-center p-6 text-gray-500 dark:text-gray-400">
          No pods found for this job. The pods may have been deleted or haven't been created yet.
        </div>
      </div>
    );
  }

  // Calculate pod stats
  const { succeeded, failed, running, pending, total } = getJobPodStats();

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-transparent p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-medium">Job Pods ({filteredPods.length})</h2>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={fetchJobPods}
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="bg-red-100 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 p-3 rounded-md mb-4">
          {error}
        </div>
      )}

      {/* Pod stats summary */}
      <div className="flex flex-wrap gap-3 mb-4">
        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
          Total: {total}
        </Badge>
        {succeeded > 0 && (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
            Succeeded: {succeeded}
          </Badge>
        )}
        {failed > 0 && (
          <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
            Failed: {failed}
          </Badge>
        )}
        {running > 0 && (
          <Badge className="bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300">
            Running: {running}
          </Badge>
        )}
        {pending > 0 && (
          <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
            Pending: {pending}
          </Badge>
        )}
      </div>

      {/* Search input */}
      <div className="mb-4">
        <div className="relative w-full md:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
          <Input
            type="text"
            placeholder="Search pods..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {/* Tooltip */}
      {tooltipVisible && (() => {
        const lastDashIndex = tooltipVisible.lastIndexOf('-');
        if (lastDashIndex === -1) return null;

        const resourceType = tooltipVisible.substring(lastDashIndex + 1) as 'cpu' | 'memory';
        const podKey = tooltipVisible.substring(0, lastDashIndex);

        return renderResourceTooltip(podKey, resourceType);
      })()}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-gray-400 dark:border-gray-800/80">
              <TableHead>Name</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-center">Ready</TableHead>
              <TableHead className="text-center">Restarts</TableHead>
              <TableHead>CPU</TableHead>
              <TableHead>Memory</TableHead>
              <TableHead className="text-center">Node</TableHead>
              <TableHead className="text-center">Age</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPods.map((pod) => {
              const podKey = `${pod.metadata?.namespace}/${pod.metadata?.name}`;
              const podMetrics = podsMetrics[podKey];
              const { isCompleted, isSuccessful } = getPodCompletionInfo(pod);

              return (
                <TableRow 
                  key={podKey}
                  className={`
                    bg-gray-50 dark:bg-transparent 
                    border-b border-gray-400 dark:border-gray-900/80 
                    hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30
                    ${isCompleted && isSuccessful ? 'bg-green-50/50 dark:bg-green-900/10' : ''}
                    ${isCompleted && !isSuccessful ? 'bg-red-50/50 dark:bg-red-900/10' : ''}
                  `}
                  onClick={() => handlePodDetails(pod)}
                >
                  <TableCell className="font-medium">
                    <Button variant="link" className="text-blue-500 hover:text-blue-500 hover:underline">
                      {pod.metadata?.name}
                    </Button>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge className={`${getStatusColorClass(pod.status?.phase)}`}>
                      {pod.status?.phase || 'Unknown'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    {getContainerStatuses(pod)}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={getTotalRestarts(pod) > 0 ? 'text-red-600 dark:text-red-400 font-medium' : ''}>
                      {getTotalRestarts(pod)}
                    </span>
                  </TableCell>
                  <TableCell
                    onMouseEnter={(e) => handleResourceMouseEnter(e, podKey, 'cpu')}
                    onMouseLeave={handleResourceMouseLeave}
                  >
                    <div className="relative">
                      {podMetrics?.cpu ? (
                        <div>
                          <div className="flex items-center">
                            <span className="text-xs">{podMetrics.cpu.value}</span>
                            {podMetrics.cpu.percentage && (
                              <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                                ({podMetrics.cpu.percentage.toFixed(0)}%)
                              </span>
                            )}
                          </div>
                          {renderResourceUsageBar(podMetrics.cpu, 'cpu')}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-500 dark:text-gray-400">-</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell
                    onMouseEnter={(e) => handleResourceMouseEnter(e, podKey, 'memory')}
                    onMouseLeave={handleResourceMouseLeave}
                  >
                    <div className="relative">
                      {podMetrics?.memory ? (
                        <div>
                          <div className="flex items-center">
                            <span className="text-xs">{podMetrics.memory.value}</span>
                            {podMetrics.memory.percentage && (
                              <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                                ({podMetrics.memory.percentage.toFixed(0)}%)
                              </span>
                            )}
                          </div>
                          {renderResourceUsageBar(podMetrics.memory, 'memory')}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-500 dark:text-gray-400">-</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="hover:text-blue-500 hover:underline" onClick={(e) => {
                      e.stopPropagation();
                      if (pod.spec?.nodeName) {
                        navigate(`/dashboard/explore/nodes/${pod.spec.nodeName}`);
                      }
                    }}>
                      {pod.spec?.nodeName ? pod.spec.nodeName.split('-').pop() || pod.spec.nodeName : '-'}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    {calculateAge(pod.metadata?.creationTimestamp?.toString())}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        // Implement actions menu if needed
                      }}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default JobPods;