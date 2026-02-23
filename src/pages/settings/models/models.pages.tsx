import React, { useState, useMemo, useEffect } from 'react';
import { Check, X, Brain, Key, ArrowUpRight, Rocket, Sparkles, Search, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ModelConfig } from '@/components/custom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/useAuth';
import { useModels } from '@/contexts/useModel';
import { AgentModelMap } from '@/components/custom';
import { openExternalUrl } from '@/api/external';
import type { Model } from '@/types/llm';

const MODELS_DEV_LOGO_BASE = 'https://models.dev/logos';

// Provider logo from models.dev with fallback
const ProviderLogo: React.FC<{ provider: string; size?: number }> = ({ provider, size = 16 }) => {
  const [failed, setFailed] = React.useState(false);
  if (failed) {
    return (
      <span
        className="inline-flex items-center justify-center rounded bg-gray-200 dark:bg-gray-700 text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase"
        style={{ width: size, height: size }}
      >
        {provider.charAt(0)}
      </span>
    );
  }
  return (
    <img
      src={`${MODELS_DEV_LOGO_BASE}/${provider}.svg`}
      alt={provider}
      className="inline-block rounded dark:invert"
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  );
};

// Provider display name map
const PROVIDER_NAMES: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  openrouter: 'OpenRouter',
  deepseek: 'DeepSeek',
  xai: 'xAI',
  mistral: 'Mistral',
  groq: 'Groq',
  cohere: 'Cohere',
  meta: 'Meta',
  ollama: 'Ollama',
  vllm: 'vLLM',
  azure: 'Azure',
  perplexity: 'Perplexity',
  together: 'Together',
  local: 'Local',
};

const providerDisplayName = (provider: string) =>
  PROVIDER_NAMES[provider] || provider.charAt(0).toUpperCase() + provider.slice(1);

