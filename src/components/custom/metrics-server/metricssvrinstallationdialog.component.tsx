import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  Server,
  Settings,
  RefreshCw,
  Clock,
  Download
} from 'lucide-react';
import { useCluster } from '@/contexts/clusterContext';
import {
  installMetricsServer,
  getOperationStatus,
  getMetricsServerStatus
} from '@/api/internal/metrics_svr';
import {
  OperationDetails,
  MetricsServerStatus
} from '@/types/metrics-server';

interface MetricsServerInstallationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MetricsServerInstallationDialog: React.FC<MetricsServerInstallationDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const { currentContext, checkMetricsServerStatus } = useCluster();
  const [installationType, setInstallationType] = useState<'production' | 'local'>('production');
  const [isInstalling, setIsInstalling] = useState(false);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [operationDetails, setOperationDetails] = useState<OperationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<MetricsServerStatus | null>(null);
  const [installationComplete, setInstallationComplete] = useState(false);

  const handleInstall = async () => {
    if (!currentContext) return;

    try {
      setIsInstalling(true);
      setError(null);
      setOperationId(null);
      setOperationDetails(null);
      setInstallationComplete(false);

      const response = await installMetricsServer(currentContext.name, installationType);
      setOperationId(response.operationId);

      // Show initial operation details
      setOperationDetails({
        id: response.operationId,
        type: 'metrics-install',
        status: 'pending',
        target: currentContext.name,
        startTime: new Date().toISOString(),
        progress: 0,
        message: 'Installation started',
        data: { installType: installationType },
        retryCount: 0,
        maxRetries: 3,
        createdBy: 'user',
        tags: ['metrics-server', 'installation']
      });

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start installation');
    } finally {
      setIsInstalling(false);
    }
  };

  const handleCheckOperationStatus = async () => {
    if (!operationId) return;

    try {
      setIsCheckingStatus(true);
      const response = await getOperationStatus(operationId);
      setOperationDetails(response.data);

      // If operation completed successfully, check metrics server status
      if (response.data.status === 'completed') {
        setInstallationComplete(true);
        await checkMetricsServerStatus();
      } else if (response.data.status === 'failed') {
        setError(response.data.error || 'Installation failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check operation status');
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const handleCheckCurrentStatus = async () => {
    if (!currentContext) return;

    try {
      setIsCheckingStatus(true);
      const response = await getMetricsServerStatus(currentContext.name);
      setCurrentStatus(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check metrics server status');
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const handleClose = () => {
    // Reset all state when closing
    setIsInstalling(false);
    setOperationId(null);
    setOperationDetails(null);
    setError(null);
    setIsCheckingStatus(false);
    setCurrentStatus(null);
    setInstallationComplete(false);
    onOpenChange(false);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'running':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      case 'failed':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
      case 'running':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      default:
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] dark:bg-[#0B0D13]/50 backdrop-blur-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Metrics Server Installation
          </DialogTitle>
          <DialogDescription>
            Install and configure the Kubernetes Metrics Server on your cluster to enable resource usage monitoring.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="install" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="install">Install</TabsTrigger>
            <TabsTrigger value="status">Current Status</TabsTrigger>
          </TabsList>

          <TabsContent value="install" className="space-y-4">
            {!operationId ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Installation Configuration</CardTitle>
                  <CardDescription>
                    Choose the installation type based on your cluster environment.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium">Installation Type</label>
                      <div className="mt-2 space-y-1">
                        <div className="flex items-center space-x-3 p-2 rounded-md">
                          <Checkbox
                            id="production"
                            checked={installationType === 'production'}
                            onCheckedChange={(checked) => {
                              if (checked) setInstallationType('production');
                            }}
                            className="flex-shrink-0"
                          />
                          <label htmlFor="production" className="text-sm cursor-pointer flex-grow text-gray-700 dark:text-gray-300">
                            <span className="font-medium">Production</span>
                            <span className="text-gray-500 dark:text-gray-400 ml-2">
                              - Standard configuration for production clusters
                            </span>
                          </label>
                        </div>
                        <div className="flex items-center space-x-3 p-2 rounded-md">
                          <Checkbox
                            id="local"
                            checked={installationType === 'local'}
                            onCheckedChange={(checked) => {
                              if (checked) setInstallationType('local');
                            }}
                            className="flex-shrink-0"
                          />
                          <label htmlFor="local" className="text-sm cursor-pointer flex-grow text-gray-700 dark:text-gray-300">
                            <span className="font-medium">Local Cluster</span>
                            <span className="text-gray-500 dark:text-gray-400 ml-2">
                              - Adds --kubelet-insecure-tls for local clusters (kind, minikube)
                            </span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>

                  {error && (
                    <Alert className="border-red-200 bg-red-50 dark:bg-red-900/30">
                      <AlertCircle className="h-4 w-4 text-red-600" />
                      <AlertDescription className="text-red-600 dark:text-red-400">
                        {error}
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={handleClose}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleInstall}
                      disabled={isInstalling || !currentContext}
                      className="flex items-center gap-2 min-w-44 flex justify-between"
                    >
                      {isInstalling ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                      {isInstalling ? 'Starting Installation...' : 'Start Installation'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    {getStatusIcon(operationDetails?.status || 'pending')}
                    Installation Progress
                  </CardTitle>
                  <CardDescription>
                    Installation ID: <code className="text-xs">{operationId}</code>
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {operationDetails && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Status</span>
                        <Badge className={getStatusColor(operationDetails.status)}>
                          {operationDetails.status}
                        </Badge>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span>Progress</span>
                          <span>{operationDetails.progress}%</span>
                        </div>
                        <Progress value={operationDetails.progress} className="h-2" />
                      </div>

                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Type:</span>
                          <span>{operationDetails.type}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Target:</span>
                          <span>{operationDetails.target}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Started:</span>
                          <span>{new Date(operationDetails.startTime).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Message:</span>
                          <span>{operationDetails.message}</span>
                        </div>
                      </div>

                      {operationDetails.error && (
                        <Alert className="border-red-200 bg-red-50 dark:bg-red-900/30">
                          <AlertCircle className="h-4 w-4 text-red-600" />
                          <AlertDescription className="text-red-600 dark:text-red-400">
                            {operationDetails.error}
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  )}

                  {installationComplete && (
                    <Alert className="border-green-200 bg-green-50 dark:bg-green-900/30">
                      <AlertDescription className="flex items-center gap-2 text-green-600 dark:text-green-400">
                        <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-600" />
                        Metrics server installation completed successfully!
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={handleCheckOperationStatus}
                      disabled={isCheckingStatus || !operationId}
                      className="flex items-center gap-2"
                    >
                      {isCheckingStatus ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      Check Status
                    </Button>
                    {installationComplete && (
                      <Button onClick={handleClose}>
                        Done
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="status" className="space-y-4">
            <Card>
              <CardContent className="space-y-4">


                {currentStatus && (
                  <div className="space-y-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Installed</span>
                      <Badge className={currentStatus.installed
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                        : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                      }>
                        {currentStatus.installed ? 'Yes' : 'No'}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Ready</span>
                      <Badge className={currentStatus.ready
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                        : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                      }>
                        {currentStatus.ready ? 'Yes' : 'No'}
                      </Badge>
                    </div>

                    {currentStatus.version && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Version</span>
                        <span className="text-sm">{currentStatus.version}</span>
                      </div>
                    )}

                    {currentStatus.serviceAddress && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Service Address</span>
                        <span className="text-sm font-mono">{currentStatus.serviceAddress}</span>
                      </div>
                    )}

                    {currentStatus.components && currentStatus.components.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-sm font-medium">Components</span>
                        <div className="grid grid-cols-1 gap-2">
                          {currentStatus.components.map((component, index) => (
                            <div key={index} className="flex items-center justify-between p-2 border rounded">
                              <span className="text-sm">{component.name} ({component.type})</span>
                              <Badge className={component.status === 'Ready'
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                              }>
                                {component.status}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    onClick={handleCheckCurrentStatus}
                    disabled={isCheckingStatus}
                    className="flex items-center gap-2"
                  >
                    {isCheckingStatus ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Check Status
                  </Button>
                </div>

                {error && (
                  <Alert className="border-red-200 bg-red-50 dark:bg-red-900/30">
                    <AlertCircle className="h-4 w-4 text-red-600" />
                    <AlertDescription className="text-red-600 dark:text-red-400">
                      {error}
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default MetricsServerInstallationDialog;