import React, { useState, useEffect } from 'react';
import { Copy, CheckCheck } from 'lucide-react';
import { SideDrawer, DrawerHeader, DrawerContent } from '@/components/ui/sidedrawer.custom';
import { K8sResourceData } from '@/utils/kubernetes-graph.utils';
import { ImageVulnAudit } from './imagevuln-audit.component';
import { IngressView } from './ingress-view.component';
import { ResourceAudit } from './resource-audit.component';
import { KubeResourceIconMap, KubeResourceType } from '@/constants/kuberesource-icon-map.constant';

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
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (resourceData?.resourceName) {
      try {
        await navigator.clipboard.writeText(resourceData.resourceName);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }
  };

  const getTabsForResourceType = () => {
    if (!resourceData) return [];
    const resourceType = resourceData.resourceType?.toLowerCase();
    console.log("ok", resourceType)

    switch (resourceType) {
      case 'image':
        return ['image'];
      case 'ingress':
      case 'ingresses':
        return ['ingress'];
      case 'pods':
      case 'deployments':
      case 'statefulsets':
      case 'daemonsets':
      case 'replicasets':
      case 'services':
      case 'configmaps':
      case 'secrets':
      case 'jobs':
      case 'cronjobs':
        return ['resource'];
      case 'container':
        return []; // No tabs for containers
      default:
        return []; // Unknown resource types get no tabs
    }
  };

  const [activeTab, setActiveTab] = useState<'image' | 'resource' | 'ingress' | null>(null);

  // Reset tab when resource data changes
  useEffect(() => {
    const availableTabs = getTabsForResourceType();
    if (availableTabs.length > 0) {
      setActiveTab(availableTabs[0] as 'image' | 'resource' | 'ingress');
    } else {
      setActiveTab(null);
    }
  }, [resourceData?.resourceType, resourceData?.resourceName]);

  if (!resourceData) return null;

  const renderContent = () => {
    if (!activeTab) {
      return <div className="p-4"></div>;
    }

    switch (activeTab) {
      case 'image':
        return <ImageVulnAudit resourceData={resourceData} />;
      case 'resource':
        return <ResourceAudit resourceData={resourceData} />;
      case 'ingress':
        return <IngressView resourceData={resourceData} />;
      default:
        return <div className="p-4"></div>;
    }
  };


  const availableTabs = getTabsForResourceType();

  return (
    <SideDrawer isOpen={isOpen} onClose={onClose} offsetTop="-top-2">
      <DrawerHeader onClose={onClose}>
        <div className="py-1">
          <div className="text-xl text-muted-foreground mt-1 flex items-center gap-2">
            <div className="flex-shrink-0 bg-secondary p-1 rounded-lg">
              {(() => {
                const resourceType = resourceData.resourceType?.toLowerCase() as KubeResourceType;
                const icon = KubeResourceIconMap[resourceType] || KubeResourceIconMap.default;
                const isLucideIcon = resourceType === 'container' || resourceType === 'image';

                return isLucideIcon ? (
                  React.createElement(icon as React.ComponentType<any>, {
                    className: "w-6 h-6 text-foreground"
                  })
                ) : (
                  <img src={icon as string} alt={resourceData.resourceType} className="w-6 h-6" />
                );
              })()}
            </div>
            <span className="text-foreground">{resourceData.resourceType.charAt(0).toUpperCase() + resourceData.resourceType.slice(1)}</span>
            {" "}{resourceData.resourceName}
            <button
              onClick={handleCopy}
              className="p-1 rounded hover:bg-accent-hover transition-colors"
              title="Copy resource name"
            >
              {copied ? (
                <CheckCheck className="w-4 h-4 text-green-500" />
              ) : (
                <Copy className="w-4 h-4 text-muted-foreground hover:text-foreground" />
              )}
            </button>
          </div>
        </div>
      </DrawerHeader>

      <DrawerContent>
        <div className="p-2 space-y-4">
          {/* Tab Navigation */}
          {availableTabs.length > 1 && (
            <div className="flex gap-1 border-b border-border">
              {availableTabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab as any)}
                  className={`px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeTab === tab
                      ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600'
                      : 'text-muted-foreground hover:text-foreground'
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