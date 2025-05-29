import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { V1Namespace, CoreV1Event } from '@kubernetes/client-node';
import {
  deleteResource,
  getResource,
  listResources
} from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';

// Component imports
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ChevronRight, AlertCircle, ArrowLeft, RefreshCw, Package, Clock, Lock, Layers, Trash } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import KUBERNETES_LOGO from '@/assets/kubernetes.svg';

// Custom component imports
import PropertiesViewer from './components/properties.viewer';
import EventsViewer from './components/event.viewer';
import { DeletionDialog, ResourceViewerYamlTab } from '@/components/custom';
import { useSearchParams } from 'react-router-dom';

// Define interface for namespace data
interface NamespaceData extends V1Namespace {
  events?: CoreV1Event[];
}

const NamespaceViewer: React.FC = () => {
  const [namespaceData, setNamespaceData] = useState<NamespaceData | null>(null);
  const [events, setEvents] = useState<CoreV1Event[]>([]);
  const [resourceCounts, setResourceCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { currentContext, fullWidth } = useCluster();
  const { namespaceName } = useParams<{ namespaceName: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const defaultTab = tabParam || 'overview';
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Resource types to count
  const resourceTypes = [
    'pods',
    'deployments',
    'services',
    'configmaps',
    'secrets',
    'persistentvolumeclaims'
  ];

  // Fetch namespace data, events, and resource counts
  useEffect(() => {
    const fetchNamespaceData = async () => {
      if (!currentContext || !namespaceName) {
        setLoading(false);
        setError("Missing required parameters");
        return;
      }

      try {
        setLoading(true);

        // Get namespace details
        const data = await getResource<'namespaces'>(
          currentContext.name,
          'namespaces',
          namespaceName
        );

        setNamespaceData(data);
        setError(null);

        // Fetch related events
        await fetchEvents();

        // Fetch resource counts
        await fetchResourceCounts();
      } catch (err) {
        console.error('Error fetching namespace:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch namespace data');
      } finally {
        setLoading(false);
      }
    };

    fetchNamespaceData();
  }, [currentContext, namespaceName]);

  // Fetch events for the namespace
  const fetchEvents = async () => {
    if (!currentContext || !namespaceName) return;

    try {
      // Fetch all events in the namespace
      const eventData = await listResources<'events'>(
        currentContext.name,
        'events',
        { namespace: namespaceName }
      );

      setEvents(eventData);
    } catch (err) {
      console.error('Error fetching events:', err);
    }
  };

  // Fetch resource counts for the namespace
  const fetchResourceCounts = async () => {
    if (!currentContext || !namespaceName) return;

    const counts: Record<string, number> = {};

    try {
      // Fetch counts for standard resources
      const promises = resourceTypes.map(async (resourceType) => {
        try {
          let resources;
          if (resourceType === 'deployments') {
            resources = await listResources(
              currentContext.name,
              resourceType,
              { namespace: namespaceName, apiGroup: 'apps' }
            );
          } else {
            resources = await listResources(
              currentContext.name,
              resourceType,
              { namespace: namespaceName }
            );
          }
          counts[resourceType] = resources.length;
        } catch (err) {
          console.error(`Error fetching ${resourceType}:`, err);
          counts[resourceType] = 0;
        }
      });

      await Promise.all(promises);
      setResourceCounts(counts);
    } catch (err) {
      console.error('Error fetching resource counts:', err);
    }
  };

  const handleDelete = () => {
    setShowDeleteDialog(true);
  };

  const confirmResourceDeletion = async () => {
    if (!namespaceData || !currentContext) {
      setShowDeleteDialog(false);
      return;
    }

    try {
      setDeleteLoading(true);

      await deleteResource(
        currentContext.name,
        'namespaces',
        namespaceData.metadata?.name as string,
        {
          // No namespace parameter since namespaces are cluster-scoped
          // Note: Namespace is in the core API group, so no apiGroup parameter needed
        }
      );

      // Navigate back to the namespaces list
      navigate('/dashboard/explore/namespaces');
    } catch (err) {
      console.error('Failed to delete namespace:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete namespace');
    } finally {
      setDeleteLoading(false);
      setShowDeleteDialog(false);
    }
  };

  // Handle refresh data
  const handleRefresh = () => {
    setLoading(true);
    // Refetch data
    if (currentContext && namespaceName) {
      Promise.all([
        getResource<'namespaces'>(
          currentContext.name,
          'namespaces',
          namespaceName
        ),
        fetchEvents(),
        fetchResourceCounts()
      ]).then(([data]) => {
        setNamespaceData(data);
        setLoading(false);
      }).catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to refresh data');
        setLoading(false);
      });
    }
  };

  // Get namespace status
  const getNamespaceStatus = () => {
    if (!namespaceData || !namespaceData.status) {
      return { status: 'Unknown', isActive: false };
    }

    const phase = namespaceData.status.phase;

    if (phase === 'Active') {
      return { status: 'Active', isActive: true };
    } else if (phase === 'Terminating') {
      return { status: 'Terminating', isActive: false };
    }

    return { status: phase || 'Unknown', isActive: false };
  };

  // Get namespace age
  const getNamespaceAge = () => {
    if (!namespaceData?.metadata?.creationTimestamp) {
      return 'N/A';
    }

    const creationTime = new Date(namespaceData.metadata.creationTimestamp);
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
          <AlertTitle>Error loading namespace data</AlertTitle>
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

  // If no namespace data
  if (!namespaceData || !namespaceData.metadata) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTitle>No namespace data available</AlertTitle>
          <AlertDescription>
            The requested namespace was not found or could not be retrieved.
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

  // Get namespace status
  const { status, isActive } = getNamespaceStatus();
  const statusColor = isActive ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400';

  return (
    <div className='
           max-h-[92vh] overflow-y-auto
          scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent
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
              <BreadcrumbLink onClick={() => navigate('/dashboard/explore/namespaces')}>Namespaces</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink>{namespaceData.metadata.name}</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header section */}
        <div className="mb-6">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{namespaceData.metadata.name}</h1>
                <Badge
                  className={`${isActive
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'}`}
                >
                  {status}
                </Badge>
              </div>
              <div className="text-gray-500 dark:text-gray-400">
                Created: <span className="text-gray-700 dark:text-gray-300">{formatDateTime(namespaceData.metadata.creationTimestamp?.toString())}</span>
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

        {namespaceData && (
          <DeletionDialog
            isOpen={showDeleteDialog}
            onClose={() => setShowDeleteDialog(false)}
            onConfirm={confirmResourceDeletion}
            title="Delete Namespace"
            description={`Are you sure you want to delete the namespace "${namespaceData.metadata.name}"? This action cannot be undone and will delete ALL resources within this namespace.`}
            resourceName={namespaceData.metadata.name as string}
            resourceType="Namespace"
            isLoading={deleteLoading}
          />
        )}

        {/* Namespace terminating warning */}
        {status === 'Terminating' && (
          <Alert className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Namespace is terminating</AlertTitle>
            <AlertDescription>
              This namespace is in the process of being deleted. Resources within it may not be accessible or fully functional.
            </AlertDescription>
          </Alert>
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
            <TabsTrigger value="resources">Resources</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 bg-transparent">
            {/* Namespace Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Package className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-medium">Status</h3>
                </div>
                <div className={`text-lg font-semibold ${statusColor}`}>
                  {status}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Namespace State
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-purple-500" />
                  <h3 className="text-sm font-medium">Age</h3>
                </div>
                <div className="text-lg font-semibold">
                  {getNamespaceAge()}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Since creation
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Layers className="h-4 w-4 text-green-500" />
                  <h3 className="text-sm font-medium">Resources</h3>
                </div>
                <div className="text-lg font-semibold">
                  {Object.values(resourceCounts).reduce((sum, count) => sum + count, 0)}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Total resources in namespace
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Lock className="h-4 w-4 text-orange-500" />
                  <h3 className="text-sm font-medium">Label Count</h3>
                </div>
                <div className="text-lg font-semibold">
                  {Object.keys(namespaceData.metadata?.labels || {}).length}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Labels attached to namespace
                </div>
              </div>
            </div>

            {/* Namespace Properties */}
            <PropertiesViewer
              metadata={namespaceData.metadata}
              kind="Namespace"
              status={status}
              additionalProperties={[
                {
                  label: "Phase",
                  value: namespaceData.status?.phase || 'Unknown'
                },
                {
                  label: "Age",
                  value: getNamespaceAge()
                }
              ]}
            />

            {/* Resource Counts */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
              <h2 className="text-lg font-medium mb-4">Resource Counts</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <ResourceCountCard
                  type="pods"
                  count={resourceCounts.pods || 0}
                  namespace={namespaceData.metadata.name}
                />
                <ResourceCountCard
                  type="deployments"
                  count={resourceCounts.deployments || 0}
                  namespace={namespaceData.metadata.name}
                />
                <ResourceCountCard
                  type="services"
                  count={resourceCounts.services || 0}
                  namespace={namespaceData.metadata.name}
                />
                <ResourceCountCard
                  type="configmaps"
                  count={resourceCounts.configmaps || 0}
                  namespace={namespaceData.metadata.name}
                />
                <ResourceCountCard
                  type="secrets"
                  count={resourceCounts.secrets || 0}
                  namespace={namespaceData.metadata.name}
                />
                <ResourceCountCard
                  type="persistentvolumeclaims"
                  count={resourceCounts.persistentvolumeclaims || 0}
                  namespace={namespaceData.metadata.name}
                />
              </div>
            </div>

            {/* Namespace Settings */}
            {(namespaceData.spec || hasResourceQuotas(namespaceData) || hasLimitRanges(namespaceData)) && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
                <h2 className="text-lg font-medium mb-4">Namespace Settings</h2>

                {namespaceData.spec?.finalizers && namespaceData.spec.finalizers.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-sm font-medium mb-2">Finalizers</h3>
                    <div className="flex flex-wrap gap-1">
                      {namespaceData.spec.finalizers.map((finalizer, index) => (
                        <Badge key={index} variant="outline">
                          {finalizer}
                        </Badge>
                      ))}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Finalizers prevent the namespace from being deleted until specific conditions are met
                    </div>
                  </div>
                )}

                {/* Placeholder for ResourceQuotas and LimitRanges */}
                <div className="text-sm">
                  {hasResourceQuotas(namespaceData) && (
                    <div className="mb-2">
                      <span className="font-medium">Resource Quotas: </span>
                      <Button
                        variant="link"
                        className="p-0 h-auto text-blue-600 dark:text-blue-400"
                        onClick={() => navigate(`/dashboard/explore/resourcequotas?namespace=${namespaceData.metadata?.name?.toString()}`)}
                      >
                        View Quotas
                      </Button>
                    </div>
                  )}

                  {hasLimitRanges(namespaceData) && (
                    <div>
                      <span className="font-medium">Limit Ranges: </span>
                      <Button
                        variant="link"
                        className="p-0 h-auto text-blue-600 dark:text-blue-400"
                        onClick={() => navigate(`/dashboard/explore/limitranges?namespace=${namespaceData.metadata?.name?.toString()}`)}
                      >
                        View Limits
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Recent Events */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-medium">Recent Events</h2>
                <Button
                  variant="link"
                  className="text-blue-600 dark:text-blue-400"
                  onClick={() => navigate(`/dashboard/explore/events/${namespaceData.metadata?.name?.toString()}`)}
                >
                  View all events
                </Button>
              </div>

              <EventsViewer
                events={events.slice(0, 5)} // Display only 5 most recent events
                namespace={namespaceData.metadata.name}
              />
            </div>
          </TabsContent>

          <TabsContent value="yaml" className="space-y-6">
            <ResourceViewerYamlTab
              resourceData={namespaceData}
              currentContext={currentContext}
            />
          </TabsContent>

          <TabsContent value="events" className="space-y-6">
            <EventsViewer
              events={events}
              namespace={namespaceData.metadata.name}
            />
          </TabsContent>

          <TabsContent value="resources" className="space-y-6">
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
              <h2 className="text-lg font-medium mb-4">Resources in {namespaceData.metadata.name}</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ResourceSection
                  title="Workloads"
                  items={[
                    { name: "Pods", count: resourceCounts.pods || 0, path: `/dashboard/explore/pods?namespace=${namespaceData.metadata.name}` },
                    { name: "Deployments", count: resourceCounts.deployments || 0, path: `/dashboard/explore/deployments?namespace=${namespaceData.metadata.name}` },
                    { name: "StatefulSets", count: 0, path: `/dashboard/explore/statefulsets?namespace=${namespaceData.metadata.name}` },
                    { name: "DaemonSets", count: 0, path: `/dashboard/explore/daemonsets?namespace=${namespaceData.metadata.name}` },
                    { name: "Jobs", count: 0, path: `/dashboard/explore/jobs?namespace=${namespaceData.metadata.name}` },
                    { name: "CronJobs", count: 0, path: `/dashboard/explore/cronjobs?namespace=${namespaceData.metadata.name}` },
                  ]}
                />

                <ResourceSection
                  title="Networking"
                  items={[
                    { name: "Services", count: resourceCounts.services || 0, path: `/dashboard/explore/services?namespace=${namespaceData.metadata.name}` },
                    { name: "Ingresses", count: 0, path: `/dashboard/explore/ingresses?namespace=${namespaceData.metadata.name}` },
                    { name: "NetworkPolicies", count: 0, path: `/dashboard/explore/networkpolicies?namespace=${namespaceData.metadata.name}` },
                  ]}
                />

                <ResourceSection
                  title="Configuration"
                  items={[
                    { name: "ConfigMaps", count: resourceCounts.configmaps || 0, path: `/dashboard/explore/configmaps?namespace=${namespaceData.metadata.name}` },
                    { name: "Secrets", count: resourceCounts.secrets || 0, path: `/dashboard/explore/secrets?namespace=${namespaceData.metadata.name}` },
                  ]}
                />

                <ResourceSection
                  title="Storage"
                  items={[
                    { name: "Persistent Volume Claims", count: resourceCounts.persistentvolumeclaims || 0, path: `/dashboard/explore/persistentvolumeclaims?namespace=${namespaceData.metadata.name}` },
                  ]}
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

// Resource Count Card Component
interface ResourceCountCardProps {
  type: string;
  count: number;
  namespace?: string;
}

const ResourceCountCard: React.FC<ResourceCountCardProps> = ({ type, count, namespace }) => {
  const navigate = useNavigate();

  const getResourceIcon = (type: string) => {
    switch (type) {
      case 'pods':
        return <div className="h-8 w-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
          <Package className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        </div>;
      case 'deployments':
        return <div className="h-8 w-8 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
          <Layers className="h-4 w-4 text-green-600 dark:text-green-400" />
        </div>;
      case 'services':
        return <div className="h-8 w-8 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
          <Package className="h-4 w-4 text-purple-600 dark:text-purple-400" />
        </div>;
      default:
        return <div className="h-8 w-8 bg-gray-100 dark:bg-gray-900/30 rounded-full flex items-center justify-center">
          <Package className="h-4 w-4 text-gray-600 dark:text-gray-400" />
        </div>;
    }
  };

  const getResourceDisplayName = (type: string) => {
    switch (type) {
      case 'persistentvolumeclaims':
        return 'PV Claims';
      default:
        return type.charAt(0).toUpperCase() + type.slice(1);
    }
  };

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30 cursor-pointer"
      onClick={() => navigate(`/dashboard/explore/${type}?namespace=${namespace}`)}
    >
      {getResourceIcon(type)}
      <div>
        <div className="font-medium">{getResourceDisplayName(type)}</div>
        <div className="text-sm text-gray-500 dark:text-gray-400">{count}</div>
      </div>
    </div>
  );
};

// Resource Section Component
interface ResourceSectionProps {
  title: string;
  items: { name: string; count: number; path: string }[];
}

const ResourceSection: React.FC<ResourceSectionProps> = ({ title, items }) => {
  const navigate = useNavigate();

  return (
    <div>
      <h3 className="text-md font-medium mb-2">{title}</h3>
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.name}
            className="flex justify-between items-center p-2 rounded border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30 cursor-pointer"
            onClick={() => navigate(item.path)}
          >
            <span>{item.name}</span>
            <Button variant={item.count > 0 ? "default" : "outline"}>
              {item.count}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};

// Helper functions
const hasResourceQuotas = (namespace: V1Namespace): boolean => {
  // This is a placeholder. In a real implementation, you'd check if ResourceQuotas exist
  // by fetching them for this namespace or checking annotations
  return false;
};

const hasLimitRanges = (namespace: V1Namespace): boolean => {
  // This is a placeholder. In a real implementation, you'd check if LimitRanges exist
  // by fetching them for this namespace or checking annotations
  return false;
};

export default NamespaceViewer;