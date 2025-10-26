import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Copy, CheckCheck, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCluster } from '@/contexts/clusterContext';
import { kubeProxyRequest } from '@/api/cluster';
import {
  getContainerRecommendation,
  getMonitoringConfig,
  formatCPU,
  formatBytes,
  formatResourceForYAML,
  getChangePercentage,
  ContainerRecommendation,
} from '@/utils/recommend.utils';
import { Prism, SyntaxHighlighterProps } from 'react-syntax-highlighter';
import { nord } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { CSSProperties } from 'react';

const SyntaxHighlighter = (Prism as any) as React.FC<SyntaxHighlighterProps>;

interface RecommendationProps {
  resourceName: string;
  namespace: string;
  kind: string;
}

interface ContainerSpec {
  name: string;
  resources?: {
    requests?: {
      cpu?: string;
      memory?: string;
    };
    limits?: {
      cpu?: string;
      memory?: string;
    };
  };
}

interface PodOwnerInfo {
  labels?: Record<string, string>;
  ownerReferences?: Array<{
    kind: string;
    name: string;
  }>;
}

const Recommendation: React.FC<RecommendationProps> = ({ resourceName, namespace, kind }) => {
  const { currentContext } = useCluster();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<ContainerRecommendation[]>([]);
  const [copiedYaml, setCopiedYaml] = useState(false);
  const [podOwnerInfo, setPodOwnerInfo] = useState<PodOwnerInfo | null>(null);

  // Custom style for SyntaxHighlighter
  const customStyle: CSSProperties = {
    padding: '0.75rem',
    borderRadius: '0.375rem',
    background: 'transparent',
    fontSize: '0.75rem',
    margin: 0,
  };

  // Fetch pod spec to get containers and owner info
  const fetchPodSpec = useCallback(async (): Promise<ContainerSpec[]> => {
    if (!currentContext) return [];

    try {
      const response = await kubeProxyRequest(
        currentContext.name,
        `api/v1/namespaces/${namespace}/pods/${resourceName}`,
        'GET'
      );

      // Extract owner info
      if (response?.metadata) {
        setPodOwnerInfo({
          labels: response.metadata.labels,
          ownerReferences: response.metadata.ownerReferences,
        });
      }

      if (response?.spec?.containers) {
        return response.spec.containers;
      }
      return [];
    } catch (err) {
      console.error('Error fetching pod spec:', err);
      throw new Error('Failed to fetch pod specification');
    }
  }, [currentContext, namespace, resourceName]);

  // Fetch recommendations for all containers
  const fetchRecommendations = useCallback(async () => {
    if (!currentContext) return;

    setLoading(true);
    setError(null);

    try {
      // Get pod containers
      const containers = await fetchPodSpec();

      if (containers.length === 0) {
        setError('No containers found in pod');
        setLoading(false);
        return;
      }

      // Get monitoring config
      const prometheusConfig = getMonitoringConfig(currentContext.name);

      // Fetch recommendations for all containers in parallel
      const recommendationPromises = containers.map((container) => {
        const currentResources = {
          cpu: {
            request: container.resources?.requests?.cpu || '0',
            limit: container.resources?.limits?.cpu,
          },
          memory: {
            request: container.resources?.requests?.memory || '0',
            limit: container.resources?.limits?.memory,
          },
        };

        return getContainerRecommendation(
          currentContext.name,
          namespace,
          resourceName,
          container.name,
          currentResources,
          prometheusConfig
        );
      });

      const results = await Promise.all(recommendationPromises);
      setRecommendations(results);
    } catch (err) {
      console.error('Error fetching recommendations:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch recommendations');
    } finally {
      setLoading(false);
    }
  }, [currentContext, namespace, resourceName, fetchPodSpec]);

  // Generate YAML output
  const generateYAML = useCallback((): string => {
    if (recommendations.length === 0) return '';

    const yamlParts = recommendations.map((rec) => {
      if (!rec.recommended.cpu.request && !rec.recommended.memory.request) {
        return `# ${rec.containerName}: No recommendations available`;
      }

      const cpuReq = rec.recommended.cpu.request
        ? formatResourceForYAML(rec.recommended.cpu.request, 'cpu')
        : 'null';
      const memReq = rec.recommended.memory.request
        ? formatResourceForYAML(rec.recommended.memory.request, 'memory')
        : 'null';
      const memLim = rec.recommended.memory.limit
        ? formatResourceForYAML(rec.recommended.memory.limit, 'memory')
        : 'null';

      return `- name: ${rec.containerName}
  resources:
    requests:
      cpu: ${cpuReq}
      memory: ${memReq}
    limits:
      memory: ${memLim}`;
    });

    return `containers:\n${yamlParts.join('\n')}`;
  }, [recommendations]);

  // Copy YAML to clipboard
  const handleCopyYAML = async () => {
    try {
      await navigator.clipboard.writeText(generateYAML());
      setCopiedYaml(true);
      setTimeout(() => setCopiedYaml(false), 2000);
    } catch (err) {
      console.error('Failed to copy YAML:', err);
    }
  };

  // Get severity color
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return 'text-red-600 dark:text-red-400';
      case 'WARNING':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'GOOD':
        return 'text-green-600 dark:text-green-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="text-red-500 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      {/* Header with refresh button */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="flex items-center gap-1 text-sm font-light text-gray-900 dark:text-white">
            {podOwnerInfo?.ownerReferences?.[0] && (
              <>
                <div className="text-gray-400 text-xs py-1 px-2 rounded-xl dark:bg-blue-500/10 text-blue-500 dark:text-blue-400">
                  <p>
                    Controlled By
                  </p>
                </div>
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {podOwnerInfo.ownerReferences[0].kind}
                </span>
                <span className="text-gray-600 dark:text-gray-400">
                  {podOwnerInfo.ownerReferences[0].name}
                </span>
              </>
            )}
            {!podOwnerInfo?.ownerReferences?.[0] && (
              <span className="text-xs text-gray-500">Pod: {resourceName}</span>
            )}
          </h3>
        </div>

        <div className='flex gap-2 items-center'>
          <div className='text-xs text-blue-500 dark:text-blue-400 py-1 px-2 bg-blue-500/20 dark:bg-blue-500/10 rounded-md'>
            <p>Experimental</p>
          </div>
          <Button
            onClick={fetchRecommendations}
            variant="ghost"
            size="sm"
            className="flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Container Recommendations */}
      {recommendations.map((rec) => (
        <div
          key={rec.containerName}
          className="bg-white dark:bg-gray-800/20 rounded-lg border border-gray-200 dark:border-gray-700/30"
        >
          {/* Container Header */}
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700/30">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                {rec.containerName}
              </h4>
              <span className={`text-xs font-medium uppercase ${getSeverityColor(rec.severity)}`}>
                {rec.severity}
              </span>
            </div>
            {rec.oomDetected && (
              <div className="mt-2 flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
                <AlertTriangle className="h-4 w-4" />
                OOMKill detected - increase memory limits
              </div>
            )}
            {rec.info && (
              <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                {rec.info}
              </div>
            )}
          </div>

          {/* Recommendations Summary */}
          <div className="px-4 py-3 space-y-3">
            {/* CPU Recommendation */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500 w-16">CPU</span>
                <span className="text-gray-900 dark:text-white">
                  (Req) {formatCPU(rec.current.cpu.request)}
                </span>
                <span className="text-gray-400">→</span>
                <span className="font-medium text-blue-600 dark:text-blue-400">
                  {formatCPU(rec.recommended.cpu.request)}
                </span>
                {getChangePercentage(rec.current.cpu.request, rec.recommended.cpu.request) !== null && (
                  <span className={`text-xs flex items-center gap-1 ${(getChangePercentage(rec.current.cpu.request, rec.recommended.cpu.request) || 0) > 0
                      ? 'text-red-500'
                      : 'text-green-500'
                    }`}>
                    {(getChangePercentage(rec.current.cpu.request, rec.recommended.cpu.request) || 0) > 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {Math.abs(getChangePercentage(rec.current.cpu.request, rec.recommended.cpu.request) || 0).toFixed(1)}%
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500 w-16"></span>
                <span className="text-gray-900 dark:text-white">
                  (Lim) {formatCPU(rec.current.cpu.limit)}
                </span>
                <span className="text-gray-400">→</span>
                <span className="font-medium text-blue-600 dark:text-blue-400">none</span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 ml-[4.5rem]">
                {rec.explanation.cpu}
              </p>
            </div>

            {/* Memory Recommendation */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500 w-16">Memory</span>
                <span className="text-gray-900 dark:text-white">
                  (Req) {formatBytes(rec.current.memory.request)}
                </span>
                <span className="text-gray-400">→</span>
                <span className="font-medium text-purple-600 dark:text-purple-400">
                  {formatBytes(rec.recommended.memory.request)}
                </span>
                {getChangePercentage(rec.current.memory.request, rec.recommended.memory.request) !== null && (
                  <span className={`text-xs flex items-center gap-1 ${(getChangePercentage(rec.current.memory.request, rec.recommended.memory.request) || 0) > 0
                      ? 'text-red-500'
                      : 'text-green-500'
                    }`}>
                    {(getChangePercentage(rec.current.memory.request, rec.recommended.memory.request) || 0) > 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {Math.abs(getChangePercentage(rec.current.memory.request, rec.recommended.memory.request) || 0).toFixed(1)}%
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500 w-16"></span>
                <span className="text-gray-900 dark:text-white">
                  (Lim) {formatBytes(rec.current.memory.limit)}
                </span>
                <span className="text-gray-400">→</span>
                <span className="font-medium text-purple-600 dark:text-purple-400">
                  {formatBytes(rec.recommended.memory.limit)}
                </span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 ml-[4.5rem]">
                {rec.explanation.memory}
              </p>
            </div>
          </div>

          {/* Detailed Metrics */}
          {rec.metrics.cpu && (
            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700/30">
              <h5 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                Detailed Metrics
              </h5>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <div className="text-gray-500">CPU P99</div>
                  <div className="text-gray-900 dark:text-white font-medium">
                    {formatCPU(rec.metrics.cpu.p99)}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500">CPU Max</div>
                  <div className="text-gray-900 dark:text-white font-medium">
                    {formatCPU(rec.metrics.cpu.max)}
                  </div>
                </div>
                {rec.metrics.memory && (
                  <>
                    <div>
                      <div className="text-gray-500">Memory Max</div>
                      <div className="text-gray-900 dark:text-white font-medium">
                        {formatBytes(rec.metrics.memory.max)}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500">Memory Avg</div>
                      <div className="text-gray-900 dark:text-white font-medium">
                        {formatBytes(rec.metrics.memory.avg)}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      ))}

      {/* YAML Output */}
      {recommendations.length > 0 && (
        <div className="bg-white dark:bg-gray-800/20 rounded-lg border border-gray-200 dark:border-gray-700/30">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700/30 flex items-center justify-between">
            <h4 className="text-sm font-medium text-gray-900 dark:text-white">
              YAML Configuration
            </h4>
            <Button
              onClick={handleCopyYAML}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              {copiedYaml ? (
                <>
                  <CheckCheck className="h-4 w-4 text-green-500" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy
                </>
              )}
            </Button>
          </div>
          <div className="bg-gray-300/50 dark:bg-gray-800/50 rounded-md overflow-x-auto">
            <SyntaxHighlighter
              language="yaml"
              style={nord}
              customStyle={customStyle}
              wrapLines={true}
              showLineNumbers={false}
            >
              {generateYAML()}
            </SyntaxHighlighter>
          </div>
        </div>
      )}
    </div>
  );
};

export default Recommendation;
