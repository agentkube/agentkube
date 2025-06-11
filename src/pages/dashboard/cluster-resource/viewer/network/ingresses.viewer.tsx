import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { V1Ingress, CoreV1Event } from '@kubernetes/client-node';
import { deleteResource, getResource, listResources } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';

import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ChevronRight, AlertCircle, ArrowLeft, RefreshCw, Globe, Router, Shield, Server, Trash } from "lucide-react";
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

interface IngressData extends V1Ingress {
  events?: CoreV1Event[];
}

const IngressViewer: React.FC = () => {
  const [ingressData, setIngressData] = useState<IngressData | null>(null);
  const [events, setEvents] = useState<CoreV1Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { currentContext, fullWidth } = useCluster();
  const { ingressName, namespace } = useParams<{ ingressName: string; namespace: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const defaultTab = tabParam || 'overview';
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchEvents = async () => {
    if (!currentContext || !namespace || !ingressName) return;
  
    try {
      // Fetch events specific to this ingress using fieldSelector
      const eventData = await listResources<'events'>(
        currentContext.name,
        'events',
        { 
          namespace,
          fieldSelector: `involvedObject.name=${ingressName},involvedObject.kind=Ingress`
        }
      );
  
      setEvents(eventData);
    } catch (err) {
      console.error('Error fetching events:', err);
    }
  };

  useEffect(() => {
    const fetchIngressData = async () => {
      if (!currentContext || !ingressName || !namespace) {
        setLoading(false);
        setError("Missing required parameters");
        return;
      }

      try {
        setLoading(true);
        const data = await getResource<'ingresses'>(
          currentContext.name,
          'ingresses',
          ingressName,
          namespace,
          'networking.k8s.io'
        );

        setIngressData(data);
        setError(null);
        await fetchEvents();
      } catch (err) {
        console.error('Error fetching ingress:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch ingress data');
      } finally {
        setLoading(false);
      }
    };

    fetchIngressData();
  }, [currentContext, namespace, ingressName]);

  const handleDelete = () => {
    setShowDeleteDialog(true);
  };

  const confirmResourceDeletion = async () => {
    if (!ingressData || !currentContext) {
      setShowDeleteDialog(false);
      return;
    }

    try {
      setDeleteLoading(true);

      await deleteResource(
        currentContext.name,
        'ingresses',
        ingressData.metadata?.name as string,
        {
          namespace: ingressData.metadata?.namespace,
          apiGroup: 'networking.k8s.io'
        }
      );

      // Navigate back to the ingresses list
      navigate('/dashboard/explore/ingresses');
    } catch (err) {
      console.error('Failed to delete ingress:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete ingress');
    } finally {
      setDeleteLoading(false);
      setShowDeleteDialog(false);
    }
  };

  const handleRefresh = () => {
    setLoading(true);
    if (currentContext && ingressName && namespace) {
      Promise.all([
        getResource<'ingresses'>(
          currentContext.name,
          'ingresses',
          ingressName,
          namespace,
          'networking.k8s.io'
        ),
        fetchEvents()
      ]).then(([data]) => {
        setIngressData(data);
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
          <AlertTitle>Error loading ingress data</AlertTitle>
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

  if (!ingressData || !ingressData.metadata) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTitle>No ingress data available</AlertTitle>
          <AlertDescription>
            The requested ingress was not found or could not be retrieved.
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

  const getTotalRules = () => {
    return ingressData.spec?.rules?.length || 0;
  };

  const getTotalTLS = () => {
    return ingressData.spec?.tls?.length || 0;
  };

  const getLoadBalancerHosts = () => {
    const hosts = ingressData.status?.loadBalancer?.ingress?.map(ing => ing.hostname || ing.ip) || [];
    return hosts.length > 0 ? hosts : ['<pending>'];
  };

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
              <BreadcrumbLink href="/dashboard/explore/ingresses">Ingresses</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink href={`/dashboard/explore/ingresses?namespace=${namespace}`}>{namespace}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink>{ingressData.metadata.name}</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="mb-6">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{ingressData.metadata.name}</h1>
                <Badge variant="outline">Ingress</Badge>
              </div>
              <div className="text-gray-500 dark:text-gray-400">
                Namespace: <span onClick={() => navigate(`/dashboard/explore/namespaces/${ingressData.metadata?.namespace}`)} className="text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">{ingressData.metadata.namespace}</span>
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

        {ingressData && (
          <DeletionDialog
            isOpen={showDeleteDialog}
            onClose={() => setShowDeleteDialog(false)}
            onConfirm={confirmResourceDeletion}
            title="Delete Ingress"
            description={`Are you sure you want to delete the ingress "${ingressData.metadata.name}" in namespace "${ingressData.metadata.namespace}"? This action cannot be undone.`}
            resourceName={ingressData.metadata.name as string}
            resourceType="Ingress"
            isLoading={deleteLoading}
          />
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-white dark:bg-gray-900/30 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="h-4 w-4 text-blue-500" />
              <h3 className="text-sm font-medium">Rules</h3>
            </div>
            <div className="text-2xl font-semibold">{getTotalRules()}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Total routing rules
            </div>
          </Card>

          <Card className="bg-white dark:bg-gray-900/30 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="h-4 w-4 text-green-500" />
              <h3 className="text-sm font-medium">TLS</h3>
            </div>
            <div className="text-2xl font-semibold">{getTotalTLS()}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              TLS configurations
            </div>
          </Card>

          <Card className="bg-white dark:bg-gray-900/30 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Router className="h-4 w-4 text-purple-500" />
              <h3 className="text-sm font-medium">Class</h3>
            </div>
            <div className="text-2xl font-semibold">{ingressData.spec?.ingressClassName || 'default'}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Ingress controller class
            </div>
          </Card>

          <Card className="bg-white dark:bg-gray-900/30 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Server className="h-4 w-4 text-orange-500" />
              <h3 className="text-sm font-medium">Load Balancer</h3>
            </div>
            <div className="text-lg font-semibold truncate">
              {getLoadBalancerHosts()[0]}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {getLoadBalancerHosts().length > 1 ? `+${getLoadBalancerHosts().length - 1} more` : 'External address'}
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
          }} className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="yaml">YAML</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 bg-transparent">
            <PropertiesViewer
              metadata={ingressData.metadata}
              kind="Ingress"
              additionalProperties={[
                {
                  label: "Ingress Class",
                  value: ingressData.spec?.ingressClassName || 'default'
                },
                {
                  label: "Load Balancer",
                  value: getLoadBalancerHosts().join(', ')
                }
              ]}
            />

            {/* Rules */}
            {ingressData.spec?.rules && ingressData.spec.rules.length > 0 && (
              <Card className="bg-white dark:bg-gray-900/30 p-4">
                <h3 className="text-lg font-medium mb-4">Rules</h3>
                <div className="space-y-4">
                  {ingressData.spec.rules.map((rule, index) => (
                    <div key={index} className="p-3 rounded-lg border border-gray-200 dark:border-gray-800">
                      <div className="font-medium mb-2">
                        {rule.host || '*'}
                      </div>
                      {rule.http?.paths.map((path, pathIndex) => (
                        <div key={pathIndex} className="pl-4 border-l-2 border-gray-200 dark:border-gray-700 mb-2 last:mb-0">
                          <div className="text-sm">
                            <span className="font-medium">Path: </span>
                            {path.path || '/'}
                            <span className="text-gray-500 dark:text-gray-400 ml-2">
                              ({path.pathType || 'Prefix'})
                            </span>
                          </div>
                          <div className="text-sm">
                            <span className="font-medium">Backend: </span>
                            {path.backend.service?.name}:
                            {path.backend.service?.port?.number || path.backend.service?.port?.name || '-'}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* TLS Config */}
            {ingressData.spec?.tls && ingressData.spec.tls.length > 0 && (
              <Card className="bg-white dark:bg-gray-900/30 p-4">
                <h3 className="text-lg font-medium mb-4">TLS Configuration</h3>
                <div className="space-y-4">
                  {ingressData.spec.tls.map((tls, index) => (
                    <div key={index} className="p-3 rounded-lg border border-gray-200 dark:border-gray-800">
                      <div className="text-sm mb-2">
                        <span className="font-medium">Secret Name: </span>
                        {tls.secretName}
                      </div>
                      {tls.hosts && tls.hosts.length > 0 && (
                        <div>
                          <div className="text-sm font-medium mb-1">Hosts:</div>
                          <div className="flex flex-wrap gap-1">
                            {tls.hosts.map((host, hostIndex) => (
                              <Badge key={hostIndex} variant="outline">
                                {host}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {ingressData.metadata?.annotations && Object.keys(ingressData.metadata.annotations).length > 0 && (
              <Card className="bg-white dark:bg-gray-900/30 p-4">
                <h3 className="text-lg font-medium mb-4">Annotations</h3>
                <div className="space-y-2">
                  {Object.entries(ingressData.metadata.annotations).map(([key, value]) => (
                    <div key={key} className="p-2 rounded-lg border border-gray-200 dark:border-gray-800">
                      <div className="text-sm font-medium">{key}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">{value}</div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <EventsViewer
              events={events}
              resourceName={ingressData.metadata.name}
              resourceKind="Ingress"
              namespace={ingressData.metadata.namespace}
            />
          </TabsContent>

          <TabsContent value="yaml" className="space-y-6">
            <ResourceViewerYamlTab
              resourceData={ingressData}
              namespace={ingressData.metadata.namespace || ''}
              currentContext={currentContext}
            // resourceType="ingresses"
            />
          </TabsContent>

          <TabsContent value="events" className="space-y-6">
            <EventsViewer
              events={events}
              namespace={ingressData.metadata.namespace}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default IngressViewer;