import React, { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight, GitCompareArrows, X, ChevronsUpDown, Check } from 'lucide-react';
import { useCluster } from '@/contexts/clusterContext';
import {
  getDeployments,
  getStatefulSets,
  getDaemonSets,
  getConfigMaps,
  getSecrets,
  listResources
} from '@/api/internal/resources';
import {
  V1Deployment,
  V1StatefulSet,
  V1DaemonSet,
  V1ConfigMap,
  V1Secret,
  V1Job,
  V1CronJob,
} from '@kubernetes/client-node';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { YamlViewer } from '@/utils/yaml.utils';
import { getStoredDriftState, saveDriftState, clearDriftState } from '@/utils/driftAnalysisStorage';
import MonacoDiffEditor from '@/components/custom/editordiff/editordiff.component';
import * as yaml from 'yaml';
import { useDriftAnalysis } from '@/contexts/useDriftAnalysis';

type ResourceType = 'deployments' | 'statefulsets' | 'daemonsets' | 'cronjobs' | 'jobs' | 'configmaps' | 'secrets';

// Union type of all supported Kubernetes resource types
type KubernetesResource = V1Deployment | V1StatefulSet | V1DaemonSet | V1ConfigMap | V1Secret | V1Job | V1CronJob;

interface ResourceTypeConfig {
  label: string;
  apiGroup?: string;
  apiVersion?: string;
  fetchFn?: (clusterName: string, namespace?: string) => Promise<any[]>;
}

const RESOURCE_TYPES: Record<ResourceType, ResourceTypeConfig> = {
  deployments: { label: 'Deployments', fetchFn: getDeployments },
  statefulsets: { label: 'StatefulSets', fetchFn: getStatefulSets },
  daemonsets: { label: 'DaemonSets', fetchFn: getDaemonSets },
  cronjobs: { label: 'CronJobs', apiGroup: 'batch', apiVersion: 'v1' },
  jobs: { label: 'Jobs', apiGroup: 'batch', apiVersion: 'v1' },
  configmaps: { label: 'ConfigMaps', fetchFn: getConfigMaps },
  secrets: { label: 'Secrets', fetchFn: getSecrets },
};

interface Resource {
  name: string;
  namespace: string;
  kind: string;
  cluster?: string;
  resourceType: ResourceType;
}

interface ComparisonData {
  baseline: KubernetesResource | null;
  compared: KubernetesResource[];
}

