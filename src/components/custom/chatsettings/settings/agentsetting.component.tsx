import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { X, Plus, Info, EllipsisVertical, Terminal, Files, Lightbulb, BotMessageSquare, Settings, Power, Globe } from "lucide-react";
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SiHelm, SiKubernetes, SiArgo, SiPrometheus, SiTrivy, SiDatadog, SiGrafana, SiDocker } from '@icons-pack/react-simple-icons';
import { Loki, SigNoz } from '@/assets/icons';
import { ConfigDialog } from './toolconfigdialog.component';
import { getAgentDenyList, getAgentWebSearch, patchConfig, getClusterConfig, updateClusterConfig } from '@/api/settings';
import { useCluster } from '@/contexts/clusterContext';
import { useToast } from '@/hooks/use-toast';

export interface Agent {
  id: string;
  name: string;
  description: string;
  type: 'builtin' | 'extended';
  icon?: React.ReactElement;
  enabled?: boolean;
}

export interface ExtendedToolConfig {
  id: string;
  enabled: boolean;
  config: Record<string, any>;
}



const AgentSetting: React.FC = () => {
  const { currentContext } = useCluster();
  const { toast } = useToast();
  const [autoRun, setAutoRun] = useState<boolean>(true);
  const [webSearch, setWebSearch] = useState<boolean>(false);
  const [denyList, setDenyList] = useState<string[]>([]);
  const [newDenyCommand, setNewDenyCommand] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [configDialog, setConfigDialog] = useState<{ tool: Agent; isOpen: boolean }>({ tool: {} as Agent, isOpen: false });
  const [extendedToolsConfig, setExtendedToolsConfig] = useState<Record<string, ExtendedToolConfig>>({
    docker: { id: 'docker', enabled: false, config: {} },
    argocd: { id: 'argocd', enabled: false, config: {} },
    prometheus: { id: 'prometheus', enabled: false, config: {} },
    trivy: { id: 'trivy', enabled: false, config: {} },
    grafana: { id: 'grafana', enabled: false, config: {} },
    datadog: { id: 'datadog', enabled: false, config: {} },
    tempo: { id: 'tempo', enabled: false, config: {} },
    loki: { id: 'loki', enabled: false, config: {} },
    alertmanager: { id: 'alertmanager', enabled: false, config: {} },
    signoz: { id: 'signoz', enabled: false, config: {} },
    opencost: { id: 'opencost', enabled: false, config: {} },
  });

  useEffect(() => {
    loadDenyList();
    loadWebSearchSetting();
  }, []);

  useEffect(() => {
    if (currentContext) {
      loadClusterToolConfigs();
    }
  }, [currentContext]);

  const loadClusterToolConfigs = async () => {
    if (!currentContext?.name) return;

    try {
      const response = await getClusterConfig(currentContext.name);
      if (response?.config) {
        // Update extended tools config based on cluster configuration
        setExtendedToolsConfig(prev => {
          const updated = { ...prev };
          Object.keys(prev).forEach(toolId => {
            if (response.config[toolId]) {
              const { enabled, ...config } = response.config[toolId];
              updated[toolId] = {
                ...prev[toolId],
                enabled: enabled || false,
                config: config
              };
            }
          });
          return updated;
        });
      }
    } catch (error) {
      // Cluster config might not exist yet, which is fine
      // No need to show error toast for missing config
    }
  };

  const builtInTools: Agent[] = [
    {
      id: 'file-system',
      name: 'File System',
      description: 'Create, read, update and delete files.',
      type: 'builtin',
      icon: <Files className='h-4 w-4' />
    },
    {
      id: 'terminal',
      name: 'Terminal',
      description: 'Run commands in the terminal and get the status and result.',
      type: 'builtin',
      icon: <Terminal className='h-4 w-4' />
    },
    {
      id: 'kubectl',
      name: 'Kubectl',
      description: 'Manage Kubernetes clusters, deployments, and resources.',
      type: 'builtin',
      icon: <SiKubernetes className='h-4 w-4' />
    },
    {
      id: 'helm',
      name: 'Helm',
      description: 'Package manager for Kubernetes applications and charts.',
      type: 'builtin',
      icon: <SiHelm className='h-4 w-4' />
    }
  ];

  const extendedTools: Agent[] = [
    {
      id: 'docker',
      name: 'Docker',
      description: 'Container platform for building, shipping, and running applications.',
      type: 'extended',
      icon: <SiDocker className='h-4 w-4' />,
      enabled: extendedToolsConfig.docker.enabled
    },
    {
      id: 'argocd',
      name: 'ArgoCD',
      description: 'Declarative GitOps continuous delivery tool for Kubernetes.',
      type: 'extended',
      icon: <SiArgo className='h-4 w-4' />,
      enabled: extendedToolsConfig.argocd.enabled
    },
    {
      id: 'prometheus',
      name: 'Prometheus',
      description: 'Monitoring and alerting toolkit with time series database.',
      type: 'extended',
      icon: <SiPrometheus className='h-4 w-4' />,
      enabled: extendedToolsConfig.prometheus.enabled
    },
    {
      id: 'trivy',
      name: 'Trivy',
      description: 'Vulnerability scanner for containers, filesystems, and Git repositories.',
      type: 'extended',
      icon: <SiTrivy className='h-4 w-4' />,
      enabled: extendedToolsConfig.trivy.enabled
    },
    {
      id: 'grafana',
      name: 'Grafana',
      description: 'Visualization and analytics platform for monitoring data.',
      type: 'extended',
      icon: <SiGrafana className='h-4 w-4' />,
      enabled: extendedToolsConfig.grafana?.enabled || false
    },
    {
      id: 'datadog',
      name: 'Datadog',
      description: 'Cloud monitoring platform for infrastructure, applications, and logs.',
      type: 'extended',
      icon: <SiDatadog className='h-4 w-4' />,
      enabled: extendedToolsConfig.datadog?.enabled || false
    },
    {
      id: 'tempo',
      name: 'Tempo',
      description: 'High-scale distributed tracing backend by Grafana.',
      type: 'extended',
      icon: <SiGrafana className='h-4 w-4' />, // Using Shield as placeholder
      enabled: extendedToolsConfig.tempo?.enabled || false
    },
    {
      id: 'loki',
      name: 'Loki',
      description: 'Log aggregation system designed to store and query logs efficiently.',
      type: 'extended',
      icon: <Loki className='h-4 w-4' />, // Using Shield as placeholder
      enabled: extendedToolsConfig.loki?.enabled || false
    },
    {
      id: 'alertmanager',
      name: 'Alertmanager',
      description: 'Handles alerts sent by Prometheus server and routes them to receivers.',
      type: 'extended',
      icon: <SiPrometheus className='h-4 w-4' />, // Using Shield as placeholder
      enabled: extendedToolsConfig.alertmanager?.enabled || false
    },
    {
      id: 'signoz',
      name: 'SigNoz',
      description: 'Open-source observability platform with APM, logs, and metrics.',
      type: 'extended',
      icon: <SigNoz className='h-4 w-4' />, // Using Shield as placeholder
      enabled: extendedToolsConfig.signoz?.enabled || false
    },
    {
      id: 'opencost',
      name: 'OpenCost',
      description: 'Real-time cost monitoring and optimization for Kubernetes.',
      type: 'extended',
      icon: <SiKubernetes className='h-4 w-4' />,
      enabled: extendedToolsConfig.opencost?.enabled || false
    }
  ];

  const loadDenyList = async () => {
    try {
      setIsLoading(true);
      const response = await getAgentDenyList();
      setDenyList(response.denyList);
    } catch (error) {
      console.error('Failed to load deny list:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadWebSearchSetting = async () => {
    try {
      const response = await getAgentWebSearch();
      setWebSearch(response.webSearch);
    } catch (error) {
      console.error('Failed to load web search setting:', error);
    }
  };

  const updateWebSearchSetting = async (enabled: boolean) => {
    try {
      setIsLoading(true);
      await patchConfig({
        agents: { webSearch: enabled }
      });
      setWebSearch(enabled);
    } catch (error) {
      console.error('Failed to update web search setting:', error);
      // Revert on error
      loadWebSearchSetting();
    } finally {
      setIsLoading(false);
    }
  };

  const updateDenyList = async (newDenyList: string[]) => {
    try {
      setIsLoading(true);
      await patchConfig({
        agents: { denyList: newDenyList }
      });
      setDenyList(newDenyList);
    } catch (error) {
      console.error('Failed to update deny list:', error);
      // Revert on error
      loadDenyList();
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddDenyCommand = () => {
    if (newDenyCommand.trim() && !denyList.includes(newDenyCommand.trim())) {
      const updatedList = [...denyList, newDenyCommand.trim()];
      updateDenyList(updatedList);
      setNewDenyCommand('');
    }
  };

  const handleRemoveDenyCommand = (command: string) => {
    const updatedList = denyList.filter(cmd => cmd !== command);
    updateDenyList(updatedList);
  };

  const toggleExtendedTool = async (toolId: string) => {
    if (!currentContext?.name) {
      toast({
        title: "Error",
        description: "No cluster context available for tool configuration",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoading(true);
      const newEnabledState = !extendedToolsConfig[toolId].enabled;
      
      if (newEnabledState) {
        // If enabling, update cluster config with enabled state and existing config
        await updateClusterConfig(currentContext.name, {
          [toolId]: {
            ...extendedToolsConfig[toolId].config,
            enabled: true
          }
        });
      } else {
        // If disabling, update cluster config to set enabled to false
        await updateClusterConfig(currentContext.name, {
          [toolId]: {
            ...extendedToolsConfig[toolId].config,
            enabled: false
          }
        });
      }

      // Update local state
      setExtendedToolsConfig(prev => ({
        ...prev,
        [toolId]: {
          ...prev[toolId],
          enabled: newEnabledState
        }
      }));

      toast({
        title: newEnabledState ? "Tool Enabled" : "Tool Disabled",
        description: `${extendedTools.find(t => t.id === toolId)?.name} ${newEnabledState ? 'enabled' : 'disabled'} for cluster ${currentContext.name}`,
      });
      
      // Reload cluster tool configs to ensure consistency
      loadClusterToolConfigs();
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to ${extendedToolsConfig[toolId].enabled ? 'disable' : 'enable'} tool`,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const openConfigDialog = (tool: Agent) => {
    setConfigDialog({ tool, isOpen: true });
  };

  const closeConfigDialog = () => {
    setConfigDialog({ tool: {} as Agent, isOpen: false });
  };

  const saveToolConfig = async (config: Record<string, any>) => {
    const toolId = configDialog.tool.id;
    
    if (!currentContext?.name) {
      toast({
        title: "Error",
        description: "No cluster context available for tool configuration",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoading(true);
      
      // Update the cluster configuration with the tool config and enabled state
      await updateClusterConfig(currentContext.name, {
        [toolId]: {
          ...config,
          enabled: true
        }
      });
      
      // Update local state
      setExtendedToolsConfig(prev => ({
        ...prev,
        [toolId]: {
          ...prev[toolId],
          config,
          enabled: true
        }
      }));
      
      toast({
        title: "Configuration Saved",
        description: `${configDialog.tool.name} configured for cluster ${currentContext.name}`,
      });
      
      // Reload cluster tool configs to ensure consistency
      loadClusterToolConfigs();
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to save ${configDialog.tool.name} configuration`,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const renderToolSection = (tools: Agent[], title: string, isExtended = false) => (
    <div>
      <div className="flex items-center space-x-2 mb-4">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">{title}</h3>
        {isExtended && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="w-4 h-4 text-gray-600 dark:text-gray-400 cursor-pointer" />
            </TooltipTrigger>
            <TooltipContent className='bg-gray-100/20 dark:bg-[#0B0D13]/30 backdrop-blur-sm border dark:border-gray-700/50'>
              <p className="max-w-xs text-black dark:text-gray-200 p-1">
                Extended tools require additional configuration and need to be enabled before usage.
              </p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className='border border-gray-500/20 dark:border-gray-700/50 rounded-lg'>
        {tools.map((tool) => (
          <div
            key={tool.id}
            className="bg-gray-200/40 dark:bg-gray-800/30 last:rounded-b-lg first:rounded-t-lg py-2.5 border-b border-gray-500/20 dark:border-gray-700/50 last:border-b-0 hover:bg-gray-300/50 dark:hover:bg-gray-800/10 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center w-full space-x-3 px-2">
                <div className="w-5 h-5 p-1 bg-gray-300/80 rounded-sm flex items-center justify-center">
                  <span className="text-gray-800">{tool.icon}</span>
                </div>

                <div className='flex justify-between items-center w-full'>
                  <div className="flex items-center space-x-2">
                    <h4 className="text-xs font-medium text-gray-800 dark:text-gray-200">{tool.name}</h4>
                    {isExtended && tool.enabled && (
                      <span className="py-1.5 px-0.5 bg-green-100 dark:bg-green-500 text-green-700 dark:text-green-300 text-xs rounded">
                      </span>
                    )}
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-xs text-gray-600 dark:text-gray-400 w-44 lg:w-96  truncate text-end cursor-pointer">{tool.description}</p>
                    </TooltipTrigger>
                    <TooltipContent className='bg-gray-100/20 dark:bg-[#0B0D13]/30 backdrop-blur-sm border dark:border-gray-700/50'>
                      <span className='flex items-center space-x-2 py-2 px-1'>
                        <Lightbulb className='h-4 text-yellow-400' />
                        <p className="max-w-xs text-black dark:text-gray-200">{tool.description}</p>
                      </span>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
              <div className="text-gray-600 dark:text-gray-400 cursor-pointer">
                {isExtended ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <EllipsisVertical className='h-4' />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className=" dark:bg-[#0B0D13]/60 backdrop-blur-md">
                      <DropdownMenuItem
                        onClick={() => toggleExtendedTool(tool.id)}
                        className="flex items-center justify-between"
                      >
                        <span className="flex items-center justify-between w-full space-x-2">
                          <Power className="h-3 w-3" />
                          <span className='text-xs dark:text-gray-400'>{tool.enabled ? 'Disable' : 'Enable'}</span>
                        </span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => openConfigDialog(tool)}
                        className="flex items-center space-x-1"
                      >
                        <span className='flex items-center justify-between w-full'>
                          <Settings className="h-3 w-3" />
                          <span className='text-xs'>Configure</span>
                        </span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <EllipsisVertical className='h-4' />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <TooltipProvider>
      <div className='pb-4 flex items-center justify-between'>
        <div className='flex items-center space-x-2'>
          <BotMessageSquare className='text-emerald-500' />
          <h1 className='text-2xl font-medium'>Agent</h1>
        </div>
        <div className='flex items-center space-x-2'>
          <label className="flex items-center gap-1 text-xs text-gray-700 dark:text-gray-300">
            <Globe className='h-4 w-4' />
            Web Search
          </label>
          <Switch
            id="web-search"
            checked={webSearch}
            onCheckedChange={updateWebSearchSetting}
            disabled={isLoading}
          />
        </div>
      </div>
      <div className="space-y-6">
        <div className="bg-gray-200/50 dark:bg-gray-800/30 rounded-lg p-4 space-y-2">
          {/* Auto-Run Section */}
          <div className='border-b dark:border-gray-700/40 pb-4'>
            <div className="flex items-center justify-between">
              <label className="text-sm text-gray-700 dark:text-gray-300">
                Automatically run commands and MCP tools
              </label>
              <Switch
                id="auto-run-tools"
                checked={autoRun}
                onCheckedChange={() => setAutoRun(!autoRun)}
              />
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 w-96">
              When using agents, automatically execute commands and MCP tools deemed safe by the model.
            </p>
          </div>

          {/* Deny List Section */}
          <div>
            <div className="flex items-center space-x-2 my-4">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Deny List</h3>
              <Info className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </div>
            <div className="space-y-3">
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={newDenyCommand}
                  onChange={(e) => setNewDenyCommand(e.target.value)}
                  placeholder="Enter command"
                  className="flex-1 px-3 bg-gray-100 dark:bg-gray-800/10 border border-gray-300 dark:border-gray-600/50 rounded text-xs text-gray-800 dark:text-gray-300 placeholder-gray-500 focus:outline-none focus:border-gray-500 dark:focus:border-gray-500"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddDenyCommand()}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleAddDenyCommand}
                  disabled={isLoading}
                  className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300"
                >
                  <Plus className="w-4 h-4" />
                  {isLoading ? 'Adding...' : 'Add'}
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {denyList.map((command) => (
                  <div
                    key={command}
                    className="flex items-center bg-gray-300 dark:bg-gray-800 rounded px-2 py-1"
                  >
                    <span className="text-xs text-gray-800 dark:text-gray-300">{command}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-1 p-0 h-4 w-4 dark:text-gray-400"
                      onClick={() => handleRemoveDenyCommand(command)}
                      disabled={isLoading}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Built-in Tools Section */}
        {renderToolSection(builtInTools, "Built-In Tools")}

        {/* Extended Tools Section */}
        {renderToolSection(extendedTools, "Extended Tools", true)}


      </div>

      {/* Configuration Dialog */}
      <ConfigDialog
        tool={configDialog.tool}
        isOpen={configDialog.isOpen}
        onClose={closeConfigDialog}
        onSave={saveToolConfig}
        currentConfig={configDialog.tool.id ? extendedToolsConfig[configDialog.tool.id]?.config : {}}
      />
    </TooltipProvider>
  );
};

export default AgentSetting;