import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ArrowRight, Check, Eye, EyeOff, Plus } from 'lucide-react';
import { getSettings, patchConfig } from '@/api/settings';
import { toast } from '@/hooks/use-toast'; // Assuming you have a toast component
import { openExternalUrl } from '@/api/external';
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
  // API key states
  const [openAIKey, setOpenAIKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [googleKey, setGoogleKey] = useState('');
  const [azureEnabled, setAzureEnabled] = useState(false);
  const [azureBaseURL, setAzureBaseURL] = useState('');
  const [azureDeploymentName, setAzureDeploymentName] = useState('');
  const [azureKey, setAzureKey] = useState('');
  const [azureSaved, setAzureSaved] = useState(false);  

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

        const externalConfig = settings.models?.externalConfig;
        if (externalConfig) {
          // Decode and set keys if they exist
          if (externalConfig.openai?.apiKey) {
            try {
              setOpenAIKey(atob(externalConfig.openai.apiKey));
            } catch (e) {
              console.error('Failed to decode OpenAI key');
            }
          }
          
          if (externalConfig.anthropic?.apiKey) {
            try {
              setAnthropicKey(atob(externalConfig.anthropic.apiKey));
            } catch (e) {
              console.error('Failed to decode Anthropic key');
            }
          }
          
          if (externalConfig.google?.apiKey) {
            try {
              setGoogleKey(atob(externalConfig.google.apiKey));
            } catch (e) {
              console.error('Failed to decode Google key');
            }
          }
          
          // Set OpenAI base URL if it exists
          if (externalConfig.openai?.baseUrl) {
            setOpenAIBaseURL(externalConfig.openai.baseUrl);
            setShowOpenAIBaseURL(true);
          }
          
          // Load Azure config if it exists
          if (externalConfig.azure) {
            setAzureEnabled(true);
            setAzureBaseURL(externalConfig.azure.baseUrl || '');
            setAzureDeploymentName(externalConfig.azure.deploymentName || '');
            if (externalConfig.azure.apiKey) {
              try {
                setAzureKey(atob(externalConfig.azure.apiKey));
              } catch (e) {
                console.error('Failed to decode Azure key');
              }
            }
            // If we have Azure config, consider it saved
            if (externalConfig.azure.apiKey) {
              setAzureSaved(true);
            }
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

      if (!validateOpenAIKey(openAIKey)) {
        toast({
          title: 'Warning',
          description: 'The OpenAI key format appears to be invalid. Keys typically start with "sk-".',
          variant: 'destructive',
        });
        return;
      }

      if (openAIBaseURL && !validateUrl(openAIBaseURL)) {
        toast({
          title: 'Error',
          description: 'The OpenAI base URL format is invalid.',
          variant: 'destructive',
        });
        return;
      }

      // Save the OpenAI key
      const configUpdate = {
        models: {
          externalConfig: {
            openai: {
              apiKey: encodeBase64(openAIKey),
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

      if (!validateAnthropicKey(anthropicKey)) {
        toast({
          title: 'Warning',
          description: 'The Anthropic key format appears to be invalid. Keys typically start with "sk-ant-".',
          variant: 'destructive',
        });
        return;
      }

      // Save the Anthropic key
      const configUpdate = {
        models: {
          externalConfig: {
            anthropic: {
              apiKey: encodeBase64(anthropicKey)
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

      if (!validateGoogleKey(googleKey)) {
        toast({
          title: 'Warning',
          description: 'The Google key format appears to be invalid. Please check your key.',
          variant: 'destructive',
        });
        return;
      }

      // Save the Google key
      const configUpdate = {
        models: {
          externalConfig: {
            google: {
              apiKey: encodeBase64(googleKey)
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

      if (!validateAzureUrl(azureBaseURL)) {
        toast({
          title: 'Error',
          description: 'The Azure base URL format is invalid. It should be an Azure domain.',
          variant: 'destructive',
        });
        return;
      }

      if (!validateAzureKey(azureKey)) {
        toast({
          title: 'Warning',
          description: 'The Azure key format appears to be invalid. Please check your key.',
          variant: 'destructive',
        });
        return;
      }

      // Save the Azure config
      const configUpdate = {
        models: {
          externalConfig: {
            azure: {
              baseUrl: azureBaseURL,
              deploymentName: azureDeploymentName,
              apiKey: encodeBase64(azureKey)
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

  return (
    <div className="p-6 space-y-8">
      {/* OpenAI API Key Section */}
      <div className="space-y-4">
        <div>
          <h3 className="text-2xl font-medium text-black dark:text-white">OpenAI API Key</h3>
          <p className="text-gray-700 dark:text-gray-400 text-sm mt-1">
            You can put in <a href="#" className="text-blue-500 hover:underline">your OpenAI key</a> to use agentkube at public API costs. Note: this can cost more than pro and won't work for custom model features.
          </p>
        </div>
        
        <div className="flex gap-2">
          <div className="relative flex-grow">
            <Input
              type={showingOpenAIKey ? "text" : "password"}
              placeholder="Enter your OpenAI API Key"
              value={openAIKey}
              onChange={(e) => setOpenAIKey(e.target.value)}
              className="pr-10 bg-transparent dark:bg-gray-900/50 border-gray-300 dark:border-gray-800/60"
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
              className="mt-2 bg-transparent dark:bg-gray-900/50 border-gray-300 dark:border-gray-800/60"
            />
          )}
        </div>
      </div>
      
      <div className="border-t border-gray-200 dark:border-gray-800/70 my-6"></div>
      
      {/* Anthropic API Key Section */}
      <div className="space-y-4">
        <div>
          <h3 className="text-2xl font-medium text-black dark:text-white">Anthropic API Key</h3>
          <p className="text-gray-700 dark:text-gray-400 text-sm mt-1">
            You can put in <a onClick={() => openExternalUrl("https://docs.anthropic.com/en/api/getting-started")} className="text-blue-500 hover:underline">your Anthropic key</a> to use Claude at cost. When enabled, this key will be used for all models beginning with "claude-".
          </p>
        </div>
        
        <div className="flex gap-2">
          <div className="relative flex-grow">
            <Input
              type={showingAnthropicKey ? "text" : "password"}
              placeholder="Enter your Anthropic API Key"
              value={anthropicKey}
              onChange={(e) => setAnthropicKey(e.target.value)}
              className="pr-10 bg-transparent dark:bg-gray-900/50 border-gray-300 dark:border-gray-800/60"
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
      
      <div className="border-t border-gray-200 dark:border-gray-800/70 my-6"></div>
      
      {/* Google API Key Section */}
      <div className="space-y-4">
        <div>
          <h3 className="text-2xl font-medium text-black dark:text-white">Google API Key</h3>
          <p className="text-gray-700 dark:text-gray-400 text-sm mt-1">
            You can put in <a onClick={() => openExternalUrl("https://aistudio.google.com/app/apikey")} className="text-blue-500 hover:underline">your Google AI Studio key</a> to use Google models at-cost.
          </p>
        </div>
        
        <div className="flex gap-2">
          <div className="relative flex-grow">
            <Input
              type={showingGoogleKey ? "text" : "password"}
              placeholder="Enter your Google AI Studio API Key"
              value={googleKey}
              onChange={(e) => setGoogleKey(e.target.value)}
              className="pr-10 bg-transparent dark:bg-gray-900/50 border-gray-300 dark:border-gray-800/60"
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
      
      <div className="border-t border-gray-200 dark:border-gray-800/70 my-6"></div>
      
      <div className="border-t border-gray-200 dark:border-gray-800/70 my-6"></div>
      
      {/* Azure API Key Section */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-2xl font-medium text-black dark:text-white">Azure API Key</h3>
            <p className="text-gray-700 dark:text-gray-400 text-sm mt-1">
              Instead of OpenAI's API or pro, you can use agentkube at-cost through the Azure API.
            </p>
          </div>
          <Switch
            checked={azureEnabled}
            onCheckedChange={setAzureEnabled}
          />
        </div>
        
        {azureEnabled && (
          <div className="space-y-4 pl-4 border-l-2 border-gray-300 dark:border-gray-700 mt-4">
            <div className="grid grid-cols-[100px_1fr] items-center gap-4">
              <span className="text-gray-700 dark:text-gray-300">Base URL</span>
              <Input
                type="text"
                placeholder="E.g. https://cursor-oai.openai.azure.com"
                value={azureBaseURL}
                onChange={(e) => setAzureBaseURL(e.target.value)}
                className="bg-transparent dark:bg-gray-900/50 border-gray-300 dark:border-gray-800/60"
              />
            </div>
            
            <div className="grid grid-cols-[100px_1fr] items-center gap-4">
              <span className="text-gray-700 dark:text-gray-300">Deployment Name</span>
              <Input
                type="text"
                placeholder="The deployment name you created in Azure"
                value={azureDeploymentName}
                onChange={(e) => setAzureDeploymentName(e.target.value)}
                className="bg-transparent dark:bg-gray-900/50 border-gray-300 dark:border-gray-800/60"
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
                  className="pr-10 bg-transparent dark:bg-gray-900/50 border-gray-300 dark:border-gray-800/60"
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
    </div>
  );
};

export default ModelConfig;