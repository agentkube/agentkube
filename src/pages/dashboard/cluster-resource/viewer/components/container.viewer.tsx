import React, { useState } from 'react';
import { 
  V1Container, 
  V1ContainerStatus, 
  V1ContainerPort,
  V1EnvVar,
  V1ResourceRequirements,
  V1VolumeMount
} from '@kubernetes/client-node';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ChevronDown, 
  ChevronUp, 
  ExternalLink, 
  Settings, 
  Terminal, 
  Layers, 
  Database,
  Shield,
  Server,
  Clock,
  AlertTriangle, 
  CheckCircle2, 
  XCircle,
  Copy
} from "lucide-react";

interface ContainersViewerProps {
  containers: V1Container[];
  containerStatuses?: V1ContainerStatus[];
  initContainers?: V1Container[];
  initContainerStatuses?: V1ContainerStatus[];
}

const ContainersViewer: React.FC<ContainersViewerProps> = ({
  containers,
  containerStatuses = [],
  initContainers = [],
  initContainerStatuses = []
}) => {
  // Get container status by container name
  const getContainerStatus = (name: string, statuses: V1ContainerStatus[]) => {
    return statuses.find(status => status.name === name);
  };
  
  // Get formatted state for a container
  const getContainerState = (status?: V1ContainerStatus) => {
    if (!status) return { state: 'unknown', reason: 'Unknown status', badgeColor: 'bg-gray-500' };
    
    if (status.state?.running) {
      return {
        state: 'running',
        reason: 'Running',
        startedAt: status.state.running.startedAt,
        badgeColor: 'bg-green-500'
      };
    } else if (status.state?.waiting) {
      return {
        state: 'waiting',
        reason: status.state.waiting.reason || 'Waiting',
        message: status.state.waiting.message,
        badgeColor: 'bg-yellow-500'
      };
    } else if (status.state?.terminated) {
      const isSuccess = status.state.terminated.exitCode === 0;
      return {
        state: 'terminated',
        reason: status.state.terminated.reason || (isSuccess ? 'Completed' : 'Failed'),
        exitCode: status.state.terminated.exitCode,
        startedAt: status.state.terminated.startedAt,
        finishedAt: status.state.terminated.finishedAt,
        badgeColor: isSuccess ? 'bg-blue-500' : 'bg-red-500'
      };
    }
    
    return { state: 'unknown', reason: 'Unknown state', badgeColor: 'bg-gray-500' };
  };
  
  // Render container state badge
  const renderContainerStateBadge = (status?: V1ContainerStatus) => {
    const containerState = getContainerState(status);
    
    let stateIcon;
    switch (containerState.state) {
      case 'running':
        stateIcon = <CheckCircle2 className="h-3 w-3 mr-1" />;
        break;
      case 'waiting':
        stateIcon = <Clock className="h-3 w-3 mr-1" />;
        break;
      case 'terminated':
        stateIcon = containerState.exitCode === 0 
          ? <CheckCircle2 className="h-3 w-3 mr-1" /> 
          : <XCircle className="h-3 w-3 mr-1" />;
        break;
      default:
        stateIcon = <AlertTriangle className="h-3 w-3 mr-1" />;
    }
    
    return (
      <div className="flex flex-col gap-1">
        <Badge 
          className={`w-fit flex items-center ${containerState.badgeColor} text-white`}
        >
          {stateIcon} {containerState.reason}
        </Badge>
        
        {containerState.message && (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {containerState.message}
          </div>
        )}
        
        {containerState.exitCode !== undefined && containerState.exitCode !== 0 && (
          <div className="text-xs text-red-500">
            Exit code: {containerState.exitCode}
          </div>
        )}
      </div>
    );
  };
  
  // Container ports list component
  const ContainerPorts = ({ ports }: { ports?: V1ContainerPort[] }) => {
    if (!ports || ports.length === 0) {
      return <span className="text-gray-500 dark:text-gray-400">No ports exposed</span>;
    }
    
    return (
      <div className="space-y-1">
        {ports.map((port, index) => (
          <div key={index} className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {port.containerPort}
              {port.protocol && `/${port.protocol}`}
            </Badge>
            {port.name && <span className="text-xs text-gray-500 dark:text-gray-400">{port.name}</span>}
          </div>
        ))}
      </div>
    );
  };
  
  // Container environment variables component with collapse/expand
  const ContainerEnvVars = ({ env }: { env?: V1EnvVar[] }) => {
    const [showAllEnv, setShowAllEnv] = useState(false);
    
    if (!env || env.length === 0) {
      return <span className="text-gray-500 dark:text-gray-400">No environment variables</span>;
    }
    
    const envsToShow = showAllEnv ? env : env.slice(0, 3);
    
    return (
      <div className="space-y-2">
        <div className="space-y-2">
          {envsToShow.map((envVar, index) => (
            <div key={index} className="text-xs bg-gray-100 dark:bg-transparent border border-gray-200 dark:border-gray-800 px-2 py-2 rounded-md">
              <span className="font-medium">{envVar.name}</span>: 
              {envVar.value ? (
                <span> {envVar.value}</span>
              ) : envVar.valueFrom ? (
                <span className="text-blue-600 dark:text-blue-400"> (From source)</span>
              ) : (
                <span className="text-gray-500 dark:text-gray-400"> (Not set)</span>
              )}
            </div>
          ))}
        </div>
        
        {env.length > 3 && (
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-fit text-xs text-blue-600 dark:bg-transparent dark:text-blue-400 p-0 h-auto hover:bg-transparent  hover:underline"
            onClick={() => setShowAllEnv(!showAllEnv)}
          >
            {showAllEnv ? (
              <span className="flex items-center">
                <ChevronUp className="h-3 w-3 mr-1" />
                Show fewer variables
              </span>
            ) : (
              <span className="flex items-center">
                <ChevronDown className="h-3 w-3 mr-1" />
                Show all {env.length} variables
              </span>
            )}
          </Button>
        )}
      </div>
    );
  };
  
  // Container resources component
  const ContainerResources = ({ resources }: { resources?: V1ResourceRequirements }) => {
    if (!resources || (!resources.requests && !resources.limits)) {
      return <span className="text-gray-500 dark:text-gray-400">No resource constraints</span>;
    }
    
    return (
      <div className="space-y-2">
        {resources.requests && (
          <div>
            <div className="text-xs font-medium mb-1">Requests:</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(resources.requests).map(([key, value]) => (
                <Badge key={key} variant="outline" className="bg-blue-50 dark:bg-blue-900/20">
                  {key}: {value}
                </Badge>
              ))}
            </div>
          </div>
        )}
        
        {resources.limits && (
          <div>
            <div className="text-xs font-medium mb-1">Limits:</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(resources.limits).map(([key, value]) => (
                <Badge key={key} variant="outline" className="bg-red-50 dark:bg-red-900/20">
                  {key}: {value}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };
  
  // Volume mounts component
  const VolumeMountsSection = ({ mounts }: { mounts?: V1VolumeMount[] }) => {
    if (!mounts || mounts.length === 0) {
      return <span className="text-gray-500 dark:text-gray-400">No volume mounts</span>;
    }
    
    return (
      <div className="space-y-2">
        {mounts.map((mount, index) => (
          <div key={index} className="bg-gray-100 dark:bg-gray-800/30 p-2 rounded-md text-xs">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium">{mount.name}</span>
              {mount.readOnly && (
                <Badge variant="outline" className="text-xs bg-yellow-50 dark:bg-yellow-900/20">
                  Read Only
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <span className="text-gray-500 dark:text-gray-400">Path:</span>
              <code>{mount.mountPath}</code>
            </div>
            {mount.subPath && (
              <div className="flex items-center gap-1">
                <span className="text-gray-500 dark:text-gray-400">Sub Path:</span>
                <code>{mount.subPath}</code>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };
  
  // Container security context section
  const SecurityContextSection = ({ securityContext }: { securityContext: any }) => {
    if (!securityContext) {
      return <span className="text-gray-500 dark:text-gray-400">No security context defined</span>;
    }
    
    const securityItems = [
      { key: 'privileged', label: 'Privileged', warning: true },
      { key: 'runAsUser', label: 'Run as User' },
      { key: 'runAsNonRoot', label: 'Run as Non-Root' },
      { key: 'readOnlyRootFilesystem', label: 'Read-Only Root Filesystem' },
      { key: 'allowPrivilegeEscalation', label: 'Allow Privilege Escalation', warning: true },
      { key: 'runAsGroup', label: 'Run as Group' },
      { key: 'procMount', label: 'Proc Mount' },
    ];
    
    return (
      <div className="space-y-1 text-xs">
        {securityItems.map(item => {
          if (securityContext[item.key] !== undefined) {
            const value = securityContext[item.key];
            const valueString = typeof value === 'object' ? JSON.stringify(value) : String(value);
            
            const isWarning = item.warning && 
              ((typeof value === 'boolean' && value === true) || 
               (typeof value === 'string' && value.toLowerCase() === 'true'));
            
            return (
              <div 
                key={item.key}
                className={isWarning ? "text-red-600 dark:text-red-400 font-medium" : ""}
              >
                {item.label}: {valueString}
              </div>
            );
          }
          return null;
        })}
        
        {/* Capabilities section */}
        {securityContext.capabilities && (
          <div className="mt-2">
            <div className="font-medium mb-1">Capabilities:</div>
            {securityContext.capabilities.add && securityContext.capabilities.add.length > 0 && (
              <div className="ml-2">
                Add: {securityContext.capabilities.add.join(', ')}
              </div>
            )}
            {securityContext.capabilities.drop && securityContext.capabilities.drop.length > 0 && (
              <div className="ml-2">
                Drop: {securityContext.capabilities.drop.join(', ')}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };
  
  // Probe details component
  const ProbeDetails = ({ probe, type }: { probe: any, type: string }) => {
    if (!probe) return null;
    
    return (
      <div className="text-xs bg-gray-100 dark:bg-gray-800/40 p-2 rounded-md">
        <div className="font-medium mb-1">{type} Probe:</div>
        {probe.httpGet && (
          <div className="ml-2">
            HTTP GET: {probe.httpGet.scheme || 'HTTP'}://{probe.httpGet.host || 'localhost'}:{probe.httpGet.port}
            {probe.httpGet.path}
          </div>
        )}
        {probe.tcpSocket && (
          <div className="ml-2">
            TCP Socket: {probe.tcpSocket.port}
          </div>
        )}
        {probe.exec && probe.exec.command && (
          <div className="ml-2">
            Exec: {probe.exec.command.join(' ')}
          </div>
        )}
        {probe.initialDelaySeconds !== undefined && (
          <div className="ml-2">Initial Delay: {probe.initialDelaySeconds}s</div>
        )}
        {probe.timeoutSeconds !== undefined && (
          <div className="ml-2">Timeout: {probe.timeoutSeconds}s</div>
        )}
        {probe.periodSeconds !== undefined && (
          <div className="ml-2">Period: {probe.periodSeconds}s</div>
        )}
        {probe.successThreshold !== undefined && (
          <div className="ml-2">Success Threshold: {probe.successThreshold}</div>
        )}
        {probe.failureThreshold !== undefined && (
          <div className="ml-2">Failure Threshold: {probe.failureThreshold}</div>
        )}
      </div>
    );
  };
  
  // Container card component to render a single container
  const ContainerCard = ({ 
    container, 
    status,
    isInit = false
  }: { 
    container: V1Container; 
    status?: V1ContainerStatus;
    isInit?: boolean;
  }) => {
    const [showDetails, setShowDetails] = useState(false);
    const containerState = getContainerState(status);
    
    // Generate docker pull command
    const getPullCommand = (image: string) => {
      // return `docker pull ${image}`;
      return `${image}`;
    };
    
    const copyToClipboard = (text: string) => {
      navigator.clipboard.writeText(text);
    };
    
    return (
      <Card className="mb-4 bg-white dark:bg-transparent">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-md flex items-center gap-2">
                {container.name}
                {isInit && (
                  <Badge variant="outline" className="text-xs">
                    Init
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="flex items-center text-xs mt-1">
                <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded font-mono">
                  {container.image}
                </code>
                <Button
                  variant="ghost" 
                  size="sm"
                  className="h-5 w-5 p-0 ml-1"
                  title="Copy pull command"
                  onClick={() => copyToClipboard(getPullCommand(container.image?.toString() || ''))}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </CardDescription>
            </div>
            
            <div className="flex items-center gap-2">
              {status && renderContainerStateBadge(status)}
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDetails(!showDetails)}
                className="p-1 h-8 w-8"
              >
                {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardHeader>
        
        {showDetails && (
          <CardContent className="pt-0">
            <Tabs defaultValue="config">
              <TabsList className="mb-4">
                <TabsTrigger value="config" className="flex items-center gap-1">
                  <Settings className="h-3.5 w-3.5" />
                  <span>Configuration</span>
                </TabsTrigger>
                <TabsTrigger value="resources" className="flex items-center gap-1">
                  <Server className="h-3.5 w-3.5" />
                  <span>Resources</span>
                </TabsTrigger>
                <TabsTrigger value="env" className="flex items-center gap-1">
                  <Database className="h-3.5 w-3.5" />
                  <span>Environment</span>
                </TabsTrigger>
                <TabsTrigger value="volumes" className="flex items-center gap-1">
                  <Layers className="h-3.5 w-3.5" />
                  <span>Volumes</span>
                </TabsTrigger>
                <TabsTrigger value="security" className="flex items-center gap-1">
                  <Shield className="h-3.5 w-3.5" />
                  <span>Security</span>
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="config" className="mt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium mb-2">Command</h4>
                    {container.command ? (
                      <div className="bg-gray-100 dark:bg-gray-800 p-2 rounded-md text-xs font-mono overflow-x-auto">
                        {container.command.join(' ')}
                      </div>
                    ) : (
                      <span className="text-gray-500 dark:text-gray-400">Default command</span>
                    )}
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium mb-2">Arguments</h4>
                    {container.args && container.args.length > 0 ? (
                      <div className="bg-gray-100 dark:bg-gray-800 p-2 rounded-md text-xs font-mono overflow-x-auto">
                        {container.args.join(' ')}
                      </div>
                    ) : (
                      <span className="text-gray-500 dark:text-gray-400">No arguments</span>
                    )}
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium mb-2">Ports</h4>
                    <ContainerPorts ports={container.ports} />
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium mb-2">Working Directory</h4>
                    {container.workingDir ? (
                      <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                        {container.workingDir}
                      </code>
                    ) : (
                      <span className="text-gray-500 dark:text-gray-400">Default working directory</span>
                    )}
                  </div>
                  
                  {status && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Restart Count</h4>
                      <span className={status.restartCount > 0 ? "text-yellow-600 dark:text-yellow-400 font-medium" : ""}>
                        {status.restartCount}
                      </span>
                    </div>
                  )}
                  
                  <div>
                    <h4 className="text-sm font-medium mb-2">Image Pull Policy</h4>
                    <Badge variant="secondary" className='text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800'>
                      {container.imagePullPolicy || "IfNotPresent"}
                    </Badge>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="resources" className="mt-0">
                <div>
                  <h4 className="text-sm font-medium mb-2">Resource Requests & Limits</h4>
                  <ContainerResources resources={container.resources} />
                </div>
              </TabsContent>
              
              <TabsContent value="env" className="mt-0">
                <div>
                  <h4 className="text-sm font-medium mb-2">Environment Variables</h4>
                  <ContainerEnvVars env={container.env} />
                </div>
              </TabsContent>
              
              <TabsContent value="volumes" className="mt-0">
                <div>
                  <h4 className="text-sm font-medium mb-2">Volume Mounts</h4>
                  <VolumeMountsSection mounts={container.volumeMounts} />
                </div>
              </TabsContent>
              
              <TabsContent value="security" className="mt-0">
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <h4 className="text-sm font-medium mb-2">Security Context</h4>
                    <SecurityContextSection securityContext={container.securityContext || {}} />
                  </div>
                  
                  <div className="space-y-4">
                    {container.livenessProbe && (
                      <ProbeDetails probe={container.livenessProbe} type="Liveness" />
                    )}
                    
                    {container.readinessProbe && (
                      <ProbeDetails probe={container.readinessProbe} type="Readiness" />
                    )}
                    
                    {container.startupProbe && (
                      <ProbeDetails probe={container.startupProbe} type="Startup" />
                    )}
                    
                    {!container.livenessProbe && !container.readinessProbe && !container.startupProbe && (
                      <div className="text-yellow-600 dark:text-yellow-400">
                        No health probes configured
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        )}
      </Card>
    );
  };

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-800/50 bg-white dark:bg-transparent p-4 mb-6">
      <h2 className="text-lg font-medium mb-4">Containers</h2>
      
      {/* Init Containers Section */}
      {initContainers && initContainers.length > 0 && (
        <div className="mb-6">
          <h3 className="text-md font-medium mb-3">Init Containers</h3>
          <div className="space-y-2">
            {initContainers.map((container) => (
              <ContainerCard
                key={container.name}
                container={container}
                status={getContainerStatus(container.name, initContainerStatuses)}
                isInit={true}
              />
            ))}
          </div>
        </div>
      )}
      
      {/* Main Containers Section */}
      <div>
        {initContainers && initContainers.length > 0 && (
          <h3 className="text-md font-medium mb-3">App Containers</h3>
        )}
        <div className="space-y-2">
          {containers.map((container) => (
            <ContainerCard
              key={container.name}
              container={container}
              status={getContainerStatus(container.name, containerStatuses)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default ContainersViewer;