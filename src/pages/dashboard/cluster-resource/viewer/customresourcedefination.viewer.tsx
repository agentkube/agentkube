import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getResource, listResources, deleteResource } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Edit, Clock, FileJson, Trash, List, Table as TableIcon, Plus, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { calculateAge } from '@/utils/age';
import { ErrorComponent, ResourceViewerYamlTab, DeletionDialog } from '@/components/custom';
import { useSearchParams } from 'react-router-dom';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import KUBERNETES_LOGO from '@/assets/kubernetes.svg';
import { useReconMode } from '@/contexts/useRecon';
import { toast } from '@/hooks/use-toast';

// Define interfaces
interface CustomResourceDefinition {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    creationTimestamp?: string;
    uid?: string;
    resourceVersion?: string;
    generation?: number;
    labels?: { [key: string]: string };
    annotations?: { [key: string]: string };
    finalizers?: string[];
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
      schema?: {
        openAPIV3Schema?: any;
      };
      [key: string]: any;
    }[];
    conversion?: {
      strategy: string;
      webhook?: any;
    };
    preserveUnknownFields?: boolean;
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
    storedVersions: string[];
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
    [key: string]: any;
  };
  spec?: any;
  status?: any;
  [key: string]: any;
}

// Schema display component
const SchemaViewer = ({ schema }: { schema: any }) => {
  if (!schema || !schema.openAPIV3Schema) {
    return <div>No schema available</div>;
  }

  // Helper function to render a property
  const renderProperty = (name: string, property: any, required: string[] = [], indent: number = 0) => {
    const isRequired = required.includes(name);
    const type = property.type || 'object';

    return (
      <div key={name} style={{ marginLeft: `${indent * 20}px` }}>
        <div className="flex items-start">
          <span className="font-semibold mr-2">{name}</span>
          <Badge className="mr-2">{type}</Badge>
          {isRequired && <Badge variant="destructive" className="mr-2">Required</Badge>}
          {property.format && <Badge variant="outline">{property.format}</Badge>}
        </div>

        {property.description && (
          <div className="text-sm text-gray-600 dark:text-gray-400 ml-4 my-1">
            {property.description}
          </div>
        )}

        {property.properties && (
          <div className="ml-4 mt-2 border-l-2 border-gray-300 dark:border-gray-700 pl-4 space-y-2">
            {Object.entries(property.properties).map(([propName, propValue]: [string, any]) =>
              renderProperty(propName, propValue, property.required, indent + 1)
            )}
          </div>
        )}

        {property.items && property.type === 'array' && (
          <div className="ml-4 mt-2">
            <div className="border-l-2 border-gray-300 dark:border-gray-700 pl-4">
              <Badge>Array Items</Badge>
              {property.items.type && <Badge className="ml-2">{property.items.type}</Badge>}

              {property.items.properties && (
                <div className="ml-4 mt-2 space-y-2">
                  {Object.entries(property.items.properties).map(([propName, propValue]: [string, any]) =>
                    renderProperty(propName, propValue, property.items.required, indent + 1)
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const rootSchema = schema.openAPIV3Schema;

  return (
    <div className="p-4 bg-gray-100 dark:bg-gray-700/10 rounded-lg">
      <h3 className="text-lg font-medium mb-4">Schema Definition</h3>

      {rootSchema.properties?.spec && (
        <div className="mb-6">
          <h4 className="text-md font-medium mb-2 flex items-center">
            <Badge className="mr-2">Spec</Badge> Fields
          </h4>
          <div className="ml-4 space-y-4">
            {rootSchema.properties.spec.properties && Object.entries(rootSchema.properties.spec.properties).map(
              ([name, property]: [string, any]) => renderProperty(
                name,
                property,
                rootSchema.properties.spec.required
              )
            )}
          </div>
        </div>
      )}

      {rootSchema.properties?.status && (
        <div>
          <h4 className="text-md font-medium mb-2 flex items-center">
            <Badge className="mr-2">Status</Badge> Fields
          </h4>
          <div className="ml-4 space-y-4">
            {rootSchema.properties.status.properties && Object.entries(rootSchema.properties.status.properties).map(
              ([name, property]: [string, any]) => renderProperty(
                name,
                property,
                rootSchema.properties.status.required
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const CustomResourceDefinitionViewer = () => {
  const { currentContext } = useCluster();
  const navigate = useNavigate();
  const params = useParams<{ name: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const defaultTab = tabParam || 'schema';
  const { isReconMode } = useReconMode();
  const [crd, setCRD] = useState<CustomResourceDefinition | null>(null);
  const [instances, setInstances] = useState<CustomResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingInstances, setLoadingInstances] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeVersion, setActiveVersion] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    const fetchCRD = async () => {
      if (!currentContext || !params.name) {
        setError('Missing required parameters');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Fetch the CRD
        const crdData = await getResource(
          currentContext.name,
          'customresourcedefinitions',
          params.name,
          undefined,
          'apiextensions.k8s.io',
          'v1'
        );

        setCRD(crdData);

        // Set active version to the storage version or first version
        const storageVersion = crdData.spec.versions.find((v: any) => v.storage);
        setActiveVersion(storageVersion?.name || crdData.spec.versions[0]?.name);

        setError(null);
      } catch (err) {
        console.error('Failed to fetch CRD:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch CRD');
      } finally {
        setLoading(false);
      }
    };

    fetchCRD();
  }, [currentContext, params.name]);

  // Fetch instances when active version changes
  useEffect(() => {
    const fetchInstances = async () => {
      if (!currentContext || !crd || !activeVersion) return;

      try {
        setLoadingInstances(true);

        let resources: CustomResource[] = [];

        if (crd.spec.scope === 'Cluster') {
          // Cluster-scoped resources
          resources = await listResources(currentContext.name, crd.spec.names.plural, {
            apiGroup: crd.spec.group,
            apiVersion: activeVersion
          });
        } else {
          // Namespaced resources - fetch from all namespaces
          resources = await listResources(currentContext.name, crd.spec.names.plural, {
            apiGroup: crd.spec.group,
            apiVersion: activeVersion
          });
        }

        setInstances(resources);
      } catch (err) {
        console.error(`Failed to fetch instances:`, err);
        // Don't set error, just show empty state
        setInstances([]);
      } finally {
        setLoadingInstances(false);
      }
    };

    fetchInstances();
  }, [currentContext, crd, activeVersion]);

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

  const confirmDeletion = async () => {
    if (!crd || !currentContext) {
      setShowDeleteDialog(false);
      return;
    }

    try {
      setDeleteLoading(true);

      await deleteResource(
        currentContext.name,
        'customresourcedefinitions',
        crd.metadata.name,
        {
          apiGroup: 'apiextensions.k8s.io',
          apiVersion: 'v1'
        }
      );

      // Navigate back to the custom resources list
      navigate('/dashboard/explore/customresources');
    } catch (err) {
      console.error('Failed to delete CustomResourceDefinition:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete CustomResourceDefinition');
    } finally {
      setDeleteLoading(false);
      setShowDeleteDialog(false);
    }
  };

  const handleEdit = () => {
    navigate(`/dashboard/editor?kind=CustomResourceDefinition&name=${crd?.metadata.name}&apiGroup=apiextensions.k8s.io&apiVersion=v1`);
  };


  const handleViewInstance = (instance: CustomResource) => {
    if (!crd) return;

    if (crd.spec.scope === 'Namespaced') {
      navigate(`/dashboard/explore/customresources/view/${instance.metadata.namespace}/${instance.metadata.name}?apiGroup=${crd.spec.group}&apiVersion=${activeVersion}&plural=${crd.spec.names.plural}`);
    } else {
      navigate(`/dashboard/explore/customresources/view/${instance.metadata.name}?apiGroup=${crd.spec.group}&apiVersion=${activeVersion}&plural=${crd.spec.names.plural}`);
    }
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    );
  }

  if (error || !crd) {
    return <ErrorComponent message={error || 'CRD not found'} />;
  }

  // Get active version schema
  const activeVersionData = crd.spec.versions.find(v => v.name === activeVersion);
  const schema = activeVersionData?.schema;

  return (
    <div className="p-6 space-y-6
        max-h-[92vh] overflow-y-auto
          
          [&::-webkit-scrollbar]:w-1.5 
          [&::-webkit-scrollbar-track]:bg-transparent 
          [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">

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
            <BreadcrumbLink onClick={() => navigate('/dashboard/explore/customresources')}>CustomResourceDefinitions</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator>
            <ChevronRight className="h-4 w-4" />
          </BreadcrumbSeparator>
          <BreadcrumbItem>
            <BreadcrumbLink>{crd.spec.names.kind}</BreadcrumbLink>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>


      {/* Header with breadcrumb */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold flex flex-wrap items-center gap-3">
            {crd.spec.names.kind}
            <Badge className="ml-2 bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
              {crd.spec.group}
            </Badge>
          </h1>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => {
            setSearchParams(params => {
              params.set('tab', 'yaml');
              return params;
            });
          }}>
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
          <Button variant="destructive" onClick={handleDelete}>
            <Trash className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Separator />
      {crd && (
        <DeletionDialog
          isOpen={showDeleteDialog}
          onClose={() => setShowDeleteDialog(false)}
          onConfirm={confirmDeletion}
          title="Delete CustomResourceDefinition"
          description={`Are you sure you want to delete the CustomResourceDefinition "${crd.metadata.name}"? This will permanently remove the resource definition and may affect existing custom resources. This action cannot be undone.`}
          resourceName={crd.metadata.name}
          resourceType="CustomResourceDefinition"
          isLoading={deleteLoading}
        />
      )}

      {/* CRD Metadata Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl flex items-center">
              <List className="h-5 w-5 mr-2" />
              Definition Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <div className="text-sm font-medium">API Group</div>
              <div className="text-sm">{crd.spec.group}</div>

              <div className="text-sm font-medium">Kind</div>
              <div className="text-sm">{crd.spec.names.kind}</div>

              <div className="text-sm font-medium">Plural Name</div>
              <div className="text-sm">{crd.spec.names.plural}</div>

              <div className="text-sm font-medium">Singular Name</div>
              <div className="text-sm">{crd.spec.names.singular}</div>

              {crd.spec.names.shortNames && crd.spec.names.shortNames.length > 0 && (
                <>
                  <div className="text-sm font-medium">Short Names</div>
                  <div className="text-sm">{crd.spec.names.shortNames.join(', ')}</div>
                </>
              )}

              <div className="text-sm font-medium">Scope</div>
              <div className="text-sm">
                <Badge variant={crd.spec.scope === 'Namespaced' ? 'secondary' : 'outline'}>
                  {crd.spec.scope}
                </Badge>
              </div>

              <div className="text-sm font-medium">Created</div>
              <div className="text-sm flex items-center">
                <Clock className="h-3 w-3 mr-1 inline" />
                {calculateAge(crd.metadata.creationTimestamp)} ago
              </div>
            </div>

            <div className="pt-2">
              <div className="text-sm font-medium mb-1">Versions</div>
              <div className="flex flex-wrap gap-1">
                {crd.spec.versions.map((version: any) => (
                  <Badge
                    key={version.name}
                    variant={activeVersion === version.name ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => setActiveVersion(version.name)}
                  >
                    {version.name}
                    {version.storage && ' (storage)'}
                    {!version.served && ' (not served)'}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Status Card */}
        <Card className="bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl flex items-center">
              <TableIcon className="h-5 w-5 mr-2" />
              Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {crd.status?.conditions && (
              <div>
                <h3 className="text-sm font-medium mb-2">Conditions</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Transition</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {crd.status.conditions.map((condition: any, index: number) => (
                      <TableRow key={index}>
                        <TableCell>{condition.type}</TableCell>
                        <TableCell>
                          <Badge
                            variant={condition.status === 'True' ? 'default' : 'destructive'}
                            className={condition.status === 'True' ? 'bg-green-300 text-green-800 dark:bg-green-900/20 dark:text-green-300 shadow-none' : ''}
                          >
                            {condition.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{calculateAge(condition.lastTransitionTime)} ago</TableCell>
                        <TableCell>{condition.reason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {crd.status?.storedVersions && (
              <div>
                <h3 className="text-sm font-medium mb-2">Stored Versions</h3>
                <div className="flex flex-wrap gap-1">
                  {crd.status.storedVersions.map((version: string) => (
                    <Badge key={version} variant="outline">
                      {version}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {(!crd.status?.conditions || crd.status.conditions.length === 0) && (
              <div className="text-sm text-gray-500 dark:text-gray-400">No status conditions</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Instances Table */}
      <Card className="bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-xl flex items-center justify-between">
            <div className="flex items-center">
              <TableIcon className="h-5 w-5 mr-2" />
              Instances
            </div>
            <Button onClick={() => {
              navigate(`/dashboard/editor?kind=${crd.spec.names.kind}&apiGroup=${crd.spec.group}&apiVersion=${activeVersion}`);
            }}>
              <Plus /> Create
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingInstances ? (
            <div className="flex items-center justify-center h-20">
              <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
            </div>
          ) : instances.length === 0 ? (
            <Alert className=" text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-transparent">
              <AlertDescription>
                No instances of {crd.spec.names.kind} found
              </AlertDescription>
            </Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  {crd.spec.scope === 'Namespaced' && <TableHead>Namespace</TableHead>}
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {instances.map((instance) => (
                  <TableRow
                    key={`${instance.metadata.namespace || ''}-${instance.metadata.name}`}
                    className="cursor-pointer hover:bg-gray-200/50 dark:hover:bg-gray-800/30"
                    onClick={() => handleViewInstance(instance)}
                  >
                    <TableCell className="font-medium hover:text-blue-500 hover:underline">{instance.metadata.name}</TableCell>
                    {crd.spec.scope === 'Namespaced' && (
                      <TableCell>{instance.metadata.namespace}</TableCell>
                    )}
                    <TableCell>{calculateAge(instance.metadata.creationTimestamp)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Schema and YAML Tabs */}
      <Card className="bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-xl flex items-center">
            <FileJson className="h-5 w-5 mr-2" />
            Schema & Definition ({activeVersion})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs
            value={defaultTab}
            onValueChange={(value) => {
              setSearchParams(params => {
                params.set('tab', value);
                return params;
              });
            }}
            className="w-full">
            <TabsList className="grid grid-cols-3 w-full max-w-md">
              <TabsTrigger value="schema">Schema</TabsTrigger>
              <TabsTrigger value="yaml">YAML</TabsTrigger>
              <TabsTrigger value="json">JSON</TabsTrigger>
            </TabsList>

            <TabsContent value="schema" className="mt-4">
              {schema ? (
                <SchemaViewer schema={schema} />
              ) : (
                <Alert>
                  <AlertDescription>No schema defined for version {activeVersion}</AlertDescription>
                </Alert>
              )}
            </TabsContent>

            <TabsContent value="yaml" className="mt-4">
              <ResourceViewerYamlTab resourceData={crd} currentContext={currentContext} />
            </TabsContent>

            <TabsContent value="json" className="mt-4">
              <pre className="bg-gray-100 dark:bg-gray-700/10 p-4 rounded-md overflow-auto text-sm font-mono
                max-h-[70vh] overflow-y-auto
                
                [&::-webkit-scrollbar]:w-1.5 
                [&::-webkit-scrollbar-track]:bg-transparent 
                [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
                [&::-webkit-scrollbar-thumb]:rounded-full
                [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">
                {JSON.stringify(crd, null, 2)}
              </pre>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default CustomResourceDefinitionViewer;