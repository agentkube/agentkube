import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Search, Cpu, GitBranch, Shuffle, Triangle, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  SiOpenai,
  SiAnthropic,
  SiGoogle,
  SiGithub,
  SiVercel,
  SiMistralai,
  SiX
} from '@icons-pack/react-simple-icons';
import { OpenRouter } from '@/assets/icons';
import { patchConfig } from '@/api/settings';
import { toast } from '@/hooks/use-toast';

// ─── Utilities ────────────────────────────────────────────────────────────────

// Function to encode in base64
const encodeBase64 = (str: string): string => {
  try {
    return btoa(str);
  } catch (e) {
    console.error('Failed to encode to base64:', e);
    return '';
  }
};

// Map dialog provider IDs to backend config keys
const PROVIDER_ID_MAP: Record<string, string> = {
  'github-copilot': 'github',
  'openrouter': 'openrouter',
  'openai': 'openai',
  'anthropic': 'anthropic',
  'google': 'google',
  'vercel': 'vercel',
  'mistral': 'mistral',
  'groq': 'groq',
  'cohere': 'cohere',
  'azure': 'azure',
  'ollama': 'ollama',
  'vllm': 'vllm',
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProviderField {
  name: string;
  label: string;
  placeholder: string;
  type?: 'text' | 'password';
  required?: boolean;
}

export interface Provider {
  id: string;
  name: string;
  description?: string;
  badge?: string;
  icon: React.ReactNode;
  category: 'popular' | 'other';
  connectDescription?: string;
  apiKeyLabel?: string;
  apiKeyPlaceholder?: string;
  fields?: ProviderField[]; // For providers requiring multiple fields
}

// ─── Provider List ────────────────────────────────────────────────────────────

const IC = 'h-4 w-4 shrink-0';

const PROVIDERS: Provider[] = [
  // ── Popular ────────────────────────────────────────────────────────────────
  {
    id: 'openrouter',
    name: 'OpenRouter',
    icon: <OpenRouter className={IC} />,
    category: 'popular',
    connectDescription: 'Enter your OpenRouter API key to access hundreds of models through a unified API.',
    apiKeyLabel: 'OpenRouter API key',
    apiKeyPlaceholder: 'sk-or-...',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    icon: <SiOpenai className={IC} />,
    category: 'popular',
    connectDescription: 'Enter your OpenAI API key to connect your account and use OpenAI models in AgentKube.',
    apiKeyLabel: 'OpenAI API key',
    apiKeyPlaceholder: 'sk-...',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    icon: <SiAnthropic className={IC} />,
    category: 'popular',
    connectDescription: 'Enter your Anthropic API key to connect your account and use Claude models in AgentKube.',
    apiKeyLabel: 'Anthropic API key',
    apiKeyPlaceholder: 'sk-ant-...',
  },
  {
    id: 'github-copilot',
    name: 'GitHub Copilot',
    icon: <SiGithub className={IC} />,
    category: 'popular',
    connectDescription: 'Enter your GitHub Copilot token to connect your account and use Copilot models in AgentKube.',
    apiKeyLabel: 'GitHub Token',
    apiKeyPlaceholder: 'ghp_...',
  },
  {
    id: 'google',
    name: 'Google',
    icon: <SiGoogle className={IC} />,
    category: 'popular',
    connectDescription: 'Enter your Google AI API key to connect your account and use Gemini models in AgentKube.',
    apiKeyLabel: 'Google AI API key',
    apiKeyPlaceholder: 'AIza...',
  },

  {
    id: 'vercel',
    name: 'Vercel AI Gateway',
    icon: <SiVercel className={IC} />,
    category: 'popular',
    connectDescription: 'Enter your Vercel AI Gateway API key to connect and use models via Vercel.',
    apiKeyLabel: 'Vercel API key',
    apiKeyPlaceholder: 'API key',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    icon: <Cpu className={IC} />,
    category: 'popular',
    badge: 'Local',
    connectDescription: 'Connect to your local Ollama instance for completely offline, private AI inference.',
    fields: [
      {
        name: 'endpoint',
        label: 'Endpoint',
        placeholder: 'http://127.0.0.1:11434/v1',
        type: 'text',
        required: true,
      },
    ],
  },
  {
    id: 'vllm',
    name: 'vLLM',
    icon: <Shuffle className={IC} />,
    category: 'popular',
    badge: 'Local',
    connectDescription: 'Connect to your local vLLM inference server for high-performance, production-ready AI.',
    fields: [
      {
        name: 'endpoint',
        label: 'Endpoint',
        placeholder: 'http://localhost:8000',
        type: 'text',
        required: true,
      },
    ],
  },

  // ── Other ──────────────────────────────────────────────────────────────────
  {
    id: 'mistral',
    name: 'Mistral',
    icon: <SiMistralai className={IC} />,
    category: 'other',
    connectDescription: 'Enter your Mistral API key to connect your account and use Mistral models in AgentKube.',
    apiKeyLabel: 'Mistral API key',
    apiKeyPlaceholder: 'API key',
  },
  {
    id: 'groq',
    name: 'Groq',
    icon: <SiX className={IC} />,
    category: 'other',
    connectDescription: 'Enter your Groq API key to use ultra-fast inference for open-source models.',
    apiKeyLabel: 'Groq API key',
    apiKeyPlaceholder: 'gsk_...',
  },
  {
    id: 'cohere',
    name: 'Cohere',
    icon: <GitBranch className={IC} />,
    category: 'other',
    connectDescription: 'Enter your Cohere API key to connect your account and use Cohere models in AgentKube.',
    apiKeyLabel: 'Cohere API key',
    apiKeyPlaceholder: 'API key',
  },
  {
    id: 'azure',
    name: 'Azure OpenAI',
    icon: <Triangle className={IC} />,
    category: 'other',
    connectDescription: 'Connect to Azure OpenAI for enterprise-grade AI with your own deployment.',
    fields: [
      {
        name: 'baseUrl',
        label: 'Base URL',
        placeholder: 'https://your-resource.openai.azure.com',
        type: 'text',
        required: true,
      },
      {
        name: 'deploymentName',
        label: 'Deployment Name',
        placeholder: 'gpt-4',
        type: 'text',
        required: true,
      },
      {
        name: 'apiKey',
        label: 'API Key',
        placeholder: 'Enter your Azure OpenAI API key',
        type: 'password',
        required: true,
      },
    ],
  },
];

// ─── Provider Row ─────────────────────────────────────────────────────────────

interface ProviderRowProps {
  provider: Provider;
  onSelect: (provider: Provider) => void;
}

const ProviderRow: React.FC<ProviderRowProps> = ({ provider, onSelect }) => (
  <button
    onClick={() => onSelect(provider)}
    className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors text-left group text-foreground hover:bg-accent/60"
  >
    <span className="opacity-60 group-hover:opacity-100 transition-opacity shrink-0">
      {provider.icon}
    </span>
    <span className="font-medium leading-none">{provider.name}</span>
    {provider.description && (
      <span className="ml-1 text-muted-foreground text-xs truncate">
        {provider.description}
      </span>
    )}
    {provider.badge && (
      <Badge
        variant="outline"
        className="ml-auto shrink-0 text-[10px] px-1.5 py-0 h-4 border-border text-muted-foreground"
      >
        {provider.badge}
      </Badge>
    )}
  </button>
);

// ─── Step 1 – Provider List ───────────────────────────────────────────────────

interface ListViewProps {
  onSelect: (provider: Provider) => void;
}

const ListView: React.FC<ListViewProps> = ({ onSelect }) => {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return PROVIDERS;
    return PROVIDERS.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q)
    );
  }, [search]);

  const popular = filtered.filter((p) => p.category === 'popular');
  const other = filtered.filter((p) => p.category === 'other');

  return (
    <>
      {/* Header */}
      <DialogHeader className="px-4 pt-4 pb-0">
        <DialogTitle className="text-sm font-semibold text-foreground">
          Connect provider
        </DialogTitle>
      </DialogHeader>

      {/* Search */}
      <div className="px-3 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search providers"
            className="h-8 pl-8 text-xs bg-secondary border-border placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
      </div>

      {/* List */}
      <div className="overflow-y-auto max-h-[380px] px-2 pb-3 space-y-1
        [&::-webkit-scrollbar]:w-1.5
        [&::-webkit-scrollbar-track]:bg-transparent
        [&::-webkit-scrollbar-thumb]:bg-gray-700/30
        [&::-webkit-scrollbar-thumb]:rounded-full
        [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">
        {popular.length > 0 && (
          <div>
            <p className="px-3 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Popular
            </p>
            <div className="space-y-0.5">
              {popular.map((p) => (
                <ProviderRow key={p.id} provider={p} onSelect={onSelect} />
              ))}
            </div>
          </div>
        )}

        {other.length > 0 && (
          <div>
            <p className="px-3 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Other
            </p>
            <div className="space-y-0.5">
              {other.map((p) => (
                <ProviderRow key={p.id} provider={p} onSelect={onSelect} />
              ))}
            </div>
          </div>
        )}

        {filtered.length === 0 && (
          <p className="text-center text-xs text-muted-foreground py-8">
            No providers found for &ldquo;{search}&rdquo;
          </p>
        )}
      </div>
    </>
  );
};

