import React from 'react';
import { ArgoApplication } from '@/types/argocd';
import { GitBranch, Package, Server, Activity, AlertCircle, CheckCircle2, Clock, RefreshCw, XCircle, CircleDashed } from 'lucide-react';
import { motion } from 'framer-motion';

interface ArgoApplicationCardProps {
  application: ArgoApplication;
  onClick?: () => void;
}

const ArgoApplicationCard: React.FC<ArgoApplicationCardProps> = ({ application, onClick }) => {
  const syncStatus = application.status?.sync?.status || 'Unknown';
  const healthStatus = application.status?.health?.status || 'Unknown';
  const automated = application.spec.syncPolicy?.automated !== undefined;
  const resourcesCount = application.status?.resources?.length || 0;

  const getSyncStatusColor = (status: string) => {
    switch (status) {
      case 'Synced':
        return 'text-green-500';
      case 'OutOfSync':
        return 'text-orange-500';
      default:
        return 'text-gray-500';
    }
  };

  const getSyncStatusIcon = (status: string) => {
    switch (status) {
      case 'Synced':
        return <CheckCircle2 className="h-4 w-4" />;
      case 'OutOfSync':
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <CircleDashed className="h-4 w-4" />;
    }
  };

  const getHealthStatusColor = (status: string) => {
    switch (status) {
      case 'Healthy':
        return 'text-green-500';
      case 'Progressing':
        return 'text-blue-500';
      case 'Degraded':
        return 'text-red-500';
      case 'Suspended':
        return 'text-yellow-500';
      case 'Missing':
        return 'text-gray-500';
      default:
        return 'text-gray-500';
    }
  };

  const getHealthStatusIcon = (status: string) => {
    switch (status) {
      case 'Healthy':
        return <CheckCircle2 className="h-4 w-4" />;
      case 'Progressing':
        return <RefreshCw className="h-4 w-4 animate-spin" />;
      case 'Degraded':
        return <XCircle className="h-4 w-4" />;
      case 'Suspended':
        return <Clock className="h-4 w-4" />;
      case 'Missing':
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <CircleDashed className="h-4 w-4" />;
    }
  };

  const formatTimestamp = (timestamp?: string) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      onClick={onClick}
      className="bg-gray-200/30 dark:bg-gray-800/20 rounded-lg p-4 hover:bg-gray-200/50 dark:hover:bg-gray-800/30 transition-colors cursor-pointer border border-transparent hover:border-blue-500/30"
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          <h3 className="text-base font-medium dark:text-white truncate">
            {application.metadata.name}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-gray-600 dark:text-gray-400">
              {application.spec.project}
            </span>
            {automated && (
              <span className="text-xs px-2 py-0.5 bg-blue-500/10 text-blue-500 rounded-full">
                Auto-sync
              </span>
            )}
          </div>
        </div>

        {/* Status Badges */}
        <div className="flex flex-col gap-1 items-end">
          <div className={`flex items-center gap-1 ${getSyncStatusColor(syncStatus)}`}>
            {getSyncStatusIcon(syncStatus)}
            <span className="text-xs font-medium">{syncStatus}</span>
          </div>
          <div className={`flex items-center gap-1 ${getHealthStatusColor(healthStatus)}`}>
            {getHealthStatusIcon(healthStatus)}
            <span className="text-xs font-medium">{healthStatus}</span>
          </div>
        </div>
      </div>

      {/* Repository Info */}
      <div className="space-y-2 mb-3">
        <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
          <GitBranch className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{application.spec.source.repoURL}</span>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
            <Package className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{application.spec.source.targetRevision}</span>
          </div>
          <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
            <Server className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{application.spec.destination.namespace}</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-between items-center pt-3 border-t border-gray-300/20 dark:border-gray-700/20">
        <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
          <Activity className="h-3 w-3" />
          <span>{resourcesCount} resources</span>
        </div>

        {application.status?.reconciledAt && (
          <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
            <Clock className="h-3 w-3" />
            <span>{formatTimestamp(application.status.reconciledAt)}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default ArgoApplicationCard;
