import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ArrowRight, Eye, EyeOff, Plus } from 'lucide-react';
import AddMCPServer from './modelcontextprotocol/modelcontextprotocol-dialog.component';
import MCPServerList from './modelcontextprotocol/modelcontextprotocol-list.component';

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

  // Handle verification for each provider
  const verifyOpenAIKey = () => {
    // This would be an API call in production
    console.log('Verifying OpenAI key:', openAIKey);
    // Show success/error message
  };

  const verifyAnthropicKey = () => {
    console.log('Verifying Anthropic key:', anthropicKey);
  };

  const verifyGoogleKey = () => {
    console.log('Verifying Google key:', googleKey);
  };

  const saveAzureConfig = () => {
    console.log('Saving Azure config:', {
      baseURL: azureBaseURL,
      deploymentName: azureDeploymentName,
      key: azureKey
    });
    setAzureSaved(true);
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
            className="bg-blue-600 hover:bg-blue-700 text-white"
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
            You can put in <a href="#" className="text-blue-500 hover:underline">your Anthropic key</a> to use Claude at cost. When enabled, this key will be used for all models beginning with "claude-".
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
            className="bg-blue-600 hover:bg-blue-700 text-white"
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
            You can put in <a href="#" className="text-blue-500 hover:underline">your Google AI Studio key</a> to use Google models at-cost.
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
            className="bg-blue-600 hover:bg-blue-700 text-white"
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
            className="data-[state=checked]:bg-red-500"
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
                    ✓
                  </span>
                  <span className="ml-2">Saved</span>
                </div>
              ) : (
                <Button 
                  onClick={saveAzureConfig}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
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