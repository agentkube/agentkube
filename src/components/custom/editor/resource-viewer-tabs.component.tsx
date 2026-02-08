import React from 'react';
import AIEditor from '@/pages/dashboard/editor/editor.pages';

interface ResourceViewerYamlTabProps {
  resourceData: any;
  namespace?: string;
  currentContext: any;
  // Make these optional since we'll extract them from resourceData
  apiGroup?: string;
  apiVersion?: string;
  resourceType?: string;
}

const ResourceViewerYamlTab: React.FC<ResourceViewerYamlTabProps> = ({
  resourceData,
  namespace,
  currentContext,
  apiGroup,
  apiVersion,
  resourceType
}) => {
  // Extract API information from the resource data if not provided
  // For core resources (like ConfigMaps), apiVersion is just "v1" with no group
  // For non-core resources, apiVersion is "group/version" format
  const extractedApiGroup = apiGroup || (() => {
    if (!resourceData?.apiVersion) return '';
    
    // If apiVersion contains '/', it's a non-core resource with group/version format
    if (resourceData.apiVersion.includes('/')) {
      return resourceData.apiVersion.split('/')[0];
    }
    
    // If apiVersion is just a version (like "v1", "v1beta1"), it's a core resource
    // Core resources have empty apiGroup
    return '';
  })();
  
  const extractedApiVersion = apiVersion || (resourceData?.apiVersion ? 
    (resourceData.apiVersion.includes('/') ? resourceData.apiVersion.split('/')[1] : resourceData.apiVersion) : 'v1');
  
  // Get resource type from kind if not provided
  const extractedResourceType = resourceType || (resourceData?.kind ? 
    `${resourceData.kind.toLowerCase()}s` : ''); // Simple pluralization

  // Extract namespace if not provided
  const extractedNamespace = namespace || resourceData?.metadata?.namespace || '';
  
  // Format resource kind for display (e.g., "pods" -> "Pod")
  const kind = resourceData?.kind || 
    (extractedResourceType.charAt(0).toUpperCase() + 
     extractedResourceType.substring(1, extractedResourceType.length - 1));

  return (
    <AIEditor
      resourceData={resourceData}
      namespace={extractedNamespace}
      currentContext={currentContext}
      resourceName={resourceData?.metadata?.name || ''}
      apiGroup={extractedApiGroup}
      apiVersion={extractedApiVersion}
      resourceType={extractedResourceType}
      kind={kind}
    />
  );
};

export default ResourceViewerYamlTab;