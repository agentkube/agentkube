import React, { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Cpu,
  RefreshCw,
  ChevronDown,
  Check,
  ArrowUpRight,
  Filter,
  ArrowUpDown,
  Users
} from 'lucide-react';
import { SideDrawer, DrawerHeader, DrawerContent } from "@/components/ui/sidedrawer.custom";
import { kubeProxyRequest } from '@/api/cluster';
import { useCluster } from '@/contexts/clusterContext';
import { useNamespace } from '@/contexts/useNamespace';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

interface CpuPod {
  name: string;
  namespace: string;
  cpuUsage: number;
  cpuMillicores: number;
}

interface CpuDrilldownProps {
  isOpen: boolean;
  onClose: () => void;
  monitoringConfig: {
    namespace: string;
    service: string;
  };
}

const CpuDrilldown: React.FC<CpuDrilldownProps> = ({
  isOpen,
  onClose,
  monitoringConfig
}) => {
  const { currentContext } = useCluster();
  const { selectedNamespaces } = useNamespace();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [cpuPods, setCpuPods] = useState<CpuPod[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLimit, setSelectedLimit] = useState<number>(10);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<'cpu' | 'name' | 'namespace'>('cpu');

  const limitOptions = [10, 20, 50, 100];
  const sortOptions = [
    { value: 'cpu', label: 'CPU Usage' },
    { value: 'name', label: 'Pod Name' },
    { value: 'namespace', label: 'Namespace' }
  ];

  const fetchCpuPods = useCallback(async () => {
    if (!currentContext || !monitoringConfig.namespace || !monitoringConfig.service) return;

    try {
      setLoading(true);
      const basePath = `api/v1/namespaces/${monitoringConfig.namespace}/services/${monitoringConfig.service}/proxy/api/v1/query`;

      // Use the provided query with dynamic topk value
      const topPodsQuery = `topk(${selectedLimit}, sum by (namespace, pod) (rate(container_cpu_usage_seconds_total{container!="", image!=""}[5m])))`;
      const topPodsParams = new URLSearchParams({ query: topPodsQuery });
      const topPodsResponse = await kubeProxyRequest(currentContext.name, `${basePath}?${topPodsParams}`, 'GET');

      if (topPodsResponse.status === 'success' && topPodsResponse.data?.result?.length > 0) {
        const pods: CpuPod[] = topPodsResponse.data.result.map((item: any) => {
          const cpuCores = parseFloat(item.value[1]);
          return {
            name: item.metric.pod,
            namespace: item.metric.namespace,
            cpuUsage: cpuCores,
            cpuMillicores: cpuCores * 1000
          };
        });

        setCpuPods(pods);
      } else {
        setCpuPods([]);
      }
    } catch (err) {
      console.error('Error fetching CPU pods:', err);
      toast({
        title: "Error",
        description: "Failed to fetch CPU usage data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [currentContext, monitoringConfig, selectedLimit, toast]);

  useEffect(() => {
    if (isOpen) {
      fetchCpuPods();
    }
  }, [isOpen, selectedLimit, fetchCpuPods]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchCpuPods();
  };

  const handlePodClick = (pod: CpuPod) => {
    navigate(`/dashboard/explore/pods/${pod.namespace}/${pod.name}`);
    onClose();
  };

  // Calculate color intensity based on CPU usage
  const getPodColor = (pod: CpuPod, maxCpu: number) => {
    const ratio = pod.cpuUsage / maxCpu;
    const opacity = Math.max(0.1, ratio);

    // For high opacity (>0.7), use white text; for low opacity, use black text
    const textColor = opacity > 0.7 ? 'text-white' : 'text-black';
    const bgOpacity = Math.round(opacity * 200); // Convert to 0-200 range for gray scale

    return {
      backgroundColor: `rgb(${255 - bgOpacity}, ${255 - bgOpacity}, ${255 - bgOpacity})`,
      textColorClass: textColor
    };
  };

  // Filter and sort pods
  const filteredAndSortedPods = React.useMemo(() => {
    let filtered = cpuPods;

    // Filter by selected namespaces
    if (selectedNamespaces.length > 0) {
      filtered = cpuPods.filter(pod => selectedNamespaces.includes(pod.namespace));
    }

    // Sort based on selected criteria
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'cpu':
          return b.cpuUsage - a.cpuUsage; // Descending
        case 'name':
          return a.name.localeCompare(b.name); // Ascending
        case 'namespace':
          return a.namespace.localeCompare(b.namespace); // Ascending
        default:
          return 0;
      }
    });

    return sorted.slice(0, selectedLimit);
  }, [cpuPods, selectedNamespaces, sortBy, selectedLimit]);

  const formatCpuUsage = (cpuUsage: number): string => {
    if (cpuUsage >= 1) {
      return `${cpuUsage.toFixed(2)} cores`;
    } else {
      return `${(cpuUsage * 1000).toFixed(0)}m`;
    }
  };

  const maxCpu = filteredAndSortedPods.length > 0 ? Math.max(...filteredAndSortedPods.map(p => p.cpuUsage)) : 0;

  return (
    <SideDrawer isOpen={isOpen} onClose={onClose} offsetTop="-top-6">
      <DrawerHeader onClose={onClose}>
        <div className="flex items-center gap-2">
          <Cpu className="w-5 h-5 text-blue-600" />
          <h3 className="font-light text-lg text-gray-800 dark:text-gray-200">
            CPU Usage
          </h3>
        </div>
      </DrawerHeader>

      <DrawerContent>
        <div className="p-5 space-y-4">
          {/* Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-600 dark:text-gray-400">Show top</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="flex items-center gap-2 h-8">
                    <span className="text-sm">{selectedLimit}</span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-20 dark:bg-[#0B0D13]/30 backdrop-blur-md">
                  {limitOptions.map((limit) => (
                    <DropdownMenuItem
                      key={limit}
                      onClick={() => setSelectedLimit(limit)}
                      className="flex items-center justify-between cursor-pointer"
                    >
                      <span className="text-sm">{limit}</span>
                      {selectedLimit === limit && (
                        <Check className="h-4 w-4 text-blue-500" />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <span className="text-sm text-gray-600 dark:text-gray-400">pods</span>
            </div>

            <div className="flex items-center gap-2">
              {/* Sort Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="flex items-center gap-2 h-8">
                    <ArrowUpDown className="h-4 w-4" />
                    <span className="text-sm">{sortOptions.find(opt => opt.value === sortBy)?.label}</span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36 dark:bg-[#0B0D13]/30 backdrop-blur-md">
                  {sortOptions.map((option) => (
                    <DropdownMenuItem
                      key={option.value}
                      onClick={() => setSortBy(option.value as 'cpu' | 'name' | 'namespace')}
                      className="flex items-center justify-between cursor-pointer"
                    >
                      <span className="text-sm">{option.label}</span>
                      {sortBy === option.value && (
                        <Check className="h-4 w-4 text-blue-500" />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="outline"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex items-center gap-2 h-8"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span className="text-sm">Refresh</span>
              </Button>
            </div>
          </div>

          {/* Summary Statistics */}
          {filteredAndSortedPods.length > 0 && (
            <div className="bg-gray-50 dark:bg-gray-800/30 border border-gray-200/70 dark:border-gray-700/30 rounded-lg">
              <div className="p-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-3xl font-light text-gray-900 dark:text-gray-100">
                      {formatCpuUsage(filteredAndSortedPods[0]?.cpuUsage || 0)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Highest Usage</p>
                  </div>
                  <div>
                    <p className="text-3xl font-light text-gray-900 dark:text-gray-100">
                      {formatCpuUsage(
                        filteredAndSortedPods.reduce((sum, pod) => sum + pod.cpuUsage, 0) / filteredAndSortedPods.length
                      )}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Average Usage</p>
                  </div>
                  <div>
                    <p className="text-3xl font-light text-gray-900 dark:text-gray-100">
                      {formatCpuUsage(
                        filteredAndSortedPods.reduce((sum, pod) => sum + pod.cpuUsage, 0)
                      )}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Total Usage</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* CPU Pods List */}
          <div className="bg-transparent border-gray-200/70 dark:border-gray-700/30">
            <div className="pb-3 flex items-center justify-between">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Showing {filteredAndSortedPods.length} of {cpuPods.length} pods
              </p>
              <div className="flex items-center gap-2">
                <Users className="w-3 h-3 text-gray-400" />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {selectedNamespaces.length} namespace{selectedNamespaces.length !== 1 ? 's' : ''} selected
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400"></div>
                </div>
              ) : filteredAndSortedPods.length > 0 ? (
                <div className="space-y-0">
                  {filteredAndSortedPods.map((pod, index) => {
                    const colorStyle = getPodColor(pod, maxCpu);

                    return (
                      <TooltipProvider key={`${pod.namespace}-${pod.name}`}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className={`p-3 first:rounded-t-lg last:rounded-b-lg cursor-pointer hover:opacity-80 transition-all duration-200 ${colorStyle.textColorClass}`}
                              style={{ backgroundColor: colorStyle.backgroundColor }}
                              onClick={() => handlePodClick(pod)}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <span className="text-xs font-mono font-medium w-6">
                                      #{index + 1}
                                    </span>
                                    <Badge
                                      variant="outline"
                                      className={`text-xs ${colorStyle.textColorClass} border-current w-20 justify-center truncate`}
                                      title={pod.namespace}
                                    >
                                      {pod.namespace}
                                    </Badge>
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className={`text-sm font-medium truncate ${colorStyle.textColorClass}`}>
                                      {pod.name}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={`text-sm font-bold ${colorStyle.textColorClass}`}>
                                    {formatCpuUsage(pod.cpuUsage)}
                                  </span>
                                  <ArrowUpRight className={`w-4 h-4 ${colorStyle.textColorClass}`} />
                                </div>
                              </div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className='p-1.5 dark:bg-gray-200'>
                            <div className="text-xs">
                              <p><strong>Pod:</strong> {pod.name}</p>
                              <p><strong>Namespace:</strong> {pod.namespace}</p>
                              <p><strong>CPU:</strong> {formatCpuUsage(pod.cpuUsage)}</p>
                              <p><strong>Millicores:</strong> {pod.cpuMillicores.toFixed(0)}m</p>
                              <p className="text-gray-400 dark:text-gray-800 underline cursor-pointer mt-1">Click to view pod details</p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Cpu className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">No CPU data available</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Check your Prometheus configuration
                  </p>
                </div>
              )}
            </div>
          </div>


        </div>
      </DrawerContent>
    </SideDrawer>
  );
};

export default CpuDrilldown;