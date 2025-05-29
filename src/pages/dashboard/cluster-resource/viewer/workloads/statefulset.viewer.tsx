import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { V1StatefulSet, CoreV1Event } from '@kubernetes/client-node';
import {
  deleteResource,
  getResource,
  listResources
} from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';

// Component imports
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ChevronRight, AlertCircle, Clock, ArrowLeft, RefreshCw, Box, Shield, Database, Layers, Trash } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import KUBERNETES_LOGO from '@/assets/kubernetes.svg';
import { useSearchParams } from 'react-router-dom';

// Custom component imports
import PropertiesViewer from '../components/properties.viewer';
import EventsViewer from '../components/event.viewer';
import StatefulSetPods from '../components/statefulsetpod.viewer';
import { DeletionDialog, ResourceCanvas, ResourceViewerYamlTab } from '@/components/custom';

// Define interface for statefulset data (extending V1StatefulSet with events)
interface StatefulSetData extends V1StatefulSet {
  events?: CoreV1Event[];
}

const StatefulSetViewer: React.FC = () => {
  const [statefulSetData, setStatefulSetData] = useState<StatefulSetData | null>(null);
  const [events, setEvents] = useState<CoreV1Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { currentContext, fullWidth } = useCluster();
  const { statefulSetName, namespace } = useParams<{ statefulSetName: string; namespace: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const defaultTab = tabParam || 'overview';
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Fetch events for the statefulset
  const fetchEvents = async () => {
    if (!currentContext || !namespace) return;

    try {
      // Fetch all events in the namespace
      const eventData = await listResources<'events'>(
        currentContext.name,
        'events',
        { namespace }
      );

      setEvents(eventData);
    } catch (err) {
      console.error('Error fetching events:', err);
    }
  };

  // Fetch statefulset data and events
  useEffect(() => {
    const fetchStatefulSetData = async () => {
      if (!currentContext || !statefulSetName || !namespace) {
        setLoading(false);
        setError("Missing required parameters");
        return;
      }

      try {
        setLoading(true);

        // Get statefulset details
        const data = await getResource<'statefulsets'>(
          currentContext.name,
          'statefulsets',
          statefulSetName,
          namespace,
          'apps' // API group for statefulsets
        );

        setStatefulSetData(data);
        setError(null);

        // Fetch related events
        await fetchEvents();
      } catch (err) {
        console.error('Error fetching statefulset:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch statefulset data');
      } finally {
        setLoading(false);
      }
    };

    fetchStatefulSetData();
  }, [currentContext, namespace, statefulSetName]);


  const handleDelete = () => {
    setShowDeleteDialog(true);
  };

  const confirmResourceDeletion = async () => {
    if (!statefulSetData || !currentContext) {
      setShowDeleteDialog(false);
      return;
    }

    try {
      setDeleteLoading(true);

      await deleteResource(
        currentContext.name,
        'statefulsets',
        statefulSetData.metadata?.name as string,
        {
          namespace: statefulSetData.metadata?.namespace,
          apiGroup: 'apps'
        }
      );

      // Navigate back to the statefulsets list
      navigate('/dashboard/explore/statefulsets');
    } catch (err) {
      console.error('Failed to delete statefulset:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete statefulset');
    } finally {
      setDeleteLoading(false);
      setShowDeleteDialog(false);
    }
  };

  // Handle refresh data
  const handleRefresh = () => {
    setLoading(true);
    // Refetch data
    if (currentContext && statefulSetName && namespace) {
      Promise.all([
        getResource<'statefulsets'>(
          currentContext.name,
          'statefulsets',
          statefulSetName,
          namespace,
          'apps'
        ),
        fetchEvents()
      ]).then(([data]) => {
        setStatefulSetData(data);
        setLoading(false);
      }).catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to refresh data');
        setLoading(false);
      });
    }
  };

  // Get statefulset status
  const getStatefulSetStatus = () => {
    if (!statefulSetData || !statefulSetData.status) {
      return { status: 'Unknown', isReady: false };
    }

    const replicas = statefulSetData.spec?.replicas || 0;
    const readyReplicas = statefulSetData.status.readyReplicas || 0;
    const currentReplicas = statefulSetData.status.currentReplicas || 0;
    const updatedReplicas = statefulSetData.status.updatedReplicas || 0;

    // Check if all pods are ready
    if (readyReplicas < replicas) {
      return { status: 'Progressing', isReady: false };
    }

    // Check if all pods are updated
    if (updatedReplicas < replicas) {
      return { status: 'Updating', isReady: false };
    }

    // Check if current replicas match desired
    if (currentReplicas < replicas) {
      return { status: 'Scaling', isReady: false };
    }

    // All good
    return { status: 'Ready', isReady: true };
  };

  // Status alert component based on statefulset status
  const StatefulSetStatusAlert = () => {
    const { status, isReady } = getStatefulSetStatus();

    if (isReady) return null; // No alert for ready statefulsets

    let alertType: "default" | "info" | "warning" | "destructive" | null = "warning";
    let icon = <Clock className="h-4 w-4" />;
    let title = "";
    let description = "";

    switch (status) {
      case 'Progressing':
        title = "StatefulSet is Progressing";
        description = "Some pods are still being created or are not yet ready.";
        break;
      case 'Updating':
        title = "StatefulSet is Updating";
        description = "The StatefulSet is rolling out updated pods.";
        break;
      case 'Scaling':
        title = "StatefulSet is Scaling";
        description = "The StatefulSet is scaling to reach the desired replica count.";
        break;
      default:
        title = "StatefulSet Status Unknown";
        description = "The state of the StatefulSet could not be determined.";
    }

    return (
      <Alert className="mb-6 bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-yellow-800">
        {icon}
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{description}</AlertDescription>
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
          <AlertTitle>Error loading statefulset data</AlertTitle>
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

  // If no statefulset data
  if (!statefulSetData || !statefulSetData.metadata) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTitle>No statefulset data available</AlertTitle>
          <AlertDescription>
            The requested statefulset was not found or could not be retrieved.
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

  // Calculate statefulset status and metrics
  const { status } = getStatefulSetStatus();
  const replicas = statefulSetData.spec?.replicas || 0;
  const readyReplicas = statefulSetData.status?.readyReplicas || 0;
  const currentReplicas = statefulSetData.status?.currentReplicas || 0;
  const updatedReplicas = statefulSetData.status?.updatedReplicas || 0;
  const statusColor = status === 'Ready' ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400';

  return (
    <div className='
           max-h-[92vh] overflow-y-auto
          scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent
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
              <BreadcrumbLink href="/dashboard/explore/statefulsets">StatefulSets</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink href={`/dashboard/explore/statefulsets?namespace=${namespace}`}>{namespace}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink>{statefulSetData.metadata.name}</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header section */}
        <div className="mb-6">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{statefulSetData.metadata.name}</h1>
                <Badge
                  className={`${status === 'Ready'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                    : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'}`}
                >
                  {status}
                </Badge>
              </div>
              <div className="text-gray-500 dark:text-gray-400">
                Namespace: <span className="text-blue-600 dark:text-blue-400 hover:text-blue-500 hover:underline cursor-pointer" onClick={() => navigate(`/dashboard/explore/namespaces/${statefulSetData?.metadata?.namespace}`)}>{statefulSetData?.metadata?.namespace}</span>
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

        {/* Status alert if needed */}
        <StatefulSetStatusAlert />

        {statefulSetData && (
          <DeletionDialog
            isOpen={showDeleteDialog}
            onClose={() => setShowDeleteDialog(false)}
            onConfirm={confirmResourceDeletion}
            title="Delete StatefulSet"
            description={`Are you sure you want to delete the statefulset "${statefulSetData.metadata.name}" in namespace "${statefulSetData.metadata.namespace}"? This action cannot be undone.`}
            resourceName={statefulSetData.metadata.name as string}
            resourceType="StatefulSet"
            isLoading={deleteLoading}
          />
        )}

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
            <TabsTrigger value="yaml">YAML</TabsTrigger>
            <TabsTrigger value="canvas">Canvas</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="pods">Pods</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 bg-transparent">
            {/* StatefulSet Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Box className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-medium">Replicas</h3>
                </div>
                <div className="text-2xl font-semibold">
                  {readyReplicas}/{replicas}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Ready/Desired
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Database className="h-4 w-4 text-purple-500" />
                  <h3 className="text-sm font-medium">Current</h3>
                </div>
                <div className="text-2xl font-semibold">
                  {currentReplicas}/{replicas}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Current/Desired
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4 text-green-500" />
                  <h3 className="text-sm font-medium">Updated</h3>
                </div>
                <div className="text-2xl font-semibold">
                  {updatedReplicas}/{replicas}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Updated/Desired
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-orange-500" />
                  <h3 className="text-sm font-medium">Status</h3>
                </div>
                <div className={`text-2xl font-semibold ${statusColor}`}>
                  {status}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  StatefulSet State
                </div>
              </div>
            </div>

            {/* StatefulSet Properties */}
            <PropertiesViewer
              metadata={statefulSetData.metadata}
              kind="StatefulSet"
              status={status}
              additionalProperties={[
                {
                  label: "Replicas",
                  value: `${readyReplicas}/${replicas} ready`
                },
                {
                  label: "Selector",
                  value: statefulSetData.spec?.selector?.matchLabels ? (
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(statefulSetData.spec.selector.matchLabels).map(([key, value]) => (
                        <Badge key={key} variant="outline" className="text-xs">
                          {key}: {value}
                        </Badge>
                      ))}
                    </div>
                  ) : 'None'
                },
                {
                  label: "Update Strategy",
                  value: statefulSetData.spec?.updateStrategy?.type || 'RollingUpdate'
                },
                {
                  label: "Service Name",
                  value: statefulSetData.spec?.serviceName || 'None'
                }
              ]}
            />

            {/* StatefulSet Specific Features */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
              <h2 className="text-lg font-medium mb-4">StatefulSet Configuration</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Service Name:</span>
                    <Badge variant="outline">
                      {statefulSetData.spec?.serviceName || 'Not specified'}
                    </Badge>
                  </div>

                  <div>
                    <span className="font-medium">Pod Management Policy:</span>{' '}
                    <Badge variant="outline">
                      {statefulSetData.spec?.podManagementPolicy || 'OrderedReady'}
                    </Badge>
                  </div>

                  <div>
                    <span className="font-medium">Update Strategy:</span>{' '}
                    <Badge variant="outline">
                      {statefulSetData.spec?.updateStrategy?.type || 'RollingUpdate'}
                    </Badge>
                  </div>

                  {statefulSetData.spec?.updateStrategy?.type === 'RollingUpdate' && (
                    <div>
                      <span className="font-medium">Partition:</span>{' '}
                      {statefulSetData.spec?.updateStrategy?.rollingUpdate?.partition || 0}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div>
                    <span className="font-medium">Revision History Limit:</span>{' '}
                    {statefulSetData.spec?.revisionHistoryLimit || 10}
                  </div>

                  <div>
                    <span className="font-medium">Min Ready Seconds:</span>{' '}
                    {statefulSetData.spec?.minReadySeconds || 0}
                  </div>

                  <div>
                    <span className="font-medium">Persistent Volume Claim Retention Policy:</span>{' '}
                    {statefulSetData.spec?.persistentVolumeClaimRetentionPolicy ? (
                      <div className="mt-1 ml-4 text-sm">
                        <div>
                          When Deleted: {statefulSetData.spec.persistentVolumeClaimRetentionPolicy.whenDeleted || 'Retain'}
                        </div>
                        <div>
                          When Scaled: {statefulSetData.spec.persistentVolumeClaimRetentionPolicy.whenScaled || 'Retain'}
                        </div>
                      </div>
                    ) : 'Not specified'}
                  </div>
                </div>
              </div>
            </div>

            {/* Volume Claim Templates */}
            {statefulSetData.spec?.volumeClaimTemplates && statefulSetData.spec.volumeClaimTemplates.length > 0 && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
                <h2 className="text-lg font-medium mb-4">Volume Claim Templates</h2>
                <div className="space-y-3">
                  {statefulSetData.spec.volumeClaimTemplates.map((template, index) => (
                    <div key={index} className="p-3 rounded-lg border border-gray-200 dark:border-gray-800">
                      <div className="font-medium mb-1">{template.metadata?.name || `Template ${index + 1}`}</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Storage Class:</span>{' '}
                          {template.spec?.storageClassName || 'Default'}
                        </div>
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Access Modes:</span>{' '}
                          {template.spec?.accessModes?.join(', ') || 'None specified'}
                        </div>
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Storage:</span>{' '}
                          {template.spec?.resources?.requests?.storage || 'Not specified'}
                        </div>
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Volume Mode:</span>{' '}
                          {template.spec?.volumeMode || 'Filesystem'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pod Template */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
              <h2 className="text-lg font-medium mb-4">Pod Template</h2>
              <div className="space-y-4">
                {/* Template Labels */}
                <div>
                  <h3 className="text-sm font-medium mb-2">Labels</h3>
                  <div className="flex flex-wrap gap-1">
                    {statefulSetData.spec?.template?.metadata?.labels ? (
                      Object.entries(statefulSetData.spec.template.metadata.labels).map(([key, value]) => (
                        <Badge
                          key={key}
                          variant="outline"
                          className="bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-xs"
                        >
                          {key}: {value}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-gray-500 dark:text-gray-400">No labels</span>
                    )}
                  </div>
                </div>

                {/* Template Containers */}
                <div>
                  <h3 className="text-sm font-medium mb-2">Containers</h3>
                  <div className="space-y-2">
                    {statefulSetData.spec?.template?.spec?.containers.map((container, index) => (
                      <div
                        key={container.name}
                        className="p-3 rounded-lg border border-gray-200 dark:border-gray-800"
                      >
                        <div className="font-medium mb-1">{container.name}</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                          Image: <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">{container.image}</code>
                        </div>

                        {/* Resources */}
                        {container.resources && (Object.keys(container.resources).length > 0) && (
                          <div className="mt-2 text-sm">
                            <div className="font-medium mb-1">Resources:</div>
                            <div className="grid grid-cols-2 gap-2">
                              {container.resources.requests && (
                                <div>
                                  <span className="text-gray-500 dark:text-gray-400">Requests:</span>{' '}
                                  {Object.entries(container.resources.requests)
                                    .map(([key, value]) => `${key}: ${value}`)
                                    .join(', ')}
                                </div>
                              )}

                              {container.resources.limits && (
                                <div>
                                  <span className="text-gray-500 dark:text-gray-400">Limits:</span>{' '}
                                  {Object.entries(container.resources.limits)
                                    .map(([key, value]) => `${key}: ${value}`)
                                    .join(', ')}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Ports */}
                        {container.ports && container.ports.length > 0 && (
                          <div className="mt-2 text-sm">
                            <div className="font-medium mb-1">Ports:</div>
                            <div className="flex flex-wrap gap-1">
                              {container.ports.map((port, portIndex) => (
                                <Badge
                                  key={`${container.name}-port-${portIndex}`}
                                  variant="outline"
                                  className="bg-blue-50 dark:bg-blue-900/20"
                                >
                                  {port.containerPort}{port.protocol ? `/${port.protocol}` : ''}
                                  {port.name ? ` (${port.name})` : ''}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Volume Mounts */}
                        {container.volumeMounts && container.volumeMounts.length > 0 && (
                          <div className="mt-2 text-sm">
                            <div className="font-medium mb-1">Volume Mounts:</div>
                            <div className="space-y-1">
                              {container.volumeMounts.map((mount, mountIndex) => (
                                <div key={`${container.name}-mount-${mountIndex}`}>
                                  <Badge variant="outline" className="bg-green-50 dark:bg-green-900/20">
                                    {mount.name}
                                  </Badge>{' '}
                                  → {mount.mountPath}
                                  {mount.readOnly && ' (readonly)'}
                                  {mount.subPath && ` (subPath: ${mount.subPath})`}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* StatefulSet Events */}
            <EventsViewer
              events={events}
              resourceName={statefulSetData.metadata.name}
              resourceKind="StatefulSet"
              namespace={statefulSetData.metadata.namespace}
            />
          </TabsContent>

          <TabsContent value="yaml" className="space-y-6">
            <ResourceViewerYamlTab
              resourceData={statefulSetData}
              namespace={statefulSetData.metadata.namespace || ''}
              currentContext={currentContext}
            />
          </TabsContent>

          <TabsContent value="canvas" className="space-y-6">
            <div className="h-[calc(100vh-300px)] min-h-[500px] rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
              {statefulSetData && (
                <ResourceCanvas
                  resourceDetails={{
                    namespace: statefulSetData.metadata?.namespace || '',
                    group: 'apps',
                    version: 'v1',
                    resourceType: 'statefulsets',
                    resourceName: statefulSetData.metadata?.name || '',
                  }}
                />
              )}
            </div>
          </TabsContent>

          <TabsContent value="events" className="space-y-6">
            <EventsViewer
              events={events}
              namespace={statefulSetData.metadata.namespace}
            />
          </TabsContent>

          <TabsContent value="pods" className="space-y-6">
            {
              statefulSetName && namespace && currentContext && (
                <StatefulSetPods
                  statefulSetName={statefulSetName}
                  namespace={namespace}
                  clusterName={currentContext.name}
                  statefulSet={statefulSetData}
                />
              )
            }
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default StatefulSetViewer;