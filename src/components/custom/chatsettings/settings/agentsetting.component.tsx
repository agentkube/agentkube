import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { X, Plus, Info, EllipsisVertical, Terminal, Files, Lightbulb, BotMessageSquare } from "lucide-react";
import { Switch } from '@/components/ui/switch';
import { SiHelm, SiKubernetes } from '@icons-pack/react-simple-icons';
interface Agent {
  id: string;
  name: string;
  description: string;
  type: 'builtin' | 'custom';
  icon?: React.ReactElement;
}

const AgentSetting: React.FC = () => {
  const [autoRun, setAutoRun] = useState<boolean>(true);
  const [denyList, setDenyList] = useState<string[]>(['rm', 'kill', 'chmod']);
  const [newDenyCommand, setNewDenyCommand] = useState<string>('');

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

  const handleAddDenyCommand = () => {
    if (newDenyCommand.trim() && !denyList.includes(newDenyCommand.trim())) {
      setDenyList([...denyList, newDenyCommand.trim()]);
      setNewDenyCommand('');
    }
  };

  const handleRemoveDenyCommand = (command: string) => {
    setDenyList(denyList.filter(cmd => cmd !== command));
  };

  return (
    <TooltipProvider>
      <div className='pb-4 flex items-center space-x-2'>
        <BotMessageSquare className='text-emerald-500' />
        <h1 className='text-2xl font-medium'>Agent</h1>
      </div>
      <div className="space-y-6">
        {/* Custom Agents Section */}
        {/* <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Custom Agents</h3>
            <Button
              variant="outline"
              size="sm"
            >
              <Plus className="w-4 h-4 mr-1" />
              Create
            </Button>
          </div>
          <div className="bg-gray-200 dark:bg-gray-800/30 rounded-lg p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              No custom agents available{' '}
              <span className="text-blue-500 dark:text-blue-400 cursor-pointer hover:underline">Create</span>
            </p>
          </div>
        </div> */}

        {/* Built-in Agents Section */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">Built-In Tools</h3>
          <div className='border border-gray-500/20 dark:border-gray-700/50 rounded-lg'>
            {builtInTools.map((agentTool) => (
              <div
                key={agentTool.id}
                className="bg-gray-200/40 dark:bg-gray-800/30 last:rounded-b-lg first:rounded-t-lg py-2.5  border-b border-gray-500/20 dark:border-gray-700/50  last:border-b-0 hover:bg-gray-300/50 dark:hover:bg-gray-800/10 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center w-full space-x-3 px-2">
                    <div className="w-5 h-5 p-1 bg-gray-300/80 rounded-sm flex items-center justify-center">
                      <span className="text-gray-800 ">{agentTool.icon}</span>
                    </div>

                    <div className='flex justify-between items-center w-full'>
                      <h4 className="text-xs font-medium text-gray-800 dark:text-gray-200">{agentTool.name}</h4>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <p className="text-xs text-gray-600 dark:text-gray-400 w-96 truncate text-end cursor-pointer">{agentTool.description}</p>
                        </TooltipTrigger>
                        <TooltipContent className='bg-gray-100/20 dark:bg-[#0B0D13]/30 backdrop-blur-sm border dark:border-gray-700/50'>
                        <span className='flex items-center space-x-2 py-2 px-1'>
                          <Lightbulb className='h-4 text-yellow-400' />
                          <p className="max-w-xs text-black dark:text-gray-200">{agentTool.description}</p>
                        </span>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                  <div  className="text-gray-600 dark:text-gray-400 cursor-pointer">
                    <EllipsisVertical className='h-4' />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

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
    </TooltipProvider>
  );
};

export default AgentSetting;