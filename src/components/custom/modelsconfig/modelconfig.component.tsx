import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ArrowRight, Check, Eye, EyeOff, Monitor, Plus, AlertCircle, Lock, Rocket } from 'lucide-react';
import { getSettings, patchConfig } from '@/api/settings';
import { toast } from '@/hooks/use-toast'; // Assuming you have a toast component
import { openExternalUrl } from '@/api/external';
import { useAuth } from '@/contexts/useAuth';
import {
  validateOpenAIKey,
  validateAnthropicKey,
  validateGoogleKey,
  validateAzureKey,
  validateUrl,
  validateAzureUrl
} from '@/utils/key-validator.utils';

interface ModelConfigProps {
  // You can add props here if needed
}


const ModelConfig: React.FC<ModelConfigProps> = () => {
  const { user } = useAuth();

  // Check if user has pro plan (developer, startup, or enterprise)
  const hasProPlan = user?.subscription?.plan && user.subscription.plan !== 'free';
  const isAuthenticated = user?.isAuthenticated || false;

  // API key states
  const [openAIKey, setOpenAIKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [googleKey, setGoogleKey] = useState('');
  const [openaiEnabled, setOpenaiEnabled] = useState(false);
  const [anthropicEnabled, setAnthropicEnabled] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [azureEnabled, setAzureEnabled] = useState(false);
  const [azureBaseURL, setAzureBaseURL] = useState('');
  const [azureDeploymentName, setAzureDeploymentName] = useState('');
  const [azureKey, setAzureKey] = useState('');
  const [azureSaved, setAzureSaved] = useState(false);

  const [ollamaEnabled, setOllamaEnabled] = useState(false);
  const [ollamaEndpoint, setOllamaEndpoint] = useState('http://127.0.0.1:11434/v1');

  const [vllmEnabled, setVllmEnabled] = useState(false);
  const [vllmEndpoint, setVllmEndpoint] = useState('http://localhost:8000');

  const [showOpenAIBaseURL, setShowOpenAIBaseURL] = useState(false);
  const [openAIBaseURL, setOpenAIBaseURL] = useState('');
  const [showingOpenAIKey, setShowingOpenAIKey] = useState(false);
  const [showingAnthropicKey, setShowingAnthropicKey] = useState(false);
  const [showingGoogleKey, setShowingGoogleKey] = useState(false);
  const [showingAzureKey, setShowingAzureKey] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await getSettings();

        const externalProviderSettings = settings.models?.externalProviderSettings;
        if (externalProviderSettings) {
          // Decode and set keys if they exist
          if (externalProviderSettings.openai) {
            const openaiConfig = externalProviderSettings.openai;
            if (openaiConfig.apiKey) {
              try {
                setOpenAIKey(atob(openaiConfig.apiKey));
              } catch (e) {
                console.error('Failed to decode OpenAI key');
              }
            }
            setOpenaiEnabled(openaiConfig.enabled || false);

            // Set OpenAI base URL if it exists
            if (openaiConfig.baseUrl) {
              setOpenAIBaseURL(openaiConfig.baseUrl);
              setShowOpenAIBaseURL(true);
            }
          }

          if (externalProviderSettings.anthropic) {
            const anthropicConfig = externalProviderSettings.anthropic;
            if (anthropicConfig.apiKey) {
              try {
                setAnthropicKey(atob(anthropicConfig.apiKey));
              } catch (e) {
                console.error('Failed to decode Anthropic key');
              }
            }
            setAnthropicEnabled(anthropicConfig.enabled || false);
          }

          if (externalProviderSettings.google) {
            const googleConfig = externalProviderSettings.google;
            if (googleConfig.apiKey) {
              try {
                setGoogleKey(atob(googleConfig.apiKey));
              } catch (e) {
                console.error('Failed to decode Google key');
              }
            }
            setGoogleEnabled(googleConfig.enabled || false);
          }

          // Load Azure config if it exists
          if (externalProviderSettings.azure) {
            const azureConfig = externalProviderSettings.azure;
            setAzureEnabled(azureConfig.enabled || false);
            setAzureBaseURL(azureConfig.baseUrl || '');
            setAzureDeploymentName(azureConfig.deploymentName || '');
            if (azureConfig.apiKey) {
              try {
                setAzureKey(atob(azureConfig.apiKey));
              } catch (e) {
                console.error('Failed to decode Azure key');
              }
            }
            // If we have Azure config, consider it saved
            if (azureConfig.apiKey) {
              setAzureSaved(true);
            }
          }

          // Load Ollama config if it exists
          if (externalProviderSettings.ollama) {
            const ollamaConfig = externalProviderSettings.ollama;
            setOllamaEnabled(ollamaConfig.enabled || false);
            setOllamaEndpoint(ollamaConfig.endpoint || 'http://127.0.0.1:11434/v1');
          }

          // Load vLLM config if it exists
          if (externalProviderSettings.vllm) {
            const vllmConfig = externalProviderSettings.vllm;
            setVllmEnabled(vllmConfig.enabled || false);
            setVllmEndpoint(vllmConfig.endpoint || 'http://localhost:8000');
          }
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
        toast({
          title: 'Error',
          description: 'Failed to load model configuration',
          variant: 'destructive',
        });
      }
    };

    loadSettings();
  }, []);

  // Function to encode in base64
  const encodeBase64 = (str: string): string => {
    try {
      return btoa(str);
    } catch (e) {
      console.error('Failed to encode to base64:', e);
      return '';
    }
  };

  // Handle verification for each provider
  const verifyOpenAIKey = async () => {
    try {
      if (!openAIKey.trim()) {
        toast({
          title: 'Error',
          description: 'Please enter an OpenAI API key',
          variant: 'destructive',
        });
        return;
      }


      // Save the OpenAI key
      const configUpdate = {
        models: {
          externalProviderSettings: {
            openai: {
              apiKey: encodeBase64(openAIKey),
              enabled: openaiEnabled,
              ...(openAIBaseURL ? { baseUrl: openAIBaseURL } : {})
            }
          }
        }
      };

      await patchConfig(configUpdate);

      toast({
        title: 'Success',
        description: 'OpenAI API key saved successfully',
        variant: 'default',
      });
    } catch (error) {
      console.error('Error saving OpenAI key:', error);
      toast({
        title: 'Error',
        description: 'Failed to save OpenAI API key',
        variant: 'destructive',
      });
    }
  };

  const verifyAnthropicKey = async () => {
    try {
      if (!anthropicKey.trim()) {
        toast({
          title: 'Error',
          description: 'Please enter an Anthropic API key',
          variant: 'destructive',
        });
        return;
      }


      // Save the Anthropic key
      const configUpdate = {
        models: {
          externalProviderSettings: {
            anthropic: {
              apiKey: encodeBase64(anthropicKey),
              enabled: anthropicEnabled
            }
          }
        }
      };

      await patchConfig(configUpdate);

      toast({
        title: 'Success',
        description: 'Anthropic API key saved successfully',
        variant: 'default',
      });
    } catch (error) {
      console.error('Error saving Anthropic key:', error);
      toast({
        title: 'Error',
        description: 'Failed to save Anthropic API key',
        variant: 'destructive',
      });
    }
  };

  const verifyGoogleKey = async () => {
    try {
      if (!googleKey.trim()) {
        toast({
          title: 'Error',
          description: 'Please enter a Google API key',
          variant: 'destructive',
        });
        return;
      }


      // Save the Google key
      const configUpdate = {
        models: {
          externalProviderSettings: {
            google: {
              apiKey: encodeBase64(googleKey),
              enabled: googleEnabled
            }
          }
        }
      };

      await patchConfig(configUpdate);

      toast({
        title: 'Success',
        description: 'Google API key saved successfully',
        variant: 'default',
      });
    } catch (error) {
      console.error('Error saving Google key:', error);
      toast({
        title: 'Error',
        description: 'Failed to save Google API key',
        variant: 'destructive',
      });
    }
  };

  const saveAzureConfig = async () => {
    try {
      if (!azureBaseURL.trim() || !azureDeploymentName.trim() || !azureKey.trim()) {
        toast({
          title: 'Error',
          description: 'Please fill in all Azure configuration fields',
          variant: 'destructive',
        });
        return;
      }


      // Save the Azure config
      const configUpdate = {
        models: {
          externalProviderSettings: {
            azure: {
              baseUrl: azureBaseURL,
              deploymentName: azureDeploymentName,
              apiKey: encodeBase64(azureKey),
              enabled: azureEnabled
            }
          }
        }
      };

      await patchConfig(configUpdate);
      setAzureSaved(true);

      toast({
        title: 'Success',
        description: 'Azure configuration saved successfully',
        variant: 'default',
      });
    } catch (error) {
      console.error('Error saving Azure config:', error);
      toast({
        title: 'Error',
        description: 'Failed to save Azure configuration',
        variant: 'destructive',
      });
    }
  };

  // Toggle password visibility
  const toggleOpenAIKeyVisibility = () => setShowingOpenAIKey(!showingOpenAIKey);
  const toggleAnthropicKeyVisibility = () => setShowingAnthropicKey(!showingAnthropicKey);
  const toggleGoogleKeyVisibility = () => setShowingGoogleKey(!showingGoogleKey);
  const toggleAzureKeyVisibility = () => setShowingAzureKey(!showingAzureKey);

  // Update functions for toggling enabled state
  const updateOpenAIEnabled = async (enabled: boolean) => {
    // Always update local state so switch can toggle
    setOpenaiEnabled(enabled);

    // If enabling without API key, show warning but don't save
    if (enabled && !openAIKey) {
      return;
    }

    // Only save to backend if we have an API key
    if (!openAIKey && !enabled) {
      // Disabling without a key - nothing to save
      return;
    }

    try {
      const openaiConfig: any = {
        enabled: enabled,
      };

      if (openAIKey) {
        openaiConfig.apiKey = encodeBase64(openAIKey);
      }

      if (openAIBaseURL) {
        openaiConfig.baseUrl = openAIBaseURL;
      }

      const configUpdate = {
        models: {
          externalProviderSettings: {
            openai: openaiConfig
          }
        }
      };

      await patchConfig(configUpdate as any);

      toast({
        title: 'Success',
        description: `OpenAI provider ${enabled ? 'enabled' : 'disabled'}`,
        variant: 'default',
      });
    } catch (error) {
      console.error('Error updating OpenAI enabled state:', error);
      toast({
        title: 'Error',
        description: 'Failed to update OpenAI enabled state',
        variant: 'destructive',
      });
      // Revert on error
      setOpenaiEnabled(!enabled);
    }
  };

  const updateAnthropicEnabled = async (enabled: boolean) => {
    // Always update local state so switch can toggle
    setAnthropicEnabled(enabled);

    // If enabling without API key, show warning but don't save
    if (enabled && !anthropicKey) {
      return;
    }

    // Only save to backend if we have an API key
    if (!anthropicKey && !enabled) {
      return;
    }

    try {
      const anthropicConfig: any = {
        enabled: enabled
      };

      if (anthropicKey) {
        anthropicConfig.apiKey = encodeBase64(anthropicKey);
      }

      const configUpdate = {
        models: {
          externalProviderSettings: {
            anthropic: anthropicConfig
          }
        }
      };

      await patchConfig(configUpdate as any);

      toast({
        title: 'Success',
        description: `Anthropic provider ${enabled ? 'enabled' : 'disabled'}`,
        variant: 'default',
      });
    } catch (error) {
      console.error('Error updating Anthropic enabled state:', error);
      toast({
        title: 'Error',
        description: 'Failed to update Anthropic enabled state',
        variant: 'destructive',
      });
      // Revert on error
      setAnthropicEnabled(!enabled);
    }
  };

  const updateGoogleEnabled = async (enabled: boolean) => {
    // Always update local state so switch can toggle
    setGoogleEnabled(enabled);

    // If enabling without API key, show warning but don't save
    if (enabled && !googleKey) {
      return;
    }

    // Only save to backend if we have an API key
    if (!googleKey && !enabled) {
      return;
    }

    try {
      const googleConfig: any = {
        enabled: enabled
      };

      if (googleKey) {
        googleConfig.apiKey = encodeBase64(googleKey);
      }

      const configUpdate = {
        models: {
          externalProviderSettings: {
            google: googleConfig
          }
        }
      };

      await patchConfig(configUpdate as any);

      toast({
        title: 'Success',
        description: `Google provider ${enabled ? 'enabled' : 'disabled'}`,
        variant: 'default',
      });
    } catch (error) {
      console.error('Error updating Google enabled state:', error);
      toast({
        title: 'Error',
        description: 'Failed to update Google enabled state',
        variant: 'destructive',
      });
      // Revert on error
      setGoogleEnabled(!enabled);
    }
  };

  const updateAzureEnabled = async (enabled: boolean) => {
    // Always update local state so switch can toggle
    setAzureEnabled(enabled);

    // If enabling without complete config, show warning but don't save
    if (enabled && (!azureKey || !azureBaseURL || !azureDeploymentName)) {
      return;
    }

    // Only save to backend if we have the required config
    if ((!azureKey || !azureBaseURL || !azureDeploymentName) && !enabled) {
      return;
    }

    try {
      const azureConfig: any = {
        enabled: enabled
      };

      if (azureBaseURL) {
        azureConfig.baseUrl = azureBaseURL;
      }

      if (azureDeploymentName) {
        azureConfig.deploymentName = azureDeploymentName;
      }

      if (azureKey) {
        azureConfig.apiKey = encodeBase64(azureKey);
      }

      const configUpdate = {
        models: {
          externalProviderSettings: {
            azure: azureConfig
          }
        }
      };

      await patchConfig(configUpdate as any);

      toast({
        title: 'Success',
        description: `Azure provider ${enabled ? 'enabled' : 'disabled'}`,
        variant: 'default',
      });
    } catch (error) {
      console.error('Error updating Azure enabled state:', error);
      toast({
        title: 'Error',
        description: 'Failed to update Azure enabled state',
        variant: 'destructive',
      });
      // Revert on error
      setAzureEnabled(!enabled);
    }
  };

  const updateOllamaEnabled = async (enabled: boolean) => {
    // Always update local state so switch can toggle
    setOllamaEnabled(enabled);

    // If enabling without endpoint, show warning but don't save
    if (enabled && !ollamaEndpoint) {
      toast({
        title: 'Endpoint Required',
        description: 'Please enter an Ollama endpoint to use this provider',
        variant: 'destructive',
      });
      return;
    }

    // Only save to backend if we have an endpoint
    if (!ollamaEndpoint && !enabled) {
      return;
    }

    try {
      const ollamaConfig: any = {
        enabled: enabled,
        endpoint: ollamaEndpoint
      };

      const configUpdate = {
        models: {
          externalProviderSettings: {
            ollama: ollamaConfig
          }
        }
      };

      await patchConfig(configUpdate as any);

      toast({
        title: 'Success',
        description: `Ollama provider ${enabled ? 'enabled' : 'disabled'}`,
        variant: 'default',
      });
    } catch (error) {
      console.error('Error updating Ollama enabled state:', error);
      toast({
        title: 'Error',
        description: 'Failed to update Ollama enabled state',
        variant: 'destructive',
      });
      // Revert on error
      setOllamaEnabled(!enabled);
    }
  };

  const updateVllmEnabled = async (enabled: boolean) => {
    // Always update local state so switch can toggle
    setVllmEnabled(enabled);

    // If enabling without endpoint, show warning but don't save
    if (enabled && !vllmEndpoint) {
      toast({
        title: 'Endpoint Required',
        description: 'Please enter a vLLM endpoint to use this provider',
        variant: 'destructive',
      });
      return;
    }

    // Only save to backend if we have an endpoint
    if (!vllmEndpoint && !enabled) {
      return;
    }

    try {
      const vllmConfig: any = {
        enabled: enabled,
        endpoint: vllmEndpoint
      };

      const configUpdate = {
        models: {
          externalProviderSettings: {
            vllm: vllmConfig
          }
        }
      };

      await patchConfig(configUpdate as any);

      toast({
        title: 'Success',
        description: `vLLM provider ${enabled ? 'enabled' : 'disabled'}`,
        variant: 'default',
      });
    } catch (error) {
      console.error('Error updating vLLM enabled state:', error);
      toast({
        title: 'Error',
        description: 'Failed to update vLLM enabled state',
        variant: 'destructive',
      });
      // Revert on error
      setVllmEnabled(!enabled);
    }
  };

  const saveOllamaConfig = async () => {
    try {
      if (!ollamaEndpoint.trim()) {
        toast({
          title: 'Error',
          description: 'Please enter an Ollama endpoint',
          variant: 'destructive',
        });
        return;
      }

      const configUpdate = {
        models: {
          externalProviderSettings: {
            ollama: {
              endpoint: ollamaEndpoint,
              enabled: ollamaEnabled
            }
          }
        }
      };

      await patchConfig(configUpdate as any);

      toast({
        title: 'Success',
        description: 'Ollama configuration saved successfully',
        variant: 'default',
      });
    } catch (error) {
      console.error('Error saving Ollama config:', error);
      toast({
        title: 'Error',
        description: 'Failed to save Ollama configuration',
        variant: 'destructive',
      });
    }
  };

  const saveVllmConfig = async () => {
    try {
      if (!vllmEndpoint.trim()) {
        toast({
          title: 'Error',
          description: 'Please enter a vLLM endpoint',
          variant: 'destructive',
        });
        return;
      }

      const configUpdate = {
        models: {
          externalProviderSettings: {
            vllm: {
              endpoint: vllmEndpoint,
              enabled: vllmEnabled
            }
          }
        }
      };

      await patchConfig(configUpdate as any);

      toast({
        title: 'Success',
        description: 'vLLM configuration saved successfully',
        variant: 'default',
      });
    } catch (error) {
      console.error('Error saving vLLM config:', error);
      toast({
        title: 'Error',
        description: 'Failed to save vLLM configuration',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="p-6 space-y-8">
      {/* Authentication and Plan Check Banner */}
      {!isAuthenticated ? (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                Sign In Required
              </h3>
              <p className="mt-1 text-sm text-yellow-700 dark:text-yellow-300">
                Please sign in to your AgentKube account to configure external providers (BYOK/BYOM).
              </p>
              <Button
                onClick={() => openExternalUrl("https://account.agentkube.com")}
                className="mt-3 bg-yellow-600 hover:bg-yellow-700 text-white"
                size="sm"
              >
                Sign In
              </Button>
            </div>
          </div>
        </div>
      ) : !hasProPlan ? (
        <div className="bg-blue-50 dark:bg-blue-900/10 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <Lock className="h-5 w-5 text-blue-600 dark:text-blue-500 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200">
                Pro Plan Required
              </h3>
              <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
                BYOK (Bring Your Own Key) and BYOM (Bring Your Own Model) features are only available on Pro plans. Upgrade to unlock external provider integration.
              </p>
              <Button
                onClick={() => openExternalUrl("https://account.agentkube.com/settings?tab=plans")}
                className="w-44 flex justify-between mt-3 bg-blue-600 hover:bg-blue-700 text-white"
                size="sm"
              >
                <Rocket /> Upgrade Plan
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-green-50 dark:bg-green-900/10 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <Check className="h-5 w-5 text-green-600 dark:text-green-500 mt-0.5" />
            <div className="flex-1">
              <p className="mt-1 text-sm text-green-700 dark:text-green-300">
                You have access to BYOK (Bring Your Own Key) features. Configure your external providers below.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* OpenAI API Key Section */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-2xl font-light text-black dark:text-white">OpenAI API Key</h3>
            <p className="text-gray-700 dark:text-gray-400 text-sm mt-1">
              You can put in <a onClick={() => openExternalUrl("https://platform.openai.com/settings/organization/api-keys")} className="text-blue-500 hover:underline cursor-pointer">your OpenAI key</a> to use agentkube at public API costs. Note: this can cost more than pro and won't work for custom model features.
            </p>
          </div>
          <Switch
            checked={openaiEnabled}
            onCheckedChange={updateOpenAIEnabled}
          />
        </div>

        {openaiEnabled && (
          <div className="space-y-4 pl-4 border-l-2 border-gray-300 dark:border-gray-700 mt-4">
            <div className="flex gap-2">
              <div className="relative flex-grow">
                <Input
                  type={showingOpenAIKey ? "text" : "password"}
                  placeholder="Enter your OpenAI API Key"
                  value={openAIKey}
                  onChange={(e) => setOpenAIKey(e.target.value)}
                  className="h-7 pr-10 bg-transparent dark:bg-gray-500/10 border-gray-300 dark:border-gray-800/60"
                />
                <button
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  onClick={toggleOpenAIKeyVisibility}
                >
                  {showingOpenAIKey ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <Button
                onClick={verifyOpenAIKey}
                className=" text-white"
              >
                Verify <ArrowRight size={16} className="ml-1" />
              </Button>
            </div>

            <div>
              <Button
                variant="link"
                className="text-gray-500 dark:text-gray-400 p-0 h-auto text-sm"
                onClick={() => setShowOpenAIBaseURL(!showOpenAIBaseURL)}
              >
                Override OpenAI Base URL (when using key) {showOpenAIBaseURL ? "↑" : "↓"}
              </Button>

              {showOpenAIBaseURL && (
                <Input
                  type="text"
                  placeholder="https://api.openai.com/v1"
                  value={openAIBaseURL}
                  onChange={(e) => setOpenAIBaseURL(e.target.value)}
                  className="h-7 mt-2 bg-transparent dark:bg-gray-500/10 border-gray-300 dark:border-gray-800/60"
                />
              )}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-gray-200 dark:border-gray-800/70 my-6"></div>

      {/* Anthropic API Key Section */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-2xl font-light text-black dark:text-white">Anthropic API Key</h3>
            <p className="text-gray-700 dark:text-gray-400 text-sm mt-1">
              You can put in <a onClick={() => openExternalUrl("https://docs.anthropic.com/en/api/getting-started")} className="text-blue-500 hover:underline cursor-pointer">your Anthropic key</a> to use Claude at cost. When enabled, this key will be used for all models beginning with "claude-".
            </p>
          </div>
          <Switch
            checked={anthropicEnabled}
            onCheckedChange={updateAnthropicEnabled}
          />
        </div>

        {anthropicEnabled && (
          <div className="space-y-4 pl-4 border-l-2 border-gray-300 dark:border-gray-700 mt-4">
            <div className="flex gap-2">
              <div className="relative flex-grow">
                <Input
                  type={showingAnthropicKey ? "text" : "password"}
                  placeholder="Enter your Anthropic API Key"
                  value={anthropicKey}
                  onChange={(e) => setAnthropicKey(e.target.value)}
                  className="h-7 pr-10 bg-transparent dark:bg-gray-500/10 border-gray-300 dark:border-gray-800/60"
                />
                <button
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  onClick={toggleAnthropicKeyVisibility}
                >
                  {showingAnthropicKey ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <Button
                onClick={verifyAnthropicKey}
                className=" text-white"
              >
                Verify <ArrowRight size={16} className="ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-gray-200 dark:border-gray-800/70 my-6"></div>

      {/* Google API Key Section */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-2xl font-light text-black dark:text-white">Google API Key</h3>
            <p className="text-gray-700 dark:text-gray-400 text-sm mt-1">
              You can put in <a onClick={() => openExternalUrl("https://aistudio.google.com/app/apikey")} className="text-blue-500 hover:underline cursor-pointer">your Google AI Studio key</a> to use Google models at-cost.
            </p>
          </div>
          <Switch
            checked={googleEnabled}
            onCheckedChange={updateGoogleEnabled}
          />
        </div>

        {googleEnabled && (
          <div className="space-y-4 pl-4 border-l-2 border-gray-300 dark:border-gray-700 mt-4">
            <div className="flex gap-2">
              <div className="relative flex-grow">
                <Input
                  type={showingGoogleKey ? "text" : "password"}
                  placeholder="Enter your Google AI Studio API Key"
                  value={googleKey}
                  onChange={(e) => setGoogleKey(e.target.value)}
                  className="h-7 pr-10 bg-transparent dark:bg-gray-500/10 border-gray-300 dark:border-gray-800/60"
                />
                <button
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  onClick={toggleGoogleKeyVisibility}
                >
                  {showingGoogleKey ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <Button
                onClick={verifyGoogleKey}
                className=" text-white"
              >
                Verify <ArrowRight size={16} className="ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-gray-200 dark:border-gray-800/70 my-6"></div>

      {/* Azure API Key Section */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-2xl font-light text-black dark:text-white">Azure API Key</h3>
            <p className="text-gray-700 dark:text-gray-400 text-sm mt-1">
              Instead of OpenAI's API or pro, you can use agentkube at-cost through the Azure API.
            </p>
          </div>
          <Switch
            checked={azureEnabled}
            onCheckedChange={updateAzureEnabled}
          />
        </div>

        {azureEnabled && (
          <div className="space-y-4 pl-4 border-l-2 border-gray-300 dark:border-gray-700 mt-4">
            <div className="grid grid-cols-[100px_1fr] items-center gap-4">
              <span className="text-gray-700 dark:text-gray-300">Base URL</span>
              <Input
                type="text"
                placeholder="E.g. https://agentkube.openai.azure.com"
                value={azureBaseURL}
                onChange={(e) => setAzureBaseURL(e.target.value)}
                className="h-7 bg-transparent dark:bg-gray-500/10 border-gray-300 dark:border-gray-800/60"
              />
            </div>

            <div className="grid grid-cols-[100px_1fr] items-center gap-4">
              <span className="text-gray-700 dark:text-gray-300">Deployment Name</span>
              <Input
                type="text"
                placeholder="The deployment name you created in Azure"
                value={azureDeploymentName}
                onChange={(e) => setAzureDeploymentName(e.target.value)}
                className="h-7 bg-transparent dark:bg-gray-500/10 border-gray-300 dark:border-gray-800/60"
              />
            </div>

            <div className="grid grid-cols-[100px_1fr] items-center gap-4">
              <span className="text-gray-700 dark:text-gray-300">API Key</span>
              <div className="relative">
                <Input
                  type={showingAzureKey ? "text" : "password"}
                  placeholder="Enter your Azure OpenAI API Key"
                  value={azureKey}
                  onChange={(e) => setAzureKey(e.target.value)}
                  className="h-7 pr-10 bg-transparent dark:bg-gray-500/10 border-gray-300 dark:border-gray-800/60"
                />
                <button
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  onClick={toggleAzureKeyVisibility}
                >
                  {showingAzureKey ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {azureSaved ? (
                <div className="text-green-600 dark:text-green-400 flex items-center">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                    <Check className='h-4 w-4' />
                  </span>
                  <span className="ml-2">Saved</span>
                </div>
              ) : (
                <Button
                  onClick={saveAzureConfig}
                  className=" text-white"
                >
                  Save
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-gray-200 dark:border-gray-800/70 my-6"></div>

      {/* Ollama Section */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-2xl font-light text-black dark:text-white">Ollama </h3>
              <div className='text-blue-500 flex items-center gap-2 bg-blue-700/10 p-1 text-xs rounded-md'>
                <Monitor className="h-4 w-4" /> Local
              </div>
            </div>

            <p className="text-gray-700 dark:text-gray-400 text-sm mt-1">
              Connect to your local <a onClick={() => openExternalUrl("https://ollama.com")} className="text-blue-500 hover:underline cursor-pointer">Ollama</a> instance for completely offline, private AI inference. No API key required.
            </p>
          </div>
          <Switch
            checked={ollamaEnabled}
            onCheckedChange={updateOllamaEnabled}
          />
        </div>

        {ollamaEnabled && (
          <div className="space-y-4 pl-4 border-l-2 border-gray-300 dark:border-gray-700 mt-4">
            <div className="grid grid-cols-[100px_1fr] items-center gap-4">
              <span className="text-gray-700 dark:text-gray-300">Endpoint</span>
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="http://127.0.0.1:11434/v1"
                  value={ollamaEndpoint}
                  onChange={(e) => setOllamaEndpoint(e.target.value)}
                  className="h-7 bg-transparent dark:bg-gray-500/10 border-gray-300 dark:border-gray-800/60"
                />
                <Button
                  onClick={saveOllamaConfig}
                  className="text-white"
                >
                  Save
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-gray-200 dark:border-gray-800/70 my-6"></div>

      {/* vLLM Section */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-2xl font-light text-black dark:text-white">vLLM </h3>
              <div className='text-blue-500 flex items-center gap-2 bg-blue-700/10 p-1 text-xs rounded-md'>
                <Monitor className="h-4 w-4" /> Local
              </div>
            </div>

            <p className="text-gray-700 dark:text-gray-400 text-sm mt-1">
              Connect to your local <a onClick={() => openExternalUrl("https://vllm.ai")} className="text-blue-500 hover:underline cursor-pointer">vLLM</a> inference server for high-performance, production-ready local AI. No API key required.
            </p>
          </div>
          <Switch
            checked={vllmEnabled}
            onCheckedChange={updateVllmEnabled}
          />
        </div>

        {vllmEnabled && (
          <div className="space-y-4 pl-4 border-l-2 border-gray-300 dark:border-gray-700 mt-4">
            <div className="grid grid-cols-[100px_1fr] items-center gap-4">
              <span className="text-gray-700 dark:text-gray-300">Endpoint</span>
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="http://localhost:8000"
                  value={vllmEndpoint}
                  onChange={(e) => setVllmEndpoint(e.target.value)}
                  className="h-7 bg-transparent dark:bg-gray-500/10 border-gray-300 dark:border-gray-800/60"
                />
                <Button
                  onClick={saveVllmConfig}
                  className="text-white"
                >
                  Save
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ModelConfig;