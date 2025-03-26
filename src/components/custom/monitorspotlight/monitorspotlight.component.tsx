import React, { useState, useEffect } from 'react';
import { Loader2, Check } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { MetricsPerNamespace } from "@/types/cluster";
import { getClusterNamespacedMetrics } from "@/api/internal/metrics";
import { useNamespace } from '@/contexts/useNamespace';
import { listResources } from '@/api/internal/resources';
import { ChartProps, charts, PodMetricsProps } from './charts/charts.monitorspotlight';

interface MonitorSpotlightProps {
  query: string;
}

const MonitorSpotlight: React.FC<MonitorSpotlightProps> = ({ query }) => {
  const [metrics, setMetrics] = useState<MetricsPerNamespace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { selectedNamespaces, availableNamespaces, setSelectedNamespaces } = useNamespace();

  // Pod state
  const [pods, setPods] = useState<string[]>([]);
  const [selectedPod, setSelectedPod] = useState<string>('');

  // Namespace filter state
  const [open, setOpen] = useState(false);
  const [searchNamespace, setSearchNamespace] = useState("");

  // Fetch metrics
  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const data = await getClusterNamespacedMetrics();
        setMetrics(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch metrics');
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, []);

  // Fetch pods for selected namespace
  useEffect(() => {
    const fetchPods = async () => {
      if (selectedNamespaces.length === 0) {
        setPods([]);
        return;
      }

      try {
        const response = await listResources(
          selectedNamespaces,
          'pods'
        );
        const podNames = response.map((pod: any) => pod.name);
        setPods(podNames);

        // Reset selected pod if it's not in the new pod list
        if (selectedPod && !podNames.includes(selectedPod)) {
          setSelectedPod('');
        }
      } catch (err) {
        console.error('Failed to fetch pods:', err);
        setPods([]);
      }
    };

    fetchPods();
  }, [selectedNamespaces]);

  if (loading) {
    return (
      <div className="px-4 py-2">
        <div className="flex justify-center items-center h-56">
          <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
        </div>
      </div>
    );
  }

  if (error || metrics.length === 0) {
    return (
      <div className="px-4 py-2">
        <div className="flex items-center justify-center h-56 text-gray-500">
          {error || 'No metrics data available'}
        </div>
      </div>
    );
  }

  const filteredNamespaces = availableNamespaces.filter(namespace =>
    namespace.toLowerCase().includes(searchNamespace.toLowerCase())
  );

  const toggleNamespace = (namespace: string) => {
    if (selectedNamespaces.includes(namespace)) {
      setSelectedNamespaces(selectedNamespaces.filter(ns => ns !== namespace));
    } else {
      setSelectedNamespaces([...selectedNamespaces, namespace]);
    }
  };

  const selectAll = () => {
    setSelectedNamespaces(availableNamespaces);
  };

  const clearAll = () => {
    setSelectedNamespaces([]);
  };

  const handlePodSelect = (pod: string) => {
    setSelectedPod(pod);
  };

  // Filter charts based on query
  const filteredCharts = charts.filter(chart => {
    const lowercaseQuery = query.toLowerCase();
    if (lowercaseQuery.includes('memory')) {
      return chart.title.toLowerCase().includes('memory');
    }
    if (lowercaseQuery.includes('cpu')) {
      return chart.title.toLowerCase().includes('cpu');
    }
    if (lowercaseQuery.includes('pod')) {
      return chart.title.toLowerCase().includes('pod');
    }
    return true; 
  });

  return (
    <div className="px-2 py-2">
      <div className="flex flex-col space-y-6">
        {/* Charts */}
        <div className="space-y-1">
          {filteredCharts.slice(0, 1).map((chart, index) => (
            <div key={index} className="rounded-lg px-4">
              {chart.type === 'pod' ?
                chart.component({
                  metrics,
                  selectedNamespaces,
                  selectedPod,
                  onPodSelect: handlePodSelect,
                  pods
                } as PodMetricsProps) :
                chart.component({
                  metrics,
                  selectedNamespaces
                } as ChartProps)
              }
            </div>
          ))}
        </div>

        {/* Namespace Filter */}
        <div className="flex flex-end justify-end">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-56 bg-gray-100 justify-between border border-gray-500 rounded-[0.4rem]"
              >
                {selectedNamespaces.length === 0
                  ? "Select namespaces..."
                  : `${selectedNamespaces.length === availableNamespaces.length ? "All" : selectedNamespaces.length} namespace selected`}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 bg-gray-100 rounded-xl" align="end">
              <div className="space-y-2">
                <Input
                  placeholder="Search namespaces..."
                  value={searchNamespace}
                  onChange={(e) => setSearchNamespace(e.target.value)}
                  className="border border-gray-300"
                />

                <div className="flex justify-between pb-2 border-b border-gray-200">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={selectAll}
                    className="text-xs"
                  >
                    Select All
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAll}
                    className="text-xs"
                  >
                    Clear All
                  </Button>
                </div>

                <div className="max-h-[200px] overflow-y-auto space-y-1">
                  {filteredNamespaces.map((namespace) => (
                    <div
                      key={namespace}
                      onClick={() => toggleNamespace(namespace)}
                      className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-100 rounded-sm cursor-pointer"
                    >
                      <div
                        className={cn(
                          "h-4 w-4 border rounded flex items-center justify-center",
                          selectedNamespaces.includes(namespace)
                            ? "bg-primary border-primary"
                            : "border-gray-400"
                        )}
                      >
                        {selectedNamespaces.includes(namespace) && (
                          <Check className="h-3 w-3 text-primary-foreground" />
                        )}
                      </div>
                      <span className="text-sm">{namespace}</span>
                    </div>
                  ))}
                  {filteredNamespaces.length === 0 && (
                    <div className="text-sm text-gray-500 text-center py-2">
                      No namespaces found
                    </div>
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
};

export default MonitorSpotlight;