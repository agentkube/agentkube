import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { V1Pod, CoreV1Event } from '@kubernetes/client-node';
import {
  getResource,
  listResources,
  deleteResource
} from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';
import { useReconMode } from '@/contexts/useRecon';
import { toast } from '@/hooks/use-toast';

// Component imports
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ChevronRight, AlertCircle, Clock, ArrowLeft, Terminal, Trash, BadgeCheck, Image, AlertTriangle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import KUBERNETES_LOGO from '@/assets/kubernetes.svg';
// Custom component imports
import PropertiesViewer from '../components/properties.viewer';
import VolumeViewer from '../components/volume.viewer';
import ContainersViewer from '../components/container.viewer';
import EventsViewer from '../components/event.viewer';
import ContainerLogs from '../components/containerlogs.viewer';
import { DeletionDialog, ResourceViewerYamlTab } from '@/components/custom';
import PodMetricsComponent from '@/components/custom/metrics/pod-metrics.component';
import ImageVulnDrawer from '@/components/custom/imagevulndrawer/imagevulndrawer.component';
import MetricsServerInstallationDialog from '@/components/custom/metrics-server/metricssvrinstallationdialog.component';
import { useTerminal } from '@/contexts/useTerminal';
import { useSearchParams } from 'react-router-dom';

// Define interface for pod data (extending V1Pod with events)
interface PodData extends V1Pod {
  events?: CoreV1Event[];
}

