import React, { useMemo } from 'react';
import { TreeProvider, TreeView, TreeNode, TreeNodeTrigger, TreeNodeContent, TreeExpander, TreeIcon, TreeLabel } from '@/components/ui/tree';
import { Folder } from 'lucide-react';
import ClusterCard, { ClusterItem } from './ClusterCard';
import { SiKubernetes } from '@icons-pack/react-simple-icons';

interface ClusterTreeViewProps {
  clusters: ClusterItem[];
  contexts: any[]; // KubeContext[]
  pinnedClusterIds: Set<string>;
  selectedClusterId: string | null;
  onContextMenu: (e: React.MouseEvent, clusterId: string, isPinned: boolean) => void;
  onClusterClick: (clusterId: string) => void;
  onConnect: (clusterId: string) => void;
  onRename: (clusterId: string) => void;
  onDelete: (clusterId: string) => void;
  onPin: (clusterId: string) => void;
  onUnpin: (clusterId: string) => void;
  theme?: string;
  onHealthStatusChange: (clusterId: string, status: 'ok' | 'bad_gateway' | 'loading') => void;
}

const ClusterTreeView: React.FC<ClusterTreeViewProps> = ({
  clusters,
  contexts,
  pinnedClusterIds,
  selectedClusterId,
  onContextMenu,
  onClusterClick,
  onConnect,
  onRename,
  onDelete,
  onPin,
  onUnpin,
  theme,
  onHealthStatusChange
}) => {
  // Group clusters by their kubeconfig source
  const groupedClusters = useMemo(() => {
    const groups = new Map<string, { contexts: any[], clusters: ClusterItem[] }>();

    contexts.forEach((context) => {
      const kubeconfigPath = context.meta_data.origin.kubeconfig;
      const cluster = clusters.find(c => c.id === context.name);

      if (!groups.has(kubeconfigPath)) {
        groups.set(kubeconfigPath, { contexts: [], clusters: [] });
      }

      groups.get(kubeconfigPath)!.contexts.push(context);
      if (cluster) {
        groups.get(kubeconfigPath)!.clusters.push(cluster);
      }
    });

    return Array.from(groups.entries()).map(([path, data]) => ({
      path,
      displayName: path.split('/').pop() || path,
      fullPath: path,
      contexts: data.contexts,
      clusters: data.clusters
    }));
  }, [clusters, contexts]);

  return (
    <TreeProvider
      className="w-full"
      defaultExpandedIds={groupedClusters.map(group => group.path)}
      showLines={true}
      showIcons={true}
      selectable={false}
    >
      <TreeView className="w-full pb-10 max-h-96 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-700/30 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">
        {groupedClusters.map((group) => (
          <TreeNode key={group.path} nodeId={group.path}>
            <TreeNodeTrigger className='py-2'>
              <TreeExpander hasChildren={group.clusters.length > 0} />
              <TreeIcon
                hasChildren={group.clusters.length > 0}
                icon={group.clusters.length > 0 ? <SiKubernetes className="h-4 w-4" /> : <Folder className="h-4 w-4" />}
              />
              <TreeLabel className="font-medium text-sm">
                {group.displayName}
                <span className="ml-2 text-xs text-muted-foreground">
                  ({group.clusters.length} {group.clusters.length === 1 ? 'context' : 'contexts'})
                </span>
              </TreeLabel>
            </TreeNodeTrigger>
            <TreeNodeContent hasChildren={group.clusters.length > 0}>
              <div className="pl-4 space-y-1">
                {group.clusters.map((cluster) => (
                  <div key={cluster.id} className="ml-4">
                    <ClusterCard
                      cluster={cluster}
                      isPinned={pinnedClusterIds.has(cluster.id)}
                      isSelected={selectedClusterId === cluster.id}
                      onContextMenu={onContextMenu}
                      onClusterClick={onClusterClick}
                      onConnect={onConnect}
                      onRename={onRename}
                      onDelete={onDelete}
                      onPin={onPin}
                      onUnpin={onUnpin}
                      viewMode="list"
                      theme={theme}
                      onHealthStatusChange={onHealthStatusChange}
                      contexts={contexts}
                    />
                  </div>
                ))}
              </div>
            </TreeNodeContent>
          </TreeNode>
        ))}
      </TreeView>
    </TreeProvider>
  );
};

export default ClusterTreeView;