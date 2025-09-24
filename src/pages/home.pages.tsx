import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { Search, ArrowRight, Grid, List, Pin, Trash2, Link, AlignVerticalJustifyEnd, RefreshCw, Edit3, Settings2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import LOGO from '@/assets/logo.png';
import KUBERNETES_LOGO from '@/assets/kubernetes-blue.png';
import { useCluster } from '@/contexts/clusterContext';
import { AWS_PROVIDER, AWS_PROVIDER_DARK, AZURE_PROVIDER, DOCKER_PROVIDER, GCP_PROVIDER, KIND_PROVIDER, MINIKUBE_PROVIDER } from '@/assets/providers';
import { DeleteContextDialog, RenameContextDialog, ProvisionDrawer } from '@/components/custom';
import AddKubeConfigDialog from '@/components/custom/kubeconfig/addkubeconfig.component';
import { useTheme } from 'next-themes';
import { toast } from '@/hooks/use-toast';
import { deleteContext } from '@/api/cluster';

// Interface for our cluster UI data
interface ClusterItem {
  id: string;
  name: string;
  description: string;
  type: 'kind' | 'docker' | 'aws' | 'local' | 'gcp' | 'azure' | 'civo' | 'linode' | 'digitalocean' | 'orcale' | 'minikube';
}

// Interface for context menu position
interface ContextMenuPosition {
  x: number;
  y: number;
  visible: boolean;
  clusterId: string | null;
  isPinned: boolean;
}

const STORAGE_KEYS = {
  PINNED_CLUSTERS: 'pinned-clusters',
  VIEW_MODE: 'view-mode'
};

// Helper function to determine cluster type from context name - memoized
const determineClusterType = (name: string): ClusterItem['type'] => {
  if (name.includes('kind')) return 'kind';
  if (name.includes('minikube')) return 'minikube';
  if (name.includes('gke')) return 'gcp';
  if (name.includes('aks')) return 'azure';
  if (name.includes('docker')) return 'docker';
  if (name.includes('aws')) return 'aws';
  return 'local';
};

// Memoized ClusterIcon component
const ClusterIcon = memo<{ type: ClusterItem['type']; theme?: string }>(({ type, theme }) => {
  const iconProps = { className: 'h-10 w-10' };

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
  theme?: string;
}>(({ cluster, isPinned = false, isSelected, onContextMenu, onClusterClick, onConnect, theme }) => {
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

  // Determine if we need to truncate the text
  const isTruncatedName = cluster.name.length > 35;
  const isTruncatedDescription = cluster.description.length > 35;

  const displayName = isTruncatedName ? cluster.name.slice(0, 35) + '...' : cluster.name;
  const displayDescription = isTruncatedDescription ? cluster.description.slice(0, 35) + '...' : cluster.description;

  return (
    <div
      className={`rounded-lg p-4 flex items-center gap-4 cursor-pointer transition-colors
        ${isSelected
          ? 'bg-gray-200 dark:bg-gray-800/20 border-r-2 border-blue-500'
          : 'hover:bg-gray-200 dark:hover:bg-gray-800/50 border-2 border-transparent'}`}
      onContextMenu={handleRightClick}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white">
        <ClusterIcon type={cluster.type} theme={theme} />
      </div>
      <div className="flex-1">
        <h3
          className={`font-medium ${isSelected ? 'text-blue-700 dark:text-blue-400' : 'dark:text-white'}`}
        >
          {displayName}
        </h3>

        {isTruncatedDescription ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="dark:text-gray-400 text-sm">
                  {displayDescription}
                </p>
              </TooltipTrigger>
              <TooltipContent className="bg-white dark:bg-[#0B0D13]/30 backdrop-blur-md border border-gray-300 dark:border-gray-800/60 p-3 rounded-md shadow-lg">
                <div className="flex items-center gap-2 mb-2">
                  <ClusterIcon type={cluster.type} theme={theme} />
                </div>
                <div className="text-gray-700 dark:text-gray-300">
                  <div className="mb-1">
                    <span className="font-semibold">Name: </span>
                    <span>{cluster.name}</span>
                  </div>
                  <div className="mb-1">
                    <span className="font-semibold">Context: </span>
                    <span>{cluster.description}</span>
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <p className="dark:text-gray-400 text-sm">
            {displayDescription}
          </p>
        )}
      </div>
    </div>
  );
});

ClusterCard.displayName = 'ClusterCard';

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [isReloading, setIsReloading] = useState(false);
  const { contexts, currentContext, loading: isContextsLoading, error: contextsError, refreshContexts, setCurrentContext, refreshInterval } = useCluster();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [contextToDelete, setContextToDelete] = useState<string | null>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [contextToRename, setContextToRename] = useState<string | null>(null);
  const { theme } = useTheme();
  const [isProvisionDrawerOpen, setIsProvisionDrawerOpen] = useState(false);
  const [isAddKubeConfigOpen, setIsAddKubeConfigOpen] = useState(false);

  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    // Load view mode from localStorage
    const savedViewMode = localStorage.getItem(STORAGE_KEYS.VIEW_MODE);
    return (savedViewMode as 'grid' | 'list') || 'grid';
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenuPosition>({
    x: 0,
    y: 0,
    visible: false,
    clusterId: null,
    isPinned: false
  });

  // Track selected cluster
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(
    currentContext ? currentContext.name : null
  );

  // Initial states for clusters with localStorage fallback
  const [pinnedClusters, setPinnedClusters] = useState<ClusterItem[]>(() => {
    const savedPinnedClusters = localStorage.getItem(STORAGE_KEYS.PINNED_CLUSTERS);
    return savedPinnedClusters
      ? JSON.parse(savedPinnedClusters)
      : [];
  });

  // Memoize cluster items creation to prevent unnecessary recalculations
  const clusterItems = useMemo(() => {
    return contexts.map((ctx) => ({
      id: ctx.name,
      name: ctx.name,
      description: `${ctx.kubeContext.cluster}`,
      type: determineClusterType(ctx.kubeContext.user)
    }));
  }, [contexts]);

  // Memoize pinned cluster IDs
  const pinnedClusterIds = useMemo(() => {
    return new Set(pinnedClusters.map(c => c.id));
  }, [pinnedClusters]);

  // Memoize available clusters
  const availableClusters = useMemo(() => {
    return clusterItems.filter(item => !pinnedClusterIds.has(item.id));
  }, [clusterItems, pinnedClusterIds]);

  // Memoize filtered clusters
  const filteredClusters = useMemo(() => {
    if (!searchQuery) return availableClusters;

    const query = searchQuery.toLowerCase();
    return availableClusters.filter(cluster =>
      cluster.name.toLowerCase().includes(query) ||
      cluster.description.toLowerCase().includes(query)
    );
  }, [availableClusters, searchQuery]);

  // Memoize all clusters
  const allClusters = useMemo(() => {
    return [...pinnedClusters, ...availableClusters];
  }, [pinnedClusters, availableClusters]);

  // Memoize selected cluster
  const selectedCluster = useMemo(() => {
    return allClusters.find(cluster => cluster.id === selectedClusterId);
  }, [allClusters, selectedClusterId]);

  const hasSelectedCluster = selectedClusterId !== null;

  // Save state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.PINNED_CLUSTERS, JSON.stringify(pinnedClusters));
  }, [pinnedClusters]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.VIEW_MODE, viewMode);
  }, [viewMode]);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenu.visible) {
        setContextMenu(prev => ({ ...prev, visible: false }));
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [contextMenu.visible]);

  // Memoized refresh interval effect
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        await refreshContexts();
      } catch (err) {
        console.error('Failed to refresh contexts:', err);
      }
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [refreshInterval, refreshContexts]);

  // Memoized callback functions
  const handleConnect = useCallback((clusterId: string) => {
    // Find the KubeContext that corresponds to this clusterId (which is the context name)
    const contextToConnect = contexts.find(ctx => ctx.name === clusterId);

    if (contextToConnect) {
      // Update current context in the context provider
      setCurrentContext(contextToConnect);

      // Navigate to dashboard
      navigate(`/dashboard?cluster=${clusterId}`);
    }
  }, [contexts, setCurrentContext, navigate]);

  const handleReload = useCallback(async () => {
    setIsReloading(true);
    await refreshContexts();
    setIsReloading(false);
  }, [refreshContexts]);

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, clusterId: string, isPinned: boolean) => {
    e.preventDefault();
    // Set context menu position and visibility
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      visible: true,
      clusterId,
      isPinned
    });
  }, []);

  // New function to handle cluster selection
  const handleClusterClick = useCallback((clusterId: string) => {
    setSelectedClusterId(clusterId);
  }, []);

  // Handle pin action
  const handlePin = useCallback(() => {
    if (contextMenu.clusterId) {
      const clusterToPin = availableClusters.find(c => c.id === contextMenu.clusterId);
      if (clusterToPin) {
        // Add to pinned clusters
        setPinnedClusters(prev => [...prev, clusterToPin]);
      }
      // Close context menu
      setContextMenu(prev => ({ ...prev, visible: false }));
    }
  }, [contextMenu.clusterId, availableClusters]);

  // Handle unpin action
  const handleUnpin = useCallback(() => {
    if (contextMenu.clusterId) {
      // Remove from pinned clusters
      setPinnedClusters(prev => prev.filter(c => c.id !== contextMenu.clusterId));
      // Close context menu
      setContextMenu(prev => ({ ...prev, visible: false }));
    }
  }, [contextMenu.clusterId]);

  // Handle delete context action
  const handleDeleteContext = useCallback(async () => {
    if (contextMenu.clusterId) {
      // Find the context to check its source
      const contextToDelete = contexts.find(ctx => ctx.name === contextMenu.clusterId);

      if (!contextToDelete) {
        toast({
          title: "Error",
          description: "Context not found",
          variant: "destructive"
        });
        return;
      }

      // If source is not 'kubeconfig', delete directly without dialog
      if (contextToDelete.meta_data.source !== 'kubeconfig') {
        try {
          await deleteContext(contextMenu.clusterId, false);

          // If deleting the selected cluster, clear selection
          if (contextMenu.clusterId === selectedClusterId) {
            setSelectedClusterId(null);
          }

          // Remove from pinned clusters if it's there
          const isPinned = pinnedClusters.some(c => c.id === contextMenu.clusterId);
          if (isPinned) {
            setPinnedClusters(prev => prev.filter(c => c.id !== contextMenu.clusterId));
          }

          // Refresh contexts to update the UI
          await refreshContexts();

          toast({
            title: "Success",
            description: `Context "${contextMenu.clusterId}" deleted successfully`
          });
        } catch (error) {
          toast({
            title: "Error",
            description: `Failed to delete context: ${error instanceof Error ? error.message : 'Unknown error'}`,
            variant: "destructive"
          });
        }
      } else {
        // For 'kubeconfig' source, show dialog
        setContextToDelete(contextMenu.clusterId);
        setDeleteDialogOpen(true);
      }

      setContextMenu(prev => ({ ...prev, visible: false }));
    }
  }, [contextMenu.clusterId, contexts, selectedClusterId, pinnedClusters, setPinnedClusters, refreshContexts, toast]);

  const handleDeleteSuccess = useCallback((deletedContextName: string) => {
    // If deleting the selected cluster, clear selection
    if (deletedContextName === selectedClusterId) {
      setSelectedClusterId(null);
    }

    // Find if the context is pinned or not
    const isPinned = pinnedClusters.some(c => c.id === deletedContextName);

    if (isPinned) {
      // Remove from pinned clusters
      setPinnedClusters(prev => prev.filter(c => c.id !== deletedContextName));
    }

    // Refresh contexts to update the UI
    refreshContexts();

    // Close the dialog
    setDeleteDialogOpen(false);
    setContextToDelete(null);
  }, [selectedClusterId, pinnedClusters, setPinnedClusters, refreshContexts]);

  // Handle rename context action
  const handleRenameContext = useCallback(() => {
    if (contextMenu.clusterId) {
      setContextToRename(contextMenu.clusterId);
      setRenameDialogOpen(true);
      setContextMenu(prev => ({ ...prev, visible: false }));
    }
  }, [contextMenu.clusterId]);

  const handleRenameSuccess = useCallback((oldName: string, newName: string) => {
    // If renaming the selected cluster, update selection
    if (oldName === selectedClusterId) {
      setSelectedClusterId(newName);
    }

    // Update pinned clusters if the renamed context is pinned
    setPinnedClusters(prev =>
      prev.map(cluster =>
        cluster.id === oldName
          ? { ...cluster, id: newName, name: newName }
          : cluster
      )
    );

    // Refresh contexts to update the UI
    refreshContexts();

    // Close the dialog
    setRenameDialogOpen(false);
    setContextToRename(null);
  }, [selectedClusterId, setPinnedClusters, refreshContexts]);

  const handleMainConnect = useCallback(() => {
    if (selectedClusterId) {
      handleConnect(selectedClusterId);
    } else {
      // If no cluster is selected, use the first available one
      const defaultClusterId = pinnedClusters[0]?.id || availableClusters[0]?.id;
      if (defaultClusterId) handleConnect(defaultClusterId);
    }
  }, [selectedClusterId, handleConnect, pinnedClusters, availableClusters]);

  const handleContextMenuConnect = useCallback(() => {
    if (contextMenu.clusterId) {
      handleConnect(contextMenu.clusterId);
      setContextMenu(prev => ({ ...prev, visible: false }));
    }
  }, [contextMenu.clusterId, handleConnect]);

  // Context Menu Component - memoized
  const ContextMenu = memo(() => {
    if (!contextMenu.visible) return null;

    return (
      <div
        className="absolute bg-white dark:bg-[#0B0D13]/30 backdrop-blur-md shadow-lg rounded-lg z-50 border border-gray-200 dark:border-gray-800"
        style={{
          top: `${contextMenu.y}px`,
          left: `${contextMenu.x}px`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {contextMenu.isPinned ? (
          <div
            className="px-4 py-2 flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-800/50 cursor-pointer rounded-sm"
            onClick={handleUnpin}
          >
            <Pin size={16} className='rotate-45' />
            <span>Unpin</span>
          </div>
        ) : (
          <div
            className="px-4 py-2 flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-800/50 cursor-pointer rounded-sm"
            onClick={handlePin}
          >
            <Pin size={16} className='-rotate-45' />
            <span>Pin</span>
          </div>
        )}

        <div
          className="px-4 py-2 flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-800/50 cursor-pointer rounded-sm"
          onClick={handleContextMenuConnect}
        >
          <Link size={16} />
          <span>Connect</span>
        </div>

        <div
          className="px-4 py-2 flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-800/50 cursor-pointer rounded-sm"
          onClick={handleRenameContext}
        >
          <Edit3 size={16} />
          <span>Rename</span>
        </div>

        <div
          className="px-4 py-2 flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-800/50 cursor-pointer rounded-sm text-red-500"
          onClick={handleDeleteContext}
        >
          <Trash2 size={16} />
          <span>Delete context</span>
        </div>
      </div>
    );
  });

  ContextMenu.displayName = 'ContextMenu';

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        {/* Left side content with logo and connect button */}

        <div className='flex flex-col lg:flex-row mt-20 min-h-80'>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-12 lg:w-1/2 ">
            <div className="mb-6 sm:mb-0">
              <div className="flex items-center gap-4 mb-4">
                <div className="rounded-md flex items-center justify-center">
                  <img className='h-20' src={LOGO} alt="AgentKube logo" />
                </div>
                <h1 className="-ml-4 text-5xl font-bold">Agentkube</h1>
              </div>
              <p className="text-gray-800 dark:text-gray-400">
                {hasSelectedCluster
                  ? `Selected: ${selectedCluster?.name}`
                  : "Select one cluster to get started"}
              </p>

              <div className='flex gap-2 mt-6'>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button onClick={() => setIsAddKubeConfigOpen(true)}>
                        <Settings2 size={16} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="p-1">
                      <p>Load Kubeconfig</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Button
                  className={`flex items-center gap-2 
                  ${hasSelectedCluster
                      ? 'bg-blue-700 dark:bg-blue-800 hover:bg-blue-700 text-white'
                      : 'bg-gray-300 hover:bg-gray-300 text-gray-700 dark:bg-transparent dark:text-gray-300 dark:hover:bg-gray-600'}`}
                  onClick={handleMainConnect}
                  disabled={isContextsLoading || (!pinnedClusters.length && !availableClusters.length)}
                >
                  Connect
                  <ArrowRight size={16} />
                </Button>
                <Button
                  className="bg-blue-600 hover:bg-blue-700 flex items-center gap-2 text-black dark:text-black bg-[#54C895] dark:bg-[#54C895] dark:hover:bg-[#0E9F6E]"
                  onClick={() => {
                    toast({
                      title: "COMING SOON",
                      description: `The provisioning feature is yet to be implemented`,
                    })
                    // setIsProvisionDrawerOpen(true)
                  }}
                >
                  <AlignVerticalJustifyEnd size={16} />
                  Provision
                </Button>
              </div>
            </div>
          </div>

          {/* Pinned section */}
          <div className="mb-8 lg:w-1/2">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-medium flex items-center gap-2">
                Pinned <span className="text-gray-500">/</span>
              </h2>
            </div>
            <div className="space-y-2">
              {pinnedClusters.length > 0 ? (
                pinnedClusters.map(cluster => (
                  <ClusterCard
                    key={cluster.id}
                    cluster={cluster}
                    isPinned={true}
                    isSelected={selectedClusterId === cluster.id}
                    onContextMenu={handleContextMenu}
                    onClusterClick={handleClusterClick}
                    onConnect={handleConnect}
                    theme={theme}
                  />
                ))
              ) : (
                <p className="text-gray-500 dark:text-gray-400">No pinned clusters yet. Right-click on a cluster to pin it.</p>
              )}
            </div>
          </div>
        </div>

        {/* Search and view controls */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button
              className={`p-2 rounded-md ${viewMode === 'list' ? 'bg-gray-200 dark:bg-gray-700' : 'bg-transparent'}`}
              onClick={() => setViewMode('list')}
            >
              <List size={20} />
            </button>
            <button
              className={`p-2 rounded-md ${viewMode === 'grid' ? 'bg-gray-200 dark:bg-gray-700' : 'bg-transparent'}`}
              onClick={() => setViewMode('grid')}
            >
              <Grid size={20} />
            </button>
            <Button
              variant="outline"
              size="icon"
              className="flex-shrink-0 border-0 dark:bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800/40"
              onClick={handleReload}
              disabled={isReloading}
            >
              <RefreshCw size={18} className={isReloading ? "animate-spin" : ""} />
            </Button>
          </div>

          <div className="relative flex-1 max-w-md ml-4">
            <Input
              type="text"
              placeholder="Search cluster"
              className="w-full border border-gray-400 dark:ring:border-gray-700 dark:text-white"
              value={searchQuery}
              onChange={handleSearch}
            />
            <Search className="absolute right-3 top-2.5 text-gray-400" size={18} />
          </div>
        </div>

        {/* Available clusters */}
        {isContextsLoading ? (
          <div className="py-8 text-center">
            <p className="text-gray-500 dark:text-gray-400">Loading Kubernetes contexts...</p>
          </div>
        ) : contextsError ? (
          <div className="py-8 text-center">
            <p className="text-red-500">{contextsError}</p>
            <Button
              className="mt-4"
              onClick={handleReload}
            >
              Retry
            </Button>
          </div>
        ) : (
          <div className={`${viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-1 max-h-96 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-700/30 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50'}`}>
            {filteredClusters.length > 0 ? (
              filteredClusters.map(cluster => (
                <ClusterCard
                  key={cluster.id}
                  cluster={cluster}
                  isSelected={selectedClusterId === cluster.id}
                  onContextMenu={handleContextMenu}
                  onClusterClick={handleClusterClick}
                  onConnect={handleConnect}
                  theme={theme}
                />
              ))
            ) : (
              <div className="col-span-full py-8 text-center">
                <p className="text-gray-500 dark:text-gray-400">
                  {searchQuery ? 'No clusters match your search criteria.' : 'No available Kubernetes contexts found.'}
                </p>
              </div>
            )}
          </div>
        )}
        <DeleteContextDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          contextToDelete={contextToDelete}
          onDeleteSuccess={handleDeleteSuccess}
          onCancel={() => {
            setDeleteDialogOpen(false);
            setContextToDelete(null);
          }}
        />
        <RenameContextDialog
          open={renameDialogOpen}
          onOpenChange={setRenameDialogOpen}
          contextToRename={contextToRename}
          onRenameSuccess={handleRenameSuccess}
          onCancel={() => {
            setRenameDialogOpen(false);
            setContextToRename(null);
          }}
        />
        <ProvisionDrawer
          isOpen={isProvisionDrawerOpen}
          onClose={() => setIsProvisionDrawerOpen(false)}
        />
        <AddKubeConfigDialog
          open={isAddKubeConfigOpen}
          onOpenChange={setIsAddKubeConfigOpen}
          onFilesAdded={(paths) => {
            // Refresh contexts after adding new kubeconfig files
            refreshContexts();
          }}
        />
        {/* Context Menu */}
        <ContextMenu />
      </div>
    </div>
  );
};

export default HomePage;