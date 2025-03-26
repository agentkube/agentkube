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
import { ChevronRight, AlertCircle, Clock, ArrowLeft, RefreshCw, Zap, Target, Cpu, HardDrive } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import KUBERNETES_LOGO from '@/assets/kubernetes.svg';

// Custom component imports
import PropertiesViewer from '../components/properties.viewer';
import EventsViewer from '../components/event.viewer';
import { ResourceViewerYamlTab } from '@/components/custom';

// Define interface for VPA
interface V1VerticalPodAutoscaler {
  metadata: {
    name: string;
    namespace: string;
    creationTimestamp: Date;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    uid?: string;
    resourceVersion?: string;
    generation?: number;
  };
  spec?: {
    targetRef?: {
      apiVersion?: string;
      kind?: string;
      name?: string;
    };
    updatePolicy?: {
      updateMode?: string;
    };
    resourcePolicy?: {
      containerPolicies?: Array<{
        containerName?: string;
        mode?: string;
        minAllowed?: Record<string, string>;
        maxAllowed?: Record<string, string>;
      }>;
    };
  };
  status?: {
    recommendation?: {
      containerRecommendations?: Array<{
        containerName?: string;
        target?: Record<string, string>;
        lowerBound?: Record<string, string>;
        upperBound?: Record<string, string>;
        uncappedTarget?: Record<string, string>;
      }>;
    };
    conditions?: Array<{
      type?: string;
      status?: string;
      lastTransitionTime?: string;
      reason?: string;
      message?: string;
    }>;
  };
}

// Define interface for VPA data with events
interface VPAData extends V1VerticalPodAutoscaler {
  events?: CoreV1Event[];
}

