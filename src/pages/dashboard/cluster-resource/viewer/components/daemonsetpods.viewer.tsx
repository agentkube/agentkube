import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { V1Pod, V1DaemonSet } from '@kubernetes/client-node';
import { listResources } from '@/api/internal/resources';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, MoreVertical, Search, CircleCheck, CircleX, CircleAlert, CircleDashed, Sparkles, TextSearch, SearchCode, Eye, Trash } from "lucide-react";
import { calculateAge } from '@/utils/age';
import { createPortal } from 'react-dom';
import { OPERATOR_URL } from '@/config';
import { toast } from '@/hooks/use-toast';
import { useDrawer } from '@/contexts/useDrawer';
import BackgroundTaskDialog from '@/components/custom/backgroundtaskdialog/backgroundtaskdialog.component';
import { useBackgroundTask } from '@/contexts/useBackgroundTask';
import { SideDrawer } from '@/components/ui/sidedrawer.custom';
import Telemetry from '@/components/custom/telemetry/telemetry.component';
import { resourceToEnrichedSearchResult } from '@/utils/resource-to-enriched.utils';
import { useReconMode } from '@/contexts/useRecon';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogHeader, AlertDialogCancel, AlertDialogFooter, AlertDialogDescription, AlertDialogTitle, AlertDialogContent, AlertDialogAction } from '@/components/ui/alert-dialog';
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

