import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { V1PriorityClass, CoreV1Event } from '@kubernetes/client-node';
import { deleteResource, getResource, listResources } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';

// Component imports
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ChevronRight, AlertCircle, Clock, ArrowLeft, RefreshCw, ArrowUpDown, Info, Trash } from "lucide-react";
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

// Define interface for PriorityClass data with events
interface PriorityClassData extends V1PriorityClass {
  events?: CoreV1Event[];
}

const PriorityClassViewer: React.FC = () => {
  const [pcData, setPCData] = useState<PriorityClassData | null>(null);
  const [events, setEvents] = useState<CoreV1Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { currentContext, fullWidth } = useCluster();
  const { priorityClassName } = useParams<{ priorityClassName: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const defaultTab = tabParam || 'overview';
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Fetch events related to this priority class
  const fetchEvents = async () => {
    if (!currentContext) return;

    try {
      // Fetch all events in the cluster related to priority classes
      const eventData = await listResources<'events'>(
        currentContext.name,
        'events',
        {}
      );

      // Filter events for this priority class
      const filteredEvents = eventData.filter(event => {
        return (
          event.involvedObject?.kind === 'PriorityClass' &&
          event.involvedObject?.name === priorityClassName
        );
      });

      setEvents(filteredEvents);
    } catch (err) {
      console.error('Error fetching events:', err);
    }
  };

  // Fetch priority class data and events
  useEffect(() => {
    const fetchPriorityClassData = async () => {
      if (!currentContext || !priorityClassName) {
        setLoading(false);
        setError("Missing required parameters");
        return;
      }

      try {
        setLoading(true);

        // Get priority class details
        const data = await getResource<'priorityclasses'>(
          currentContext.name,
          'priorityclasses',
          priorityClassName,
          undefined, // priority classes are cluster-scoped, no namespace
          'scheduling.k8s.io', // API group
          'v1' // API version
        );

        setPCData(data as PriorityClassData);
        setError(null);

        // Fetch related events
        await fetchEvents();
      } catch (err) {
        console.error('Error fetching priority class:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch priority class data');
      } finally {
        setLoading(false);
      }
    };

    fetchPriorityClassData();
  }, [currentContext, priorityClassName]);

  const handleDelete = () => {
    setShowDeleteDialog(true);
  };

  const confirmResourceDeletion = async () => {
    if (!pcData || !currentContext) {
      setShowDeleteDialog(false);
      return;
    }

    try {
      setDeleteLoading(true);

      await deleteResource(
        currentContext.name,
        'priorityclasses',
        pcData.metadata?.name as string,
        {
          // No namespace parameter since PriorityClass is cluster-scoped
          apiGroup: 'scheduling.k8s.io' // PriorityClass is in the scheduling.k8s.io API group
        }
      );

      // Navigate back to the priority classes list
      navigate('/dashboard/explore/priorityclasses');
    } catch (err) {
      console.error('Failed to delete priority class:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete priority class');
    } finally {
      setDeleteLoading(false);
      setShowDeleteDialog(false);
    }
  };

  // Handle refresh data
  const handleRefresh = () => {
    setLoading(true);
    // Refetch data
    if (currentContext && priorityClassName) {
      Promise.all([
        getResource<'priorityclasses'>(
          currentContext.name,
          'priorityclasses',
          priorityClassName,
          undefined,
          'scheduling.k8s.io',
          'v1'
        ),
        fetchEvents()
      ]).then(([data]) => {
        setPCData(data as PriorityClassData);
        setLoading(false);
      }).catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to refresh data');
        setLoading(false);
      });
    }
  };

  // Calculate priority class age
  const getPriorityClassAge = () => {
    if (!pcData?.metadata?.creationTimestamp) {
      return 'N/A';
    }

    const creationTime = new Date(pcData.metadata.creationTimestamp);
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

  // Get a color class based on the priority value
  const getPriorityColorClass = (value: number | undefined): string => {
    if (value === undefined) return 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300';

    if (value >= 1000000) {
      return 'bg-red-200 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    } else if (value >= 10000) {
      return 'bg-yellow-200 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
    } else if (value >= 0) {
      return 'bg-green-200 text-green-800 dark:bg-green-900/30 dark:text-green-400';
    } else {
      return 'bg-purple-200 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
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
          <AlertTitle>Error loading priority class data</AlertTitle>
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

  // If no priority class data
  if (!pcData || !pcData.metadata) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTitle>No priority class data available</AlertTitle>
          <AlertDescription>
            The requested priority class was not found or could not be retrieved.
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
              <BreadcrumbLink href="/dashboard/explore/priorityclasses">Priority Classes</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink>{pcData.metadata.name}</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header section */}
        <div className="mb-6">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{pcData.metadata.name}</h1>
                <span className={`px-2 py-1 rounded-[0.3rem] text-xs font-medium ${getPriorityColorClass(pcData.value)}`}>
                  Priority: {pcData.value}
                </span>
                {pcData.globalDefault && (
                  <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                    Default
                  </Badge>
                )}
              </div>
              <div className="text-gray-500 dark:text-gray-400 mt-1">
                {pcData.description || 'No description provided'}
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

        {pcData && (
          <DeletionDialog
            isOpen={showDeleteDialog}
            onClose={() => setShowDeleteDialog(false)}
            onConfirm={confirmResourceDeletion}
            title="Delete Priority Class"
            description={`Are you sure you want to delete the priority class "${pcData.metadata.name}"? This action cannot be undone.`}
            resourceName={pcData.metadata.name as string}
            resourceType="PriorityClass"
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
          }} className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="yaml">YAML</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 bg-transparent">
            {/* Priority Class Info Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ArrowUpDown className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-medium">Priority Value</h3>
                </div>
                <div className="text-2xl font-semibold">
                  {pcData.value}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Determines pod scheduling priority
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Info className="h-4 w-4 text-purple-500" />
                  <h3 className="text-sm font-medium">Preemption Policy</h3>
                </div>
                <div className="text-lg font-semibold">
                  {pcData.preemptionPolicy || 'PreemptLowerPriority'}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Controls pod preemption behavior
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-orange-500" />
                  <h3 className="text-sm font-medium">Age</h3>
                </div>
                <div className="text-2xl font-semibold">
                  {getPriorityClassAge()}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Created {pcData.metadata.creationTimestamp &&
                    new Date(pcData.metadata.creationTimestamp).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Global Default Info */}
            {pcData.globalDefault && (
              <Alert className="mb-6 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800">
                <Info className="h-4 w-4 text-blue-500 dark:text-blue-400" />
                <AlertTitle>Default Priority Class</AlertTitle>
                <AlertDescription>
                  This is the default priority class for the cluster. Pods without an explicitly defined priority class will use this class.
                </AlertDescription>
              </Alert>
            )}

            {/* Priority Explanation */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
              <h2 className="text-lg font-medium mb-2">About Priority</h2>
              <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                <p>
                  Priority indicates the importance of a Pod relative to other Pods.
                  Pods with higher priority values are scheduled ahead of Pods with lower priority values.
                </p>
                {pcData.value !== undefined && pcData.value >= 1000000 && (
                  <p className="text-red-600 dark:text-red-400 font-medium">
                    This priority class has a value ≥ 1,000,000, making it a system-critical priority.
                    System-critical Pods are exempt from eviction.
                  </p>
                )}
                {pcData.preemptionPolicy === 'Never' && (
                  <p className="font-medium">
                    This priority class has preemption disabled. Pods using this class will not preempt lower-priority Pods,
                    even when resources are constrained.
                  </p>
                )}
              </div>
            </div>

            {/* PriorityClass Properties */}
            <PropertiesViewer
              metadata={pcData.metadata}
              kind="PriorityClass"
              additionalProperties={[
                {
                  label: "Priority Value",
                  value: pcData.value?.toString() || 'N/A'
                },
                {
                  label: "Default Priority Class",
                  value: pcData.globalDefault ? 'Yes' : 'No'
                },
                {
                  label: "Preemption Policy",
                  value: pcData.preemptionPolicy || 'PreemptLowerPriority'
                },
                {
                  label: "Description",
                  value: pcData.description || 'None'
                }
              ]}
            />

            {/* PriorityClass Events */}
            {events.length > 0 && (
              <EventsViewer
                events={events}
                resourceName={pcData.metadata.name}
                resourceKind="PriorityClass"
              />
            )}
          </TabsContent>

          <TabsContent value="yaml" className="space-y-6">
            <ResourceViewerYamlTab
              resourceData={pcData}
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

export default PriorityClassViewer;