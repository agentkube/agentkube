import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ExternalLink, Shuffle } from "lucide-react";
import { 
  startPortForward, 
  getPortForwardUrl, 
  openPortForwardInBrowser, 
  PortForwardResponse 
} from '@/api/internal/portforward';
import { listResources } from '@/api/internal/resources';

interface PortForwardDialogProps {
  isOpen: boolean;
  onClose: () => void;
  clusterName: string;
  namespace: string;
  serviceName: string;
  ports?: { port: number; targetPort: any; protocol?: string; name?: string }[];
}

const PortForwardDialog: React.FC<PortForwardDialogProps> = ({ 
  isOpen, 
  onClose, 
  clusterName, 
  namespace, 
  serviceName,
  ports = []
}) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetchingPods, setFetchingPods] = useState(false);
  const [selectedPort, setSelectedPort] = useState<string>('');
  const [localPort, setLocalPort] = useState<string>('');
  const [portForwardResult, setPortForwardResult] = useState<PortForwardResponse | null>(null);
  const [serviceSelector, setServiceSelector] = useState<Record<string, string>>({});
  const [availablePods, setAvailablePods] = useState<Array<{name: string, ready: boolean}>>([]);
  const [selectedPod, setSelectedPod] = useState<string>('');

  // Function to generate a random port excluding specified ports
  const generateRandomPort = (): number => {
    const excludedPorts = [4689, 4688, 5422];
    const minPort = 1024;
    const maxPort = 65535;
    
    let randomPort: number;
    do {
      randomPort = Math.floor(Math.random() * (maxPort - minPort + 1)) + minPort;
    } while (excludedPorts.includes(randomPort));
    
    return randomPort;
  };

  // Function to handle random port generation button click
  const handleGenerateRandomPort = () => {
    const randomPort = generateRandomPort();
    setLocalPort(randomPort.toString());
  };

  // Fetch service information to get selector labels
  useEffect(() => {
    if (isOpen && clusterName && namespace && serviceName) {
      fetchServiceSelector();
    }
  }, [isOpen, clusterName, namespace, serviceName]);

  // Fetch service selector
  const fetchServiceSelector = async () => {
    try {
      setFetchingPods(true);
      
      // Get the service to extract its selector
      const services = await listResources(clusterName, 'services', {
        namespace,
        name: serviceName
      });
      
      if (services && services.length > 0 && services[0].spec?.selector) {
        const selector = services[0].spec.selector;
        setServiceSelector(selector);
        
        // Once we have the selector, fetch matching pods
        await fetchMatchingPods(selector);
      } else {
        toast({
          title: "Warning",
          description: "This service doesn't have a selector to target pods",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error("Error fetching service selector:", error);
      toast({
        title: "Error",
        description: "Failed to get service information",
        variant: "destructive"
      });
    } finally {
      setFetchingPods(false);
    }
  };

  // Fetch pods that match the service selector
  const fetchMatchingPods = async (selector: Record<string, string>) => {
    try {
      // Build label selector string from the service selector
      const labelSelector = Object.entries(selector)
        .map(([key, value]) => `${key}=${value}`)
        .join(',');
      
      // Fetch pods matching the selector
      const pods = await listResources(clusterName, 'pods', {
        namespace,
        labelSelector
      });
      
      // Format pod information and check if they're ready
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
      
      // Auto-select the first ready pod, or just the first pod if none are ready
      const readyPod = podList.find(pod => pod.ready);
      if (readyPod) {
        setSelectedPod(readyPod.name);
      } else if (podList.length > 0) {
        setSelectedPod(podList[0].name);
      }
    } catch (error) {
      console.error("Error fetching matching pods:", error);
      toast({
        title: "Error",
        description: "Failed to fetch pods for this service",
        variant: "destructive"
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedPort) {
      toast({
        title: "Error",
        description: "Please select a port to forward",
        variant: "destructive"
      });
      return;
    }
    
    if (availablePods.length === 0) {
      toast({
        title: "Error",
        description: "No pods available for this service",
        variant: "destructive"
      });
      return;
    }
    
    if (!selectedPod) {
      toast({
        title: "Error",
        description: "Please select a pod to forward to",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    
    try {
      // Parse selected port to get target port
      const selectedPortObj = ports.find(p => p.port.toString() === selectedPort);
      console.log('Selected port object:', selectedPortObj);
      
      // Handle targetPort - convert to string for API call
      // If targetPort is a number, convert to string; if it's already a string (named port), keep it
      const targetPort = selectedPortObj?.targetPort?.toString() || selectedPort;
      
      console.log({
        namespace,
        pod: selectedPod,
        service: serviceName,
        serviceNamespace: namespace,
        targetPort,
        cluster: clusterName,
        port: localPort || undefined
      })

      const result = await startPortForward({
        namespace,
        pod: selectedPod,
        service: serviceName,
        serviceNamespace: namespace,
        targetPort,
        cluster: clusterName,
        port: localPort || undefined
      });
      
      setPortForwardResult(result);
      
      toast({
        title: "Port Forward Started",
        description: `Port forward started on localhost:${result.port}`,
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
      openPortForwardInBrowser(portForwardResult.port?.toString() || '');
    }
  };

  const handleClose = () => {
    setSelectedPort('');
    setLocalPort('');
    setSelectedPod('');
    setPortForwardResult(null);
    setAvailablePods([]);
    setServiceSelector({});
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px] bg-gray-200 dark:bg-[#0B0D13] backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>Port Forward to Service</DialogTitle>
          <DialogDescription>
            Forward a local port to {serviceName} in namespace {namespace}
          </DialogDescription>
        </DialogHeader>
        
        {!portForwardResult ? (
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="service-port" className="text-right">
                  Service Port
                </Label>
                <Select
                  value={selectedPort}
                  onValueChange={setSelectedPort}
                  disabled={loading || fetchingPods}
                >
                  <SelectTrigger id="service-port" className="col-span-3">
                    <SelectValue placeholder="Select a port to forward" />
                  </SelectTrigger>
                  <SelectContent className='bg-gray-200 dark:bg-[#0B0D13]/70 backdrop-blur-md'>
                    {ports.map((port) => (
                      <SelectItem key={`${port.port}-${port.name || ''}`} value={port.port.toString()}>
                        {port.port}
                        {port.name ? ` (${port.name})` : ''} 
                        {port.protocol ? ` - ${port.protocol}` : ''}
                        {port.targetPort && port.targetPort !== port.port ? ` → ${port.targetPort}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="target-pod" className="text-right">
                  Target Pod
                </Label>
                <Select
                  value={selectedPod}
                  onValueChange={setSelectedPod}
                  disabled={loading || fetchingPods || availablePods.length === 0}
                >
                  <SelectTrigger id="target-pod" className="col-span-3">
                    {fetchingPods ? (
                      <div className="flex items-center">
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Loading pods...
                      </div>
                    ) : (
                      <SelectValue placeholder="Select a pod" />
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
              
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="local-port" className="text-right">
                  Local Port
                </Label>
                <div className="col-span-3 flex gap-2">
                  <Input
                    id="local-port"
                    type="number"
                    min="1024"
                    max="65535"
                    placeholder="Random port if empty"
                    className="flex-1"
                    value={localPort}
                    onChange={(e) => setLocalPort(e.target.value)}
                    disabled={loading || fetchingPods}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateRandomPort}
                    disabled={loading || fetchingPods}
                    className="px-3 py-4"
                    title="Generate random port"
                  >
                    <Shuffle className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose} disabled={loading || fetchingPods}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={loading || fetchingPods || !selectedPort || !selectedPod || availablePods.length === 0}
              >
                {(loading || fetchingPods) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Start Port Forward
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="py-2 space-y-4">
            <div className="rounded-md bg-gray-50 dark:bg-gray-500/10 p-4 border border-gray-200 dark:border-gray-800">
              <h4 className="font-medium mb-2">Port Forward Active</h4>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="text-gray-500 dark:text-gray-400">Local Port:</div>
                <div className="col-span-2">{portForwardResult.port}</div>
                
                <div className="text-gray-500 dark:text-gray-400">Remote Port:</div>
                <div className="col-span-2 ">{portForwardResult.targetPort}</div>
                
                <div className="text-gray-500 dark:text-gray-400">Pod:</div>
                <div className="col-span-2  truncate">{portForwardResult.pod}</div>
                
                <div className="text-gray-500 dark:text-gray-400">URL:</div>
                <a  className="transition-all duration-200 hover:cursor-pointer p-0 col-span-2 truncate underline hover:text-gray-500 dark:hover:text-blue-400" onClick={() => openPortForwardInBrowser(portForwardResult.port?.toString() || '')}>
                  {getPortForwardUrl(portForwardResult.port?.toString() || '')}
                </a>
                
                <div className="text-gray-500 dark:text-gray-400">ID:</div>
                <div className="col-span-2 font-mono text-xs truncate">{portForwardResult.id}</div>
              </div>
            </div>
            
            <DialogFooter className="flex flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={handleClose} className="sm:order-first">
                Close
              </Button>
              <Button onClick={handleOpenInBrowser} className="w-full sm:w-auto">
                <ExternalLink className="mr-2 h-4 w-4" />
                Open in Browser
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PortForwardDialog;