const ServiceDriftAnalysis: React.FC = () => {
  const { currentContext } = useCluster();
  const {
    baselineResource: contextBaseline,
    comparedResources: contextCompared,
    setBaselineResource: setContextBaseline,
    setComparedResources: setContextCompared
  } = useDriftAnalysis();

  const [allResources, setAllResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(false);

  // Track previous context to detect context changes
  const [previousContext, setPreviousContext] = useState<string | null>(
    currentContext?.name || null
  );

  // Load cached state
  const cached = getStoredDriftState();

  // Use context state if available, otherwise use cached state
  const [baselineResource, setBaselineResourceState] = useState<string>(
    contextBaseline || cached?.baselineResource || ''
  );
  const [comparedResources, setComparedResourcesState] = useState<string[]>(
    contextCompared.length > 0 ? contextCompared : (cached?.comparedResources || [])
  );
  const [activeTab, setActiveTab] = useState<'attributes' | 'metrics'>(cached?.activeTab || 'attributes');
  const [showOnlyDrift, setShowOnlyDrift] = useState(cached?.showOnlyDrift || false);

  // Sync with context when context changes
  useEffect(() => {
    if (contextBaseline) {
      setBaselineResourceState(contextBaseline);
    }
  }, [contextBaseline]);

  useEffect(() => {
    if (contextCompared.length > 0) {
      setComparedResourcesState(contextCompared);
    }
  }, [contextCompared]);

  // Sync context when local state changes
  const setBaselineResource = useCallback((value: string) => {
    setBaselineResourceState(value);
    setContextBaseline(value);
  }, [setContextBaseline]);

  const setComparedResources = useCallback((value: string[]) => {
    setComparedResourcesState(value);
    setContextCompared(value);
  }, [setContextCompared]);

  const [comparisonData, setComparisonData] = useState<ComparisonData>({ baseline: null, compared: [] });
  const [expandedContainers, setExpandedContainers] = useState<Set<string>>(new Set());
  const [diffDialogOpen, setDiffDialogOpen] = useState(false);
  const [diffDialogData, setDiffDialogData] = useState<{ title: string; baseline: any; compared: any } | null>(null);
  const [baselineOpen, setBaselineOpen] = useState(false);
  const [comparedOpen, setComparedOpen] = useState(false);

  // Save state to localStorage whenever it changes
  useEffect(() => {
    saveDriftState({
      baselineResource,
      comparedResources,
      activeTab,
      showOnlyDrift,
    });
  }, [baselineResource, comparedResources, activeTab, showOnlyDrift]);

  // Fetch all resources from all types when context changes
  useEffect(() => {
    if (!currentContext) return;

    // Check if context actually changed (not initial mount)
    const contextChanged = previousContext && previousContext !== currentContext.name;

    const fetchAllResources = async () => {
      setLoading(true);
      try {
        const allFetchedResources: Resource[] = [];

        // Fetch all resource types in parallel
        const fetchPromises = Object.entries(RESOURCE_TYPES).map(async ([type, config]) => {
          try {
            let fetchedResources: any[] = [];

            if (config.fetchFn) {
              fetchedResources = await config.fetchFn(currentContext.name);
            } else {
              fetchedResources = await listResources(currentContext.name, type as ResourceType, {
                apiGroup: config.apiGroup,
                apiVersion: config.apiVersion || 'v1',
              });
            }

            return fetchedResources.map((item: any) => ({
              name: item.metadata.name,
              namespace: item.metadata.namespace,
              kind: item.kind || config.label.slice(0, -1),
              cluster: currentContext.name,
              resourceType: type as ResourceType,
            }));
          } catch (error) {
            console.error(`Failed to fetch ${type}:`, error);
            return [];
          }
        });

        const results = await Promise.all(fetchPromises);
        results.forEach(resources => allFetchedResources.push(...resources));

        setAllResources(allFetchedResources);
      } catch (error) {
        console.error('Failed to fetch resources:', error);
        setAllResources([]);
      } finally {
        setLoading(false);
      }
    };

    fetchAllResources();

    // Only reset selections when context actually changes (not on initial mount)
    if (contextChanged) {
      setBaselineResource('');
      setComparedResources([]);
      clearDriftState();
    }

    // Update previous context
    setPreviousContext(currentContext.name);
  }, [currentContext]);

  // Fetch detailed resource data when baseline or compared resources change
  useEffect(() => {
    if (!currentContext || !baselineResource) return;

    const fetchResourceDetails = async () => {
      try {
        const baselineData = await fetchResourceDetail(baselineResource);
        const comparedData = await Promise.all(
          comparedResources.map(r => fetchResourceDetail(r))
        );

        setComparisonData({
          baseline: baselineData,
          compared: comparedData,
        });
      } catch (error) {
        console.error('Failed to fetch resource details:', error);
      }
    };

    fetchResourceDetails();
  }, [baselineResource, comparedResources, currentContext]);

  const fetchResourceDetail = async (resourceId: string): Promise<KubernetesResource> => {
    // resourceId format: "namespace/kind/name"
    const [namespace, kind, name] = resourceId.split('/');

    // Find the resource type from kind
    const resourceTypeEntry = Object.entries(RESOURCE_TYPES).find(
      ([_, config]) => config.label.toLowerCase() === kind.toLowerCase() + 's' ||
        config.label.slice(0, -1).toLowerCase() === kind.toLowerCase()
    );

    if (!resourceTypeEntry) {
      throw new Error(`Unknown resource kind: ${kind}`);
    }

    const [resourceType, config] = resourceTypeEntry;

    if (config.fetchFn) {
      // For resources with convenience functions, fetch and filter
      const allResources = await config.fetchFn(currentContext!.name, namespace);
      const resource = allResources.find((r: any) => r.metadata?.name === name);
      if (!resource) throw new Error(`Resource not found: ${name}`);
      return resource as KubernetesResource;
    } else {
      // Use listResources for other types
      const resources = await listResources(currentContext!.name, resourceType as ResourceType, {
        namespace,
        name,
        apiGroup: config.apiGroup,
        apiVersion: config.apiVersion || 'v1',
      });
      if (!resources || resources.length === 0) {
        throw new Error(`Resource not found: ${name}`);
      }
      return resources[0] as KubernetesResource;
    }
  };

  const handleBaselineChange = (value: string) => {
    setBaselineResource(value);
    // Clear all compared resources when baseline changes
    setComparedResources([]);
  };

  const handleAddComparedResource = (value: string) => {
    if (!comparedResources.includes(value) && value !== baselineResource) {
      const newCompared = [...comparedResources, value];
      setComparedResources(newCompared);
    }
  };

  const handleRemoveComparedResource = (resourceId: string) => {
    const newCompared = comparedResources.filter(r => r !== resourceId);
    setComparedResources(newCompared);
  };

  const toggleContainer = (containerName: string) => {
    setExpandedContainers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(containerName)) {
        newSet.delete(containerName);
      } else {
        newSet.add(containerName);
      }
      return newSet;
    });
  };

  const openDiffDialog = (title: string, baseline: any, compared: any) => {
    setDiffDialogData({ title, baseline, compared });
    setDiffDialogOpen(true);
  };

  const getContainers = (resource: KubernetesResource | null) => {
    if (!resource) return [];
    // Only workload resources (Deployment, StatefulSet, DaemonSet, Job, CronJob) have containers
    const workloadResource = resource as any;
    return workloadResource?.spec?.template?.spec?.containers || [];
  };

  const getLabels = (resource: KubernetesResource | null) => {
    return resource?.metadata?.labels || {};
  };

  const hasDrift = (baselineValue: any, comparedValue: any) => {
    return JSON.stringify(baselineValue) !== JSON.stringify(comparedValue);
  };

  if (!currentContext) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>Please select a cluster context</p>
      </div>
    );
  }

  // Group resources by kind
  const groupedResources = React.useMemo(() => {
    const groups: Record<string, Resource[]> = {};
    allResources.forEach(resource => {
      if (!groups[resource.kind]) {
        groups[resource.kind] = [];
      }
      groups[resource.kind].push(resource);
    });
    return groups;
  }, [allResources]);

  // Get baseline resource kind
  const getResourceKind = (resourceId: string) => {
    if (!resourceId) return null;
    const [namespace, kind] = resourceId.split('/');
    return kind;
  };

  // Get baseline resource display name
  const getBaselineDisplayName = () => {
    if (!baselineResource) return 'Select comparison baseline';
    const parts = baselineResource.split('/');
    return parts[2]; // name
  };

  const baselineKind = getResourceKind(baselineResource);

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      {/* Top Selection Area */}
      <div className="p-4 bg-secondary/30 border-b border-border">
        <div className="grid grid-cols-2 gap-4">
          {/* Comparison Baseline */}
          <div>
            <label className="block text-sm text-muted-foreground mb-2">Comparison Baseline</label>
            <Popover open={baselineOpen} onOpenChange={setBaselineOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={baselineOpen}
                  className="w-full justify-between bg-secondary border-border text-foreground hover:bg-accent hover:text-foreground"
                >
                  <span className="truncate">{getBaselineDisplayName()}</span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0 bg-popover backdrop-blur-md border-border" align="start">
                <Command className="bg-popover backdrop-blur-md">
                  <CommandInput placeholder="Search resources..." className="text-foreground" />
                  <CommandList className='max-h-80 overflow-y-auto 
            [&::-webkit-scrollbar]:w-1.5 
            [&::-webkit-scrollbar-track]:bg-transparent 
            [&::-webkit-scrollbar-thumb]:bg-muted 
            [&::-webkit-scrollbar-thumb]:rounded-full
            [&::-webkit-scrollbar-thumb:hover]:bg-muted-foreground/50'>
                    <CommandEmpty className="text-muted-foreground">No resource found.</CommandEmpty>
                    {Object.entries(groupedResources).map(([kind, resources]) => (
                      <CommandGroup key={kind} heading={kind} className="text-foreground">
                        {resources.map((resource) => {
                          const value = `${resource.namespace}/${resource.kind}/${resource.name}`;
                          return (
                            <CommandItem
                              key={value}
                              value={value}
                              onSelect={() => {
                                handleBaselineChange(value);
                                setBaselineOpen(false);
                              }}
                              className="text-foreground"
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  baselineResource === value ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <div className="flex flex-col">
                                <span className="text-sm">{resource.name}</span>
                                <span className="text-xs text-muted-foreground">
                                  {resource.cluster} &gt; {resource.namespace}
                                </span>
                              </div>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {baselineResource && comparisonData.baseline && (
              <p className="text-xs text-muted-foreground mt-1">
                Kind: {(comparisonData.baseline as any).kind || baselineKind}
              </p>
            )}
          </div>

          {/* Compared Resources */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-muted-foreground">Compared Resources</label>
              {(baselineResource || comparedResources.length > 0) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setBaselineResource('');
                    setComparedResources([]);
                  }}
                  className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  Reset
                </Button>
              )}
            </div>
            <Popover open={comparedOpen} onOpenChange={setComparedOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={comparedOpen}
                  className="w-full justify-between bg-secondary border-border text-foreground hover:bg-accent hover:text-foreground"
                >
                  Select resources to compare
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[500px] p-0 bg-popover border-border" align="start">
                <Command className="bg-popover backdrop-blur-md">
                  <CommandInput placeholder="Search resources..." className="text-foreground" />
                  <CommandList className='max-h-80 overflow-y-auto 
            [&::-webkit-scrollbar]:w-1.5 
            [&::-webkit-scrollbar-track]:bg-transparent 
            [&::-webkit-scrollbar-thumb]:bg-muted 
            [&::-webkit-scrollbar-thumb]:rounded-full
            [&::-webkit-scrollbar-thumb:hover]:bg-muted-foreground/50'>
                    <CommandEmpty className="text-muted-foreground">No resource found.</CommandEmpty>
                    {Object.entries(groupedResources).map(([kind, resources]) => (
                      <CommandGroup key={kind} heading={kind} className="text-foreground">
                        {resources
                          .filter(r => `${r.namespace}/${r.kind}/${r.name}` !== baselineResource)
                          .map((resource) => {
                            const value = `${resource.namespace}/${resource.kind}/${resource.name}`;
                            return (
                              <CommandItem
                                key={value}
                                value={value}
                                onSelect={() => {
                                  handleAddComparedResource(value);
                                  setComparedOpen(false);
                                }}
                                className="text-foreground"
                              >
                                <div className="flex flex-col">
                                  <span className="text-sm">{resource.name}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {resource.cluster} &gt; {resource.namespace}
                                  </span>
                                </div>
                              </CommandItem>
                            );
                          })}
                      </CommandGroup>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>



      {/* Content Area */}
      <div className="flex-1 overflow-y-auto 
            [&::-webkit-scrollbar]:w-1.5 
            [&::-webkit-scrollbar-track]:bg-transparent 
            [&::-webkit-scrollbar-thumb]:bg-muted 
            [&::-webkit-scrollbar-thumb]:rounded-full
            [&::-webkit-scrollbar-thumb:hover]:bg-muted-foreground/50 p-0">
        {!baselineResource ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <p className="text-sm">No resources were added,</p>
            <p className="text-sm">please add a resource for comparison</p>
            <Button
              className="mt-4 bg-blue-600 hover:bg-blue-700 text-white"
              size="sm"
              disabled
            >
              Add Baseline Resource
            </Button>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex items-center justify-between pr-4 py-2 bg-secondary/20 border-b border-border">
              <div className="flex gap-4">
                <button
                  onClick={() => setActiveTab('attributes')}
                  className={`px-4 py-1 text-sm font-medium transition-colors ${activeTab === 'attributes'
                    ? 'text-blue-400 border-b-2 border-blue-400'
                    : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                  Attributes Comparison
                </button>
                <button
                  onClick={() => setActiveTab('metrics')}
                  className={`px-4 py-1 text-sm font-medium transition-colors ${activeTab === 'metrics'
                    ? 'text-blue-400 border-b-2 border-blue-400'
                    : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                  Metrics Comparison
                </button>
              </div>

              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                  <Checkbox
                    checked={showOnlyDrift}
                    onCheckedChange={(checked) => setShowOnlyDrift(checked === true)}
                  />
                  Show only drift
                </label>
              </div>
            </div>

            {/* Resource Attributes Table */}
            <div className="bg-secondary/30 rounded-lg border border-border mb-4">
              <div className="p-3 border-b border-border">
                <h3 className="text-sm font-medium">Resource Attributes</h3>
              </div>
              <table className="w-full text-sm table-fixed">
                <colgroup>
                  <col className="w-48" />
                  <col />
                  {comparedResources.map((_, idx) => (
                    <col key={idx} />
                  ))}
                </colgroup>
                <tbody>
                  <tr className="border-b border-border">
                    <td className="p-3 bg-secondary/20 font-medium">Resource/Attribute</td>
                    <td className="p-3 bg-secondary/40">
                      {baselineResource.split('/')[2]}
                    </td>
                    {comparedResources.map((resourceId, idx) => {
                      const compared = comparisonData.compared[idx];
                      return (
                        <td key={resourceId} className="p-3 relative">
                          <div className="flex items-center justify-between">
                            <span>{resourceId.split('/')[2]}</span>
                            <button
                              onClick={() => handleRemoveComparedResource(resourceId)}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                  <tr className="border-b border-border">
                    <td className="p-3 bg-secondary/20 font-medium">Cluster</td>
                    <td className="p-3 bg-secondary/40 text-blue-400">
                      {currentContext?.name}
                    </td>
                    {comparedResources.map((resourceId) => (
                      <td key={resourceId} className="p-3 text-blue-400">
                        {currentContext?.name}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-border">
                    <td className="p-3 bg-secondary/20 font-medium">Namespace</td>
                    <td className="p-3 bg-secondary/40 text-blue-400">
                      {baselineResource.split('/')[0]}
                    </td>
                    {comparedResources.map((resourceId, idx) => {
                      const namespace = resourceId.split('/')[0];
                      const isDrift = namespace !== baselineResource.split('/')[0];
                      return (
                        <td
                          key={resourceId}
                          className={`p-3 text-blue-400 ${isDrift ? 'bg-red-500/10' : ''}`}
                        >
                          {namespace}
                        </td>
                      );
                    })}
                  </tr>
                  <tr className="border-b border-border">
                    <td className="p-3 bg-secondary/20 font-medium">Kind</td>
                    <td className="p-3 bg-secondary/40">
                      {baselineResource.split('/')[1]}
                    </td>
                    {comparedResources.map((resourceId) => {
                      const kind = resourceId.split('/')[1];
                      const baselineKindValue = baselineResource.split('/')[1];
                      const isDrift = kind !== baselineKindValue;
                      return (
                        <td
                          key={resourceId}
                          className={`p-3 ${isDrift ? 'bg-red-500/10' : ''}`}
                        >
                          {kind}
                        </td>
                      );
                    })}
                  </tr>
                  <tr className="border-b border-border">
                    <td className="p-3 bg-secondary/20 font-medium">Desired Replicas</td>
                    <td className="p-3 bg-secondary/40">
                      {(comparisonData.baseline as any)?.spec?.replicas ?? '-'}
                    </td>
                    {comparedResources.map((resourceId, idx) => {
                      const compared = comparisonData.compared[idx];
                      const baselineReplicas = (comparisonData.baseline as any)?.spec?.replicas;
                      const comparedReplicas = (compared as any)?.spec?.replicas;
                      const isDrift = baselineReplicas !== comparedReplicas;
                      return (
                        <td
                          key={resourceId}
                          className={`p-3 ${isDrift ? 'bg-red-500/10' : ''}`}
                        >
                          {comparedReplicas ?? '-'}
                        </td>
                      );
                    })}
                  </tr>
                  <tr className="border-b border-border">
                    <td className="p-3 bg-secondary/20 font-medium">Labels</td>
                    <td className="p-3 bg-secondary/40">
                      {Object.keys(getLabels(comparisonData.baseline)).length > 0 && (
                        <code className="text-xs bg-secondary px-2 py-1 rounded">
                          {Object.entries(getLabels(comparisonData.baseline))[0]?.[0]}=
                          {String(Object.entries(getLabels(comparisonData.baseline))[0]?.[1])}
                        </code>
                      )}
                    </td>
                    {comparedResources.map((resourceId, idx) => {
                      const compared = comparisonData.compared[idx];
                      const baselineLabels = getLabels(comparisonData.baseline);
                      const comparedLabels = getLabels(compared);
                      const isDrift = hasDrift(baselineLabels, comparedLabels);
                      return (
                        <td
                          key={resourceId}
                          className={`p-3 cursor-pointer ${isDrift ? 'bg-red-500/10' : ''}`}
                          onClick={() => openDiffDialog('Labels', baselineLabels, comparedLabels)}
                        >
                          {isDrift && (
                            <GitCompareArrows className="h-4 w-4 text-red-400 inline mr-2" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                  <tr className="border-b border-border">
                    <td className="p-3 bg-secondary/20 font-medium">Containers</td>
                    <td className="p-3 bg-secondary/40">
                      <ul className="list-disc list-inside text-xs space-y-1">
                        {getContainers(comparisonData.baseline).map((c: any) => (
                          <li key={c.name}>{c.name}</li>
                        ))}
                      </ul>
                    </td>
                    {comparedResources.map((resourceId, idx) => {
                      const compared = comparisonData.compared[idx];
                      const baselineContainers = getContainers(comparisonData.baseline).map((c: any) => c.name);
                      const comparedContainers = getContainers(compared).map((c: any) => c.name);
                      const isDrift = JSON.stringify(baselineContainers) !== JSON.stringify(comparedContainers);
                      return (
                        <td key={resourceId} className={`p-3 ${isDrift ? 'bg-red-500/10' : ''}`}>
                          <ul className="list-disc list-inside text-xs space-y-1">
                            {getContainers(compared).map((c: any) => (
                              <li key={c.name}>{c.name}</li>
                            ))}
                          </ul>
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Container Attributes */}
            <div className="bg-secondary/30 rounded-lg border border-border">
              <div className="p-3 border-b border-border">
                <h3 className="text-sm font-medium">Container Attributes</h3>
              </div>
              {getContainers(comparisonData.baseline).map((container: any) => (
                <div key={container.name} className="border-b border-border last:border-b-0">
                  <button
                    onClick={() => toggleContainer(container.name)}
                    className="w-full p-3 flex items-center gap-2 hover:bg-accent/50 transition-colors"
                  >
                    {expandedContainers.has(container.name) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <span className="font-medium">{container.name}</span>
                  </button>
                  {expandedContainers.has(container.name) && (
                    <table className="w-full text-sm table-fixed">
                      <colgroup>
                        <col className="w-48" />
                        <col />
                        {comparedResources.map((_, idx) => (
                          <col key={idx} />
                        ))}
                      </colgroup>
                      <tbody>
                        <tr className="border-b border-border">
                          <td className="p-3 bg-secondary/20 font-medium">Service/Attribute</td>
                          <td className="p-3 bg-secondary/40">{container.name}</td>
                          {comparedResources.map((resourceId, idx) => {
                            const compared = comparisonData.compared[idx];
                            const comparedContainer = getContainers(compared).find(
                              (c: any) => c.name === container.name
                            );
                            return (
                              <td key={resourceId} className="p-3">
                                {comparedContainer ? comparedContainer.name : 'Container does not exist'}
                              </td>
                            );
                          })}
                        </tr>
                        <tr className="border-b border-border">
                          <td className="p-3 bg-secondary/20 font-medium">Image</td>
                          <td className="p-3 bg-secondary/40 text-blue-400 text-xs">
                            {container.image}
                          </td>
                          {comparedResources.map((resourceId, idx) => {
                            const compared = comparisonData.compared[idx];
                            const comparedContainer = getContainers(compared).find(
                              (c: any) => c.name === container.name
                            );
                            const isDrift = comparedContainer?.image !== container.image;
                            return (
                              <td
                                key={resourceId}
                                className={`p-3 text-xs ${isDrift ? 'bg-red-500/10' : ''}`}
                              >
                                {comparedContainer?.image || '-'}
                              </td>
                            );
                          })}
                        </tr>
                        <tr className="border-b border-border">
                          <td className="p-3 bg-secondary/20 font-medium">CPU requests</td>
                          <td className="p-3 bg-secondary/40">
                            {container.resources?.requests?.cpu || '-'}
                          </td>
                          {comparedResources.map((resourceId, idx) => {
                            const compared = comparisonData.compared[idx];
                            const comparedContainer = getContainers(compared).find(
                              (c: any) => c.name === container.name
                            );
                            return (
                              <td key={resourceId} className="p-3">
                                {comparedContainer?.resources?.requests?.cpu || '-'}
                              </td>
                            );
                          })}
                        </tr>
                        <tr className="border-b border-border">
                          <td className="p-3 bg-secondary/20 font-medium">CPU limits</td>
                          <td className="p-3 bg-secondary/40">
                            {container.resources?.limits?.cpu || '-'}
                          </td>
                          {comparedResources.map((resourceId, idx) => {
                            const compared = comparisonData.compared[idx];
                            const comparedContainer = getContainers(compared).find(
                              (c: any) => c.name === container.name
                            );
                            return (
                              <td key={resourceId} className="p-3">
                                {comparedContainer?.resources?.limits?.cpu || '-'}
                              </td>
                            );
                          })}
                        </tr>
                        <tr className="border-b border-border">
                          <td className="p-3 bg-secondary/20 font-medium">Memory requests</td>
                          <td className="p-3 bg-secondary/40">
                            {container.resources?.requests?.memory || '-'}
                          </td>
                          {comparedResources.map((resourceId, idx) => {
                            const compared = comparisonData.compared[idx];
                            const comparedContainer = getContainers(compared).find(
                              (c: any) => c.name === container.name
                            );
                            return (
                              <td key={resourceId} className="p-3">
                                {comparedContainer?.resources?.requests?.memory || '-'}
                              </td>
                            );
                          })}
                        </tr>
                        <tr className="border-b border-border">
                          <td className="p-3 bg-secondary/20 font-medium">Memory limits</td>
                          <td className="p-3 bg-secondary/40">
                            {container.resources?.limits?.memory || '-'}
                          </td>
                          {comparedResources.map((resourceId, idx) => {
                            const compared = comparisonData.compared[idx];
                            const comparedContainer = getContainers(compared).find(
                              (c: any) => c.name === container.name
                            );
                            return (
                              <td key={resourceId} className="p-3">
                                {comparedContainer?.resources?.limits?.memory || '-'}
                              </td>
                            );
                          })}
                        </tr>
                        <tr className="border-b border-border">
                          <td className="p-3 bg-secondary/20 font-medium">Env variables</td>
                          <td className="p-3 bg-secondary/40">
                            {container.env && container.env.length > 0 ? (
                              <div className="max-h-96 overflow-auto">
                                <YamlViewer data={container.env} />
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          {comparedResources.map((resourceId, idx) => {
                            const compared = comparisonData.compared[idx];
                            const comparedContainer = getContainers(compared).find(
                              (c: any) => c.name === container.name
                            );
                            const isDrift = hasDrift(container.env, comparedContainer?.env);
                            return (
                              <td
                                key={resourceId}
                                className={`p-3 ${isDrift ? 'bg-red-500/10' : ''}`}
                              >
                                {comparedContainer?.env && comparedContainer.env.length > 0 ? (
                                  <div className="max-h-64 overflow-auto">
                                    <YamlViewer data={comparedContainer.env} />
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                        <tr className="border-b border-border">
                          <td className="p-3 bg-secondary/20 font-medium">Liveness probes</td>
                          <td className="p-3 bg-secondary/40">
                            {container.livenessProbe ? (
                              <div className="max-h-64 overflow-auto">
                                <YamlViewer data={container.livenessProbe} />
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          {comparedResources.map((resourceId, idx) => {
                            const compared = comparisonData.compared[idx];
                            const comparedContainer = getContainers(compared).find(
                              (c: any) => c.name === container.name
                            );
                            const isDrift = hasDrift(container.livenessProbe, comparedContainer?.livenessProbe);
                            return (
                              <td
                                key={resourceId}
                                className={`p-3 ${isDrift ? 'bg-red-500/10' : ''}`}
                              >
                                {comparedContainer?.livenessProbe ? (
                                  <div className="max-h-64 overflow-auto">
                                    <YamlViewer data={comparedContainer.livenessProbe} />
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                        <tr className="border-b border-border">
                          <td className="p-3 bg-secondary/20 font-medium">Readiness probes</td>
                          <td className="p-3 bg-secondary/40">
                            {container.readinessProbe ? (
                              <div className="max-h-64 overflow-auto">
                                <YamlViewer data={container.readinessProbe} />
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          {comparedResources.map((resourceId, idx) => {
                            const compared = comparisonData.compared[idx];
                            const comparedContainer = getContainers(compared).find(
                              (c: any) => c.name === container.name
                            );
                            const isDrift = hasDrift(container.readinessProbe, comparedContainer?.readinessProbe);
                            return (
                              <td
                                key={resourceId}
                                className={`p-3 ${isDrift ? 'bg-red-500/10' : ''}`}
                              >
                                {comparedContainer?.readinessProbe ? (
                                  <div className="max-h-64 overflow-auto">
                                    <YamlViewer data={comparedContainer.readinessProbe} />
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                        <tr className="border-b border-border">
                          <td className="p-3 bg-secondary/20 font-medium">Startup probes</td>
                          <td className="p-3 bg-secondary/40">
                            {container.startupProbe ? (
                              <div className="max-h-64 overflow-auto">
                                <YamlViewer data={container.startupProbe} />
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          {comparedResources.map((resourceId, idx) => {
                            const compared = comparisonData.compared[idx];
                            const comparedContainer = getContainers(compared).find(
                              (c: any) => c.name === container.name
                            );
                            const isDrift = hasDrift(container.startupProbe, comparedContainer?.startupProbe);
                            return (
                              <td
                                key={resourceId}
                                className={`p-3 ${isDrift ? 'bg-red-500/10' : ''}`}
                              >
                                {comparedContainer?.startupProbe ? (
                                  <div className="max-h-64 overflow-auto">
                                    <YamlViewer data={comparedContainer.startupProbe} />
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Diff Dialog */}
      <Dialog open={diffDialogOpen} onOpenChange={setDiffDialogOpen}>
        <DialogContent className="max-w-7xl bg-background/95 backdrop-blur-lg text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitCompareArrows className="h-5 w-5 text-blue-400" />
              {diffDialogData?.title}
            </DialogTitle>
            {diffDialogData && (
              <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                <div>
                  <span className="font-semibold">Baseline:</span>{' '}
                  {baselineResource.split('/').slice(0, 2).join(' > ')} &gt;{' '}
                  {baselineResource.split('/')[2]}
                </div>
                <div>
                  <span className="font-semibold">Compared:</span>{' '}
                  {comparedResources[0]?.split('/').slice(0, 2).join(' > ')} &gt;{' '}
                  {comparedResources[0]?.split('/')[2]}
                </div>
              </div>
            )}
          </DialogHeader>
          {diffDialogData && (
            <div className="mt-4">
              <MonacoDiffEditor
                originalContent={yaml.stringify(diffDialogData.baseline, { indent: 2, lineWidth: -1 })}
                currentContent={yaml.stringify(diffDialogData.compared, { indent: 2, lineWidth: -1 })}
                language="yaml"
                theme="github-dark"
                formatBeforeCompare={false}
                renderSideBySide={true}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ServiceDriftAnalysis;