// Sign In Banner Component
const SignInBanner = ({ user, oauth2Enabled }: { user: any; oauth2Enabled: boolean }) => {
  const navigate = useNavigate();

  // Don't show banner if auth is disabled
  if (!oauth2Enabled) {
    return null;
  }

  if (user?.isAuthenticated) {
    // Check if user is close to usage limit (80% or more)
    const usagePercentage = user.usage_limit ? (user.usage_count / user.usage_limit) * 100 : 0;
    const isCloseToLimit = usagePercentage >= 80;

    if (isCloseToLimit) {
      return (
        <div className="bg-orange-100/100 dark:bg-orange-800/40 rounded-lg px-4 py-2 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2">
                <Sparkles className='h-5 text-orange-500' />
                <span className="text-gray-800 dark:text-white font-medium">Credits Running Low</span>
              </div>
            </div>
            <Button
              onClick={() => openExternalUrl("https://agentkube.com/pricing")}
              size="sm"
            >
              <Rocket />
              Upgrade Now
            </Button>
          </div>
          <div className="mt-1">
            <p className="text-gray-600 dark:text-gray-300 text-sm">
              You've used {user.usage_count} of {user.usage_limit} credits. Upgrade to continue with unlimited usage.
            </p>
            <p onClick={() => openExternalUrl("https://agentkube.com/pricing")} className="flex items-center text-orange-400 text-sm mt-1 hover:text-orange-300 cursor-pointer">
              <span>
                Upgrade for unlimited access
              </span>
              <ArrowUpRight className='h-5' />
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="bg-gray-100/100 dark:bg-gray-800/40 rounded-lg px-4 py-2 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <Sparkles className='h-5 text-blue-500' />
              <span className="text-gray-800 dark:text-white font-medium">Free Credits Active</span>
            </div>
          </div>
          <Button
            onClick={() => openExternalUrl("https://agentkube.com/pricing")}
            size="sm"
          >
            <Rocket />
            Upgrade to Pro
          </Button>
        </div>
        <div className="mt-1">
          <p className="text-gray-600 dark:text-gray-300 text-sm">
            You have access to all models with your free credits. Upgrade for additional features.
          </p>
          <p onClick={() => openExternalUrl("https://agentkube.com/pricing")} className="flex items-center text-blue-400 text-sm mt-1 hover:text-blue-300 cursor-pointer">
            <span>
              Billed at API pricing
            </span>
            <ArrowUpRight className='h-5' />
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-blue-100/100 dark:bg-blue-500/5 rounded-lg px-4 py-2 mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <Sparkles className='h-5 text-blue-500' />
            <div className="">
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Sign in to access all models with free credits included.
              </p>
            </div>
          </div>
        </div>
        <Button
          onClick={() => navigate('/settings/account')}
          className='min-w-36 flex justify-between'
        >
          <Rocket />
          Sign In
        </Button>
      </div>

    </div>
  );
};

const ModelConfiguration = () => {
  const { allModels, loadAllModels, enableModel, disableModel, refreshModels, enabledModels } = useModels();
  const { user, oauth2Enabled } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());

  // Load ALL models on mount (not just enabled)
  useEffect(() => {
    loadAllModels();
    refreshModels();
  }, []);

  // Filter models based on search term
  const filteredModels = useMemo(() => {
    const allModelsMap = new Map<string, Model>();
    allModels.forEach(m => allModelsMap.set(m.full_id, m));

    // Include user's custom models from enabledModels if not in allModels catalog
    enabledModels.forEach(m => {
      if (!allModelsMap.has(m.full_id)) {
        allModelsMap.set(m.full_id, { ...m, status: 'Custom' });
      }
    });

    const allModelsList = Array.from(allModelsMap.values());

    if (!searchTerm.trim()) return allModelsList;

    const search = searchTerm.toLowerCase().trim();
    return allModelsList.filter(model => {
      return (
        model.name.toLowerCase().includes(search) ||
        model.provider.toLowerCase().includes(search) ||
        model.full_id.toLowerCase().includes(search)
      );
    });
  }, [allModels, enabledModels, searchTerm]);

  // Group models by provider
  const groupedModels = useMemo(() => {
    const groups: Record<string, Model[]> = {};
    for (const model of filteredModels) {
      const provider = model.provider;
      if (!groups[provider]) groups[provider] = [];
      groups[provider].push(model);
    }

    // Sort providers alphabetically, models within each provider alphabetically
    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([provider, models]) => ({
        provider,
        models: models.sort((a, b) => a.name.localeCompare(b.name)),
        enabledCount: models.filter(m => m.enabled).length,
        totalCount: models.length,
      }));
  }, [filteredModels]);

  const toggleModelEnabled = async (model: Model) => {
    try {
      if (model.enabled) {
        await disableModel(model.provider_id, model.id);
      } else {
        await enableModel(model.provider_id, model.id);
      }
      // Refresh the full catalog to update enabled flags
      await loadAllModels();
    } catch (error) {
      console.error('Error toggling model:', error);
    }
  };

  const toggleProviderExpanded = (provider: string) => {
    setExpandedProviders(prev => {
      const next = new Set(prev);
      if (next.has(provider)) {
        next.delete(provider);
      } else {
        next.add(provider);
      }
      return next;
    });
  };

  const renderModelItem = (model: Model) => {
    return (
      <div
        key={model.full_id}
        className="flex items-center py-1.5 px-3 cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/50 rounded-sm group"
        onClick={() => toggleModelEnabled(model)}
      >
        <div className="w-6 flex items-center">
          <div className={`w-4 h-4 border ${model.enabled ? 'bg-gray-300 dark:bg-gray-700 border-gray-300 dark:border-gray-700' : 'border-gray-600/50 bg-transparent'} rounded-sm flex items-center justify-center transition-colors`}>
            {model.enabled && <Check className="w-3 h-3 text-black dark:text-white" />}
          </div>
        </div>

        <div className={`flex items-center flex-1 ${model.enabled ? 'text-black dark:text-white' : 'text-gray-500 dark:text-gray-500'}`}>
          <span className="text-sm ml-1">
            {model.name}
          </span>
          {model.status && (
            <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 rounded">
              {model.status}
            </span>
          )}
        </div>

        {model.cost?.input > 0 && (
          <span className="text-[10px] text-gray-400 dark:text-gray-600 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
            ${model.cost.input < 1 ? model.cost.input.toFixed(3) : model.cost.input.toFixed(2)}/M
          </span>
        )}
        {model.cost?.input === 0 && (
          <span className="text-[10px] text-green-500 dark:text-green-600 opacity-0 group-hover:opacity-100 transition-opacity">
            Free
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6 text-gray-300">
      <div>
        <h1 className="text-4xl font-[Anton] uppercase text-gray-700/20 dark:text-gray-200/20 font-medium">Model Names</h1>
        <p className="text-gray-700 dark:text-gray-400 text-sm mt-1">
          Enable or disable models from your catalog. Models are sourced from models.dev.
        </p>
      </div>

      {/* Sign In Banner */}
      <SignInBanner user={user} oauth2Enabled={oauth2Enabled} />

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <input
          type="text"
          className="bg-transparent dark:bg-gray-700/10 border border-gray-300 dark:border-gray-800/60 w-full py-2 pl-10 pr-3 rounded text-black dark:text-white text-sm focus:outline-none focus:border-gray-400 dark:focus:border-gray-600"
          placeholder="Search models by name or provider..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Models grouped by provider */}
      <div className="space-y-1">
        {groupedModels.length > 0 ? (
          groupedModels.map(({ provider, models: providerModels, enabledCount, totalCount }) => {
            const isExpanded = expandedProviders.has(provider);
            return (
              <div key={provider} className="border border-gray-200 dark:border-gray-800/40 rounded-md overflow-hidden">
                {/* Provider header */}
                <div
                  className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800/30 transition-colors"
                  onClick={() => toggleProviderExpanded(provider)}
                >
                  <div className="flex items-center space-x-2">
                    <ChevronRight
                      size={14}
                      className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    />
                    <ProviderLogo provider={provider} size={16} />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {providerDisplayName(provider)}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-600">
                      {enabledCount}/{totalCount}
                    </span>
                  </div>
                </div>

                {/* Models list */}
                {isExpanded && (
                  <div className="border-t border-gray-100 dark:border-gray-800/30">
                    {providerModels.map(model => renderModelItem(model))}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No models found matching "{searchTerm}"</p>
            <p className="text-xs mt-1">Try adjusting your search term</p>
          </div>
        )}
      </div>

      {/* Accordion for Agent Model Mapping and API Keys */}
      <Accordion type="single" collapsible className="w-full space-y-2">
        {/* Agent Model Mapping */}
        <AccordionItem value="agent-model-map" className="border-gray-300 dark:border-gray-800/60">
          <AccordionTrigger className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:no-underline">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4" />
              <span>Agent Model Configuration</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <AgentModelMap />
          </AccordionContent>
        </AccordionItem>

        {/* API Keys */}
        <AccordionItem value="model-config" className="border-gray-300 dark:border-gray-800/60">
          <AccordionTrigger className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:no-underline">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4" />
              <span>API Keys</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <ModelConfig />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};

export default ModelConfiguration;