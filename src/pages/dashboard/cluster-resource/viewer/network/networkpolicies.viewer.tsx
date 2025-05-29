import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { V1NetworkPolicy, CoreV1Event } from '@kubernetes/client-node';
import {
  deleteResource,
  getResource,
  listResources
} from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';

// Component imports
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ChevronRight, AlertCircle, ArrowLeft, RefreshCw, Network, Shield, Filter, Trash } from "lucide-react";
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
import { DeletionDialog } from '@/components/custom';

// Define interface for networkpolicy data
interface NetworkPolicyData extends V1NetworkPolicy {
  events?: CoreV1Event[];
}

const NetworkPolicyViewer: React.FC = () => {
  const [networkPolicyData, setNetworkPolicyData] = useState<NetworkPolicyData | null>(null);
  const [events, setEvents] = useState<CoreV1Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { currentContext, fullWidth } = useCluster();
  const { networkPolicyName, namespace } = useParams<{ networkPolicyName: string; namespace: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const defaultTab = tabParam || 'overview';
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  // Fetch events for the networkpolicy
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

  // Fetch networkpolicy data and events
  useEffect(() => {
    const fetchNetworkPolicyData = async () => {
      if (!currentContext || !networkPolicyName || !namespace) {
        setLoading(false);
        setError("Missing required parameters");
        return;
      }

      try {
        setLoading(true);

        // Get networkpolicy details
        const data = await getResource<'networkpolicies'>(
          currentContext.name,
          'networkpolicies',
          networkPolicyName,
          namespace,
          'networking.k8s.io' // API group for NetworkPolicy
        );

        setNetworkPolicyData(data);
        setError(null);

        // Fetch related events
        await fetchEvents();
      } catch (err) {
        console.error('Error fetching networkpolicy:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch NetworkPolicy data');
      } finally {
        setLoading(false);
      }
    };

    fetchNetworkPolicyData();
  }, [currentContext, namespace, networkPolicyName]);

  const handleDelete = () => {
    setShowDeleteDialog(true);
  };

  const confirmResourceDeletion = async () => {
    if (!networkPolicyData || !currentContext) {
      setShowDeleteDialog(false);
      return;
    }

    try {
      setDeleteLoading(true);

      await deleteResource(
        currentContext.name,
        'networkpolicies',
        networkPolicyData.metadata?.name as string,
        {
          namespace: networkPolicyData.metadata?.namespace,
          apiGroup: 'networking.k8s.io'
        }
      );

      // Navigate back to the network policies list
      navigate('/dashboard/explore/networkpolicies');
    } catch (err) {
      console.error('Failed to delete network policy:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete network policy');
    } finally {
      setDeleteLoading(false);
      setShowDeleteDialog(false);
    }
  };

  // Handle refresh data
  const handleRefresh = () => {
    setLoading(true);
    // Refetch data
    if (currentContext && networkPolicyName && namespace) {
      Promise.all([
        getResource<'networkpolicies'>(
          currentContext.name,
          'networkpolicies',
          networkPolicyName,
          namespace,
          'networking.k8s.io'
        ),
        fetchEvents()
      ]).then(([data]) => {
        setNetworkPolicyData(data);
        setLoading(false);
      }).catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to refresh data');
        setLoading(false);
      });
    }
  };

  // Calculate resource age
  const getNetworkPolicyAge = () => {
    if (!networkPolicyData?.metadata?.creationTimestamp) {
      return 'N/A';
    }

    const creationTime = new Date(networkPolicyData.metadata.creationTimestamp);
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
          <AlertTitle>Error loading NetworkPolicy data</AlertTitle>
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

  // If no networkpolicy data
  if (!networkPolicyData || !networkPolicyData.metadata) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTitle>No NetworkPolicy data available</AlertTitle>
          <AlertDescription>
            The requested NetworkPolicy was not found or could not be retrieved.
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

  return (
    <div className='max-h-[92vh] overflow-y-auto
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
              <BreadcrumbLink href="/dashboard/explore/networkpolicies">NetworkPolicies</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink href={`/dashboard/explore/networkpolicies?namespace=${namespace}`}>{namespace}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink>{networkPolicyData.metadata.name}</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header section */}
        <div className="mb-6">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{networkPolicyData.metadata.name}</h1>
                <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  NetworkPolicy
                </Badge>
              </div>
              <div className="text-gray-500 dark:text-gray-400">
                Namespace: <span onClick={() => navigate(`/dashboard/explore/namespaces/${networkPolicyData.metadata?.namespace}`)} className="text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">{networkPolicyData.metadata.namespace}</span>
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

        {networkPolicyData && (
          <DeletionDialog
            isOpen={showDeleteDialog}
            onClose={() => setShowDeleteDialog(false)}
            onConfirm={confirmResourceDeletion}
            title="Delete NetworkPolicy"
            description={`Are you sure you want to delete the network policy "${networkPolicyData.metadata.name}" in namespace "${networkPolicyData.metadata.namespace}"? This action cannot be undone.`}
            resourceName={networkPolicyData.metadata.name as string}
            resourceType="NetworkPolicy"
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
          }} className="space-y-6 bg-transparent">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="yaml">YAML</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 bg-transparent">
            {/* NetworkPolicy Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Filter className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-medium">Policy Type</h3>
                </div>
                <div className="text-lg font-semibold">
                  {networkPolicyData.spec?.policyTypes?.join(', ') || 'Not specified'}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Types of traffic affected by this policy
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4 text-purple-500" />
                  <h3 className="text-sm font-medium">Pod Selector</h3>
                </div>
                <div className="text-lg font-semibold overflow-hidden">
                  {Object.keys(networkPolicyData.spec?.podSelector?.matchLabels || {}).length > 0
                    ? Object.entries(networkPolicyData.spec?.podSelector?.matchLabels || {})
                      .map(([key, value]) => `${key}: ${value}`).join(', ')
                    : networkPolicyData.spec?.podSelector?.matchExpressions?.length
                      ? 'Using expressions'
                      : 'All pods (empty selector)'}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Pods targeted by this policy
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Network className="h-4 w-4 text-green-500" />
                  <h3 className="text-sm font-medium">Rules</h3>
                </div>
                <div className="text-lg font-semibold">
                  {(networkPolicyData.spec?.ingress?.length || 0) +
                    (networkPolicyData.spec?.egress?.length || 0)}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Ingress: {networkPolicyData.spec?.ingress?.length || 0},
                  Egress: {networkPolicyData.spec?.egress?.length || 0}
                </div>
              </div>
            </div>

            {/* NetworkPolicy Properties */}
            <PropertiesViewer
              metadata={networkPolicyData.metadata}
              kind="NetworkPolicy"
              additionalProperties={[
                {
                  label: "Age",
                  value: getNetworkPolicyAge()
                },
                {
                  label: "Created",
                  value: formatDateTime(networkPolicyData.metadata.creationTimestamp?.toString())
                },
                {
                  label: "PolicyTypes",
                  value: networkPolicyData.spec?.policyTypes?.join(', ') || 'Not specified'
                }
              ]}
            />

            {/* Pod Selector Details */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
              <h2 className="text-lg font-medium mb-4">Pod Selector</h2>
              <div className="space-y-4">
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    The following pods in namespace <span className="font-semibold">{networkPolicyData.metadata.namespace}</span> are targeted by this policy:
                  </div>
                  {Object.keys(networkPolicyData.spec?.podSelector?.matchLabels || {}).length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(networkPolicyData.spec?.podSelector?.matchLabels || {}).map(([key, value]) => (
                        <Badge key={key} className="bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
                          {key}: {value}
                        </Badge>
                      ))}
                    </div>
                  ) : networkPolicyData.spec?.podSelector?.matchExpressions?.length ? (
                    <div className="space-y-2">
                      {networkPolicyData.spec.podSelector.matchExpressions.map((expr, index) => (
                        <div key={index} className="p-2 bg-gray-50 dark:bg-gray-800 rounded">
                          <code>
                            {expr.key} {expr.operator} {expr.values?.join(', ')}
                          </code>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-amber-600 dark:text-amber-400">
                      <Alert>
                        <AlertDescription>
                          Empty selector targets all pods in the namespace. This can have a significant impact on pod connectivity.
                        </AlertDescription>
                      </Alert>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Ingress Rules */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
              <h2 className="text-lg font-medium mb-4">Ingress Rules</h2>
              {!networkPolicyData.spec?.ingress || networkPolicyData.spec.ingress.length === 0 ? (
                <Alert>
                  <AlertDescription>
                    No ingress rules defined. By default, this means all incoming traffic to selected pods is denied.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-4">
                  {networkPolicyData.spec.ingress.map((ingress, index) => (
                    <div key={index} className="p-3 border border-gray-200 dark:border-gray-700 rounded-md">
                      <h3 className="font-medium mb-2">Rule {index + 1}</h3>

                      {/* From section */}
                      {ingress._from && ingress._from.length > 0 ? (
                        <div className="mb-3">
                          <div className="text-sm font-medium mb-1">From:</div>
                          <div className="space-y-2 pl-4">
                            {ingress._from.map((from, fromIndex) => (
                              <div key={fromIndex} className="bg-gray-50 dark:bg-gray-800 p-2 rounded">
                                {from.podSelector && (
                                  <div className="mb-1">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">Pod Selector: </span>
                                    {Object.keys(from.podSelector.matchLabels || {}).length > 0 ? (
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {Object.entries(from.podSelector.matchLabels || {}).map(([key, value]) => (
                                          <Badge key={key} variant="outline">
                                            {key}: {value}
                                          </Badge>
                                        ))}
                                      </div>
                                    ) : from.podSelector.matchExpressions?.length ? (
                                      <div>Using expressions</div>
                                    ) : (
                                      <div>All pods in namespace</div>
                                    )}
                                  </div>
                                )}

                                {from.namespaceSelector && (
                                  <div className="mb-1">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">Namespace Selector: </span>
                                    {Object.keys(from.namespaceSelector.matchLabels || {}).length > 0 ? (
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {Object.entries(from.namespaceSelector.matchLabels || {}).map(([key, value]) => (
                                          <Badge key={key} variant="outline">
                                            {key}: {value}
                                          </Badge>
                                        ))}
                                      </div>
                                    ) : from.namespaceSelector.matchExpressions?.length ? (
                                      <div>Using expressions</div>
                                    ) : (
                                      <div>All namespaces</div>
                                    )}
                                  </div>
                                )}

                                {from.ipBlock && (
                                  <div>
                                    <span className="text-sm text-gray-600 dark:text-gray-400">IP Block: </span>
                                    <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">{from.ipBlock.cidr}</code>
                                    {from.ipBlock.except && from.ipBlock.except.length > 0 && (
                                      <div className="mt-1">
                                        <span className="text-sm text-gray-600 dark:text-gray-400">Except: </span>
                                        {from.ipBlock.except.map((cidr, cidrIndex) => (
                                          <code key={cidrIndex} className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded mr-1">
                                            {cidr}
                                          </code>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="mb-3 text-green-600 dark:text-green-400">
                          <span className="text-sm">From: All sources (no restrictions on source)</span>
                        </div>
                      )}

                      {/* Ports section */}
                      {ingress.ports && ingress.ports.length > 0 ? (
                        <div>
                          <div className="text-sm font-medium mb-1">Ports:</div>
                          <div className="flex flex-wrap gap-1">
                            {ingress.ports.map((port, portIndex) => (
                              <Badge key={portIndex} className="bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
                                {port.port} {port.protocol && `/ ${port.protocol}`}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="text-green-600 dark:text-green-400">
                          <span className="text-sm">Ports: All ports allowed</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Egress Rules */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
              <h2 className="text-lg font-medium mb-4">Egress Rules</h2>
              {!networkPolicyData.spec?.egress || networkPolicyData.spec.egress.length === 0 ? (
                <Alert>
                  <AlertDescription>
                    No egress rules defined. If 'Egress' is in the policy types, this means all outgoing traffic from selected pods is denied.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-4">
                  {networkPolicyData.spec.egress.map((egress, index) => (
                    <div key={index} className="p-3 border border-gray-200 dark:border-gray-700 rounded-md">
                      <h3 className="font-medium mb-2">Rule {index + 1}</h3>

                      {/* To section */}
                      {egress.to && egress.to.length > 0 ? (
                        <div className="mb-3">
                          <div className="text-sm font-medium mb-1">To:</div>
                          <div className="space-y-2 pl-4">
                            {egress.to.map((to, toIndex) => (
                              <div key={toIndex} className="bg-gray-50 dark:bg-gray-800 p-2 rounded">
                                {to.podSelector && (
                                  <div className="mb-1">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">Pod Selector: </span>
                                    {Object.keys(to.podSelector.matchLabels || {}).length > 0 ? (
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {Object.entries(to.podSelector.matchLabels || {}).map(([key, value]) => (
                                          <Badge key={key} variant="outline">
                                            {key}: {value}
                                          </Badge>
                                        ))}
                                      </div>
                                    ) : to.podSelector.matchExpressions?.length ? (
                                      <div>Using expressions</div>
                                    ) : (
                                      <div>All pods in namespace</div>
                                    )}
                                  </div>
                                )}

                                {to.namespaceSelector && (
                                  <div className="mb-1">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">Namespace Selector: </span>
                                    {Object.keys(to.namespaceSelector.matchLabels || {}).length > 0 ? (
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {Object.entries(to.namespaceSelector.matchLabels || {}).map(([key, value]) => (
                                          <Badge key={key} variant="outline">
                                            {key}: {value}
                                          </Badge>
                                        ))}
                                      </div>
                                    ) : to.namespaceSelector.matchExpressions?.length ? (
                                      <div>Using expressions</div>
                                    ) : (
                                      <div>All namespaces</div>
                                    )}
                                  </div>
                                )}

                                {to.ipBlock && (
                                  <div>
                                    <span className="text-sm text-gray-600 dark:text-gray-400">IP Block: </span>
                                    <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">{to.ipBlock.cidr}</code>
                                    {to.ipBlock.except && to.ipBlock.except.length > 0 && (
                                      <div className="mt-1">
                                        <span className="text-sm text-gray-600 dark:text-gray-400">Except: </span>
                                        {to.ipBlock.except.map((cidr, cidrIndex) => (
                                          <code key={cidrIndex} className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded mr-1">
                                            {cidr}
                                          </code>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="mb-3 text-green-600 dark:text-green-400">
                          <span className="text-sm">To: All destinations (no restrictions on destination)</span>
                        </div>
                      )}

                      {/* Ports section */}
                      {egress.ports && egress.ports.length > 0 ? (
                        <div>
                          <div className="text-sm font-medium mb-1">Ports:</div>
                          <div className="flex flex-wrap gap-1">
                            {egress.ports.map((port, portIndex) => (
                              <Badge key={portIndex} className="bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
                                {port.port} {port.protocol && `/ ${port.protocol}`}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="text-green-600 dark:text-green-400">
                          <span className="text-sm">Ports: All ports allowed</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Network Policy Visualization */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
              <h2 className="text-lg font-medium mb-4">Policy Impact Summary</h2>
              <div className="space-y-3">
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded">
                  <div className="font-medium mb-1">Affected Pods</div>
                  <div className="text-sm">
                    {Object.keys(networkPolicyData.spec?.podSelector?.matchLabels || {}).length > 0 ? (
                      <div>
                        Pods with labels: <span className="font-mono">{
                          Object.entries(networkPolicyData.spec?.podSelector?.matchLabels || {})
                            .map(([key, value]) => `${key}=${value}`).join(', ')
                        }</span>
                      </div>
                    ) : networkPolicyData.spec?.podSelector?.matchExpressions?.length ? (
                      <div>Pods matching expression selectors</div>
                    ) : (
                      <div className="font-semibold text-amber-600 dark:text-amber-400">All pods in namespace {networkPolicyData.metadata.namespace}</div>
                    )}
                  </div>
                </div>

                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded">
                  <div className="font-medium mb-1">Ingress Traffic (Incoming)</div>
                  <div className="text-sm">
                    {!networkPolicyData.spec?.policyTypes?.includes('Ingress') ? (
                      <div>Not affected by this policy</div>
                    ) : !networkPolicyData.spec?.ingress || networkPolicyData.spec.ingress.length === 0 ? (
                      <div className="font-semibold text-red-600 dark:text-red-400">All incoming traffic denied</div>
                    ) : (
                      <div className="text-green-600 dark:text-green-400">
                        Allowed from specific sources (see Ingress Rules section)
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded">
                  <div className="font-medium mb-1">Egress Traffic (Outgoing)</div>
                  <div className="text-sm">
                    {!networkPolicyData.spec?.policyTypes?.includes('Egress') ? (
                      <div>Not affected by this policy</div>
                    ) : !networkPolicyData.spec?.egress || networkPolicyData.spec.egress.length === 0 ? (
                      <div className="font-semibold text-red-600 dark:text-red-400">All outgoing traffic denied</div>
                    ) : (
                      <div className="text-green-600 dark:text-green-400">
                        Allowed to specific destinations (see Egress Rules section)
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* NetworkPolicy Events */}
            <EventsViewer
              events={events}
              resourceName={networkPolicyData.metadata.name}
              resourceKind="NetworkPolicy"
              namespace={networkPolicyData.metadata.namespace}
            />
          </TabsContent>

          <TabsContent value="yaml" className="space-y-6">
            <ResourceViewerYamlTab
              resourceData={networkPolicyData}
              namespace={networkPolicyData.metadata.namespace || ''}
              currentContext={currentContext}
            // resourceType="networkpolicies"
            />
          </TabsContent>

          <TabsContent value="events" className="space-y-6">
            <EventsViewer
              events={events}
              namespace={networkPolicyData.metadata.namespace}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default NetworkPolicyViewer;
