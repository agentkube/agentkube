import React, { useState, useEffect } from 'react';
import { SideDrawer, DrawerHeader, DrawerContent } from '@/components/ui/sidedrawer.custom';
import { K8sResourceData } from '@/utils/kubernetes-graph.utils';
import { ImageVulnAudit } from './imagevuln-audit.component';
import { IngressView } from './ingress-view.component';
import { ResourceAudit } from './resource-audit.component';

interface AttackPathDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  resourceData: K8sResourceData | null;
}

const AttackPathDrawer: React.FC<AttackPathDrawerProps> = ({
  isOpen,
  onClose,
  resourceData
}) => {
  const getDefaultTab = (): 'image' | 'resource' | 'ingress' => {
    if (!resourceData) return 'resource';
    const resourceType = resourceData.resourceType?.toLowerCase();
    
    switch (resourceType) {
      case 'image':
        return 'image';
      case 'ingress':
      case 'ingresses':
        return 'ingress';
      case 'pods':
        return 'resource';
      default:
        return 'resource';
    }
  };

  const [activeTab, setActiveTab] = useState<'image' | 'resource' | 'ingress'>(getDefaultTab());

  // Reset tab when resource data changes
  useEffect(() => {
    setActiveTab(getDefaultTab());
  }, [resourceData?.resourceType, resourceData?.resourceName]);

  if (!resourceData) return null;

  const renderContent = () => {
    switch (activeTab) {
      case 'image':
        return <ImageVulnAudit resourceData={resourceData} />;
      case 'resource':
        return <ResourceAudit resourceData={resourceData} />;
      case 'ingress':
        return <IngressView resourceData={resourceData} />;
      default:
        return <ResourceAudit resourceData={resourceData} />;
    }
  };

  const getTabsForResourceType = () => {
    const resourceType = resourceData.resourceType?.toLowerCase();
    
    switch (resourceType) {
      case 'image':
        return ['image'];
      case 'ingress':
      case 'ingresses':
        return ['ingress'];
      case 'pods':
        return ['resource'];
      default:
        return ['resource'];
    }
  };

  const availableTabs = getTabsForResourceType();

  return (
    <SideDrawer isOpen={isOpen} onClose={onClose} offsetTop="-top-2">
      <DrawerHeader onClose={onClose}>
        <div className="py-1">
          <div className="text-xl font-light dark:text-gray-500 mt-1">
            <span className="text-black dark:text-white">{resourceData.resourceType}</span>
            {" "}{resourceData.resourceName}
          </div>
        </div>
      </DrawerHeader>

      <DrawerContent>
        <div className="p-2 space-y-4">
          {/* Tab Navigation */}
          {availableTabs.length > 1 && (
            <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
              {availableTabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab as any)}
                  className={`px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                    activeTab === tab
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)} Analysis
                </button>
              ))}
            </div>
          )}

          {/* Tab Content */}
          {renderContent()}
        </div>
      </DrawerContent>
    </SideDrawer>
  );
};

export default AttackPathDrawer;