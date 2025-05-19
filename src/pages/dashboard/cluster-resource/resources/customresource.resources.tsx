import React, { useState, useEffect, useMemo } from 'react';
import { listResources, deleteResource, getApiGroups } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';
import { useNamespace } from '@/contexts/useNamespace';
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, MoreVertical, Search, ArrowUpDown, ArrowUp, ArrowDown, Filter, ChevronRight, ChevronDown, Trash, Eye, Plus, LayoutList, Table2, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from 'react-router-dom';
import { calculateAge } from '@/utils/age';
import { NamespaceSelector, ErrorComponent } from '@/components/custom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

// Define types for Custom Resources
interface CustomResourceDefinition {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    creationTimestamp?: string;
    [key: string]: any;
  };
  spec: {
    group: string;
    names: {
      kind: string;
      plural: string;
      singular: string;
      listKind: string;
      shortNames?: string[];
    };
    scope: 'Namespaced' | 'Cluster';
    versions: {
      name: string;
      served: boolean;
      storage: boolean;
      [key: string]: any;
    }[];
    [key: string]: any;
  };
  status?: {
    acceptedNames: {
      kind: string;
      plural: string;
      [key: string]: any;
    };
    conditions: {
      type: string;
      status: string;
      lastTransitionTime: string;
      reason: string;
      message: string;
    }[];
    [key: string]: any;
  };
}

interface CustomResource {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    creationTimestamp?: string;
    uid?: string;
    resourceVersion?: string;
    labels?: { [key: string]: string };
    annotations?: { [key: string]: string };
    [key: string]: any;
  };
  spec?: any;
  status?: any;
  [key: string]: any;
}

interface GroupedCRDs {
  [group: string]: CustomResourceDefinition[];
}

// Define sorting types
type SortDirection = 'asc' | 'desc' | null;
type SortField = 'name' | 'namespace' | 'group' | 'version' | 'age' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

// Define view mode (grouped, list, grouped by kind)
type ViewMode = 'grouped' | 'list';

// Define state for selected CRDs to view
interface SelectedCRD {
  name: string;
  group: string;
  version: string;
  plural: string;
  scope: 'Namespaced' | 'Cluster';
}

