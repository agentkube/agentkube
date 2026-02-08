import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, HardDrive, Cpu, Database, ChevronDown, ArrowRight, X, Download } from "lucide-react";
import { getNodes, getPods } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';
import { V1Node, V1Pod } from '@kubernetes/client-node';
import { Progress } from "@/components/ui/progress";
import { OPERATOR_URL } from "@/config";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useNavigate } from 'react-router-dom';
import MetricsServerInstallationDialog from '@/components/custom/metrics-server/metricssvrinstallationdialog.component';

const ResourceUsageChart = () => {
  const { currentContext, isMetricsServerInstalled } = useCluster();
  const [nodes, setNodes] = useState<V1Node[]>([]);
  const [pods, setPods] = useState<V1Pod[]>([]);
  const [nodeMetrics, setNodeMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeIndex, setSelectedNodeIndex] = useState(0);
  const [showInstallDialog, setShowInstallDialog] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    const fetchData = async () => {
      if (!currentContext) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        // Fetch nodes
        const nodeData = await getNodes(currentContext.name);
        setNodes(nodeData);

        // Fetch pods
        const podData = await getPods(currentContext.name);
        setPods(podData);

        // Fetch node metrics only if metrics server is installed
        if (isMetricsServerInstalled) {
          try {
            const response = await fetch(`${OPERATOR_URL}/clusters/${currentContext.name}/apis/metrics.k8s.io/v1beta1/nodes`, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
              },
            });

            if (response.ok) {
              const data = await response.json();
              setNodeMetrics(data.items || []);
            }
          } catch (metricErr) {
            console.error('Failed to fetch metrics:', metricErr);
            // Continue without metrics
          }
        } else {
          setNodeMetrics(null);
        }

        setError(null);
      } catch (err) {
        console.error('Failed to fetch data:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currentContext]);

  // Set up metrics refresh interval
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (currentContext && isMetricsServerInstalled) {
        fetchNodeMetrics();
      }
    }, 10000); // Refresh every 10 seconds

    return () => clearInterval(intervalId);
  }, [currentContext, isMetricsServerInstalled]);

  // Function to fetch just the metrics
  const fetchNodeMetrics = async () => {
    if (!currentContext || !isMetricsServerInstalled) {
      setNodeMetrics(null);
      return;
    }

    try {
      const response = await fetch(`${OPERATOR_URL}/clusters/${currentContext.name}/apis/metrics.k8s.io/v1beta1/nodes`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setNodeMetrics(data.items || []);
      }
    } catch (err) {
      console.error('Failed to fetch node metrics:', err);
    }
  };

  // Helper function to calculate total cluster resources
  const calculateClusterResources = () => {
    if (!nodes.length) {
      return {
        cpuTotal: 0,
        memoryTotal: 0,
        nodeCount: 0
      };
    }

    // Calculate totals from node data
    let cpuTotal = 0;
    let memoryTotal = 0;

    nodes.forEach(node => {
      const capacity = node.status?.capacity || {};
      cpuTotal += parseInt(capacity.cpu || '0');
      memoryTotal += parseInt((capacity.memory || '0Ki').replace('Ki', ''));
    });

    return {
      cpuTotal,
      memoryTotal,
      nodeCount: nodes.length
    };
  };

  // Helper function to calculate usage and resource stats for a specific node
  const calculateNodeResources = (nodeIndex: number) => {
    if (!nodes.length || nodeIndex >= nodes.length) {
      return {
        nodeName: "No Node",
        cpuTotal: 0,
        cpuUsed: 0,
        cpuPercent: 0,
        memoryTotal: 0,
        memoryUsed: 0,
        memoryPercent: 0,
        storageTotal: 0,
        storagePercent: 0, // TODO Mock data
        podCount: 0,
        podCapacity: 0,
        uptime: "N/A"
      };
    }

    const node = nodes[nodeIndex];

    // Get node capacity
    const capacity = node.status?.capacity || {};
    const cpuTotal = parseInt(capacity.cpu || '0');
    const memoryTotal = parseInt((capacity.memory || '0Ki').replace('Ki', ''));
    const storageTotal = parseInt((capacity['ephemeral-storage'] || '0Ki').replace('Ki', ''));
    const podCapacity = parseInt(capacity.pods || '0');

    // Get node metrics
    let cpuUsed = 0;
    let memoryUsed = 0;

    if (nodeMetrics) {
      const nodeMetric = nodeMetrics.find((metric: any) =>
        metric.metadata?.name === node.metadata?.name
      );

      if (nodeMetric && nodeMetric.usage) {
        // Parse CPU (handle 'n' for nanocores or 'm' for millicores)
        const cpuValue = nodeMetric.usage.cpu || '0';
        if (cpuValue.endsWith('n')) {
          cpuUsed = parseInt(cpuValue) / 1000000000;
        } else if (cpuValue.endsWith('m')) {
          cpuUsed = parseInt(cpuValue) / 1000;
        } else {
          cpuUsed = parseInt(cpuValue);
        }

        // Parse memory (handle Ki, Mi, Gi)
        const memValue = nodeMetric.usage.memory || '0Ki';
        if (memValue.endsWith('Ki')) {
          memoryUsed = parseInt(memValue);
        } else if (memValue.endsWith('Mi')) {
          memoryUsed = parseInt(memValue) * 1024;
        } else if (memValue.endsWith('Gi')) {
          memoryUsed = parseInt(memValue) * 1024 * 1024;
        }
      } else {
        // No metrics available for this node
        cpuUsed = 0;
        memoryUsed = 0;
      }
    } else {
      // No metrics available
      cpuUsed = 0;
      memoryUsed = 0;
    }

    // Count pods on this node
    const nodePods = pods.filter(pod => pod.spec?.nodeName === node.metadata?.name);
    const runningPods = nodePods.filter(pod => pod.status?.phase === 'Running').length;

    // Estimate node uptime (normally we would use metrics for this)
    const creationTime = node.metadata?.creationTimestamp ? new Date(node.metadata.creationTimestamp) : null;
    let uptime = "N/A";
    if (creationTime) {
      const now = new Date();
      const diffMs = now.getTime() - creationTime.getTime();
      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      uptime = `${days} days, ${hours} hours`;
    }

    return {
      nodeName: node.metadata?.name || "Unknown Node",
      cpuTotal,
      cpuUsed,
      cpuPercent: cpuTotal > 0 ? (cpuUsed / cpuTotal) * 100 : 0,
      memoryTotal,
      memoryUsed,
      memoryPercent: memoryTotal > 0 ? (memoryUsed / memoryTotal) * 100 : 0,
      storageTotal,
      storagePercent: 0, // Storage metrics not available
      podCount: nodePods.length,
      podCapacity,
      uptime
    };
  };

  // Format memory to make it human readable
  const formatMemory = (kiBytes: number) => {
    if (kiBytes < 1024) {
      return `${kiBytes} KiB`;
    } else if (kiBytes < 1024 * 1024) {
      return `${(kiBytes / 1024).toFixed(2)} MiB`;
    } else {
      return `${(kiBytes / 1024 / 1024).toFixed(2)} GiB`;
    }
  };

  // Calculate total cluster resources
  const clusterResources = calculateClusterResources();

  // Calculate resources for the selected node
  const nodeResources = calculateNodeResources(selectedNodeIndex);

  const handleNodeChange = (value: string) => {
    const index = parseInt(value);
    if (!isNaN(index) && index >= 0 && index < nodes.length) {
      setSelectedNodeIndex(index);
    }
  };

  return (
    <>
      <Card className="bg-white dark:bg-transparent border-gray-200/50 dark:border-gray-700/20">
        <CardContent className="p-6">
          <div className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-pulse text-center">
                  <div className="h-8 w-48 bg-gray-300 dark:bg-gray-700 rounded mx-auto mb-4"></div>
                  <div className="h-6 w-64 bg-gray-300 dark:bg-gray-700 rounded mx-auto"></div>
                </div>
              </div>
            ) : (
              <>
                {/* Cluster info display at the top */}
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-sm uppercase font-medium text-gray-700 dark:text-gray-500 mb-2">Cluster Overview</h2>
                    <div className="text-5xl font-light text-gray-900 dark:text-white flex items-center gap-3">
                      {clusterResources.nodeCount} Nodes
                    </div>
                    <div>{clusterResources.cpuTotal} CPUs · {formatMemory(clusterResources.memoryTotal)} RAM</div>
                  </div>

                  {/* Node selector dropdown */}
                  <div className="flex items-center gap-2">
                    <div className="w-64 space-y-2">
                      <Select value={selectedNodeIndex.toString()} onValueChange={handleNodeChange}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a node" />
                        </SelectTrigger>
                        <SelectContent className="bg-white dark:bg-[#111827]/30 backdrop-blur-sm">
                          {nodes.map((node, index) => (
                            <SelectItem key={node.metadata?.uid || index} value={index.toString()}>
                              {node.metadata?.name || `Node ${index + 1}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {/* Metrics Server Status Indicator */}
                      {!isMetricsServerInstalled && (
                        <div className="flex items-center justify-between gap-2 px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-md text-sm">
                          <div className="flex items-center gap-1">
                            <X className="h-4 w-4" />
                            <span>Metrics Server</span>
                          </div>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => setShowInstallDialog(true)}
                                  className="p-0.5 hover:bg-red-200 dark:hover:bg-red-800/50 rounded transition-colors"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="bg-card text-foreground">
                                <p>Install Metrics Server</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      )}
                    </div>


                  </div>
                </div>

                <div className="text-xl font-light text-gray-900 dark:text-white flex items-center gap-3">
                  <span className="font-bold text-gray-500 dark:text-gray-400">Node:</span>{" "}
                  <span className='hover:text-blue-500 dark:hover:text-blue-500 cursor-pointer' onClick={() => navigate(`/dashboard/explore/nodes/${nodeResources.nodeName}`)}>
                    {nodeResources.nodeName}
                  </span>
                </div>

                <div className="flex gap-3 flex-wrap">
                  <div className="bg-gray-100 dark:bg-gray-800/30 px-3 py-2 rounded-lg">
                    <span className="text-gray-500 dark:text-gray-400">CPUs: </span>
                    <span className="font-medium">{nodeResources.cpuTotal}</span>
                  </div>
                  <div className="bg-gray-100 dark:bg-gray-800/30 px-3 py-2 rounded-lg">
                    <span className="text-gray-500 dark:text-gray-400">Memory: </span>
                    <span className="font-medium">{formatMemory(nodeResources.memoryTotal)}</span>
                  </div>
                  <div className="bg-gray-100 dark:bg-gray-800/30 px-3 py-2 rounded-lg flex items-center gap-1">
                    <Clock className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                    <span className="text-gray-500 dark:text-gray-400">Uptime: </span>
                    <span className="font-medium">{nodeResources.uptime}</span>
                  </div>
                  <div
                    className="bg-gray-100 dark:bg-gray-800/30 hover:bg-gray-200 dark:hover:bg-gray-700/30 cursor-pointer px-3 py-2 rounded-lg flex items-center gap-1"
                    onClick={() => navigate(`/dashboard/explore/nodes/${nodeResources.nodeName}`)}
                  >
                    <Clock className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                    <span className="text-gray-500 dark:text-gray-400">View Node</span> <ArrowRight className="h-4 w-4" />
                  </div>
                </div>

                <div className="flex gap-6 mt-4 h-64 items-end">
                  {/* CPU Usage Section */}
                  <div className="flex-1 h-full flex flex-col justify-end">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-semibold text-gray-700 dark:text-gray-300">{nodeResources.cpuPercent.toFixed(1)}%</span>
                      <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <Cpu className="h-4 w-4" /> CPU
                      </span>
                    </div>
                    <div className="bg-indigo-400/70 dark:bg-indigo-400/50 rounded-md h-full" style={{
                      height: `${nodeResources.cpuPercent}%`,
                      minHeight: '5%' // Ensure there's always a visible bar
                    }}></div>
                  </div>

                  {/* Memory Usage Section */}
                  <div className="flex-1 h-full flex flex-col justify-end">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-semibold text-gray-700 dark:text-gray-300">{nodeResources.memoryPercent.toFixed(1)}%</span>
                      <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <Database className="h-4 w-4" /> Memory
                      </span>
                    </div>
                    <div className="bg-indigo-400/70 dark:bg-indigo-400/50 rounded-md h-full" style={{
                      height: `${nodeResources.memoryPercent}%`,
                      minHeight: '5%' // Ensure there's always a visible bar
                    }}></div>
                  </div>

                  {/* Storage Usage Section */}
                  <div className="flex-1 h-full flex flex-col justify-end">
                    <div className="flex justify-between items-center mb-4">
                      <span className="font-semibold text-gray-700 dark:text-gray-300">{nodeResources.storagePercent.toFixed(1)}%</span>
                      <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <HardDrive className="h-4 w-4" /> Storage
                      </span>
                    </div>
                    <div className="bg-green-600 dark:bg-green-700 rounded-md h-full" style={{
                      height: `${nodeResources.storagePercent}%`,
                      minHeight: '5%' // Ensure there's always a visible bar
                    }}></div>
                  </div>
                </div>

                <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400 mt-2">
                  <span>Pods: {nodeResources.podCount} Running</span>
                  <span>Last update: {new Date().toLocaleTimeString()}</span>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Metrics Server Installation Dialog */}
      <MetricsServerInstallationDialog
        open={showInstallDialog}
        onOpenChange={setShowInstallDialog}
      />
    </>
  );
};

export default ResourceUsageChart;