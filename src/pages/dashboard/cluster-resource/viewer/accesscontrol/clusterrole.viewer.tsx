import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { V1ClusterRole, CoreV1Event } from '@kubernetes/client-node';
import { getResource, listResources } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';

// Component imports
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ChevronRight, AlertCircle, Clock, ArrowLeft, RefreshCw, ShieldCheck, Key, Lock, Users } from "lucide-react";
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

// Define interface for ClusterRole data with events
interface ClusterRoleData extends V1ClusterRole {
  events?: CoreV1Event[];
}

const ClusterRoleViewer: React.FC = () => {
  const [clusterRoleData, setClusterRoleData] = useState<ClusterRoleData | null>(null);
  const [events, setEvents] = useState<CoreV1Event[]>([]);
  const [roleBindings, setRoleBindings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { currentContext } = useCluster();
  const { clusterRoleName } = useParams<{ clusterRoleName: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const defaultTab = tabParam || 'overview';

  // Fetch events for the ClusterRole
  const fetchEvents = async () => {
    if (!currentContext) return;

    try {
      // Fetch all events in the cluster
      const eventData = await listResources<'events'>(
        currentContext.name,
        'events'
      );

      // Filter events for this ClusterRole
      const filteredEvents = eventData.filter(event => {
        return (
          event.involvedObject?.kind === 'ClusterRole' &&
          event.involvedObject?.name === clusterRoleName
        );
      });

      setEvents(filteredEvents);
    } catch (err) {
      console.error('Error fetching events:', err);
    }
  };

  // Fetch ClusterRoleBindings that reference this ClusterRole
  const fetchRoleBindings = async () => {
    if (!currentContext || !clusterRoleName) return;

    try {
      // Fetch all ClusterRoleBindings
      const clusterRoleBindings = await listResources(
        currentContext.name,
        'clusterrolebindings',
        { apiGroup: 'rbac.authorization.k8s.io' }
      );

      // Filter for bindings that reference this ClusterRole
      const relevantBindings = clusterRoleBindings.filter(binding => 
        binding.roleRef.kind === 'ClusterRole' && 
        binding.roleRef.name === clusterRoleName
      );

      setRoleBindings(relevantBindings);
    } catch (err) {
      console.error('Error fetching ClusterRoleBindings:', err);
    }
  };

  // Fetch ClusterRole data and related resources
  useEffect(() => {
    const fetchClusterRoleData = async () => {
      if (!currentContext || !clusterRoleName) {
        setLoading(false);
        setError("Missing required parameters");
        return;
      }

      try {
        setLoading(true);

        // Get ClusterRole details
        const data = await getResource(
          currentContext.name,
          'clusterroles',
          clusterRoleName,
          undefined, // No namespace for cluster-wide resources
          'rbac.authorization.k8s.io' // API group for RBAC resources
        );

        setClusterRoleData(data);
        setError(null);

        // Fetch related resources
        await Promise.all([
          fetchEvents(),
          fetchRoleBindings()
        ]);
      } catch (err) {
        console.error('Error fetching ClusterRole:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch ClusterRole data');
      } finally {
        setLoading(false);
      }
    };

    fetchClusterRoleData();
  }, [currentContext, clusterRoleName]);

  // Handle refresh data
  const handleRefresh = () => {
    setLoading(true);
    // Refetch data
    if (currentContext && clusterRoleName) {
      Promise.all([
        getResource(
          currentContext.name,
          'clusterroles',
          clusterRoleName,
          undefined,
          'rbac.authorization.k8s.io'
        ),
        fetchEvents(),
        fetchRoleBindings()
      ]).then(([data]) => {
        setClusterRoleData(data);
        setLoading(false);
      }).catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to refresh data');
        setLoading(false);
      });
    }
  };

  // Calculate ClusterRole age
  const getClusterRoleAge = () => {
    if (!clusterRoleData?.metadata?.creationTimestamp) {
      return 'N/A';
    }

    const creationTime = new Date(clusterRoleData.metadata.creationTimestamp);
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

  // Format a rule for display
  const formatRule = (rule: any) => {
    const apiGroups = rule.apiGroups?.join(', ') || '';
    const resources = rule.resources?.join(', ') || '';
    const verbs = rule.verbs?.join(', ') || '';
    
    return { apiGroups, resources, verbs };
  };

  // Get rule count by verb
  const getRuleCountByVerb = () => {
    if (!clusterRoleData?.rules) return {};
    
    const verbCounts: Record<string, number> = {};
    
    clusterRoleData.rules.forEach(rule => {
      rule.verbs.forEach((verb: string) => {
        verbCounts[verb] = (verbCounts[verb] || 0) + 1;
      });
    });
    
    return verbCounts;
  };

  // Get subjects from role bindings
  const getSubjects = () => {
    if (!roleBindings) return [];
    
    // Combine all subjects from all bindings
    return roleBindings.flatMap(binding => binding.subjects || []);
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
          <AlertTitle>Error loading ClusterRole data</AlertTitle>
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

  // If no ClusterRole data
  if (!clusterRoleData || !clusterRoleData.metadata) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTitle>No ClusterRole data available</AlertTitle>
          <AlertDescription>
            The requested ClusterRole was not found or could not be retrieved.
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
  const ruleCount = clusterRoleData.rules?.length || 0;
  const subjectCount = getSubjects().length;
  const verbCounts = getRuleCountByVerb();
  const hasAdminVerbs = verbCounts['create'] || verbCounts['delete'] || verbCounts['patch'] || verbCounts['update'];

  return (
    <div className="max-h-[92vh] overflow-y-auto
          scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent
          [&::-webkit-scrollbar]:w-1.5 
          [&::-webkit-scrollbar-track]:bg-transparent 
          [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">
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
              <BreadcrumbLink href="/dashboard/explore/clusterroles">ClusterRoles</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink>{clusterRoleData.metadata.name}</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header section */}
        <div className="mb-6">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{clusterRoleData.metadata.name}</h1>
                <Badge className={hasAdminVerbs 
                  ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                  : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"}>
                  {hasAdminVerbs ? 'Admin Rights' : 'Read-Only'}
                </Badge>
              </div>
              <div className="text-gray-500 dark:text-gray-400">
                Cluster-scoped RBAC role
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
            <TabsTrigger value="rules">Rules</TabsTrigger>
            <TabsTrigger value="bindings">Bindings</TabsTrigger>
            <TabsTrigger value="yaml">YAML</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 bg-transparent">
            {/* ClusterRole Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldCheck className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-medium">Role Type</h3>
                </div>
                <div className="text-lg font-semibold truncate">
                  ClusterRole
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Cluster-scoped RBAC resource
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Key className="h-4 w-4 text-green-500" />
                  <h3 className="text-sm font-medium">Rules</h3>
                </div>
                <div className="text-lg font-semibold">
                  {ruleCount}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Total rule definitions
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
                  Bound to {roleBindings.length} role bindings
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-orange-500" />
                  <h3 className="text-sm font-medium">Age</h3>
                </div>
                <div className="text-lg font-semibold">
                  {getClusterRoleAge()}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Created {new Date(clusterRoleData.metadata.creationTimestamp || '').toLocaleString()}
                </div>
              </div>
            </div>

            {/* Permission Summary */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
              <h2 className="text-lg font-medium mb-4">Permission Summary</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(verbCounts).sort().map(([verb, count]) => (
                  <div key={verb} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-center">
                    <div className="text-lg font-semibold">{count}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">{verb}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ClusterRole Properties */}
            <PropertiesViewer
              metadata={clusterRoleData.metadata}
              kind="ClusterRole"
              status="Active"
              additionalProperties={[
                {
                  label: "Rules",
                  value: `${ruleCount} permission rules defined`
                },
                {
                  label: "API Group",
                  value: "rbac.authorization.k8s.io"
                },
                {
                  label: "Creation Time",
                  value: new Date(clusterRoleData.metadata.creationTimestamp || '').toLocaleString()
                },
                {
                  label: "UID",
                  value: clusterRoleData.metadata.uid || 'N/A'
                }
              ]}
            />

            {/* Access Snapshot */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
              <h2 className="text-lg font-medium mb-4">Access Snapshot</h2>
              <div className="space-y-4">
                {/* Resources with full access */}
                {clusterRoleData.rules && clusterRoleData.rules
                  .filter(rule => rule.verbs.includes('*') || 
                    (rule.verbs.includes('get') && 
                    rule.verbs.includes('list') && 
                    rule.verbs.includes('create') && 
                    rule.verbs.includes('update') && 
                    rule.verbs.includes('delete')))
                  .slice(0, 5)
                  .map((rule, index) => {
                    const { apiGroups, resources, verbs } = formatRule(rule);
                    return (
                      <div key={index} className="p-3 rounded-lg border border-red-100 dark:border-red-900/30 bg-red-50 dark:bg-red-900/10">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-medium">{resources || '*'}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              API Group: {apiGroups || 'core'}
                            </div>
                          </div>
                          <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                            Full Access
                          </Badge>
                        </div>
                      </div>
                    );
                  })
                }

                {/* Resources with read-only access */}
                {clusterRoleData.rules && clusterRoleData.rules
                  .filter(rule => !rule.verbs.includes('*') && 
                    !rule.verbs.some(v => ['create', 'update', 'delete', 'patch'].includes(v)) &&
                    rule.verbs.some(v => ['get', 'list', 'watch'].includes(v)))
                  .slice(0, 5)
                  .map((rule, index) => {
                    const { apiGroups, resources, verbs } = formatRule(rule);
                    return (
                      <div key={index} className="p-3 rounded-lg border border-green-100 dark:border-green-900/30 bg-green-50 dark:bg-green-900/10">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-medium">{resources || '*'}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              API Group: {apiGroups || 'core'}
                            </div>
                          </div>
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                            Read-Only
                          </Badge>
                        </div>
                      </div>
                    );
                  })
                }

                {clusterRoleData.rules && clusterRoleData.rules.length > 10 && (
                  <div className="text-center text-sm text-gray-500 dark:text-gray-400 mt-2">
                    And {clusterRoleData.rules.length - 10} more rules...
                  </div>
                )}
              </div>
            </div>

            {/* ClusterRole Events */}
            <EventsViewer
              events={events}
              resourceName={clusterRoleData.metadata.name}
              resourceKind="ClusterRole"
            />
          </TabsContent>

          <TabsContent value="rules" className="space-y-6">
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-medium">Permission Rules</h2>
                <Badge className="text-xs">{ruleCount} Rules</Badge>
              </div>
              <div className="space-y-4">
                {clusterRoleData.rules && clusterRoleData.rules.length > 0 ? (
                  clusterRoleData.rules.map((rule, index) => {
                    const { apiGroups, resources, verbs } = formatRule(rule);
                    const isAdmin = rule.verbs.some(v => ['create', 'update', 'delete', 'patch', '*'].includes(v));
                    const nonResourceUrls = rule.nonResourceURLs?.join(', ');
                    
                    return (
                      <div 
                        key={index} 
                        className={`p-4 rounded-lg border ${
                          isAdmin 
                            ? 'border-red-100 dark:border-red-900/30 bg-red-50 dark:bg-red-900/10' 
                            : 'border-green-100 dark:border-green-900/30 bg-green-50 dark:bg-green-900/10'
                        }`}
                      >
                        <div className="flex justify-between mb-2">
                          <div className="font-medium">Rule #{index + 1}</div>
                          <Badge className={isAdmin
                            ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                            : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"}>
                            {isAdmin ? 'Admin' : 'Read-Only'}
                          </Badge>
                        </div>
                        
                        <div className="space-y-2 mt-3">
                          {resources && (
                            <div className="grid grid-cols-4 gap-2">
                              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Resources:</div>
                              <div className="col-span-3 text-sm">{resources}</div>
                            </div>
                          )}
                          
                          {apiGroups && (
                            <div className="grid grid-cols-4 gap-2">
                              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">API Groups:</div>
                              <div className="col-span-3 text-sm">{apiGroups}</div>
                            </div>
                          )}
                          
                          {nonResourceUrls && (
                            <div className="grid grid-cols-4 gap-2">
                              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Non-Resource URLs:</div>
                              <div className="col-span-3 text-sm">{nonResourceUrls}</div>
                            </div>
                          )}
                          
                          {verbs && (
                            <div className="grid grid-cols-4 gap-2">
                              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Verbs:</div>
                              <div className="col-span-3 text-sm">
                                <div className="flex flex-wrap gap-1">
                                  {rule.verbs.map((verb: string) => (
                                    <Badge 
                                      key={verb} 
                                      className={['create', 'update', 'delete', 'patch', '*'].includes(verb)
                                        ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                                        : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"}
                                    >
                                      {verb}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center p-6 text-gray-500 dark:text-gray-400">
                    No rules defined for this ClusterRole
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="bindings" className="space-y-6">
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-medium">ClusterRoleBindings</h2>
                <Badge className="text-xs">{roleBindings.length} Bindings</Badge>
              </div>
              
              {roleBindings.length > 0 ? (
                <div className="space-y-4">
                  {roleBindings.map((binding, index) => (
                    <div key={index} className="p-4 rounded-lg border border-gray-200 dark:border-gray-800">
                      <div className="flex justify-between mb-2">
                        <div className="font-medium">{binding.metadata.name}</div>
                        <Badge>
                          {binding.subjects?.length || 0} Subject(s)
                        </Badge>
                      </div>
                      
                      <div className="mt-3">
                        <h4 className="text-sm font-medium mb-2">Subjects:</h4>
                        <div className="space-y-2">
                          {binding.subjects ? (
                            binding.subjects.map((subject: any, subIdx: number) => (
                              <div key={subIdx} className="p-2 bg-gray-50 dark:bg-gray-800/50 rounded-md">
                                <div className="flex justify-between">
                                  <div className="text-sm font-medium">{subject.name}</div>
                                  <Badge>{subject.kind}</Badge>
                                </div>
                                {subject.namespace && (
                                  <div className="text-xs text-gray-500 dark:text-gray-400">
                                    Namespace: <span onClick={() => navigate(`/dashboard/explore/namespaces/${subject.namespace}`)} className="text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">{subject.namespace}</span>
                                  </div>
                                )}
                              </div>
                            ))
                          ) : (
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              No subjects defined
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-3"
                        onClick={() => navigate(`/dashboard/explore/clusterrolebindings/${binding.metadata.name}`)}
                      >
                        View Binding
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center p-6 text-gray-500 dark:text-gray-400">
                  No ClusterRoleBindings reference this ClusterRole
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="yaml" className="space-y-6">
            <ResourceViewerYamlTab
              resourceData={clusterRoleData}
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

export default ClusterRoleViewer;