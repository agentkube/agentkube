import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { V1Endpoints, CoreV1Event } from '@kubernetes/client-node';
import { deleteResource, getResource, listResources } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';

import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ChevronRight, AlertCircle, ArrowLeft, RefreshCw, Radio, Network, Layers, Trash } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import KUBERNETES_LOGO from '@/assets/kubernetes.svg';

import PropertiesViewer from '../components/properties.viewer';
import EventsViewer from '../components/event.viewer';
import ResourceViewerYamlTab from '@/components/custom/editor/resource-viewer-tabs.component';
import { useSearchParams } from 'react-router-dom';
import { DeletionDialog } from '@/components/custom';
import { useReconMode } from '@/contexts/useRecon';
import { toast } from '@/hooks/use-toast';

interface EndpointData extends V1Endpoints {
  events?: CoreV1Event[];
}

const EndpointViewer: React.FC = () => {
  const [endpointData, setEndpointData] = useState<EndpointData | null>(null);
  const [events, setEvents] = useState<CoreV1Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { currentContext, fullWidth } = useCluster();
  const { endpointName, namespace } = useParams<{ endpointName: string; namespace: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const defaultTab = tabParam || 'overview';
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const { isReconMode } = useReconMode();

  const fetchEvents = async () => {
    if (!currentContext || !namespace || !endpointName) return;
  
    try {
      // Fetch events specific to this endpoint using fieldSelector
      const eventData = await listResources<'events'>(
        currentContext.name,
        'events',
        { 
          namespace,
          fieldSelector: `involvedObject.name=${endpointName},involvedObject.kind=Endpoints`
        }
      );
  
      setEvents(eventData);
    } catch (err) {
      console.error('Error fetching events:', err);
    }
  };

  useEffect(() => {
    const fetchEndpointData = async () => {
      if (!currentContext || !endpointName || !namespace) {
        setLoading(false);
        setError("Missing required parameters");
        return;
      }

      try {
        setLoading(true);
        const data = await getResource<'endpoints'>(
          currentContext.name,
          'endpoints',
          endpointName,
          namespace
        );

        setEndpointData(data);
        setError(null);
        await fetchEvents();
      } catch (err) {
        console.error('Error fetching endpoint:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch endpoint data');
      } finally {
        setLoading(false);
      }
    };

    fetchEndpointData();
  }, [currentContext, namespace, endpointName]);

  const handleDelete = () => {
    if (isReconMode) {
      toast({
        title: "Recon Mode",
        description: "This action can't be performed while recon mode is on. Disable recon mode to proceed.",
        variant: "recon"
      });
      return;
    }
    
    setShowDeleteDialog(true);
  };

  const confirmResourceDeletion = async () => {
    if (!endpointData || !currentContext) {
      setShowDeleteDialog(false);
      return;
    }

    try {
      setDeleteLoading(true);

      await deleteResource(
        currentContext.name,
        'endpoints',
        endpointData.metadata?.name as string,
        {
          namespace: endpointData.metadata?.namespace
          // Note: Endpoints are in the core API group, so no apiGroup parameter needed
        }
      );

      // Navigate back to the endpoints list
      navigate('/dashboard/explore/endpoints');
    } catch (err) {
      console.error('Failed to delete endpoint:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete endpoint');
    } finally {
      setDeleteLoading(false);
      setShowDeleteDialog(false);
    }
  };

  const handleRefresh = () => {
    setLoading(true);
    if (currentContext && endpointName && namespace) {
      Promise.all([
        getResource<'endpoints'>(
          currentContext.name,
          'endpoints',
          endpointName,
          namespace
        ),
        fetchEvents()
      ]).then(([data]) => {
        setEndpointData(data);
        setLoading(false);
      }).catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to refresh data');
        setLoading(false);
      });
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-96 mb-8" />
        <Skeleton className="h-36 w-full mb-4" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error loading endpoint data</AlertTitle>
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

  if (!endpointData || !endpointData.metadata) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTitle>No endpoint data available</AlertTitle>
          <AlertDescription>
            The requested endpoint was not found or could not be retrieved.
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

  const getAddressTypes = () => {
    const types = new Set<string>();
    endpointData.subsets?.forEach(subset => {
      subset.addresses?.forEach(addr => {
        if (addr.ip) types.add('IPv4');
        if (addr.hostname) types.add('Hostname');
      });
    });
    return Array.from(types);
  };

  const getTotalAddresses = () => {
    return endpointData.subsets?.reduce((total, subset) =>
      total + (subset.addresses?.length || 0), 0) || 0;
  };

  const getTotalPorts = () => {
    return endpointData.subsets?.reduce((total, subset) =>
      total + (subset.ports?.length || 0), 0) || 0;
  };

  return (
    <div className='
           max-h-[92vh] overflow-y-auto
          
          [&::-webkit-scrollbar]:w-1.5 
          [&::-webkit-scrollbar-track]:bg-transparent 
          [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50'>
      <div className={`p-6 ${fullWidth ? 'max-w-full' : 'max-w-7xl'} mx-auto`}>
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
              <BreadcrumbLink href="/dashboard/explore/endpoints">Endpoints</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink href={`/dashboard/explore/endpoints?namespace=${namespace}`}>{namespace}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink>{endpointData.metadata.name}</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="mb-6">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{endpointData.metadata.name}</h1>
                <Badge className='bg-cyan-300/80 dark:bg-cyan-500/20'>Endpoints</Badge>
              </div>
              <div className="text-gray-500 dark:text-gray-400">
                Namespace: <span onClick={() => navigate(`/dashboard/explore/namespaces/${endpointData.metadata?.namespace}`)} className="text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">{endpointData.metadata.namespace}</span>
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

        {endpointData && (
          <DeletionDialog
            isOpen={showDeleteDialog}
            onClose={() => setShowDeleteDialog(false)}
            onConfirm={confirmResourceDeletion}
            title="Delete Endpoint"
            description={`Are you sure you want to delete the endpoint "${endpointData.metadata.name}" in namespace "${endpointData.metadata.namespace}"? This action cannot be undone.`}
            resourceName={endpointData.metadata.name as string}
            resourceType="Endpoint"
            isLoading={deleteLoading}
          />
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="bg-white dark:bg-transparent border dark:border-gray-700/40 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Network className="h-4 w-4 text-blue-500" />
              <h3 className="text-sm font-medium">Total Addresses</h3>
            </div>
            <div className="text-2xl font-semibold">{getTotalAddresses()}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Address types: {getAddressTypes().join(', ') || 'None'}
            </div>
          </Card>

          <Card className="bg-white dark:bg-transparent border dark:border-gray-700/40 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Radio className="h-4 w-4 text-green-500" />
              <h3 className="text-sm font-medium">Total Ports</h3>
            </div>
            <div className="text-2xl font-semibold">{getTotalPorts()}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Across all subsets
            </div>
          </Card>

          <Card className="bg-white dark:bg-transparent border dark:border-gray-700/40 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Layers className="h-4 w-4 text-purple-500" />
              <h3 className="text-sm font-medium">Subsets</h3>
            </div>
            <div className="text-2xl font-semibold">{endpointData.subsets?.length || 0}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Network endpoint groups
            </div>
          </Card>
        </div>

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
            <PropertiesViewer
              metadata={endpointData.metadata}
              kind="Endpoints"
              additionalProperties={[
                {
                  label: "Subsets",
                  value: endpointData.subsets?.length || 0
                }
              ]}
            />

            {endpointData.subsets?.map((subset, index) => (
              <Card key={index} className="bg-white dark:bg-transparent p-4">
                <h3 className="text-lg font-medium mb-4">Subset {index + 1}</h3>

                <div className="space-y-4">
                  {subset.addresses && subset.addresses.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Addresses</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {subset.addresses.map((addr, addrIndex) => (
                          <div key={addrIndex} className="p-2 rounded-lg border border-gray-200 dark:border-gray-800">
                            <div className="text-sm">
                              <span className="font-medium">IP: </span>
                              {addr.ip}
                            </div>
                            {addr.hostname && (
                              <div className="text-sm">
                                <span className="font-medium">Hostname: </span>
                                {addr.hostname}
                              </div>
                            )}
                            {addr.nodeName && (
                              <div className="text-sm">
                                <span className="font-medium">Node: </span>
                                {addr.nodeName}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {subset.ports && subset.ports.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Ports</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {subset.ports.map((port, portIndex) => (
                          <div key={portIndex} className="p-2 rounded-lg border border-gray-200 dark:border-gray-800">
                            <div className="text-sm">
                              <span className="font-medium">Port: </span>
                              {port.port}
                            </div>
                            {port.name && (
                              <div className="text-sm">
                                <span className="font-medium">Name: </span>
                                {port.name}
                              </div>
                            )}
                            <div className="text-sm">
                              <span className="font-medium">Protocol: </span>
                              {port.protocol || 'TCP'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            ))}

            <EventsViewer
              events={events}
              resourceName={endpointData.metadata.name}
              resourceKind="Endpoints"
              namespace={endpointData.metadata.namespace}
            />
          </TabsContent>

          <TabsContent value="yaml" className="space-y-6">
            <ResourceViewerYamlTab
              resourceData={endpointData}
              namespace={endpointData.metadata.namespace || ''}
              currentContext={currentContext}
            // resourceType="endpoints"
            />
          </TabsContent>

          <TabsContent value="events" className="space-y-6">
            <EventsViewer
              events={events}
              namespace={endpointData.metadata.namespace}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default EndpointViewer;