const PodViewer: React.FC = () => {
  const [podData, setPodData] = useState<PodData | null>(null);
  const [events, setEvents] = useState<CoreV1Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const { currentContext, fullWidth, isMetricsServerInstalled, checkMetricsServerStatus } = useCluster();
  const { podName, namespace } = useParams<{ podName: string; namespace: string }>();
  const navigate = useNavigate();
  const { isReconMode } = useReconMode();
  const { openTerminalWithCommand } = useTerminal();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const defaultTab = tabParam || 'overview';
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showImageVulnDrawer, setShowImageVulnDrawer] = useState(false);
  const [isMetricsInstallDialogOpen, setIsMetricsInstallDialogOpen] = useState(false);

  // Fetch events for the pod
  const fetchEvents = async () => {
    if (!currentContext || !namespace || !podName) return;

    try {
      // Fetch events specific to this pod using fieldSelector
      const eventData = await listResources<'events'>(
        currentContext.name,
        'events',
        {
          namespace,
          fieldSelector: `involvedObject.name=${podName},involvedObject.kind=Pod`
        }
      );

      setEvents(eventData);
    } catch (err) {
      console.error('Error fetching events:', err);
    }
  };

  // Fetch pod data and events
  useEffect(() => {
    const fetchPodData = async () => {
      if (!currentContext || !podName || !namespace) {
        setLoading(false);
        setError("Missing required parameters");
        return;
      }

      try {
        setLoading(true);

        // Get pod details
        const data = await getResource<'pods'>(
          currentContext.name,
          'pods',
          podName,
          namespace
        );

        setPodData(data);
        setError(null);

        // Fetch related events
        await fetchEvents();
      } catch (err) {
        console.error('Error fetching pod:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch pod data');
      } finally {
        setLoading(false);
      }
    };

    fetchPodData();
  }, [currentContext, namespace, podName]);

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
    if (!podData || !currentContext) {
      setShowDeleteDialog(false);
      return;
    }

    try {
      setDeleteLoading(true);

      await deleteResource(
        currentContext.name,
        'pods',
        podData.metadata?.name as string,
        {
          namespace: podData.metadata?.namespace
        }
      );

      // Navigate back to the pods list
      navigate('/dashboard/explore/pods');
    } catch (err) {
      console.error('Failed to delete pod:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete pod');
    } finally {
      setDeleteLoading(false);
      setShowDeleteDialog(false);
    }
  };

  const handleOpenShell = () => {
    if (isReconMode) {
      toast({
        title: "Recon Mode",
        description: "This action can't be performed while recon mode is on. Disable recon mode to proceed.",
        variant: "recon"
      });
      return;
    }

    if (!currentContext?.name || !namespace || !podName) return;

    // For the main container if there are multiple
    const containerName = podData?.spec?.containers?.[0]?.name;

    // Remove unnecessary flags that might be causing problems
    // Simplify the command to avoid escaping issues
    const command = `kubectl exec -i -t -n ${namespace} ${podName} ${containerName ? `-c ${containerName}` : ''} -- sh`;

    openTerminalWithCommand(command, `Shell: ${podName}`, true);
  };

  const handleOpenImageVuln = () => {
    setShowImageVulnDrawer(true);
  };

  // Handler function for installing metrics server
  const handleInstallMetricsServer = () => {
    setIsMetricsInstallDialogOpen(true);
  };

  // Handler for when dialog closes - refresh metrics server status
  const handleDialogClose = async (open: boolean) => {
    setIsMetricsInstallDialogOpen(open);

    if (!open) {
      // Dialog is closing - refresh metrics server status and clear metrics error
      try {
        await checkMetricsServerStatus();
        // Clear metrics error to allow metrics component to retry
        setMetricsError(null);
      } catch (error) {
        console.error('Error refreshing metrics after dialog close:', error);
      }
    }
  };

  // Handle refresh data
  const handleRefresh = () => {
    setLoading(true);
    // Refetch data
    if (currentContext && podName && namespace) {
      Promise.all([
        getResource<'pods'>(currentContext.name, 'pods', podName, namespace),
        fetchEvents()
      ]).then(([podData]) => {
        setPodData(podData);
        setLoading(false);
      }).catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to refresh data');
        setLoading(false);
      });
    }
  };


  // Metrics alert component
  const MetricsAlert = () => {
    if (!metricsError) return null;

    return (
      <Alert className="mb-6 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800">
        <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
        <div className='flex items-end justify-between'>
          <div>
            <AlertTitle className="text-yellow-500 dark:text-yellow-500">Metrics Unavailable</AlertTitle>
            <AlertDescription className=" text-yellow-500 dark:text-yellow-400/70 flex items-center justify-between">
              <span>
                {metricsError.includes('not installed')
                  ? 'Metrics server is not installed. Resource usage data is not available.'
                  : `Unable to fetch metrics: ${metricsError}`}
              </span>
            </AlertDescription>
          </div>
          {metricsError.includes('not installed') && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleInstallMetricsServer}
              className="text-yellow-600 border-yellow-300 hover:bg-yellow-100 dark:text-yellow-500 dark:hover:text-yellow-400 dark:border-yellow-700 dark:hover:bg-yellow-900/20"
            >
              Install Metrics Server
            </Button>
          )}
        </div>
      </Alert>
    );
  };

  // Status alert component based on pod phase
  const PodStatusAlert = ({ phase }: { phase?: string }) => {
    if (!phase) return null;

    let alertType: "default" | "info" | "warning" | "destructive" | "success" | null = null;
    let icon = null;
    let title = "";
    let description = "";

    switch (phase.toLowerCase()) {
      case 'running':
        return null; // No alert for running pods
      case 'pending':
        alertType = "warning";
        icon = <Clock className="h-4 w-4" />;
        title = "Pod is Pending";
        description = "The pod has been accepted by the Kubernetes system, but one or more containers are still being prepared.";
        break;
      case 'failed':
        alertType = "destructive";
        icon = <AlertCircle className="h-4 w-4" />;
        title = "Pod Failed";
        description = "At least one container in the pod has terminated with failure.";
        break;
      case 'succeeded':
        alertType = "success";
        icon = <BadgeCheck className="h-4 w-4" />;
        title = "Pod Completed";
        description = "All containers in the pod have terminated successfully and will not be restarted.";
        break;
      case 'unknown':
        alertType = "info";
        icon = <AlertCircle className="h-4 w-4" />;
        title = "Pod Status Unknown";
        description = "The state of the pod could not be determined.";
        break;
    }

    if (!alertType) return null;

    return (
      <Alert variant={alertType} className="mb-6">
        <div className="flex items-center space-x-2">
          {icon && <div className="h-4 w-4">{icon}</div>}
          <h1 className='font-semibold'>{title}</h1>
        </div>
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
          <AlertTitle>Error loading pod data</AlertTitle>
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

  // If no pod data
  if (!podData || !podData.metadata) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTitle>No pod data available</AlertTitle>
          <AlertDescription>
            The requested pod was not found or could not be retrieved.
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

  return (
    <div className='
           max-h-[93vh] overflow-y-auto
          
          [&::-webkit-scrollbar]:w-1.5 
          [&::-webkit-scrollbar-track]:bg-transparent 
          [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50
    '>
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
              <BreadcrumbLink onClick={() => navigate(`/dashboard/explore/pods`)}>Pods</BreadcrumbLink>
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
              <BreadcrumbLink>{podData.metadata.name}</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header section */}
        <div className="mb-6">
          <div className="flex justify-between items-start mb-2">
            <div>
              <h1 className="text-2xl font-bold">{podData.metadata.name}</h1>
              <div className="text-gray-500 dark:text-gray-400">
                Namespace: <span className="text-blue-600 dark:text-blue-400 hover:text-blue-500 hover:underline cursor-pointer" onClick={() => navigate(`/dashboard/explore/namespaces/${podData?.metadata?.namespace}`)}>{podData.metadata.namespace}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleOpenShell}>
                <Terminal className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={handleOpenImageVuln}>
                <Image className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
                <ArrowLeft />
                Back
              </Button>
              <Button variant="outline" size="sm" className='hover:bg-red-600 dark:hover:bg-red-700' onClick={handleDelete}>
                <Trash className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Status alert if needed */}
        <PodStatusAlert phase={podData.status?.phase} />

        {/* Metrics alert if needed */}
        <MetricsAlert />

        {podData && (
          <DeletionDialog
            isOpen={showDeleteDialog}
            onClose={() => setShowDeleteDialog(false)}
            onConfirm={confirmResourceDeletion}
            title="Delete Pod"
            description={`Are you sure you want to delete the pod "${podData.metadata.name}" in namespace "${podData.metadata.namespace}"? This action cannot be undone.`}
            resourceName={podData.metadata.name as string}
            resourceType="Pod"
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
          className="space-y-6" >
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="metrics">Metrics</TabsTrigger>
            <TabsTrigger value="yaml">YAML</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 bg-transparent">
            {/* Pod Properties */}
            <PropertiesViewer
              metadata={podData.metadata}
              kind="Pod"
              status={podData.status?.phase}
              additionalProperties={[
                {
                  label: "Node",
                  value: podData.spec?.nodeName ? (
                    <span className="text-blue-500 hover:text-blue-500 hover:underline cursor-pointer" onClick={() => navigate(`/dashboard/explore/nodes/${podData?.spec?.nodeName}`)}>{podData.spec.nodeName}</span>
                  ) : 'N/A'
                },
                {
                  label: "Pod IP",
                  value: podData.status?.podIP || 'N/A'
                },
                {
                  label: "QoS Class",
                  value: podData.status?.qosClass || 'N/A'
                }
              ]}
            />

            {/* Pod Containers */}
            <ContainersViewer
              containers={podData.spec?.containers || []}
              containerStatuses={podData.status?.containerStatuses}
              initContainers={podData.spec?.initContainers}
              initContainerStatuses={podData.status?.initContainerStatuses}
            />

            {/* Pod Volumes (if any) */}
            {podData.spec?.volumes && podData.spec.volumes.length > 0 && (
              <VolumeViewer volumes={podData.spec.volumes} />
            )}

            {/* Pod Conditions */}
            {podData.status?.conditions && podData.status.conditions.length > 0 && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-800/50 bg-white dark:bg-transparent p-4 mb-6">
                <h2 className="text-lg font-medium mb-4">Conditions</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {podData.status.conditions.map((condition, index) => (
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
                      {condition.lastTransitionTime && (
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          Last transition: {new Date(condition.lastTransitionTime).toLocaleString()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pod-specific Events */}
            <EventsViewer
              events={events}
              resourceName={podData.metadata.name}
              resourceKind="Pod"
              namespace={podData.metadata.namespace}
            />
          </TabsContent>

          <TabsContent value="metrics" className="space-y-6">
            {podName && namespace && currentContext && (
              <PodMetricsComponent
                namespace={namespace}
                podName={podName}
                onError={setMetricsError}
              />
            )}
          </TabsContent>
          <TabsContent value="yaml" className="space-y-6">
            <ResourceViewerYamlTab
              resourceData={podData}
              namespace={podData.metadata.namespace || ''}
              currentContext={currentContext}
              resourceType="pods"
            />
          </TabsContent>

          <TabsContent value="events" className="space-y-6">
            <EventsViewer
              events={events}
              namespace={podData.metadata.namespace}
            />
          </TabsContent>

          <TabsContent value="logs" className="space-y-6">
            {podName && namespace && currentContext && podData?.spec?.containers && (
              <ContainerLogs
                podName={podName}
                namespace={namespace}
                clusterName={currentContext.name}
                containers={podData.spec.containers.map(c => c.name)}
                podData={podData}
              />
            )}
          </TabsContent>
        </Tabs>

        {/* Image Vulnerability Drawer */}
        <ImageVulnDrawer
          isOpen={showImageVulnDrawer}
          onClose={() => setShowImageVulnDrawer(false)}
          podData={podData}
        />

        {/* Metrics Server Installation Dialog */}
        <MetricsServerInstallationDialog
          open={isMetricsInstallDialogOpen}
          onOpenChange={handleDialogClose}
        />
      </div>
    </div>
  );
};

export default PodViewer;