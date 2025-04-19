import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { V1ServiceAccount, CoreV1Event } from '@kubernetes/client-node';
import {
  getResource,
  listResources
} from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';

// Component imports
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ChevronRight, AlertCircle, Clock, ArrowLeft, RefreshCw, Key, Shield, FileText, User } from "lucide-react";
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
import ServiceAccountRoles from '../components/serviceAccountroles.viewer';

// Define interface for service account data (extending V1ServiceAccount with events)
interface ServiceAccountData extends V1ServiceAccount {
  events?: CoreV1Event[];
}

const ServiceAccountViewer: React.FC = () => {
  const [serviceAccountData, setServiceAccountData] = useState<ServiceAccountData | null>(null);
  const [events, setEvents] = useState<CoreV1Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { currentContext } = useCluster();
  const { serviceAccountName, namespace } = useParams<{ serviceAccountName: string; namespace: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const defaultTab = tabParam || 'overview';

  // Fetch events for the service account
  const fetchEvents = async () => {
    if (!currentContext || !namespace) return;

    try {
      // Fetch all events in the namespace
      const eventData = await listResources<'events'>(
        currentContext.name,
        'events',
        { namespace }
      );

      // Filter events for this service account
      const filteredEvents = eventData.filter(event => {
        return (
          event.involvedObject?.kind === 'ServiceAccount' &&
          event.involvedObject?.name === serviceAccountName
        );
      });

      setEvents(filteredEvents);
    } catch (err) {
      console.error('Error fetching events:', err);
    }
  };

  // Fetch service account data and events
  useEffect(() => {
    const fetchServiceAccountData = async () => {
      if (!currentContext || !serviceAccountName || !namespace) {
        setLoading(false);
        setError("Missing required parameters");
        return;
      }

      try {
        setLoading(true);

        // Get service account details
        const data = await getResource<'serviceaccounts'>(
          currentContext.name,
          'serviceaccounts',
          serviceAccountName,
          namespace
        );

        setServiceAccountData(data);
        setError(null);

        // Fetch related events
        await fetchEvents();
      } catch (err) {
        console.error('Error fetching service account:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch service account data');
      } finally {
        setLoading(false);
      }
    };

    fetchServiceAccountData();
  }, [currentContext, namespace, serviceAccountName]);

  // Handle refresh data
  const handleRefresh = () => {
    setLoading(true);
    // Refetch data
    if (currentContext && serviceAccountName && namespace) {
      Promise.all([
        getResource<'serviceaccounts'>(
          currentContext.name,
          'serviceaccounts',
          serviceAccountName,
          namespace
        ),
        fetchEvents()
      ]).then(([data]) => {
        setServiceAccountData(data);
        setLoading(false);
      }).catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to refresh data');
        setLoading(false);
      });
    }
  };

  // Calculate service account age
  const getServiceAccountAge = () => {
    if (!serviceAccountData?.metadata?.creationTimestamp) {
      return 'N/A';
    }

    const creationTime = new Date(serviceAccountData.metadata.creationTimestamp);
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
          <AlertTitle>Error loading service account data</AlertTitle>
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

  // If no service account data
  if (!serviceAccountData || !serviceAccountData.metadata) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTitle>No service account data available</AlertTitle>
          <AlertDescription>
            The requested service account was not found or could not be retrieved.
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

  // Get number of secrets
  const secretsCount = serviceAccountData.secrets?.length || 0;
  const imagePullSecretsCount = serviceAccountData.imagePullSecrets?.length || 0;

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
              <BreadcrumbLink href="/dashboard/explore/serviceaccounts">ServiceAccounts</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink href={`/dashboard/explore/serviceaccounts?namespace=${namespace}`}>{namespace}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink>{serviceAccountData.metadata.name}</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header section */}
        <div className="mb-6">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{serviceAccountData.metadata.name}</h1>
                <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  ServiceAccount
                </Badge>
              </div>
              <div className="text-gray-500 dark:text-gray-400">
                Namespace: <span onClick={() => navigate(`/dashboard/explore/namespaces/${serviceAccountData.metadata?.namespace}`)} className="text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">{serviceAccountData.metadata.namespace}</span>
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
            <TabsTrigger value="roles">Roles</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 bg-transparent">
            {/* ServiceAccount Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <User className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-medium">Account</h3>
                </div>
                <div className="text-lg font-semibold">
                  {serviceAccountData.metadata.name}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Created {getServiceAccountAge()} ago
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Key className="h-4 w-4 text-green-500" />
                  <h3 className="text-sm font-medium">Secrets</h3>
                </div>
                <div className="text-lg font-semibold">
                  {secretsCount}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Associated token and credentials
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4 text-purple-500" />
                  <h3 className="text-sm font-medium">Auto Mount</h3>
                </div>
                <div className="text-lg font-semibold">
                  {serviceAccountData.automountServiceAccountToken === false ? 'Disabled' : 'Enabled'}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Auto mounting of API token
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="h-4 w-4 text-orange-500" />
                  <h3 className="text-sm font-medium">Pull Secrets</h3>
                </div>
                <div className="text-lg font-semibold">
                  {imagePullSecretsCount}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Image pull secrets for pods
                </div>
              </div>
            </div>

            {/* ServiceAccount Properties */}
            <PropertiesViewer
              metadata={serviceAccountData.metadata}
              kind="ServiceAccount"
              status="Active"
              additionalProperties={[
                {
                  label: "Auto Mount Token",
                  value: serviceAccountData.automountServiceAccountToken === false ? 'Disabled' : 'Enabled'
                },
                {
                  label: "Creation Time",
                  value: new Date(serviceAccountData.metadata.creationTimestamp || '').toLocaleString()
                },
                {
                  label: "UID",
                  value: serviceAccountData.metadata.uid || 'N/A'
                }
              ]}
            />

            {/* Secrets Section */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
              <h2 className="text-lg font-medium mb-4">Associated Secrets</h2>
              {serviceAccountData.secrets && serviceAccountData.secrets.length > 0 ? (
                <div className="space-y-2">
                  {serviceAccountData.secrets.map((secret, index) => (
                    <div
                      key={index}
                      className="p-3 rounded-lg border border-gray-200 dark:border-gray-800 flex justify-between items-center"
                    >
                      <div>
                        <div className="font-medium">{secret.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {secret.name?.includes('token') ? 'API Token' : 'Secret'}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/dashboard/explore/secrets/${namespace}/${secret.name}`)}
                      >
                        View Secret
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-gray-500 dark:text-gray-400 p-3 text-center">
                  No secrets found for this ServiceAccount
                </div>
              )}
            </div>

            {/* Image Pull Secrets */}
            {serviceAccountData.imagePullSecrets && serviceAccountData.imagePullSecrets.length > 0 && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
                <h2 className="text-lg font-medium mb-4">Image Pull Secrets</h2>
                <div className="space-y-2">
                  {serviceAccountData.imagePullSecrets.map((secret, index) => (
                    <div
                      key={index}
                      className="p-3 rounded-lg border border-gray-200 dark:border-gray-800 flex justify-between items-center"
                    >
                      <div className="font-medium">{secret.name}</div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/dashboard/explore/secrets/${namespace}/${secret.name}`)}
                      >
                        View Secret
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ServiceAccount Events */}
            <EventsViewer
              events={events}
              resourceName={serviceAccountData.metadata.name}
              resourceKind="ServiceAccount"
              namespace={serviceAccountData.metadata.namespace}
            />
          </TabsContent>

          <TabsContent value="yaml" className="space-y-6">
            <ResourceViewerYamlTab
              resourceData={serviceAccountData}
              namespace={serviceAccountData.metadata.namespace || ''}
              currentContext={currentContext}
            />
          </TabsContent>

          <TabsContent value="events" className="space-y-6">
            <EventsViewer
              events={events}
              namespace={serviceAccountData.metadata.namespace}
            />
          </TabsContent>

          <TabsContent value="roles" className="space-y-6">
            {serviceAccountName && namespace && currentContext && (
              <ServiceAccountRoles
                serviceAccountName={serviceAccountName}
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

export default ServiceAccountViewer;