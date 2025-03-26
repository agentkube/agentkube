import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { V1ResourceQuota, CoreV1Event } from '@kubernetes/client-node';
import {
  getResource,
  listResources
} from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';

// Component imports
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ChevronRight, AlertCircle, Clock, ArrowLeft, RefreshCw, Database, Cpu, CpuIcon, MemoryStick, HardDrive } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import KUBERNETES_LOGO from '@/assets/kubernetes.svg';

// Custom component imports
import PropertiesViewer from '../components/properties.viewer';
import EventsViewer from '../components/event.viewer';
import { ResourceViewerYamlTab } from '@/components/custom';

// Define interface for resourcequota data (extending V1ResourceQuota with events)
interface ResourceQuotaData extends V1ResourceQuota {
  events?: CoreV1Event[];
}

const ResourceQuotaViewer: React.FC = () => {
  const [resourceQuotaData, setResourceQuotaData] = useState<ResourceQuotaData | null>(null);
  const [events, setEvents] = useState<CoreV1Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { currentContext } = useCluster();
  const { resourceQuotaName, namespace } = useParams<{ resourceQuotaName: string; namespace: string }>();
  const navigate = useNavigate();

  // Fetch events for the resourcequota
  const fetchEvents = async () => {
    if (!currentContext || !namespace) return;

    try {
      // Fetch all events in the namespace
      const eventData = await listResources<'events'>(
        currentContext.name,
        'events',
        { namespace }
      );

      // Filter events for this resourcequota
      const filteredEvents = eventData.filter(event => {
        return (
          event.involvedObject?.kind === 'ResourceQuota' &&
          event.involvedObject?.name === resourceQuotaName
        );
      });

      setEvents(filteredEvents);
    } catch (err) {
      console.error('Error fetching events:', err);
    }
  };

  // Fetch resourcequota data and events
  useEffect(() => {
    const fetchResourceQuotaData = async () => {
      if (!currentContext || !resourceQuotaName || !namespace) {
        setLoading(false);
        setError("Missing required parameters");
        return;
      }

      try {
        setLoading(true);

        // Get resourcequota details
        const data = await getResource<'resourcequotas'>(
          currentContext.name,
          'resourcequotas',
          resourceQuotaName,
          namespace
        );

        setResourceQuotaData(data);
        setError(null);

        // Fetch related events
        await fetchEvents();
      } catch (err) {
        console.error('Error fetching resourcequota:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch resourcequota data');
      } finally {
        setLoading(false);
      }
    };

    fetchResourceQuotaData();
  }, [currentContext, namespace, resourceQuotaName]);

  // Handle refresh data
  const handleRefresh = () => {
    setLoading(true);
    // Refetch data
    if (currentContext && resourceQuotaName && namespace) {
      Promise.all([
        getResource<'resourcequotas'>(
          currentContext.name,
          'resourcequotas',
          resourceQuotaName,
          namespace
        ),
        fetchEvents()
      ]).then(([data]) => {
        setResourceQuotaData(data);
        setLoading(false);
      }).catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to refresh data');
        setLoading(false);
      });
    }
  };

  // Calculate resourcequota age
  const getResourceQuotaAge = () => {
    if (!resourceQuotaData?.metadata?.creationTimestamp) {
      return 'N/A';
    }

    const creationTime = new Date(resourceQuotaData.metadata.creationTimestamp);
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

  // Format resource value for display
  const formatResourceValue = (value: string | undefined): string => {
    if (!value) return 'N/A';

    // If it's a number with millicpu units
    if (value.endsWith('m') && !isNaN(parseInt(value))) {
      const millicores = parseInt(value);
      return millicores >= 1000 
        ? `${(millicores / 1000).toFixed(1)} cores` 
        : `${millicores} millicores`;
    }
    
    // If it's a number with k8s memory units (Ki, Mi, Gi)
    if (value.endsWith('Ki') || value.endsWith('Mi') || value.endsWith('Gi')) {
      const units = value.slice(-2);
      const num = parseInt(value.slice(0, -2));
      
      if (!isNaN(num)) {
        if (units === 'Ki' && num >= 1024) {
          return `${(num / 1024).toFixed(2)} Mi`;
        } else if (units === 'Mi' && num >= 1024) {
          return `${(num / 1024).toFixed(2)} Gi`;
        }
        return `${num} ${units}`;
      }
    }
    
    return value;
  };

  // Calculate usage percentage
  const calculateUsagePercentage = (used: string | undefined, hard: string | undefined): number => {
    if (!used || !hard) return 0;
    
    // Extract numeric values and handle 'm' for millicores
    const getNumericValue = (val: string): number => {
      if (val.endsWith('m')) {
        return parseInt(val);
      }
      
      // Handle Ki, Mi, Gi units by converting to bytes
      if (val.endsWith('Ki')) {
        return parseInt(val) * 1024;
      } else if (val.endsWith('Mi')) {
        return parseInt(val) * 1024 * 1024;
      } else if (val.endsWith('Gi')) {
        return parseInt(val) * 1024 * 1024 * 1024;
      }
      
      return parseInt(val);
    };
    
    const usedVal = getNumericValue(used);
    const hardVal = getNumericValue(hard);
    
    if (hardVal === 0) return 0;
    
    return Math.min(100, Math.round((usedVal / hardVal) * 100));
  };

  // Get resource icon based on resource name
  const getResourceIcon = (resourceName: string) => {
    if (resourceName.includes('cpu')) {
      return <Cpu className="h-4 w-4 text-blue-500" />;
    } else if (resourceName.includes('memory')) {
      return <MemoryStick className="h-4 w-4 text-green-500" />;
    } else if (resourceName.includes('storage')) {
      return <HardDrive className="h-4 w-4 text-purple-500" />;
    } else {
      return <Database className="h-4 w-4 text-gray-500" />;
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
          <AlertTitle>Error loading ResourceQuota data</AlertTitle>
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

  // If no resourcequota data
  if (!resourceQuotaData || !resourceQuotaData.metadata) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTitle>No ResourceQuota data available</AlertTitle>
          <AlertDescription>
            The requested ResourceQuota was not found or could not be retrieved.
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

  // Extract quota data
  const hardQuotas = resourceQuotaData.spec?.hard || {};
  const usedQuotas = resourceQuotaData.status?.used || {};
  const hardQuotaCount = Object.keys(hardQuotas).length;
  
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
              <BreadcrumbLink href="/dashboard/explore/resourcequotas">ResourceQuotas</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink href={`/dashboard/explore/resourcequotas?namespace=${namespace}`}>{namespace}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink>{resourceQuotaData.metadata.name}</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header section */}
        <div className="mb-6">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{resourceQuotaData.metadata.name}</h1>
                <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  ResourceQuota
                </Badge>
              </div>
              <div className="text-gray-500 dark:text-gray-400">
                Namespace: <span  onClick={() => navigate(`/dashboard/explore/namespaces/${resourceQuotaData.metadata?.namespace}`)} className="text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">{resourceQuotaData.metadata.namespace}</span>
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
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="yaml">YAML</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 bg-transparent">
            {/* ResourceQuota Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Database className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-medium">Quota Limits</h3>
                </div>
                <div className="text-2xl font-semibold">
                  {hardQuotaCount}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Resource limits defined
                </div>
              </div>

              {resourceQuotaData.spec?.scopes && (
                <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CpuIcon className="h-4 w-4 text-green-500" />
                    <h3 className="text-sm font-medium">Scope</h3>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {resourceQuotaData.spec.scopes.map((scope, index) => (
                      <Badge key={index} variant="outline">
                        {scope}
                      </Badge>
                    ))}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Applied to these workload types
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-orange-500" />
                  <h3 className="text-sm font-medium">Age</h3>
                </div>
                <div className="text-2xl font-semibold">
                  {getResourceQuotaAge()}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Created {resourceQuotaData.metadata.creationTimestamp && 
                    new Date(resourceQuotaData.metadata.creationTimestamp).toLocaleString()}
                </div>
              </div>
            </div>

            {/* ResourceQuota Properties */}
            <PropertiesViewer
              metadata={resourceQuotaData.metadata}
              kind="ResourceQuota"
              status="Active"
              additionalProperties={[
                {
                  label: "Hard Quotas",
                  value: `${hardQuotaCount} resource limits defined`
                },
                {
                  label: "Scopes",
                  value: resourceQuotaData.spec?.scopes?.join(', ') || 'None'
                },
                {
                  label: "Creation Time",
                  value: resourceQuotaData.metadata.creationTimestamp ? 
                        new Date(resourceQuotaData.metadata.creationTimestamp).toLocaleString() : 
                        'N/A'
                }
              ]}
            />

            {/* Resource Usage Section */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
              <h2 className="text-lg font-medium mb-4">Resource Usage</h2>
              
              {Object.keys(hardQuotas).length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  No resource quotas defined
                </div>
              ) : (
                <div className="space-y-6">
                  {/* CPU Resources */}
                  {Object.keys(hardQuotas).filter(key => key.includes('cpu')).length > 0 && (
                    <div>
                      <h3 className="text-md font-medium mb-3 flex items-center gap-2">
                        <Cpu className="h-4 w-4 text-blue-500" />
                        CPU Resources
                      </h3>
                      <div className="space-y-4">
                        {Object.keys(hardQuotas)
                          .filter(key => key.includes('cpu'))
                          .map(key => {
                            const usedValue = usedQuotas[key];
                            const hardValue = hardQuotas[key];
                            const usagePercentage = calculateUsagePercentage(usedValue, hardValue);
                            
                            return (
                              <div key={key} className="space-y-1">
                                <div className="flex justify-between">
                                  <span className="text-sm font-medium">{key}</span>
                                  <span className="text-sm">
                                    {formatResourceValue(usedValue || '0')} / {formatResourceValue(hardValue)}
                                  </span>
                                </div>
                                <Progress value={usagePercentage} className="h-2" />
                                <div className="text-xs text-gray-500">
                                  {usagePercentage}% used
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                  
                  {/* Memory Resources */}
                  {Object.keys(hardQuotas).filter(key => key.includes('memory')).length > 0 && (
                    <div>
                      <h3 className="text-md font-medium mb-3 flex items-center gap-2">
                        <MemoryStick className="h-4 w-4 text-green-500" />
                        Memory Resources
                      </h3>
                      <div className="space-y-4">
                        {Object.keys(hardQuotas)
                          .filter(key => key.includes('memory'))
                          .map(key => {
                            const usedValue = usedQuotas[key];
                            const hardValue = hardQuotas[key];
                            const usagePercentage = calculateUsagePercentage(usedValue, hardValue);
                            
                            return (
                              <div key={key} className="space-y-1">
                                <div className="flex justify-between">
                                  <span className="text-sm font-medium">{key}</span>
                                  <span className="text-sm">
                                    {formatResourceValue(usedValue || '0')} / {formatResourceValue(hardValue)}
                                  </span>
                                </div>
                                <Progress value={usagePercentage} className="h-2" />
                                <div className="text-xs text-gray-500">
                                  {usagePercentage}% used
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                  
                  {/* Storage Resources */}
                  {Object.keys(hardQuotas).filter(key => key.includes('storage')).length > 0 && (
                    <div>
                      <h3 className="text-md font-medium mb-3 flex items-center gap-2">
                        <HardDrive className="h-4 w-4 text-purple-500" />
                        Storage Resources
                      </h3>
                      <div className="space-y-4">
                        {Object.keys(hardQuotas)
                          .filter(key => key.includes('storage'))
                          .map(key => {
                            const usedValue = usedQuotas[key];
                            const hardValue = hardQuotas[key];
                            const usagePercentage = calculateUsagePercentage(usedValue, hardValue);
                            
                            return (
                              <div key={key} className="space-y-1">
                                <div className="flex justify-between">
                                  <span className="text-sm font-medium">{key}</span>
                                  <span className="text-sm">
                                    {formatResourceValue(usedValue || '0')} / {formatResourceValue(hardValue)}
                                  </span>
                                </div>
                                <Progress value={usagePercentage} className="h-2" />
                                <div className="text-xs text-gray-500">
                                  {usagePercentage}% used
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                  
                  {/* Object Count Resources */}
                  {Object.keys(hardQuotas)
                    .filter(key => !key.includes('cpu') && !key.includes('memory') && !key.includes('storage'))
                    .length > 0 && (
                    <div>
                      <h3 className="text-md font-medium mb-3 flex items-center gap-2">
                        <Database className="h-4 w-4 text-gray-500" />
                        Object Count Quotas
                      </h3>
                      <div className="space-y-4">
                        {Object.keys(hardQuotas)
                          .filter(key => !key.includes('cpu') && !key.includes('memory') && !key.includes('storage'))
                          .map(key => {
                            const usedValue = usedQuotas[key];
                            const hardValue = hardQuotas[key];
                            const usagePercentage = calculateUsagePercentage(usedValue, hardValue);
                            
                            return (
                              <div key={key} className="space-y-1">
                                <div className="flex justify-between">
                                  <span className="text-sm font-medium">{key}</span>
                                  <span className="text-sm">
                                    {usedValue || '0'} / {hardValue}
                                  </span>
                                </div>
                                <Progress value={usagePercentage} className="h-2" />
                                <div className="text-xs text-gray-500">
                                  {usagePercentage}% used
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* All Quotas Table View */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
              <h2 className="text-lg font-medium mb-4">All Resource Quotas</h2>
              
              <div className="overflow-x-auto">
                <table className="w-full min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Resource</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Used</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Hard Limit</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Usage</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-transparent divide-y divide-gray-200 dark:divide-gray-700">
                    {Object.keys(hardQuotas).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                          No resource quotas defined
                        </td>
                      </tr>
                    ) : (
                      Object.keys(hardQuotas).map(key => {
                        const usedValue = usedQuotas[key] || '0';
                        const hardValue = hardQuotas[key];
                        const usagePercentage = calculateUsagePercentage(usedValue, hardValue);
                        
                        return (
                          <tr key={key} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                {getResourceIcon(key)}
                                <span className="ml-2 text-sm font-medium">{key}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              {formatResourceValue(usedValue)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              {formatResourceValue(hardValue)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="w-32 bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mr-2">
                                  <div 
                                    className={`h-2.5 rounded-full ${
                                      usagePercentage > 90 ? 'bg-red-600' : 
                                      usagePercentage > 75 ? 'bg-yellow-500' : 
                                      'bg-green-600'
                                    }`} 
                                    style={{ width: `${usagePercentage}%` }}
                                  ></div>
                                </div>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  {usagePercentage}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ResourceQuota Events */}
            <EventsViewer
              events={events}
              resourceName={resourceQuotaData.metadata.name}
              resourceKind="ResourceQuota"
              namespace={resourceQuotaData.metadata.namespace}
            />
          </TabsContent>

          <TabsContent value="yaml" className="space-y-6">
            <ResourceViewerYamlTab
              resourceData={resourceQuotaData}
              namespace={resourceQuotaData.metadata.namespace || ''}
              currentContext={currentContext}
            />  
          </TabsContent>

          <TabsContent value="events" className="space-y-6">
            <EventsViewer
              events={events}
              namespace={resourceQuotaData.metadata.namespace}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default ResourceQuotaViewer;