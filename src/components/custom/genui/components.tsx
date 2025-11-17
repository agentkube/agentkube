import React from 'react';
import { Card, CardContent } from '@/components/ui/card';



// Image Vulnerability Summary component
interface VulnerabilitySummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  unknown?: number;
  total: number;
}

interface ScanResult {
  image: string;
  summary: VulnerabilitySummary;
  scanTime: string;
  status: string;
}

interface ImageVulnerabilitySummaryProps {
  results?: ScanResult[];
  success?: boolean;
}

const ImageVulnerabilitySummaryComponent = (
  props: ImageVulnerabilitySummaryProps
): JSX.Element => {
  const { results, success } = props;

  if (!success || !results || results.length === 0) {
    return <></>;
  }

  const scanResult = results[0]; // Show first result

  return (
    <div className="my-4 p-4 rounded-lg bg-transparent dark:bg-transparent border border-gray-300 dark:border-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xs uppercase font-medium text-gray-900 dark:text-gray-400">
            Image Vulnerability  Results
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-200 mt-1">
            {scanResult.image}
          </p>
        </div>
        {/* <button
          onClick={handleOpenDrawer}
          className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
        >
          View Details
          <ArrowUpRight className="w-4 h-4" />
        </button> */}
      </div>

      {/* Severity Cards */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {[
          { label: 'Critical', count: scanResult.summary.critical, severity: 'critical' },
          { label: 'High', count: scanResult.summary.high, severity: 'high' },
          { label: 'Medium', count: scanResult.summary.medium, severity: 'medium' },
          { label: 'Low', count: scanResult.summary.low, severity: 'low' }
        ].map(({ label, count, severity }) => (
          <Card key={label} className="bg-gray-50 dark:bg-transparent rounded-md border border-gray-200 dark:border-gray-800/50 shadow-none min-h-32">
            <CardContent className="py-2 px-2 flex flex-col h-full">
              <h2 className="text-sm uppercase font-medium text-gray-800 dark:text-gray-500 mb-auto">{label}</h2>
              <div className="mt-auto">
                <p className={`text-5xl font-light mb-1 ${
                  severity === 'critical' ? 'text-red-600 dark:text-red-400' :
                  severity === 'high' ? 'text-orange-600 dark:text-orange-400' :
                  severity === 'medium' ? 'text-yellow-600 dark:text-yellow-400' :
                  'text-blue-600 dark:text-blue-400'
                }`}>
                  {count}
                </p>
                <div className="w-full h-1 bg-gray-200 dark:bg-gray-800/30 rounded-[0.3rem] mt-1">
                  <div className={`h-1 rounded-[0.3rem] ${
                    severity === 'critical' ? 'bg-red-500 dark:bg-red-400' :
                    severity === 'high' ? 'bg-orange-500 dark:bg-orange-400' :
                    severity === 'medium' ? 'bg-yellow-500 dark:bg-yellow-400' :
                    'bg-blue-500 dark:bg-blue-400'
                  }`} style={{ width: '100%' }}></div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Footer Info */}
      <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-800">
        <span>Status: <span className="font-medium text-green-600 dark:text-green-400">{scanResult.status}</span></span>
        <span>Scanned: {new Date(scanResult.scanTime).toLocaleString()}</span>
        <span>Total: <span className="font-medium">{scanResult.summary.total} vulnerabilities</span></span>
      </div>
    </div>
  );
};

// ArgoCD Applications List component
import { GitBranch, Package, Server, Activity, AlertCircle, CheckCircle2, Clock, RefreshCw, XCircle, CircleDashed } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

interface ArgoApplication {
  metadata: {
    name: string;
    namespace: string;
  };
  spec: {
    project: string;
    source: {
      repoURL: string;
      path?: string;
      targetRevision?: string;
    };
    destination: {
      server?: string;
      namespace?: string;
    };
    syncPolicy?: {
      automated?: any;
    };
  };
  status?: {
    health?: {
      status: string;
    };
    sync?: {
      status: string;
    };
    resources?: any[];
    reconciledAt?: string;
  };
}

interface ArgoApplicationsListProps {
  applications?: ArgoApplication[];
  total_count?: number;
  success?: boolean;
}

const ArgoApplicationsListComponent: React.FC<ArgoApplicationsListProps> = ({
  applications,
  total_count,
  success
}) => {
  const navigate = useNavigate()

  if (!success || !applications || applications.length === 0) {
    return <></>
  }

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
    <div className="my-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs uppercase font-medium text-gray-900 dark:text-gray-400">
          ArgoCD Applications
        </h3>
        <span className="text-xs text-gray-600 dark:text-gray-400">
          {total_count || applications.length} application{(total_count || applications.length) !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Applications Grid - Matching your existing design */}
      <div className="hover:cursor-pointer" onClick={() => navigate("/dashboard/integrations/argo")}>
        {applications.map((app, index) => {
          const syncStatus = app.status?.sync?.status || 'Unknown';
          const healthStatus = app.status?.health?.status || 'Unknown';
          const automated = app.spec.syncPolicy?.automated !== undefined;
          const resourcesCount = app.status?.resources?.length || 0;

          return (
            <motion.div
              key={`${app.metadata.namespace}-${app.metadata.name}-${index}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="bg-gray-200/30 dark:bg-gray-800/20 rounded-lg p-4 hover:bg-gray-200/50 dark:hover:bg-gray-800/30 transition-colors border border-transparent hover:border-blue-500/30"
            >
              {/* Header */}
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <h3 className="text-base font-medium dark:text-white truncate">
                    {app.metadata.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      {app.spec.project}
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
                  <span className="truncate">{app.spec.source.repoURL}</span>
                </div>

                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                    <Package className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{app.spec.source.targetRevision || 'HEAD'}</span>
                  </div>
                  <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                    <Server className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{app.spec.destination.namespace || 'default'}</span>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-between items-center pt-3 border-t border-gray-300/20 dark:border-gray-700/20">
                <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                  <Activity className="h-3 w-3" />
                  <span>{resourcesCount} resources</span>
                </div>

                {app.status?.reconciledAt && (
                  <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                    <Clock className="h-3 w-3" />
                    <span>{formatTimestamp(app.status.reconciledAt)}</span>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

// ArgoCD Application Detail component
interface ArgoApplicationDetailProps {
  application?: ArgoApplication;
  success?: boolean;
}

const ArgoApplicationDetailComponent: React.FC<ArgoApplicationDetailProps> = ({
  application,
  success
}) => {
  const navigate = useNavigate()

  if (!success || !application) {
    return (
      <></>
    );
  }

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
        return <CheckCircle2 className="h-5 w-5" />;
      case 'OutOfSync':
        return <AlertCircle className="h-5 w-5" />;
      default:
        return <CircleDashed className="h-5 w-5" />;
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
        return <CheckCircle2 className="h-5 w-5" />;
      case 'Progressing':
        return <RefreshCw className="h-5 w-5 animate-spin" />;
      case 'Degraded':
        return <XCircle className="h-5 w-5" />;
      case 'Suspended':
        return <Clock className="h-5 w-5" />;
      case 'Missing':
        return <AlertCircle className="h-5 w-5" />;
      default:
        return <CircleDashed className="h-5 w-5" />;
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
    <div className="my-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs uppercase font-medium text-gray-900 dark:text-gray-400">
          Application Details
        </h3>
      </div>

      {/* Main Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="bg-gray-200/30 dark:bg-gray-800/20 hover:bg-gray-200/50 dark:hover:bg-gray-800/30 rounded-lg p-6 border border-gray-300/20 dark:border-gray-700/20 hover:cursor-pointer"
        onClick={() => navigate("/dashboard/integrations/argo")}
      >
        {/* Title Section */}
        <div className="flex justify-between items-start mb-6">
          <div className="flex-1">
            <h3 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
              {application.metadata.name}
            </h3>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Project: <span className="font-medium">{application.spec.project}</span>
              </span>
              {automated && (
                <span className="text-xs px-2 py-1 bg-blue-500/10 text-blue-500 rounded-full">
                  Auto-sync Enabled
                </span>
              )}
            </div>
          </div>

          {/* Status Badges */}
          <div className="flex flex-col gap-2">
            <div className={`flex items-center gap-2 ${getSyncStatusColor(syncStatus)}`}>
              {getSyncStatusIcon(syncStatus)}
              <span className="text-sm font-medium">{syncStatus}</span>
            </div>
            <div className={`flex items-center gap-2 ${getHealthStatusColor(healthStatus)}`}>
              {getHealthStatusIcon(healthStatus)}
              <span className="text-sm font-medium">{healthStatus}</span>
            </div>
          </div>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Source Information */}
          <div className="space-y-3">
            <h4 className="text-xs uppercase font-medium text-gray-700 dark:text-gray-400">
              Source
            </h4>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <GitBranch className="h-4 w-4 text-gray-500 dark:text-gray-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 dark:text-gray-500">Repository</p>
                  <p className="text-sm text-gray-900 dark:text-gray-200 break-all">
                    {application.spec.source.repoURL}
                  </p>
                </div>
              </div>

              {application.spec.source.path && (
                <div className="flex items-start gap-2">
                  <Package className="h-4 w-4 text-gray-500 dark:text-gray-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs text-gray-500 dark:text-gray-500">Path</p>
                    <p className="text-sm text-gray-900 dark:text-gray-200">
                      {application.spec.source.path}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-2">
                <GitBranch className="h-4 w-4 text-gray-500 dark:text-gray-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-gray-500 dark:text-gray-500">Target Revision</p>
                  <p className="text-sm text-gray-900 dark:text-gray-200">
                    {application.spec.source.targetRevision || 'HEAD'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Destination Information */}
          <div className="space-y-3">
            <h4 className="text-xs uppercase font-medium text-gray-700 dark:text-gray-400">
              Destination
            </h4>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Server className="h-4 w-4 text-gray-500 dark:text-gray-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-gray-500 dark:text-gray-500">Cluster</p>
                  <p className="text-sm text-gray-900 dark:text-gray-200">
                    {application.spec.destination.server || 'in-cluster'}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Package className="h-4 w-4 text-gray-500 dark:text-gray-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-gray-500 dark:text-gray-500">Namespace</p>
                  <p className="text-sm text-gray-900 dark:text-gray-200">
                    {application.spec.destination.namespace || 'default'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Stats */}
        <div className="flex items-center justify-between pt-4 mt-6 border-t border-gray-300/20 dark:border-gray-700/20">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <Activity className="h-4 w-4" />
            <span>{resourcesCount} resources managed</span>
          </div>

          {application.status?.reconciledAt && (
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <Clock className="h-4 w-4" />
              <span>Last reconciled {formatTimestamp(application.status.reconciledAt)}</span>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

// Component map - maps tool names to React components
export const ComponentMap = {
  image_vulnerability_summary: ImageVulnerabilitySummaryComponent,
  argocd_applications_list: ArgoApplicationsListComponent,
  argocd_application_detail: ArgoApplicationDetailComponent,
  // Add more component mappings here as needed
  // example: kubectl_get: KubectlGetComponent,
};

export type ComponentMapType = typeof ComponentMap;