const CustomResources: React.FC = () => {
  const navigate = useNavigate();
  const { currentContext } = useCluster();
  const { selectedNamespaces } = useNamespace();
  const [crds, setCRDs] = useState<CustomResourceDefinition[]>([]);
  const [customResources, setCustomResources] = useState<CustomResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingResources, setLoadingResources] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>('grouped');
  const [selectedCRDs, setSelectedCRDs] = useState<SelectedCRD[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [activeCRD, setActiveCRD] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);

  // Add sorting state
  const [sort, setSort] = useState<SortState>({
    field: 'name',
    direction: 'asc'
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Cmd+F (Mac) or Ctrl+F (Windows)
      if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();

        const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fetch CRDs
  useEffect(() => {
    const fetchCRDs = async () => {
      if (!currentContext) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Fetch CustomResourceDefinitions
        const fetchedCRDs = await listResources(currentContext.name, 'customresourcedefinitions', {
          apiGroup: 'apiextensions.k8s.io',
          apiVersion: 'v1'
        });

        setCRDs(fetchedCRDs);

        // Auto-expand the first group if in grouped mode
        if (fetchedCRDs.length > 0) {
          const groups = [...new Set(fetchedCRDs.map(crd => crd.spec.group))];
          if (groups.length > 0) {
            setExpandedGroups([groups[0]]);
            setActiveGroup(groups[0]);
          }
        }

        setError(null);
      } catch (err) {
        console.error('Failed to fetch CustomResourceDefinitions:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch CustomResourceDefinitions');
      } finally {
        setLoading(false);
      }
    };

    fetchCRDs();
  }, [currentContext]);

  // Fetch custom resources when activeGroup and activeCRD change
  useEffect(() => {
    const fetchCustomResources = async () => {
      if (!currentContext || !activeGroup || !activeCRD || selectedNamespaces.length === 0) {
        setCustomResources([]);
        return;
      }

      try {
        setLoadingResources(true);

        // Find the CRD
        const crd = crds.find(c => c.spec.group === activeGroup && c.spec.names.kind === activeCRD);

        if (!crd) {
          setCustomResources([]);
          return;
        }

        // Get the active version (preferably the storage version)
        const version = crd.spec.versions.find(v => v.storage)?.name || crd.spec.versions[0]?.name;

        if (!version) {
          setCustomResources([]);
          return;
        }

        let resources: CustomResource[] = [];

        if (crd.spec.scope === 'Cluster') {
          // Cluster-scoped resources
          resources = await listResources(currentContext.name, crd.spec.names.plural, {
            apiGroup: crd.spec.group,
            apiVersion: version
          });
        } else {
          // Namespaced resources - fetch from each selected namespace
          const resourcePromises = selectedNamespaces.map(namespace =>
            listResources(currentContext.name, crd.spec.names.plural, {
              namespace,
              apiGroup: crd.spec.group,
              apiVersion: version
            })
          );

          const results = await Promise.all(resourcePromises);
          resources = results.flat();
        }

        setCustomResources(resources);
      } catch (err) {
        console.error(`Failed to fetch custom resources for ${activeCRD}:`, err);
        setError(err instanceof Error ? err.message : `Failed to fetch ${activeCRD} resources`);
        setCustomResources([]);
      } finally {
        setLoadingResources(false);
      }
    };

    fetchCustomResources();
  }, [currentContext, activeGroup, activeCRD, selectedNamespaces, crds]);

  // Group CRDs by API group
  const groupedCRDs = useMemo((): GroupedCRDs => {
    const groups: GroupedCRDs = {};

    crds.forEach(crd => {
      const group = crd.spec.group;
      if (!groups[group]) {
        groups[group] = [];
      }
      groups[group].push(crd);
    });

    // Sort CRDs within each group by kind name
    Object.keys(groups).forEach(group => {
      groups[group].sort((a, b) => a.spec.names.kind.localeCompare(b.spec.names.kind));
    });

    return groups;
  }, [crds]);

  // Filter CRDs based on search query
  const filteredCRDs = useMemo(() => {
    if (!searchQuery.trim()) {
      return crds;
    }

    const lowercaseQuery = searchQuery.toLowerCase();

    return crds.filter(crd => {
      const kind = crd.spec.names.kind.toLowerCase();
      const group = crd.spec.group.toLowerCase();
      const singular = crd.spec.names.singular.toLowerCase();
      const plural = crd.spec.names.plural.toLowerCase();
      const shortNames = (crd.spec.names.shortNames || []).join(' ').toLowerCase();

      return (
        kind.includes(lowercaseQuery) ||
        group.includes(lowercaseQuery) ||
        singular.includes(lowercaseQuery) ||
        plural.includes(lowercaseQuery) ||
        shortNames.includes(lowercaseQuery)
      );
    });
  }, [crds, searchQuery]);

  // Group filtered CRDs
  const filteredGroupedCRDs = useMemo((): GroupedCRDs => {
    const groups: GroupedCRDs = {};

    filteredCRDs.forEach(crd => {
      const group = crd.spec.group;
      if (!groups[group]) {
        groups[group] = [];
      }
      groups[group].push(crd);
    });

    // Sort CRDs within each group by kind name
    Object.keys(groups).forEach(group => {
      groups[group].sort((a, b) => a.spec.names.kind.localeCompare(b.spec.names.kind));
    });

    return groups;
  }, [filteredCRDs]);

  // Filter custom resources based on search query
  const filteredCustomResources = useMemo(() => {
    if (!searchQuery.trim()) {
      return customResources;
    }

    const lowercaseQuery = searchQuery.toLowerCase();

    return customResources.filter(resource => {
      const name = resource.metadata?.name?.toLowerCase() || '';
      const namespace = resource.metadata?.namespace?.toLowerCase() || '';
      const labels = resource.metadata?.labels || {};
      const annotations = resource.metadata?.annotations || {};

      // Check if name or namespace contains the query
      if (name.includes(lowercaseQuery) || namespace.includes(lowercaseQuery)) {
        return true;
      }

      // Check if any label contains the query
      const labelMatches = Object.entries(labels).some(
        ([key, value]) =>
          key.toLowerCase().includes(lowercaseQuery) ||
          (typeof value === 'string' && value.toLowerCase().includes(lowercaseQuery))
      );

      // Check if any annotation contains the query
      const annotationMatches = Object.entries(annotations).some(
        ([key, value]) =>
          key.toLowerCase().includes(lowercaseQuery) ||
          (typeof value === 'string' && value.toLowerCase().includes(lowercaseQuery))
      );

      return labelMatches || annotationMatches;
    });
  }, [customResources, searchQuery]);

  // Sort custom resources based on sort state
  const sortedCustomResources = useMemo(() => {
    if (!sort.field || !sort.direction) {
      return filteredCustomResources;
    }

    return [...filteredCustomResources].sort((a, b) => {
      const sortMultiplier = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'name':
          return (a.metadata?.name || '').localeCompare(b.metadata?.name || '') * sortMultiplier;

        case 'namespace':
          return (a.metadata?.namespace || '').localeCompare(b.metadata?.namespace || '') * sortMultiplier;

        case 'group': {
          const apiVersionA = a.apiVersion || '';
          const apiVersionB = b.apiVersion || '';
          return apiVersionA.localeCompare(apiVersionB) * sortMultiplier;
        }

        case 'version': {
          const apiVersionA = a.apiVersion || '';
          const apiVersionB = b.apiVersion || '';
          const versionA = apiVersionA.split('/')[1] || apiVersionA;
          const versionB = apiVersionB.split('/')[1] || apiVersionB;
          return versionA.localeCompare(versionB) * sortMultiplier;
        }

        case 'age': {
          const timeA = a.metadata?.creationTimestamp ? new Date(a.metadata.creationTimestamp).getTime() : 0;
          const timeB = b.metadata?.creationTimestamp ? new Date(b.metadata.creationTimestamp).getTime() : 0;
          return (timeA - timeB) * sortMultiplier;
        }

        default:
          return 0;
      }
    });
  }, [filteredCustomResources, sort.field, sort.direction]);

  // Handle CRD selection
  const handleCRDSelect = (crd: CustomResourceDefinition) => {
    setActiveCRD(crd.spec.names.kind);
    setActiveGroup(crd.spec.group);
  };

  // Handle group expansion toggle
  const handleGroupToggle = (group: string) => {
    if (expandedGroups.includes(group)) {
      setExpandedGroups(expandedGroups.filter(g => g !== group));
    } else {
      setExpandedGroups([...expandedGroups, group]);
    }
  };

  const handleCRDDetails = (crd: CustomResourceDefinition) => {
    navigate(`/dashboard/explore/customresourcedefinitions/${crd.metadata.name}`);
  };

  // Handle custom resource details navigation
  const handleResourceDetails = (resource: CustomResource) => {
    const crd = crds.find(c => c.spec.group === activeGroup && c.spec.names.kind === activeCRD);

    if (!crd) return;

    const storageVersion = crd.spec.versions.find(v => v.storage)?.name || crd.spec.versions[0]?.name;

    if (crd.spec.scope === 'Namespaced') {
      navigate(`/dashboard/explore/customresources/view/${resource.metadata.namespace}/${resource.metadata.name}?apiGroup=${crd.spec.group}&apiVersion=${storageVersion}&plural=${crd.spec.names.plural}`);
    } else {
      navigate(`/dashboard/explore/customresources/view/${resource.metadata.name}?apiGroup=${crd.spec.group}&apiVersion=${storageVersion}&plural=${crd.spec.names.plural}`);
    }
  };

  // Handle column sort click
  const handleSort = (field: SortField) => {
    setSort(prevSort => {
      // If clicking the same field
      if (prevSort.field === field) {
        // Toggle direction: asc -> desc -> null -> asc
        if (prevSort.direction === 'asc') {
          return { field, direction: 'desc' };
        } else if (prevSort.direction === 'desc') {
          return { field: null, direction: null };
        } else {
          return { field, direction: 'asc' };
        }
      }
      // If clicking a new field, default to ascending
      return { field, direction: 'asc' };
    });
  };

  // Function to handle resource deletion
  const handleDeleteResource = async (resource: CustomResource) => {
    if (!resource.metadata?.name || !currentContext) {
      return;
    }

    try {
      setDeleteLoading(`${resource.metadata.namespace || 'cluster'}/${resource.metadata.name}`);

      // Find the CRD for this resource to get API details
      const crd = crds.find(c => c.spec.group === activeGroup && c.spec.names.kind === activeCRD);

      if (!crd) {
        throw new Error('Could not find CRD definition');
      }

      const storageVersion = crd.spec.versions.find(v => v.storage)?.name || crd.spec.versions[0]?.name;

      await deleteResource(
        currentContext.name,
        crd.spec.names.plural,
        resource.metadata.name,
        {
          namespace: resource.metadata.namespace,
          apiGroup: crd.spec.group,
          apiVersion: storageVersion
        }
      );

      // Update the UI by removing the deleted resource
      setCustomResources(prevResources =>
        prevResources.filter(res =>
          res.metadata?.name !== resource.metadata?.name ||
          res.metadata?.namespace !== resource.metadata?.namespace
        )
      );

    } catch (err) {
      console.error('Failed to delete custom resource:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete custom resource');
    } finally {
      setDeleteLoading(null);
    }
  };

  // Render sort indicator
  const renderSortIndicator = (field: SortField) => {
    if (sort.field !== field) {
      return <ArrowUpDown className="ml-1 h-4 w-4 inline opacity-10" />;
    }

    if (sort.direction === 'asc') {
      return <ArrowUp className="ml-1 h-4 w-4 inline text-blue-500" />;
    }

    if (sort.direction === 'desc') {
      return <ArrowDown className="ml-1 h-4 w-4 inline text-blue-500" />;
    }

    return null;
  };

  // Render the tree view of CRD groups
  const renderCRDTree = () => {
    const groups = Object.keys(filteredGroupedCRDs).sort();

    if (groups.length === 0) {
      return (
        <div className="p-4 text-gray-500 dark:text-gray-400">
          No CustomResourceDefinitions found
        </div>
      );
    }

    return (
      <div className="space-y-1">
        {groups.map(group => (
          <div key={group} className="border-b border-gray-200 dark:border-gray-800 last:border-0">
            <div
              className={`flex items-center p-2 cursor-pointer hover:bg-gray-200/50 dark:hover:bg-gray-800/30 ${activeGroup === group ? 'bg-gray-200/80 dark:bg-gray-800/50' : ''
                }`}
              onClick={() => {
                handleGroupToggle(group);
                setActiveGroup(group);
              }}
            >
              {expandedGroups.includes(group) ?
                <ChevronDown className="h-4 w-4 mr-2" /> :
                <ChevronRight className="h-4 w-4 mr-2" />
              }
              <span className="font-medium truncate">{group}</span>
              <Badge className="ml-2" variant="outline">{filteredGroupedCRDs[group].length}</Badge>
            </div>

            {expandedGroups.includes(group) && (
              <div className="pl-6 pb-1">
                {filteredGroupedCRDs[group].map(crd => (
                  <div
                    key={crd.metadata.name}
                    className={`flex items-center py-1 px-2 text-sm cursor-pointer rounded-md hover:bg-gray-200/50 dark:hover:bg-gray-800/30 ${activeCRD === crd.spec.names.kind && activeGroup === group ? 'bg-blue-100/50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : ''
                      }`}
                    onClick={() => handleCRDSelect(crd)}
                  >
                    <span className="truncate">{crd.spec.names.kind}</span>
                    <Badge className="ml-2" variant="secondary">
                      {crd.spec.scope === 'Namespaced' ? 'Namespaced' : 'Cluster'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  // Render the list view of all CRDs
  const renderCRDList = () => {
    if (filteredCRDs.length === 0) {
      return (
        <Alert className="m-4 text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-900">
          <AlertDescription>
            No CustomResourceDefinitions matching your search
          </AlertDescription>
        </Alert>
      );
    }

    return (
      <Table>
        <TableHeader>
          <TableRow className="border-b border-gray-400 dark:border-gray-800/80">
            <TableHead>Kind</TableHead>
            <TableHead>Group / Version</TableHead>
            <TableHead>Names</TableHead>
            <TableHead>Scope</TableHead>
            <TableHead>Age</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredCRDs.map(crd => (
            <TableRow
              key={crd.metadata.name}
              className={`hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30 ${activeCRD === crd.spec.names.kind && activeGroup === crd.spec.group ? 'bg-blue-100/50 dark:bg-blue-900/20' : ''
                }`}
              onClick={() => handleCRDSelect(crd)}
            >
              <TableCell
                className="font-medium hover:text-blue-500 hover:underline cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCRDDetails(crd);
                }}
              >
                {crd.spec.names.kind}
              </TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span>{crd.spec.group}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {crd.spec.versions.map(v => v.name).join(', ')}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span>Plural: {crd.spec.names.plural}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Singular: {crd.spec.names.singular}
                  </span>
                  {crd.spec.names.shortNames && crd.spec.names.shortNames.length > 0 && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Short: {crd.spec.names.shortNames.join(', ')}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={crd.spec.scope === 'Namespaced' ? 'secondary' : 'outline'}>
                  {crd.spec.scope}
                </Badge>
              </TableCell>
              <TableCell>{calculateAge(crd.metadata.creationTimestamp)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  // Render the resources table
  const renderCustomResourcesTable = () => {
    if (!activeCRD || !activeGroup) {
      return (
        <Alert className="m-4 text-gray-800 dark:text-gray-500 bg-gray-100 dark:bg-transparent">
          <AlertDescription>
            Select a CustomResourceDefinition to view resources
          </AlertDescription>
        </Alert>
      );
    }

    if (loadingResources) {
      return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
        </div>
      );
    }

    if (sortedCustomResources.length === 0) {
      return (
        <Alert className="m-4 text-gray-800 dark:text-gray-500 bg-gray-100 dark:bg-transparent">
          <AlertDescription>
            {selectedNamespaces.length === 0
              ? "Please select at least one namespace"
              : `No ${activeCRD} resources found in the selected namespaces`}
          </AlertDescription>
        </Alert>
      );
    }

    // Find the current CRD to check if it's namespaced
    const currentCRD = crds.find(crd =>
      crd.spec.group === activeGroup && crd.spec.names.kind === activeCRD
    );
    const isNamespaced = currentCRD?.spec.scope === 'Namespaced';

    return (
      <Card className="bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
        <div className="rounded-md border">
          <Table className="bg-gray-50 dark:bg-transparent rounded-2xl">
            <TableHeader>
              <TableRow className="border-b border-gray-400 dark:border-gray-800/80">
                <TableHead
                  className="cursor-pointer hover:text-blue-500"
                  onClick={() => handleSort('name')}
                >
                  Name {renderSortIndicator('name')}
                </TableHead>

                {isNamespaced && (
                  <TableHead
                    className="cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('namespace')}
                  >
                    Namespace {renderSortIndicator('namespace')}
                  </TableHead>
                )}

                <TableHead>Labels</TableHead>

                <TableHead
                  className="cursor-pointer hover:text-blue-500"
                  onClick={() => handleSort('age')}
                >
                  Age {renderSortIndicator('age')}
                </TableHead>

                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedCustomResources.map((resource) => (
                <TableRow
                  key={`${resource.metadata?.namespace || ''}-${resource.metadata?.name}`}
                  className="bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30"
                  onClick={() => handleResourceDetails(resource)}
                >
                  <TableCell className="font-medium">
                    <div className="hover:text-blue-500 hover:underline">
                      {resource.metadata?.name}
                    </div>
                  </TableCell>

                  {isNamespaced && (
                    <TableCell>
                      <div className="hover:text-blue-500 w-[150px] hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/dashboard/explore/namespaces/${resource.metadata?.namespace}`);
                        }}>
                        {resource.metadata?.namespace}
                      </div>
                    </TableCell>
                  )}

                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {resource.metadata?.labels && Object.entries(resource.metadata.labels).map(([key, value]) => (
                        <span
                          key={key}
                          className="px-2 py-1 rounded-[0.3rem] text-xs font-medium bg-gray-200 dark:bg-transparent dark:hover:bg-gray-800/50 border border-gray-300 dark:border-gray-800 text-gray-700 dark:text-gray-300"
                        >
                          {key}: {value}
                        </span>
                      ))}
                      {(!resource.metadata?.labels || Object.keys(resource.metadata.labels).length === 0) && (
                        <span className="text-gray-500 dark:text-gray-400">No labels</span>
                      )}
                    </div>
                  </TableCell>

                  <TableCell className='w-[80px]'>
                    {calculateAge(resource.metadata?.creationTimestamp?.toString())}
                  </TableCell>

                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="dark:bg-[#0B0D13]/40 backdrop-blur-sm text-gray-800 dark:text-gray-300">
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          handleResourceDetails(resource);
                        }}>
                          <Eye /> View
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteResource(resource);
                          }}
                          className="text-red-500 dark:text-red-400"
                          disabled={deleteLoading === `${resource.metadata?.namespace || 'cluster'}/${resource.metadata?.name}`}
                        >
                          {deleteLoading === `${resource.metadata?.namespace || 'cluster'}/${resource.metadata?.name}` ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Trash className="mr-2 h-4 w-4" />
                          )}
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    );
  }

  if (error) {
    return <ErrorComponent message={error} />;
  }

return (
    <div className="p-6 space-y-6
    max-h-[92vh] overflow-y-auto
      scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent
      [&::-webkit-scrollbar]:w-1.5 
      [&::-webkit-scrollbar-track]:bg-transparent 
      [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
      [&::-webkit-scrollbar-thumb]:rounded-full
      [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">

      <div className='flex items-center justify-between md:flex-row gap-4 flex-col md:items-end'>
        <div>
          <h1 className='text-5xl font-[Anton] uppercase font-bold text-gray-800/30 dark:text-gray-700/50'>Custom Resources</h1>
          <div className="w-full md:w-96 mt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
              <Input
                type="text"
                placeholder="Search by name, API group, or kind..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </div>

        <div className="w-full md:w-96">
          <div className="text-sm font-medium mb-2">Namespaces</div>
          <NamespaceSelector />
        </div>
      </div>

      {/* Tabs for view mode selection */}
      <div className="flex items-center justify-between">
        <Tabs defaultValue="grouped" className="w-full" onValueChange={(value) => setViewMode(value as ViewMode)}>
          <TabsList>
            <TabsTrigger value="grouped"><LayoutList /></TabsTrigger>
            <TabsTrigger value="list"><List /></TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          {activeCRD && (
            <Badge className="bg-blue-500/20 text-blue-700 dark:text-blue-300 border ">
              {activeCRD}
            </Badge>
          )}
          <Badge className="min-w-20 bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
            {crds.length} CRDs
          </Badge>
        </div>
      </div>

      {/* Main content area */}
      {viewMode === 'grouped' ? (
        // Grouped view - existing grid layout
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* CRD navigator - left side */}
          <Card className="bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none lg:col-span-1">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800">
              <h3 className="text-lg font-semibold">Custom Resource Definitions</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Select a CRD to view its instances</p>
            </div>

            <div className="overflow-y-auto max-h-[70vh]
          scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent
          [&::-webkit-scrollbar]:w-1.5 
          [&::-webkit-scrollbar-track]:bg-transparent 
          [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">
              {renderCRDTree()}
            </div>
          </Card>

          {/* Resources list - right side */}
          <div className="lg:col-span-3 space-y-4">
            {activeCRD && activeGroup && (
              <div className="flex items-center justify-between">
                <h2
                  className="text-2xl font-semibold flex items-center gap-2 hover:cursor-pointer group"
                  onClick={() => {
                    const crd = crds.find(c => c.spec.group === activeGroup && c.spec.names.kind === activeCRD);
                    if (crd) {
                      navigate(`/dashboard/explore/customresourcedefinitions/${crd.metadata.name}`);
                    }
                  }}
                >
                  {activeCRD}
                  <span className="text-sm font-normal text-gray-500 dark:text-gray-400 group-hover:text-blue-500 group-hover:underline">
                    {activeGroup}
                  </span>
                </h2>

                <div className="flex gap-2">
                  <Button>
                    <Filter className="h-4 w-4 mr-1" />
                    Filter
                  </Button>
                  <Button
                    onClick={() => navigate(`/dashboard/editor?kind=${activeCRD}&apiGroup=${activeGroup}`)}>
                    <Plus />
                    Create
                  </Button>
                </div>
              </div>
            )}

            {renderCustomResourcesTable()}
          </div>
        </div>
      ) : (
        // List view - full width
        <div className="space-y-6">
          {/* CRD List */}
          <Card className="bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800">
              <h3 className="text-lg font-semibold">Custom Resource Definitions</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Click on a CRD to view its instances below</p>
            </div>
            <div className="overflow-y-auto max-h-[40vh]
          scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent
          [&::-webkit-scrollbar]:w-1.5 
          [&::-webkit-scrollbar-track]:bg-transparent 
          [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">
              {renderCRDList()}
            </div>
          </Card>

          {/* Separator */}
          {activeCRD && activeGroup && (
            <div className="border-t border-gray-300 dark:border-gray-700 pt-6"></div>
          )}

          {/* Resources Table */}
          {activeCRD && activeGroup && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2
                  className="text-2xl font-semibold flex items-center gap-2 hover:cursor-pointer group"
                  onClick={() => {
                    const crd = crds.find(c => c.spec.group === activeGroup && c.spec.names.kind === activeCRD);
                    if (crd) {
                      navigate(`/dashboard/explore/customresourcedefinitions/${crd.metadata.name}`);
                    }
                  }}
                >
                  {activeCRD}
                  <span className="text-sm font-normal text-gray-500 dark:text-gray-400 group-hover:text-blue-500 group-hover:underline">
                    {activeGroup}
                  </span>
                </h2>

                <div className="flex gap-2">
                  <Button>
                    <Filter className="h-4 w-4 mr-1" />
                    Filter
                  </Button>
                  <Button
                    onClick={() => navigate(`/dashboard/editor?kind=${activeCRD}&apiGroup=${activeGroup}`)}>
                    <Plus />
                    Create
                  </Button>
                </div>
              </div>

              {renderCustomResourcesTable()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default CustomResources;