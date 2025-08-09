import React, { useState } from 'react';
import { V1Volume } from '@kubernetes/client-node';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  ChevronDown, 
  ChevronUp, 
  Database, 
  HardDrive, 
  Lock, 
  Key, 
  FileText, 
  Server,
  Cloud 
} from "lucide-react";

interface VolumeViewerProps {
  volumes: V1Volume[];
}

const VolumeViewer: React.FC<VolumeViewerProps> = ({ volumes }) => {
  const [expandedVolumes, setExpandedVolumes] = useState<Record<string, boolean>>({});

  // Toggle volume expansion
  const toggleVolumeExpansion = (volumeName: string) => {
    setExpandedVolumes(prev => ({
      ...prev,
      [volumeName]: !prev[volumeName]
    }));
  };

  // Get volume type icon
  const getVolumeTypeIcon = (volume: V1Volume) => {
    if (volume.configMap) return <FileText className="h-4 w-4" />;
    if (volume.secret) return <Key className="h-4 w-4" />;
    if (volume.persistentVolumeClaim) return <Database className="h-4 w-4" />;
    if (volume.emptyDir) return <HardDrive className="h-4 w-4" />;
    if (volume.hostPath) return <Server className="h-4 w-4" />;
    if (volume.csi || volume.awsElasticBlockStore || volume.gcePersistentDisk || volume.azureDisk) {
      return <Cloud className="h-4 w-4" />;
    }
    return <HardDrive className="h-4 w-4" />;
  };

  // Get volume type name
  const getVolumeType = (volume: V1Volume): string => {
    if (volume.configMap) return 'ConfigMap';
    if (volume.secret) return 'Secret';
    if (volume.persistentVolumeClaim) return 'PVC';
    if (volume.emptyDir) return 'EmptyDir';
    if (volume.hostPath) return 'HostPath';
    if (volume.csi) return `CSI (${volume.csi.driver})`;
    if (volume.awsElasticBlockStore) return 'AWS EBS';
    if (volume.gcePersistentDisk) return 'GCE PD';
    if (volume.azureDisk) return 'Azure Disk';
    if (volume.azureFile) return 'Azure File';
    
    // Look for other volume types
    const volumeTypes = [
      'downwardAPI', 'projected', 'iscsi', 'nfs', 'rbd', 'fc',
      'flexVolume', 'cinder', 'cephfs', 'flocker', 'glusterfs',
      'quobyte', 'storageos', 'portworxVolume', 'scaleIO', 'vsphereVolume'
    ];
    
    for (const type of volumeTypes) {
      if (volume[type as keyof V1Volume]) return type;
    }
    
    return 'Unknown';
  };

  // Render volume details based on type
  const renderVolumeDetails = (volume: V1Volume) => {
    if (volume.configMap) {
      return (
        <div className="space-y-2">
          <div className="text-sm">
            <span className="font-medium">Name:</span> {volume.configMap.name}
          </div>
          {volume.configMap.optional !== undefined && (
            <div className="text-sm">
              <span className="font-medium">Optional:</span> {String(volume.configMap.optional)}
            </div>
          )}
          {volume.configMap.items && volume.configMap.items.length > 0 && (
            <div className="mt-2">
              <div className="font-medium text-sm mb-1">Items:</div>
              <div className="space-y-1 ml-2">
                {volume.configMap.items.map((item, idx) => (
                  <div key={idx} className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded-md">
                    <div><span className="font-medium">Key:</span> {item.key}</div>
                    <div><span className="font-medium">Path:</span> {item.path}</div>
                    {item.mode !== undefined && (
                      <div><span className="font-medium">Mode:</span> {item.mode}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (volume.secret) {
      return (
        <div className="space-y-2">
          <div className="text-sm">
            <span className="font-medium">Name:</span> {volume.secret.secretName}
          </div>
          {volume.secret.optional !== undefined && (
            <div className="text-sm">
              <span className="font-medium">Optional:</span> {String(volume.secret.optional)}
            </div>
          )}
          {volume.secret.defaultMode !== undefined && (
            <div className="text-sm">
              <span className="font-medium">Default Mode:</span> {volume.secret.defaultMode}
            </div>
          )}
          {volume.secret.items && volume.secret.items.length > 0 && (
            <div className="mt-2">
              <div className="font-medium text-sm mb-1">Items:</div>
              <div className="space-y-1 ml-2">
                {volume.secret.items.map((item, idx) => (
                  <div key={idx} className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded-md">
                    <div><span className="font-medium">Key:</span> {item.key}</div>
                    <div><span className="font-medium">Path:</span> {item.path}</div>
                    {item.mode !== undefined && (
                      <div><span className="font-medium">Mode:</span> {item.mode}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (volume.persistentVolumeClaim) {
      return (
        <div className="space-y-2">
          <div className="text-sm">
            <span className="font-medium">Claim Name:</span> {volume.persistentVolumeClaim.claimName}
          </div>
          {volume.persistentVolumeClaim.readOnly !== undefined && (
            <div className="text-sm">
              <span className="font-medium">Read Only:</span> {String(volume.persistentVolumeClaim.readOnly)}
            </div>
          )}
        </div>
      );
    }

    if (volume.emptyDir) {
      return (
        <div className="space-y-2">
          <div className="text-sm">
            <span className="font-medium">Medium:</span> {volume.emptyDir.medium || 'Default'}
          </div>
          {volume.emptyDir.sizeLimit && (
            <div className="text-sm">
              <span className="font-medium">Size Limit:</span> {volume.emptyDir.sizeLimit}
            </div>
          )}
        </div>
      );
    }

    if (volume.hostPath) {
      return (
        <div className="space-y-2">
          <div className="text-sm">
            <span className="font-medium">Path:</span> {volume.hostPath.path}
          </div>
          {volume.hostPath.type && (
            <div className="text-sm">
              <span className="font-medium">Type:</span> {volume.hostPath.type}
            </div>
          )}
        </div>
      );
    }

    if (volume.csi) {
      return (
        <div className="space-y-2">
          <div className="text-sm">
            <span className="font-medium">Driver:</span> {volume.csi.driver}
          </div>
          {volume.csi.fsType && (
            <div className="text-sm">
              <span className="font-medium">Filesystem Type:</span> {volume.csi.fsType}
            </div>
          )}
          {volume.csi.readOnly !== undefined && (
            <div className="text-sm">
              <span className="font-medium">Read Only:</span> {String(volume.csi.readOnly)}
            </div>
          )}
          {volume.csi.volumeAttributes && Object.keys(volume.csi.volumeAttributes).length > 0 && (
            <div className="mt-2">
              <div className="font-medium text-sm mb-1">Volume Attributes:</div>
              <div className="space-y-1 ml-2">
                {Object.entries(volume.csi.volumeAttributes).map(([key, value], idx) => (
                  <div key={idx} className="text-xs">
                    <span className="font-medium">{key}:</span> {value}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (volume.downwardAPI) {
      return (
        <div className="space-y-2">
          {volume.downwardAPI.defaultMode !== undefined && (
            <div className="text-sm">
              <span className="font-medium">Default Mode:</span> {volume.downwardAPI.defaultMode}
            </div>
          )}
          {volume.downwardAPI.items && volume.downwardAPI.items.length > 0 && (
            <div className="mt-2">
              <div className="font-medium text-sm mb-1">Items:</div>
              <div className="space-y-1 ml-2">
                {volume.downwardAPI.items.map((item, idx) => (
                  <div key={idx} className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded-md">
                    <div><span className="font-medium">Path:</span> {item.path}</div>
                    {item.fieldRef && (
                      <div><span className="font-medium">Field Ref:</span> {item.fieldRef.fieldPath}</div>
                    )}
                    {item.resourceFieldRef && (
                      <div>
                        <div><span className="font-medium">Resource:</span> {item.resourceFieldRef.resource}</div>
                        {item.resourceFieldRef.containerName && (
                          <div><span className="font-medium">Container:</span> {item.resourceFieldRef.containerName}</div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (volume.projected) {
      return (
        <div className="space-y-2">
          {volume.projected.defaultMode !== undefined && (
            <div className="text-sm">
              <span className="font-medium">Default Mode:</span> {volume.projected.defaultMode}
            </div>
          )}
          {volume.projected.sources && volume.projected.sources.length > 0 && (
            <div className="mt-2">
              <div className="font-medium text-sm mb-1">Sources:</div>
              <div className="space-y-2 ml-2">
                {volume.projected.sources.map((source, idx) => (
                  <div key={idx} className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded-md">
                    {source.secret && (
                      <div>
                        <div className="font-medium">Secret:</div>
                        <div className="ml-2"><span className="font-medium">Name:</span> {source.secret.name}</div>
                      </div>
                    )}
                    {source.configMap && (
                      <div>
                        <div className="font-medium">ConfigMap:</div>
                        <div className="ml-2"><span className="font-medium">Name:</span> {source.configMap.name}</div>
                      </div>
                    )}
                    {source.downwardAPI && (
                      <div>
                        <div className="font-medium">DownwardAPI</div>
                      </div>
                    )}
                    {source.serviceAccountToken && (
                      <div>
                        <div className="font-medium">ServiceAccountToken</div>
                        <div className="ml-2"><span className="font-medium">Path:</span> {source.serviceAccountToken.path}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    // Generic fallback for other volume types
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400">
        Details not available for this volume type.
      </div>
    );
  };

  // Get badge color based on volume type
  const getVolumeTypeBadgeColor = (volumeType: string): string => {
    switch (volumeType) {
      case 'ConfigMap':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      case 'Secret':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
      case 'PVC':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      case 'EmptyDir':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
      case 'HostPath':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
      default:
        if (volumeType.startsWith('CSI')) {
          return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300';
        }
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  if (!volumes || volumes.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-800/50 bg-white dark:bg-transparent p-4 mb-6">
      <h2 className="text-lg font-medium mb-4">Volumes</h2>
      <div className="space-y-4">
        {volumes.map((volume) => {
          const volumeType = getVolumeType(volume);
          const isExpanded = expandedVolumes[volume.name] || false;
          
          return (
            <div 
              key={volume.name}
              className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden"
            >
              <div 
                className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-transparent cursor-pointer"
                onClick={() => toggleVolumeExpansion(volume.name)}
              >
                <div className="flex items-center gap-2">
                  <div>{getVolumeTypeIcon(volume)}</div>
                  <span className="font-medium">{volume.name}</span>
                  <Badge
                    variant="outline"
                    className={`${getVolumeTypeBadgeColor(volumeType)}`}
                  >
                    {volumeType}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="p-1 h-8 w-8"
                >
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>
              
              {isExpanded && (
                <div className="p-4 bg-white dark:bg-transparent">
                  {renderVolumeDetails(volume)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default VolumeViewer;