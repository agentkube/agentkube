import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { V1Secret, CoreV1Event } from '@kubernetes/client-node';
import {
  deleteResource,
  getResource,
  listResources
} from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';

// Component imports
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ChevronRight, AlertCircle, Clock, ArrowLeft, RefreshCw, FileText, Lock, Eye, EyeOff, Shield, Download, Trash } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import KUBERNETES_LOGO from '@/assets/kubernetes.svg';
import { useSearchParams } from 'react-router-dom';

// Custom component imports
import PropertiesViewer from '../components/properties.viewer';
import EventsViewer from '../components/event.viewer';
import { DeletionDialog, ResourceViewerYamlTab } from '@/components/custom';

// Define interface for secret data (extending V1Secret with events)
interface SecretData extends V1Secret {
  events?: CoreV1Event[];
}

const SecretViewer: React.FC = () => {
  const [secretData, setSecretData] = useState<SecretData | null>(null);
  const [events, setEvents] = useState<CoreV1Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSecretValues, setShowSecretValues] = useState<Record<string, boolean>>({});
  const { currentContext } = useCluster();
  const { secretName, namespace } = useParams<{ secretName: string; namespace: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const defaultTab = tabParam || 'overview';
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Fetch events for the secret
  const fetchEvents = async () => {
    if (!currentContext || !namespace) return;

    try {
      // Fetch all events in the namespace
      const eventData = await listResources<'events'>(
        currentContext.name,
        'events',
        { namespace }
      );

      // Filter events for this secret
      const filteredEvents = eventData.filter(event => {
        return (
          event.involvedObject?.kind === 'Secret' &&
          event.involvedObject?.name === secretName
        );
      });

      setEvents(filteredEvents);
    } catch (err) {
      console.error('Error fetching events:', err);
    }
  };

  // Fetch secret data and events
  useEffect(() => {
    const fetchSecretData = async () => {
      if (!currentContext || !secretName || !namespace) {
        setLoading(false);
        setError("Missing required parameters");
        return;
      }

      try {
        setLoading(true);

        // Get secret details
        const data = await getResource<'secrets'>(
          currentContext.name,
          'secrets',
          secretName,
          namespace
        );

        setSecretData(data);
        setError(null);

        // Fetch related events
        await fetchEvents();
      } catch (err) {
        console.error('Error fetching secret:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch secret data');
      } finally {
        setLoading(false);
      }
    };

    fetchSecretData();
  }, [currentContext, namespace, secretName]);

  const handleDelete = () => {
    setShowDeleteDialog(true);
  };

  const confirmResourceDeletion = async () => {
    if (!secretData || !currentContext) {
      setShowDeleteDialog(false);
      return;
    }

    try {
      setDeleteLoading(true);

      await deleteResource(
        currentContext.name,
        'secrets',
        secretData.metadata?.name as string,
        {
          namespace: secretData.metadata?.namespace
          // Note: Secrets are in the core API group, so no apiGroup parameter needed
        }
      );

      // Navigate back to the secrets list
      navigate('/dashboard/explore/secrets');
    } catch (err) {
      console.error('Failed to delete secret:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete secret');
    } finally {
      setDeleteLoading(false);
      setShowDeleteDialog(false);
    }
  };

  // Handle refresh data
  const handleRefresh = () => {
    setLoading(true);
    // Refetch data
    if (currentContext && secretName && namespace) {
      Promise.all([
        getResource<'secrets'>(
          currentContext.name,
          'secrets',
          secretName,
          namespace
        ),
        fetchEvents()
      ]).then(([data]) => {
        setSecretData(data);
        setLoading(false);
      }).catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to refresh data');
        setLoading(false);
      });
    }
  };

  // Toggle visibility of a secret value
  const toggleSecretVisibility = (key: string) => {
    setShowSecretValues(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Get base64 decoded value
  const getDecodedValue = (value: string): string => {
    try {
      return atob(value);
    } catch (e) {
      return 'Invalid base64 encoding';
    }
  };

  // Calculate secret age
  const getSecretAge = () => {
    if (!secretData?.metadata?.creationTimestamp) {
      return 'N/A';
    }

    const creationTime = new Date(secretData.metadata.creationTimestamp);
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

  // Determine secret type
  const getSecretType = (): string => {
    if (!secretData) return 'Unknown';

    const type = secretData.type || 'Opaque';

    // Map known secret types to more readable names
    const typeMap: Record<string, string> = {
      'kubernetes.io/service-account-token': 'Service Account Token',
      'kubernetes.io/dockerconfigjson': 'Docker Config',
      'kubernetes.io/dockercfg': 'Docker Config (Legacy)',
      'kubernetes.io/basic-auth': 'Basic Auth',
      'kubernetes.io/ssh-auth': 'SSH Auth',
      'kubernetes.io/tls': 'TLS',
      'bootstrap.kubernetes.io/token': 'Bootstrap Token',
      'Opaque': 'Opaque'
    };

    return typeMap[type] || type;
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
          <AlertTitle>Error loading Secret data</AlertTitle>
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

  // If no secret data
  if (!secretData || !secretData.metadata) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTitle>No Secret data available</AlertTitle>
          <AlertDescription>
            The requested Secret was not found or could not be retrieved.
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

  // Calculate secret metrics
  const dataEntryCount = secretData.data ? Object.keys(secretData.data).length : 0;
  const secretType = getSecretType();
  const totalSize = secretData.data ?
    Object.values(secretData.data).reduce((acc, val) => acc + (val?.length || 0), 0) : 0;

  return (
    <div className='max-h-[92vh] overflow-y-auto
          scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent
          [&::-webkit-scrollbar]:w-1.5 
          [&::-webkit-scrollbar-track]:bg-transparent 
          [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50'>
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
              <BreadcrumbLink href="/dashboard/explore/secrets">Secrets</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink href={`/dashboard/explore/secrets?namespace=${namespace}`}>{namespace}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink>{secretData.metadata.name}</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header section */}
        <div className="mb-6">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{secretData.metadata.name}</h1>
                <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                  Secret
                </Badge>
                <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300">
                  {secretType}
                </Badge>
              </div>
              <div className="text-gray-500 dark:text-gray-400">
                Namespace: <span onClick={() => navigate(`/dashboard/explore/namespaces/${secretData.metadata?.namespace}`)} className="text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">{secretData.metadata.namespace}</span>
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

        {secretData && (
          <DeletionDialog
            isOpen={showDeleteDialog}
            onClose={() => setShowDeleteDialog(false)}
            onConfirm={confirmResourceDeletion}
            title="Delete Secret"
            description={`Are you sure you want to delete the secret "${secretData.metadata.name}" in namespace "${secretData.metadata.namespace}"? This action cannot be undone.`}
            resourceName={secretData.metadata.name as string}
            resourceType="Secret"
            isLoading={deleteLoading}
          />
        )}

        {/* Warning alert for sensitive data */}
        <Alert className="mb-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
          <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
          <AlertTitle>Sensitive Information</AlertTitle>
          <AlertDescription>
            This page contains sensitive information. Be cautious when revealing secret values.
          </AlertDescription>
        </Alert>

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
            <TabsTrigger value="data">Secret Data</TabsTrigger>
            <TabsTrigger value="yaml">YAML</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 bg-transparent">
            {/* Secret Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Lock className="h-4 w-4 text-purple-500" />
                  <h3 className="text-sm font-medium">Type</h3>
                </div>
                <div className="text-lg font-semibold truncate">
                  {secretType}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Secret classification
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-medium">Data Entries</h3>
                </div>
                <div className="text-2xl font-semibold">
                  {dataEntryCount}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Encrypted values
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4 text-green-500" />
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
                  {getSecretAge()}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Created {secretData.metadata.creationTimestamp &&
                    new Date(secretData.metadata.creationTimestamp).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Secret Properties */}
            <PropertiesViewer
              metadata={secretData.metadata}
              kind="Secret"
              status="Active"
              additionalProperties={[
                {
                  label: "Type",
                  value: secretType
                },
                {
                  label: "Data Entries",
                  value: dataEntryCount.toString()
                },
                {
                  label: "Total Size",
                  value: totalSize < 1024 ? `${totalSize} bytes` :
                    totalSize < 1024 * 1024 ? `${(totalSize / 1024).toFixed(2)} KB` :
                      `${(totalSize / 1024 / 1024).toFixed(2)} MB`
                },
                {
                  label: "Creation Time",
                  value: secretData.metadata.creationTimestamp ?
                    new Date(secretData.metadata.creationTimestamp).toLocaleString() :
                    'N/A'
                }
              ]}
            />

            {/* Secret Preview for service account tokens */}
            {secretType === 'Service Account Token' && secretData.data && secretData.data['token'] && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-medium">Service Account Token</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500 dark:text-gray-400">Show Token</span>
                    <Switch
                      checked={showSecretValues['token'] || false}
                      onCheckedChange={() => toggleSecretVisibility('token')}
                    />
                  </div>
                </div>
                <div className="bg-gray-100 dark:bg-gray-900 p-4 rounded-md relative">
                  {showSecretValues['token'] ? (
                    <div className="font-mono text-xs break-all">
                      {getDecodedValue(secretData.data['token'])}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-4 text-gray-500 dark:text-gray-400">
                      <EyeOff className="h-4 w-4 mr-2" />
                      <span>Token is hidden. Use the toggle to reveal.</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Data Preview for other entries */}
            {dataEntryCount > 0 && secretType !== 'Service Account Token' && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
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
                  {Object.entries(secretData.data || {}).slice(0, 3).map(([key, value]) => (
                    <div key={key} className="border border-gray-200 dark:border-gray-800 rounded-lg">
                      <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 px-4 py-2 rounded-t-lg">
                        <div className="flex items-center gap-2">
                          <Lock className="h-4 w-4 text-purple-500" />
                          <h3 className="font-medium">{key}</h3>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs font-mono">
                            {value?.length || 0} bytes
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => toggleSecretVisibility(key)}
                          >
                            {showSecretValues[key] ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                      <div className="bg-gray-100 dark:bg-gray-900 p-4 rounded-b-lg">
                        {showSecretValues[key] ? (
                          <div className="font-mono text-xs break-all max-h-40 overflow-auto">
                            {(() => {
                              const decodedValue = getDecodedValue(value);
                              return isJson(decodedValue) ? formatJsonData(decodedValue) : decodedValue;
                            })()}
                          </div>
                        ) : (
                          <div className="flex items-center justify-center py-4 text-gray-500 dark:text-gray-400">
                            <EyeOff className="h-4 w-4 mr-2" />
                            <span>Value is hidden. Click the eye icon to reveal.</span>
                          </div>
                        )}
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

            {/* Secret Events */}
            <EventsViewer
              events={events}
              resourceName={secretData.metadata.name}
              resourceKind="Secret"
              namespace={secretData.metadata.namespace}
            />
          </TabsContent>

          <TabsContent value="data" className="space-y-6" id="data-tab">
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-medium">Secret Data</h2>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-1.5" />
                    Export
                  </Button>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">Show All Values</span>
                    <Switch
                      checked={Object.keys(secretData.data || {}).length > 0 &&
                        Object.keys(secretData.data || {}).every(key => showSecretValues[key])}
                      onCheckedChange={() => {
                        const allKeys = Object.keys(secretData.data || {});
                        const allShown = allKeys.length > 0 && allKeys.every(key => showSecretValues[key]);

                        // Toggle all keys to the opposite of current state
                        const newState = allKeys.reduce((acc, key) => {
                          acc[key] = !allShown;
                          return acc;
                        }, {} as Record<string, boolean>);

                        setShowSecretValues(newState);
                      }}
                    />
                  </div>
                </div>
              </div>

              {dataEntryCount === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  This Secret contains no data entries
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(secretData.data || {}).map(([key, value]) => (
                    <div key={key} className="border border-gray-200 dark:border-gray-800 rounded-lg">
                      <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 px-4 py-2 rounded-t-lg">
                        <div className="flex items-center gap-2">
                          <Lock className="h-4 w-4 text-purple-500" />
                          <h3 className="font-medium">{key}</h3>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs font-mono">
                            {value?.length || 0} bytes
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => toggleSecretVisibility(key)}
                          >
                            {showSecretValues[key] ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                          <Button variant="ghost" size="icon">
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="bg-gray-100 dark:bg-gray-900 p-4 rounded-b-lg">
                        {showSecretValues[key] ? (
                          <div className="font-mono text-xs break-all max-h-80 overflow-auto">
                            {(() => {
                              const decodedValue = getDecodedValue(value);
                              return isJson(decodedValue) ? formatJsonData(decodedValue) : decodedValue;
                            })()}
                          </div>
                        ) : (
                          <div className="flex items-center justify-center py-8 text-gray-500 dark:text-gray-400">
                            <EyeOff className="h-4 w-4 mr-2" />
                            <span>Value is hidden. Click the eye icon to reveal.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="yaml" className="space-y-6">
            <ResourceViewerYamlTab
              resourceData={secretData}
              namespace={secretData.metadata.namespace || ''}
              currentContext={currentContext}
            />
          </TabsContent>

          <TabsContent value="events" className="space-y-6">
            <EventsViewer
              events={events}
              namespace={secretData.metadata.namespace}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>

  );
};

export default SecretViewer;