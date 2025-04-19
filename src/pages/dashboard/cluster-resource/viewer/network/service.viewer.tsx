import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { V1Service, CoreV1Event, V1ServicePort } from '@kubernetes/client-node';
import {
  getResource,
  listResources
} from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';

// Component imports
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ChevronRight, AlertCircle, ArrowLeft, RefreshCw, Network, ExternalLink, Server, Globe } from "lucide-react";
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
import ServiceEndpoints from '../components/serviceendpoints.viewer';
import { QuickPortForward } from '@/components/custom';
import PortForwardDialog from '@/components/custom/portfoward/portforward.components';

// Define interface for service data
interface ServiceData extends V1Service {
  events?: CoreV1Event[];
}

// Interface for port forward dialog compatible with V1ServicePort
interface SimplifiedPort {
  port: number;
  targetPort: any;
  protocol?: string;
  name?: string;
}

const ServiceViewer: React.FC = () => {
  const [serviceData, setServiceData] = useState<ServiceData | null>(null);
  const [events, setEvents] = useState<CoreV1Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPortForwardDialogOpen, setIsPortForwardDialogOpen] = useState(false);
  const { currentContext } = useCluster();
  const { serviceName, namespace } = useParams<{ serviceName: string; namespace: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const defaultTab = tabParam || 'overview';

  // Fetch events for the service
  const fetchEvents = async () => {
    if (!currentContext || !namespace) return;

    try {
      // Fetch all events in the namespace
      const eventData = await listResources<'events'>(
        currentContext.name,
        'events',
        { namespace }
      );

      setEvents(eventData);
    } catch (err) {
      console.error('Error fetching events:', err);
    }
  };

  // Fetch service data and events
  useEffect(() => {
    const fetchServiceData = async () => {
      if (!currentContext || !serviceName || !namespace) {
        setLoading(false);
        setError("Missing required parameters");
        return;
      }

      try {
        setLoading(true);

        // Get service details
        const data = await getResource<'services'>(
          currentContext.name,
          'services',
          serviceName,
          namespace
        );

        setServiceData(data);
        setError(null);

        // Fetch related events
        await fetchEvents();
      } catch (err) {
        console.error('Error fetching service:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch service data');
      } finally {
        setLoading(false);
      }
    };

    fetchServiceData();
  }, [currentContext, namespace, serviceName]);

  // Handle refresh data
  const handleRefresh = () => {
    setLoading(true);
    // Refetch data
    if (currentContext && serviceName && namespace) {
      Promise.all([
        getResource<'services'>(
          currentContext.name,
          'services',
          serviceName,
          namespace
        ),
        fetchEvents()
      ]).then(([data]) => {
        setServiceData(data);
        setLoading(false);
      }).catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to refresh data');
        setLoading(false);
      });
    }
  };

  // Format port information
  const formatPort = (port: any) => {
    let portInfo = `${port.port}`;

    if (port.targetPort) {
      portInfo += ` → ${port.targetPort}`;
    }

    if (port.nodePort) {
      portInfo += ` (NodePort: ${port.nodePort})`;
    }

    if (port.protocol) {
      portInfo += `/${port.protocol}`;
    }

    if (port.name) {
      portInfo += ` (${port.name})`;
    }

    return portInfo;
  };

  // Get service type badge styling
  const getServiceTypeBadge = (type: string) => {
    switch (type) {
      case 'ClusterIP':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      case 'NodePort':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      case 'LoadBalancer':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
      case 'ExternalName':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';
    }
  };

  // Get service age
  const getServiceAge = () => {
    if (!serviceData?.metadata?.creationTimestamp) {
      return 'N/A';
    }

    const creationTime = new Date(serviceData.metadata.creationTimestamp);
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

  // Convert V1ServicePort to SimplifiedPort format expected by PortForwardDialog
  const convertToPorts = (servicePorts: V1ServicePort[] | undefined): SimplifiedPort[] => {
    if (!servicePorts) return [];

    return servicePorts.map(port => ({
      port: port.port,
      targetPort: port.targetPort || port.port,
      protocol: port.protocol,
      name: port.name
    }));
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
          <AlertTitle>Error loading service data</AlertTitle>
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

  // If no service data
  if (!serviceData || !serviceData.metadata) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTitle>No service data available</AlertTitle>
          <AlertDescription>
            The requested service was not found or could not be retrieved.
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

  // Service type and cluster IP
  const serviceType = serviceData.spec?.type || 'ClusterIP';
  const clusterIP = serviceData.spec?.clusterIP || 'None';
  const externalIPs = serviceData.spec?.externalIPs || [];
  const loadBalancerIPs = serviceData.status?.loadBalancer?.ingress?.map(ing => ing.ip || ing.hostname) || [];
  const externalName = serviceData.spec?.externalName;
  const typeBadgeClass = getServiceTypeBadge(serviceType);
  const servicePorts = serviceData.spec?.ports || [];
  const simplifiedPorts = convertToPorts(servicePorts);

  return (
    <div className='
          max-h-[92vh] overflow-y-auto
          scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent
          [&::-webkit-scrollbar]:w-1.5 
          [&::-webkit-scrollbar-track]:bg-transparent 
          [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50'>
      <div className="p-6 max-w-7xl mx-auto">
        {currentContext && serviceName && namespace && (
          <PortForwardDialog
            isOpen={isPortForwardDialogOpen}
            onClose={() => setIsPortForwardDialogOpen(false)}
            clusterName={currentContext.name}
            namespace={namespace}
            serviceName={serviceName}
            ports={simplifiedPorts}
          />
        )}

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
              <BreadcrumbLink href="/dashboard/explore/services">Services</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink href={`/dashboard/explore/services?namespace=${namespace}`}>{namespace}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink>{serviceData.metadata.name}</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header section */}
        <div className="mb-6">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{serviceData.metadata.name}</h1>
                <Badge className={typeBadgeClass}>
                  {serviceType}
                </Badge>
              </div>
              <div className="text-gray-500 dark:text-gray-400">
                Namespace: <span onClick={() => navigate(`/dashboard/explore/namespaces/${serviceData.metadata?.namespace}`)} className="text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">{serviceData.metadata.namespace}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {serviceType !== 'ExternalName' && servicePorts.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsPortForwardDialogOpen(true)}
                >
                  <ExternalLink className="h-4 w-4 mr-1.5" />
                  Port Forward
                </Button>
              )}
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
        <Tabs defaultValue={defaultTab}
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
            <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 bg-transparent">
            {/* Service Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Network className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-medium">Type</h3>
                </div>
                <div className="text-lg font-semibold">
                  {serviceType}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Service Type
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Server className="h-4 w-4 text-purple-500" />
                  <h3 className="text-sm font-medium">Cluster IP</h3>
                </div>
                <div className="text-lg font-semibold">
                  {clusterIP}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Internal IP
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Globe className="h-4 w-4 text-green-500" />
                  <h3 className="text-sm font-medium">External Access</h3>
                </div>
                <div className="text-lg font-semibold truncate">
                  {serviceType === 'LoadBalancer' && loadBalancerIPs.length > 0
                    ? loadBalancerIPs[0]
                    : externalIPs.length > 0
                      ? externalIPs[0]
                      : serviceType === 'ExternalName'
                        ? externalName
                        : 'None'}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  External Access
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ExternalLink className="h-4 w-4 text-orange-500" />
                  <h3 className="text-sm font-medium">Ports</h3>
                </div>
                <div className="text-lg font-semibold">
                  {serviceData.spec?.ports?.length || 0}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Exposed Ports
                </div>
              </div>
            </div>

            {/* Service Properties */}
            <PropertiesViewer
              metadata={serviceData.metadata}
              kind="Service"
              additionalProperties={[
                {
                  label: "Type",
                  value: serviceType
                },
                {
                  label: "Cluster IP",
                  value: clusterIP
                },
                {
                  label: "Selector",
                  value: serviceData.spec?.selector ? (
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(serviceData.spec.selector).map(([key, value]) => (
                        <Badge key={key} variant="outline" className="text-xs">
                          {key}: {value}
                        </Badge>
                      ))}
                    </div>
                  ) : 'None'
                },
                {
                  label: "Session Affinity",
                  value: serviceData.spec?.sessionAffinity || 'None'
                }
              ]}
            />

            {/* Service Networking */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
              <h2 className="text-lg font-medium mb-4">Networking</h2>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-medium mb-2">Ports</h3>
                    <div className="space-y-2">
                      {serviceData.spec?.ports?.map((port, index) => (
                        <div key={index} className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-xs">
                            {formatPort(port)}
                          </Badge>
                          {serviceType !== 'ExternalName' && currentContext && (
                            <QuickPortForward
                              clusterName={currentContext.name}
                              namespace={namespace || ''}
                              serviceName={serviceName || ''}
                              port={port.port}
                              targetPort={port.targetPort || port.port}
                            />
                          )}

                        </div>
                      )) || <span className="text-gray-500 dark:text-gray-400">No ports defined</span>}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium mb-2">IP Addresses</h3>
                    <div className="space-y-2">
                      <div>
                        <span className="text-gray-600 dark:text-gray-400 text-sm">Cluster IP:</span>{' '}
                        <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-900 text-xs">{clusterIP}</code>
                      </div>

                      {externalIPs.length > 0 && (
                        <div>
                          <span className="text-gray-600 dark:text-gray-400 text-sm">External IPs:</span>{' '}
                          <div className="flex flex-wrap gap-1 mt-1">
                            {externalIPs.map((ip, i) => (
                              <code key={i} className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-900 text-xs">{ip}</code>
                            ))}
                          </div>
                        </div>
                      )}

                      {serviceType === 'LoadBalancer' && loadBalancerIPs.length > 0 && (
                        <div>
                          <span className="text-gray-600 dark:text-gray-400 text-sm">Load Balancer:</span>{' '}
                          <div className="flex flex-wrap gap-1 mt-1">
                            {loadBalancerIPs.map((ip, i) => (
                              <code key={i} className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-900 text-xs">{ip}</code>
                            ))}
                          </div>
                        </div>
                      )}

                      {serviceType === 'ExternalName' && externalName && (
                        <div>
                          <span className="text-gray-600 dark:text-gray-400 text-sm">External Name:</span>{' '}
                          <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-900 text-xs">{externalName}</code>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {serviceData.spec?.sessionAffinity === 'ClientIP' && serviceData.spec.sessionAffinityConfig && (
                  <div>
                    <h3 className="text-sm font-medium mb-2">Session Affinity</h3>
                    <div>
                      <span className="text-gray-600 dark:text-gray-400 text-sm">Type:</span>{' '}
                      <Badge variant="outline">ClientIP</Badge>
                    </div>
                    <div>
                      <span className="text-gray-600 dark:text-gray-400 text-sm">Timeout:</span>{' '}
                      {serviceData.spec.sessionAffinityConfig.clientIP?.timeoutSeconds || 10800}s
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Endpoints and Selector */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
              <h2 className="text-lg font-medium mb-4">Selectors and Targeting</h2>
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium mb-2">Selector</h3>
                  {serviceData.spec?.selector ? (
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(serviceData.spec.selector).map(([key, value]) => (
                        <Badge key={key} className="bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
                          {key}: {value}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      No selector defined. This service does not automatically target any pods.
                      {serviceType === 'ExternalName' && (
                        <div className="mt-1">
                          This is expected for ExternalName services which map to external DNS names.
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-medium mb-2">External Traffic Policy</h3>
                  <Badge variant="outline">
                    {serviceData.spec?.externalTrafficPolicy || 'Cluster'}
                  </Badge>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {serviceData.spec?.externalTrafficPolicy === 'Local'
                      ? 'Preserves client source IP and avoids extra hop'
                      : 'May cause source IP to be lost but offers better load distribution'}
                  </div>
                </div>

                {serviceData.spec?.type === 'LoadBalancer' && serviceData.spec.loadBalancerIP && (
                  <div>
                    <h3 className="text-sm font-medium mb-2">Load Balancer IP</h3>
                    <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-900">
                      {serviceData.spec.loadBalancerIP}
                    </code>
                  </div>
                )}
              </div>
            </div>

            {/* Service Events */}
            <EventsViewer
              events={events}
              resourceName={serviceData.metadata.name}
              resourceKind="Service"
              namespace={serviceData.metadata.namespace}
            />
          </TabsContent>

          <TabsContent value="yaml" className="space-y-6">
            <ResourceViewerYamlTab
              resourceData={serviceData}
              namespace={serviceData.metadata.namespace || ''}
              currentContext={currentContext}
            />
          </TabsContent>

          <TabsContent value="events" className="space-y-6">
            <EventsViewer
              events={events}
              namespace={serviceData.metadata.namespace}
            />
          </TabsContent>

          <TabsContent value="endpoints" className="space-y-6">
            {serviceName && namespace && currentContext && (
              <ServiceEndpoints
                serviceName={serviceName}
                namespace={namespace}
                clusterName={currentContext.name}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default ServiceViewer;