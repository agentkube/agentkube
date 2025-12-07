import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { V1DaemonSet, CoreV1Event } from '@kubernetes/client-node';
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
import { ChevronRight, AlertCircle, Clock, ArrowLeft, RefreshCw, Box, Shield, Layers, Server, Trash, Crosshair } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import KUBERNETES_LOGO from '@/assets/kubernetes.svg';

// Custom component imports
import PropertiesViewer from '../components/properties.viewer';
import EventsViewer from '../components/event.viewer';
import DaemonSetPods from '../components/daemonsetpods.viewer';
import RevisionsViewer from '../components/revisions.viewer';
import { DeletionDialog, ResourceCanvas, ResourceViewerYamlTab } from '@/components/custom';
import { useSearchParams } from 'react-router-dom';

// Define interface for daemonset data (extending V1DaemonSet with events)
interface DaemonSetData extends V1DaemonSet {
  events?: CoreV1Event[];
}

const DaemonSetViewer: React.FC = () => {
  const [daemonSetData, setDaemonSetData] = useState<DaemonSetData | null>(null);
  const [events, setEvents] = useState<CoreV1Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { currentContext, fullWidth } = useCluster();
  const { daemonSetName, namespace } = useParams<{ daemonSetName: string; namespace: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const defaultTab = tabParam || 'overview';
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const { isReconMode } = useReconMode();
  // Get attack path mode from URL params
  const attackPathParam = searchParams.get('attackPath');
  const [attackPathMode, setAttackPathMode] = useState(attackPathParam === 'true');

  // Sync attack path mode with URL parameter
  useEffect(() => {
    const urlAttackPath = searchParams.get('attackPath') === 'true';
    if (urlAttackPath !== attackPathMode) {
      setAttackPathMode(urlAttackPath);
    }
  }, [searchParams, attackPathMode]);

  // Fetch events for the daemonset
  const fetchEvents = async () => {
    if (!currentContext || !namespace || !daemonSetName) return;

    try {
      // Fetch events specific to this daemonset using fieldSelector
      const eventData = await listResources<'events'>(
        currentContext.name,
        'events',
        {
          namespace,
          fieldSelector: `involvedObject.name=${daemonSetName},involvedObject.kind=DaemonSet`
        }
      );

      setEvents(eventData);
    } catch (err) {
      console.error('Error fetching events:', err);
    }
  };

  // Fetch daemonset data and events
  useEffect(() => {
    const fetchDaemonSetData = async () => {
      if (!currentContext || !daemonSetName || !namespace) {
        setLoading(false);
        setError("Missing required parameters");
        return;
      }

      try {
        setLoading(true);

        // Get daemonset details
        const data = await getResource<'daemonsets'>(
          currentContext.name,
          'daemonsets',
          daemonSetName,
          namespace,
          'apps' // API group for daemonsets
        );

        setDaemonSetData(data);
        setError(null);

        // Fetch related events
        await fetchEvents();
      } catch (err) {
        console.error('Error fetching daemonset:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch daemonset data');
      } finally {
        setLoading(false);
      }
    };

    fetchDaemonSetData();
  }, [currentContext, namespace, daemonSetName]);

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
    if (!daemonSetData || !currentContext) {
      setShowDeleteDialog(false);
      return;
    }

    try {
      setDeleteLoading(true);

      await deleteResource(
        currentContext.name,
        'daemonsets',
        daemonSetData.metadata?.name as string,
        {
          namespace: daemonSetData.metadata?.namespace,
          apiGroup: 'apps'
        }
      );

      // Navigate back to the daemonsets list
      navigate('/dashboard/explore/daemonsets');
    } catch (err) {
      console.error('Failed to delete daemonset:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete daemonset');
    } finally {
      setDeleteLoading(false);
      setShowDeleteDialog(false);
    }
  };

  // Handle refresh data
  const handleRefresh = () => {
    setLoading(true);
    // Refetch data
    if (currentContext && daemonSetName && namespace) {
      Promise.all([
        getResource<'daemonsets'>(
          currentContext.name,
          'daemonsets',
          daemonSetName,
          namespace,
          'apps'
        ),
        fetchEvents()
      ]).then(([data]) => {
        setDaemonSetData(data);
        setLoading(false);
      }).catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to refresh data');
        setLoading(false);
      });
    }
  };

  // Get daemonset status
  const getDaemonSetStatus = () => {
    if (!daemonSetData || !daemonSetData.status) {
      return { status: 'Unknown', isReady: false };
    }

    const currentNumber = daemonSetData.status.currentNumberScheduled || 0;
    const desiredNumber = daemonSetData.status.desiredNumberScheduled || 0;
    const readyNumber = daemonSetData.status.numberReady || 0;
    const availableNumber = daemonSetData.status.numberAvailable || 0;

    // Check if all the following conditions are true:
    // - All nodes are running the daemon pod
    // - All daemon pods are ready
    // - All daemon pods are available 
    if (currentNumber < desiredNumber || readyNumber < desiredNumber || availableNumber < desiredNumber) {
      return { status: 'Progressing', isReady: false };
    }

    // All good
    return { status: 'Ready', isReady: true };
  };

  // Status alert component based on daemonset status
  const DaemonSetStatusAlert = () => {
    const { status, isReady } = getDaemonSetStatus();

    if (isReady) return null; // No alert for ready daemonsets

    let alertType: "default" | "info" | "warning" | "destructive" | null = "warning";
    let icon = <Clock className="h-4 w-4" />;
    let title = "";
    let description = "";

    if (status === 'Progressing') {
      title = "DaemonSet is Progressing";
      description = "The daemonset is still rolling out pods to nodes or waiting for nodes to become ready.";
    } else {
      title = "DaemonSet Status Unknown";
      description = "The state of the daemonset could not be determined.";
    }

    return (
      <Alert className="mb-6 dark:text-yellow-600 bg-orange-700/10 dark:bg-orange-700/10 border border-yellow-200 dark:border-yellow-800">
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
          <AlertTitle>Error loading daemonset data</AlertTitle>
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

  // If no daemonset data
  if (!daemonSetData || !daemonSetData.metadata) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTitle>No daemonset data available</AlertTitle>
          <AlertDescription>
            The requested daemonset was not found or could not be retrieved.
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

  // Calculate daemonset status and metrics
  const { status } = getDaemonSetStatus();
  const currentNumber = daemonSetData.status?.currentNumberScheduled || 0;
  const desiredNumber = daemonSetData.status?.desiredNumberScheduled || 0;
  const readyNumber = daemonSetData.status?.numberReady || 0;
  const availableNumber = daemonSetData.status?.numberAvailable || 0;
  const unavailableNumber = daemonSetData.status?.numberUnavailable || 0;
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
              <BreadcrumbLink href="/dashboard/explore/daemonsets">DaemonSets</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink href={`/dashboard/explore/daemonsets?namespace=${namespace}`}>{namespace}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink>{daemonSetData.metadata.name}</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header section */}
        <div className="mb-6">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{daemonSetData.metadata.name}</h1>
                <Badge
                  className={`${status === 'Ready'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                    : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'}`}
                >
                  {status}
                </Badge>
              </div>
              <div className="text-gray-500 dark:text-gray-400">
                Namespace: <span onClick={() => navigate(`/dashboard/explore/namespaces/${daemonSetData.metadata?.namespace}`)} className="text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">{daemonSetData.metadata.namespace}</span>
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
        <DaemonSetStatusAlert />

        {daemonSetData && (
          <DeletionDialog
            isOpen={showDeleteDialog}
            onClose={() => setShowDeleteDialog(false)}
            onConfirm={confirmResourceDeletion}
            title="Delete DaemonSet"
            description={`Are you sure you want to delete the daemonset "${daemonSetData.metadata.name}" in namespace "${daemonSetData.metadata.namespace}"? This action cannot be undone.`}
            resourceName={daemonSetData.metadata.name as string}
            resourceType="DaemonSet"
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
          <div className='flex justify-between items-center'>
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="yaml">YAML</TabsTrigger>
              <TabsTrigger value="canvas">Canvas</TabsTrigger>
              <TabsTrigger value="events">Events</TabsTrigger>
              <TabsTrigger value="pods">Pods</TabsTrigger>
              <TabsTrigger value="revisions">Revisions</TabsTrigger>
            </TabsList>

            {defaultTab === 'canvas' && (
              <Button
                variant={attackPathMode ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  const newAttackPathMode = !attackPathMode;
                  setAttackPathMode(newAttackPathMode);
                  setSearchParams(params => {
                    if (newAttackPathMode) {
                      params.set('attackPath', 'true');
                    } else {
                      params.delete('attackPath');
                    }
                    return params;
                  });
                }}
                className={`ml-2 h-9 ${attackPathMode ? 'bg-orange-500/20 dark:bg-orange-700/20 text-orange-500 dark:text-orange-400 border-none' : ''}`}
                title={attackPathMode ? "Disable Attack Path Analysis" : "Enable Attack Path Analysis"}
              >
                <Crosshair className="h-4 w-4 mr-1.5" />
                Attack Path
              </Button>
            )}
          </div>

          <TabsContent value="overview" className="space-y-2 bg-transparent">
            {/* DaemonSet Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <div className="rounded-lg border border-gray-200 dark:border-accent/50 bg-white dark:bg-transparent p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Server className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-medium">Scheduled</h3>
                </div>
                <div className="text-4xl font-light">
                  {currentNumber}/{desiredNumber}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Current/Desired
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-accent/50 bg-white dark:bg-transparent p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Box className="h-4 w-4 text-green-500" />
                  <h3 className="text-sm font-medium">Ready</h3>
                </div>
                <div className="text-4xl font-light">
                  {readyNumber}/{desiredNumber}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Ready/Desired
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-accent/50 bg-white dark:bg-transparent p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4 text-purple-500" />
                  <h3 className="text-sm font-medium">Available</h3>
                </div>
                <div className="text-4xl font-light">
                  {availableNumber}/{desiredNumber}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Available/Desired
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-accent/50 bg-white dark:bg-transparent p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-orange-500" />
                  <h3 className="text-sm font-medium">Status</h3>
                </div>
                <div className={`text-4xl font-light ${statusColor}`}>
                  {status}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  DaemonSet State
                </div>
              </div>
            </div>

            {/* DaemonSet Scheduling Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="rounded-lg border border-gray-200 dark:border-accent/50 bg-white dark:bg-transparent p-4">
                <div className={`text-4xl font-light ${daemonSetData.status?.numberMisscheduled ? "text-red-500 " : ""} `}>
                  {daemonSetData.status?.numberMisscheduled || 0}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Misscheduled</div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-accent/50 bg-white dark:bg-transparent p-4">
                <div className={`text-4xl font-light ${unavailableNumber ? "text-red-500 font-medium" : ""}`}>
                  {unavailableNumber}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Unavailable</div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-accent/50 bg-white dark:bg-transparent p-4">
                <div className='text-4xl font-light'>
                  {daemonSetData.status?.updatedNumberScheduled || 0}/{desiredNumber}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Updated</div>
              </div>
            </div>

            {/* DaemonSet Properties */}
            <PropertiesViewer
              metadata={daemonSetData.metadata}
              kind="DaemonSet"
              status={status}
              additionalProperties={[
                {
                  label: "Node Selector",
                  value: daemonSetData.spec?.template?.spec?.nodeSelector ? (
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(daemonSetData.spec.template.spec.nodeSelector).map(([key, value]) => (
                        <Badge key={key} variant="outline" className="text-xs">
                          {key}: {value}
                        </Badge>
                      ))}
                    </div>
                  ) : 'None (runs on all nodes)'
                },
                {
                  label: "Update Strategy",
                  value: daemonSetData.spec?.updateStrategy?.type || 'RollingUpdate'
                },
                {
                  label: "Selector",
                  value: daemonSetData.spec?.selector?.matchLabels ? (
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(daemonSetData.spec.selector.matchLabels).map(([key, value]) => (
                        <Badge key={key} variant="outline" className="text-xs">
                          {key}: {value}
                        </Badge>
                      ))}
                    </div>
                  ) : 'None'
                }
              ]}
            />

            {/* DaemonSet Update Strategy */}
            <div className="rounded-lg border border-gray-200 dark:border-accent/50 bg-white dark:bg-gray-900/30 p-4 mb-6">
              <h2 className="text-lg font-medium mb-4">Update Strategy</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Type:</span>
                    <Badge variant="outline">
                      {daemonSetData.spec?.updateStrategy?.type || 'RollingUpdate'}
                    </Badge>
                  </div>

                  {daemonSetData.spec?.updateStrategy?.type === 'RollingUpdate' && (
                    <div>
                      <span className="font-medium">Max Unavailable:</span>{' '}
                      {daemonSetData.spec?.updateStrategy?.rollingUpdate?.maxUnavailable || '1'}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div>
                    <span className="font-medium">Revision History Limit:</span>{' '}
                    {daemonSetData.spec?.revisionHistoryLimit || 10}
                  </div>
                  <div>
                    <span className="font-medium">Min Ready Seconds:</span>{' '}
                    {daemonSetData.spec?.minReadySeconds || 0}
                  </div>
                </div>
              </div>
            </div>

            {/* Pod Template */}
            <div className="rounded-lg border border-gray-200 dark:border-accent/50 bg-white dark:bg-gray-900/30 p-4 mb-6">
              <h2 className="text-lg font-medium mb-4">Pod Template</h2>
              <div className="space-y-4">
                {/* Template Labels */}
                <div>
                  <h3 className="text-sm font-medium mb-2">Labels</h3>
                  <div className="flex flex-wrap gap-1">
                    {daemonSetData.spec?.template?.metadata?.labels ? (
                      Object.entries(daemonSetData.spec.template.metadata.labels).map(([key, value]) => (
                        <Badge
                          key={key}
                          variant="outline"
                          className="bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-accent/50 text-xs"
                        >
                          {key}: {value}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-gray-500 dark:text-gray-400">No labels</span>
                    )}
                  </div>
                </div>

                {/* Node Scheduling */}
                {(daemonSetData.spec?.template?.spec?.nodeSelector ||
                  daemonSetData.spec?.template?.spec?.affinity ||
                  daemonSetData.spec?.template?.spec?.tolerations) && (
                    <div>
                      <h3 className="text-sm font-medium mb-2">Node Scheduling</h3>
                      <div className="space-y-2">
                        {daemonSetData.spec?.template?.spec?.nodeSelector && (
                          <div>
                            <div className="font-medium text-xs mb-1">Node Selector:</div>
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(daemonSetData.spec.template.spec.nodeSelector).map(([key, value]) => (
                                <Badge key={key} variant="outline" className="text-xs">
                                  {key}: {value}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {daemonSetData.spec?.template?.spec?.tolerations && (
                          <div>
                            <div className="font-medium text-xs mb-1">Tolerations:</div>
                            <div className="flex flex-wrap gap-1">
                              {daemonSetData.spec.template.spec.tolerations.map((toleration, idx) => (
                                <Badge key={idx} variant="outline" className="text-xs">
                                  {toleration.key}: {toleration.operator} {toleration.value || ''}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                {/* Template Containers */}
                <div>
                  <h3 className="text-sm font-medium mb-2">Containers</h3>
                  <div className="space-y-2">
                    {daemonSetData.spec?.template?.spec?.containers.map((container, index) => (
                      <div
                        key={container.name}
                        className="p-3 rounded-lg border border-gray-200 dark:border-accent/50"
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
            {daemonSetData.spec?.template?.spec?.volumes && daemonSetData.spec.template.spec.volumes.length > 0 && (
              <div className="rounded-lg border border-gray-200 dark:border-accent/50 bg-white dark:bg-gray-900/30 p-4 mb-6">
                <h2 className="text-lg font-medium mb-4">Volumes</h2>
                <div className="space-y-3">
                  {daemonSetData.spec.template.spec.volumes.map((volume, index) => (
                    <div key={index} className="p-3 rounded-lg border border-gray-200 dark:border-accent/50">
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

            {/* DaemonSet Events */}
            <EventsViewer
              events={events}
              resourceName={daemonSetData.metadata.name}
              resourceKind="DaemonSet"
              namespace={daemonSetData.metadata.namespace}
            />
          </TabsContent>

          <TabsContent value="yaml" className="space-y-6">
            <ResourceViewerYamlTab
              resourceData={daemonSetData}
              namespace={daemonSetData.metadata.namespace || ''}
              currentContext={currentContext}
            />
          </TabsContent>

          <TabsContent value="canvas" className="space-y-6">
            <div className="h-[calc(100vh-300px)] min-h-[500px] rounded-lg border border-gray-200 dark:border-accent/50 overflow-hidden">
              {daemonSetData && (
                <ResourceCanvas
                  resourceDetails={{
                    namespace: daemonSetData.metadata?.namespace || '',
                    group: 'apps',
                    version: 'v1',
                    resourceType: 'daemonsets',
                    resourceName: daemonSetData.metadata?.name || '',
                  }}
                  attackPath={attackPathMode}
                />
              )}
            </div>
          </TabsContent>

          <TabsContent value="events" className="space-y-6">
            <EventsViewer
              events={events}
              namespace={daemonSetData.metadata.namespace}
            />
          </TabsContent>

          <TabsContent value="pods" className="space-y-6">
            {
              daemonSetName && namespace && currentContext && (
                <DaemonSetPods
                  daemonSetName={daemonSetName}
                  namespace={namespace}
                  clusterName={currentContext.name}
                  daemonSet={daemonSetData}
                />
              )
            }
          </TabsContent>

          <TabsContent value="revisions" className="space-y-6">
            {daemonSetName && namespace && currentContext && (
              <RevisionsViewer
                clusterName={currentContext.name}
                namespace={namespace}
                resourceType="daemonset"
                resourceName={daemonSetName}
                labels={daemonSetData.spec?.selector?.matchLabels}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default DaemonSetViewer;