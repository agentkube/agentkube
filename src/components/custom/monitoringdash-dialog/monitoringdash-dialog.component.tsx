import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ExternalLink, Server, Copy, Globe } from "lucide-react";
import { SiGrafana, SiDatadog, SiNewrelic, SiPrometheus } from '@icons-pack/react-simple-icons';
import { SigNoz } from '@/assets/icons';
import {
  findToolInCluster,
  ToolInstance,
  ToolLookupResponse
} from '@/api/lookup';
import {
  startPortForward,
  getPortForwardUrl,
  openPortForwardInBrowser,
  PortForwardResponse
} from '@/api/internal/portforward';
import { listResources } from '@/api/internal/resources';
import { useTerminal } from '@/contexts/useTerminal';

interface MonitoringDashDialogProps {
  isOpen: boolean;
  onClose: () => void;
  clusterName: string;
  selectedTool: string; // e.g., 'grafana', 'prometheus', etc.
}

const toolIcons: Record<string, React.ReactElement> = {
  grafana: <SiGrafana className="h-4 w-4" />,
  prometheus: <SiPrometheus className="h-4 w-4" />,
  signoz: <SigNoz className="h-4 w-4" />,
  newrelic: <SiNewrelic className="h-4 w-4" />,
  datadog: <SiDatadog className="h-4 w-4" />,
  jaeger: <Server className="h-4 w-4" />,
  elastic: <Server className="h-4 w-4" />,
  kibana: <Server className="h-4 w-4" />,
};

const toolNames: Record<string, string> = {
  grafana: 'Grafana',
  prometheus: 'Prometheus',
  signoz: 'SigNoz',
  newrelic: 'New Relic',
  datadog: 'DataDog',
  jaeger: 'Jaeger',
  elastic: 'Elasticsearch',
  kibana: 'Kibana',
};

