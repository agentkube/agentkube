import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { V1Deployment, CoreV1Event } from '@kubernetes/client-node';
import {
  deleteResource,
  getResource,
  listResources
} from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';

// Component imports
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ChevronRight, AlertCircle, Clock, ArrowLeft, RefreshCw, Box, Shield, ChevronsUpDown, Trash } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import KUBERNETES_LOGO from '@/assets/kubernetes.svg';

// Custom component imports
import PropertiesViewer from '../components/properties.viewer';
import EventsViewer from '../components/event.viewer';
import DeploymentPods from '../components/deploymentpods.viewer';
import ResourceViewerYamlTab from '@/components/custom/editor/resource-viewer-tabs.component';
import { DeletionDialog, ResourceCanvas } from '@/components/custom';
import { useSearchParams } from 'react-router-dom';

// Define interface for deployment data (extending V1Deployment with events)
interface DeploymentData extends V1Deployment {
  events?: CoreV1Event[];
}

const DeploymentViewer: React.FC = () => {
  const [deploymentData, setDeploymentData] = useState<DeploymentData | null>(null);
  const [events, setEvents] = useState<CoreV1Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { currentContext, fullWidth } = useCluster();
  const { deploymentName, namespace } = useParams<{ deploymentName: string; namespace: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const defaultTab = tabParam || 'overview';
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  // Fetch events for the deployment
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

  // Fetch deployment data and events
  useEffect(() => {
    const fetchDeploymentData = async () => {
      if (!currentContext || !deploymentName || !namespace) {
        setLoading(false);
        setError("Missing required parameters");
        return;
      }

      try {
        setLoading(true);

        // Get deployment details
        const data = await getResource<'deployments'>(
          currentContext.name,
          'deployments',
          deploymentName,
          namespace,
          'apps' // API group for deployments
        );

        setDeploymentData(data);
        setError(null);

        // Fetch related events
        await fetchEvents();
      } catch (err) {
        console.error('Error fetching deployment:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch deployment data');
      } finally {
        setLoading(false);
      }
    };

    fetchDeploymentData();
  }, [currentContext, namespace, deploymentName]);


  const handleDelete = () => {
    setShowDeleteDialog(true);
  };

  const confirmResourceDeletion = async () => {
    if (!deploymentData || !currentContext) {
      setShowDeleteDialog(false);
      return;
    }

    try {
      setDeleteLoading(true);

      await deleteResource(
        currentContext.name,
        'deployments',
        deploymentData.metadata?.name as string,
        {
          namespace: deploymentData.metadata?.namespace,
          apiGroup: 'apps'
        }
      );

      // Navigate back to the deployments list
      navigate('/dashboard/explore/deployments');
    } catch (err) {
      console.error('Failed to delete deployment:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete deployment');
    } finally {
      setDeleteLoading(false);
      setShowDeleteDialog(false);
    }
  };

  // Handle refresh data
  const handleRefresh = () => {
    setLoading(true);
    // Refetch data
    if (currentContext && deploymentName && namespace) {
      Promise.all([
        getResource<'deployments'>(
          currentContext.name,
          'deployments',
          deploymentName,
          namespace,
          'apps'
        ),
        fetchEvents()
      ]).then(([data]) => {
        setDeploymentData(data);
        setLoading(false);
      }).catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to refresh data');
        setLoading(false);
      });
    }
  };

  // Get deployment status
  const getDeploymentStatus = () => {
    if (!deploymentData || !deploymentData.status) {
      return { status: 'Unknown', isReady: false };
    }

    const readyReplicas = deploymentData.status.readyReplicas || 0;
    const desiredReplicas = deploymentData.spec?.replicas || 0;
    const updatedReplicas = deploymentData.status.updatedReplicas || 0;
    const availableReplicas = deploymentData.status.availableReplicas || 0;

    // Deployment is still progressing
    if (updatedReplicas < desiredReplicas) {
      return { status: 'Progressing', isReady: false };
    }

    // Not all replicas are ready
    if (readyReplicas < desiredReplicas) {
      return { status: 'Progressing', isReady: false };
    }

    // Not all replicas are available
    if (availableReplicas < desiredReplicas) {
      return { status: 'Progressing', isReady: false };
    }

    // All good
    return { status: 'Ready', isReady: true };
  };

  // Status alert component based on deployment status
  const DeploymentStatusAlert = () => {
    const { status, isReady } = getDeploymentStatus();

    if (isReady) return null; // No alert for ready deployments

    let alertType: "default" | "info" | "warning" | "destructive" | null = "warning";
    let icon = <Clock className="h-4 w-4" />;
    let title = "";
    let description = "";

    if (status === 'Progressing') {
      title = "Deployment is Progressing";
      description = "The deployment is still rolling out changes to reach the desired state.";
    } else {
      title = "Deployment Status Unknown";
      description = "The state of the deployment could not be determined.";
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
          <AlertTitle>Error loading deployment data</AlertTitle>
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

  // If no deployment data
  if (!deploymentData || !deploymentData.metadata) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTitle>No deployment data available</AlertTitle>
          <AlertDescription>
            The requested deployment was not found or could not be retrieved.
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

  // Calculate deployment status and metrics
  const { status } = getDeploymentStatus();
  const readyReplicas = deploymentData.status?.readyReplicas || 0;
  const totalReplicas = deploymentData.spec?.replicas || 0;
  const updatedReplicas = deploymentData.status?.updatedReplicas || 0;
  const availableReplicas = deploymentData.status?.availableReplicas || 0;
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
              <BreadcrumbLink onClick={() => navigate(`/dashboard/explore/deployments?namespace=${namespace}`)}>Deployments</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink onClick={() => navigate(`/dashboard/explore/namespaces/${namespace}`)}>{namespace}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink>{deploymentData.metadata.name}</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header section */}
        <div className="mb-6">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{deploymentData.metadata.name}</h1>
                <Badge
                  className={`${status === 'Ready'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                    : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'}`}
                >
                  {status}
                </Badge>
              </div>
              <div className="text-gray-500 dark:text-gray-400">
                Namespace: <span onClick={() => navigate(`/dashboard/explore/namespaces/${deploymentData.metadata?.namespace}`)} className="text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">{deploymentData.metadata.namespace}</span>
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
        <DeploymentStatusAlert />

        {deploymentData && (
          <DeletionDialog
            isOpen={showDeleteDialog}
            onClose={() => setShowDeleteDialog(false)}
            onConfirm={confirmResourceDeletion}
            title="Delete Deployment"
            description={`Are you sure you want to delete the deployment "${deploymentData.metadata.name}" in namespace "${deploymentData.metadata.namespace}"? This action cannot be undone.`}
            resourceName={deploymentData.metadata.name as string}
            resourceType="Deployment"
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
          className="space-y-6 bg-transparent">
          <TabsList className="bg-transparent">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="yaml">YAML</TabsTrigger>
            <TabsTrigger value="canvas">Canvas</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="pods">Pods</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 bg-transparent">
            {/* Deployment Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Box className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-medium">Replicas</h3>
                </div>
                <div className="text-2xl font-semibold">
                  {readyReplicas}/{totalReplicas}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Ready/Total
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ChevronsUpDown className="h-4 w-4 text-green-500" />
                  <h3 className="text-sm font-medium">Updated</h3>
                </div>
                <div className="text-2xl font-semibold">
                  {updatedReplicas}/{totalReplicas}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Updated/Total
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4 text-purple-500" />
                  <h3 className="text-sm font-medium">Available</h3>
                </div>
                <div className="text-2xl font-semibold">
                  {availableReplicas}/{totalReplicas}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Available/Total
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
                  Deployment State
                </div>
              </div>
            </div>

            {/* Deployment Properties */}
            <PropertiesViewer
              metadata={deploymentData.metadata}
              kind="Deployment"
              status={status}
              additionalProperties={[
                {
                  label: "Replicas",
                  value: `${readyReplicas}/${totalReplicas} ready`
                },
                {
                  label: "Selector",
                  value: deploymentData.spec?.selector?.matchLabels ? (
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(deploymentData.spec.selector.matchLabels).map(([key, value]) => (
                        <Badge key={key} variant="outline" className="text-xs">
                          {key}: {value}
                        </Badge>
                      ))}
                    </div>
                  ) : 'None'
                },
                {
                  label: "Strategy",
                  value: deploymentData.spec?.strategy?.type || 'RollingUpdate'
                }
              ]}
            />

            {/* Deployment Strategy Details */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
              <h2 className="text-lg font-medium mb-4">Deployment Strategy</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Type:</span>
                    <Badge variant="outline">
                      {deploymentData.spec?.strategy?.type || 'RollingUpdate'}
                    </Badge>
                  </div>

                  {deploymentData.spec?.strategy?.type === 'RollingUpdate' && (
                    <>
                      <div>
                        <span className="font-medium">Max Surge:</span>{' '}
                        {deploymentData.spec?.strategy?.rollingUpdate?.maxSurge || '25%'}
                      </div>
                      <div>
                        <span className="font-medium">Max Unavailable:</span>{' '}
                        {deploymentData.spec?.strategy?.rollingUpdate?.maxUnavailable || '25%'}
                      </div>
                    </>
                  )}
                </div>

                <div className="space-y-2">
                  <div>
                    <span className="font-medium">Revision History Limit:</span>{' '}
                    {deploymentData.spec?.revisionHistoryLimit || 10}
                  </div>
                  <div>
                    <span className="font-medium">Min Ready Seconds:</span>{' '}
                    {deploymentData.spec?.minReadySeconds || 0}
                  </div>
                  <div>
                    <span className="font-medium">Progress Deadline Seconds:</span>{' '}
                    {deploymentData.spec?.progressDeadlineSeconds || 600}
                  </div>
                </div>
              </div>
            </div>

            {/* Deployment Template */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
              <h2 className="text-lg font-medium mb-4">Pod Template</h2>
              <div className="space-y-4">
                {/* Template Labels */}
                <div>
                  <h3 className="text-sm font-medium mb-2">Labels</h3>
                  <div className="flex flex-wrap gap-1">
                    {deploymentData.spec?.template?.metadata?.labels ? (
                      Object.entries(deploymentData.spec.template.metadata.labels).map(([key, value]) => (
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
                    {deploymentData.spec?.template?.spec?.containers.map((container, index) => (
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

            {/* Deployment Conditions */}
            {deploymentData.status?.conditions && deploymentData.status.conditions.length > 0 && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-800/50 bg-white dark:bg-gray-900/30 p-4 mb-6">
                <h2 className="text-lg font-medium mb-4">Conditions</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {deploymentData.status.conditions.map((condition, index) => (
                    <div
                      key={index}
                      className="p-3 rounded-lg border border-gray-200 dark:border-gray-800"
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium">{condition.type}</span>
                        <span className={condition.status === 'True'
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'}>
                          {condition.status}
                        </span>
                      </div>
                      {condition.reason && (
                        <div className="text-sm">
                          <span className="text-gray-500 dark:text-gray-400">Reason: </span>
                          {condition.reason}
                        </div>
                      )}
                      {condition.message && (
                        <div className="text-sm">
                          <span className="text-gray-500 dark:text-gray-400">Message: </span>
                          {condition.message}
                        </div>
                      )}
                      {condition.lastUpdateTime && (
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          Last update: {new Date(condition.lastUpdateTime).toLocaleString()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Deployment Events */}
            <EventsViewer
              events={events}
              resourceName={deploymentData.metadata.name}
              resourceKind="Deployment"
              namespace={deploymentData.metadata.namespace}
            />
          </TabsContent>

          <TabsContent value="yaml" className="space-y-6">
            <ResourceViewerYamlTab
              resourceData={deploymentData}
              namespace={deploymentData.metadata.namespace || ''}
              currentContext={currentContext}
            // resourceType="deployments"
            />
          </TabsContent>

          <TabsContent value="canvas" className="space-y-6">
            <div className="h-[calc(100vh-300px)] min-h-[500px] rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
              {/* <TestCanvas />  */}
              {deploymentData && (
                <ResourceCanvas
                  resourceDetails={{
                    namespace: deploymentData.metadata?.namespace || '',
                    group: 'apps',
                    version: 'v1',
                    resourceType: 'deployments',
                    resourceName: deploymentData.metadata?.name || '',
                  }}
                />
              )}
            </div>
          </TabsContent>

          <TabsContent value="events" className="space-y-6">
            <EventsViewer
              events={events}
              namespace={deploymentData.metadata.namespace}
            />
          </TabsContent>

          <TabsContent value="pods" className="space-y-6">
            {deploymentName && namespace && currentContext && (
              <DeploymentPods
                deploymentName={deploymentName}
                namespace={namespace}
                clusterName={currentContext.name}
                deployment={deploymentData}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default DeploymentViewer;