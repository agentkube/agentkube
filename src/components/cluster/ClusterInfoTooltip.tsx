import React, { useState, useEffect, memo } from 'react';
import { AlertTriangle, CheckCircle, Loader2, Server, User, Folder, Copy, Check } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ClusterItem } from './ClusterCard';
import { OPERATOR_URL } from '@/config';
import KUBERNETES_LOGO from '@/assets/kubernetes-blue.png';
import { AWS_PROVIDER, AWS_PROVIDER_DARK, AZURE_PROVIDER, DOCKER_PROVIDER, GCP_PROVIDER, MINIKUBE_PROVIDER } from '@/assets/providers';

interface ClusterInfo {
  health: 'ok' | 'bad_gateway' | 'loading';
  version?: string;
  server?: string;
  kubeContext?: {
    cluster: string;
    user: string;
  };
  source?: string;
  kubeconfig?: string;
}

// Memoized ClusterIcon component
const ClusterIcon = memo<{ type: ClusterItem['type']; theme?: string }>(({ type, theme }) => {
  const iconProps = { className: 'h-6 w-6' };

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

interface ClusterInfoTooltipProps {
  cluster: ClusterItem;
  children: React.ReactNode;
  contexts: any[]; // KubeContext[]
  theme?: string;
}

const ClusterInfoTooltip: React.FC<ClusterInfoTooltipProps> = ({ cluster, children, contexts, theme }) => {
  const [clusterInfo, setClusterInfo] = useState<ClusterInfo>({ health: 'loading' });
  const [copiedServer, setCopiedServer] = useState(false);

  // Find the context for this cluster
  const context = contexts.find(ctx => ctx.name === cluster.id);

  useEffect(() => {
    const fetchClusterInfo = async () => {
      try {
        // Check health status
        const healthPromise = fetch(`${OPERATOR_URL}/clusters/${cluster.id}/healthz`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });

        // Get Kubernetes version
        const versionPromise = fetch(`${OPERATOR_URL}/clusters/${cluster.id}/version`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });

        const [healthResponse, versionResponse] = await Promise.allSettled([healthPromise, versionPromise]);

        let healthStatus: 'ok' | 'bad_gateway' = 'bad_gateway';
        if (healthResponse.status === 'fulfilled') {
          if (healthResponse.value.status === 502) {
            healthStatus = 'bad_gateway';
          } else if (healthResponse.value.ok) {
            healthStatus = 'ok';
          }
        }

        let version = 'Unknown';
        if (versionResponse.status === 'fulfilled' && versionResponse.value.ok) {
          try {
            const versionData = await versionResponse.value.json();
            version = versionData.gitVersion || versionData.major + '.' + versionData.minor || 'Unknown';
          } catch (e) {
            console.warn('Failed to parse version response');
          }
        }

        setClusterInfo({
          health: healthStatus,
          version,
          server: context?.server,
          kubeContext: context?.kubeContext,
          source: context?.meta_data?.source,
          kubeconfig: context?.meta_data?.origin?.kubeconfig,
        });

      } catch (error) {
        console.error('Failed to fetch cluster info:', error);
        setClusterInfo({
          health: 'bad_gateway',
          server: context?.server,
          kubeContext: context?.kubeContext,
          source: context?.meta_data?.source,
          kubeconfig: context?.meta_data?.origin?.kubeconfig,
        });
      }
    };

    fetchClusterInfo();
  }, [cluster.id, context]);

  const getHealthIcon = () => {
    switch (clusterInfo.health) {
      case 'ok':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'bad_gateway':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'loading':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getHealthText = () => {
    switch (clusterInfo.health) {
      case 'ok':
        return 'Healthy';
      case 'bad_gateway':
        return 'Bad Gateway';
      case 'loading':
        return 'Checking...';
      default:
        return 'Unknown';
    }
  };

  // Copy server URL to clipboard
  const copyServerToClipboard = async () => {
    if (clusterInfo.server) {
      try {
        await navigator.clipboard.writeText(clusterInfo.server);
        setCopiedServer(true);
        setTimeout(() => setCopiedServer(false), 2000);
      } catch (err) {
        console.error('Failed to copy server URL:', err);
      }
    }
  };

  // Truncate server URL for display
  const truncateServerUrl = (url: string, maxLength: number = 30) => {
    if (url.length <= maxLength) return url;
    return url.substring(0, maxLength) + '...';
  };

  return (
    <TooltipProvider>
      <Tooltip delayDuration={500}>
        <TooltipTrigger asChild>
          {children}
        </TooltipTrigger>
        <TooltipContent
          className="bg-card/95 backdrop-blur-xl border border-border p-4 rounded-xl shadow-lg w-96 p-0"
          side="top"
          align="end"
        >
          <div className="space-y-2">
            {/* Header with logo, cluster name and version */}
            <div className="flex items-center p-3 bg-secondary/20 justify-between gap-3 pb-2">
              <div className="w-8 h-8 rounded-lg bg-secondary/30 flex items-center justify-center">
                <ClusterIcon type={cluster.type} theme={theme} />
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-foreground">
                  {cluster.name}
                </div>
                {clusterInfo.version && clusterInfo.version !== 'Unknown' && (
                  <div className="text-xs text-muted-foreground">
                    {clusterInfo.version}
                  </div>
                )}
              </div>
            </div>

            <div className='p-3 space-y-2'>
              {/* Health Status */}
              <div className="flex items-center justify-between  gap-2">
                {getHealthIcon()}
                <span className={`text-sm ${clusterInfo.health === 'ok' ? 'text-green-500' :
                  clusterInfo.health === 'bad_gateway' ? 'text-red-500' :
                    'text-blue-500'
                  }`}>
                  {getHealthText()}
                </span>
              </div>


              {/* Server */}
              {clusterInfo.server && (
                <div className="flex items-center justify-between gap-2">
                  <Server className="h-4 w-4 text-muted-foreground" />
                  <div className="flex items-center justify-between ">

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground font-mono">
                        {truncateServerUrl(clusterInfo.server)}
                      </span>
                      <button
                        onClick={copyServerToClipboard}
                        className="p-1 hover:bg-secondary rounded transition-colors"
                        title="Copy server URL"
                      >
                        {copiedServer ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}


              {/* Source */}
              {clusterInfo.source && (
                <div className="flex items-center justify-between gap-2">
                  <Folder className="h-4 w-4 text-muted-foreground" />
                  <span className={`text-sm px-1.5 py-0.5 rounded text-xs font-medium ${clusterInfo.source === 'kubeconfig'
                    ? 'bg-blue-500/10 text-blue-500'
                    : 'bg-purple-500/10 text-purple-500'
                    }`}>
                    {clusterInfo.source === 'kubeconfig' ? 'System' : 'External'}
                  </span>
                </div>
              )}

            </div>

          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default ClusterInfoTooltip;