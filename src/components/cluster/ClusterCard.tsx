import React, { useCallback, memo } from 'react';
import { Pin, Trash2, Edit3, Unplug } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import KUBERNETES_LOGO from '@/assets/kubernetes-blue.png';
import { AWS_PROVIDER, AWS_PROVIDER_DARK, AZURE_PROVIDER, DOCKER_PROVIDER, GCP_PROVIDER, MINIKUBE_PROVIDER } from '@/assets/providers';
import ClusterHealth from '@/components/custom/clusterhealth/clusterhealth.component';
import ClusterInfoTooltip from './ClusterInfoTooltip';

// Interface for our cluster UI data
export interface ClusterItem {
  id: string;
  name: string;
  description: string;
  type: 'kind' | 'docker' | 'aws' | 'local' | 'gcp' | 'azure' | 'civo' | 'linode' | 'digitalocean' | 'orcale' | 'minikube';
}

// Memoized ClusterIcon component
const ClusterIcon = memo<{ type: ClusterItem['type']; theme?: string }>(({ type, theme }) => {
  const iconProps = { className: 'h-7 w-7' };

  switch (type) {
    case 'kind':
      return <img {...iconProps} src={KUBERNETES_LOGO} alt="Kubernetes logo" />;
    case 'docker':
      return <img {...iconProps} src={DOCKER_PROVIDER} alt="Docker logo" />;
    case 'minikube':
      return <img {...iconProps} src={MINIKUBE_PROVIDER} alt="Minikube logo" />;
    case 'aws':
      return <img {...iconProps} src={theme === 'dark' ? AWS_PROVIDER_DARK : AWS_PROVIDER} alt="AWS logo" />;
    case 'gcp':
      return <img {...iconProps} src={GCP_PROVIDER} alt="GCP logo" />;
    case 'azure':
      return <img {...iconProps} src={AZURE_PROVIDER} alt="Azure logo" />;
    default:
      return <img {...iconProps} src={KUBERNETES_LOGO} alt="Kubernetes logo" />;
  }
});

ClusterIcon.displayName = 'ClusterIcon';

// Memoized ClusterCard component
const ClusterCard = memo<{
  cluster: ClusterItem;
  isPinned?: boolean;
  isSelected: boolean;
  onContextMenu: (e: React.MouseEvent, clusterId: string, isPinned: boolean) => void;
  onClusterClick: (clusterId: string) => void;
  onConnect: (clusterId: string) => void;
  onRename: (clusterId: string) => void;
  onDelete: (clusterId: string) => void;
  onPin: (clusterId: string) => void;
  onUnpin: (clusterId: string) => void;
  viewMode: 'grid' | 'list' | 'tree';
  theme?: string;
  onHealthStatusChange: (clusterId: string, status: 'ok' | 'bad_gateway' | 'loading') => void;
  contexts?: any[]; // KubeContext[]
}>(({ cluster, isPinned = false, isSelected, onContextMenu, onClusterClick, onConnect, onRename, onDelete, onPin, onUnpin, viewMode, theme, onHealthStatusChange, contexts = [] }) => {
  // Handle double-click to immediately connect
  const handleDoubleClick = useCallback(() => {
    onConnect(cluster.id);
  }, [onConnect, cluster.id]);

  const handleClick = useCallback(() => {
    onClusterClick(cluster.id);
  }, [onClusterClick, cluster.id]);

  const handleRightClick = useCallback((e: React.MouseEvent) => {
    onContextMenu(e, cluster.id, isPinned);
  }, [onContextMenu, cluster.id, isPinned]);

  const handleConnectClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onConnect(cluster.id);
  }, [onConnect, cluster.id]);

  const handleRenameClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onRename(cluster.id);
  }, [onRename, cluster.id]);

  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(cluster.id);
  }, [onDelete, cluster.id]);

  const handlePinClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPinned) {
      onUnpin(cluster.id);
    } else {
      onPin(cluster.id);
    }
  }, [isPinned, onPin, onUnpin, cluster.id]);

  // Determine if we need to truncate the text
  const isTruncatedName = cluster.name.length > 35;
  const isTruncatedDescription = cluster.description.length > 35;

  const displayName = isTruncatedName ? cluster.name.slice(0, 35) + '...' : cluster.name;
  const displayDescription = isTruncatedDescription ? cluster.description.slice(0, 35) + '...' : cluster.description;

  return (
    <ClusterInfoTooltip cluster={cluster} contexts={contexts} theme={theme}>
      <div
        className={`relative rounded-lg p-1 flex items-center gap-4 cursor-pointer transition-colors
          ${isSelected
            ? 'bg-gray-200 dark:bg-gray-800/20 border-r-2 border-blue-500'
            : 'hover:bg-gray-200 dark:hover:bg-gray-800/50 border-2 border-transparent'}`}
        onContextMenu={handleRightClick}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
      <ClusterHealth clusterId={cluster.id} onHealthStatusChange={onHealthStatusChange} />
      <div className="w-10 h-10 rounded-xl dark:bg-gray-700/30 flex items-center justify-center text-white">
        <ClusterIcon type={cluster.type} theme={theme} />
      </div>
      <div className="flex-1">
        <h3
          className={`text-md font-medium ${isSelected ? 'text-blue-700 dark:text-blue-400' : 'dark:text-white'}`}
        >
          {displayName}
        </h3>

        <p className="dark:text-gray-400 text-xs">
          {displayDescription}
        </p>
      </div>

      {/* Action Icons - Only show in list/tree view and when selected */}
      {(viewMode === 'list' || viewMode === 'tree') && isSelected && (
        <div className="flex items-center gap-2 ml-auto">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleConnectClick}
                  className="p-1.5 rounded text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  <Unplug size={16} />
                </button>
              </TooltipTrigger>
              <TooltipContent className='p-1'>
                <p>Connect</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handlePinClick}
                  className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  <Pin size={16} className={`text-gray-600 dark:text-gray-400 ${isPinned ? '-rotate-45' : 'rotate-45'}`} />
                </button>
              </TooltipTrigger>
              <TooltipContent className='p-1'>
                <p>{isPinned ? 'Unpin' : 'Pin'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleRenameClick}
                  className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  <Edit3 size={16} className="text-gray-600 dark:text-gray-400" />
                </button>
              </TooltipTrigger>
              <TooltipContent className='p-1'>
                <p>Rename</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleDeleteClick}
                  className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-red-900/20 transition-colors"
                >
                  <Trash2 size={16} className="text-red-500" />
                </button>
              </TooltipTrigger>
              <TooltipContent  className='p-1'>
                <p>Delete</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
      </div>
    </ClusterInfoTooltip>
  );
});

ClusterCard.displayName = 'ClusterCard';

export default ClusterCard;