import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { deleteResource, getResource } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, ArrowLeft, Edit, Clock, Tag, List, FileJson, Trash, ChevronRight, Crosshair } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { calculateAge } from '@/utils/age';
import { ErrorComponent, ResourceViewerYamlTab, DeletionDialog, ResourceCanvas } from '@/components/custom';
import { YamlViewer } from '@/utils/yaml.utils';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import KUBERNETES_LOGO from '@/assets/kubernetes.svg';
import { useReconMode } from '@/contexts/useRecon';
import { toast } from '@/hooks/use-toast';

// Define interfaces
interface CustomResource {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    creationTimestamp?: string;
    uid?: string;
    resourceVersion?: string;
    generation?: number;
    labels?: { [key: string]: string };
    annotations?: { [key: string]: string };
    finalizers?: string[];
    [key: string]: any;
  };
  spec?: any;
  status?: any;
  [key: string]: any;
}

// Main component
const CustomResourceViewer = () => {
  const { currentContext } = useCluster();
  const navigate = useNavigate();
  const params = useParams<{
    namespace?: string;
    name: string;
  }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const apiGroup = searchParams.get('apiGroup') || '';
  const apiVersion = searchParams.get('apiVersion') || '';
  const plural = searchParams.get('plural') || '';
  const tabParam = searchParams.get('tab');
  const defaultTab = tabParam || 'yaml';
  const { isReconMode } = useReconMode();
  const [resource, setResource] = useState<CustomResource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  // Get attack path mode from URL params
  const attackPathParam = searchParams.get('attackPath');
  const [attackPathMode, setAttackPathMode] = useState(attackPathParam === 'true');

  // Sync attack path mode with URL parameter
  useEffect(() => {
    const urlAttackPath = searchParams.get('attackPath') === 'true';
    if (urlAttackPath !== attackPathMode) {
      setAttackPathMode(urlAttackPath);
    }
  }, [searchParams, attackPathMode]);

  useEffect(() => {
    const fetchResource = async () => {
      if (!currentContext || !params.name || !apiGroup || !apiVersion || !plural) {
        setError('Missing required parameters');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Fetch the resource
        const resourceData = await getResource(
          currentContext.name,
          plural,
          params.name,
          params.namespace,
          apiGroup,
          apiVersion
        );

        setResource(resourceData);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch custom resource:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch custom resource');
      } finally {
        setLoading(false);
      }
    };

    fetchResource();
  }, [currentContext, params, apiGroup, apiVersion, plural]);

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
    if (!resource || !currentContext) {
      setShowDeleteDialog(false);
      return;
    }

    try {
      setDeleteLoading(true);

      await deleteResource(
        currentContext.name,
        plural,
        resource.metadata.name,
        {
          namespace: resource.metadata.namespace,
          apiGroup: apiGroup,
          apiVersion: apiVersion
        }
      );

      // Navigate back to the custom resources list
      navigate('/dashboard/explore/customresources');
    } catch (err) {
      console.error('Failed to delete custom resource:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete custom resource');
    } finally {
      setDeleteLoading(false);
      setShowDeleteDialog(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    );
  }

  if (error || !resource) {
    return <ErrorComponent message={error || 'Resource not found'} />;
  }

  // Extract API group and version from apiVersion
  const displayApiInfo = {
    group: apiGroup || (resource.apiVersion.includes('/') ? resource.apiVersion.split('/')[0] : 'core'),
    version: apiVersion || (resource.apiVersion.includes('/') ? resource.apiVersion.split('/')[1] : resource.apiVersion)
  };

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
            <BreadcrumbLink onClick={() => navigate('/dashboard/explore/customresources')}>CustomResourceDefinition</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator>
            <ChevronRight className="h-4 w-4" />
          </BreadcrumbSeparator>
          <BreadcrumbItem>
            <BreadcrumbLink>{resource.kind}</BreadcrumbLink>
          </BreadcrumbItem>
          {resource.metadata.namespace && (
            <>
              <BreadcrumbSeparator>
                <ChevronRight className="h-4 w-4" />
              </BreadcrumbSeparator>
              <BreadcrumbItem>
                <BreadcrumbLink onClick={() => navigate(`/dashboard/explore/namespaces/${resource.metadata.namespace}`)}>{resource.metadata.namespace}</BreadcrumbLink>
              </BreadcrumbItem>
            </>
          )}
          <BreadcrumbSeparator>
            <ChevronRight className="h-4 w-4" />
          </BreadcrumbSeparator>
          <BreadcrumbItem>
            <BreadcrumbLink>{resource.metadata.name}</BreadcrumbLink>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      {/* Header with breadcrumb */}

      <div className="mb-6">
        <div className="flex justify-between items-start mb-2">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{resource.metadata.name}</h1>
              <Badge>
                {resource.kind}
              </Badge>
            </div>
            {resource.metadata.namespace && (
              <div className="text-gray-500 dark:text-gray-400">
                Namespace: <span onClick={() => navigate(`/dashboard/explore/namespaces/${resource.metadata?.namespace}`)} className="text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">{resource.metadata.namespace}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => {
              setSearchParams(params => {
                params.set('tab', 'yaml');
                return params;
              });
            }}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
            <Button variant="outline" className='hover:bg-red-600 dark:hover:bg-red-700' onClick={handleDelete}>
              <Trash className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {resource && (
        <DeletionDialog
          isOpen={showDeleteDialog}
          onClose={() => setShowDeleteDialog(false)}
          onConfirm={confirmResourceDeletion}
          title="Delete Custom Resource"
          description={`Are you sure you want to delete the ${resource.kind} resource "${resource.metadata.name}"${resource.metadata.namespace ? ` in namespace "${resource.metadata.namespace}"` : ''}? This action cannot be undone.`}
          resourceName={resource.metadata.name}
          resourceType={resource.kind}
          isLoading={deleteLoading}
        />
      )}

      <Separator />

      {/* Metadata Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl flex items-center">
              <Tag className="h-5 w-5 mr-2" />
              Metadata
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <div className="text-sm font-medium">API Version</div>
              <div className="text-sm">{resource.apiVersion}</div>

              <div className="text-sm font-medium">Kind</div>
              <div className="text-sm">{resource.kind}</div>

              <div className="text-sm font-medium">Name</div>
              <div className="text-sm">{resource.metadata.name}</div>

              {resource.metadata.namespace && (
                <>
                  <div className="text-sm font-medium">Namespace</div>
                  <div className="text-sm">
                    <span
                      className="cursor-pointer text-blue-500 hover:underline"
                      onClick={() => navigate(`/dashboard/explore/namespaces/${resource.metadata.namespace}`)}
                    >
                      {resource.metadata.namespace}
                    </span>
                  </div>
                </>
              )}

              <div className="text-sm font-medium">Created</div>
              <div className="text-sm flex items-center">
                <Clock className="h-3 w-3 mr-1 inline" />
                {calculateAge(resource.metadata.creationTimestamp)} ago
              </div>

              {resource.metadata.uid && (
                <>
                  <div className="text-sm font-medium">UID</div>
                  <div className="font-mono text-xs">{resource.metadata.uid}</div>
                </>
              )}

              {resource.metadata.resourceVersion && (
                <>
                  <div className="text-sm font-medium">Resource Version</div>
                  <div className="font-mono text-xs">{resource.metadata.resourceVersion}</div>
                </>
              )}

              {resource.metadata.generation && (
                <>
                  <div className="text-sm font-medium">Generation</div>
                  <div className="text-sm">{resource.metadata.generation}</div>
                </>
              )}
            </div>

            {resource.metadata.finalizers && resource.metadata.finalizers.length > 0 && (
              <div className="pt-2">
                <div className="text-sm font-medium mb-1">Finalizers</div>
                <div className="flex flex-wrap gap-1">
                  {resource.metadata.finalizers.map((finalizer: string, index: number) => (
                    <Badge key={index} variant="secondary">
                      {finalizer}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Labels & Annotations Card */}
        <Card className="bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl flex items-center">
              <List className="h-5 w-5 mr-2" />
              Labels & Annotations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="text-sm font-medium mb-2">Labels</h3>
              {resource.metadata.labels && Object.keys(resource.metadata.labels).length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {Object.entries(resource.metadata.labels).map(([key, value]) => (
                    <Badge key={key} variant="outline" className="bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800/30">
                      {key}: {value}
                    </Badge>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500 dark:text-gray-400">No labels</div>
              )}
            </div>

            <div>
              <h3 className="text-sm font-medium mb-2">Annotations</h3>
              {resource.metadata.annotations && Object.keys(resource.metadata.annotations).length > 0 ? (
                <div className="flex flex-col gap-1">
                  {Object.entries(resource.metadata.annotations).map(([key, value]) => (
                    <div key={key} className="text-sm">
                      <span className="font-medium">{key}:</span> {value}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500 dark:text-gray-400">No annotations</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Spec and Status Tabs */}
      <Card className="bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-xl flex items-center">
            <FileJson className="h-5 w-5 mr-2" />
            Resource Data
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={defaultTab}
            onValueChange={(value) => {
              setSearchParams(params => {
                params.set('tab', value);
                return params;
              });
            }}
            className="w-full">
            <div className='flex justify-between items-center'>
              <TabsList className="grid grid-cols-4 w-full max-w-lg">
                <TabsTrigger value="yaml">YAML</TabsTrigger>
                <TabsTrigger value="canvas">Canvas</TabsTrigger>
                <TabsTrigger value="spec">Spec</TabsTrigger>
                <TabsTrigger value="status">Status</TabsTrigger>
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

            <TabsContent value="yaml" className="mt-4">
              <ResourceViewerYamlTab resourceData={resource} currentContext={currentContext} />
            </TabsContent>

            <TabsContent value="canvas" className="mt-4">
              <div className="h-[calc(100vh-400px)] min-h-[500px] rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
                {resource && (
                  <ResourceCanvas
                    resourceDetails={{
                      namespace: resource.metadata?.namespace || '',
                      group: displayApiInfo.group,
                      version: displayApiInfo.version,
                      resourceType: plural,
                      resourceName: resource.metadata?.name || '',
                    }}
                    attackPath={attackPathMode}
                  />
                )}
              </div>
            </TabsContent>

            <TabsContent value="spec" className="mt-4">
              {resource.spec ? (
                <>
                  <YamlViewer data={resource.spec} />
                </>
              ) : (
                <Alert className="text-gray-800 dark:text-gray-400 bg-gray-100 dark:bg-transparent">
                  <AlertDescription>This resource does not have a spec field</AlertDescription>
                </Alert>
              )}
            </TabsContent>

            <TabsContent value="status" className="mt-4">
              {resource.status ? (
                <>
                  <YamlViewer data={resource.status} />
                </>
              ) : (
                <Alert className="text-gray-800 dark:text-gray-400 bg-gray-100 dark:bg-transparent">
                  <AlertDescription>This resource does not have a status field</AlertDescription>
                </Alert>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default CustomResourceViewer;