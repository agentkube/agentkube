import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { V1RoleBinding, CoreV1Event } from '@kubernetes/client-node';
import { deleteResource, getResource, listResources } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';

// Component imports
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ChevronRight, AlertCircle, Clock, ArrowLeft, RefreshCw, ShieldCheck, Users, Link2, UserPlus, Trash, Crosshair } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import KUBERNETES_LOGO from '@/assets/kubernetes.svg';
import { useSearchParams } from 'react-router-dom';
import { toast } from '@/hooks/use-toast';
import { useReconMode } from '@/contexts/useRecon';

// Custom component imports
import PropertiesViewer from '../components/properties.viewer';
import EventsViewer from '../components/event.viewer';
import { DeletionDialog, ResourceViewerYamlTab, ResourceCanvas } from '@/components/custom';

// Define interface for RoleBinding data with events
interface RoleBindingData extends V1RoleBinding {
  events?: CoreV1Event[];
}

const RoleBindingViewer: React.FC = () => {
  const [bindingData, setBindingData] = useState<RoleBindingData | null>(null);
  const [events, setEvents] = useState<CoreV1Event[]>([]);
  const [roleData, setRoleData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { currentContext, fullWidth } = useCluster();
  const { bindingName, namespace } = useParams<{ bindingName: string; namespace: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const defaultTab = tabParam || 'overview';
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const { isReconMode } = useReconMode();
  // Get attack path mode from URL params
  const attackPathParam = searchParams.get('attackPath');
  const [attackPathMode, setAttackPathMode] = useState(attackPathParam === 'true');
  // Fetch events for the RoleBinding
  const fetchEvents = async () => {
    if (!currentContext || !namespace) return;

    try {
      // Fetch all events in the namespace
      const eventData = await listResources<'events'>(
        currentContext.name,
        'events',
        { namespace }
      );

      // Filter events for this RoleBinding
      const filteredEvents = eventData.filter(event => {
        return (
          event.involvedObject?.kind === 'RoleBinding' &&
          event.involvedObject?.name === bindingName
        );
      });

      setEvents(filteredEvents);
    } catch (err) {
      console.error('Error fetching events:', err);
    }
  };

  // Fetch the referenced Role
  const fetchReferencedRole = async (roleRef: any) => {
    if (!currentContext || !roleRef || !namespace) return;

    try {
      if (roleRef.kind === 'Role') {
        // Roles are namespaced, fetch from the same namespace as the binding
        const data = await getResource(
          currentContext.name,
          'roles',
          roleRef.name,
          namespace,
          'rbac.authorization.k8s.io'
        );
        setRoleData(data);
      } else if (roleRef.kind === 'ClusterRole') {
        // ClusterRoles are cluster-scoped
        const data = await getResource(
          currentContext.name,
          'clusterroles',
          roleRef.name,
          undefined,
          'rbac.authorization.k8s.io'
        );
        setRoleData(data);
      }
    } catch (err) {
      console.error('Error fetching referenced role:', err);
    }
  };

  // Sync attack path mode with URL parameter
  useEffect(() => {
    const urlAttackPath = searchParams.get('attackPath') === 'true';
    if (urlAttackPath !== attackPathMode) {
      setAttackPathMode(urlAttackPath);
    }
  }, [searchParams, attackPathMode]);

  // Fetch RoleBinding data and related resources
  useEffect(() => {
    const fetchBindingData = async () => {
      if (!currentContext || !bindingName || !namespace) {
        setLoading(false);
        setError("Missing required parameters");
        return;
      }

      try {
        setLoading(true);

        // Get RoleBinding details
        const data = await getResource(
          currentContext.name,
          'rolebindings',
          bindingName,
          namespace,
          'rbac.authorization.k8s.io'
        );

        setBindingData(data);
        setError(null);

        // Fetch related resources
        await Promise.all([
          fetchEvents(),
          fetchReferencedRole(data.roleRef)
        ]);
      } catch (err) {
        console.error('Error fetching RoleBinding:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch RoleBinding data');
      } finally {
        setLoading(false);
      }
    };

    fetchBindingData();
  }, [currentContext, namespace, bindingName]);
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
    if (!bindingData || !currentContext) {
      setShowDeleteDialog(false);
      return;
    }

    try {
      setDeleteLoading(true);

      await deleteResource(
        currentContext.name,
        'rolebindings',
        bindingData.metadata?.name as string,
        {
          namespace: bindingData.metadata?.namespace,
          apiGroup: 'rbac.authorization.k8s.io'
        }
      );

      // Navigate back to the role bindings list
      navigate('/dashboard/explore/rolebindings');
    } catch (err) {
      console.error('Failed to delete role binding:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete role binding');
    } finally {
      setDeleteLoading(false);
      setShowDeleteDialog(false);
    }
  };
  // Handle refresh data
  const handleRefresh = () => {
    setLoading(true);
    // Refetch data
    if (currentContext && bindingName && namespace) {
      Promise.all([
        getResource(
          currentContext.name,
          'rolebindings',
          bindingName,
          namespace,
          'rbac.authorization.k8s.io'
        ).then(data => {
          setBindingData(data);
          return fetchReferencedRole(data.roleRef);
        }),
        fetchEvents()
      ]).then(() => {
        setLoading(false);
      }).catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to refresh data');
        setLoading(false);
      });
    }
  };

  // Calculate RoleBinding age
  const getBindingAge = () => {
    if (!bindingData?.metadata?.creationTimestamp) {
      return 'N/A';
    }

    const creationTime = new Date(bindingData.metadata.creationTimestamp);
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

  // Get subject icons by kind
  const getSubjectIcon = (kind: string) => {
    switch (kind) {
      case 'User':
        return <Users className="h-4 w-4 text-blue-500" />;
      case 'Group':
        return <Users className="h-4 w-4 text-green-500" />;
      case 'ServiceAccount':
        return <UserPlus className="h-4 w-4 text-purple-500" />;
      default:
        return <Users className="h-4 w-4 text-gray-500" />;
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
          <AlertTitle>Error loading RoleBinding data</AlertTitle>
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

  // If no RoleBinding data
  if (!bindingData || !bindingData.metadata) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTitle>No RoleBinding data available</AlertTitle>
          <AlertDescription>
            The requested RoleBinding was not found or could not be retrieved.
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

  // Compute stats
  const subjectCount = bindingData.subjects?.length || 0;
  const roleKind = bindingData.roleRef?.kind || 'Unknown';
  const roleName = bindingData.roleRef?.name || 'Unknown';

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
              <BreadcrumbLink href="/dashboard/explore/rolebindings">RoleBindings</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink href={`/dashboard/explore/rolebindings?namespace=${namespace}`}>{namespace}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink>{bindingData.metadata.name}</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header section */}
        <div className="mb-6">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{bindingData.metadata.name}</h1>
                <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  RoleBinding
                </Badge>
              </div>
              <div className="text-gray-500 dark:text-gray-400">
                Namespace: <span onClick={() => navigate(`/dashboard/explore/namespaces/${bindingData.metadata?.namespace}`)} className="text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">{bindingData.metadata.namespace}</span> • Subjects: {subjectCount}
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

        {bindingData && (
          <DeletionDialog
            isOpen={showDeleteDialog}
            onClose={() => setShowDeleteDialog(false)}
            onConfirm={confirmResourceDeletion}
            title="Delete RoleBinding"
            description={`Are you sure you want to delete the role binding "${bindingData.metadata.name}" in namespace "${bindingData.metadata.namespace}"? This action cannot be undone.`}
            resourceName={bindingData.metadata.name as string}
            resourceType="RoleBinding"
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
          <div className='flex justify-between items-center'>
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="subjects">Subjects</TabsTrigger>
              <TabsTrigger value="role">Referenced Role</TabsTrigger>
              <TabsTrigger value="yaml">YAML</TabsTrigger>
              <TabsTrigger value="canvas">Canvas</TabsTrigger>
              <TabsTrigger value="events">Events</TabsTrigger>
            </TabsList>

            {defaultTab === 'canvas' && (
              <Button
                variant={attackPathMode ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  const newAttackPathMode = !attackPathMode;
                  setAttackPathMode(newAttackPathMode);
                  setSearchParams(params => {
                    if (newAttackPathMode) {
                      params.set('attackPath', 'true');
                    } else {
                      params.delete('attackPath');
                    }
                    return params;
                  });
                }}
                className={`ml-2 h-9 ${attackPathMode ? 'bg-orange-500/20 dark:bg-orange-700/20 text-orange-500 dark:text-orange-400 border-none' : ''}`}
                title={attackPathMode ? "Disable Attack Path Analysis" : "Enable Attack Path Analysis"}
              >
                <Crosshair className="h-4 w-4 mr-1.5" />
                Attack Path
              </Button>
            )}
          </div>

          <TabsContent value="overview" className="space-y-6 bg-transparent">
            {/* RoleBinding Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldCheck className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-medium">Binding Type</h3>
                </div>
                <div className="text-lg font-semibold truncate">
                  RoleBinding
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Namespace-scoped RBAC binding
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Link2 className="h-4 w-4 text-green-500" />
                  <h3 className="text-sm font-medium">References</h3>
                </div>
                <div className="text-lg font-semibold">
                  {roleName}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {roleKind} referenced
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-4 w-4 text-purple-500" />
                  <h3 className="text-sm font-medium">Subjects</h3>
                </div>
                <div className="text-lg font-semibold">
                  {subjectCount}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Users, groups, or service accounts
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-orange-500" />
                  <h3 className="text-sm font-medium">Age</h3>
                </div>
                <div className="text-lg font-semibold">
                  {getBindingAge()}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Created {new Date(bindingData.metadata.creationTimestamp || '').toLocaleString()}
                </div>
              </div>
            </div>

            {/* RoleBinding Properties */}
            <PropertiesViewer
              metadata={bindingData.metadata}
              kind="RoleBinding"
              status="Active"
              additionalProperties={[
                {
                  label: "Role Reference",
                  value: `${roleKind}/${roleName}`
                },
                {
                  label: "API Group",
                  value: "rbac.authorization.k8s.io"
                },
                {
                  label: "Namespace",
                  value: bindingData.metadata.namespace || 'default'
                },
                {
                  label: "Creation Time",
                  value: new Date(bindingData.metadata.creationTimestamp || '').toLocaleString()
                },
                {
                  label: "UID",
                  value: bindingData.metadata.uid || 'N/A'
                }
              ]}
            />

            {/* Subject Summary */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
              <h2 className="text-lg font-medium mb-4">Subjects</h2>
              {bindingData.subjects && bindingData.subjects.length > 0 ? (
                <div className="space-y-3">
                  {bindingData.subjects.map((subject: any, index: number) => (
                    <div key={index} className="p-3 rounded-lg border border-gray-200 dark:border-gray-800 flex items-center">
                      <div className="mr-3">
                        {getSubjectIcon(subject.kind)}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{subject.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {subject.namespace ? `${subject.kind} (namespace: ${subject.namespace})` : subject.kind}
                        </div>
                      </div>
                      {subject.kind === 'ServiceAccount' && (subject.namespace || namespace) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/dashboard/explore/serviceaccounts/${subject.namespace || namespace}/${subject.name}`)}
                        >
                          View
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-gray-500 dark:text-gray-400 p-3 text-center">
                  No subjects found for this RoleBinding
                </div>
              )}
            </div>

            {/* Referenced Role Summary */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-medium">Referenced {roleKind}</h2>
                {roleData && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (roleKind === 'ClusterRole') {
                        navigate(`/dashboard/explore/clusterroles/${roleData.metadata.name}`);
                      } else {
                        navigate(`/dashboard/explore/roles/${roleData.metadata.namespace}/${roleData.metadata.name}`);
                      }
                    }}
                  >
                    View Role
                  </Button>
                )}
              </div>
              {roleData ? (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="font-medium">{roleData.metadata.name}</div>
                    <Badge>
                      {roleKind === 'ClusterRole' ? 'Cluster-scoped' : 'Namespace-scoped'}
                    </Badge>
                  </div>
                  {roleData.rules && (
                    <div>
                      <div className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                        Permission summary ({roleData.rules.length} rules):
                      </div>
                      <div className="space-y-2">
                        {roleData.rules.slice(0, 3).map((rule: any, index: number) => {
                          const resources = rule.resources?.join(', ') || '*';
                          const verbs = rule.verbs?.join(', ') || '*';

                          return (
                            <div key={index} className="p-2 bg-gray-50 dark:bg-gray-800/50 rounded-md text-sm">
                              <div className="text-gray-700 dark:text-gray-300">
                                Can <span className="font-medium">{verbs}</span> on{' '}
                                <span className="font-medium">{resources}</span>
                              </div>
                            </div>
                          );
                        })}
                        {roleData.rules.length > 3 && (
                          <div className="text-center text-sm text-gray-500 dark:text-gray-400">
                            And {roleData.rules.length - 3} more rules...
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-900/10 rounded-lg">
                  <div>
                    <div className="font-medium">{roleName}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {roleKind} • Unable to fetch additional details
                    </div>
                  </div>
                  <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                    Reference Only
                  </Badge>
                </div>
              )}
            </div>

            {/* RoleBinding Events */}
            <EventsViewer
              events={events}
              resourceName={bindingData.metadata.name}
              resourceKind="RoleBinding"
              namespace={bindingData.metadata.namespace}
            />
          </TabsContent>

          <TabsContent value="subjects" className="space-y-6">
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-medium">Subjects</h2>
                <Badge>{subjectCount} Total</Badge>
              </div>
              {bindingData.subjects && bindingData.subjects.length > 0 ? (
                <div className="space-y-4">
                  {bindingData.subjects.map((subject: any, index: number) => (
                    <div key={index} className="p-4 rounded-lg border border-gray-200 dark:border-gray-800">
                      <div className="flex items-center gap-2 mb-3">
                        {getSubjectIcon(subject.kind)}
                        <h3 className="font-medium">{subject.kind}</h3>
                      </div>

                      <div className="space-y-3">
                        <div className="grid grid-cols-4 gap-2">
                          <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Name:</div>
                          <div className="col-span-3 text-sm">{subject.name}</div>
                        </div>

                        {subject.namespace && (
                          <div className="grid grid-cols-4 gap-2">
                            <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Namespace:</div>
                            <div className="col-span-3 text-sm">{subject.namespace}</div>
                          </div>
                        )}

                        {subject.apiGroup && (
                          <div className="grid grid-cols-4 gap-2">
                            <div className="text-sm font-medium text-gray-700 dark:text-gray-300">API Group:</div>
                            <div className="col-span-3 text-sm">{subject.apiGroup}</div>
                          </div>
                        )}
                      </div>

                      {subject.kind === 'ServiceAccount' && (subject.namespace || namespace) && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-3"
                          onClick={() => navigate(`/dashboard/explore/serviceaccounts/${subject.namespace || namespace}/${subject.name}`)}
                        >
                          View Service Account
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center p-6 text-gray-500 dark:text-gray-400">
                  No subjects defined for this RoleBinding
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="role" className="space-y-6">
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-medium">Referenced {roleKind}</h2>
                {roleData && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (roleKind === 'ClusterRole') {
                        navigate(`/dashboard/explore/clusterroles/${roleData.metadata.name}`);
                      } else {
                        navigate(`/dashboard/explore/roles/${roleData.metadata.namespace}/${roleData.metadata.name}`);
                      }
                    }}
                  >
                    View Full Role
                  </Button>
                )}
              </div>

              {roleData ? (
                <div className="space-y-4">
                  <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <div className="grid grid-cols-4 gap-2">
                      <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Name:</div>
                      <div className="col-span-3 text-sm">{roleData.metadata.name}</div>
                    </div>
                    <div className="grid grid-cols-4 gap-2 mt-2">
                      <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Kind:</div>
                      <div className="col-span-3 text-sm">{roleData.kind}</div>
                    </div>
                    {roleData.metadata.namespace && (
                      <div className="grid grid-cols-4 gap-2 mt-2">
                        <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Namespace:</div>
                        <div className="col-span-3 text-sm">{roleData.metadata.namespace}</div>
                      </div>
                    )}
                    <div className="grid grid-cols-4 gap-2 mt-2">
                      <div className="text-sm font-medium text-gray-700 dark:text-gray-300">UID:</div>
                      <div className="col-span-3 text-sm">{roleData.metadata.uid}</div>
                    </div>
                    <div className="grid grid-cols-4 gap-2 mt-2">
                      <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Created:</div>
                      <div className="col-span-3 text-sm">
                        {new Date(roleData.metadata.creationTimestamp).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* Role Rules */}
                  <div>
                    <h3 className="text-md font-medium mb-3">Permission Rules</h3>
                    <div className="space-y-3">
                      {roleData.rules && roleData.rules.length > 0 ? (
                        roleData.rules.map((rule: any, index: number) => {
                          const resources = rule.resources?.join(', ') || '*';
                          const apiGroups = rule.apiGroups?.join(', ') || '';
                          const verbs = rule.verbs?.join(', ') || '*';
                          const nonResourceURLs = rule.nonResourceURLs?.join(', ');

                          const isAdmin = rule.verbs.some((v: string) =>
                            ['create', 'update', 'delete', 'patch', '*'].includes(v)
                          );

                          return (
                            <div
                              key={index}
                              className={`p-3 rounded-lg border ${isAdmin
                                ? 'border-red-100 dark:border-red-900/30 bg-red-50 dark:bg-red-900/10'
                                : 'border-green-100 dark:border-green-900/30 bg-green-50 dark:bg-green-900/10'
                                }`}
                            >
                              <div className="flex justify-between items-start mb-2">
                                <div className="font-medium">Rule #{index + 1}</div>
                                <Badge className={isAdmin
                                  ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                                  : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"}>
                                  {isAdmin ? 'Admin' : 'Read-Only'}
                                </Badge>
                              </div>

                              <div className="space-y-1 mt-2 text-sm">
                                {resources && (
                                  <div>
                                    <span className="font-medium">Resources:</span> {resources}
                                  </div>
                                )}

                                {apiGroups && (
                                  <div>
                                    <span className="font-medium">API Groups:</span> {apiGroups || 'core'}
                                  </div>
                                )}

                                {nonResourceURLs && (
                                  <div>
                                    <span className="font-medium">Non-Resource URLs:</span> {nonResourceURLs}
                                  </div>
                                )}

                                {verbs && (
                                  <div>
                                    <span className="font-medium">Verbs:</span> {verbs}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-center p-3 text-gray-500 dark:text-gray-400">
                          No rules defined for this role
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center">
                  <div className="text-amber-500 dark:text-amber-400 mb-2">
                    Referenced {roleKind} could not be retrieved
                  </div>
                  <div className="text-gray-500 dark:text-gray-400">
                    The {roleKind} "{roleName}" referenced by this binding either doesn't exist or cannot be accessed.
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="yaml" className="space-y-6">
            <ResourceViewerYamlTab
              resourceData={bindingData}
              namespace={bindingData.metadata.namespace || ''}
              currentContext={currentContext}
            />
          </TabsContent>

          <TabsContent value="canvas" className="space-y-6">
            <div className="h-[calc(100vh-300px)] min-h-[500px] rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
              {bindingData && (
                <ResourceCanvas
                  resourceDetails={{
                    namespace: bindingData.metadata?.namespace || '',
                    group: 'rbac.authorization.k8s.io',
                    version: 'v1',
                    resourceType: 'rolebindings',
                    resourceName: bindingData.metadata?.name || '',
                  }}
                  attackPath={attackPathMode}
                />
              )}
            </div>
          </TabsContent>

          <TabsContent value="events" className="space-y-6">
            <EventsViewer
              events={events}
              namespace={bindingData.metadata.namespace}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default RoleBindingViewer;