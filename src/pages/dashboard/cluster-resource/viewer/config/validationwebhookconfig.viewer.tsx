import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { V1ValidatingWebhookConfiguration, CoreV1Event } from '@kubernetes/client-node';
import { deleteResource, getResource, listResources } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';

// Component imports
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ChevronRight, AlertCircle, Clock, ArrowLeft, RefreshCw, WifiOff, ShieldCheck, Filter, Trash } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import KUBERNETES_LOGO from '@/assets/kubernetes.svg';
import { useSearchParams } from 'react-router-dom';
import { useReconMode } from '@/contexts/useRecon';
import { toast } from '@/hooks/use-toast';

// Custom component imports
import PropertiesViewer from '../components/properties.viewer';
import EventsViewer from '../components/event.viewer';
import { DeletionDialog, ResourceViewerYamlTab } from '@/components/custom';

// Define interface for Webhook data with events
interface WebhookData extends V1ValidatingWebhookConfiguration {
  events?: CoreV1Event[];
}

const ValidatingWebhookViewer: React.FC = () => {
  const [webhookData, setWebhookData] = useState<WebhookData | null>(null);
  const [events, setEvents] = useState<CoreV1Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { currentContext, fullWidth } = useCluster();
  const { webhookName } = useParams<{ webhookName: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const defaultTab = tabParam || 'overview';
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const { isReconMode } = useReconMode();
  // Fetch events related to this webhook
  const fetchEvents = async () => {
    if (!currentContext) return;

    try {
      // Fetch all events in the cluster
      const eventData = await listResources<'events'>(
        currentContext.name,
        'events',
        {}
      );

      // Filter events for this webhook
      const filteredEvents = eventData.filter(event => {
        return (
          event.involvedObject?.kind === 'ValidatingWebhookConfiguration' &&
          event.involvedObject?.name === webhookName
        );
      });

      setEvents(filteredEvents);
    } catch (err) {
      console.error('Error fetching events:', err);
    }
  };

  // Fetch webhook data and events
  useEffect(() => {
    const fetchWebhookData = async () => {
      if (!currentContext || !webhookName) {
        setLoading(false);
        setError("Missing required parameters");
        return;
      }

      try {
        setLoading(true);

        // Get webhook details
        const data = await getResource<'validatingwebhookconfigurations'>(
          currentContext.name,
          'validatingwebhookconfigurations',
          webhookName,
          undefined, // ValidatingWebhookConfigurations are cluster-scoped
          'admissionregistration.k8s.io', // API group
          'v1' // API version
        );

        setWebhookData(data as WebhookData);
        setError(null);

        // Fetch related events
        await fetchEvents();
      } catch (err) {
        console.error('Error fetching webhook:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch webhook data');
      } finally {
        setLoading(false);
      }
    };

    fetchWebhookData();
  }, [currentContext, webhookName]);

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
    if (!webhookData || !currentContext) {
      setShowDeleteDialog(false);
      return;
    }

    try {
      setDeleteLoading(true);

      await deleteResource(
        currentContext.name,
        'validatingwebhookconfigurations',
        webhookData.metadata?.name as string,
        {
          // No namespace parameter since ValidatingWebhookConfigurations are cluster-scoped
          apiGroup: 'admissionregistration.k8s.io' // API group for validating webhooks
        }
      );

      // Navigate back to the validating webhooks list
      navigate('/dashboard/explore/validatingwebhookconfigurations');
    } catch (err) {
      console.error('Failed to delete validating webhook:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete validating webhook');
    } finally {
      setDeleteLoading(false);
      setShowDeleteDialog(false);
    }
  };

  // Handle refresh data
  const handleRefresh = () => {
    setLoading(true);
    // Refetch data
    if (currentContext && webhookName) {
      Promise.all([
        getResource<'validatingwebhookconfigurations'>(
          currentContext.name,
          'validatingwebhookconfigurations',
          webhookName,
          undefined,
          'admissionregistration.k8s.io',
          'v1'
        ),
        fetchEvents()
      ]).then(([data]) => {
        setWebhookData(data as WebhookData);
        setLoading(false);
      }).catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to refresh data');
        setLoading(false);
      });
    }
  };

  // Calculate webhook age
  const getWebhookAge = () => {
    if (!webhookData?.metadata?.creationTimestamp) {
      return 'N/A';
    }

    const creationTime = new Date(webhookData.metadata.creationTimestamp);
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
          <AlertTitle>Error loading webhook data</AlertTitle>
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

  // If no webhook data
  if (!webhookData || !webhookData.metadata) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTitle>No webhook data available</AlertTitle>
          <AlertDescription>
            The requested ValidatingWebhookConfiguration was not found or could not be retrieved.
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

  // Count number of webhook configurations
  const webhookCount = webhookData.webhooks?.length || 0;

  return (
    <div className='max-h-[92vh] overflow-y-auto
          
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
              <BreadcrumbLink href="/dashboard/explore/validatingwebhookconfigurations">Validating Webhooks</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink>{webhookData.metadata.name}</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header section */}
        <div className="mb-6">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{webhookData.metadata.name}</h1>
                <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  {webhookCount} webhook{webhookCount !== 1 ? 's' : ''}
                </Badge>
              </div>
              <div className="text-gray-500 dark:text-gray-400 mt-1">
                Validating Admission Webhook
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

        {webhookData && (
          <DeletionDialog
            isOpen={showDeleteDialog}
            onClose={() => setShowDeleteDialog(false)}
            onConfirm={confirmResourceDeletion}
            title="Delete Validating Webhook Configuration"
            description={`Are you sure you want to delete the validating webhook configuration "${webhookData.metadata.name}"? This action cannot be undone.`}
            resourceName={webhookData.metadata.name as string}
            resourceType="ValidatingWebhookConfiguration"
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
          }}
          className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
            <TabsTrigger value="yaml">YAML</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 bg-transparent">
            {/* Webhook Info Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldCheck className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-medium">Webhooks</h3>
                </div>
                <div className="text-2xl font-semibold">
                  {webhookCount}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Configured validation endpoints
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <WifiOff className="h-4 w-4 text-purple-500" />
                  <h3 className="text-sm font-medium">Failure Policy</h3>
                </div>
                <div className="text-lg font-semibold">
                  {webhookData.webhooks && webhookData.webhooks.length > 0
                    ? webhookData.webhooks[0].failurePolicy || 'Fail'
                    : 'N/A'}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Action on webhook failure
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-orange-500" />
                  <h3 className="text-sm font-medium">Age</h3>
                </div>
                <div className="text-lg font-semibold">
                  {getWebhookAge()}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Created {webhookData.metadata.creationTimestamp &&
                    new Date(webhookData.metadata.creationTimestamp).toLocaleString()}
                </div>
              </div>
            </div>


            {/* Webhook Properties */}
            <PropertiesViewer
              metadata={webhookData.metadata}
              kind="ValidatingWebhookConfiguration"
              additionalProperties={[
                {
                  label: "Webhook Count",
                  value: webhookCount.toString()
                },
                {
                  label: "API Version",
                  value: webhookData.apiVersion || 'admissionregistration.k8s.io/v1'
                }
              ]}
            />

            {/* Webhook Events */}
            {events.length > 0 && (
              <EventsViewer
                events={events}
                resourceName={webhookData.metadata.name}
                resourceKind="ValidatingWebhookConfiguration"
              />
            )}
          </TabsContent>

          <TabsContent value="webhooks" className="space-y-6">
            {webhookData.webhooks && webhookData.webhooks.length > 0 ? (
              <div className="space-y-6">
                {webhookData.webhooks.map((webhook, index) => (
                  <div key={index} className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                    <h2 className="text-lg font-medium mb-4">
                      {webhook.name}
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Webhook Configuration */}
                      <div>
                        <h3 className="text-sm font-medium mb-3">Configuration</h3>
                        <div className="space-y-3">
                          <div>
                            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Client Config:</div>
                            <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded">
                              <div className="text-sm">
                                {webhook.clientConfig.url && (
                                  <div><span className="font-medium">URL:</span> {webhook.clientConfig.url}</div>
                                )}
                                {webhook.clientConfig.service && (
                                  <div>
                                    <span className="font-medium">Service:</span>{' '}
                                    {webhook.clientConfig.service.namespace}/{webhook.clientConfig.service.name}
                                    {webhook.clientConfig.service.path && (
                                      <span> (Path: {webhook.clientConfig.service.path})</span>
                                    )}
                                    {webhook.clientConfig.service.port && (
                                      <span> (Port: {webhook.clientConfig.service.port})</span>
                                    )}
                                  </div>
                                )}
                                {webhook.clientConfig.caBundle && (
                                  <div>
                                    <span className="font-medium">CA Bundle:</span>{' '}
                                    <span className="text-xs text-gray-500 dark:text-gray-400">Provided</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Failure Policy:</div>
                              <Badge className={
                                webhook.failurePolicy === 'Ignore'
                                  ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                                  : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                              }>
                                {webhook.failurePolicy || 'Fail'}
                              </Badge>
                            </div>

                            <div>
                              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Side Effects:</div>
                              <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                                {webhook.sideEffects || 'Unknown'}
                              </Badge>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Timeout:</div>
                              <div className="font-medium">
                                {webhook.timeoutSeconds ? `${webhook.timeoutSeconds}s` : 'Default (10s)'}
                              </div>
                            </div>

                            <div>
                              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Admission Review:</div>
                              <div className="font-medium">
                                {webhook.admissionReviewVersions?.join(', ') || 'v1'}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Rules and Selector */}
                      <div>
                        <div className="mb-4">
                          <h3 className="text-sm font-medium mb-2">Rules</h3>
                          {webhook.rules && webhook.rules.length > 0 ? (
                            <div className="space-y-2 max-h-40 overflow-y-auto">
                              {webhook.rules.map((rule, ruleIndex) => (
                                <div key={ruleIndex} className="p-2 bg-gray-100 dark:bg-gray-800 rounded text-sm">
                                  <div>
                                    <span className="font-medium">API Groups:</span>{' '}
                                    {rule.apiGroups?.join(', ') || '*'}
                                  </div>
                                  <div>
                                    <span className="font-medium">API Versions:</span>{' '}
                                    {rule.apiVersions?.join(', ') || '*'}
                                  </div>
                                  <div>
                                    <span className="font-medium">Resources:</span>{' '}
                                    {rule.resources?.join(', ') || '*'}
                                  </div>
                                  <div>
                                    <span className="font-medium">Operations:</span>{' '}
                                    {rule.operations?.join(', ') || '*'}
                                  </div>
                                  {rule.scope && (
                                    <div>
                                      <span className="font-medium">Scope:</span>{' '}
                                      {rule.scope}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-gray-500 dark:text-gray-400">No rules defined</div>
                          )}
                        </div>

                        <div>
                          <h3 className="text-sm font-medium mb-2">Match Conditions</h3>
                          {webhook.matchConditions && webhook.matchConditions.length > 0 ? (
                            <div className="space-y-2">
                              {webhook.matchConditions.map((condition, condIndex) => (
                                <div key={condIndex} className="p-2 bg-gray-100 dark:bg-gray-800 rounded text-sm">
                                  <div>
                                    <span className="font-medium">Name:</span>{' '}
                                    {condition.name}
                                  </div>
                                  <div>
                                    <span className="font-medium">Expression:</span>{' '}
                                    {condition.expression}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-gray-500 dark:text-gray-400">No match conditions defined</div>
                          )}
                        </div>

                        <div className="mt-4">
                          <h3 className="text-sm font-medium mb-2">Object Selector</h3>
                          {webhook.objectSelector?.matchLabels || webhook.objectSelector?.matchExpressions ? (
                            <div>
                              {webhook.objectSelector.matchLabels && (
                                <div className="mb-2">
                                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Match Labels:</div>
                                  <div className="flex flex-wrap gap-1">
                                    {Object.entries(webhook.objectSelector.matchLabels).map(([key, value]) => (
                                      <Badge key={key} variant="outline">
                                        {key}: {value}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {webhook.objectSelector.matchExpressions && webhook.objectSelector.matchExpressions.length > 0 && (
                                <div>
                                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Match Expressions:</div>
                                  <div className="space-y-1">
                                    {webhook.objectSelector.matchExpressions.map((expr, exprIndex) => (
                                      <div key={exprIndex} className="text-sm">
                                        {expr.key} {expr.operator} {expr.values?.join(', ')}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-gray-500 dark:text-gray-400">No object selector defined</div>
                          )}
                        </div>

                        <div className="mt-4">
                          <h3 className="text-sm font-medium mb-2">Namespace Selector</h3>
                          {webhook.namespaceSelector?.matchLabels || webhook.namespaceSelector?.matchExpressions ? (
                            <div>
                              {webhook.namespaceSelector.matchLabels && (
                                <div className="mb-2">
                                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Match Labels:</div>
                                  <div className="flex flex-wrap gap-1">
                                    {Object.entries(webhook.namespaceSelector.matchLabels).map(([key, value]) => (
                                      <Badge key={key} variant="outline">
                                        {key}: {value}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {webhook.namespaceSelector.matchExpressions && webhook.namespaceSelector.matchExpressions.length > 0 && (
                                <div>
                                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Match Expressions:</div>
                                  <div className="space-y-1">
                                    {webhook.namespaceSelector.matchExpressions.map((expr, exprIndex) => (
                                      <div key={exprIndex} className="text-sm">
                                        {expr.key} {expr.operator} {expr.values?.join(', ')}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-gray-500 dark:text-gray-400">No namespace selector defined</div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Warning level badge */}
                    {webhook.failurePolicy === 'Ignore' && (
                      <div className="mt-4 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800/50">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                          <span className="font-medium">Warning: Failures Ignored</span>
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          This webhook is configured to ignore failures, which could allow invalid resources to be created or modified.
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <Alert>
                <AlertDescription>
                  No webhooks are defined in this configuration.
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>

          <TabsContent value="yaml" className="space-y-6">
            <ResourceViewerYamlTab
              resourceData={webhookData}
              currentContext={currentContext}
            />
          </TabsContent>

          <TabsContent value="events" className="space-y-6">
            <EventsViewer
              events={events}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default ValidatingWebhookViewer;