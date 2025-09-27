import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { V1ReplicaSet, CoreV1Event } from '@kubernetes/client-node';
import {
  deleteResource,
  getResource,
  listResources
} from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';
import { useReconMode } from '@/contexts/useRecon';
import { toast } from '@/hooks/use-toast';

// Component imports
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ChevronRight, AlertCircle, Clock, ArrowLeft, RefreshCw, Box, Shield, Copy, Trash } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import KUBERNETES_LOGO from '@/assets/kubernetes.svg';

// Custom component imports
import PropertiesViewer from '../components/properties.viewer';
import EventsViewer from '../components/event.viewer';
import ReplicaSetPods from '../components/replicasetpods.viewer';
import { DeletionDialog, ResourceViewerYamlTab } from '@/components/custom';
import { useSearchParams } from 'react-router-dom';

// Define interface for replicaset data (extending V1ReplicaSet with events)
interface ReplicaSetData extends V1ReplicaSet {
  events?: CoreV1Event[];
}

const ReplicaSetViewer: React.FC = () => {
  const [replicaSetData, setReplicaSetData] = useState<ReplicaSetData | null>(null);
  const [events, setEvents] = useState<CoreV1Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { currentContext, fullWidth } = useCluster();
  const { replicaSetName, namespace } = useParams<{ replicaSetName: string; namespace: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const defaultTab = tabParam || 'overview';
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const { isReconMode } = useReconMode();

  // Fetch events for the replicaset
  const fetchEvents = async () => {
    if (!currentContext || !namespace || !replicaSetName) return;
  
    try {
      // Fetch events specific to this replicaset using fieldSelector
      const eventData = await listResources<'events'>(
        currentContext.name,
        'events',
        { 
          namespace,
          fieldSelector: `involvedObject.name=${replicaSetName},involvedObject.kind=ReplicaSet`
        }
      );
  
      setEvents(eventData);
    } catch (err) {
      console.error('Error fetching events:', err);
    }
  };

  // Fetch replicaset data and events
  useEffect(() => {
    const fetchReplicaSetData = async () => {
      if (!currentContext || !replicaSetName || !namespace) {
        setLoading(false);
        setError("Missing required parameters");
        return;
      }

      try {
        setLoading(true);

        // Get replicaset details
        const data = await getResource<'replicasets'>(
          currentContext.name,
          'replicasets',
          replicaSetName,
          namespace,
          'apps' // API group for replicasets
        );

        setReplicaSetData(data);
        setError(null);

        // Fetch related events
        await fetchEvents();
      } catch (err) {
        console.error('Error fetching replicaset:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch replicaset data');
      } finally {
        setLoading(false);
      }
    };

    fetchReplicaSetData();
  }, [currentContext, namespace, replicaSetName]);

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
    if (!replicaSetData || !currentContext) {
      setShowDeleteDialog(false);
      return;
    }

    try {
      setDeleteLoading(true);

      await deleteResource(
        currentContext.name,
        'replicasets',
        replicaSetData.metadata?.name as string,
        {
          namespace: replicaSetData.metadata?.namespace,
          apiGroup: 'apps'
        }
      );

      // Navigate back to the replicasets list
      navigate('/dashboard/explore/replicasets');
    } catch (err) {
      console.error('Failed to delete replicaset:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete replicaset');
    } finally {
      setDeleteLoading(false);
      setShowDeleteDialog(false);
    }
  };
  // Handle refresh data
  const handleRefresh = () => {
    setLoading(true);
    // Refetch data
    if (currentContext && replicaSetName && namespace) {
      Promise.all([
        getResource<'replicasets'>(
          currentContext.name,
          'replicasets',
          replicaSetName,
          namespace,
          'apps'
        ),
        fetchEvents()
      ]).then(([data]) => {
        setReplicaSetData(data);
        setLoading(false);
      }).catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to refresh data');
        setLoading(false);
      });
    }
  };

  // Get replicaset status
  const getReplicaSetStatus = () => {
    if (!replicaSetData || !replicaSetData.status) {
      return { status: 'Unknown', isReady: false };
    }

    const desiredReplicas = replicaSetData.spec?.replicas || 0;
    const availableReplicas = replicaSetData.status.availableReplicas || 0;
    const readyReplicas = replicaSetData.status.readyReplicas || 0;
    const fullyLabeledReplicas = replicaSetData.status.fullyLabeledReplicas || 0;

    // Check if all pods are available and ready
    if (availableReplicas < desiredReplicas || readyReplicas < desiredReplicas) {
      return { status: 'Progressing', isReady: false };
    }

    // All good
    return { status: 'Ready', isReady: true };
  };

  // Status alert component based on replicaset status
  const ReplicaSetStatusAlert = () => {
    const { status, isReady } = getReplicaSetStatus();

    if (isReady) return null; // No alert for ready replicasets

    let alertType: "default" | "info" | "warning" | "destructive" | null = "warning";
    let icon = <Clock className="h-4 w-4" />;
    let title = "";
    let description = "";

    if (status === 'Progressing') {
      title = "ReplicaSet is Progressing";
      description = "The ReplicaSet is still creating pods or waiting for them to become ready.";
    } else {
      title = "ReplicaSet Status Unknown";
      description = "The state of the ReplicaSet could not be determined.";
    }

    return (
      <Alert className="mb-6 bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-yellow-800">
        {icon}
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{description}</AlertDescription>
      </Alert>
    );
  };

  // Helper function to find owner reference (usually a Deployment)
  const findOwnerReference = () => {
    if (!replicaSetData?.metadata?.ownerReferences) return null;

    const deploymentOwner = replicaSetData.metadata.ownerReferences.find(
      ref => ref.kind === 'Deployment'
    );

    return deploymentOwner;
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
          <AlertTitle>Error loading replicaset data</AlertTitle>
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

  // If no replicaset data
  if (!replicaSetData || !replicaSetData.metadata) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTitle>No replicaset data available</AlertTitle>
          <AlertDescription>
            The requested replicaset was not found or could not be retrieved.
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

  // Calculate replicaset status and metrics
  const { status } = getReplicaSetStatus();
  const desiredReplicas = replicaSetData.spec?.replicas || 0;
  const availableReplicas = replicaSetData.status?.availableReplicas || 0;
  const readyReplicas = replicaSetData.status?.readyReplicas || 0;
  const fullyLabeledReplicas = replicaSetData.status?.fullyLabeledReplicas || 0;
  const ownerRef = findOwnerReference();
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
              <BreadcrumbLink href="/dashboard/explore/replicasets">ReplicaSets</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink href={`/dashboard/explore/replicasets?namespace=${namespace}`}>{namespace}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink>{replicaSetData.metadata.name}</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header section */}
        <div className="mb-6">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{replicaSetData.metadata.name}</h1>
                <Badge
                  className={`${status === 'Ready'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                    : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'}`}
                >
                  {status}
                </Badge>
              </div>
              <div className="text-gray-500 dark:text-gray-400">
                Namespace: <span onClick={() => navigate(`/dashboard/explore/namespaces/${replicaSetData.metadata?.namespace}`)} className="text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">{replicaSetData.metadata.namespace}</span>
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

        {/* Owner Reference section (if this is managed by a Deployment) */}
        {ownerRef && (
          <Alert className="mb-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <AlertTitle className="flex items-center gap-2">
              <Copy className="h-4 w-4" />
              Managed by Deployment
            </AlertTitle>
            <AlertDescription>
              This ReplicaSet is managed by Deployment{' '}
              <Button
                variant="link"
                className="p-0 h-auto font-medium text-blue-600 dark:text-blue-400 hover:underline"
                onClick={() => navigate(`/dashboard/explore/deployments/${namespace}/${ownerRef.name}`)}
              >
                {ownerRef.name}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Status alert if needed */}
        <ReplicaSetStatusAlert />

        {replicaSetData && (
          <DeletionDialog
            isOpen={showDeleteDialog}
            onClose={() => setShowDeleteDialog(false)}
            onConfirm={confirmResourceDeletion}
            title="Delete ReplicaSet"
            description={`Are you sure you want to delete the replicaset "${replicaSetData.metadata.name}" in namespace "${replicaSetData.metadata.namespace}"? This action cannot be undone.`}
            resourceName={replicaSetData.metadata.name as string}
            resourceType="ReplicaSet"
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
            {/* ReplicaSet Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-transparent p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Box className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-medium">Replicas</h3>
                </div>
                <div className="text-4xl font-light ">
                  {readyReplicas}/{desiredReplicas}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Ready/Desired
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-transparent p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Copy className="h-4 w-4 text-purple-500" />
                  <h3 className="text-sm font-medium">Available</h3>
                </div>
                <div className="text-4xl font-light ">
                  {availableReplicas}/{desiredReplicas}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Available/Desired
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-transparent p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4 text-green-500" />
                  <h3 className="text-sm font-medium">Labeled</h3>
                </div>
                <div className="text-4xl font-light ">
                  {fullyLabeledReplicas}/{desiredReplicas}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Labeled/Desired
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-transparent p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-orange-500" />
                  <h3 className="text-sm font-medium">Status</h3>
                </div>
                <div className={`text-4xl font-light  ${statusColor}`}>
                  {status}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  ReplicaSet State
                </div>
              </div>
            </div>

            {/* ReplicaSet Properties */}
            <PropertiesViewer
              metadata={replicaSetData.metadata}
              kind="ReplicaSet"
              status={status}
              additionalProperties={[
                {
                  label: "Replicas",
                  value: `${readyReplicas}/${desiredReplicas} ready`
                },
                {
                  label: "Selector",
                  value: replicaSetData.spec?.selector?.matchLabels ? (
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(replicaSetData.spec.selector.matchLabels).map(([key, value]) => (
                        <Badge key={key} variant="outline" className="text-xs">
                          {key}: {value}
                        </Badge>
                      ))}
                    </div>
                  ) : 'None'
                },
                {
                  label: "Controlled By",
                  value: ownerRef ? (
                    <Button
                      variant="link"
                      className="p-0 h-auto font-medium text-blue-600 dark:text-blue-400 hover:underline"
                      onClick={() => navigate(`/dashboard/explore/deployments/${namespace}/${ownerRef.name}`)}
                    >
                      {ownerRef.kind}/{ownerRef.name}
                    </Button>
                  ) : 'None'
                }
              ]}
            />

            {/* Pod Template */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-transparent p-4 mb-6">
              <h2 className="text-lg font-medium mb-4">Pod Template</h2>
              <div className="space-y-4">
                {/* Template Labels */}
                <div>
                  <h3 className="text-sm font-medium mb-2">Labels</h3>
                  <div className="flex flex-wrap gap-1">
                    {replicaSetData.spec?.template?.metadata?.labels ? (
                      Object.entries(replicaSetData.spec.template.metadata.labels).map(([key, value]) => (
                        <Badge
                          key={key}
                          variant="outline"
                          className="text-xs font-normal px-2 py-1 bg-gray-100 dark:bg-gray-800/30 border border-gray-200 dark:border-gray-800"
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
                    {replicaSetData.spec?.template?.spec?.containers.map((container, index) => (
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
            {replicaSetData.spec?.template?.spec?.volumes && replicaSetData.spec.template.spec.volumes.length > 0 && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-transparent p-4 mb-6">
                <h2 className="text-lg font-medium mb-4">Volumes</h2>
                <div className="space-y-3">
                  {replicaSetData.spec.template.spec.volumes.map((volume, index) => (
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

            {/* ReplicaSet Events */}
            <EventsViewer
              events={events}
              resourceName={replicaSetData.metadata.name}
              resourceKind="ReplicaSet"
              namespace={replicaSetData.metadata.namespace}
            />
          </TabsContent>

          <TabsContent value="yaml" className="space-y-6">
            <ResourceViewerYamlTab
              resourceData={replicaSetData}
              namespace={replicaSetData.metadata.namespace || ''}
              currentContext={currentContext}
            />
          </TabsContent>

          <TabsContent value="events" className="space-y-6">
            <EventsViewer
              events={events}
              namespace={replicaSetData.metadata.namespace}
            />
          </TabsContent>

          <TabsContent value="pods" className="space-y-6">
            {
              replicaSetName && namespace && currentContext && (
                <ReplicaSetPods
                  replicaSetName={replicaSetName}
                  namespace={namespace}
                  clusterName={currentContext.name}
                  replicaSet={replicaSetData}
                />
              )
            }
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default ReplicaSetViewer;