interface DaemonSetPodsProps {
  daemonSetName: string;
  namespace: string;
  clusterName: string;
  daemonSet?: V1DaemonSet;
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

const DaemonSetPods: React.FC<DaemonSetPodsProps> = ({
  daemonSetName,
  namespace,
  clusterName,
  daemonSet
}) => {
  const navigate = useNavigate();
  const { isReconMode } = useReconMode();
  const { addResourceContext } = useDrawer();
  const { isOpen: isBackgroundTaskOpen, resourceName, resourceType, onClose: closeBackgroundTask, openWithResource } = useBackgroundTask();

  const [pods, setPods] = useState<V1Pod[]>([]);
  const [podsMetrics, setPodsMetrics] = useState<Record<string, PodResourceMetrics>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [tooltipVisible, setTooltipVisible] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [tooltipDelay, setTooltipDelay] = useState<NodeJS.Timeout | null>(null);
  const [podCount, setPodCount] = useState({
    total: 0,
    ready: 0,
    pending: 0,
    failed: 0
  });

  // Dialog and drawer states
  const [activePod, setActivePod] = useState<V1Pod | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [isTelemetryDrawerOpen, setIsTelemetryDrawerOpen] = useState(false);
  const [telemetryPod, setTelemetryPod] = useState<V1Pod | null>(null);

  // Build label selector from daemonSet
  const getLabelSelector = () => {
    if (!daemonSet || !daemonSet.spec?.selector?.matchLabels) {
      return '';
    }

    const labels = daemonSet.spec.selector.matchLabels;
    return Object.entries(labels)
      .map(([key, value]) => `${key}=${value}`)
      .join(',');
  };

  const fetchDaemonSetPods = async () => {
    if (!daemonSetName || !namespace || !clusterName) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Get the daemonSet's label selector
      const labelSelector = getLabelSelector();

      if (!labelSelector) {
        throw new Error('Unable to determine label selector for this DaemonSet');
      }

      // Fetch pods matching the daemonSet's selector
      const podsData = await listResources<'pods'>(
        clusterName,
        'pods',
        {
          namespace,
          labelSelector
        }
      );

      setPods(podsData);

      // Update pod status counts
      let readyCount = 0;
      let pendingCount = 0;
      let failedCount = 0;

      podsData.forEach(pod => {
        const phase = pod.status?.phase?.toLowerCase();
        if (phase === 'running') {
          // Count as ready only if all containers are ready
          const containerStatuses = pod.status?.containerStatuses || [];
          const total = containerStatuses.length;
          const ready = containerStatuses.filter(status => status.ready).length;
          if (ready === total && total > 0) {
            readyCount++;
          }
        } else if (phase === 'pending') {
          pendingCount++;
        } else if (phase === 'failed') {
          failedCount++;
        }
      });

      setPodCount({
        total: podsData.length,
        ready: readyCount,
        pending: pendingCount,
        failed: failedCount
      });

      setError(null);
    } catch (err) {
      console.error('Failed to fetch pods for DaemonSet:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch pods for this DaemonSet');
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

  // Fetch pods when daemonSet changes
  useEffect(() => {
    if (daemonSet) {
      fetchDaemonSetPods();
    }
  }, [daemonSet, daemonSetName, namespace, clusterName]);

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
      const annotations = pod.metadata?.annotations || {};
      const nodeName = pod.spec?.nodeName?.toLowerCase() || '';

      // Check if name, status, IP or node contains the query
      if (
        name.includes(lowercaseQuery) ||
        status.includes(lowercaseQuery) ||
        ip.includes(lowercaseQuery) ||
        nodeName.includes(lowercaseQuery)
      ) {
        return true;
      }

      // Check if any label or annotation contains the query
      const hasMatchingLabel = Object.entries(labels).some(
        ([key, value]) =>
          key.toLowerCase().includes(lowercaseQuery) ||
          (typeof value === 'string' && value.toLowerCase().includes(lowercaseQuery))
      );

      const hasMatchingAnnotation = Object.entries(annotations).some(
        ([key, value]) =>
          key.toLowerCase().includes(lowercaseQuery) ||
          (typeof value === 'string' && value.toLowerCase().includes(lowercaseQuery))
      );

      return hasMatchingLabel || hasMatchingAnnotation;
    });
  }, [pods, searchQuery]);

  // Get container status counts
  const getContainerStatuses = (pod: V1Pod) => {
    const containerStatuses = pod.status?.containerStatuses || [];
    const total = containerStatuses.length;
    const ready = containerStatuses.filter(status => status.ready).length;
    return `${ready}/${total}`;
  };

  // Get container status icon and hover message
  const getContainerStatusInfo = (pod: V1Pod): { icon: JSX.Element; message: string } => {
    const containerStatuses = pod.status?.containerStatuses || [];
    const total = containerStatuses.length;

    if (total === 0) {
      return {
        icon: <CircleDashed className="h-4 w-4 text-gray-400" />,
        message: 'No containers'
      };
    }

    const ready = containerStatuses.filter(status => status.ready).length;
    const waiting = containerStatuses.filter(status => status.state?.waiting).length;
    const running = containerStatuses.filter(status => status.state?.running).length;
    const terminated = containerStatuses.filter(status => status.state?.terminated).length;

    // All containers ready
    if (ready === total) {
      return {
        icon: <CircleCheck className="h-4 w-4 text-green-500" />,
        message: 'All containers ready'
      };
    }

    // Some containers waiting
    if (waiting > 0) {
      return {
        icon: <CircleAlert className="h-4 w-4 text-yellow-500" />,
        message: `${waiting} container(s) waiting, ${ready}/${total} ready`
      };
    }

    // Some containers terminated
    if (terminated > 0) {
      return {
        icon: <CircleX className="h-4 w-4 text-red-500" />,
        message: `${terminated} container(s) terminated, ${ready}/${total} ready`
      };
    }

    // Some containers running but not ready
    if (running > 0 && ready < total) {
      return {
        icon: <CircleAlert className="h-4 w-4 text-orange-500" />,
        message: `${running} container(s) running, ${ready}/${total} ready`
      };
    }

    return {
      icon: <CircleDashed className="h-4 w-4 text-gray-400" />,
      message: `${ready}/${total} containers ready`
    };
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

  // Action handlers
  const handleAskAI = (pod: V1Pod) => {
    try {
      // Convert pod to EnrichedSearchResult format
      const resourceContext = resourceToEnrichedSearchResult(
        pod,
        'pods',
        true, // namespaced
        '',
        'v1'
      );

      // Add to chat context and open drawer
      addResourceContext(resourceContext);

      // Show success toast
      toast({
        title: "Added to Chat",
        description: `Pod "${pod.metadata?.name}" has been added to chat context`
      });
    } catch (error) {
      console.error('Error adding pod to chat:', error);
      toast({
        title: "Error",
        description: "Failed to add pod to chat context",
        variant: "destructive"
      });
    }
  };

  const handleInvestigatePod = (pod: V1Pod) => {
    openWithResource(pod.metadata?.name || '', 'Pod');
  };

  const handleTelemetryPod = (pod: V1Pod) => {
    setTelemetryPod(pod);
    setIsTelemetryDrawerOpen(true);
  };

  const handleViewPod = (e: React.MouseEvent, pod: V1Pod) => {
    e.stopPropagation();
    if (pod.metadata?.name && pod.metadata?.namespace) {
      navigate(`/dashboard/explore/pods/${pod.metadata.namespace}/${pod.metadata.name}`);
    }
  };

  const handleDeletePod = (e: React.MouseEvent, pod: V1Pod) => {
    e.stopPropagation();

    if (isReconMode) {
      toast({
        title: "Recon Mode",
        description: "This action can't be performed while recon mode is on. Disable recon mode to proceed.",
        variant: "recon"
      });
      return;
    }

    setActivePod(pod);
    setShowDeleteDialog(true);
  };

  const handleRestartPod = async (pod: V1Pod) => {
    if (isReconMode) {
      toast({
        title: "Recon Mode",
        description: "This action can't be performed while recon mode is on. Disable recon mode to proceed.",
        variant: "recon"
      });
      return;
    }

    if (!pod.metadata?.name || !pod.metadata?.namespace) return;

    try {
      const annotations = pod.metadata.annotations || {};
      const restartedAt = new Date().toISOString();

      // Update pod with restart annotation
      await fetch(`${OPERATOR_URL}/clusters/${clusterName}/api/v1/namespaces/${pod.metadata.namespace}/pods/${pod.metadata.name}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/strategic-merge-patch+json',
        },
        body: JSON.stringify({
          metadata: {
            annotations: {
              ...annotations,
              'kubectl.kubernetes.io/restartedAt': restartedAt,
            },
          },
        }),
      });

      toast({
        title: "Pod Restarted",
        description: `Pod "${pod.metadata.name}" has been restarted`
      });

      // Refresh pods
      setTimeout(() => {
        fetchDaemonSetPods();
      }, 1000);
    } catch (error) {
      console.error('Failed to restart pod:', error);
      toast({
        title: "Error",
        description: "Failed to restart pod",
        variant: "destructive"
      });
    }
  };

  // Delete pod function
  const deletePod = async (pod: V1Pod) => {
    if (!pod.metadata?.name || !pod.metadata?.namespace) return;

    await fetch(`${OPERATOR_URL}/clusters/${clusterName}/api/v1/namespaces/${pod.metadata.namespace}/pods/${pod.metadata.name}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });
  };

  // Perform actual deletion
  const deletePods = async () => {
    setShowDeleteDialog(false);
    setDeleteLoading(true);

    try {
      if (activePod) {
        await deletePod(activePod);

        toast({
          title: "Pod Deleted",
          description: `Pod "${activePod.metadata?.name}" has been deleted`
        });

        // Refresh pods
        setTimeout(() => {
          fetchDaemonSetPods();
        }, 1000);
      }
    } catch (error) {
      console.error('Failed to delete pod:', error);
      toast({
        title: "Error",
        description: "Failed to delete pod",
        variant: "destructive"
      });
    } finally {
      setDeleteLoading(false);
      setActivePod(null);
    }
  };

  // Function to check if pod is in a failing state (should show sparkle icon)
  const isPodFailing = (pod: V1Pod): boolean => {
    const phase = pod.status?.phase?.toLowerCase();
    return phase === 'failed' || phase === 'error' || phase === 'crashloopbackoff' ||
      (pod.status?.containerStatuses || []).some(status =>
        status.state?.waiting?.reason === 'CrashLoopBackOff' ||
        status.state?.waiting?.reason === 'ImagePullBackOff' ||
        status.state?.waiting?.reason === 'ErrImagePull'
      );
  };

  // Delete confirmation dialog
  const renderDeleteDialog = () => {
    return (
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-gray-100 dark:bg-card/90 backdrop-blur-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Pod Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{activePod?.metadata?.name}"?
              This action cannot be undone. The pod will enter terminating state and be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deletePods}
              disabled={deleteLoading}
              className="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
            >
              {deleteLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
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
        className="fixed z-50 bg-white dark:bg-card/40 backdrop-blur-sm min-w-[150px] p-3 rounded-md shadow-lg border border-gray-300 dark:border-gray-800 text-xs"
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

  // Loading state
  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-transparent p-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium">DaemonSet Pods</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchDaemonSetPods}
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

  // Error state
  if (error) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-transparent p-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium">DaemonSet Pods</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchDaemonSetPods}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
        </div>
        <div className="bg-red-100 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 p-3 rounded-md mb-4">
          {error}
        </div>
        <div className="text-center p-6 text-gray-500 dark:text-gray-400">
          Unable to fetch pods for this DaemonSet.
        </div>
      </div>
    );
  }

  // Empty state
  if (pods.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-transparent p-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium">DaemonSet Pods</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchDaemonSetPods}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
        </div>
        <div className="text-center p-6 text-gray-500 dark:text-gray-400">
          No pods found for this DaemonSet. The DaemonSet may not have created any pods yet.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-transparent p-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
        <h2 className="text-lg font-medium">DaemonSet Pods ({filteredPods.length})</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchDaemonSetPods}
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Refresh
        </Button>
      </div>

      {/* Status summary */}
      <div className="flex flex-wrap gap-2 mb-4">
        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
          Total: {podCount.total}
        </Badge>
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
          Ready: {podCount.ready}
        </Badge>
        {podCount.pending > 0 && (
          <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
            Pending: {podCount.pending}
          </Badge>
        )}
        {podCount.failed > 0 && (
          <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
            Failed: {podCount.failed}
          </Badge>
        )}
        {daemonSet?.status?.desiredNumberScheduled && (
          <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
            Desired: {daemonSet.status.desiredNumberScheduled}
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

      {/* Background Task Dialog */}
      <BackgroundTaskDialog
        isOpen={isBackgroundTaskOpen}
        onClose={closeBackgroundTask}
        resourceName={resourceName}
        resourceType={resourceType}
      />

      {/* Telemetry Drawer */}
      <SideDrawer isOpen={isTelemetryDrawerOpen} onClose={() => setIsTelemetryDrawerOpen(false)} offsetTop='-top-6'>
        {telemetryPod && (
          <Telemetry
            resourceName={telemetryPod.metadata?.name || ''}
            namespace={telemetryPod.metadata?.namespace || ''}
            kind="Pod"
            onClose={() => setIsTelemetryDrawerOpen(false)}
          />
        )}
      </SideDrawer>

      {/* Delete Dialog */}
      {renderDeleteDialog()}

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
              const containerStatus = getContainerStatusInfo(pod);

              return (
                <TableRow
                  key={podKey}
                  className="bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30"
                  onClick={() => handlePodDetails(pod)}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <div className="hover:text-blue-500 hover:underline">
                        {pod.metadata?.name}
                      </div>
                      {isPodFailing(pod) && (
                        <Sparkles
                          className="h-4 w-4 text-yellow-500 hover:text-yellow-600 cursor-pointer transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAskAI(pod);
                          }}
                        />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge className={`${getStatusColorClass(pod.status?.phase)}`}>
                      {pod.status?.phase || 'Unknown'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <div title={containerStatus.message} className="flex items-center justify-center gap-1">
                      {containerStatus.icon}
                      <span>{getContainerStatuses(pod)}</span>
                    </div>
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
                    <div className="hover:text-blue-500 hover:underline cursor-pointer" onClick={(e) => {
                      e.stopPropagation();
                      if (pod.spec?.nodeName) {
                        navigate(`/dashboard/explore/nodes/${pod.spec.nodeName}`);
                      }
                    }}>
                      {pod.spec?.nodeName || '-'}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    {calculateAge(pod.metadata?.creationTimestamp?.toString())}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className='dark:bg-card/40 backdrop-blur-md border-gray-800/50'>
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          handleAskAI(pod);
                        }} className='hover:text-gray-700 dark:hover:text-gray-500'>
                          <Sparkles className="mr-2 h-4 w-4" />
                          Ask AI
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          handleInvestigatePod(pod);
                        }} className='hover:text-gray-700 dark:hover:text-gray-500'>
                          <TextSearch className="mr-2 h-4 w-4" />
                          Investigate
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          handleTelemetryPod(pod);
                        }} className='hover:text-gray-700 dark:hover:text-gray-500'>
                          <SearchCode className="mr-2 h-4 w-4" />
                          Telemetry
                        </DropdownMenuItem>

                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          handleRestartPod(pod);
                        }} className='hover:text-gray-700 dark:hover:text-gray-500'>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Restart
                        </DropdownMenuItem>

                        <DropdownMenuItem onClick={(e) => handleViewPod(e, pod)} className='hover:text-gray-700 dark:hover:text-gray-500'>
                          <Eye className="mr-2 h-4 w-4" />
                          View
                        </DropdownMenuItem>

                        <DropdownMenuItem
                          className="text-red-500 dark:text-red-400 focus:text-red-500 dark:focus:text-red-400 hover:text-red-700 dark:hover:text-red-500"
                          onClick={(e) => handleDeletePod(e, pod)}
                        >
                          <Trash className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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

export default DaemonSetPods;