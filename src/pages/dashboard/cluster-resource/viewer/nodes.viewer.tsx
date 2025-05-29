import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { V1Node, CoreV1Event } from '@kubernetes/client-node';
import {
  getResource,
  listResources
} from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';

// Component imports
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ChevronRight, AlertCircle, Clock, ArrowLeft, RefreshCw, Server, Cpu, Database, HardDrive, Network, Tag, Terminal } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import KUBERNETES_LOGO from '@/assets/kubernetes.svg';
import { runExternalShell } from '@/api/external';
import { useSearchParams } from 'react-router-dom';

// Custom component imports
import PropertiesViewer from './components/properties.viewer';
import EventsViewer from './components/event.viewer';
import NodePods from './components/nodepods.viewer';
import { ResourceViewerYamlTab } from '@/components/custom';

// Define interface for node data (extending V1Node with events)
interface NodeData extends V1Node {
  events?: CoreV1Event[];
}

const NodeViewer: React.FC = () => {
  const [nodeData, setNodeData] = useState<NodeData | null>(null);
  const [events, setEvents] = useState<CoreV1Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { currentContext, fullWidth } = useCluster();
  const { nodeName } = useParams<{ nodeName: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const defaultTab = tabParam || 'overview';


  // Fetch events for the node
  const fetchEvents = async () => {
    if (!currentContext) return;

    try {
      // Fetch all events in the cluster
      const eventData = await listResources<'events'>(
        currentContext.name,
        'events'
      );

      // Filter events to just this node
      const nodeEvents = eventData.filter(event =>
        event.involvedObject?.kind === 'Node' &&
        event.involvedObject?.name === nodeName
      );

      setEvents(nodeEvents);
    } catch (err) {
      console.error('Error fetching events:', err);
    }
  };

  // Fetch node data and events
  useEffect(() => {
    const fetchNodeData = async () => {
      if (!currentContext || !nodeName) {
        setLoading(false);
        setError("Missing required parameters");
        return;
      }

      try {
        setLoading(true);

        // Get node details
        const data = await getResource<'nodes'>(
          currentContext.name,
          'nodes',
          nodeName
        );

        setNodeData(data);
        setError(null);

        // Fetch related events
        await fetchEvents();
      } catch (err) {
        console.error('Error fetching node:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch node data');
      } finally {
        setLoading(false);
      }
    };

    fetchNodeData();
  }, [currentContext, nodeName]);


  const handleOpenShell = async () => {
    try {
      if (!currentContext?.name || !nodeName) return;
  
      // Use busybox instead of ubuntu - smaller and faster
      const command = `kubectl debug node/${nodeName} -it --image=busybox`;
  
      await runExternalShell(currentContext.name, command);
    } catch (err) {
      console.error('Error opening shell:', err);
      setError(err instanceof Error ? err.message : 'Failed to open shell');
    }
  };
  
  // Handle refresh data
  const handleRefresh = () => {
    setLoading(true);
    // Refetch data
    if (currentContext && nodeName) {
      Promise.all([
        getResource<'nodes'>(
          currentContext.name,
          'nodes',
          nodeName
        ),
        fetchEvents()
      ]).then(([data]) => {
        setNodeData(data);
        setLoading(false);
      }).catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to refresh data');
        setLoading(false);
      });
    }
  };

  // Get node status
  const getNodeStatus = () => {
    if (!nodeData || !nodeData.status) {
      return { status: 'Unknown', isReady: false };
    }

    // Check conditions for Ready status
    const readyCondition = nodeData.status.conditions?.find(condition => condition.type === 'Ready');
    if (readyCondition?.status === 'True') {
      return { status: 'Ready', isReady: true };
    }

    // Check other conditions to determine status
    const notReadyCondition = nodeData.status.conditions?.find(condition =>
      condition.status === 'True' &&
      ['OutOfDisk', 'NetworkUnavailable', 'MemoryPressure', 'DiskPressure', 'PIDPressure'].includes(condition.type)
    );

    if (notReadyCondition) {
      return { status: notReadyCondition.type, isReady: false };
    }

    return { status: 'NotReady', isReady: false };
  };

  // Parse resource capacity and allocatable resources
  const parseResources = () => {
    if (!nodeData || !nodeData.status) {
      return {
        capacity: {
          cpu: '0',
          memory: '0',
          pods: '0',
          ephemeralStorage: '0'
        },
        allocatable: {
          cpu: '0',
          memory: '0',
          pods: '0',
          ephemeralStorage: '0'
        },
        usage: {
          cpuPercent: 0,
          memoryPercent: 0,
          podsPercent: 0
        }
      };
    }

    const capacity = nodeData.status.capacity || {};
    const allocatable = nodeData.status.allocatable || {};

    // Calculate usage percentages
    // In a real app, you'd get the actual used values from metrics API
    // Here we're just simulating usage percentages
    const usage = {
      cpuPercent: 30,  // Mock values - would come from metrics in real app
      memoryPercent: 45,
      podsPercent: 20
    };

    return {
      capacity,
      allocatable,
      usage
    };
  };

  // Format CPU value
  const formatCPU = (cpuValue: string | undefined) => {
    if (!cpuValue) return 'N/A';

    // CPU values can be millicores or whole cores
    if (cpuValue.endsWith('m')) {
      return `${parseInt(cpuValue)} millicores`;
    }

    return `${cpuValue} cores`;
  };

  // Format memory value to human readable
  const formatMemory = (memoryValue: string | undefined) => {
    if (!memoryValue) return 'N/A';

    // Convert Ki to MB or GB for readability
    if (memoryValue.endsWith('Ki')) {
      const kiBytes = parseInt(memoryValue);
      if (kiBytes < 1024 * 1024) {
        return `${Math.round(kiBytes / 1024)} MB`;
      } else {
        return `${(kiBytes / 1024 / 1024).toFixed(2)} GB`;
      }
    }

    return memoryValue;
  };

  // Format storage value
  const formatStorage = (storageValue: string | undefined) => {
    if (!storageValue) return 'N/A';

    // Similar to memory formatting
    if (storageValue.endsWith('Ki')) {
      const kiBytes = parseInt(storageValue);
      if (kiBytes < 1024 * 1024) {
        return `${Math.round(kiBytes / 1024)} MB`;
      } else {
        return `${(kiBytes / 1024 / 1024).toFixed(2)} GB`;
      }
    }

    return storageValue;
  };

  // Get node age
  const getNodeAge = () => {
    if (!nodeData?.metadata?.creationTimestamp) {
      return 'N/A';
    }

    const creationTime = new Date(nodeData.metadata.creationTimestamp);
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

  // Get nodeInfo
  const getNodeInfo = () => {
    if (!nodeData?.status?.nodeInfo) {
      return {
        architecture: 'N/A',
        bootID: 'N/A',
        containerRuntime: 'N/A',
        kernelVersion: 'N/A',
        kubeProxyVersion: 'N/A',
        kubeletVersion: 'N/A',
        machineID: 'N/A',
        operatingSystem: 'N/A',
        osImage: 'N/A',
        systemUUID: 'N/A'
      };
    }

    // Add containerRuntime to the returned object
    return {
      ...nodeData.status.nodeInfo,
      containerRuntime: nodeData.status.nodeInfo.containerRuntimeVersion || 'N/A'
    };
  };

  // Status alert component based on node status
  const NodeStatusAlert = () => {
    const { status, isReady } = getNodeStatus();

    if (isReady) return null; // No alert for ready nodes

    return (
      <Alert className="mb-6 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800">
        <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
        <AlertTitle>Node is Not Ready</AlertTitle>
        <AlertDescription>
          {status === 'NotReady'
            ? 'The node is not in a ready state and cannot accept new workloads.'
            : `The node has a ${status} condition that prevents it from functioning normally.`}
        </AlertDescription>
      </Alert>
    );
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
          <AlertTitle>Error loading node data</AlertTitle>
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

  // If no node data
  if (!nodeData || !nodeData.metadata) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTitle>No node data available</AlertTitle>
          <AlertDescription>
            The requested node was not found or could not be retrieved.
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

  // Calculate node status
  const { status, isReady } = getNodeStatus();
  const nodeInfo = getNodeInfo();
  const resources = parseResources();
  const statusColor = isReady
    ? 'text-green-600 dark:text-green-400'
    : 'text-red-600 dark:text-red-400';

  return (
    <div className='
           max-h-[92vh] overflow-y-auto
          scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent
          [&::-webkit-scrollbar]:w-1.5 
          [&::-webkit-scrollbar-track]:bg-transparent 
          [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50
    '>
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
              <BreadcrumbLink onClick={() => navigate('/dashboard/explore/nodes')}>Nodes</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink>{nodeData.metadata.name}</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header section */}
        <div className="mb-6">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{nodeData.metadata.name}</h1>
                <Badge
                  className={isReady
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                    : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'}
                >
                  {status}
                </Badge>
              </div>
              <div className="text-gray-500 dark:text-gray-400">
                {nodeInfo.osImage} | {nodeInfo.kernelVersion} | Kubernetes {nodeInfo.kubeletVersion}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleOpenShell}>
                <Terminal className="h-4 w-4" />
              </Button>
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

        {/* Status alert if needed */}
        <NodeStatusAlert />

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
            <TabsTrigger value="yaml">YAML</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="pods">Pods</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 bg-transparent">
            {/* Node Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Server className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-medium">Status</h3>
                </div>
                <div className={`text-2xl font-semibold ${statusColor}`}>
                  {status}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Node health state
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Cpu className="h-4 w-4 text-green-500" />
                  <h3 className="text-sm font-medium">CPU</h3>
                </div>
                <div className="text-2xl font-semibold">
                  {formatCPU(resources.allocatable.cpu)}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Allocatable resources
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Database className="h-4 w-4 text-purple-500" />
                  <h3 className="text-sm font-medium">Memory</h3>
                </div>
                <div className="text-2xl font-semibold">
                  {formatMemory(resources.allocatable.memory)}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Allocatable resources
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-orange-500" />
                  <h3 className="text-sm font-medium">Age</h3>
                </div>
                <div className="text-2xl font-semibold">
                  {getNodeAge()}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Since creation
                </div>
              </div>
            </div>

            {/* Resource Usage */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-700/30 bg-white dark:bg-transparent p-4 mb-6">
              <h2 className="text-lg font-medium mb-4">Resource Usage</h2>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium">CPU</span>
                    <span className="text-sm text-gray-500">{resources.usage.cpuPercent}%</span>
                  </div>
                  <Progress value={resources.usage.cpuPercent} className="h-3" />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>0</span>
                    <span>{formatCPU(resources.allocatable.cpu)}</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium">Memory</span>
                    <span className="text-sm text-gray-500">{resources.usage.memoryPercent}%</span>
                  </div>
                  <Progress value={resources.usage.memoryPercent} className="h-3" />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>0</span>
                    <span>{formatMemory(resources.allocatable.memory)}</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium">Pods</span>
                    <span className="text-sm text-gray-500">{resources.usage.podsPercent}%</span>
                  </div>
                  <Progress value={resources.usage.podsPercent} className="h-3" />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>0</span>
                    <span>{resources.allocatable.pods || 'N/A'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Node Properties */}
            <PropertiesViewer
              metadata={nodeData.metadata}
              kind="Node"
              status={status}
              additionalProperties={[
                {
                  label: "Architecture",
                  value: nodeInfo.architecture
                },
                {
                  label: "Operating System",
                  value: nodeInfo.operatingSystem
                },
                {
                  label: "Container Runtime",
                  value: nodeInfo.containerRuntime
                },
                {
                  label: "Kernel Version",
                  value: nodeInfo.kernelVersion
                },
                {
                  label: "Kubelet Version",
                  value: nodeInfo.kubeletVersion
                }
              ]}
            />

            {/* Node Addresses */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
              <h2 className="text-lg font-medium mb-4">Node Addresses</h2>
              {nodeData.status?.addresses && nodeData.status.addresses.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {nodeData.status.addresses.map((address, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Network className="h-4 w-4 text-gray-500" />
                      <div>
                        <div className="font-medium">{address.address}</div>
                        <div className="text-xs text-gray-500">{address.type}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-gray-500 dark:text-gray-400">No address information available</div>
              )}
            </div>

            {/* Node Labels */}
            {nodeData.metadata.labels && Object.keys(nodeData.metadata.labels).length > 0 && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-700/30 bg-white dark:bg-transparent p-4 mb-6">
                <h2 className="text-lg font-medium mb-4">Node Labels</h2>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(nodeData.metadata.labels).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-1 bg-gray-100 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700/30 rounded-md px-3 py-1.5">
                      <Tag className="h-3.5 w-3.5 text-gray-500" />
                      <span className="text-sm font-medium">{key}:</span>
                      <span className="text-sm">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Node Conditions */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-700/30 bg-white dark:bg-transparent p-4 mb-6">
              <h2 className="text-lg font-medium mb-4">Conditions</h2>
              {nodeData.status?.conditions && nodeData.status.conditions.length > 0 ? (
                <div className="grid grid-cols-1 gap-3">
                  {nodeData.status.conditions.map((condition, index) => (
                    <div
                      key={index}
                      className="p-3 rounded-lg border border-gray-200 dark:border-gray-700/30"
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-medium">{condition.type}</span>
                        <Badge
                          className={condition.status === 'True'
                            ? (condition.type === 'Ready'
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                              : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300')
                            : (condition.type === 'Ready'
                              ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                              : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300')
                          }
                        >
                          {condition.status}
                        </Badge>
                      </div>
                      {condition.message && (
                        <div className="text-sm text-gray-600 dark:text-gray-300">
                          {condition.message}
                        </div>
                      )}
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Last transition: {new Date(condition.lastTransitionTime?.toString() || '').toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-gray-500 dark:text-gray-400">No condition information available</div>
              )}
            </div>

            {/* Node System Info */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-700/30 bg-white dark:bg-gray-900/20 p-4 mb-6">
              <h2 className="text-lg font-medium mb-4">System Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                <div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">OS</div>
                  <div>{nodeInfo.operatingSystem} / {nodeInfo.osImage}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Architecture</div>
                  <div>{nodeInfo.architecture}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Kernel Version</div>
                  <div>{nodeInfo.kernelVersion}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Container Runtime</div>
                  <div>{nodeInfo.containerRuntime}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Kubelet Version</div>
                  <div>{nodeInfo.kubeletVersion}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Kube-Proxy Version</div>
                  <div>{nodeInfo.kubeProxyVersion}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Machine ID</div>
                  <div className="font-mono text-xs">{nodeInfo.machineID}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">System UUID</div>
                  <div className="font-mono text-xs">{nodeInfo.systemUUID}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Boot ID</div>
                  <div className="font-mono text-xs">{nodeInfo.bootID}</div>
                </div>
              </div>
            </div>

            {/* Node Events */}
            <EventsViewer
              events={events}
              resourceName={nodeData.metadata.name}
              resourceKind="Node"
            />
          </TabsContent>

          <TabsContent value="yaml" className="space-y-6">
            <ResourceViewerYamlTab
              resourceData={nodeData}
              currentContext={currentContext}
            />
          </TabsContent>

          <TabsContent value="events" className="space-y-6">
            <EventsViewer
              events={events}
            />
          </TabsContent>

          <TabsContent value="pods" className="space-y-6">
            {nodeName && currentContext && (
              <NodePods
                nodeName={nodeName}
                clusterName={currentContext.name}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default NodeViewer;