const MonitoringDashDialog: React.FC<MonitoringDashDialogProps> = ({
  isOpen,
  onClose,
  clusterName,
  selectedTool
}) => {
  const { toast } = useToast();
  const { openBrowserWithUrl } = useTerminal();
  const [loading, setLoading] = useState(false);
  const [fetchingInstances, setFetchingInstances] = useState(false);
  const [fetchingPods, setFetchingPods] = useState(false);
  const [toolInstances, setToolInstances] = useState<ToolInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string>('');
  const [selectedPort, setSelectedPort] = useState<string>('');
  const [availablePods, setAvailablePods] = useState<Array<{ name: string, ready: boolean }>>([]);
  const [selectedPod, setSelectedPod] = useState<string>('');
  const [portForwardResult, setPortForwardResult] = useState<PortForwardResponse | null>(null);

  // Fetch tool instances when dialog opens
  useEffect(() => {
    if (isOpen && clusterName && selectedTool) {
      fetchToolInstances();
    }
  }, [isOpen, clusterName, selectedTool]);

  // Auto-select instance and port if only one is available
  useEffect(() => {
    if (toolInstances.length === 1) {
      const instance = toolInstances[0];
      setSelectedInstance(instance.serviceAddress);

      // Auto-select first port
      if (instance.ports.length === 1) {
        setSelectedPort(instance.ports[0].port.toString());
      } else {
        // Try to find a common web port
        const webPort = instance.ports.find(p =>
          p.name?.includes('http') ||
          p.name?.includes('web') ||
          [80, 3000, 8080, 9090].includes(p.port)
        );
        if (webPort) {
          setSelectedPort(webPort.port.toString());
        }
      }

      // Fetch pods for the selected instance
      fetchPodsForInstance(instance);
    }
  }, [toolInstances]);

  const fetchToolInstances = async () => {
    try {
      setFetchingInstances(true);
      const response: ToolLookupResponse = await findToolInCluster(clusterName, selectedTool);

      if (response.instances && response.instances.length > 0) {
        setToolInstances(response.instances);
      } else {
        toast({
          title: "No instances found",
          description: `No ${toolNames[selectedTool] || selectedTool} instances found in cluster ${clusterName}`,
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error fetching tool instances:', error);
      toast({
        title: "Error",
        description: `Failed to find ${toolNames[selectedTool] || selectedTool} instances`,
        variant: "destructive"
      });
    } finally {
      setFetchingInstances(false);
    }
  };

  const fetchPodsForInstance = async (instance: ToolInstance) => {
    try {
      setFetchingPods(true);

      // Extract service name from serviceAddress
      const serviceName = instance.serviceAddress.split('.')[0];

      // Get the service to extract its selector
      const services = await listResources(clusterName, 'services', {
        namespace: instance.namespace,
        name: serviceName
      });

      if (services && services.length > 0 && services[0].spec?.selector) {
        const selector = services[0].spec.selector;

        // Build label selector string
        const labelSelector = Object.entries(selector)
          .map(([key, value]) => `${key}=${value}`)
          .join(',');

        // Fetch pods matching the selector
        const pods = await listResources(clusterName, 'pods', {
          namespace: instance.namespace,
          labelSelector
        });

        // Format pod information
        const podList = pods.map(pod => {
          const containerStatuses = pod.status?.containerStatuses || [];
          const allReady = containerStatuses.length > 0 &&
            containerStatuses.every(status => status.ready);

          return {
            name: pod.metadata?.name || '',
            ready: allReady
          };
        }).filter(pod => pod.name !== '');

        setAvailablePods(podList);

        // Auto-select the first ready pod
        const readyPod = podList.find(pod => pod.ready);
        if (readyPod) {
          setSelectedPod(readyPod.name);
        } else if (podList.length > 0) {
          setSelectedPod(podList[0].name);
        }
      }
    } catch (error) {
      console.error('Error fetching pods:', error);
    } finally {
      setFetchingPods(false);
    }
  };

  const handleInstanceChange = (serviceAddress: string) => {
    setSelectedInstance(serviceAddress);
    setSelectedPort('');
    setSelectedPod('');
    setAvailablePods([]);

    const instance = toolInstances.find(i => i.serviceAddress === serviceAddress);
    if (instance) {
      fetchPodsForInstance(instance);
    }
  };

  const handlePortForward = async () => {
    if (!selectedInstance || !selectedPort || !selectedPod) {
      toast({
        title: "Error",
        description: "Please select instance, port, and pod",
        variant: "destructive"
      });
      return;
    }

    const instance = toolInstances.find(i => i.serviceAddress === selectedInstance);
    if (!instance) return;

    setLoading(true);

    try {
      const selectedPortObj = instance.ports.find(p => p.port.toString() === selectedPort);
      const targetPort = selectedPortObj?.targetPort?.toString() || selectedPort;
      const serviceName = instance.serviceAddress.split('.')[0];

      const result = await startPortForward({
        namespace: instance.namespace,
        pod: selectedPod,
        service: serviceName,
        serviceNamespace: instance.namespace,
        targetPort,
        cluster: clusterName,
        port: undefined // Let it auto-assign
      });

      setPortForwardResult(result);

      toast({
        title: "Port Forward Started",
        description: `${toolNames[selectedTool]} dashboard available on localhost:${result.port}`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start port forward",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenInBrowser = () => {
    if (portForwardResult) {
      const url = getPortForwardUrl(portForwardResult.port?.toString() || '');
      openBrowserWithUrl(url, `${toolNames[selectedTool]} Dashboard`);
      handleClose();
    }
  };

  const handleOpenInExternalBrowser = () => {
    if (portForwardResult) {
      openPortForwardInBrowser(portForwardResult.port?.toString() || '');
    }
  };

  const handleClose = () => {
    setSelectedInstance('');
    setSelectedPort('');
    setSelectedPod('');
    setToolInstances([]);
    setAvailablePods([]);
    setPortForwardResult(null);
    onClose();
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied!",
        description: "Text copied to clipboard",
      });
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive"
      });
    }
  };

  const selectedInstanceObj = toolInstances.find(i => i.serviceAddress === selectedInstance);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px] bg-gray-200 dark:bg-[#0B0D13] backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {toolIcons[selectedTool]}
            Open {toolNames[selectedTool] || selectedTool} Dashboard
          </DialogTitle>
          <DialogDescription>
            Connect to {toolNames[selectedTool] || selectedTool} dashboard in cluster {clusterName}
          </DialogDescription>
        </DialogHeader>

        {!portForwardResult ? (
          <div className="grid gap-4 py-4">
            {/* Instance Selection */}
            {toolInstances.length > 1 && (
              <div className="grid grid-cols-4 items-center gap-4">
                <label className="text-right text-sm font-medium">
                  Instance
                </label>
                <Select
                  value={selectedInstance}
                  onValueChange={handleInstanceChange}
                  disabled={fetchingInstances}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Select instance" />
                  </SelectTrigger>
                  <SelectContent className='bg-gray-200 dark:bg-[#0B0D13]/70 backdrop-blur-md'>
                    {toolInstances.map((instance) => (
                      <SelectItem key={instance.serviceAddress} value={instance.serviceAddress}>
                        {instance.serviceAddress} ({instance.namespace})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Port Selection */}
            {selectedInstanceObj && selectedInstanceObj.ports.length > 1 && (
              <div className="grid grid-cols-4 items-center gap-4">
                <label className="text-right text-sm font-medium">
                  Port
                </label>
                <Select
                  value={selectedPort}
                  onValueChange={setSelectedPort}
                  disabled={fetchingInstances || fetchingPods}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Select port" />
                  </SelectTrigger>
                  <SelectContent className='bg-gray-200 dark:bg-[#0B0D13]/70 backdrop-blur-md'>
                    {selectedInstanceObj.ports.map((port) => (
                      <SelectItem key={`${port.port}-${port.name || ''}`} value={port.port.toString()}>
                        {port.port}
                        {port.name ? ` (${port.name})` : ''}
                        {port.protocol ? ` - ${port.protocol}` : ''}
                        {port.targetPort && port.targetPort !== port.port ? ` � ${port.targetPort}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Pod Selection */}
            {availablePods.length > 1 && (
              <div className="grid grid-cols-4 items-center gap-4">
                <label className="text-right text-sm font-medium">
                  Pod
                </label>
                <Select
                  value={selectedPod}
                  onValueChange={setSelectedPod}
                  disabled={fetchingInstances || fetchingPods}
                >
                  <SelectTrigger className="col-span-3">
                    {fetchingPods ? (
                      <div className="flex items-center">
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Loading pods...
                      </div>
                    ) : (
                      <SelectValue placeholder="Select pod" />
                    )}
                  </SelectTrigger>
                  <SelectContent className='bg-gray-200 dark:bg-[#0B0D13]/70 backdrop-blur-md'>
                    {availablePods.map((pod) => (
                      <SelectItem key={pod.name} value={pod.name}>
                        {pod.name} {pod.ready ? '(Ready)' : '(Not Ready)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Instance Info */}
            {selectedInstanceObj && (
              <div className="bg-gray-50 dark:bg-gray-500/10 p-3 rounded-md border">
                <div className="text-sm space-y-2">
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <div className="text-gray-600 dark:text-gray-400 font-medium">Service</div>
                    <div className="col-span-2 flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 flex-shrink-0"
                        onClick={() => copyToClipboard(selectedInstanceObj.serviceAddress)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                      <span className="truncate flex-1" title={selectedInstanceObj.serviceAddress}>
                        {selectedInstanceObj.serviceAddress}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 items-center">
                    <div className="text-gray-600 dark:text-gray-400 font-medium">Namespace</div>
                    <div className="col-span-2 flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 flex-shrink-0"
                        onClick={() => copyToClipboard(selectedInstanceObj.namespace)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                      <span className="truncate flex-1" title={selectedInstanceObj.namespace}>
                        {selectedInstanceObj.namespace}
                      </span>

                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 items-center">
                    <div className="text-gray-600 dark:text-gray-400 font-medium">Type</div>
                    <div className="col-span-2 flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 flex-shrink-0"
                        onClick={() => copyToClipboard(selectedInstanceObj.serviceType)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                      <span className="truncate flex-1" title={selectedInstanceObj.serviceType}>
                        {selectedInstanceObj.serviceType}
                      </span>

                    </div>
                  </div>

                  {selectedPort && selectedInstanceObj.ports.find(p => p.port.toString() === selectedPort) && (
                    <div className="grid grid-cols-3 gap-2 items-center">
                      <div className="text-gray-600 dark:text-gray-400 font-medium">Target Port</div>
                      <div className="col-span-2 flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 flex-shrink-0"
                          onClick={() => copyToClipboard(selectedInstanceObj.ports.find(p => p.port.toString() === selectedPort)?.targetPort?.toString() || '')}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                        <span className="truncate flex-1" title={selectedInstanceObj.ports.find(p => p.port.toString() === selectedPort)?.targetPort?.toString()}>
                          {selectedInstanceObj.ports.find(p => p.port.toString() === selectedPort)?.targetPort}
                        </span>

                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {fetchingInstances && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                Finding {toolNames[selectedTool]} instances...
              </div>
            )}
          </div>
        ) : (
          <div className="py-2 space-y-4">
            <div className="rounded-md bg-gray-50 dark:bg-gray-500/10 p-4 border border-gray-200 dark:border-gray-800">
              <h4 className="font-medium mb-2 flex items-center gap-2">
                {toolIcons[selectedTool]}
                {toolNames[selectedTool]} Dashboard Active
              </h4>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="text-gray-500 dark:text-gray-400">Local Port:</div>
                <div className="col-span-2">{portForwardResult.port}</div>

                <div className="text-gray-500 dark:text-gray-400">Pod:</div>
                <div className="col-span-2 truncate">{portForwardResult.pod}</div>

                <div className="text-gray-500 dark:text-gray-400">URL:</div>
                <a
                  className="transition-all duration-200 hover:cursor-pointer p-0 col-span-2 truncate underline hover:text-gray-500 dark:hover:text-blue-400"
                  onClick={() => {
                    const url = getPortForwardUrl(portForwardResult.port?.toString() || '');
                    openBrowserWithUrl(url, `${toolNames[selectedTool]} Dashboard`);
                    handleClose();
                  }}
                >
                  {getPortForwardUrl(portForwardResult.port?.toString() || '')}
                </a>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {!portForwardResult ? (
            <>
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handlePortForward}
                disabled={
                  loading ||
                  fetchingInstances ||
                  fetchingPods ||
                  !selectedInstance ||
                  !selectedPort ||
                  !selectedPod ||
                  toolInstances.length === 0
                }
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Open Dashboard
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose}>
                Close
              </Button>
              <Button onClick={handleOpenInBrowser}>
                <Globe className="mr-2 h-4 w-4" />
                Open in Browser
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MonitoringDashDialog;