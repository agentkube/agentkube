import React, { useState, useEffect } from 'react';
import { useCluster } from '@/contexts/clusterContext';
import { getPortForwards, stopPortForward, PortForward, openPortForwardInBrowser } from '@/api/internal/portforward';
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, ExternalLink, StopCircle, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const PortForwards: React.FC = () => {
  const { currentContext } = useCluster();
  const { toast } = useToast();
  const [portForwards, setPortForwards] = useState<PortForward[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    id: string;
    name: string;
    action: 'stop' | 'delete';
  }>({ open: false, id: '', name: '', action: 'stop' });

  useEffect(() => {
    fetchPortForwards();
  }, [currentContext, refreshTrigger]);

  const fetchPortForwards = async () => {
    if (!currentContext) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await getPortForwards(currentContext.name);
      setPortForwards(data);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch port forwards:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch port forwards');
      // Set empty array so we can still show the table
      setPortForwards([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const handleStopOrDelete = async (portForwardId: string, stopOrDelete: boolean) => {
    if (!currentContext) return;

    try {
      await stopPortForward({
        id: portForwardId,
        cluster: currentContext.name,
        stopOrDelete
      });

      // Update UI - either refresh the list or update status locally
      if (stopOrDelete) {
        // Remove from the list if deleted
        setPortForwards(prev => prev.filter(pf => pf.id !== portForwardId));
      } else {
        // Update status if stopped
        setPortForwards(prev => prev.map(pf => 
          pf.id === portForwardId ? { ...pf, status: 'Stopped' } : pf
        ));
      }

      toast({
        title: stopOrDelete ? "Port Forward Deleted" : "Port Forward Stopped",
        description: `Port forward was successfully ${stopOrDelete ? 'deleted' : 'stopped'}.`
      });
    } catch (err) {
      toast({
        title: "Operation Failed",
        description: err instanceof Error ? err.message : `Failed to ${stopOrDelete ? 'delete' : 'stop'} port forward`,
        variant: "destructive"
      });
    } finally {
      setConfirmDialog({ open: false, id: '', name: '', action: 'stop' });
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'Running':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'Stopped':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'Error':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-h-[92vh] overflow-y-auto
          scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent
          [&::-webkit-scrollbar]:w-1.5 
          [&::-webkit-scrollbar-track]:bg-transparent 
          [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">
      <div className="flex justify-between items-center">
        <h1 className='text-5xl font-[Anton] uppercase font-bold text-gray-800/30 dark:text-gray-700/50'>Port Forwards</h1>
        <Button onClick={handleRefresh} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert className="bg-red-100 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog({ ...confirmDialog, open })}>
        <DialogContent className="max-w-md bg-gray-200 dark:bg-[#0B0D13]/70 backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle>
              {confirmDialog.action === 'delete' ? 'Delete Port Forward' : 'Stop Port Forward'}
            </DialogTitle>
            <DialogDescription>
              {confirmDialog.action === 'delete' 
                ? 'Are you sure you want to delete this port forward? This action cannot be undone.'
                : 'Are you sure you want to stop this port forward? You can restart it later if needed.'}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="font-medium">{confirmDialog.name}</div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setConfirmDialog({ open: false, id: '', name: '', action: 'stop' })}
            >
              Cancel
            </Button>
            <Button 
              variant={confirmDialog.action === 'delete' ? 'destructive' : 'default'}
              onClick={() => handleStopOrDelete(confirmDialog.id, confirmDialog.action === 'delete')}
            >
              {confirmDialog.action === 'delete' ? 'Delete' : 'Stop'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Port forwards table - Always shown, even when empty */}
      <Card className="bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
        <div className="rounded-md border">
          <Table className="bg-gray-50 dark:bg-transparent rounded-2xl">
            <TableHeader>
              <TableRow className="border-b border-gray-400 dark:border-gray-800/80">
                <TableHead>Status</TableHead>
                <TableHead>Local Port</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Namespace</TableHead>
                <TableHead>Pod</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Cluster</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {portForwards.length > 0 ? (
                portForwards.map((portForward) => (
                  <TableRow
                    key={portForward.id}
                    className="bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80"
                  >
                    <TableCell>
                      <span className={`px-2 py-1 rounded-[0.3rem] text-xs font-medium ${getStatusBadgeClass(portForward.status)}`}>
                        {portForward.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono">{portForward.port}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono">{portForward.targetPort}</span>
                    </TableCell>
                    <TableCell>{portForward.namespace}</TableCell>
                    <TableCell>{portForward.pod}</TableCell>
                    <TableCell>{portForward.service || '-'}</TableCell>
                    <TableCell>{portForward.cluster}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {portForward.status === 'Running' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openPortForwardInBrowser(portForward.port)}
                              title="Open in browser"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setConfirmDialog({
                                open: true,
                                id: portForward.id,
                                name: `Port Forward ${portForward.port} → ${portForward.targetPort}`,
                                action: 'stop'
                              })}
                              title="Stop port forward"
                            >
                              <StopCircle className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 dark:text-red-400"
                          onClick={() => setConfirmDialog({
                            open: true,
                            id: portForward.id,
                            name: `Port Forward ${portForward.port} → ${portForward.targetPort}`,
                            action: 'delete'
                          })}
                          title="Delete port forward"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-gray-500 dark:text-gray-400">
                    No active port forwards found. Start a port forward from a service, pod, or deployment to see it here.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
};

export default PortForwards;