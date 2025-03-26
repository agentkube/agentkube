import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { getResource } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, ArrowLeft, Edit, Clock, Tag, List, FileJson, Trash } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { calculateAge } from '@/utils/age';
import { ErrorComponent, ResourceViewerYamlTab } from '@/components/custom';
import { YamlViewer } from '@/utils/yaml.utils';

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
  const [searchParams] = useSearchParams();
  const apiGroup = searchParams.get('apiGroup') || '';
  const apiVersion = searchParams.get('apiVersion') || '';
  const plural = searchParams.get('plural') || '';
  
  const [resource, setResource] = useState<CustomResource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
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
    // Implement delete functionality
    // Show confirmation dialog first
    if (window.confirm(`Are you sure you want to delete ${resource?.kind} "${resource?.metadata.name}"?`)) {
      // Call API to delete the resource
      console.log('Delete resource:', resource);
    }
  };
  
  const handleEdit = () => {
    // Navigate to editor with resource data
    navigate(`/dashboard/editor?kind=${resource?.kind}&name=${resource?.metadata.name}${resource?.metadata.namespace ? `&namespace=${resource?.metadata.namespace}` : ''}`);
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
          scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent
          [&::-webkit-scrollbar]:w-1.5 
          [&::-webkit-scrollbar-track]:bg-transparent 
          [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">
      
      {/* Header with breadcrumb */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-8 gap-1"
              onClick={() => navigate('/dashboard/explore/customresources')}
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Custom Resources</span>
            </Button>
          </div>
          <h1 className="text-3xl font-bold flex flex-wrap items-center gap-3">
            {resource.kind}: {resource.metadata.name}
            {resource.metadata.namespace && (
              <Badge className="ml-2">
                Namespace: {resource.metadata.namespace}
              </Badge>
            )}
          </h1>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleEdit}>
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
          <Button variant="outline" className='hover:bg-red-600 dark:hover:bg-red-700' onClick={handleDelete}>
            <Trash className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
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
                  <div className="text-sm font-mono text-xs">{resource.metadata.uid}</div>
                </>
              )}
              
              {resource.metadata.resourceVersion && (
                <>
                  <div className="text-sm font-medium">Resource Version</div>
                  <div className="text-sm font-mono text-xs">{resource.metadata.resourceVersion}</div>
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
          <Tabs defaultValue="yaml" className="w-full">
            <TabsList className="grid grid-cols-3 w-full max-w-md">
              <TabsTrigger value="yaml">YAML</TabsTrigger>
              <TabsTrigger value="spec">Spec</TabsTrigger>
              <TabsTrigger value="status">Status</TabsTrigger>
            </TabsList>
            
            <TabsContent value="yaml" className="mt-4">
              <ResourceViewerYamlTab resourceData={resource} currentContext={currentContext} />
            </TabsContent>
            
    
            
            <TabsContent value="spec" className="mt-4">
              {resource.spec ? (
                <>
                <YamlViewer data={resource.spec} />
                </>
              ) : (
                <Alert className="text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-900">
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
                <Alert className="text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-900">
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