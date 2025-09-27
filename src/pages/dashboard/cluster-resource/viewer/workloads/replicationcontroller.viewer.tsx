import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { V1ReplicationController, CoreV1Event } from '@kubernetes/client-node';
import {
  deleteResource,
  getResource,
  listResources
} from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';
import { useSearchParams } from 'react-router-dom';

// Component imports
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ChevronRight, AlertCircle, Clock, ArrowLeft, RefreshCw, Box, Shield, Layers, ChevronsUpDown, Trash } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import KUBERNETES_LOGO from '@/assets/kubernetes.svg';

// Custom component imports
import PropertiesViewer from '../components/properties.viewer';
import EventsViewer from '../components/event.viewer';
import ReplicationControllerPods from '../components/replicationcontrollerpods.viewer';
import ResourceViewerYamlTab from '@/components/custom/editor/resource-viewer-tabs.component';
import { DeletionDialog } from '@/components/custom';
import { useReconMode } from '@/contexts/useRecon';
import { toast } from '@/hooks/use-toast';

// Define interface for replicationcontroller data (extending V1ReplicationController with events)
interface ReplicationControllerData extends V1ReplicationController {
  events?: CoreV1Event[];
}

const ReplicationControllerViewer: React.FC = () => {
  const [rcData, setRCData] = useState<ReplicationControllerData | null>(null);
  const [events, setEvents] = useState<CoreV1Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { currentContext, fullWidth } = useCluster();
  const { isReconMode } = useReconMode();
  const { rcName, namespace } = useParams<{ rcName: string; namespace: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const defaultTab = tabParam || 'overview';
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Fetch events for the replication controller
  const fetchEvents = async () => {
    if (!currentContext || !namespace || !rcName) return;
  
    try {
      // Fetch events specific to this replication controller using fieldSelector
      const eventData = await listResources<'events'>(
        currentContext.name,
        'events',
        { 
          namespace,
          fieldSelector: `involvedObject.name=${rcName},involvedObject.kind=ReplicationController`
        }
      );
  
      setEvents(eventData);
    } catch (err) {
      console.error('Error fetching events:', err);
    }
  };

  // Fetch replication controller data and events
  useEffect(() => {
    const fetchRCData = async () => {
      if (!currentContext || !rcName || !namespace) {
        setLoading(false);
        setError("Missing required parameters");
        return;
      }

      try {
        setLoading(true);

        // Get replication controller details (no API group needed for RCs since they're in core)
        const data = await getResource<'replicationcontrollers'>(
          currentContext.name,
          'replicationcontrollers',
          rcName,
          namespace
        );

        setRCData(data);
        setError(null);

        // Fetch related events
        await fetchEvents();
      } catch (err) {
        console.error('Error fetching replication controller:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch replication controller data');
      } finally {
        setLoading(false);
      }
    };

    fetchRCData();
  }, [currentContext, namespace, rcName]);

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
    if (!rcData || !currentContext) {
      setShowDeleteDialog(false);
      return;
    }

    try {
      setDeleteLoading(true);

      await deleteResource(
        currentContext.name,
        'replicationcontrollers',
        rcData.metadata?.name as string,
        {
          namespace: rcData.metadata?.namespace
          // Note: ReplicationControllers are in the core API group, so no apiGroup parameter needed
        }
      );

      // Navigate back to the replicationcontrollers list
      navigate('/dashboard/explore/replicationcontrollers');
    } catch (err) {
      console.error('Failed to delete replication controller:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete replication controller');
    } finally {
      setDeleteLoading(false);
      setShowDeleteDialog(false);
    }
  };

  // Handle refresh data
  const handleRefresh = () => {
    setLoading(true);
    // Refetch data
    if (currentContext && rcName && namespace) {
      Promise.all([
        getResource<'replicationcontrollers'>(
          currentContext.name,
          'replicationcontrollers',
          rcName,
          namespace
        ),
        fetchEvents()
      ]).then(([data]) => {
        setRCData(data);
        setLoading(false);
      }).catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to refresh data');
        setLoading(false);
      });
    }
  };

  // Get replication controller status
  const getRCStatus = () => {
    if (!rcData || !rcData.status) {
      return { status: 'Unknown', isReady: false };
    }

    const desiredReplicas = rcData.spec?.replicas || 0;
    const readyReplicas = rcData.status.readyReplicas || 0;
    const availableReplicas = rcData.status.availableReplicas || 0;
    const currentReplicas = rcData.status.replicas || 0;

    // Check if all pods are ready and available
    if (readyReplicas < desiredReplicas || availableReplicas < desiredReplicas) {
      return { status: 'Progressing', isReady: false };
    }

    // All good
    return { status: 'Ready', isReady: true };
  };

  // Status alert component based on replication controller status
  const RCStatusAlert = () => {
    const { status, isReady } = getRCStatus();

    if (isReady) return null; // No alert for ready RCs

    let alertType: "default" | "info" | "warning" | "destructive" | null = "warning";
    let icon = <Clock className="h-4 w-4" />;
    let title = "";
    let description = "";

    if (status === 'Progressing') {
      title = "ReplicationController is Progressing";
      description = "The ReplicationController is still creating pods or waiting for them to become ready.";
    } else {
      title = "ReplicationController Status Unknown";
      description = "The state of the ReplicationController could not be determined.";
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
          <AlertTitle>Error loading replication controller data</AlertTitle>
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

  // If no RC data
  if (!rcData || !rcData.metadata) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTitle>No replication controller data available</AlertTitle>
          <AlertDescription>
            The requested replication controller was not found or could not be retrieved.
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

  // Calculate RC status and metrics
  const { status } = getRCStatus();
  const desiredReplicas = rcData.spec?.replicas || 0;
  const readyReplicas = rcData.status?.readyReplicas || 0;
  const availableReplicas = rcData.status?.availableReplicas || 0;
  const currentReplicas = rcData.status?.replicas || 0;
  const statusColor = status === 'Ready' ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400';

  return (
    <div className='
           max-h-[92vh] overflow-y-auto
          
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
              <BreadcrumbLink href="/dashboard/explore/replicationcontrollers">ReplicationControllers</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink href={`/dashboard/explore/replicationcontrollers?namespace=${namespace}`}>{namespace}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink>{rcData.metadata.name}</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header section */}
        <div className="mb-6">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{rcData.metadata.name}</h1>
                <Badge
                  className={`${status === 'Ready'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                    : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'}`}
                >
                  {status}
                </Badge>
              </div>
              <div className="text-gray-500 dark:text-gray-400">
                Namespace: <span onClick={() => navigate(`/dashboard/explore/namespaces/${rcData.metadata?.namespace}`)} className="text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">{rcData.metadata.namespace}</span>
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
        <RCStatusAlert />

        {rcData && (
          <DeletionDialog
            isOpen={showDeleteDialog}
            onClose={() => setShowDeleteDialog(false)}
            onConfirm={confirmResourceDeletion}
            title="Delete ReplicationController"
            description={`Are you sure you want to delete the replication controller "${rcData.metadata.name}" in namespace "${rcData.metadata.namespace}"? This action cannot be undone.`}
            resourceName={rcData.metadata.name as string}
            resourceType="ReplicationController"
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
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="pods">Pods</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 bg-transparent">
            {/* ReplicationController Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Box className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-medium">Replicas</h3>
                </div>
                <div className="text-2xl font-semibold">
                  {readyReplicas}/{desiredReplicas}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Ready/Desired
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ChevronsUpDown className="h-4 w-4 text-purple-500" />
                  <h3 className="text-sm font-medium">Current</h3>
                </div>
                <div className="text-2xl font-semibold">
                  {currentReplicas}/{desiredReplicas}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Current/Desired
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4 text-green-500" />
                  <h3 className="text-sm font-medium">Available</h3>
                </div>
                <div className="text-2xl font-semibold">
                  {availableReplicas || 0}/{desiredReplicas}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Available/Desired
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
                  RC State
                </div>
              </div>
            </div>

            {/* ReplicationController Properties */}
            <PropertiesViewer
              metadata={rcData.metadata}
              kind="ReplicationController"
              status={status}
              additionalProperties={[
                {
                  label: "Replicas",
                  value: `${readyReplicas}/${desiredReplicas} ready`
                },
                {
                  label: "Selector",
                  value: rcData.spec?.selector ? (
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(rcData.spec.selector).map(([key, value]) => (
                        <Badge key={key} variant="outline" className="text-xs">
                          {key}: {value}
                        </Badge>
                      ))}
                    </div>
                  ) : 'None'
                },
                {
                  label: "Min Ready Seconds",
                  value: rcData.spec?.minReadySeconds || 0
                }
              ]}
            />

            {/* Pod Template */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
              <h2 className="text-lg font-medium mb-4">Pod Template</h2>
              <div className="space-y-4">
                {/* Template Labels */}
                <div>
                  <h3 className="text-sm font-medium mb-2">Labels</h3>
                  <div className="flex flex-wrap gap-1">
                    {rcData.spec?.template?.metadata?.labels ? (
                      Object.entries(rcData.spec.template.metadata.labels).map(([key, value]) => (
                        <Badge
                          key={key}
                          variant="outline"
                          className="bg-gray-100 dark:bg-gray-800 text-xs"
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
                    {rcData.spec?.template?.spec?.containers.map((container, index) => (
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
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Volumes */}
            {rcData.spec?.template?.spec?.volumes && rcData.spec.template.spec.volumes.length > 0 && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
                <h2 className="text-lg font-medium mb-4">Volumes</h2>
                <div className="space-y-3">
                  {rcData.spec.template.spec.volumes.map((volume, index) => (
                    <div key={index} className="p-3 rounded-lg border border-gray-200 dark:border-gray-800">
                      <div className="font-medium mb-1">{volume.name}</div>
                      <div className="text-sm">
                        {volume.configMap && (
                          <span className="bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 px-2 py-1 rounded text-xs">
                            ConfigMap: {volume.configMap.name}
                          </span>
                        )}
                        {volume.secret && (
                          <span className="bg-purple-100 dark:bg-purple-900/20 text-purple-800 dark:text-purple-300 px-2 py-1 rounded text-xs">
                            Secret: {volume.secret.secretName}
                          </span>
                        )}
                        {volume.hostPath && (
                          <span className="bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300 px-2 py-1 rounded text-xs">
                            HostPath: {volume.hostPath.path} ({volume.hostPath.type || 'Directory'})
                          </span>
                        )}
                        {volume.emptyDir && (
                          <span className="bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300 px-2 py-1 rounded text-xs">
                            EmptyDir
                            {volume.emptyDir.medium && ` (${volume.emptyDir.medium})`}
                          </span>
                        )}
                        {volume.persistentVolumeClaim && (
                          <span className="bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300 px-2 py-1 rounded text-xs">
                            PVC: {volume.persistentVolumeClaim.claimName}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ReplicationController Events */}
            <EventsViewer
              events={events}
              resourceName={rcData.metadata.name}
              resourceKind="ReplicationController"
              namespace={rcData.metadata.namespace}
            />
          </TabsContent>

          <TabsContent value="yaml" className="space-y-6">
            <ResourceViewerYamlTab
              resourceData={rcData}
              namespace={rcData.metadata.namespace || ''}
              currentContext={currentContext}
            />
          </TabsContent>

          <TabsContent value="events" className="space-y-6">
            <EventsViewer
              events={events}
              namespace={rcData.metadata.namespace}
            />
          </TabsContent>

          <TabsContent value="pods" className="space-y-6">
            {
              rcName && namespace && currentContext && (
                <ReplicationControllerPods
                  rcName={rcName}
                  namespace={namespace}
                  clusterName={currentContext.name}
                  replicationController={rcData}
                />
              )
            }
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default ReplicationControllerViewer;