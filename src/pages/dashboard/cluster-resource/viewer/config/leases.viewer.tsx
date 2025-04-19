import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { V1Lease, CoreV1Event } from '@kubernetes/client-node';
import { getResource, listResources } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';

// Component imports
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ChevronRight, AlertCircle, Clock, ArrowLeft, RefreshCw, Activity, Users } from "lucide-react";
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
import { ResourceViewerYamlTab } from '@/components/custom';

// Define interface for Lease data with events
interface LeaseData extends V1Lease {
  events?: CoreV1Event[];
}

const LeaseViewer: React.FC = () => {
  const [leaseData, setLeaseData] = useState<LeaseData | null>(null);
  const [events, setEvents] = useState<CoreV1Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { currentContext } = useCluster();
  const { leaseName, namespace } = useParams<{ leaseName: string; namespace: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const defaultTab = tabParam || 'overview';

  // Fetch events for the lease
  const fetchEvents = async () => {
    if (!currentContext || !namespace) return;

    try {
      // Fetch all events in the namespace
      const eventData = await listResources<'events'>(
        currentContext.name,
        'events',
        { namespace }
      );

      // Filter events for this lease
      const filteredEvents = eventData.filter(event => {
        return (
          event.involvedObject?.kind === 'Lease' &&
          event.involvedObject?.name === leaseName
        );
      });

      setEvents(filteredEvents);
    } catch (err) {
      console.error('Error fetching events:', err);
    }
  };

  // Fetch lease data and events
  useEffect(() => {
    const fetchLeaseData = async () => {
      if (!currentContext || !leaseName || !namespace) {
        setLoading(false);
        setError("Missing required parameters");
        return;
      }

      try {
        setLoading(true);

        // Get lease details
        const data = await getResource<'leases'>(
          currentContext.name,
          'leases',
          leaseName,
          namespace,
          'coordination.k8s.io', // API group for Leases
          'v1' // API version
        );

        setLeaseData(data as LeaseData);
        setError(null);

        // Fetch related events
        await fetchEvents();
      } catch (err) {
        console.error('Error fetching lease:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch lease data');
      } finally {
        setLoading(false);
      }
    };

    fetchLeaseData();
  }, [currentContext, namespace, leaseName]);

  // Handle refresh data
  const handleRefresh = () => {
    setLoading(true);
    // Refetch data
    if (currentContext && leaseName && namespace) {
      Promise.all([
        getResource<'leases'>(
          currentContext.name,
          'leases',
          leaseName,
          namespace,
          'coordination.k8s.io',
          'v1'
        ),
        fetchEvents()
      ]).then(([data]) => {
        setLeaseData(data as LeaseData);
        setLoading(false);
      }).catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to refresh data');
        setLoading(false);
      });
    }
  };

  // Calculate lease age
  const getLeaseAge = () => {
    if (!leaseData?.metadata?.creationTimestamp) {
      return 'N/A';
    }

    const creationTime = new Date(leaseData.metadata.creationTimestamp);
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

  // Check if lease is active
  const isLeaseActive = () => {
    if (!leaseData?.spec?.renewTime) return false;

    const renewTime = new Date(leaseData.spec.renewTime);
    const now = new Date();

    // If the lease hasn't been renewed in 1 minute, consider it inactive
    // (This is a simple heuristic - actual determination depends on the lease's intended duration)
    return (now.getTime() - renewTime.getTime()) < 60000;
  };

  // Format time in seconds nicely
  const formatDuration = (seconds: number | undefined) => {
    if (seconds === undefined) return 'N/A';

    if (seconds < 60) {
      return `${seconds} second${seconds !== 1 ? 's' : ''}`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    } else {
      const hours = Math.floor(seconds / 3600);
      return `${hours} hour${hours !== 1 ? 's' : ''}`;
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
          <AlertTitle>Error loading lease data</AlertTitle>
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

  // If no lease data
  if (!leaseData || !leaseData.metadata) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTitle>No lease data available</AlertTitle>
          <AlertDescription>
            The requested lease was not found or could not be retrieved.
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

  // Format renewTime for display
  const renewTimeFormatted = leaseData.spec?.renewTime
    ? new Date(leaseData.spec.renewTime).toLocaleString()
    : 'Never';

  // Calculate time since last renewal
  const getTimeSinceRenewal = () => {
    if (!leaseData.spec?.renewTime) return 'Never renewed';

    const renewTime = new Date(leaseData.spec.renewTime);
    const now = new Date();
    const diffMs = now.getTime() - renewTime.getTime();

    if (diffMs < 1000) return 'Just now';
    if (diffMs < 60000) return `${Math.floor(diffMs / 1000)} seconds ago`;
    if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)} minutes ago`;
    if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)} hours ago`;
    return `${Math.floor(diffMs / 86400000)} days ago`;
  };

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
              <BreadcrumbLink href="/dashboard/explore/leases">Leases</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink href={`/dashboard/explore/leases?namespace=${namespace}`}>{namespace}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink>{leaseData.metadata.name}</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header section */}
        <div className="mb-6">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{leaseData.metadata.name}</h1>
                <Badge
                  className={isLeaseActive()
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                    : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'}
                >
                  {isLeaseActive() ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <div className="text-gray-500 dark:text-gray-400">
                Namespace: <span onClick={() => navigate(`/dashboard/explore/namespaces/${leaseData.metadata?.namespace}`)} className="text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">{leaseData.metadata.namespace}</span>
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
            </div>
          </div>
        </div>

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
            {/* Lease Info Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-medium">Holder</h3>
                </div>
                <div className="text-lg font-semibold truncate">
                  {leaseData.spec?.holderIdentity || 'None'}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Current lease holder
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="h-4 w-4 text-purple-500" />
                  <h3 className="text-sm font-medium">Last Renewal</h3>
                </div>
                <div className="text-lg font-semibold">
                  {getTimeSinceRenewal()}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {renewTimeFormatted}
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-orange-500" />
                  <h3 className="text-sm font-medium">Age</h3>
                </div>
                <div className="text-lg font-semibold">
                  {getLeaseAge()}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Created {leaseData.metadata.creationTimestamp &&
                    new Date(leaseData.metadata.creationTimestamp).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Lease Information */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
              <h2 className="text-lg font-medium mb-4">Lease Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-1 gap-6">
                {/* Lease specification */}
                <div>
                  <h3 className="text-sm font-medium mb-3">Specification</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Holder Identity:</span>
                      <span className="font-medium">{leaseData.spec?.holderIdentity || 'None'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Lease Duration:</span>
                      <span className="font-medium">{formatDuration(leaseData.spec?.leaseDurationSeconds)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Acquire Time:</span>
                      <span className="font-medium">
                        {leaseData.spec?.acquireTime
                          ? new Date(leaseData.spec.acquireTime).toLocaleString()
                          : 'Not acquired'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Renew Time:</span>
                      <span className="font-medium">{renewTimeFormatted}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Lease Transitions:</span>
                      <span className="font-medium">{leaseData.spec?.leaseTransitions || 0}</span>
                    </div>
                  </div>
                </div>


              </div>
            </div>

            {/* Lease Properties */}
            <PropertiesViewer
              metadata={leaseData.metadata}
              kind="Lease"
              additionalProperties={[
                {
                  label: "Holder Identity",
                  value: leaseData.spec?.holderIdentity || 'None'
                },
                {
                  label: "Lease Duration",
                  value: formatDuration(leaseData.spec?.leaseDurationSeconds)
                },
                {
                  label: "Last Renewed",
                  value: getTimeSinceRenewal()
                }
              ]}
            />

            {/* Lease Events */}
            {events.length > 0 && (
              <EventsViewer
                events={events}
                resourceName={leaseData.metadata.name}
                resourceKind="Lease"
                namespace={leaseData.metadata.namespace}
              />
            )}
          </TabsContent>

          <TabsContent value="yaml" className="space-y-6">
            <ResourceViewerYamlTab
              resourceData={leaseData}
              namespace={leaseData.metadata.namespace || ''}
              currentContext={currentContext}
            />
          </TabsContent>

          <TabsContent value="events" className="space-y-6">
            <EventsViewer
              events={events}
              namespace={leaseData.metadata.namespace}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default LeaseViewer;