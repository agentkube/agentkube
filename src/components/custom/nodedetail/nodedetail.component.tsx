import React, { useState } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { listResources } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';
import { Loader2, CheckCircle2, AlertCircle, Info } from 'lucide-react';

interface NodeDetailTooltipProps {
  nodeName: string;
  children: React.ReactNode;
}

/**
 * Tooltip component that fetches and displays real-time details for a specific Kubernetes Node
 */
export const NodeDetailTooltip: React.FC<NodeDetailTooltipProps> = ({ nodeName, children }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const { currentContext } = useCluster();

  const fetchData = async () => {
    if (data || loading || !currentContext || !nodeName) return;

    setLoading(true);
    try {
      // Fetch specific node details
      const result = await listResources(
        currentContext.name,
        'nodes',
        {
          name: nodeName
        }
      );

      if (result && result.length > 0) {
        setData(result[0]);
      }
    } catch (err) {
      console.error('Failed to fetch node info:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = () => {
    if (!data) return <Info size={14} className="text-muted-foreground" />;

    // Check node conditions for Ready status
    const conditions = data.status?.conditions || [];
    const readyCondition = conditions.find((c: any) => c.type === 'Ready');

    if (readyCondition?.status === 'True') {
      return <CheckCircle2 size={14} className="text-green-500" />;
    } else {
      return <AlertCircle size={14} className="text-red-500" />;
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center p-6">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      );
    }

    if (!data) return null;

    const status = data.status;
    const capacity = status?.capacity || {};
    const allocatable = status?.allocatable || {};
    const nodeInfo = status?.nodeInfo || {};
    const addresses = status?.addresses || [];
    const internalIP = addresses.find((a: any) => a.type === 'InternalIP')?.address;

    return (
      <div className="space-y-2 mt-2 pt-2 border-t border-accent/20 dark:border-accent/30 text-[11px]">
        {/* Resource Usage/Capacity Grid */}
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

        {/* System Info Section */}
        <div className="pt-1 mt-1 border-t border-accent/10 dark:border-accent/10">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground text-[10px]">Kubelet:</span>
            <span className="text-[10px] opacity-80">{nodeInfo.kubeletVersion}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground text-[10px]">Runtime:</span>
            <span className="text-[10px] opacity-80">{nodeInfo.containerRuntimeVersion}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground text-[10px]">Kernel:</span>
            <span className="text-[10px] opacity-80 truncate ml-2 max-w-[120px]" title={nodeInfo.kernelVersion}>
              {nodeInfo.kernelVersion}
            </span>
          </div>
          {internalIP && (
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-[10px]">Internal IP:</span>
              <span className="text-[10px] opacity-80 font-mono">{internalIP}</span>
            </div>
          )}
        </div>

        {/* Conditions Section */}
        {status?.conditions && (
          <div className="space-y-1 mt-2 border-t border-accent/10 dark:border-accent/10 pt-2">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">Conditions</span>
            {status.conditions
              .filter((c: any) => c.status === 'True' || c.type === 'Ready') // Show Ready (always) + other active conditions
              .map((c: any, i: number) => (
                <div key={i} className="flex justify-between text-[10px]">
                  <span className="truncate text-foreground/70">{c.type}</span>
                  <span className={c.status === 'True'
                    ? (c.type === 'Ready' ? "text-green-500" : "text-amber-500")
                    : "text-red-500"
                  }>
                    {c.status}
                  </span>
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
                  Node
                </span>
                <span className="text-sm font-bold truncate text-foreground leading-tight">
                  {nodeName}
                </span>
              </div>
              <div className="flex-shrink-0">
                {getStatusIcon()}
              </div>
            </div>

            <div className="text-[10px] text-muted-foreground truncate italic opacity-70">
              Click to view node details page
            </div>

            {renderContent()}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
