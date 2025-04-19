import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CoreV1Event } from '@kubernetes/client-node';
import {
  getResource,
  listResources
} from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';

// Component imports
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ChevronRight, AlertCircle, Clock, ArrowLeft, RefreshCw, Shield, Target, Percent } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import KUBERNETES_LOGO from '@/assets/kubernetes.svg';
import { V1PodDisruptionBudget } from '@kubernetes/client-node';
// Custom component imports
import PropertiesViewer from '../components/properties.viewer';
import EventsViewer from '../components/event.viewer';
import { ResourceViewerYamlTab } from '@/components/custom';
import { useSearchParams } from 'react-router-dom';

// Define interface for PDB data with events
interface PDBData extends V1PodDisruptionBudget {
  events?: CoreV1Event[];
}

const PodDisruptionBudgetViewer: React.FC = () => {
  const [pdbData, setPDBData] = useState<PDBData | null>(null);
  const [events, setEvents] = useState<CoreV1Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { currentContext } = useCluster();
  const { pdbName, namespace } = useParams<{ pdbName: string; namespace: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const defaultTab = tabParam || 'overview';

  // Fetch events for the PDB
  const fetchEvents = async () => {
    if (!currentContext || !namespace) return;

    try {
      // Fetch all events in the namespace
      const eventData = await listResources<'events'>(
        currentContext.name,
        'events',
        { namespace }
      );

      // Filter events for this PDB
      const filteredEvents = eventData.filter(event => {
        return (
          event.involvedObject?.kind === 'PodDisruptionBudget' &&
          event.involvedObject?.name === pdbName
        );
      });

      setEvents(filteredEvents);
    } catch (err) {
      console.error('Error fetching events:', err);
    }
  };

  // Fetch PDB data and events
  useEffect(() => {
    const fetchPDBData = async () => {
      if (!currentContext || !pdbName || !namespace) {
        setLoading(false);
        setError("Missing required parameters");
        return;
      }

      try {
        setLoading(true);

        // Get PDB details
        const data = await getResource(
          currentContext.name,
          'poddisruptionbudgets',
          pdbName,
          namespace,
          'policy', // API group for PDBs
          'v1' // API version
        );

        setPDBData(data as PDBData);
        setError(null);

        // Fetch related events
        await fetchEvents();
      } catch (err) {
        console.error('Error fetching PDB:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch PDB data');
      } finally {
        setLoading(false);
      }
    };

    fetchPDBData();
  }, [currentContext, namespace, pdbName]);

  // Handle refresh data
  const handleRefresh = () => {
    setLoading(true);
    // Refetch data
    if (currentContext && pdbName && namespace) {
      Promise.all([
        getResource(
          currentContext.name,
          'poddisruptionbudgets',
          pdbName,
          namespace,
          'policy',
          'v1'
        ),
        fetchEvents()
      ]).then(([data]) => {
        setPDBData(data as PDBData);
        setLoading(false);
      }).catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to refresh data');
        setLoading(false);
      });
    }
  };

  // Calculate PDB age
  const getPDBAge = () => {
    if (!pdbData?.metadata?.creationTimestamp) {
      return 'N/A';
    }

    const creationTime = new Date(pdbData.metadata.creationTimestamp);
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

  // Get PDB health status
  const getPDBStatus = () => {
    if (!pdbData || !pdbData.status) {
      return { status: 'Unknown', isHealthy: false };
    }

    const currentHealthy = pdbData.status.currentHealthy || 0;
    const desiredHealthy = pdbData.status.desiredHealthy || 0;
    const disruptionsAllowed = pdbData.status.disruptionsAllowed || 0;

    // Check if generation is up-to-date
    if (pdbData.metadata?.generation && pdbData.status.observedGeneration &&
      pdbData.metadata.generation > pdbData.status.observedGeneration) {
      return { status: 'Updating', isHealthy: false };
    }

    // Check if enough pods are healthy
    if (currentHealthy < desiredHealthy) {
      return { status: 'Unhealthy', isHealthy: false };
    }

    // Check if disruptions are allowed
    if (disruptionsAllowed === 0) {
      return { status: 'NoDisruptionsAllowed', isHealthy: true };
    }

    return { status: 'Healthy', isHealthy: true };
  };

  // Status alert component based on PDB status
  const PDBStatusAlert = () => {
    const { status, isHealthy } = getPDBStatus();

    if (isHealthy) return null; // No alert for healthy PDBs

    let alertType: "default" | "info" | "warning" | "destructive" | null = "warning";
    let icon = <AlertCircle className="h-4 w-4" />;
    let title = "";
    let description = "";

    if (status === 'Updating') {
      title = "PDB is Updating";
      description = "The Pod Disruption Budget configuration is being updated. Status may not reflect the latest configuration.";
    } else if (status === 'Unhealthy') {
      title = "Not Enough Healthy Pods";
      description = "The number of healthy pods is below the desired minimum. No disruptions are allowed.";
      alertType = "destructive";
    } else {
      title = "PDB Status Unknown";
      description = "The status of the PDB could not be determined.";
    }

    return (
      <Alert className="mb-6 bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-yellow-800">
        {icon}
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{description}</AlertDescription>
      </Alert>
    );
  };

  // Format budget constraint
  const formatBudgetConstraint = () => {
    if (pdbData?.spec?.minAvailable !== undefined) {
      return `Minimum available: ${pdbData.spec.minAvailable}`;
    } else if (pdbData?.spec?.maxUnavailable !== undefined) {
      return `Maximum unavailable: ${pdbData.spec.maxUnavailable}`;
    }
    return 'No constraint defined';
  };

  // Calculate health percentage
  const calculateHealthPercentage = () => {
    if (!pdbData?.status?.expectedPods || pdbData.status.expectedPods === 0) {
      return 0;
    }

    return (pdbData.status.currentHealthy || 0) / pdbData.status.expectedPods * 100;
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
          <AlertTitle>Error loading PDB data</AlertTitle>
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

  // If no PDB data
  if (!pdbData || !pdbData.metadata) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTitle>No PodDisruptionBudget data available</AlertTitle>
          <AlertDescription>
            The requested PodDisruptionBudget was not found or could not be retrieved.
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

  // Calculate PDB status and metrics
  const { status } = getPDBStatus();
  const currentHealthy = pdbData.status?.currentHealthy || 0;
  const desiredHealthy = pdbData.status?.desiredHealthy || 0;
  const expectedPods = pdbData.status?.expectedPods || 0;
  const disruptionsAllowed = pdbData.status?.disruptionsAllowed || 0;
  const statusColor = status === 'Healthy' || status === 'NoDisruptionsAllowed'
    ? 'text-green-600 dark:text-green-400'
    : 'text-yellow-600 dark:text-yellow-400';
  const healthPercentage = calculateHealthPercentage();

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
              <BreadcrumbLink href="/dashboard/explore/poddisruptionbudgets">PDBs</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink href={`/dashboard/explore/poddisruptionbudgets?namespace=${namespace}`}>{namespace}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink>{pdbData.metadata.name}</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header section */}
        <div className="mb-6">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{pdbData.metadata.name}</h1>
                <Badge
                  className={status === 'Healthy' || status === 'NoDisruptionsAllowed'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                    : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'}
                >
                  {status}
                </Badge>
              </div>
              <div className="text-gray-500 dark:text-gray-400">
                Namespace: <span onClick={() => navigate(`/dashboard/explore/namespaces/${pdbData.metadata?.namespace}`)} className="text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">{pdbData.metadata.namespace}</span>
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

        {/* Status alert if needed */}
        <PDBStatusAlert />

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
            {/* PDB Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-medium">Healthy Pods</h3>
                </div>
                <div className="text-2xl font-semibold">
                  {currentHealthy}/{expectedPods}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Current/Expected
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4 text-green-500" />
                  <h3 className="text-sm font-medium">Minimum Healthy</h3>
                </div>
                <div className="text-2xl font-semibold">
                  {desiredHealthy}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Required healthy pods
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Percent className="h-4 w-4 text-purple-500" />
                  <h3 className="text-sm font-medium">Disruptions Allowed</h3>
                </div>
                <div className="text-2xl font-semibold">
                  {disruptionsAllowed}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Pods that can be evicted
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-orange-500" />
                  <h3 className="text-sm font-medium">Age</h3>
                </div>
                <div className="text-2xl font-semibold">
                  {getPDBAge()}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Created {pdbData.metadata.creationTimestamp &&
                    new Date(pdbData.metadata.creationTimestamp).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Health Status */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
              <h2 className="text-lg font-medium mb-4">Pod Health Status</h2>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Healthy Pods</span>
                  <span className="text-sm">{currentHealthy} of {expectedPods} ({Math.round(healthPercentage)}%)</span>
                </div>
                <Progress
                  value={healthPercentage}
                  className="h-2"
                />
                <div className="flex justify-between mt-2">
                  <div className="text-sm">
                    <span className="font-medium">Constraint:</span> {formatBudgetConstraint()}
                  </div>
                  <div className="text-sm">
                    <span className={`font-medium ${disruptionsAllowed > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {disruptionsAllowed > 0
                        ? `${disruptionsAllowed} disruption${disruptionsAllowed > 1 ? 's' : ''} allowed`
                        : 'No disruptions allowed'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Pod Selector */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
              <h2 className="text-lg font-medium mb-4">Pod Selector</h2>
              <div className="space-y-3">
                {!pdbData.spec?.selector && (
                  <div className="text-gray-500 dark:text-gray-400">
                    No selector specified. This PDB applies to all pods in the namespace.
                  </div>
                )}

                {pdbData.spec?.selector?.matchLabels && (
                  <div>
                    <h3 className="text-sm font-medium mb-2">Match Labels</h3>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(pdbData.spec.selector.matchLabels).map(([key, value]) => (
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

                {pdbData.spec?.selector?.matchExpressions && pdbData.spec.selector.matchExpressions.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-sm font-medium mb-2">Match Expressions</h3>
                    <div className="space-y-2">
                      {pdbData.spec.selector.matchExpressions.map((expr, index) => (
                        <div key={index} className="p-2 rounded-md bg-gray-50 dark:bg-gray-800">
                          <span className="font-medium">{expr.key}</span>{' '}
                          <span className="text-gray-600 dark:text-gray-400">{expr.operator}</span>{' '}
                          {expr.values && (
                            <span>
                              [{expr.values.join(', ')}]
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* PDB Properties */}
            <PropertiesViewer
              metadata={pdbData.metadata}
              kind="PodDisruptionBudget"
              status={status}
              additionalProperties={[
                {
                  label: "Budget Constraint",
                  value: formatBudgetConstraint()
                },
                {
                  label: "Current Healthy",
                  value: `${currentHealthy} of ${expectedPods} pods`
                },
                {
                  label: "Desired Healthy",
                  value: desiredHealthy.toString()
                },
                {
                  label: "Disruptions Allowed",
                  value: disruptionsAllowed.toString()
                }
              ]}
            />

            {/* PDB Events */}
            <EventsViewer
              events={events}
              resourceName={pdbData.metadata.name}
              resourceKind="PodDisruptionBudget"
              namespace={pdbData.metadata.namespace}
            />
          </TabsContent>

          <TabsContent value="yaml" className="space-y-6">
            <ResourceViewerYamlTab
              resourceData={pdbData}
              namespace={pdbData.metadata.namespace || ''}
              currentContext={currentContext}
            />
          </TabsContent>

          <TabsContent value="events" className="space-y-6">
            <EventsViewer
              events={events}
              namespace={pdbData.metadata.namespace}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default PodDisruptionBudgetViewer;