import React, { useState, useEffect } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { useModels } from '@/contexts/useModel';
import { ORCHESTRATOR_URL } from '@/config';
import { patchConfig } from '@/api/settings';
import { OpenRouter } from '@/assets/icons';

// Agent types that need model configuration
const AGENTS = [
  { id: 'logAnalyzer', name: 'Log Analyzer', description: 'Analyzes pod logs' },
  { id: 'eventAnalyzer', name: 'Event Analyzer', description: 'Analyzes Kubernetes events' },
  { id: 'securityRemediator', name: 'Security Remediator', description: 'Security issue remediation' },
  { id: 'investigationTask', name: 'Investigation Task', description: 'Deep cluster investigation' },
  { id: 'chat', name: 'Chat', description: 'Interactive chat interface' },
] as const;

type AgentId = typeof AGENTS[number]['id'];

interface AgentModelConfig {
  provider: string;
  model: string;
}

const AgentModelMap = () => {
  const { models } = useModels();
  const [agentConfigs, setAgentConfigs] = useState<Record<AgentId, AgentModelConfig>>({
    logAnalyzer: { provider: 'default', model: '' },
    eventAnalyzer: { provider: 'default', model: '' },
    securityRemediator: { provider: 'default', model: '' },
    investigationTask: { provider: 'default', model: '' },
    chat: { provider: 'default', model: '' },
  });
  const [loading, setLoading] = useState<Record<AgentId, boolean>>({
    logAnalyzer: false,
    eventAnalyzer: false,
    securityRemediator: false,
    investigationTask: false,
    chat: false,
  });
  const [showSuccess, setShowSuccess] = useState<AgentId | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch the current agent model mappings from settings
  useEffect(() => {
    const fetchAgentConfigs = async () => {
      try {
        const response = await fetch(`${ORCHESTRATOR_URL}/api/config`);

        if (!response.ok) {
          throw new Error(`Failed to fetch settings: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        if (data.agentModelMapping) {
          setAgentConfigs(data.agentModelMapping);
        }
      } catch (error) {
        console.error('Error fetching agent model configs:', error);
      }
    };

    fetchAgentConfigs();
  }, []);

  const handleModelChange = async (agentId: AgentId, modelProvider: string, modelId: string) => {
    const currentConfig = agentConfigs[agentId];
    const newModelString = `${modelProvider}/${modelId}`;

    // Don't update if it's the same
    if (currentConfig.model === newModelString && currentConfig.provider === modelProvider) {
      return;
    }

    setLoading(prev => ({ ...prev, [agentId]: true }));
    try {
      // Update the agent model mapping in config
      await patchConfig({
        agentModelMapping: {
          [agentId]: {
            provider: modelProvider,
            model: modelId
          }
        }
      });

      // Update local state
      setAgentConfigs(prev => ({
        ...prev,
        [agentId]: {
          provider: modelProvider,
          model: modelId
        }
      }));

      // Show success indicator
      setShowSuccess(agentId);

      // Hide success indicator after 2 seconds
      setTimeout(() => {
        setShowSuccess(null);
      }, 2000);

    } catch (error) {
      console.error(`Error updating model for ${agentId}:`, error);
    } finally {
      setLoading(prev => ({ ...prev, [agentId]: false }));
    }
  };

  // Get the display name for a model
  const getModelDisplayName = (config: AgentModelConfig) => {
    if (!config.model) {
      return config.provider === 'default' ? 'Default' : `${config.provider} (Default)`;
    }

    const model = models.find(m => m.id === config.model);
    if (model) {
      return `${config.provider}/${model.name}`;
    }
    return config.model;
  };

  // Filter models based on search query
  const filteredModels = models.filter(model => {
    const searchText = searchQuery.toLowerCase();
    return (
      model.name.toLowerCase().includes(searchText) ||
      model.provider.toLowerCase().includes(searchText) ||
      `${model.provider}/${model.name}`.toLowerCase().includes(searchText)
    );
  });

  const handleSearchClick = (e: React.MouseEvent<HTMLInputElement>) => {
    e.stopPropagation();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Configure which model each agent should use. Set to "Default" to use openai/gpt-4o-mini.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {AGENTS.map((agent) => (
          <div key={agent.id} className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700/50 rounded-lg  bg-transparent dark:bg-transparent">
            <div className="flex-1">
              <h4 className="text-sm font-medium text-gray-900 dark:text-white">{agent.name}</h4>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{agent.description}</p>
            </div>

            <div className="flex items-center space-x-2">
              {showSuccess === agent.id && (
                <div className="flex items-center text-green-500 text-sm animate-pulse">
                  <Check className="mr-1 h-4 w-4" />
                  <span className="text-xs">Updated</span>
                </div>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="min-w-[280px] justify-between bg-transparent border border-gray-300 dark:border-gray-700/60 text-gray-900 dark:text-white"
                    disabled={loading[agent.id]}
                  >
                    <span className="text-sm">{getModelDisplayName(agentConfigs[agent.id])}</span>
                    <ChevronDown className="ml-2 h-4 w-4 text-gray-500" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end' className="bg-white dark:bg-[#0B0D13]/80 dark:border-gray-400/10 backdrop-blur-sm">
                  <div className="p-0 sticky top-0 z-10 bg-white dark:bg-[#0B0D13]/80 backdrop-blur-sm border-none border-gray-100 dark:border-gray-800/50">
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
                      <Input
                        placeholder="Search models..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onClick={handleSearchClick}
                        className="pl-8 h-9 bg-transparent dark:bg-transparent border-b border-gray-200 dark:border-gray-600/30 rounded-none text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                  </div>

                  <ScrollArea className="h-[250px] mt-1">
                    <div className="p-1">
                      {/* Default option */}
                      <DropdownMenuItem
                        className={`flex items-center w-80 justify-between cursor-pointer px-3 text-sm rounded-sm ${
                          agentConfigs[agent.id].provider === 'default' && !agentConfigs[agent.id].model
                            ? 'bg-gray-100 dark:bg-gray-700/60 text-gray-900 dark:text-white'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-900/10'
                        }`}
                        onClick={() => handleModelChange(agent.id, 'default', '')}
                      >
                        <span>Default</span>
                        {agentConfigs[agent.id].provider === 'default' && !agentConfigs[agent.id].model && (
                          <Check className="h-4 w-4 text-gray-900 dark:text-white" />
                        )}
                      </DropdownMenuItem>

                      {/* Divider */}
                      <div className="my-1 h-px bg-gray-200 dark:bg-gray-700/50" />

                      {/* Model options */}
                      {filteredModels.length > 0 ? (
                        filteredModels.map((model) => {
                          const isSelected =
                            agentConfigs[agent.id].provider === model.provider &&
                            agentConfigs[agent.id].model === model.id;

                          return (
                            <DropdownMenuItem
                              key={model.id}
                              className={`flex items-center w-80 justify-between cursor-pointer px-3 text-sm rounded-sm ${
                                isSelected
                                  ? 'bg-gray-100 dark:bg-gray-700/60 text-gray-900 dark:text-white'
                                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-900/10'
                              }`}
                              onClick={() => handleModelChange(agent.id, model.provider, model.id)}
                            >
                              <span>{model.provider}/{model.name}</span>
                              {isSelected && (
                                <Check className="h-4 w-4 text-gray-900 dark:text-white" />
                              )}
                              <OpenRouter className='dark:text-gray-400' size={10} />
                            </DropdownMenuItem>
                          );
                        })
                      ) : (
                        <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                          No models found
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-md">
        <p className="text-xs text-blue-800 dark:text-blue-300">
          <strong>Default:</strong> Uses openai/gpt-4o-mini. If you have custom providers configured (OpenAI, Anthropic, Ollama, etc.), you can select specific models for each agent.
        </p>
      </div>
    </div>
  );
};

export default AgentModelMap;
