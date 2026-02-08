import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CoreV1Event } from '@kubernetes/client-node';
import {
  deleteResource,
  getResource,
  listResources
} from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';
import { V1HorizontalPodAutoscalerExtended } from '@/types/horizontalPodAutoscaler';

// Component imports
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ChevronRight, AlertCircle, Clock, ArrowLeft, RefreshCw, Scale, Cpu, ArrowUpDown, Target, Activity, Trash } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import KUBERNETES_LOGO from '@/assets/kubernetes.svg';
import { useSearchParams } from 'react-router-dom';
import { useReconMode } from '@/contexts/useRecon';
import { toast } from '@/hooks/use-toast';

// Custom component imports
import PropertiesViewer from '../components/properties.viewer';
import EventsViewer from '../components/event.viewer';
import { DeletionDialog, ResourceViewerYamlTab } from '@/components/custom';

// Define interface for HPA data with events
interface HPAData extends V1HorizontalPodAutoscalerExtended {
  events?: CoreV1Event[];
}

const HorizontalPodAutoscalerViewer: React.FC = () => {
  const [hpaData, setHPAData] = useState<HPAData | null>(null);
  const [events, setEvents] = useState<CoreV1Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { currentContext, fullWidth } = useCluster();
  const { hpaName, namespace } = useParams<{ hpaName: string; namespace: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const defaultTab = tabParam || 'overview';
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const { isReconMode } = useReconMode();
  // Fetch events for the HPA
  const fetchEvents = async () => {
    if (!currentContext || !namespace) return;

    try {
      // Fetch all events in the namespace
      const eventData = await listResources<'events'>(
        currentContext.name,
        'events',
        { namespace }
      );

      // Filter events for this HPA
      const filteredEvents = eventData.filter(event => {
        return (
          event.involvedObject?.kind === 'HorizontalPodAutoscaler' &&
          event.involvedObject?.name === hpaName
        );
      });

      setEvents(filteredEvents);
    } catch (err) {
      console.error('Error fetching events:', err);
    }
  };

  // Fetch HPA data and events
  useEffect(() => {
    const fetchHPAData = async () => {
      if (!currentContext || !hpaName || !namespace) {
        setLoading(false);
        setError("Missing required parameters");
        return;
      }

      try {
        setLoading(true);

        // Get HPA details
        const data = await getResource<'horizontalpodautoscalers'>(
          currentContext.name,
          'horizontalpodautoscalers',
          hpaName,
          namespace,
          'autoscaling' // API group for HPAs
        );

        // Cast to our extended type
        setHPAData(data as unknown as HPAData);
        setError(null);

        // Fetch related events
        await fetchEvents();
      } catch (err) {
        console.error('Error fetching HPA:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch HPA data');
      } finally {
        setLoading(false);
      }
    };

    fetchHPAData();
  }, [currentContext, namespace, hpaName]);

  const handleDelete = () => {
    if (isReconMode) {
      toast({
        title: "Recon Mode",
        description: "This action can't be performed while recon mode is on. Disable recon mode to proceed.",
        variant: "recon"
      });
      return;
    }
    
    setShowDeleteDialog(true);
  };

  const confirmResourceDeletion = async () => {
    if (!hpaData || !currentContext) {
      setShowDeleteDialog(false);
      return;
    }

    try {
      setDeleteLoading(true);

      await deleteResource(
        currentContext.name,
        'horizontalpodautoscalers',
        hpaData.metadata?.name as string,
        {
          namespace: hpaData.metadata?.namespace,
          apiGroup: 'autoscaling' // HPA is in the autoscaling API group
        }
      );

      // Navigate back to the HPA list
      navigate('/dashboard/explore/horizontalpodautoscalers');
    } catch (err) {
      console.error('Failed to delete HPA:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete HPA');
    } finally {
      setDeleteLoading(false);
      setShowDeleteDialog(false);
    }
  };

  // Handle refresh data
  const handleRefresh = () => {
    setLoading(true);
    // Refetch data
    if (currentContext && hpaName && namespace) {
      Promise.all([
        getResource<'horizontalpodautoscalers'>(
          currentContext.name,
          'horizontalpodautoscalers',
          hpaName,
          namespace,
          'autoscaling'
        ),
        fetchEvents()
      ]).then(([data]) => {
        setHPAData(data as unknown as HPAData);
        setLoading(false);
      }).catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to refresh data');
        setLoading(false);
      });
    }
  };

  // Calculate HPA age
  const getHPAAge = () => {
    if (!hpaData?.metadata?.creationTimestamp) {
      return 'N/A';
    }

    const creationTime = new Date(hpaData.metadata.creationTimestamp);
    const now = new Date();
    const ageMs = now.getTime() - creationTime.getTime();

    // Format age
    if (ageMs < 60000) {
      return `${Math.round(ageMs / 1000)}s`;
    } else if (ageMs < 3600000) {
      return `${Math.round(ageMs / 60000)}m`;
    } else if (ageMs < 86400000) {
      return `${Math.round(ageMs / 3600000)}h`;
    } else {
      return `${Math.round(ageMs / 86400000)}d`;
    }
  };

  // Get the target reference string
  const getTargetReference = () => {
    if (!hpaData?.spec?.scaleTargetRef) return 'Unknown';

    const target = hpaData.spec.scaleTargetRef;
    return `${target.kind}/${target.name}`;
  };

  // Get HPA status
  const getHPAStatus = () => {
    if (!hpaData || !hpaData.status) {
      return { status: 'Unknown', isStable: false };
    }

    const lastScaleTime = hpaData.status.lastScaleTime;
    const currentReplicas = hpaData.status.currentReplicas || 0;
    const desiredReplicas = hpaData.status.desiredReplicas || 0;
    const currentMetrics = hpaData.status.currentMetrics;

    // Check if scaling is in progress
    if (currentReplicas !== desiredReplicas) {
      return { status: 'Scaling', isStable: false };
    }

    // Check if it's unable to scale due to constraints
    if (hpaData.status.conditions) {
      const limitingCondition = hpaData.status.conditions.find(
        condition => condition.type === 'ScalingLimited' && condition.status === 'True'
      );
      if (limitingCondition) {
        return { status: 'Limited', isStable: true, message: limitingCondition.message };
      }
    }

    // If metrics are not available
    if (currentMetrics && currentMetrics.length === 0) {
      return { status: 'NoMetrics', isStable: false };
    }

    // Check if it's stabilized
    if (lastScaleTime) {
      const lastScaleDate = new Date(lastScaleTime);
      const now = new Date();
      const timeSinceScale = now.getTime() - lastScaleDate.getTime();

      // If hasn't scaled in 5 minutes, consider it stable
      if (timeSinceScale > 5 * 60 * 1000) {
        return { status: 'Stable', isStable: true };
      }
    }

    return { status: 'Active', isStable: true };
  };

  // Format metric type
  const formatMetricType = (metricType: string | undefined) => {
    if (!metricType) return 'N/A';

    // Convert camelCase to Spaced Words
    return metricType.replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase());
  };

  // Format CPU value
  const formatCPUValue = (value: string | number | undefined) => {
    if (value === undefined) return 'N/A';

    // Convert to number if it's a string
    const numValue = typeof value === 'string' ? parseInt(value) : value;

    // Format based on size
    if (numValue < 1000) {
      return `${numValue}m`;
    }
    return `${(numValue / 1000).toFixed(1)} cores`;
  };

  // Status alert component based on HPA status
  const HPAStatusAlert = () => {
    const { status, isStable, message } = getHPAStatus();

    if (isStable) return null; // No alert for stable HPAs

    let alertType: "default" | "info" | "warning" | "destructive" | null = "warning";
    let icon = <Activity className="h-4 w-4" />;
    let title = "";
    let description = "";

    if (status === 'Scaling') {
      title = "HPA is Scaling";
      description = "The HPA is currently scaling the target workload to meet desired replicas.";
    } else if (status === 'NoMetrics') {
      title = "No Metrics Available";
      description = "The HPA cannot scale as metrics data is unavailable.";
    } else if (status === 'Unknown') {
      title = "Unknown Status";
      description = "The status of the HPA could not be determined.";
    }

    return (
      <Alert className="mb-6 bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-yellow-800">
        {icon}
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{message || description}</AlertDescription>
      </Alert>
    );
  };

  // Loading state
  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-96 mb-8" />
        <Skeleton className="h-36 w-full mb-4" />
        <Skeleton className="h-48 w-full mb-4" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error loading HPA data</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <div className="mt-4">
          <Button onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  // If no HPA data
  if (!hpaData || !hpaData.metadata) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTitle>No HorizontalPodAutoscaler data available</AlertTitle>
          <AlertDescription>
            The requested HorizontalPodAutoscaler was not found or could not be retrieved.
          </AlertDescription>
        </Alert>
        <div className="mt-4">
          <Button onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  // Calculate HPA metrics and status
  const { status } = getHPAStatus();
  const minReplicas = hpaData.spec?.minReplicas || 1;
  const maxReplicas = hpaData.spec?.maxReplicas || 1;
  const currentReplicas = hpaData.status?.currentReplicas || 0;
  const statusColor = status === 'Scaling'
    ? 'text-yellow-600 dark:text-yellow-400'
    : 'text-green-600 dark:text-green-400';
  const targetRef = getTargetReference();

  return (
    <div className='max-h-[92vh] overflow-y-auto
          
          [&::-webkit-scrollbar]:w-1.5 
          [&::-webkit-scrollbar-track]:bg-transparent 
          [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50'>
      <div className={`p-6 ${fullWidth ? 'max-w-full' : 'max-w-7xl'} mx-auto`}>
        {/* Breadcrumb navigation */}
        <Breadcrumb className="mb-6">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink>
                <div className='flex items-center gap-2'>
                  <img src={KUBERNETES_LOGO} alt='Kubernetes Logo' className='w-4 h-4' />
                  {currentContext?.name}
                </div>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink href="/dashboard/explore/horizontalpodautoscalers">HPAs</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink href={`/dashboard/explore/horizontalpodautoscalers?namespace=${namespace}`}>{namespace}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink>{hpaData.metadata.name}</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header section */}
        <div className="mb-6">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{hpaData.metadata.name}</h1>
                <Badge
                  className={status === 'Scaling'
                    ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                    : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'}
                >
                  {status}
                </Badge>
              </div>
              <div className="text-gray-500 dark:text-gray-400">
                Namespace: <span onClick={() => navigate(`/dashboard/explore/namespaces/${hpaData.metadata?.namespace}`)} className="text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">{hpaData.metadata.namespace}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4 mr-1.5" />
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Back
              </Button>
              <Button variant="outline" size="sm" className='hover:bg-red-600 dark:hover:bg-red-700' onClick={handleDelete}>
                <Trash className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {hpaData && (
          <DeletionDialog
            isOpen={showDeleteDialog}
            onClose={() => setShowDeleteDialog(false)}
            onConfirm={confirmResourceDeletion}
            title="Delete Horizontal Pod Autoscaler"
            description={`Are you sure you want to delete the HPA "${hpaData.metadata.name}" in namespace "${hpaData.metadata.namespace}"? This action cannot be undone.`}
            resourceName={hpaData.metadata.name as string}
            resourceType="HorizontalPodAutoscaler"
            isLoading={deleteLoading}
          />
        )}
        
        {/* Status alert if needed */}
        <HPAStatusAlert />

        {/* Main content tabs */}
        <Tabs
          defaultValue={defaultTab}
          onValueChange={(value) => {
            setSearchParams(params => {
              params.set('tab', value);
              return params;
            });
          }}
          className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="metrics">Metrics</TabsTrigger>
            <TabsTrigger value="yaml">YAML</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 bg-transparent">
            {/* HPA Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-transparent p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-medium">Target</h3>
                </div>
                <div className="text-4xl font-light truncate">
                  {targetRef}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Resource being scaled
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-transparent p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Scale className="h-4 w-4 text-green-500" />
                  <h3 className="text-sm font-medium">Replicas</h3>
                </div>
                <div className="text-4xl font-light">
                  {currentReplicas}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Min: {minReplicas}, Max: {maxReplicas}
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-transparent p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="h-4 w-4 text-purple-500" />
                  <h3 className="text-sm font-medium">Status</h3>
                </div>
                <div className={`text-4xl font-light ${statusColor}`}>
                  {status}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {hpaData.status?.lastScaleTime ?
                    `Last scaled: ${new Date(hpaData.status.lastScaleTime).toLocaleString()}` :
                    'Not yet scaled'}
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-transparent p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-orange-500" />
                  <h3 className="text-sm font-medium">Age</h3>
                </div>
                <div className="text-4xl font-light">
                  {getHPAAge()}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Created {hpaData.metadata.creationTimestamp &&
                    new Date(hpaData.metadata.creationTimestamp).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Replica Scaling Visualization */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-transparent p-4 mb-6">
              <h2 className="text-lg font-medium mb-4">Replica Scaling Range</h2>
              <div className="mt-6 px-4">
                <div className="h-8 relative">
                  {/* Scaling range bar */}
                  <div className="absolute inset-y-0 bg-blue-100 dark:bg-blue-900/20 rounded-full"
                    style={{
                      left: '0%',
                      right: `${100 - (maxReplicas / (maxReplicas || 1) * 100)}%`
                    }}>
                  </div>

                  {/* Min replica marker */}
                  <div className="absolute top-0 bottom-0 flex items-center justify-center"
                    style={{ left: `${minReplicas / (maxReplicas || 1) * 100}%` }}>
                    <div className="h-10 w-0.5 bg-gray-300 dark:bg-gray-600"></div>
                    <div className="absolute bottom-full mb-1 transform -translate-x-1/2 text-xs font-medium">
                      Min: {minReplicas}
                    </div>
                  </div>

                  {/* Current replica marker */}
                  <div className="absolute top-0 bottom-0 flex items-center justify-center"
                    style={{ left: `${Math.min(currentReplicas, maxReplicas) / (maxReplicas || 1) * 100}%` }}>
                    <div className="h-14 w-1 bg-green-500"></div>
                    <div className="absolute top-full mt-1 transform -translate-x-1/2 text-xs font-medium text-green-600 dark:text-green-400">
                      Current: {currentReplicas}
                    </div>
                  </div>

                  {/* Max replica marker */}
                  <div className="absolute top-0 bottom-0 flex items-center justify-center"
                    style={{ left: '100%' }}>
                    <div className="h-10 w-0.5 bg-gray-300 dark:bg-gray-600"></div>
                    <div className="absolute bottom-full mb-1 transform -translate-x-1/2 text-xs font-medium">
                      Max: {maxReplicas}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* HPA Properties */}
            <PropertiesViewer
              metadata={hpaData.metadata}
              kind="HorizontalPodAutoscaler"
              status={status}
              additionalProperties={[
                {
                  label: "Target",
                  value: targetRef
                },
                {
                  label: "Min Replicas",
                  value: minReplicas.toString()
                },
                {
                  label: "Max Replicas",
                  value: maxReplicas.toString()
                },
                {
                  label: "Current Replicas",
                  value: currentReplicas.toString()
                },
                {
                  label: "Last Scale Time",
                  value: hpaData.status?.lastScaleTime ?
                    new Date(hpaData.status.lastScaleTime).toLocaleString() :
                    'Never scaled'
                }
              ]}
            />

            {/* Metrics Summary */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-transparent p-4 mb-6">
              <h2 className="text-lg font-medium mb-4">Metrics Summary</h2>

              {!hpaData.spec?.metrics || hpaData.spec.metrics.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  No metrics configured for this HPA
                </div>
              ) : (
                <div className="space-y-6">
                  {hpaData.spec.metrics.map((metric, index) => {
                    // Determine metric type and values
                    const metricType = metric.type;
                    let metricName = 'Unknown';
                    let targetValue = 'Unknown';
                    let currentValue = 'Unknown';
                    let usagePercentage = 0;

                    // Extract metric name based on type
                    if (metric.resource) {
                      metricName = metric.resource.name;

                      // Extract target value
                      if (metric.resource.target?.type === 'Utilization') {
                        targetValue = `${metric.resource.target.averageUtilization || 0}%`;
                      } else if (metric.resource.target?.type === 'AverageValue') {
                        targetValue = formatCPUValue(metric.resource.target.averageValue);
                      }

                      // Extract current value if available
                      if (hpaData.status?.currentMetrics && hpaData.status.currentMetrics[index]?.resource) {
                        const currentMetric = hpaData.status.currentMetrics[index].resource;

                        if (currentMetric.current?.averageUtilization) {
                          currentValue = `${currentMetric.current.averageUtilization}%`;
                          usagePercentage = currentMetric.current.averageUtilization;
                        } else if (currentMetric.current?.averageValue) {
                          currentValue = formatCPUValue(currentMetric.current.averageValue);

                          // Calculate percentage from average value if target is utilization
                          if (metric.resource.target?.averageUtilization && currentMetric.current?.averageValue) {
                            const targetUtilization = metric.resource.target.averageUtilization;
                            usagePercentage = (parseInt(currentMetric.current.averageValue) / targetUtilization) * 100;
                          }
                        }
                      }
                    } else if (metric.pods) {
                      metricName = metric.pods.metric.name;
                      // Handle pods metric...
                    } else if (metric.object) {
                      metricName = metric.object.metric.name;
                      // Handle object metric...
                    } else if (metric.external) {
                      metricName = metric.external.metric.name;
                      // Handle external metric...
                    }

                    return (
                      <div key={index} className="border border-gray-200 dark:border-gray-800 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {metricType === 'Resource' && metricName === 'cpu' ? (
                              <Cpu className="h-4 w-4 text-blue-500" />
                            ) : (
                              <Activity className="h-4 w-4 text-purple-500" />
                            )}
                            <h3 className="font-medium">{metricName}</h3>
                            <Badge variant="outline">{formatMetricType(metricType)}</Badge>
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            Target: <span className="font-medium">{targetValue}</span>
                          </div>
                        </div>

                        {currentValue !== 'Unknown' && (
                          <div className="mt-2">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-sm">Current: {currentValue}</span>
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {Math.round(usagePercentage)}% of target
                              </span>
                            </div>
                            <Progress
                              value={Math.min(100, usagePercentage)}
                              className="h-2"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Stabilization window if configured */}
                  {hpaData.spec?.behavior && (
                    <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                      <h3 className="text-sm font-medium mb-2">Scaling Behavior</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {hpaData.spec.behavior.scaleDown && (
                          <div>
                            <div className="text-sm text-gray-700 dark:text-gray-300">Scale Down</div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              Stabilization window: {hpaData.spec.behavior.scaleDown.stabilizationWindowSeconds || 300}s
                            </div>
                          </div>
                        )}
                        {hpaData.spec.behavior.scaleUp && (
                          <div>
                            <div className="text-sm text-gray-700 dark:text-gray-300">Scale Up</div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              Stabilization window: {hpaData.spec.behavior.scaleUp.stabilizationWindowSeconds || 0}s
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* HPA Conditions */}
            {hpaData.status?.conditions && hpaData.status.conditions.length > 0 && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-transparent p-4 mb-6">
                <h2 className="text-lg font-medium mb-4">Conditions</h2>
                <div className="space-y-2">
                  {hpaData.status.conditions.map((condition, index) => (
                    <div
                      key={index}
                      className="border border-gray-200 dark:border-gray-800 rounded-md p-3"
                    >
                      <div className="flex justify-between">
                        <div className="font-medium">{condition.type}</div>
                        <Badge
                          className={condition.status === 'True'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'}
                        >
                          {condition.status}
                        </Badge>
                      </div>
                      {condition.message && (
                        <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                          {condition.message}
                        </div>
                      )}
                      <div className="mt-1 text-xs text-gray-500">
                        Last transition: {new Date(condition.lastTransitionTime).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* HPA Events */}
            <EventsViewer
              events={events}
              resourceName={hpaData.metadata.name}
              resourceKind="HorizontalPodAutoscaler"
              namespace={hpaData.metadata.namespace}
            />
          </TabsContent>

          <TabsContent value="metrics" className="space-y-6">
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-transparent p-4">
              <h2 className="text-lg font-medium mb-4">HPA Metrics Configuration</h2>

              {!hpaData.spec?.metrics || hpaData.spec.metrics.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  No metrics configured for this HPA
                </div>
              ) : (
                <div className="space-y-6">
                  {hpaData.spec.metrics.map((metric, index) => {
                    return (
                      <div key={index} className="border border-gray-200 dark:border-gray-800 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-3">
                          {metric.type === 'Resource' && metric.resource?.name === 'cpu' ? (
                            <Cpu className="h-4 w-4 text-blue-500" />
                          ) : (
                            <Activity className="h-4 w-4 text-purple-500" />
                          )}
                          <h3 className="font-medium">{formatMetricType(metric.type)} Metric</h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Configuration */}
                          <div>
                            <h4 className="text-sm font-medium mb-2">Configuration</h4>
                            <div className="space-y-2">
                              {metric.resource && (
                                <>
                                  <div className="flex justify-between">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">Resource</span>
                                    <span className="text-sm font-medium">{metric.resource.name}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">Target Type</span>
                                    <span className="text-sm font-medium">{metric.resource.target?.type || 'N/A'}</span>
                                  </div>
                                  {metric.resource.target?.averageUtilization && (
                                    <div className="flex justify-between">
                                      <span className="text-sm text-gray-600 dark:text-gray-400">Target Utilization</span>
                                      <span className="text-sm font-medium">{metric.resource.target.averageUtilization}%</span>
                                    </div>
                                  )}
                                  {metric.resource.target?.averageValue && (
                                    <div className="flex justify-between">
                                      <span className="text-sm text-gray-600 dark:text-gray-400">Target Value</span>
                                      <span className="text-sm font-medium">
                                        {formatCPUValue(metric.resource.target.averageValue)}
                                      </span>
                                    </div>
                                  )}
                                </>
                              )}
                              {/* Handle other metric types here (pods, object, external) */}
                            </div>
                          </div>

                          {/* Current Status */}
                          <div>
                            <h4 className="text-sm font-medium mb-2">Current Status</h4>
                            {hpaData.status?.currentMetrics && hpaData.status.currentMetrics[index] ? (
                              <div className="space-y-2">
                                {hpaData.status.currentMetrics[index].resource && (
                                  <>
                                    {hpaData.status.currentMetrics[index].resource.current?.averageUtilization && (
                                      <div className="flex justify-between">
                                        <span className="text-sm text-gray-600 dark:text-gray-400">Current Utilization</span>
                                        <span className="text-sm font-medium">
                                          {hpaData.status.currentMetrics[index].resource.current.averageUtilization}%
                                        </span>
                                      </div>
                                    )}
                                    {hpaData.status.currentMetrics[index].resource.current?.averageValue && (
                                      <div className="flex justify-between">
                                        <span className="text-sm text-gray-600 dark:text-gray-400">Current Value</span>
                                        <span className="text-sm font-medium">
                                          {formatCPUValue(hpaData.status.currentMetrics[index].resource.current.averageValue)}
                                        </span>
                                      </div>
                                    )}
                                  </>
                                )}
                                {/* Handle other metric types here */}
                              </div>
                            ) : (
                              <div className="text-sm text-gray-500 dark:text-gray-400">
                                No current metrics available
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Scaling Behavior */}
            {hpaData.spec?.behavior && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-transparent p-4">
                <h2 className="text-lg font-medium mb-4">Scaling Behavior</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Scale Up */}
                  {hpaData.spec.behavior.scaleUp && (
                    <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <ArrowUpDown className="h-4 w-4 text-green-500" />
                        <h3 className="font-medium">Scale Up</h3>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600 dark:text-gray-400">Stabilization Window</span>
                          <span className="text-sm font-medium">
                            {hpaData.spec.behavior.scaleUp.stabilizationWindowSeconds || 0} seconds
                          </span>
                        </div>
                        {hpaData.spec.behavior.scaleUp.policies && (
                          <div>
                            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Policies</div>
                            <div className="space-y-1">
                              {hpaData.spec.behavior.scaleUp.policies.map((policy, idx) => (
                                <div key={idx} className="text-sm bg-gray-50 dark:bg-gray-800 p-2 rounded">
                                  {policy.type}: {policy.value} {policy.periodSeconds && `/ ${policy.periodSeconds}s`}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {hpaData.spec.behavior.scaleUp.selectPolicy && (
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600 dark:text-gray-400">Select Policy</span>
                            <span className="text-sm font-medium">{hpaData.spec.behavior.scaleUp.selectPolicy}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Scale Down */}
                  {hpaData.spec.behavior.scaleDown && (
                    <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <ArrowUpDown className="h-4 w-4 text-red-500 transform rotate-180" />
                        <h3 className="font-medium">Scale Down</h3>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600 dark:text-gray-400">Stabilization Window</span>
                          <span className="text-sm font-medium">
                            {hpaData.spec.behavior.scaleDown.stabilizationWindowSeconds || 300} seconds
                          </span>
                        </div>
                        {hpaData.spec.behavior.scaleDown.policies && (
                          <div>
                            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Policies</div>
                            <div className="space-y-1">
                              {hpaData.spec.behavior.scaleDown.policies.map((policy, idx) => (
                                <div key={idx} className="text-sm bg-gray-50 dark:bg-gray-800 p-2 rounded">
                                  {policy.type}: {policy.value} {policy.periodSeconds && `/ ${policy.periodSeconds}s`}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {hpaData.spec.behavior.scaleDown.selectPolicy && (
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600 dark:text-gray-400">Select Policy</span>
                            <span className="text-sm font-medium">{hpaData.spec.behavior.scaleDown.selectPolicy}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="yaml" className="space-y-6">
            <ResourceViewerYamlTab
              resourceData={hpaData}
              namespace={hpaData.metadata.namespace || ''}
              currentContext={currentContext}
            />
          </TabsContent>

          <TabsContent value="events" className="space-y-6">
            <EventsViewer
              events={events}
              namespace={hpaData.metadata.namespace}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default HorizontalPodAutoscalerViewer;