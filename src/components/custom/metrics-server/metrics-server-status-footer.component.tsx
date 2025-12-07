import React, { useState, useEffect } from 'react';
import { Server, ServerCrash, Loader2, CheckCircle, AlertTriangle, Settings, Trash2, RotateCcw } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useCluster } from '@/contexts/clusterContext';
import {
  getMetricsServerStatus,
  uninstallMetricsServer,
  getOperationStatus
} from '@/api/internal/metrics_svr';
import { MetricsServerStatus } from '@/types/metrics-server';
import MetricsServerInstallationDialog from './metricssvrinstallationdialog.component';

interface MetricsServerStatusFooterProps {
  className?: string;
}

const MetricsServerStatusFooter: React.FC<MetricsServerStatusFooterProps> = ({ className }) => {
  const { currentContext, isMetricsServerInstalled, isCheckingMetricsServer, checkMetricsServerStatus } = useCluster();
  const [metricsStatus, setMetricsStatus] = useState<MetricsServerStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInstallDialogOpen, setIsInstallDialogOpen] = useState(false);
  const [isUninstalling, setIsUninstalling] = useState(false);
  const [uninstallOperationId, setUninstallOperationId] = useState<string | null>(null);

  // Fetch detailed metrics server status
  const fetchDetailedStatus = async () => {
    if (!currentContext) return;

    try {
      setLoading(true);
      setError(null);
      const response = await getMetricsServerStatus(currentContext.name);
      setMetricsStatus(response.data);
    } catch (err) {
      console.error('Error fetching metrics server status:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch status');
      setMetricsStatus(null);
    } finally {
      setLoading(false);
    }
  };

  // Handle uninstall metrics server
  const handleUninstall = async () => {
    if (!currentContext) return;

    try {
      setIsUninstalling(true);
      setError(null);

      const response = await uninstallMetricsServer(currentContext.name);
      setUninstallOperationId(response.operationId);

      // Poll for completion
      await pollUninstallStatus(response.operationId);
    } catch (err) {
      console.error('Error uninstalling metrics server:', err);
      setError(err instanceof Error ? err.message : 'Failed to uninstall metrics server');
      setIsUninstalling(false);
    }
  };

  // Poll uninstall operation status
  const pollUninstallStatus = async (operationId: string) => {
    try {
      const response = await getOperationStatus(operationId);

      if (response.data.status === 'completed') {
        setIsUninstalling(false);
        setUninstallOperationId(null);
        await checkMetricsServerStatus();
        await fetchDetailedStatus();
      } else if (response.data.status === 'failed') {
        setError(response.data.error || 'Uninstallation failed');
        setIsUninstalling(false);
        setUninstallOperationId(null);
      } else {
        // Continue polling
        setTimeout(() => pollUninstallStatus(operationId), 2000);
      }
    } catch (err) {
      console.error('Error checking uninstall status:', err);
      setError('Failed to check uninstall status');
      setIsUninstalling(false);
      setUninstallOperationId(null);
    }
  };

  // Handle install dialog close
  const handleInstallDialogClose = async (open: boolean) => {
    setIsInstallDialogOpen(open);
    if (!open) {
      // Refresh status after dialog closes
      await checkMetricsServerStatus();
      // Only fetch detailed status if metrics server is now installed
      setTimeout(() => {
        if (isMetricsServerInstalled) {
          fetchDetailedStatus();
        }
      }, 1000); // Small delay to allow cluster context to update
    }
  };

  // Fetch status when component mounts or cluster changes
  useEffect(() => {
    if (currentContext && !loading && isMetricsServerInstalled) {
      fetchDetailedStatus();
    }
  }, [currentContext, isMetricsServerInstalled]);

  // Get icon and color based on status
  const getIconAndColor = () => {
    if (loading || isCheckingMetricsServer || isUninstalling) {
      return { icon: Loader2, color: 'text-blue-400', extraClass: 'animate-spin' };
    }

    if (error) {
      return { icon: ServerCrash, color: 'text-red-400', extraClass: '' };
    }

    if (isMetricsServerInstalled && metricsStatus?.ready) {
      return { icon: CheckCircle, color: '', extraClass: '' };
    }

    if (isMetricsServerInstalled && !metricsStatus?.ready) {
      return { icon: AlertTriangle, color: 'text-yellow-400', extraClass: '' };
    }

    return { icon: Server, color: 'text-gray-400', extraClass: '' };
  };

  const { icon: IconComponent, color, extraClass } = getIconAndColor();

  // Get status text
  const getStatusText = () => {
    if (loading || isCheckingMetricsServer) return 'Checking...';
    if (isUninstalling) return 'Uninstalling...';
    if (error) return 'Error';
    if (isMetricsServerInstalled && metricsStatus?.ready) return 'Ready';
    if (isMetricsServerInstalled && !metricsStatus?.ready) return 'Not Ready';
    return 'Not Installed';
  };

  return (
    <>
      <DropdownMenu>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  className={`flex items-center gap-1 text-gray-400/80 backdrop-blur-md hover:text-blue-500 cursor-pointer group hover:bg-gray-100/10 px-2 py-1 text-xs ${className}`}
                >
                  <IconComponent className={`h-3 w-3 ${color} ${extraClass}`} />
                  <span className="text-xs">Metrics Server</span>
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent className="bg-white dark:bg-[#0B0D13]/60 backdrop-blur-md p-1 text-gray-900 dark:text-gray-100">
              <p>Metrics Server Status</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <DropdownMenuContent
          className="w-80 bg-card/80 backdrop-blur-md border-gray-200 rounded-lg dark:border-neutral-600/30"
          align="end"
          sideOffset={5}
        >
          <div className="flex items-center justify-between bg-gray-300/50 dark:bg-gray-300/10 backdrop-blur-md">
            <DropdownMenuLabel className="flex items-center gap-1 text-sm font-light text-gray-900 dark:text-gray-100">
              Metrics Server Status
            </DropdownMenuLabel>
          </div>

          <div className="p-4 space-y-4">
            {/* Cluster Info */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Cluster</span>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {currentContext?.name || 'No cluster selected'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Status</span>
                <div className="flex items-center gap-1">
                  {/* <IconComponent className={`h-3 w-3 ${color} ${extraClass}`} /> */}
                  <Badge
                    className={
                      isMetricsServerInstalled && metricsStatus?.ready
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                        : isMetricsServerInstalled && !metricsStatus?.ready
                          ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                          : error
                            ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
                    }
                  >
                    {getStatusText()}
                  </Badge>
                </div>
              </div>

              {metricsStatus?.version && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Version</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {metricsStatus.version}
                  </span>
                </div>
              )}

            </div>

            {error && (
              <Alert className="border-red-200 bg-red-50 dark:bg-red-900/30">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-600 dark:text-red-400 text-sm">
                  {error}
                </AlertDescription>
              </Alert>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2">
              {!isMetricsServerInstalled ? (
                <Button
                  onClick={() => setIsInstallDialogOpen(true)}
                  disabled={loading || !currentContext}
                  className="flex-1 bg-primary hover:bg-primary/80"
                  size="sm"
                >
                  <Settings className="h-3 w-3 mr-2" />
                  Install
                </Button>
              ) : (
                <>
                  <Button
                    onClick={() => {
                      checkMetricsServerStatus();
                      if (isMetricsServerInstalled) {
                        fetchDetailedStatus();
                      }
                    }}
                    disabled={loading || !currentContext}
                    variant="outline"
                    className="flex-1 justify-between"
                    size="sm"
                  >
                    {loading ? (
                      <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3 w-3 mr-2" />
                    )}
                    Refresh
                  </Button>
                  <Button
                    onClick={handleUninstall}
                    disabled={loading || isUninstalling || !currentContext}
                    variant="outline"
                    className="flex-1 justify-between text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                    size="sm"
                  >
                    {isUninstalling ? (
                      <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3 mr-2" />
                    )}
                    {isUninstalling ? 'Uninstalling...' : 'Uninstall'}
                  </Button>
                </>
              )}
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Installation Dialog */}
      <MetricsServerInstallationDialog
        open={isInstallDialogOpen}
        onOpenChange={handleInstallDialogClose}
      />
    </>
  );
};

export default MetricsServerStatusFooter;