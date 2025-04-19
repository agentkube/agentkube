import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { V1Pod, CoreV1Event } from '@kubernetes/client-node';
import {
  getResource,
  listResources
} from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';

// Component imports
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ChevronRight, Maximize2, LayoutGrid, Flag, Menu, AlertCircle, Clock, ArrowLeft, Terminal } from "lucide-react";
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
import { ResourceViewerYamlTab } from '@/components/custom';
import PodMetricsComponent from '@/components/custom/metrics/pod-metrics.component';
import { runExternalShell } from '@/api/external';
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
  const { currentContext } = useCluster();
  const { podName, namespace } = useParams<{ podName: string; namespace: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const defaultTab = tabParam || 'overview';

  // Fetch events for the pod
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

  const handleOpenShell = async () => {
    try {
      if (!currentContext?.name || !namespace || !podName) return;

      // For the main container if there are multiple
      const containerName = podData?.spec?.containers?.[0]?.name;

      // Remove unnecessary flags that might be causing problems
      // Simplify the command to avoid escaping issues
      const command = `kubectl exec -i -t -n ${namespace} ${podName} ${containerName ? `-c ${containerName}` : ''} -- sh`;

      await runExternalShell(currentContext.name, command);
    } catch (err) {
      console.error('Error opening shell:', err);
      setError(err instanceof Error ? err.message : 'Failed to open shell');
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

  // Status alert component based on pod phase
  const PodStatusAlert = ({ phase }: { phase?: string }) => {
    if (!phase) return null;

    let alertType: "default" | "info" | "warning" | "destructive" | null = null;
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
        alertType = "info";
        title = "Pod Completed";
        description = "All containers in the pod have terminated successfully and will not be restarted.";
        break;
      case 'unknown':
        alertType = "warning";
        icon = <AlertCircle className="h-4 w-4" />;
        title = "Pod Status Unknown";
        description = "The state of the pod could not be determined.";
        break;
    }

    if (!alertType) return null;

    return (
      <Alert variant={alertType as 'default' | 'destructive' | null} className="mb-6">
        {icon && <div className="h-4 w-4">{icon}</div>}
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
           max-h-[92vh] overflow-y-auto
          scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent
          [&::-webkit-scrollbar]:w-1.5 
          [&::-webkit-scrollbar-track]:bg-transparent 
          [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50
    '>
      <div className="p-6 max-w-7xl mx-auto">
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
              <BreadcrumbLink href="/workloads/pods">Pods</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink href={`/workloads/pods/${namespace}`}>{namespace}</BreadcrumbLink>
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
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
                Back
              </Button>
            </div>
          </div>
        </div>

        {/* Status alert if needed */}
        <PodStatusAlert phase={podData.status?.phase} />

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
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
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
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default PodViewer;