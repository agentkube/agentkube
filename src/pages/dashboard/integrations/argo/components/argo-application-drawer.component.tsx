import React from 'react';
import { ArgoApplication } from '@/types/argocd';
import { SideDrawer, DrawerHeader, DrawerContent } from '@/components/ui/sidedrawer.custom';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  GitBranch,
  Package,
  Server,
  Activity,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Clock,
  CircleDashed,
  Folder,
  FileCode,
  Settings,
  Link as LinkIcon,
  Calendar,
  ArrowUpRight,
} from 'lucide-react';
import { Prism, SyntaxHighlighterProps } from 'react-syntax-highlighter';
import { nord } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { openExternalUrl } from '@/api/external';
import { useToast } from '@/hooks/use-toast';

const SyntaxHighlighter = (Prism as any) as React.FC<SyntaxHighlighterProps>;

interface ArgoApplicationDrawerProps {
  application: ArgoApplication | null;
  isOpen: boolean;
  onClose: () => void;
}

const ArgoApplicationDrawer: React.FC<ArgoApplicationDrawerProps> = ({
  application,
  isOpen,
  onClose,
}) => {
  const navigate = useNavigate();
  const { toast } = useToast();

  if (!application) return null;

  const syncStatus = application.status?.sync?.status || 'Unknown';
  const healthStatus = application.status?.health?.status || 'Unknown';
  const automated = application.spec.syncPolicy?.automated !== undefined;
  const resources = application.status?.resources || [];

  const customStyle: CSSProperties = {
    padding: '0.5rem',
    borderRadius: '0.5rem',
    background: 'transparent',
    fontSize: '0.75rem',
  };

  const getSyncStatusColor = (status: string) => {
    switch (status) {
      case 'Synced':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300';
      case 'OutOfSync':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300';
      default:
        return 'bg-gray-100 text-card 4ark:bg-card/40 dark:text-gray-400';
    }
  };

  const getHealthStatusColor = (status: string) => {
    switch (status) {
      case 'Healthy':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300';
      case 'Progressing':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300';
      case 'Degraded':
        return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300';
      case 'Suspended':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300';
      default:
        return 'bg-gray-100 text-card 4ark:bg-card/40 dark:text-gray-400';
    }
  };

  const getSyncStatusIcon = (status: string) => {
    switch (status) {
      case 'Synced':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'OutOfSync':
        return <AlertCircle className="h-4 w-4 text-orange-500" />;
      default:
        return <CircleDashed className="h-4 w-4 text-gray-500" />;
    }
  };

  const getHealthStatusIcon = (status: string) => {
    switch (status) {
      case 'Healthy':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'Progressing':
        return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'Degraded':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'Suspended':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      default:
        return <CircleDashed className="h-4 w-4 text-gray-500" />;
    }
  };


  const getKindBadgeColor = (kind: string): string => {
    const kindLower = kind.toLowerCase();
    if (kindLower.includes('deployment')) {
      return 'bg-blue-200 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    }
    if (kindLower.includes('statefulset')) {
      return 'bg-purple-200 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
    }
    if (kindLower.includes('daemonset')) {
      return 'bg-green-200 text-green-800 dark:bg-green-900/30 dark:text-green-400';
    }
    if (kindLower.includes('replicaset')) {
      return 'bg-cyan-200 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400';
    }
    if (kindLower.includes('service')) {
      return 'bg-indigo-200 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400';
    }
    if (kindLower.includes('configmap')) {
      return 'bg-yellow-200 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
    }
    if (kindLower.includes('secret')) {
      return 'bg-red-200 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    }
    if (kindLower.includes('pod')) {
      return 'bg-gray-200 text-gray-700 dark:bg-card 4ark:text-gray-300';
    }
    return 'bg-gray-200 text-gray-700 dark:bg-card 4ark:text-gray-300';
  };

  const formatTimestamp = (timestamp?: string) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  const handleOpenRepository = async () => {
    try {
      await openExternalUrl(application.spec.source.repoURL);
      toast({
        title: 'Repository Opened',
        description: 'Repository URL opened in external browser',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to open repository URL',
        variant: 'destructive',
      });
    }
  };

  return (
    <SideDrawer isOpen={isOpen} onClose={onClose} offsetTop="-top-6">
      <DrawerHeader onClose={onClose}>
        <div className="py-1 flex items-center justify-between w-full">
          <div className="flex items-start gap-2">
            <div className="py-0.5">{getSyncStatusIcon(syncStatus)}</div>
            <div>
              <h3 className="font-medium text-md text-card dark:text-gray-200 leading-tight">
                {application.metadata.name}
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                {application.spec.project}
              </p>
            </div>
          </div>
        </div>
      </DrawerHeader>

      <DrawerContent>
        <div className="p-6 space-y-4">
          {/* Status Overview */}
          <Card className="bg-transparent dark:bg-card/40 border-gray-200/70 dark:border-accent/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm uppercase flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Status Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600 dark:text-gray-400">Sync Status</span>
                <div className="flex items-center gap-2">
                  {getSyncStatusIcon(syncStatus)}
                  <Badge className={getSyncStatusColor(syncStatus)}>{syncStatus}</Badge>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600 dark:text-gray-400">Health Status</span>
                <div className="flex items-center gap-2">
                  {getHealthStatusIcon(healthStatus)}
                  <Badge className={getHealthStatusColor(healthStatus)}>{healthStatus}</Badge>
                </div>
              </div>

              {automated && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600 dark:text-gray-400">Sync Policy</span>
                  <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
                    Automated
                  </Badge>
                </div>
              )}

              {application.status?.reconciledAt && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600 dark:text-gray-400">Last Reconciled</span>
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    {formatTimestamp(application.status.reconciledAt)}
                  </span>
                </div>
              )}

              {application.status?.health?.message && (
                <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                  <span className="text-xs text-gray-600 dark:text-gray-400">Health Message</span>
                  <p className="text-xs text-gray-700 dark:text-gray-300 mt-1">
                    {application.status.health.message}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Source Information */}
          <Card className="bg-transparent dark:bg-card/40 border-gray-200/70 dark:border-gray-700/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm uppercase flex items-center gap-2">
                <GitBranch className="h-4 w-4" />
                Source Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <span className="text-xs text-gray-600 dark:text-gray-400">Repository URL</span>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <LinkIcon className="h-3 w-3 text-gray-500 flex-shrink-0" />
                    <p onClick={handleOpenRepository} className="text-xs cursor-pointer text-gray-700 dark:text-gray-300 hover:text-blue-600 hover:dark:text-blue-400 break-all truncate">
                      {application.spec.source.repoURL}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-xs text-gray-600 dark:text-gray-400">Target Revision</span>
                <div className="flex items-center gap-2">
                  <Package className="h-3 w-3 text-gray-500" />
                  <p className="text-xs text-gray-700 dark:text-gray-300">
                    {application.spec.source.targetRevision}
                  </p>
                </div>
              </div>

              {application.spec.source.path && (
                <div className="space-y-1">
                  <span className="text-xs text-gray-600 dark:text-gray-400">Path</span>
                  <div className="flex items-center gap-2">
                    <Folder className="h-3 w-3 text-gray-500" />
                    <p className="text-xs text-gray-700 dark:text-gray-300">
                      {application.spec.source.path}
                    </p>
                  </div>
                </div>
              )}

              {application.spec.source.chart && (
                <div className="space-y-1">
                  <span className="text-xs text-gray-600 dark:text-gray-400">Chart</span>
                  <div className="flex items-center gap-2">
                    <Package className="h-3 w-3 text-gray-500" />
                    <p className="text-xs text-gray-700 dark:text-gray-300">
                      {application.spec.source.chart}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Destination Information */}
          <Card className="bg-transparent dark:bg-card/40 border-gray-200/70 dark:border-gray-700/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm uppercase flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  Destination
                </div>
                <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300">
                  {application.spec.destination.namespace}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600 dark:text-gray-400">Server</span>
                <p className="text-xs text-gray-700 dark:text-gray-300">
                  {application.spec.destination.server}
                </p>
              </div>


            </CardContent>
          </Card>

          {/* Resources */}
          <Card className="bg-transparent dark:bg-card/40 border-gray-200/70 dark:border-gray-700/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm uppercase flex items-center gap-2">
                <Package className="h-4 w-4" />
                Resources ({resources.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {resources.length === 0 ? (
                <div className="text-center py-6">
                  <Package className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                  <p className="text-xs text-gray-500 dark:text-gray-400">No resources found</p>
                </div>
              ) : (
                <div className="border border-gray-200 dark:border-card/40 rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-gray-400 dark:border-card/40">
                        <TableHead className="text-xs">Resource Name</TableHead>
                        <TableHead className="text-xs">Kind</TableHead>
                        <TableHead className="text-xs">Namespace</TableHead>
                        <TableHead className="text-xs">Sync Status</TableHead>
                        <TableHead className="text-xs">Health</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {resources.map((resource, index) => {
                        const kindLowerCase = resource.kind.toLowerCase();
                        const pluralKind = kindLowerCase.endsWith('s') ? kindLowerCase : `${kindLowerCase}s`;
                        const resourcePath = resource.namespace
                          ? `/dashboard/explore/${pluralKind}/${resource.namespace}/${resource.name}`
                          : `/dashboard/explore/${pluralKind}/${resource.name}`;

                        return (
                          <TableRow
                            key={`${resource.kind}-${resource.name}-${index}`}
                            className="bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-card/40 hover:bg-gray-300/50 dark:hover:bg-card/40 hover:cursor-pointer"
                            onClick={() => navigate(resourcePath)}
                          >
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                {/* {getResourceIcon(resource.kind)} */}
                                <span className="text-xs text-blue-500 dark:text-blue-400 hover:underline cursor-pointer">
                                  {resource.name}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge className={getKindBadgeColor(resource.kind)}>
                                {resource.kind}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {resource.namespace ? (
                                <span
                                  className="text-xs text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 cursor-pointer hover:underline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/dashboard/explore/namespaces/${resource.namespace}`);
                                  }}
                                >
                                  {resource.namespace}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-600 dark:text-gray-400">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {resource.status === 'Synced' ? (
                                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                                ) : (
                                  <AlertCircle className="h-3 w-3 text-orange-500" />
                                )}
                                <span className="text-xs text-gray-700 dark:text-gray-300">
                                  {resource.status || 'Unknown'}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              {resource.health ? (
                                <Badge className={getHealthStatusColor(resource.health.status)}>
                                  {resource.health.status}
                                </Badge>
                              ) : (
                                <span className="text-xs text-gray-500">-</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sync Policy */}
          {application.spec.syncPolicy && (
            <Card className="bg-transparent dark:bg-card/40 border-gray-200/70 dark:border-gray-700/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm uppercase flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Sync Policy
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-gray-300/50 dark:bg-card/40 rounded-md overflow-x-auto">
                  <SyntaxHighlighter
                    language="json"
                    style={nord}
                    customStyle={customStyle}
                    wrapLines={true}
                    showLineNumbers={false}
                  >
                    {JSON.stringify(application.spec.syncPolicy, null, 2)}
                  </SyntaxHighlighter>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Operation State */}
          {application.status?.operationState && (
            <Card className="bg-transparent dark:bg-card/40 border-gray-200/70 dark:border-gray-700/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm uppercase flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Last Operation
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600 dark:text-gray-400">Phase</span>
                  <Badge
                    className={
                      application.status.operationState.phase === 'Succeeded'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300'
                        : application.status.operationState.phase === 'Failed'
                          ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300'
                    }
                  >
                    {application.status.operationState.phase}
                  </Badge>
                </div>

                {application.status.operationState.startedAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-600 dark:text-gray-400">Started</span>
                    <span className="text-xs text-gray-700 dark:text-gray-300">
                      {formatTimestamp(application.status.operationState.startedAt)}
                    </span>
                  </div>
                )}

                {application.status.operationState.finishedAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-600 dark:text-gray-400">Finished</span>
                    <span className="text-xs text-gray-700 dark:text-gray-300">
                      {formatTimestamp(application.status.operationState.finishedAt)}
                    </span>
                  </div>
                )}

                {application.status.operationState.message && (
                  <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                    <span className="text-xs text-gray-600 dark:text-gray-400">Message</span>
                    <p className="text-xs text-gray-700 dark:text-gray-300 mt-1">
                      {application.status.operationState.message}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </DrawerContent>
    </SideDrawer>
  );
};

export default ArgoApplicationDrawer;
