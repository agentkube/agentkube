import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { MiniEditor } from './minieditor.component';

const MiniEditorWrapper = () => {
  const [isMiniEditorOpen, setIsMiniEditorOpen] = useState(false);
  const location = useLocation();

  const toggleMiniEditor = () => {
    setIsMiniEditorOpen(!isMiniEditorOpen);
  };

  // Extract current resource type from URL path
  const getCurrentResourceType = (): string | null => {
    const pathSegments = location.pathname.split('/');
    
    // Look for resource type patterns in URL
    // Expected patterns: /deployments, /deployments/deployment-name, etc.
    for (let i = 0; i < pathSegments.length; i++) {
      const segment = pathSegments[i];
      
      // Check for known resource types
      const resourceTypes = [
        'deployments', 'pods', 'services', 'configmaps', 'secrets',
        'statefulsets', 'daemonsets', 'replicasets', 'jobs', 'cronjobs',
        'ingresses', 'ingressclasses', 'networkpolicies', 'endpoints',
        'persistentvolumeclaims', 'persistentvolumes', 'storageclasses',
        'serviceaccounts', 'roles', 'rolebindings', 'clusterroles',
        'clusterrolebindings', 'namespaces', 'resourcequotas', 'limitranges',
        'hpa', 'pdb', 'priorityclasses', 'runtime-classes', 'leases'
      ];
      
      if (resourceTypes.includes(segment)) {
        return segment;
      }
    }
    
    return null;
  };

  // Don't show mini editor on home page or settings pages
  const shouldHideMiniEditor = location.pathname === '/' || location.pathname.startsWith('/settings');

  if (shouldHideMiniEditor) {
    return null;
  }

  const currentResourceType = getCurrentResourceType();

  return (
    <MiniEditor 
      isOpen={isMiniEditorOpen} 
      onToggle={toggleMiniEditor}
      currentResourceType={currentResourceType}
    />
  );
};

export default MiniEditorWrapper;