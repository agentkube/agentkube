import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { V1LimitRange, CoreV1Event } from '@kubernetes/client-node';
import {
  deleteResource,
  getResource,
  listResources
} from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';

// Component imports
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ChevronRight, AlertCircle, Clock, ArrowLeft, RefreshCw, Scale, Cpu, MemoryStick, HardDrive, Database, Trash } from "lucide-react";
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

// Define interface for LimitRange data (extending V1LimitRange with events)
interface LimitRangeData extends V1LimitRange {
  events?: CoreV1Event[];
}

const LimitRangeViewer: React.FC = () => {
  const [limitRangeData, setLimitRangeData] = useState<LimitRangeData | null>(null);
  const [events, setEvents] = useState<CoreV1Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { currentContext, fullWidth } = useCluster();
  const { limitRangeName, namespace } = useParams<{ limitRangeName: string; namespace: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const defaultTab = tabParam || 'overview';
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Fetch events for the limit range
  const fetchEvents = async () => {
    if (!currentContext || !namespace) return;

    try {
      // Fetch all events in the namespace
      const eventData = await listResources<'events'>(
        currentContext.name,
        'events',
        { namespace }
      );

      // Filter events for this limit range
      const filteredEvents = eventData.filter(event => {
        return (
          event.involvedObject?.kind === 'LimitRange' &&
          event.involvedObject?.name === limitRangeName
        );
      });

      setEvents(filteredEvents);
    } catch (err) {
      console.error('Error fetching events:', err);
    }
  };

  // Fetch limit range data and events
  useEffect(() => {
    const fetchLimitRangeData = async () => {
      if (!currentContext || !limitRangeName || !namespace) {
        setLoading(false);
        setError("Missing required parameters");
        return;
      }

      try {
        setLoading(true);

        // Get limit range details
        const data = await getResource<'limitranges'>(
          currentContext.name,
          'limitranges',
          limitRangeName,
          namespace
        );

        setLimitRangeData(data);
        setError(null);

        // Fetch related events
        await fetchEvents();
      } catch (err) {
        console.error('Error fetching limit range:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch limit range data');
      } finally {
        setLoading(false);
      }
    };

    fetchLimitRangeData();
  }, [currentContext, namespace, limitRangeName]);

  const handleDelete = () => {
    setShowDeleteDialog(true);
  };

  const confirmResourceDeletion = async () => {
    if (!limitRangeData || !currentContext) {
      setShowDeleteDialog(false);
      return;
    }

    try {
      setDeleteLoading(true);

      await deleteResource(
        currentContext.name,
        'limitranges',
        limitRangeData.metadata?.name as string,
        {
          namespace: limitRangeData.metadata?.namespace
          // Note: LimitRange is in the core API group, so no apiGroup parameter needed
        }
      );

      // Navigate back to the limit ranges list
      navigate('/dashboard/explore/limitranges');
    } catch (err) {
      console.error('Failed to delete limit range:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete limit range');
    } finally {
      setDeleteLoading(false);
      setShowDeleteDialog(false);
    }
  };

  // Handle refresh data
  const handleRefresh = () => {
    setLoading(true);
    // Refetch data
    if (currentContext && limitRangeName && namespace) {
      Promise.all([
        getResource<'limitranges'>(
          currentContext.name,
          'limitranges',
          limitRangeName,
          namespace
        ),
        fetchEvents()
      ]).then(([data]) => {
        setLimitRangeData(data);
        setLoading(false);
      }).catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to refresh data');
        setLoading(false);
      });
    }
  };

  // Calculate limit range age
  const getLimitRangeAge = () => {
    if (!limitRangeData?.metadata?.creationTimestamp) {
      return 'N/A';
    }

    const creationTime = new Date(limitRangeData.metadata.creationTimestamp);
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

  // Format CPU value
  const formatCPUValue = (value: string | undefined) => {
    if (!value) return 'N/A';

    // If value is already in cores or millicores format
    if (value.endsWith('m') || !isNaN(parseInt(value))) {
      return value;
    }

    return value;
  };

  // Format memory value
  const formatMemoryValue = (value: string | undefined) => {
    if (!value) return 'N/A';

    // If value is already in Ki, Mi, Gi format
    if (value.endsWith('Ki') || value.endsWith('Mi') || value.endsWith('Gi')) {
      return value;
    }

    return value;
  };

  // Format storage value
  const formatStorageValue = (value: string | undefined) => {
    if (!value) return 'N/A';

    // If value is already in Ki, Mi, Gi format
    if (value.endsWith('Ki') || value.endsWith('Mi') || value.endsWith('Gi')) {
      return value;
    }

    return value;
  };

  // Get resource icon based on type
  const getResourceIcon = (resourceType: string) => {
    switch (resourceType) {
      case 'cpu':
        return <Cpu className="h-4 w-4 text-blue-500" />;
      case 'memory':
        return <MemoryStick className="h-4 w-4 text-green-500" />;
      case 'storage':
      case 'ephemeral-storage':
        return <HardDrive className="h-4 w-4 text-purple-500" />;
      default:
        return <Database className="h-4 w-4 text-gray-500" />;
    }
  };

  // Format resource value based on type
  const formatResourceValue = (resourceType: string, value: string | undefined) => {
    switch (resourceType) {
      case 'cpu':
        return formatCPUValue(value);
      case 'memory':
        return formatMemoryValue(value);
      case 'storage':
      case 'ephemeral-storage':
        return formatStorageValue(value);
      default:
        return value || 'N/A';
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
          <AlertTitle>Error loading LimitRange data</AlertTitle>
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

  // If no limit range data
  if (!limitRangeData || !limitRangeData.metadata) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTitle>No LimitRange data available</AlertTitle>
          <AlertDescription>
            The requested LimitRange was not found or could not be retrieved.
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

  // Count number of limits defined
  const limitCount = limitRangeData.spec?.limits?.length || 0;

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
              <BreadcrumbLink href="/dashboard/explore/limitranges">LimitRanges</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink href={`/dashboard/explore/limitranges?namespace=${namespace}`}>{namespace}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink>{limitRangeData.metadata.name}</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header section */}
        <div className="mb-6">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{limitRangeData.metadata.name}</h1>
                <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  LimitRange
                </Badge>
              </div>
              <div className="text-gray-500 dark:text-gray-400">
                Namespace: <span onClick={() => navigate(`/dashboard/explore/namespaces/${limitRangeData.metadata?.namespace}`)} className="text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">{limitRangeData.metadata.namespace}</span>
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

        {limitRangeData && (
          <DeletionDialog
            isOpen={showDeleteDialog}
            onClose={() => setShowDeleteDialog(false)}
            onConfirm={confirmResourceDeletion}
            title="Delete LimitRange"
            description={`Are you sure you want to delete the limit range "${limitRangeData.metadata.name}" in namespace "${limitRangeData.metadata.namespace}"? This action cannot be undone.`}
            resourceName={limitRangeData.metadata.name as string}
            resourceType="LimitRange"
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
            {/* LimitRange Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Scale className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-medium">Resource Limits</h3>
                </div>
                <div className="text-2xl font-semibold">
                  {limitCount}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Resource constraint sets defined
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Database className="h-4 w-4 text-purple-500" />
                  <h3 className="text-sm font-medium">Resource Types</h3>
                </div>
                <div className="flex flex-wrap gap-1">
                  {limitRangeData.spec?.limits?.flatMap(limit =>
                    Object.keys(limit.max || {}).concat(Object.keys(limit.min || {}))
                  )
                    .filter((value, index, self) => self.indexOf(value) === index)
                    .map((resourceType, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {resourceType}
                      </Badge>
                    ))}
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-orange-500" />
                  <h3 className="text-sm font-medium">Age</h3>
                </div>
                <div className="text-2xl font-semibold">
                  {getLimitRangeAge()}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Created {limitRangeData.metadata.creationTimestamp &&
                    new Date(limitRangeData.metadata.creationTimestamp).toLocaleString()}
                </div>
              </div>
            </div>

            {/* LimitRange Properties */}
            <PropertiesViewer
              metadata={limitRangeData.metadata}
              kind="LimitRange"
              status="Active"
              additionalProperties={[
                {
                  label: "Limit Count",
                  value: limitCount.toString()
                },
                {
                  label: "Creation Time",
                  value: limitRangeData.metadata.creationTimestamp ?
                    new Date(limitRangeData.metadata.creationTimestamp).toLocaleString() :
                    'N/A'
                }
              ]}
            />

            {/* Resource Limits */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
              <h2 className="text-lg font-medium mb-4">Resource Limits</h2>

              {limitCount === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  No resource limits defined
                </div>
              ) : (
                <div className="space-y-6">
                  {limitRangeData.spec?.limits?.map((limit, limitIndex) => (
                    <div key={limitIndex} className="border border-gray-200 dark:border-gray-800 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200">
                          {limit.type || 'Unknown Type'}
                        </Badge>
                        {limit._default && Object.keys(limit._default).length > 0 && (
                          <Badge variant="outline" className="text-xs">
                            Has Defaults
                          </Badge>
                        )}
                        {limit.defaultRequest && Object.keys(limit.defaultRequest).length > 0 && (
                          <Badge variant="outline" className="text-xs">
                            Has Default Requests
                          </Badge>
                        )}
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                          <thead className="bg-gray-50 dark:bg-gray-800/50">
                            <tr>
                              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Resource</th>
                              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Min</th>
                              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Max</th>
                              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Default</th>
                              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Default Request</th>
                              {limit.maxLimitRequestRatio && (
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Max Ratio</th>
                              )}
                            </tr>
                          </thead>
                          <tbody className="bg-white dark:bg-transparent divide-y divide-gray-200 dark:divide-gray-700">
                            {/* Get all resource types from all limit fields */}
                            {[...new Set([
                              ...Object.keys(limit.min || {}),
                              ...Object.keys(limit.max || {}),
                              ...Object.keys(limit._default || {}),
                              ...Object.keys(limit.defaultRequest || {}),
                              ...Object.keys(limit.maxLimitRequestRatio || {})
                            ])].map(resourceType => (
                              <tr key={resourceType} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="flex items-center">
                                    {getResourceIcon(resourceType)}
                                    <span className="ml-2 text-sm font-medium">{resourceType}</span>
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                  {formatResourceValue(resourceType, limit.min?.[resourceType])}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                  {formatResourceValue(resourceType, limit.max?.[resourceType])}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                  {formatResourceValue(resourceType, limit._default?.[resourceType])}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                  {formatResourceValue(resourceType, limit.defaultRequest?.[resourceType])}
                                </td>
                                {limit.maxLimitRequestRatio && (
                                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    {limit.maxLimitRequestRatio[resourceType] || 'N/A'}
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Resource limit explanation */}
                      <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800/30 rounded-md text-sm text-gray-600 dark:text-gray-300">
                        <p>
                          {limit.type === 'Container' && 'These limits apply to individual containers within pods.'}
                          {limit.type === 'Pod' && 'These limits apply to the pod as a whole, summing all container resources.'}
                          {limit.type === 'PersistentVolumeClaim' && 'These limits apply to persistent volume claims in this namespace.'}
                          {!['Container', 'Pod', 'PersistentVolumeClaim'].includes(limit.type || '') &&
                            `These limits apply to resources of type "${limit.type}" in this namespace.`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* LimitRange Events */}
            <EventsViewer
              events={events}
              resourceName={limitRangeData.metadata.name}
              resourceKind="LimitRange"
              namespace={limitRangeData.metadata.namespace}
            />
          </TabsContent>

          <TabsContent value="yaml" className="space-y-6">
            <ResourceViewerYamlTab
              resourceData={limitRangeData}
              namespace={limitRangeData.metadata.namespace || ''}
              currentContext={currentContext}
            />
          </TabsContent>

          <TabsContent value="events" className="space-y-6">
            <EventsViewer
              events={events}
              namespace={limitRangeData.metadata.namespace}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default LimitRangeViewer;