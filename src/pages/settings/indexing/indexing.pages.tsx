import React, { useState, useEffect } from 'react';
import {
  Info,
  RefreshCw,
  Trash2,
  Database,
  Clock,
  HardDrive,
  Activity,
  FileText
} from 'lucide-react';
import { useCluster } from '@/contexts/clusterContext';
import {
  listIndexedClusters,
  getIndexStatus,
  rebuildIndex,
  refreshIndex,
  deleteClusterIndex
} from '@/api/indexing';
import { IndexStatus } from '@/types/indexing';
import { useToast } from '@/hooks/use-toast';
import { SiKubernetes } from '@icons-pack/react-simple-icons';

interface ClusterIndexCardProps {
  clusterName: string;
  status: IndexStatus;
  onSync: () => void;
  onDelete: () => void;
  isSyncing: boolean;
}

const Indexing: React.FC = () => {
  const { contexts } = useCluster();
  const { toast } = useToast();
  const [clusterStatuses, setClusterStatuses] = useState<Map<string, IndexStatus>>(new Map());
  const [syncingClusters, setSyncingClusters] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Fetch index statuses for all clusters
  const fetchIndexStatuses = async () => {
    const statusMap = new Map<string, IndexStatus>();

    for (const context of contexts) {
      try {
        const status = await getIndexStatus(context.name);
        statusMap.set(context.name, status);

        // Remove from syncing set if operation is completed or if status is healthy
        if (status.currentOperation?.status === 'completed' ||
            (status.status === 'healthy' && !status.currentOperation) ||
            status.currentOperation?.status === 'error') {
          setSyncingClusters(prev => {
            const newSet = new Set(prev);
            newSet.delete(context.name);
            return newSet;
          });
        }
      } catch (error) {
        console.error(`Error fetching index status for ${context.name}:`, error);
        // Set a default not_indexed status if fetch fails
        statusMap.set(context.name, {
          cluster: context.name,
          status: 'not_indexed',
          message: 'Index not found for this cluster'
        });
      }
    }

    setClusterStatuses(statusMap);
    setLoading(false);
  };

  // Initial fetch
  useEffect(() => {
    fetchIndexStatuses();
  }, [contexts]);

  // Poll status every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchIndexStatuses();
    }, 10000);

    return () => clearInterval(interval);
  }, [contexts]);

  const handleSync = async (clusterName: string, status: IndexStatus) => {
    try {
      setSyncingClusters(prev => new Set(prev).add(clusterName));

      // Decide whether to rebuild or refresh
      const action = status.status === 'not_indexed' ? 'rebuild' : 'refresh';

      if (action === 'rebuild') {
        await rebuildIndex(clusterName, true);
        toast({
          title: "Index Creation Started",
          description: `Creating index for ${clusterName} in background...`,
        });
      } else {
        await refreshIndex(clusterName, true);
        toast({
          title: "Index Refresh Started",
          description: `Refreshing index for ${clusterName} in background...`,
        });
      }

      // Immediately fetch updated status
      setTimeout(() => {
        fetchIndexStatuses();
      }, 1000);
    } catch (error) {
      console.error(`Error syncing index for ${clusterName}:`, error);
      toast({
        title: "Sync Failed",
        description: error instanceof Error ? error.message : 'Failed to sync index',
        variant: "destructive",
      });
      setSyncingClusters(prev => {
        const newSet = new Set(prev);
        newSet.delete(clusterName);
        return newSet;
      });
    }
  };

  const handleDelete = async (clusterName: string) => {
    try {
      await deleteClusterIndex(clusterName);

      toast({
        title: "Index Deleted",
        description: `Index for ${clusterName} has been deleted`,
      });

      // Fetch updated status
      fetchIndexStatuses();
    } catch (error) {
      console.error(`Error deleting index for ${clusterName}:`, error);
      toast({
        title: "Delete Failed",
        description: error instanceof Error ? error.message : 'Failed to delete index',
        variant: "destructive",
      });
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit'
    }) + ', ' + date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'text-green-500';
      case 'indexing':
        return 'text-blue-500';
      case 'error':
        return 'text-red-500';
      case 'not_indexed':
        return 'text-gray-500';
      default:
        return 'text-gray-400';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'Healthy';
      case 'indexing':
        return 'Indexing...';
      case 'error':
        return 'Error';
      case 'not_indexed':
        return 'Not Indexed';
      default:
        return status;
    }
  };

  const ClusterIndexCard: React.FC<ClusterIndexCardProps> = ({
    clusterName,
    status,
    onSync,
    onDelete,
    isSyncing
  }) => {
    // Check if operation is still in progress (not completed or errored)
    const operationInProgress = status.currentOperation &&
      status.currentOperation.status !== 'completed' &&
      status.currentOperation.status !== 'error';

    const isIndexing = (status.status === 'indexing' || isSyncing) && operationInProgress;
    const hasIndex = status.status !== 'not_indexed';

    return (
      <div className="space-y-3 bg-gray-100 dark:bg-gray-800/20 border border-gray-200 dark:border-gray-700/30 p-2 rounded-lg">
        {/* Header with cluster name and actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-sm">
            <SiKubernetes className="w-5 h-5 text-gray-500" />
            <span className="text-gray-800 dark:text-white font-medium">{clusterName}</span>
            <span className={`${getStatusColor(status.status)}`}>
              ({getStatusText(status.status)})
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onSync}
              disabled={isIndexing}
              className="flex items-center space-x-2 px-3 py-1.5 text-sm text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isIndexing ? 'animate-spin' : ''}`} />
              <span>{hasIndex ? 'Sync' : 'Index'}</span>
            </button>
            {hasIndex && (
              <button
                onClick={onDelete}
                disabled={isIndexing}
                className="flex items-center space-x-2 px-3 py-1.5 text-sm text-red-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete</span>
              </button>
            )}
          </div>
        </div>


        {/* Stats */}
        {status.stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
            <div className="flex items-center space-x-2 text-sm">
              <FileText className="w-4 h-4 text-gray-500" />
              <div className='flex gap-1'>
                <div className="text-gray-500 dark:text-gray-400">Documents</div>
                <div className="text-gray-800 dark:text-white font-medium">
                  {status.stats.documentCount.toLocaleString()}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2 text-sm">
              <HardDrive className="w-4 h-4 text-gray-500" />
              <div className='flex gap-1'>
                <div className="text-gray-500 dark:text-gray-400">Size</div>
                <div className="text-gray-800 dark:text-white font-medium">
                  {status.stats.indexSize}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2 text-sm">
              <Clock className="w-4 h-4 text-gray-500" />
              <div className='flex gap-1'>
                <div className="text-gray-500 dark:text-gray-400">Last Indexed</div>
                <div className="text-gray-800 dark:text-white font-medium">
                  {formatDate(status.stats.lastIndexed)}
                </div>
              </div>
            </div>

            {status.sync && (
              <div className="flex items-center space-x-2 text-sm">
                <Activity className="w-4 h-4 text-green-500" />
                <div className='flex gap-1'>
                  <div className="text-gray-500 dark:text-gray-400">Events Synced</div>
                  <div className="text-gray-800 dark:text-white font-medium">
                    {status.sync.eventsProcessed.toLocaleString()}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Progress indicator for indexing */}
        {isIndexing && status.currentOperation && status.currentOperation.status === 'in_progress' && (
          <div className="space-y-1 pt-2">
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>Indexing in progress...</span>
              <span>{status.currentOperation.progress}%</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-1.5">
              <div
                className="bg-blue-500 h-1.5 rounded-full transition-all duration-300 animate-pulse"
                style={{ width: `${status.currentOperation.progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Error message */}
        {status.status === 'error' && status.error && (
          <div className="text-sm text-red-400 bg-red-500/10 p-2 rounded-md">
            {status.error}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="p-6 text-gray-300 min-h-screen">
        <div className="space-y-8">
          <div>
            <h1 className="text-4xl font-[Anton] uppercase text-gray-700/20 dark:text-gray-200/20 font-medium">
              Indexing
            </h1>
          </div>
          <div className="text-center text-gray-500 dark:text-gray-400">
            Loading cluster indices...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 text-gray-300 min-h-screen">
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-4xl font-[Anton] uppercase text-gray-700/20 dark:text-gray-200/20 font-medium">
            Indexing
          </h1>
        </div>

        {/* Info banner */}
        <div className="bg-blue-500/10 border border-blue-500/30 p-4 rounded-lg flex items-start space-x-3">
          <Info className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-gray-700 dark:text-gray-300">
            <p className="font-medium mb-1">About Resource Indexing</p>
            <p className="text-gray-600 dark:text-gray-400">
              Create search indices for your clusters to enable fast resource queries.
              Indices are stored locally in your application data directory and automatically
              stay in sync with cluster changes through real-time watchers.
            </p>
          </div>
        </div>

        {/* Kubernetes Resources Section */}
        <div className="space-y-4">
          {contexts.length === 0 ? (
            <div className="text-center text-gray-500 dark:text-gray-400 py-8">
              No clusters available. Add a cluster to enable indexing.
            </div>
          ) : (
            <div className="space-y-4">
              {contexts.map((context) => {
                const status = clusterStatuses.get(context.name) || {
                  cluster: context.name,
                  status: 'not_indexed' as const,
                  message: 'Loading...'
                };

                return (
                  <ClusterIndexCard
                    key={context.name}
                    clusterName={context.name}
                    status={status}
                    onSync={() => handleSync(context.name, status)}
                    onDelete={() => handleDelete(context.name)}
                    isSyncing={syncingClusters.has(context.name)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Indexing;
