import React, { useState, useEffect } from 'react';
import { K8sResourceData } from '@/utils/kubernetes-graph.utils';
import { V1Ingress } from '@kubernetes/client-node';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Loader2,
  Copy,
  CheckCircle,
  Shuffle
} from 'lucide-react';
import { useCluster } from '@/contexts/clusterContext';
import { getResource } from '@/api/internal/resources';
import { toast } from '@/hooks/use-toast';

interface IngressViewProps {
  resourceData: K8sResourceData;
}

interface IngressData extends V1Ingress { }

export const IngressView: React.FC<IngressViewProps> = ({ resourceData }) => {
  const [ingressData, setIngressData] = useState<IngressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const { currentContext } = useCluster();

  useEffect(() => {
    const fetchIngressData = async () => {
      if (!currentContext?.name || !resourceData.resourceName || !resourceData.namespace) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await getResource<'ingresses'>(
          currentContext.name,
          'ingresses',
          resourceData.resourceName,
          resourceData.namespace,
          'networking.k8s.io'
        );

        setIngressData(response);
      } catch (err) {
        console.error('Failed to fetch ingress data:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch ingress data');
      } finally {
        setLoading(false);
      }
    };

    fetchIngressData();
  }, [currentContext?.name, resourceData.resourceName, resourceData.namespace]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedPath(text);
      toast({
        title: "Copied to clipboard",
        description: `"${text}" has been copied`,
        duration: 2000,
      });
      setTimeout(() => setCopiedPath(null), 2000);
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin dark:text-gray-300" />
        <span className="ml-2 text-sm text-gray-500">Loading ingress data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }

  if (!ingressData) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-gray-500 dark:text-gray-400">No ingress data available</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-4  text-sm">

        {/* Render each service from ingress rules */}
        {ingressData.spec?.rules?.map((rule, ruleIndex) => (
          <div key={ruleIndex} className="ml-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-purple-600 dark:text-purple-400">
                <Shuffle className='h-4 w-4' />
              </span>
              <span className="text-gray-800 dark:text-gray-200 font-medium text-lg">
                {resourceData.resourceName}
              </span>
            </div>
            <div className='font-mono'>

              {rule.http?.paths?.map((path, pathIndex) => (
                <div key={pathIndex} className="ml-8 space-y-1">
                  <div className="text-gray-600 dark:text-gray-400">
                    Service: <span className="text-gray-800 dark:text-gray-200">{path.backend.service?.name}</span>
                  </div>

                  <div className="text-gray-600 dark:text-gray-400">
                    Host: <span className="text-gray-800 dark:text-gray-200">{rule.host}</span>
                  </div>

                  {/* Paths with copy functionality */}
                  {path.path && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className="ml-8 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800/50 p-1 rounded flex items-center gap-2 w-fit"
                          onClick={() => copyToClipboard(path.path!)}
                        >
                          <span className="text-gray-800 dark:text-gray-200">{path.path}</span>
                          {copiedPath === path.path ? (
                            <CheckCircle className="h-3 w-3 text-green-500" />
                          ) : (
                            <Copy className="h-3 w-3 text-gray-400 hover:text-gray-600" />
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Click to copy path</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </TooltipProvider>
  );
};