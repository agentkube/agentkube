import React, { useState } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SearchResult } from '@/types/search';
import { listResources } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';
import { Loader2, AlertCircle, CheckCircle2, Clock, Info } from 'lucide-react';

interface ResourceInfoTooltipProps {
  resource: SearchResult;
  children: React.ReactNode;
}

/**
 * Tooltip component that fetches and displays real-time status/info for a Kubernetes resource
 */
export const ResourceInfoTooltip: React.FC<ResourceInfoTooltipProps> = ({ resource, children }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const { currentContext } = useCluster();

  const fetchData = async () => {
    if (data || loading || !currentContext) return;

    setLoading(true);
    try {
      const result = await listResources(
        currentContext.name,
        resource.resourceType as any,
        {
          namespace: resource.namespaced ? resource.namespace : undefined,
          name: resource.resourceName,
          apiGroup: resource.group || undefined,
          apiVersion: resource.version || 'v1'
        }
      );

      if (result && result.length > 0) {
        setData(result[0]);
      }
    } catch (err) {
      console.error('Failed to fetch resource info:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = () => {
    if (!data) return <Info size={14} className="text-muted-foreground" />;

    if (resource.resourceType === 'pods') {
      const phase = data.status?.phase;
      const isFailing = (data.status?.containerStatuses || []).some((status: any) =>
        status.state?.waiting?.reason === 'CrashLoopBackOff' ||
        status.state?.waiting?.reason === 'ImagePullBackOff' ||
        status.state?.waiting?.reason === 'ErrImagePull'
      ) || phase === 'Failed';

      if (isFailing) return <AlertCircle size={14} className="text-red-500" />;
      if (phase === 'Running' || phase === 'Succeeded') return <CheckCircle2 size={14} className="text-green-500" />;
      if (phase === 'Pending') return <Clock size={14} className="text-yellow-500" />;
    }

    if (resource.resourceType === 'deployments') {
      const replicas = data.spec?.replicas || 0;
      const ready = data.status?.readyReplicas || 0;
      const available = data.status?.availableReplicas || 0;

      if (replicas > 0 && available === 0) return <AlertCircle size={14} className="text-red-500" />;
      if (available < replicas) return <Clock size={14} className="text-yellow-500" />;
      return <CheckCircle2 size={14} className="text-green-500" />;
    }

    if (resource.resourceType === 'events') {
      const type = data.type;
      if (type === 'Warning') return <AlertCircle size={14} className="text-amber-500" />;
      return <Info size={14} className="text-blue-500" />;
    }

    return <CheckCircle2 size={14} className="text-blue-500" />;
  };

  const renderStatusDetails = () => {
    if (!data) return null;

    if (resource.resourceType === 'pods') {
      const status = data.status;
      const containerStatuses = status?.containerStatuses || [];
      const totalContainers = containerStatuses.length;
      const readyContainers = containerStatuses.filter((s: any) => s.ready).length;
      const totalRestarts = containerStatuses.reduce((acc: number, s: any) => acc + (s.restartCount || 0), 0);

      return (
        <div className="space-y-2 mt-2 pt-2 border-t border-accent/20 dark:border-accent/30">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-[10px]">Phase:</span>
              <span className="font-medium truncate ml-1">{status?.phase || 'Unknown'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-[10px]">Ready:</span>
              <span className={`font-medium ${readyContainers < totalContainers ? 'text-amber-500' : ''}`}>
                {readyContainers}/{totalContainers}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-[10px]">Restarts:</span>
              <span className={`font-medium ${totalRestarts > 0 ? 'text-red-500 font-bold' : ''}`}>
                {totalRestarts}
              </span>
            </div>
            {data.status?.hostIP && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-[10px]">IP:</span>
                <span className="font-mono text-[9px] opacity-70 ml-1">{data.status.hostIP}</span>
              </div>
            )}
          </div>

          {containerStatuses.length > 0 && (
            <div className="space-y-1 pt-2 border-t border-accent/10">
              <span className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Containers</span>
              {containerStatuses.map((cs: any) => {
                const state = cs.state?.waiting ? (
                  <span className="text-red-500">{cs.state.waiting.reason}</span>
                ) : cs.state?.terminated ? (
                  <span className={cs.state.terminated.exitCode === 0 ? "text-green-500" : "text-red-500"}>
                    Exited ({cs.state.terminated.exitCode})
                  </span>
                ) : (
                  <span className="text-green-500">Running</span>
                );

                return (
                  <div key={cs.name} className="flex justify-between items-start text-[10px] gap-2">
                    <div className="flex items-center gap-1 truncate max-w-[120px]">
                      <div className={`w-1.5 h-1.5 rounded-full ${cs.ready ? 'bg-green-500' : 'bg-amber-500'}`} />
                      <span className="truncate text-foreground/80">{cs.name}</span>
                    </div>
                    <div className="text-right shrink-0">
                      {state}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    if (resource.resourceType === 'deployments') {
      const status = data.status;
      const spec = data.spec;

      return (
        <div className="space-y-2 mt-2 pt-2 border-t border-accent/20 dark:border-accent/30 text-[11px]">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-[10px]">Desired:</span>
              <span className="font-medium">{spec?.replicas ?? 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-[10px]">Ready:</span>
              <span className={`font-medium ${(status?.readyReplicas || 0) < (spec?.replicas || 0) ? 'text-yellow-500' : ''}`}>
                {status?.readyReplicas ?? 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-[10px]">Updated:</span>
              <span className="font-medium">{status?.updatedReplicas ?? 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-[10px]">Available:</span>
              <span className="font-medium">{status?.availableReplicas ?? 0}</span>
            </div>
          </div>

          <div className="pt-1 mt-1 border-t border-accent/10 dark:border-accent/10">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-[10px]">Strategy:</span>
              <span className="text-[10px] opacity-80">{spec?.strategy?.type || 'RollingUpdate'}</span>
            </div>
          </div>

          {status?.conditions && (
            <div className="space-y-1 mt-2">
              <span className="text-[10px] uppercase font-bold text-muted-foreground block">Conditions</span>
              {status.conditions.slice(0, 2).map((c: any, i: number) => (
                <div key={i} className="flex justify-between text-[10px]">
                  <span className="truncate text-foreground/70">{c.type}</span>
                  <span className={c.status === 'True' ? "text-green-500" : "text-red-500"}>{c.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (resource.resourceType === 'statefulsets' || resource.resourceType === 'daemonsets' || resource.resourceType === 'replicasets') {
      const status = data.status;
      const isSS = resource.resourceType === 'statefulsets';
      const isRS = resource.resourceType === 'replicasets';

      return (
        <div className="space-y-2 mt-2 pt-2 border-t border-accent/20 dark:border-accent/30 text-[11px]">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-[10px]">Desired:</span>
              <span className="font-medium">{isSS || isRS ? data.spec?.replicas : status?.desiredNumberScheduled}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-[10px]">Ready:</span>
              <span className="font-medium">{status?.numberReady || status?.readyReplicas || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-[10px]">Current:</span>
              <span className="font-medium">{status?.currentNumberScheduled || status?.currentReplicas || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-[10px]">Available:</span>
              <span className="font-medium">{status?.numberAvailable || status?.availableReplicas || 0}</span>
            </div>
          </div>
        </div>
      );
    }

    if (resource.resourceType === 'nodes') {
      const status = data.status;
      const capacity = status?.capacity || {};
      const allocatable = status?.allocatable || {};
      const nodeInfo = status?.nodeInfo || {};

      return (
        <div className="space-y-2 mt-2 pt-2 border-t border-accent/20 dark:border-accent/30 text-[11px]">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-[10px]">CPU:</span>
              <span className="font-medium">{allocatable.cpu}/{capacity.cpu}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-[10px]">Memory:</span>
              <span className="font-medium">{allocatable.memory}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-[10px]">Pods:</span>
              <span className="font-medium">{allocatable.pods}/{capacity.pods}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-[10px]">OS:</span>
              <span className="font-medium truncate ml-1">{nodeInfo.osImage || 'Unknown'}</span>
            </div>
          </div>

          <div className="pt-1 mt-1 border-t border-accent/10 dark:border-accent/10">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-[10px]">Kubelet:</span>
              <span className="text-[10px] opacity-80">{nodeInfo.kubeletVersion}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-[10px]">Runtime:</span>
              <span className="text-[10px] opacity-80">{nodeInfo.containerRuntimeVersion}</span>
            </div>
          </div>

          {status?.conditions && (
            <div className="space-y-1 mt-2">
              <span className="text-[10px] uppercase font-bold text-muted-foreground block">Conditions</span>
              {status.conditions.filter((c: any) => c.status === 'True').map((c: any, i: number) => (
                <div key={i} className="flex justify-between text-[10px]">
                  <span className="truncate text-foreground/70">{c.type}</span>
                  <span className={c.type === 'Ready' ? "text-green-500" : "text-amber-500"}>{c.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (resource.resourceType === 'events') {
      const isWarning = data.type === 'Warning';
      return (
        <div className="space-y-2 mt-2 pt-2 border-t border-accent/20 dark:border-accent/30 text-[11px]">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-[10px]">Type:</span>
              <span className={`font-bold px-1 rounded-[2px] ${isWarning ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'}`}>
                {data.type}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-[10px]">Count:</span>
              <span className="font-medium">{data.count || 1}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-[10px]">Reason:</span>
              <span className={`font-medium ${isWarning ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'}`}>
                {data.reason}
              </span>
            </div>
          </div>
          <div className="flex justify-between items-start gap-2 pt-1 border-t border-accent/10">
            <span className="text-muted-foreground text-[10px] shrink-0">Object:</span>
            <span className="text-[10px] truncate">{data.involvedObject?.kind}/{data.involvedObject?.name}</span>
          </div>
          <div className="flex justify-between items-start gap-2">
            <span className="text-muted-foreground text-[10px] shrink-0">Source:</span>
            <span className="text-[10px] truncate">{data.source?.component || 'unknown'}</span>
          </div>
          <div className="mt-2 text-[10px] p-2 bg-accent/5 dark:bg-accent/10 rounded border border-accent/10 italic leading-relaxed text-foreground/90">
            {data.message}
          </div>
        </div>
      );
    }

    // Generic status for other resources
    const status = data.status;
    return (
      <div className="mt-2 pt-2 border-t border-accent/20 dark:border-accent/30 text-[11px]">
        {status?.conditions && (
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">Conditions</span>
            {status.conditions.slice(0, 3).map((c: any, i: number) => (
              <div key={i} className="flex justify-between">
                <span className="truncate text-foreground/70">{c.type}</span>
                <span className={c.status === 'True' ? "text-green-500" : "text-red-500"}>{c.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip onOpenChange={(open) => { if (open) fetchData(); }}>
        <TooltipTrigger asChild>
          {children}
        </TooltipTrigger>
        <TooltipContent
          side="right"
          sideOffset={10}
          className="w-72 p-3 bg-card dark:bg-card/90 backdrop-blur-md border border-accent/30 dark:border-accent/50 shadow-2xl z-[100]"
        >
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2 overflow-hidden">
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] text-muted-foreground truncate uppercase font-bold">
                  {resource.resourceType}
                </span>
                <span className="text-sm font-bold truncate text-foreground leading-tight">
                  {resource.resourceName}
                </span>
              </div>
              <div className="flex-shrink-0">
                {getStatusIcon()}
              </div>
            </div>

            <div className="text-[10px] text-muted-foreground truncate italic">
              Namespace: {resource.namespace || 'cluster-scoped'}
            </div>

            {loading ? (
              <div className="flex items-center justify-center p-6">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : (
              renderStatusDetails()
            )}

            {data && !loading && (
              <div className="text-[9px] text-muted-foreground pt-2 text-right opacity-50">
                Click to select
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
