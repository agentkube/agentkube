import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { V1IngressClass, CoreV1Event } from '@kubernetes/client-node';
import {
  deleteResource,
  getResource,
  listResources
} from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';

// Component imports
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ChevronRight, AlertCircle, ArrowLeft, RefreshCw, Network, Link2, Server, Trash } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import KUBERNETES_LOGO from '@/assets/kubernetes.svg';

// Custom component imports
import PropertiesViewer from '../components/properties.viewer';
import EventsViewer from '../components/event.viewer';
import ResourceViewerYamlTab from '@/components/custom/editor/resource-viewer-tabs.component';
import { useSearchParams } from 'react-router-dom';
import { DeletionDialog } from '@/components/custom';

// Define interface for ingressclass data
interface IngressClassData extends V1IngressClass {
  events?: CoreV1Event[];
}

const IngressClassViewer: React.FC = () => {
  const [ingressClassData, setIngressClassData] = useState<IngressClassData | null>(null);
  const [events, setEvents] = useState<CoreV1Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { currentContext, fullWidth } = useCluster();
  const { ingressClassName } = useParams<{ ingressClassName: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const defaultTab = tabParam || 'overview';
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Fetch events for the ingressclass
  const fetchEvents = async () => {
    if (!currentContext || !ingressClassName) return;
  
    try {
      // Fetch events specific to this ingressclass using fieldSelector
      const eventData = await listResources<'events'>(
        currentContext.name,
        'events',
        { 
          fieldSelector: `involvedObject.name=${ingressClassName},involvedObject.kind=IngressClass`
        }
      );
  
      setEvents(eventData);
    } catch (err) {
      console.error('Error fetching events:', err);
    }
  };

  // Fetch ingressclass data and events
  useEffect(() => {
    const fetchIngressClassData = async () => {
      if (!currentContext || !ingressClassName) {
        setLoading(false);
        setError("Missing required parameters");
        return;
      }

      try {
        setLoading(true);

        // Get ingressclass details (IngressClass is cluster-scoped, no namespace)
        const data = await getResource<'ingressclasses'>(
          currentContext.name,
          'ingressclasses',
          ingressClassName,
          undefined, // No namespace
          'networking.k8s.io' // API group for IngressClass
        );

        setIngressClassData(data);
        setError(null);

        // Fetch related events
        await fetchEvents();
      } catch (err) {
        console.error('Error fetching ingressclass:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch IngressClass data');
      } finally {
        setLoading(false);
      }
    };

    fetchIngressClassData();
  }, [currentContext, ingressClassName]);

  const handleDelete = () => {
    setShowDeleteDialog(true);
  };

  const confirmResourceDeletion = async () => {
    if (!ingressClassData || !currentContext) {
      setShowDeleteDialog(false);
      return;
    }

    try {
      setDeleteLoading(true);

      await deleteResource(
        currentContext.name,
        'ingressclasses',
        ingressClassData.metadata?.name as string,
        {
          // Note: IngressClasses are cluster-scoped, so no namespace parameter needed
          apiGroup: 'networking.k8s.io'
        }
      );

      // Navigate back to the ingress classes list
      navigate('/dashboard/explore/ingressclasses');
    } catch (err) {
      console.error('Failed to delete ingress class:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete ingress class');
    } finally {
      setDeleteLoading(false);
      setShowDeleteDialog(false);
    }
  };

  // Handle refresh data
  const handleRefresh = () => {
    setLoading(true);
    // Refetch data
    if (currentContext && ingressClassName) {
      Promise.all([
        getResource<'ingressclasses'>(
          currentContext.name,
          'ingressclasses',
          ingressClassName,
          undefined,
          'networking.k8s.io'
        ),
        fetchEvents()
      ]).then(([data]) => {
        setIngressClassData(data);
        setLoading(false);
      }).catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to refresh data');
        setLoading(false);
      });
    }
  };

  // Get IngressClass age
  const getIngressClassAge = () => {
    if (!ingressClassData?.metadata?.creationTimestamp) {
      return 'N/A';
    }

    const creationTime = new Date(ingressClassData.metadata.creationTimestamp);
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
          <AlertTitle>Error loading IngressClass data</AlertTitle>
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

  // If no ingressclass data
  if (!ingressClassData || !ingressClassData.metadata) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTitle>No IngressClass data available</AlertTitle>
          <AlertDescription>
            The requested IngressClass was not found or could not be retrieved.
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

  // Check if this is the default IngressClass
  const isDefault = ingressClassData.metadata.annotations &&
    ingressClassData.metadata.annotations['ingressclass.kubernetes.io/is-default-class'] === 'true';

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
              <BreadcrumbLink href="/dashboard/explore/ingressclasses">IngressClasses</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink>{ingressClassData.metadata.name}</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header section */}
        <div className="mb-6">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{ingressClassData.metadata.name}</h1>
                {isDefault && (
                  <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                    Default
                  </Badge>
                )}
              </div>
              <div className="text-gray-500 dark:text-gray-400">
                Created: <span className="text-gray-700 dark:text-gray-300">{formatDateTime(ingressClassData.metadata.creationTimestamp?.toString())}</span>
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

        {ingressClassData && (
          <DeletionDialog
            isOpen={showDeleteDialog}
            onClose={() => setShowDeleteDialog(false)}
            onConfirm={confirmResourceDeletion}
            title="Delete IngressClass"
            description={`Are you sure you want to delete the ingress class "${ingressClassData.metadata.name}"? This action cannot be undone.`}
            resourceName={ingressClassData.metadata.name as string}
            resourceType="IngressClass"
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
            <TabsTrigger value="yaml">YAML</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 bg-transparent">
            {/* IngressClass Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-transparent p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Network className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-medium">Controller</h3>
                </div>
                <div className="text-lg font-semibold">
                  {ingressClassData.spec?.controller || 'Not specified'}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Controller implementation
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-transparent p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Server className="h-4 w-4 text-purple-500" />
                  <h3 className="text-sm font-medium">Parameters</h3>
                </div>
                <div className="text-lg font-semibold">
                  {ingressClassData.spec?.parameters ? (
                    <>
                      {ingressClassData.spec.parameters.apiGroup && (
                        <span className="text-sm">{ingressClassData.spec.parameters.apiGroup}/</span>
                      )}
                      <span>{ingressClassData.spec.parameters.kind}</span>
                    </>
                  ) : (
                    'None'
                  )}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Additional configuration parameters
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-transparent p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Link2 className="h-4 w-4 text-green-500" />
                  <h3 className="text-sm font-medium">Default</h3>
                </div>
                <div className="text-lg font-semibold">
                  {isDefault ? 'Yes' : 'No'}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Is default IngressClass
                </div>
              </div>
            </div>

            {/* IngressClass Properties */}
            <PropertiesViewer
              metadata={ingressClassData.metadata}
              kind="IngressClass"
              additionalProperties={[
                {
                  label: "Controller",
                  value: ingressClassData.spec?.controller || 'Not specified'
                },
                {
                  label: "Default",
                  value: isDefault ? 'Yes' : 'No'
                },
                {
                  label: "Age",
                  value: getIngressClassAge()
                }
              ]}
            />

            {/* IngressClass Parameters Details */}
            {ingressClassData.spec?.parameters && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-transparent p-4 mb-6">
                <h2 className="text-lg font-medium mb-4">Parameters Configuration</h2>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">API Group</div>
                      <div className="font-medium">{ingressClassData.spec.parameters.apiGroup || 'core'}</div>
                    </div>

                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Kind</div>
                      <div className="font-medium">{ingressClassData.spec.parameters.kind}</div>
                    </div>

                    {ingressClassData.spec.parameters.name && (
                      <div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">Name</div>
                        <div className="font-medium">{ingressClassData.spec.parameters.name}</div>
                      </div>
                    )}

                    {ingressClassData.spec.parameters.namespace && (
                      <div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">Namespace</div>
                        <div className="font-medium">{ingressClassData.spec.parameters.namespace}</div>
                      </div>
                    )}

                    {ingressClassData.spec.parameters.scope && (
                      <div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">Scope</div>
                        <div className="font-medium">{ingressClassData.spec.parameters.scope}</div>
                      </div>
                    )}
                  </div>

                  <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    <p>
                      The parameters field refers to a resource with additional configuration
                      for this IngressClass. The parameters resource contains controller-specific
                      configuration.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Controller Information */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-transparent p-4 mb-6">
              <h2 className="text-lg font-medium mb-4">Controller Information</h2>
              <div className="space-y-4">
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Controller</div>
                  <div className="font-medium">{ingressClassData.spec?.controller || 'Not specified'}</div>
                  <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    {getControllerDescription(ingressClassData.spec?.controller || '')}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-sm text-gray-600 dark:text-gray-400">Usage</div>
                  <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-md font-mono text-xs">
                    <pre>
                      {`apiVersion: networking.k8s.io/v1
  kind: Ingress
  metadata:
    name: example-ingress
  spec:
    ingressClassName: ${ingressClassData.metadata.name}
    rules:
      # ... ingress rules here`}
                    </pre>
                  </div>
                  <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    To use this IngressClass, specify <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">ingressClassName: {ingressClassData.metadata.name}</code> in your Ingress resources.
                    {isDefault && " This is the default IngressClass, so it will be used if no ingressClassName is specified."}
                  </div>
                </div>
              </div>
            </div>

            {/* IngressClass Events */}
            <EventsViewer
              events={events}
              resourceName={ingressClassData.metadata.name}
              resourceKind="IngressClass"
            />
          </TabsContent>

          <TabsContent value="yaml" className="space-y-6">
            <ResourceViewerYamlTab
              resourceData={ingressClassData}
              namespace={ingressClassData.metadata.namespace || ''}
              currentContext={currentContext}
            // resourceType="ingressclasses"
            />
          </TabsContent>

          <TabsContent value="events" className="space-y-6">
            <EventsViewer
              events={events}
              resourceName={ingressClassData.metadata.name}
              resourceKind="IngressClass"
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

// Helper function to get controller description
const getControllerDescription = (controller: string): string => {
  const descriptions: Record<string, string> = {
    'k8s.io/ingress-nginx': 'NGINX Ingress Controller is an Ingress controller that uses NGINX as a reverse proxy and load balancer.',
    'kubernetes.io/ingress-nginx': 'NGINX Ingress Controller is an Ingress controller that uses NGINX as a reverse proxy and load balancer.',
    'nginx.org/ingress-controller': 'NGINX Ingress Controller by F5 NGINX.',
    'k8s.io/ingress-gce': 'Google Kubernetes Engine Ingress Controller for Google Cloud Load Balancer.',
    'ingress.k8s.aws/alb': 'AWS Application Load Balancer (ALB) Ingress Controller.',
    'kubernetes.io/ingress-aws-alb': 'AWS Application Load Balancer (ALB) Ingress Controller.',
    'traefik.io/ingress-controller': 'Traefik Ingress Controller, a modern HTTP reverse proxy and load balancer.',
    'haproxy-ingress.github.io/controller': 'HAProxy Ingress Controller using HAProxy as the load balancer.',
    'projectcontour.io/ingress-controller': 'Contour Ingress Controller based on the Envoy proxy.',
    'istio.io/ingress-controller': 'Istio Ingress Gateway Controller as part of the Istio service mesh.',
    'kong.github.io/controller': 'Kong Ingress Controller using Kong API Gateway.'
  };

  return descriptions[controller] ||
    'This controller handles the routing and load balancing for Ingress resources that specify this IngressClass.';
};

export default IngressClassViewer;