const VerticalPodAutoscalerViewer: React.FC = () => {
  const [vpaData, setVPAData] = useState<VPAData | null>(null);
  const [events, setEvents] = useState<CoreV1Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { currentContext } = useCluster();
  const { vpaName, namespace } = useParams<{ vpaName: string; namespace: string }>();
  const navigate = useNavigate();

  // Fetch events for the VPA
  const fetchEvents = async () => {
    if (!currentContext || !namespace) return;

    try {
      // Fetch all events in the namespace
      const eventData = await listResources<'events'>(
        currentContext.name,
        'events',
        { namespace }
      );

      // Filter events for this VPA
      const filteredEvents = eventData.filter(event => {
        return (
          event.involvedObject?.kind === 'VerticalPodAutoscaler' &&
          event.involvedObject?.name === vpaName
        );
      });

      setEvents(filteredEvents);
    } catch (err) {
      console.error('Error fetching events:', err);
    }
  };

  // Fetch VPA data and events
  useEffect(() => {
    const fetchVPAData = async () => {
      if (!currentContext || !vpaName || !namespace) {
        setLoading(false);
        setError("Missing required parameters");
        return;
      }

      try {
        setLoading(true);

        // Get VPA details
        const data = await getResource(
          currentContext.name,
          'verticalpodautoscalers',
          vpaName,
          namespace,
          'autoscaling.k8s.io', // API group for VPAs
          'v1' // API version
        );

        setVPAData(data as VPAData);
        setError(null);

        // Fetch related events
        await fetchEvents();
      } catch (err) {
        console.error('Error fetching VPA:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch VPA data');
      } finally {
        setLoading(false);
      }
    };

    fetchVPAData();
  }, [currentContext, namespace, vpaName]);

  // Handle refresh data
  const handleRefresh = () => {
    setLoading(true);
    // Refetch data
    if (currentContext && vpaName && namespace) {
      Promise.all([
        getResource(
          currentContext.name,
          'verticalpodautoscalers',
          vpaName,
          namespace,
          'autoscaling.k8s.io',
          'v1'
        ),
        fetchEvents()
      ]).then(([data]) => {
        setVPAData(data as VPAData);
        setLoading(false);
      }).catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to refresh data');
        setLoading(false);
      });
    }
  };

  // Calculate VPA age
  const getVPAAge = () => {
    if (!vpaData?.metadata?.creationTimestamp) {
      return 'N/A';
    }

    const creationTime = new Date(vpaData.metadata.creationTimestamp);
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

  // Format resource value (memory, CPU)
  const formatResourceValue = (value: string | undefined, resourceType: 'cpu' | 'memory'): string => {
    if (!value) return 'N/A';

    if (resourceType === 'cpu') {
      // Handle CPU formatting
      const numValue = parseFloat(value);
      if (isNaN(numValue)) return value;

      if (value.endsWith('m')) {
        return value;
      } else if (numValue < 1) {
        return `${(numValue * 1000).toFixed(0)}m`;
      } else {
        return `${numValue.toFixed(numValue % 1 === 0 ? 0 : 1)} cores`;
      }
    } else {
      // Handle memory formatting
      if (value.endsWith('Ki') || value.endsWith('Mi') || value.endsWith('Gi') || value.endsWith('Ti')) {
        return value;
      }

      const bytes = parseInt(value);
      if (isNaN(bytes)) return value;

      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ki`;
      if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} Mi`;
      return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} Gi`;
    }
  };

  // Get update mode color class
  const getUpdateModeColorClass = (updateMode: string | undefined): string => {
    if (!updateMode) return 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300';

    switch (updateMode.toLowerCase()) {
      case 'auto':
        return 'bg-green-200 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'initial':
        return 'bg-blue-200 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'off':
        return 'bg-red-200 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      case 'recreate':
        return 'bg-purple-200 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
      default:
        return 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  // Status alert component based on VPA conditions
  const VPAStatusAlert = () => {
    // Check for problematic conditions
    const conditions = vpaData?.status?.conditions || [];
    const failedCondition = conditions.find(c => c.status === 'False' || c.type === 'Failed');

    if (!failedCondition) return null;

    return (
      <Alert className="mb-6 bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-yellow-800">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>{failedCondition.type} Condition Issue</AlertTitle>
        <AlertDescription>
          {failedCondition.message || 'The VPA has a condition indicating an issue. Check the detailed conditions below.'}
        </AlertDescription>
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
          <AlertTitle>Error loading VPA data</AlertTitle>
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

  // If no VPA data
  if (!vpaData || !vpaData.metadata) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTitle>No VerticalPodAutoscaler data available</AlertTitle>
          <AlertDescription>
            The requested VerticalPodAutoscaler was not found or could not be retrieved.
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

  // Extract key data
  const updateMode = vpaData.spec?.updatePolicy?.updateMode || 'N/A';
  const targetRef = vpaData.spec?.targetRef;
  const targetRefStr = targetRef ? `${targetRef.kind}/${targetRef.name}` : 'Not set';
  const containerPolicies = vpaData.spec?.resourcePolicy?.containerPolicies || [];
  const containerRecommendations = vpaData.status?.recommendation?.containerRecommendations || [];

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
              <BreadcrumbLink href="/dashboard/explore/verticalpodautoscalers">VPAs</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink href={`/dashboard/explore/verticalpodautoscalers?namespace=${namespace}`}>{namespace}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink>{vpaData.metadata.name}</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header section */}
        <div className="mb-6">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{vpaData.metadata.name}</h1>
                <Badge
                  className={getUpdateModeColorClass(updateMode)}
                >
                  {updateMode}
                </Badge>
              </div>
              <div className="text-gray-500 dark:text-gray-400">
                Namespace: <span onClick={() => navigate(`/dashboard/explore/namespaces/${vpaData.metadata?.namespace}`)} className="text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">{vpaData.metadata.namespace}</span>
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
        <VPAStatusAlert />

        {/* Main content tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
            <TabsTrigger value="yaml">YAML</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 bg-transparent">
            {/* VPA Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-medium">Target</h3>
                </div>
                <div className="text-lg font-semibold truncate">
                  {targetRefStr}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Resource being autoscaled
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="h-4 w-4 text-purple-500" />
                  <h3 className="text-sm font-medium">Update Mode</h3>
                </div>
                <div className="text-lg font-semibold">
                  {updateMode}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  How recommendations are applied
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-orange-500" />
                  <h3 className="text-sm font-medium">Age</h3>
                </div>
                <div className="text-lg font-semibold">
                  {getVPAAge()}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Created {vpaData.metadata.creationTimestamp &&
                    new Date(vpaData.metadata.creationTimestamp).toLocaleString()}
                </div>
              </div>
            </div>

            {/* VPA Properties */}
            <PropertiesViewer
              metadata={vpaData.metadata}
              kind="VerticalPodAutoscaler"
              additionalProperties={[
                {
                  label: "Target",
                  value: targetRefStr
                },
                {
                  label: "Update Mode",
                  value: updateMode
                },
                {
                  label: "Container Policies",
                  value: containerPolicies.length > 0 ? `${containerPolicies.length} policies defined` : 'None'
                },
                {
                  label: "Recommendations",
                  value: containerRecommendations.length > 0 ? `${containerRecommendations.length} recommendations` : 'None'
                }
              ]}
            />

            {/* Container Policies */}
            {containerPolicies.length > 0 && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
                <h2 className="text-lg font-medium mb-4">Container Policies</h2>
                <div className="space-y-4">
                  {containerPolicies.map((policy, index) => (
                    <div
                      key={index}
                      className="p-3 rounded-lg border border-gray-200 dark:border-gray-800"
                    >
                      <div className="font-medium mb-2">
                        {policy.containerName || '*'}
                        {policy.mode && (
                          <Badge variant="outline" className="ml-2">{policy.mode}</Badge>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Min Allowed */}
                        {policy.minAllowed && Object.keys(policy.minAllowed).length > 0 && (
                          <div>
                            <div className="text-sm font-medium mb-1">Min Allowed:</div>
                            <div className="text-sm space-y-1">
                              {Object.entries(policy.minAllowed).map(([resource, value]) => (
                                <div key={`min-${resource}`} className="flex justify-between">
                                  <span className="text-gray-600 dark:text-gray-400">{resource}:</span>
                                  <span>{formatResourceValue(value, resource as 'cpu' | 'memory')}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Max Allowed */}
                        {policy.maxAllowed && Object.keys(policy.maxAllowed).length > 0 && (
                          <div>
                            <div className="text-sm font-medium mb-1">Max Allowed:</div>
                            <div className="text-sm space-y-1">
                              {Object.entries(policy.maxAllowed).map(([resource, value]) => (
                                <div key={`max-${resource}`} className="flex justify-between">
                                  <span className="text-gray-600 dark:text-gray-400">{resource}:</span>
                                  <span>{formatResourceValue(value, resource as 'cpu' | 'memory')}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* VPA Conditions */}
            {vpaData.status?.conditions && vpaData.status.conditions.length > 0 && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
                <h2 className="text-lg font-medium mb-4">Conditions</h2>
                <div className="space-y-2">
                  {vpaData.status.conditions.map((condition, index) => (
                    <div
                      key={index}
                      className="border border-gray-200 dark:border-gray-800 rounded-md p-3"
                    >
                      <div className="flex justify-between">
                        <div className="font-medium">{condition.type}</div>
                        <Badge
                          className={condition.status === 'True'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                            : condition.status === 'False'
                              ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                              : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'}
                        >
                          {condition.status}
                        </Badge>
                      </div>
                      {condition.message && (
                        <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                          {condition.message}
                        </div>
                      )}
                      {condition.lastTransitionTime && (
                        <div className="mt-1 text-xs text-gray-500">
                          Last transition: {new Date(condition.lastTransitionTime).toLocaleString()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* VPA Events */}
            <EventsViewer
              events={events}
              resourceName={vpaData.metadata.name}
              resourceKind="VerticalPodAutoscaler"
              namespace={vpaData.metadata.namespace}
            />
          </TabsContent>

          <TabsContent value="recommendations" className="space-y-6">
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
              <h2 className="text-lg font-medium mb-4">Resource Recommendations</h2>

              {containerRecommendations.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  No recommendations available yet
                </div>
              ) : (
                <div className="space-y-6">
                  {containerRecommendations.map((rec, index) => (
                    <div key={index} className="border border-gray-200 dark:border-gray-800 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <h3 className="font-medium">Container: {rec.containerName || 'Default'}</h3>
                      </div>

                      {/* CPU Recommendations */}
                      {rec.target?.cpu && (
                        <div className="mb-6">
                          <div className="flex items-center gap-2 mb-2">
                            <Cpu className="h-4 w-4 text-blue-500" />
                            <h4 className="text-sm font-medium">CPU</h4>
                          </div>

                          <div className="space-y-4">
                            {/* CPU Range */}
                            <div className="mt-1 px-4">
                              <div className="h-8 relative">
                                {rec.lowerBound?.cpu && rec.upperBound?.cpu && (
                                  <div className="absolute inset-y-0 bg-blue-100 dark:bg-blue-900/20 rounded-full"
                                    style={{
                                      left: '0%',
                                      right: '0%'
                                    }}
                                  />
                                )}

                                {/* Lower Bound marker */}
                                {rec.lowerBound?.cpu && (
                                  <div className="absolute top-0 bottom-0 flex items-center justify-center"
                                    style={{ left: '0%' }}>
                                    <div className="h-8 w-0.5 bg-blue-300 dark:bg-blue-600"></div>
                                    <div className="absolute bottom-full mb-1 transform -translate-x-1/2 text-xs font-medium">
                                      Lower: {formatResourceValue(rec.lowerBound.cpu, 'cpu')}
                                    </div>
                                  </div>
                                )}

                                {/* Target marker */}
                                {rec.target?.cpu && (
                                  <div className="absolute top-0 bottom-0 flex items-center justify-center"
                                    style={{ left: '50%' }}>
                                    <div className="h-12 w-1 bg-green-500"></div>
                                    <div className="absolute top-full mt-1 transform -translate-x-1/2 text-xs font-medium text-green-600 dark:text-green-400">
                                      Target: {formatResourceValue(rec.target.cpu, 'cpu')}
                                    </div>
                                  </div>
                                )}

                                {/* Upper Bound marker */}
                                {rec.upperBound?.cpu && (
                                  <div className="absolute top-0 bottom-0 flex items-center justify-center"
                                    style={{ left: '100%' }}>
                                    <div className="h-8 w-0.5 bg-blue-300 dark:bg-blue-600"></div>
                                    <div className="absolute bottom-full mb-1 transform -translate-x-1/2 text-xs font-medium">
                                      Upper: {formatResourceValue(rec.upperBound.cpu, 'cpu')}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Detailed CPU values */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                              <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded-md">
                                <div className="text-xs text-gray-500 dark:text-gray-400">Lower Bound</div>
                                <div className="font-medium">{formatResourceValue(rec.lowerBound?.cpu, 'cpu')}</div>
                              </div>
                              <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-md">
                                <div className="text-xs text-gray-500 dark:text-gray-400">Target</div>
                                <div className="font-medium text-green-600 dark:text-green-400">
                                  {formatResourceValue(rec.target?.cpu, 'cpu')}
                                </div>
                              </div>
                              <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded-md">
                                <div className="text-xs text-gray-500 dark:text-gray-400">Upper Bound</div>
                                <div className="font-medium">{formatResourceValue(rec.upperBound?.cpu, 'cpu')}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Memory Recommendations */}
                      {rec.target?.memory && (
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <HardDrive className="h-4 w-4 text-purple-500" />
                            <h4 className="text-sm font-medium">Memory</h4>
                          </div>

                          <div className="space-y-4">
                            {/* Memory Range */}
                            <div className="mt-1 px-4">
                              <div className="h-8 relative">
                                {rec.lowerBound?.memory && rec.upperBound?.memory && (
                                  <div className="absolute inset-y-0 bg-purple-100 dark:bg-purple-900/20 rounded-full"
                                    style={{
                                      left: '0%',
                                      right: '0%'
                                    }}
                                  />
                                )}

                                {/* Lower Bound marker */}
                                {rec.lowerBound?.memory && (
                                  <div className="absolute top-0 bottom-0 flex items-center justify-center"
                                    style={{ left: '0%' }}>
                                    <div className="h-8 w-0.5 bg-purple-300 dark:bg-purple-600"></div>
                                    <div className="absolute bottom-full mb-1 transform -translate-x-1/2 text-xs font-medium">
                                      Lower: {formatResourceValue(rec.lowerBound.memory, 'memory')}
                                    </div>
                                  </div>
                                )}

                                {/* Target marker */}
                                {rec.target?.memory && (
                                  <div className="absolute top-0 bottom-0 flex items-center justify-center"
                                    style={{ left: '50%' }}>
                                    <div className="h-12 w-1 bg-green-500"></div>
                                    <div className="absolute top-full mt-1 transform -translate-x-1/2 text-xs font-medium text-green-600 dark:text-green-400">
                                      Target: {formatResourceValue(rec.target.memory, 'memory')}
                                    </div>
                                  </div>
                                )}

                                {/* Upper Bound marker */}
                                {rec.upperBound?.memory && (
                                  <div className="absolute top-0 bottom-0 flex items-center justify-center"
                                    style={{ left: '100%' }}>
                                    <div className="h-8 w-0.5 bg-purple-300 dark:bg-purple-600"></div>
                                    <div className="absolute bottom-full mb-1 transform -translate-x-1/2 text-xs font-medium">
                                      Upper: {formatResourceValue(rec.upperBound.memory, 'memory')}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Detailed Memory values */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                              <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded-md">
                                <div className="text-xs text-gray-500 dark:text-gray-400">Lower Bound</div>
                                <div className="font-medium">{formatResourceValue(rec.lowerBound?.memory, 'memory')}</div>
                              </div>
                              <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-md">
                                <div className="text-xs text-gray-500 dark:text-gray-400">Target</div>
                                <div className="font-medium text-green-600 dark:text-green-400">
                                  {formatResourceValue(rec.target?.memory, 'memory')}
                                </div>
                              </div>
                              <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded-md">
                                <div className="text-xs text-gray-500 dark:text-gray-400">Upper Bound</div>
                                <div className="font-medium">{formatResourceValue(rec.upperBound?.memory, 'memory')}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Display uncapped targets if available */}
                      {rec.uncappedTarget && Object.keys(rec.uncappedTarget).length > 0 && (
                        <div className="mt-6 p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/30">
                          <div className="text-sm font-medium mb-2">Uncapped Targets (before policy limits):</div>
                          <div className="space-y-1">
                            {Object.entries(rec.uncappedTarget).map(([resource, value]) => (
                              <div key={`uncapped-${resource}`} className="flex justify-between">
                                <span className="text-sm text-gray-600 dark:text-gray-400">{resource}:</span>
                                <span className="text-sm">{formatResourceValue(value, resource as 'cpu' | 'memory')}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="yaml" className="space-y-6">
            <ResourceViewerYamlTab
              resourceData={vpaData}
              namespace={vpaData.metadata.namespace || ''}
              currentContext={currentContext}
            />
          </TabsContent>

          <TabsContent value="events" className="space-y-6">
            <EventsViewer
              events={events}
              namespace={vpaData.metadata.namespace}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default VerticalPodAutoscalerViewer;