// ─── Step 2 – API Key Form ────────────────────────────────────────────────────

interface ConnectViewProps {
  provider: Provider;
  onBack: () => void;
  onSubmit: (provider: Provider, data: Record<string, string>) => void;
}

const ConnectView: React.FC<ConnectViewProps> = ({ provider, onBack, onSubmit }) => {
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  // Initialize form data with default values if needed
  React.useEffect(() => {
    if (provider.fields) {
      const initialData: Record<string, string> = {};
      provider.fields.forEach(field => {
        initialData[field.name] = '';
      });
      setFormData(initialData);
    } else {
      setFormData({ apiKey: '' });
    }
  }, [provider]);

  const handleFieldChange = (fieldName: string, value: string) => {
    setFormData(prev => ({ ...prev, [fieldName]: value }));
  };

  const isFormValid = () => {
    if (provider.fields) {
      return provider.fields
        .filter(f => f.required !== false)
        .every(field => formData[field.name]?.trim());
    }
    return formData.apiKey?.trim();
  };

  const handleSubmit = async () => {
    if (!isFormValid()) return;
    setLoading(true);

    try {
      // Get the backend config key for this provider
      const configKey = PROVIDER_ID_MAP[provider.id] || provider.id;

      // Build the config object based on provider type
      let providerConfig: any = { enabled: true };

      if (provider.fields) {
        // Multi-field providers (Azure, Ollama, vLLM)
        provider.fields.forEach(field => {
          const value = formData[field.name];
          if (value) {
            if (field.name === 'apiKey') {
              providerConfig.apiKey = encodeBase64(value);
            } else {
              providerConfig[field.name] = value;
            }
          }
        });
      } else {
        // Single API key providers
        if (formData.apiKey) {
          providerConfig.apiKey = encodeBase64(formData.apiKey);
        }
      }

      // Save to backend
      const configUpdate = {
        models: {
          externalProviderSettings: {
            [configKey]: providerConfig
          }
        }
      };

      await patchConfig(configUpdate);

      toast({
        title: 'Success',
        description: `${provider.name} connected successfully`,
        variant: 'default',
      });

      setLoading(false);
      onSubmit(provider, formData);
    } catch (error) {
      console.error(`Error connecting ${provider.name}:`, error);
      toast({
        title: 'Error',
        description: `Failed to connect ${provider.name}. Please try again.`,
        variant: 'destructive',
      });
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && isFormValid()) {
      handleSubmit();
    }
  };

  return (
    <>
      {/* Header with back arrow */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-0">
        <button
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Back to providers"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        {/* spacer to push close button (rendered by DialogContent) away */}
        <div className="flex-1" />
      </div>

      {/* Provider title */}
      <div className="px-6 pt-3 pb-2 flex items-center gap-3">
        <span className="text-foreground opacity-80">{provider.icon}</span>
        <DialogTitle className="text-lg font-semibold text-foreground">
          Connect {provider.name}
        </DialogTitle>
        {provider.badge && (
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0 h-4 border-border text-muted-foreground"
          >
            {provider.badge}
          </Badge>
        )}
      </div>

      {/* Description */}
      <p className="px-6 text-sm text-muted-foreground leading-relaxed">
        {provider.connectDescription ??
          `Enter your ${provider.name} API key to connect your account and use ${provider.name} models in AgentKube.`}
      </p>

      {/* Form fields */}
      <div className="px-6 pt-5 pb-6 space-y-3">
        {provider.fields ? (
          // Multi-field form (Azure, Ollama, vLLM)
          provider.fields.map((field, index) => (
            <div key={field.name} className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                {field.label}
                {field.required !== false && <span className="text-red-500 ml-1">*</span>}
              </Label>
              <Input
                autoFocus={index === 0}
                type={field.type ?? 'text'}
                value={formData[field.name] || ''}
                onChange={(e) => handleFieldChange(field.name, e.target.value)}
                placeholder={field.placeholder}
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
                onKeyDown={handleKeyDown}
              />
            </div>
          ))
        ) : (
          // Single API key field (default)
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              {provider.apiKeyLabel ?? `${provider.name} API key`}
            </Label>
            <Input
              autoFocus
              type="password"
              value={formData.apiKey || ''}
              onChange={(e) => handleFieldChange('apiKey', e.target.value)}
              placeholder={provider.apiKeyPlaceholder ?? 'API key'}
              className="bg-secondary border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
              onKeyDown={handleKeyDown}
            />
          </div>
        )}

        <Button
          onClick={handleSubmit}
          disabled={!isFormValid() || loading}
          className="mt-1 w-auto bg-foreground text-background hover:bg-foreground/90 font-medium"
        >
          {loading ? 'Connecting…' : 'Connect'}
        </Button>
      </div>
    </>
  );
};

// ─── Root Dialog ──────────────────────────────────────────────────────────────

export interface ProviderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectProvider?: (provider: Provider, data: Record<string, string>) => void;
}

const ProviderDialog: React.FC<ProviderDialogProps> = ({
  open,
  onOpenChange,
  onSelectProvider,
}) => {
  const [selected, setSelected] = useState<Provider | null>(null);

  const handleBack = () => setSelected(null);

  const handleSubmit = (provider: Provider, data: Record<string, string>) => {
    onSelectProvider?.(provider, data);
    // reset for next open
    setSelected(null);
    onOpenChange(false);
  };

  // Reset selection when dialog closes
  const handleOpenChange = (val: boolean) => {
    if (!val) setSelected(null);
    onOpenChange(val);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          'p-0 gap-0 overflow-hidden transition-all duration-200',
          'w-[480px] max-w-[95vw]',
          'bg-card border border-border shadow-2xl'
        )}
      >
        {selected ? (
          <ConnectView
            provider={selected}
            onBack={handleBack}
            onSubmit={handleSubmit}
          />
        ) : (
          <ListView onSelect={setSelected} />
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ProviderDialog;
