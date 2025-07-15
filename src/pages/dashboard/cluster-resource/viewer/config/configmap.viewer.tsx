import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { V1ConfigMap, CoreV1Event } from '@kubernetes/client-node';
import {
  deleteResource,
  getResource,
  listResources
} from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';

// Component imports
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ChevronRight, AlertCircle, Clock, ArrowLeft, RefreshCw, FileText, FileCode, Code, Download, Trash } from "lucide-react";
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

// Define interface for configmap data (extending V1ConfigMap with events)
interface ConfigMapData extends V1ConfigMap {
  events?: CoreV1Event[];
}

const ConfigMapViewer: React.FC = () => {
  const [configMapData, setConfigMapData] = useState<ConfigMapData | null>(null);
  const [events, setEvents] = useState<CoreV1Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { currentContext, fullWidth } = useCluster();
  const { configMapName, namespace } = useParams<{ configMapName: string; namespace: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const defaultTab = tabParam || 'overview';
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Fetch events for the configmap
  const fetchEvents = async () => {
    if (!currentContext || !namespace) return;

    try {
      // Fetch all events in the namespace
      const eventData = await listResources<'events'>(
        currentContext.name,
        'events',
        { namespace }
      );

      // Filter events for this configmap
      const filteredEvents = eventData.filter(event => {
        return (
          event.involvedObject?.kind === 'ConfigMap' &&
          event.involvedObject?.name === configMapName
        );
      });

      setEvents(filteredEvents);
    } catch (err) {
      console.error('Error fetching events:', err);
    }
  };

  // Fetch configmap data and events
  useEffect(() => {
    const fetchConfigMapData = async () => {
      if (!currentContext || !configMapName || !namespace) {
        setLoading(false);
        setError("Missing required parameters");
        return;
      }

      try {
        setLoading(true);

        // Get configmap details
        const data = await getResource<'configmaps'>(
          currentContext.name,
          'configmaps',
          configMapName,
          namespace
        );

        setConfigMapData(data);
        setError(null);

        // Fetch related events
        await fetchEvents();
      } catch (err) {
        console.error('Error fetching configmap:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch configmap data');
      } finally {
        setLoading(false);
      }
    };

    fetchConfigMapData();
  }, [currentContext, namespace, configMapName]);

  const handleDelete = () => {
    setShowDeleteDialog(true);
  };

  const confirmResourceDeletion = async () => {
    if (!configMapData || !currentContext) {
      setShowDeleteDialog(false);
      return;
    }

    try {
      setDeleteLoading(true);

      await deleteResource(
        currentContext.name,
        'configmaps',
        configMapData.metadata?.name as string,
        {
          namespace: configMapData.metadata?.namespace
          // Note: ConfigMaps are in the core API group, so no apiGroup parameter needed
        }
      );

      // Navigate back to the config maps list
      navigate('/dashboard/explore/configmaps');
    } catch (err) {
      console.error('Failed to delete config map:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete config map');
    } finally {
      setDeleteLoading(false);
      setShowDeleteDialog(false);
    }
  };

  // Handle refresh data
  const handleRefresh = () => {
    setLoading(true);
    // Refetch data
    if (currentContext && configMapName && namespace) {
      Promise.all([
        getResource<'configmaps'>(
          currentContext.name,
          'configmaps',
          configMapName,
          namespace
        ),
        fetchEvents()
      ]).then(([data]) => {
        setConfigMapData(data);
        setLoading(false);
      }).catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to refresh data');
        setLoading(false);
      });
    }
  };

  // Calculate configmap age
  const getConfigMapAge = () => {
    if (!configMapData?.metadata?.creationTimestamp) {
      return 'N/A';
    }

    const creationTime = new Date(configMapData.metadata.creationTimestamp);
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

  // Detect if a data entry is likely JSON
  const isJson = (str: string): boolean => {
    try {
      const result = JSON.parse(str);
      return typeof result === 'object' && result !== null;
    } catch (e) {
      return false;
    }
  };

  // Format JSON data for display
  const formatJsonData = (data: string): string => {
    try {
      return JSON.stringify(JSON.parse(data), null, 2);
    } catch (e) {
      return data;
    }
  };

  // Detect if a data entry is likely YAML
  const isYaml = (str: string): boolean => {
    // Simple heuristic check for YAML syntax
    return /\n\s*[a-zA-Z0-9_-]+\s*:/.test(str) && !isJson(str);
  };

  // Detect data format and return appropriate icon
  const getDataFormatIcon = (data: string) => {
    if (isJson(data)) return <Code className="h-4 w-4 text-blue-500" />;
    if (isYaml(data)) return <FileCode className="h-4 w-4 text-green-500" />;
    return <FileText className="h-4 w-4 text-gray-500" />;
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
          <AlertTitle>Error loading ConfigMap data</AlertTitle>
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

  // If no configmap data
  if (!configMapData || !configMapData.metadata) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTitle>No ConfigMap data available</AlertTitle>
          <AlertDescription>
            The requested ConfigMap was not found or could not be retrieved.
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

  // Calculate configmap metrics
  const dataEntryCount = configMapData.data ? Object.keys(configMapData.data).length : 0;
  const binaryEntryCount = configMapData.binaryData ? Object.keys(configMapData.binaryData).length : 0;
  const totalSize = (configMapData.data ?
    Object.values(configMapData.data).reduce((acc, val) => acc + (val?.length || 0), 0) : 0) +
    (configMapData.binaryData ?
      Object.values(configMapData.binaryData).reduce((acc, val) => acc + (val?.length || 0), 0) : 0);

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
              <BreadcrumbLink href="/dashboard/explore/configmaps">ConfigMaps</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink href={`/dashboard/explore/configmaps?namespace=${namespace}`}>{namespace}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink>{configMapData.metadata.name}</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header section */}
        <div className="mb-6">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{configMapData.metadata.name}</h1>
                <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  ConfigMap
                </Badge>
              </div>
              <div className="text-gray-500 dark:text-gray-400">
                Namespace: <span onClick={() => navigate(`/dashboard/explore/namespaces/${configMapData.metadata?.namespace}`)} className="text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">{configMapData.metadata.namespace}</span>
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

        {configMapData && (
          <DeletionDialog
            isOpen={showDeleteDialog}
            onClose={() => setShowDeleteDialog(false)}
            onConfirm={confirmResourceDeletion}
            title="Delete ConfigMap"
            description={`Are you sure you want to delete the config map "${configMapData.metadata.name}" in namespace "${configMapData.metadata.namespace}"? This action cannot be undone.`}
            resourceName={configMapData.metadata.name as string}
            resourceType="ConfigMap"
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
            <TabsTrigger value="data">Data</TabsTrigger>
            <TabsTrigger value="yaml">YAML</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 bg-transparent">
            {/* ConfigMap Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-medium">Data Entries</h3>
                </div>
                <div className="text-2xl font-semibold">
                  {dataEntryCount}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Text configuration items
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <FileCode className="h-4 w-4 text-green-500" />
                  <h3 className="text-sm font-medium">Binary Entries</h3>
                </div>
                <div className="text-2xl font-semibold">
                  {binaryEntryCount}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Binary configuration items
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Code className="h-4 w-4 text-purple-500" />
                  <h3 className="text-sm font-medium">Total Size</h3>
                </div>
                <div className="text-2xl font-semibold">
                  {totalSize < 1024 ? `${totalSize} B` :
                    totalSize < 1024 * 1024 ? `${(totalSize / 1024).toFixed(2)} KB` :
                      `${(totalSize / 1024 / 1024).toFixed(2)} MB`}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Combined data size
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-orange-500" />
                  <h3 className="text-sm font-medium">Age</h3>
                </div>
                <div className="text-2xl font-semibold">
                  {getConfigMapAge()}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Created {configMapData.metadata.creationTimestamp &&
                    new Date(configMapData.metadata.creationTimestamp).toLocaleString()}
                </div>
              </div>
            </div>

            {/* ConfigMap Properties */}
            <PropertiesViewer
              metadata={configMapData.metadata}
              kind="ConfigMap"
              status="Active"
              additionalProperties={[
                {
                  label: "Data Entries",
                  value: dataEntryCount.toString()
                },
                {
                  label: "Binary Data Entries",
                  value: binaryEntryCount.toString()
                },
                {
                  label: "Total Size",
                  value: totalSize < 1024 ? `${totalSize} bytes` :
                    totalSize < 1024 * 1024 ? `${(totalSize / 1024).toFixed(2)} KB` :
                      `${(totalSize / 1024 / 1024).toFixed(2)} MB`
                },
                {
                  label: "Creation Time",
                  value: configMapData.metadata.creationTimestamp ?
                    new Date(configMapData.metadata.creationTimestamp).toLocaleString() :
                    'N/A'
                }
              ]}
            />

            {/* Data Preview for first few entries */}
            {dataEntryCount > 0 && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-800/60 bg-white dark:bg-gray-900/20 p-4 mb-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-medium">Data Preview</h2>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => document.getElementById('data-tab')?.click()}
                  >
                    View All Data
                  </Button>
                </div>
                <div className="space-y-4">
                  {Object.entries(configMapData.data || {}).slice(0, 3).map(([key, value], index) => (
                    <div key={index} className="border border-gray-200 dark:border-gray-800 rounded-lg">
                      <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/40 px-4 py-2 rounded-t-lg">
                        <div className="flex items-center gap-2">
                          {getDataFormatIcon(value)}
                          <h3 className="font-medium">{key}</h3>
                        </div>
                        <Badge variant="outline" className="text-xs font-mono">
                          {value?.length || 0} bytes
                        </Badge>
                      </div>
                      <div className="bg-gray-100 dark:bg-transparent p-4 rounded-b-lg max-h-40 overflow-auto
                        [&::-webkit-scrollbar]:w-1.5 
                        [&::-webkit-scrollbar-track]:bg-transparent 
                        [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
                        [&::-webkit-scrollbar-thumb]:rounded-full
                        [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50
                      ">
                        <pre className="text-xs font-mono">{isJson(value) ? formatJsonData(value) : value}</pre>
                      </div>
                    </div>
                  ))}
                  {dataEntryCount > 3 && (
                    <div className="text-center text-sm text-gray-600 dark:text-gray-400">
                      {dataEntryCount - 3} more entries not shown
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ConfigMap Events */}
            <EventsViewer
              events={events}
              resourceName={configMapData.metadata.name}
              resourceKind="ConfigMap"
              namespace={configMapData.metadata.namespace}
            />
          </TabsContent>

          <TabsContent value="data" className="space-y-6" id="data-tab">
            <div className="rounded-lg border border-gray-200 dark:border-gray-800/50 bg-white dark:bg-gray-900/20 p-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-medium">ConfigMap Data</h2>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-1.5" />
                  Export All
                </Button>
              </div>

              {dataEntryCount === 0 && binaryEntryCount === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  This ConfigMap contains no data entries
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Regular data entries */}
                  {dataEntryCount > 0 && (
                    <div className="space-y-4">
                      <h3 className="text-md font-medium">Text Data</h3>
                      {Object.entries(configMapData.data || {}).map(([key, value], index) => (
                        <div key={index} className="border border-gray-200 dark:border-gray-800 rounded-lg">
                          <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/40 px-4 py-2 rounded-t-lg">
                            <div className="flex items-center gap-2">
                              {getDataFormatIcon(value)}
                              <h3 className="font-medium">{key}</h3>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs font-mono">
                                {value?.length || 0} bytes
                              </Badge>
                              <Button variant="ghost" size="icon">
                                <Download className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          <div className="bg-gray-100 dark:bg-transparent p-4 rounded-b-lg max-h-96 overflow-auto">
                            <pre className="text-xs font-mono">{isJson(value) ? formatJsonData(value) : value}</pre>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Binary data entries */}
                  {binaryEntryCount > 0 && (
                    <div className="space-y-4">
                      <h3 className="text-md font-medium">Binary Data</h3>
                      {Object.entries(configMapData.binaryData || {}).map(([key, value], index) => (
                        <div key={index} className="border border-gray-200 dark:border-gray-800 rounded-lg">
                          <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 px-4 py-2 rounded-t-lg">
                            <div className="flex items-center gap-2">
                              <FileCode className="h-4 w-4 text-green-500" />
                              <h3 className="font-medium">{key}</h3>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs font-mono">
                                {value?.length || 0} bytes
                              </Badge>
                              <Button variant="ghost" size="icon">
                                <Download className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          <div className="bg-gray-100 dark:bg-gray-900 p-4 rounded-b-lg flex items-center justify-center">
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              Binary data - Download to view
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="yaml" className="space-y-6">
            <ResourceViewerYamlTab
              resourceData={configMapData}
              namespace={configMapData.metadata.namespace || ''}
              currentContext={currentContext}
            />
          </TabsContent>

          <TabsContent value="events" className="space-y-6">
            <EventsViewer
              events={events}
              namespace={configMapData.metadata.namespace}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default ConfigMapViewer;