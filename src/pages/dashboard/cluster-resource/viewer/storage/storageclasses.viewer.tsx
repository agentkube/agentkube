import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { V1StorageClass, CoreV1Event } from '@kubernetes/client-node';
import {
  deleteResource,
  getResource,
  listResources
} from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';

// Component imports
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ChevronRight, AlertCircle, ArrowLeft, RefreshCw, Database, HardDrive, Clock, Settings, Trash } from "lucide-react";
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
import ResourceViewerYamlTab from '@/components/custom/editor/resource-viewer-tabs.component';
import { DeletionDialog } from '@/components/custom';

// Define interface for StorageClass data
interface StorageClassData extends V1StorageClass {
  events?: CoreV1Event[];
}

const StorageClassViewer: React.FC = () => {
  const [storageClassData, setStorageClassData] = useState<StorageClassData | null>(null);
  const [events, setEvents] = useState<CoreV1Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { currentContext, fullWidth } = useCluster();
  const { storageClassName } = useParams<{ storageClassName: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const defaultTab = tabParam || 'overview';
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Fetch events for the storageClass
  const fetchEvents = async () => {
    if (!currentContext) return;

    try {
      // Fetch all cluster events (StorageClass is cluster-scoped)
      const eventData = await listResources<'events'>(
        currentContext.name,
        'events'
      );

      // Filter events related to this StorageClass
      const scEvents = eventData.filter(event =>
        event.involvedObject?.kind === 'StorageClass' &&
        event.involvedObject?.name === storageClassName
      );

      setEvents(scEvents);
    } catch (err) {
      console.error('Error fetching events:', err);
    }
  };

  // Fetch storageClass data and events
  useEffect(() => {
    const fetchStorageClassData = async () => {
      if (!currentContext || !storageClassName) {
        setLoading(false);
        setError("Missing required parameters");
        return;
      }

      try {
        setLoading(true);

        // Get StorageClass details
        const data = await getResource<'storageclasses'>(
          currentContext.name,
          'storageclasses',
          storageClassName,
          undefined, // No namespace for StorageClass
          'storage.k8s.io' // API group for StorageClass
        );

        setStorageClassData(data);
        setError(null);

        // Fetch related events
        await fetchEvents();
      } catch (err) {
        console.error('Error fetching StorageClass:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch StorageClass data');
      } finally {
        setLoading(false);
      }
    };

    fetchStorageClassData();
  }, [currentContext, storageClassName]);

  const handleDelete = () => {
    setShowDeleteDialog(true);
  };

  const confirmResourceDeletion = async () => {
    if (!storageClassData || !currentContext) {
      setShowDeleteDialog(false);
      return;
    }

    try {
      setDeleteLoading(true);

      await deleteResource(
        currentContext.name,
        'storageclasses',
        storageClassData.metadata?.name as string,
        {
          // Note: StorageClasses are cluster-scoped, so no namespace parameter needed
          apiGroup: 'storage.k8s.io'
        }
      );

      // Navigate back to the storage classes list
      navigate('/dashboard/explore/storageclasses');
    } catch (err) {
      console.error('Failed to delete storage class:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete storage class');
    } finally {
      setDeleteLoading(false);
      setShowDeleteDialog(false);
    }
  };

  // Handle refresh data
  const handleRefresh = () => {
    setLoading(true);
    // Refetch data
    if (currentContext && storageClassName) {
      Promise.all([
        getResource<'storageclasses'>(
          currentContext.name,
          'storageclasses',
          storageClassName,
          undefined,
          'storage.k8s.io'
        ),
        fetchEvents()
      ]).then(([data]) => {
        setStorageClassData(data);
        setLoading(false);
      }).catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to refresh data');
        setLoading(false);
      });
    }
  };

  // Get StorageClass age
  const getStorageClassAge = () => {
    if (!storageClassData?.metadata?.creationTimestamp) {
      return 'N/A';
    }

    const creationTime = new Date(storageClassData.metadata.creationTimestamp);
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

  // Format date time for display
  const formatDateTime = (timestamp: string | undefined) => {
    if (!timestamp) return 'N/A';

    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  // Check if this is the default StorageClass
  const isDefaultStorageClass = (data: V1StorageClass): boolean => {
    const annotations = data.metadata?.annotations || {};
    return annotations['storageclass.kubernetes.io/is-default-class'] === 'true';
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
        <Alert variant="destructive" className='bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10'>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error loading StorageClass data</AlertTitle>
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

  // If no StorageClass data
  if (!storageClassData || !storageClassData.metadata) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTitle>No StorageClass data available</AlertTitle>
          <AlertDescription>
            The requested StorageClass was not found or could not be retrieved.
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

  const isDefault = isDefaultStorageClass(storageClassData);
  const provisioner = storageClassData.provisioner;
  const reclaimPolicy = storageClassData.reclaimPolicy || 'Delete';
  const volumeBindingMode = storageClassData.volumeBindingMode || 'Immediate';
  const allowVolumeExpansion = storageClassData.allowVolumeExpansion || false;

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
              <BreadcrumbLink href="/dashboard/explore/storageclasses">StorageClasses</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink>{storageClassData.metadata.name}</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header section */}
        <div className="mb-6">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{storageClassData.metadata.name}</h1>
                {isDefault && (
                  <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                    Default
                  </Badge>
                )}
              </div>
              <div className="text-gray-500 dark:text-gray-400">
                Provisioner: <span className="text-gray-700 dark:text-gray-300">{provisioner}</span>
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

        {storageClassData && (
          <DeletionDialog
            isOpen={showDeleteDialog}
            onClose={() => setShowDeleteDialog(false)}
            onConfirm={confirmResourceDeletion}
            title="Delete StorageClass"
            description={`Are you sure you want to delete the storage class "${storageClassData.metadata.name}"? This action cannot be undone.`}
            resourceName={storageClassData.metadata.name as string}
            resourceType="StorageClass"
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
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="yaml">YAML</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 bg-transparent">
            {/* StorageClass Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Database className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-medium">Provisioner</h3>
                </div>
                <div className="text-lg font-semibold truncate" title={provisioner}>
                  {provisioner.split('/').pop() || provisioner}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Storage provisioner
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <HardDrive className="h-4 w-4 text-purple-500" />
                  <h3 className="text-sm font-medium">Reclaim Policy</h3>
                </div>
                <div className="text-lg font-semibold">
                  <span className={reclaimPolicy === 'Delete' ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}>
                    {reclaimPolicy}
                  </span>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {reclaimPolicy === 'Delete'
                    ? 'PVs are deleted when released'
                    : 'PVs are retained when released'}
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Settings className="h-4 w-4 text-green-500" />
                  <h3 className="text-sm font-medium">Volume Binding</h3>
                </div>
                <div className="text-lg font-semibold">
                  {volumeBindingMode}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {volumeBindingMode === 'Immediate'
                    ? 'Volume is bound immediately'
                    : 'Volume binding waits for consumer pod'}
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-orange-500" />
                  <h3 className="text-sm font-medium">Age</h3>
                </div>
                <div className="text-lg font-semibold">
                  {getStorageClassAge()}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Created {formatDateTime(storageClassData.metadata.creationTimestamp?.toString())}
                </div>
              </div>
            </div>

            {/* StorageClass Properties */}
            <PropertiesViewer
              metadata={storageClassData.metadata}
              kind="StorageClass"
              additionalProperties={[
                {
                  label: "Provisioner",
                  value: provisioner
                },
                {
                  label: "Reclaim Policy",
                  value: reclaimPolicy
                },
                {
                  label: "Volume Binding Mode",
                  value: volumeBindingMode
                },
                {
                  label: "Allow Volume Expansion",
                  value: allowVolumeExpansion ? 'Yes' : 'No'
                },
                {
                  label: "Default Class",
                  value: isDefault ? 'Yes' : 'No'
                }
              ]}
            />

            {/* StorageClass Parameters */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
              <h2 className="text-lg font-medium mb-4">Provisioner Parameters</h2>
              {storageClassData.parameters && Object.keys(storageClassData.parameters).length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(storageClassData.parameters).map(([key, value]) => (
                    <div key={key} className="p-3 border border-gray-200 dark:border-gray-700 rounded">
                      <div className="text-sm font-medium text-gray-600 dark:text-gray-400">{key}</div>
                      <div className="mt-1 font-mono text-sm overflow-hidden text-ellipsis">
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center p-4 text-gray-500 dark:text-gray-400">
                  No parameters specified for this StorageClass.
                </div>
              )}
            </div>

            {/* Mount Options */}
            {storageClassData.mountOptions && storageClassData.mountOptions.length > 0 && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
                <h2 className="text-lg font-medium mb-4">Mount Options</h2>
                <div className="flex flex-wrap gap-2">
                  {storageClassData.mountOptions.map((option, index) => (
                    <Badge key={index} variant="outline" className="text-sm">
                      {option}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Allow Volume Expansion */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
              <h2 className="text-lg font-medium mb-4">Volume Features</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 border border-gray-200 dark:border-gray-700 rounded">
                  <div className="flex items-center justify-between">
                    <div className="text-md font-medium">Volume Expansion</div>
                    <Badge className={
                      allowVolumeExpansion
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                        : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                    }>
                      {allowVolumeExpansion ? 'Allowed' : 'Not Allowed'}
                    </Badge>
                  </div>
                  <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    {allowVolumeExpansion
                      ? 'PVCs created from this StorageClass can be expanded after creation.'
                      : 'PVCs created from this StorageClass cannot be resized after creation.'}
                  </div>
                </div>

                <div className="p-3 border border-gray-200 dark:border-gray-700 rounded">
                  <div className="flex items-center justify-between">
                    <div className="text-md font-medium">Default StorageClass</div>
                    <Badge className={
                      isDefault
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
                    }>
                      {isDefault ? 'Default' : 'Not Default'}
                    </Badge>
                  </div>
                  <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    {isDefault
                      ? 'PVCs without a storageClassName will use this StorageClass by default.'
                      : 'This StorageClass must be explicitly specified in PVCs.'}
                  </div>
                </div>
              </div>
            </div>

            {/* Allowed Topologies (if present) */}
            {storageClassData.allowedTopologies && storageClassData.allowedTopologies.length > 0 && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
                <h2 className="text-lg font-medium mb-4">Allowed Topologies</h2>
                <div className="space-y-3">
                  {storageClassData.allowedTopologies.map((topology, index) => (
                    <div key={index} className="p-3 border border-gray-200 dark:border-gray-700 rounded">
                      <h3 className="text-md font-medium mb-2">Topology {index + 1}</h3>

                      {topology.matchLabelExpressions && topology.matchLabelExpressions.length > 0 && (
                        <div>
                          <div className="text-sm font-medium mb-1">Match Label Expressions:</div>
                          <div className="space-y-2">
                            {topology.matchLabelExpressions.map((expr, exprIndex) => (
                              <div key={exprIndex} className="bg-gray-50 dark:bg-gray-800 p-2 rounded">
                                <div className="font-medium text-sm">{expr.key}</div>
                                {expr.values && expr.values.length > 0 && (
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {expr.values.map((value, valueIndex) => (
                                      <Badge key={valueIndex} variant="outline" className="text-xs">
                                        {value}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}




          </TabsContent>

          <TabsContent value="yaml" className="space-y-6">
            <ResourceViewerYamlTab
              resourceData={storageClassData}
              namespace={storageClassData.metadata.namespace || ''}
              currentContext={currentContext}
            />
          </TabsContent>

          <TabsContent value="events" className="space-y-6">
            {events.length === 0 ? (
              <Alert variant="destructive" className='bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10'>
                <AlertDescription>
                  No events found for this StorageClass.
                </AlertDescription>
              </Alert>
            ) : (
              <EventsViewer
                events={events}
                resourceName={storageClassData.metadata.name}
                resourceKind="StorageClass"
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default StorageClassViewer;