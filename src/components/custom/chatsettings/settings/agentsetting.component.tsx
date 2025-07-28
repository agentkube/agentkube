import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { X, Plus, Info, EllipsisVertical, Terminal, Files, Lightbulb, BotMessageSquare, Settings, Power } from "lucide-react";
import { Switch } from '@/components/ui/switch';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SiHelm, SiKubernetes, SiArgo, SiPrometheus, SiTrivy } from '@icons-pack/react-simple-icons';
import { Shield } from 'lucide-react';

interface Agent {
  id: string;
  name: string;
  description: string;
  type: 'builtin' | 'extended';
  icon?: React.ReactElement;
  enabled?: boolean;
}

interface ExtendedToolConfig {
  id: string;
  enabled: boolean;
  config: Record<string, any>;
}

// Configuration Dialog Component
const ConfigDialog: React.FC<{
  tool: Agent;
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: Record<string, any>) => void;
  currentConfig?: Record<string, any>;
}> = ({ tool, isOpen, onClose, onSave, currentConfig = {} }) => {
  const [config, setConfig] = useState(currentConfig);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(config);
    onClose();
  };

  const updateConfig = (key: string, value: string) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const renderConfigFields = () => {
    switch (tool.id) {
      case 'argocd':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="base_url" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Base URL
              </Label>
              <Input
                id="base_url"
                type="url"
                placeholder="https://argocd.example.com"
                value={config.base_url || ''}
                onChange={(e) => updateConfig('base_url', e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="api_token" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                API Token
              </Label>
              <Input
                id="api_token"
                type="password"
                placeholder="Enter API token"
                value={config.api_token || ''}
                onChange={(e) => updateConfig('api_token', e.target.value)}
                className="w-full"
              />
            </div>
          </>
        );
      case 'prometheus':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="base_url" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Base URL
              </Label>
              <Input
                id="base_url"
                type="url"
                placeholder="https://prometheus.example.com"
                value={config.base_url || ''}
                onChange={(e) => updateConfig('base_url', e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Username <span className="text-gray-500">(optional)</span>
              </Label>
              <Input
                id="username"
                type="text"
                placeholder="Enter username"
                value={config.username || ''}
                onChange={(e) => updateConfig('username', e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Password <span className="text-gray-500">(optional)</span>
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter password"
                value={config.password || ''}
                onChange={(e) => updateConfig('password', e.target.value)}
                className="w-full"
              />
            </div>
          </>
        );
      case 'trivy':
        return (
          <div className="space-y-2">
            <Label htmlFor="base_url" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Base URL
            </Label>
            <Input
              id="base_url"
              type="url"
              placeholder="https://trivy.example.com"
              value={config.base_url || ''}
              onChange={(e) => updateConfig('base_url', e.target.value)}
              className="w-full"
            />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/30 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-[#0B0D13]/40 backdrop-blur-md border dark:border-gray-700/40 rounded-lg w-[500px] max-w-full mx-4">
        <div className="flex items-center justify-between px-2 py-1 dark:bg-gray-800/40">
          <div className="flex items-center space-x-3">
            <div className="w-6 h-6 bg-gray-300/80 rounded-sm flex items-center justify-center">
              <span className="text-gray-800">{tool.icon}</span>
            </div>
            <h3 className="text-sm font-semibold dark:text-white">Configure {tool.name}</h3>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="p-4 space-y-4">
          {renderConfigFields()}
        </div>
        
        <div className="flex justify-end space-x-2 p-4 ">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white">
            Save Configuration
          </Button>
        </div>
      </div>
    </div>
  );
};

const AgentSetting: React.FC = () => {
  const [autoRun, setAutoRun] = useState<boolean>(true);
  const [denyList, setDenyList] = useState<string[]>(['rm', 'kill', 'chmod']);
  const [newDenyCommand, setNewDenyCommand] = useState<string>('');
  const [configDialog, setConfigDialog] = useState<{ tool: Agent; isOpen: boolean }>({ tool: {} as Agent, isOpen: false });
  const [extendedToolsConfig, setExtendedToolsConfig] = useState<Record<string, ExtendedToolConfig>>({
    argocd: { id: 'argocd', enabled: false, config: {} },
    prometheus: { id: 'prometheus', enabled: false, config: {} },
    trivy: { id: 'trivy', enabled: false, config: {} },
  });

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
    }
  ];

  const handleAddDenyCommand = () => {
    if (newDenyCommand.trim() && !denyList.includes(newDenyCommand.trim())) {
      setDenyList([...denyList, newDenyCommand.trim()]);
      setNewDenyCommand('');
    }
  };

  const handleRemoveDenyCommand = (command: string) => {
    setDenyList(denyList.filter(cmd => cmd !== command));
  };

  const toggleExtendedTool = (toolId: string) => {
    setExtendedToolsConfig(prev => ({
      ...prev,
      [toolId]: {
        ...prev[toolId],
        enabled: !prev[toolId].enabled
      }
    }));
  };

  const openConfigDialog = (tool: Agent) => {
    setConfigDialog({ tool, isOpen: true });
  };

  const closeConfigDialog = () => {
    setConfigDialog({ tool: {} as Agent, isOpen: false });
  };

  const saveToolConfig = (config: Record<string, any>) => {
    const toolId = configDialog.tool.id;
    setExtendedToolsConfig(prev => ({
      ...prev,
      [toolId]: {
        ...prev[toolId],
        config
      }
    }));
  };

  const renderToolSection = (tools: Agent[], title: string, isExtended = false) => (
    <div>
      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">{title}</h3>
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
                      <span className="px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs rounded">
                        Enabled
                      </span>
                    )}
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-xs text-gray-600 dark:text-gray-400 w-96 truncate text-end cursor-pointer">{tool.description}</p>
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
      <div className='pb-4 flex items-center space-x-2'>
        <BotMessageSquare className='text-emerald-500' />
        <h1 className='text-2xl font-medium'>Agent</h1>
      </div>
      <div className="space-y-6">
        {/* Built-in Tools Section */}
        {renderToolSection(builtInTools, "Built-In Tools")}

        {/* Extended Tools Section */}
        {renderToolSection(extendedTools, "Extended Tools", true)}

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
                  onKeyPress={(e) => e.key === 'Enter' && handleAddDenyCommand()}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleAddDenyCommand}
                  className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300"
                >
                  <Plus className="w-4 h-4" />
                  Add
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
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
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