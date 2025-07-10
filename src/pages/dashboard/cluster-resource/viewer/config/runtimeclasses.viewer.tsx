import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { V1RuntimeClass, CoreV1Event } from '@kubernetes/client-node';
import { deleteResource, getResource, listResources } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';

// Component imports
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ChevronRight, AlertCircle, Clock, ArrowLeft, RefreshCw, Server, Box, Trash } from "lucide-react";
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
import { DeletionDialog, ResourceViewerYamlTab } from '@/components/custom';

// Define interface for RuntimeClass data with events
interface RuntimeClassData extends V1RuntimeClass {
  events?: CoreV1Event[];
}

const RuntimeClassViewer: React.FC = () => {
  const [runtimeClassData, setRuntimeClassData] = useState<RuntimeClassData | null>(null);
  const [events, setEvents] = useState<CoreV1Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { currentContext, fullWidth } = useCluster();
  const { runtimeClassName } = useParams<{ runtimeClassName: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const defaultTab = tabParam || 'overview';
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Fetch events related to this runtime class
  const fetchEvents = async () => {
    if (!currentContext) return;

    try {
      // Fetch all events in the cluster related to runtime classes
      const eventData = await listResources<'events'>(
        currentContext.name,
        'events',
        {}
      );

      // Filter events for this runtime class
      const filteredEvents = eventData.filter(event => {
        return (
          event.involvedObject?.kind === 'RuntimeClass' &&
          event.involvedObject?.name === runtimeClassName
        );
      });

      setEvents(filteredEvents);
    } catch (err) {
      console.error('Error fetching events:', err);
    }
  };

  // Fetch runtime class data and events
  useEffect(() => {
    const fetchRuntimeClassData = async () => {
      if (!currentContext || !runtimeClassName) {
        setLoading(false);
        setError("Missing required parameters");
        return;
      }

      try {
        setLoading(true);

        // Get runtime class details
        const data = await getResource<'runtimeclasses'>(
          currentContext.name,
          'runtimeclasses',
          runtimeClassName,
          undefined, // runtime classes are cluster-scoped, no namespace
          'node.k8s.io', // API group
          'v1' // API version
        );

        setRuntimeClassData(data as RuntimeClassData);
        setError(null);

        // Fetch related events
        await fetchEvents();
      } catch (err) {
        console.error('Error fetching runtime class:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch runtime class data');
      } finally {
        setLoading(false);
      }
    };

    fetchRuntimeClassData();
  }, [currentContext, runtimeClassName]);


  const handleDelete = () => {
    setShowDeleteDialog(true);
  };

  const confirmResourceDeletion = async () => {
    if (!runtimeClassData || !currentContext) {
      setShowDeleteDialog(false);
      return;
    }

    try {
      setDeleteLoading(true);

      await deleteResource(
        currentContext.name,
        'runtimeclasses',
        runtimeClassData.metadata?.name as string,
        {
          // No namespace parameter since RuntimeClass is cluster-scoped
          apiGroup: 'node.k8s.io' // RuntimeClass is in the node.k8s.io API group
        }
      );

      // Navigate back to the runtime classes list
      navigate('/dashboard/explore/runtimeclasses');
    } catch (err) {
      console.error('Failed to delete runtime class:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete runtime class');
    } finally {
      setDeleteLoading(false);
      setShowDeleteDialog(false);
    }
  };

  // Handle refresh data
  const handleRefresh = () => {
    setLoading(true);
    // Refetch data
    if (currentContext && runtimeClassName) {
      Promise.all([
        getResource<'runtimeclasses'>(
          currentContext.name,
          'runtimeclasses',
          runtimeClassName,
          undefined,
          'node.k8s.io',
          'v1'
        ),
        fetchEvents()
      ]).then(([data]) => {
        setRuntimeClassData(data as RuntimeClassData);
        setLoading(false);
      }).catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to refresh data');
        setLoading(false);
      });
    }
  };

  // Calculate runtime class age
  const getRuntimeClassAge = () => {
    if (!runtimeClassData?.metadata?.creationTimestamp) {
      return 'N/A';
    }

    const creationTime = new Date(runtimeClassData.metadata.creationTimestamp);
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

  // Get handler type
  const getHandlerType = () => {
    if (!runtimeClassData) return 'Unknown';

    // Check for different handler types
    if (runtimeClassData.handler) {
      return 'Container Runtime';
    } else if (runtimeClassData.overhead) {
      return 'Pod Overhead';
    } else if (runtimeClassData.scheduling) {
      return 'Node Scheduling';
    } else {
      return 'Unknown';
    }
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
          <AlertTitle>Error loading runtime class data</AlertTitle>
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

  // If no runtime class data
  if (!runtimeClassData || !runtimeClassData.metadata) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTitle>No runtime class data available</AlertTitle>
          <AlertDescription>
            The requested runtime class was not found or could not be retrieved.
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
              <BreadcrumbLink href="/dashboard/explore/runtimeclasses">Runtime Classes</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink>{runtimeClassData.metadata.name}</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header section */}
        <div className="mb-6">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{runtimeClassData.metadata.name}</h1>
                <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  {getHandlerType()}
                </Badge>
              </div>
              <div className="text-gray-500 dark:text-gray-400 mt-1">
                {runtimeClassData.handler && <span>Handler: <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">{runtimeClassData.handler}</code></span>}
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

        {runtimeClassData && (
          <DeletionDialog
            isOpen={showDeleteDialog}
            onClose={() => setShowDeleteDialog(false)}
            onConfirm={confirmResourceDeletion}
            title="Delete Runtime Class"
            description={`Are you sure you want to delete the runtime class "${runtimeClassData.metadata.name}"? This action cannot be undone.`}
            resourceName={runtimeClassData.metadata.name as string}
            resourceType="RuntimeClass"
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
          </TabsList>

          <TabsContent value="overview" className="space-y-6 bg-transparent">
            {/* RuntimeClass Info Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Server className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-medium">Handler</h3>
                </div>
                <div className="text-lg font-semibold">
                  {runtimeClassData.handler || 'None'}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Container runtime implementation
                </div>
              </div>

              {runtimeClassData.overhead && (
                <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Box className="h-4 w-4 text-purple-500" />
                    <h3 className="text-sm font-medium">Overhead</h3>
                  </div>
                  <div className="text-lg font-semibold">
                    {runtimeClassData.overhead.podFixed ? 'Defined' : 'None'}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Additional resource requirements
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-orange-500" />
                  <h3 className="text-sm font-medium">Age</h3>
                </div>
                <div className="text-lg font-semibold">
                  {getRuntimeClassAge()}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Created {runtimeClassData.metadata.creationTimestamp &&
                    new Date(runtimeClassData.metadata.creationTimestamp).toLocaleString()}
                </div>
              </div>
            </div>


            {/* Overhead section if available */}
            {runtimeClassData.overhead && runtimeClassData.overhead.podFixed && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
                <h2 className="text-lg font-medium mb-4">Pod Overhead</h2>
                <div className="space-y-2">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Pod overhead is defined as the resources consumed by the Pod infrastructure above the sum of
                    container requests & limits.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    {Object.entries(runtimeClassData.overhead.podFixed).map(([resource, value]) => (
                      <div key={resource} className="p-3 rounded-lg border border-gray-200 dark:border-gray-800">
                        <div className="font-medium">{resource}</div>
                        <div className="text-lg">{value}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          Additional resource requirement
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Scheduling section if available */}
            {runtimeClassData.scheduling && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
                <h2 className="text-lg font-medium mb-4">Scheduling Configuration</h2>
                <div className="space-y-4">
                  {runtimeClassData.scheduling.nodeSelector && (
                    <div>
                      <h3 className="text-sm font-medium mb-2">Node Selector</h3>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(runtimeClassData.scheduling.nodeSelector).map(([key, value]) => (
                          <Badge
                            key={key}
                            variant="outline"
                            className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300"
                          >
                            {key}: {value}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {runtimeClassData.scheduling.tolerations && runtimeClassData.scheduling.tolerations.length > 0 && (
                    <div className="mt-4">
                      <h3 className="text-sm font-medium mb-2">Tolerations</h3>
                      <div className="space-y-2">
                        {runtimeClassData.scheduling.tolerations.map((toleration, index) => (
                          <div key={index} className="p-2 rounded-md bg-gray-50 dark:bg-gray-800">
                            <span className="font-medium">{toleration.key}</span>
                            {toleration.operator && <span> {toleration.operator}</span>}
                            {toleration.value && <span> {toleration.value}</span>}
                            {toleration.effect && <span> ({toleration.effect})</span>}
                            {toleration.tolerationSeconds &&
                              <span className="text-sm text-gray-500 dark:text-gray-400"> for {toleration.tolerationSeconds}s</span>
                            }
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* RuntimeClass Properties */}
            <PropertiesViewer
              metadata={runtimeClassData.metadata}
              kind="RuntimeClass"
              additionalProperties={[
                {
                  label: "Handler",
                  value: runtimeClassData.handler || 'None'
                },
                {
                  label: "Overhead Defined",
                  value: runtimeClassData.overhead?.podFixed ? 'Yes' : 'No'
                },
                {
                  label: "Scheduling Configured",
                  value: runtimeClassData.scheduling ? 'Yes' : 'No'
                }
              ]}
            />

            {/* RuntimeClass Events */}
            {events.length > 0 && (
              <EventsViewer
                events={events}
                resourceName={runtimeClassData.metadata.name}
                resourceKind="RuntimeClass"
              />
            )}
          </TabsContent>

          <TabsContent value="yaml" className="space-y-6">
            <ResourceViewerYamlTab
              resourceData={runtimeClassData}
              currentContext={currentContext}
            />
          </TabsContent>

          <TabsContent value="events" className="space-y-6">
            <EventsViewer
              events={events}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default RuntimeClassViewer;