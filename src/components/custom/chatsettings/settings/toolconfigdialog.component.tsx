import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { X, Plus, Info, EllipsisVertical, Terminal, Files, Lightbulb, BotMessageSquare, Settings, Power } from "lucide-react";
import { Switch } from '@/components/ui/switch';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Agent } from './agentsetting.component';


// Configuration Dialog Component
export const ConfigDialog: React.FC<{
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
      case 'docker':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="registry_url" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Registry URL <span className="text-gray-500">(optional - defaults to Docker Hub)</span>
              </Label>
              <Input
                id="registry_url"
                type="url"
                placeholder="https://registry-1.docker.io"
                value={config.registry_url || ''}
                onChange={(e) => updateConfig('registry_url', e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="auth_url" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Auth URL <span className="text-gray-500">(optional - defaults to Docker Hub auth)</span>
              </Label>
              <Input
                id="auth_url"
                type="url"
                placeholder="https://auth.docker.io"
                value={config.auth_url || ''}
                onChange={(e) => updateConfig('auth_url', e.target.value)}
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
                placeholder="Docker Hub username"
                value={config.username || ''}
                onChange={(e) => updateConfig('username', e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Password/PAT <span className="text-gray-500">(optional)</span>
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Personal Access Token"
                value={config.password || ''}
                onChange={(e) => updateConfig('password', e.target.value)}
                className="w-full"
              />
            </div>
          </>
        );
      case 'argocd':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="base_url" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Base URL <span className="text-gray-500">(optional - for external ArgoCD)</span>
              </Label>
              <Input
                id="base_url"
                type="url"
                placeholder="https://argocd.example.com (leave empty for internal)"
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
                Base URL <span className="text-gray-500">(optional - for external Prometheus)</span>
              </Label>
              <Input
                id="base_url"
                type="url"
                placeholder="https://prometheus.example.com (leave empty for internal proxy)"
                value={config.base_url || ''}
                onChange={(e) => updateConfig('base_url', e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="namespace" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Namespace
              </Label>
              <Input
                id="namespace"
                type="text"
                placeholder="monitoring"
                value={config.namespace || ''}
                onChange={(e) => updateConfig('namespace', e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="service" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Service
              </Label>
              <Input
                id="service"
                type="text"
                placeholder="prometheus-stack-kube-prom-prometheus:9090"
                value={config.service || ''}
                onChange={(e) => updateConfig('service', e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="api_token" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                API Token <span className="text-gray-500">(optional)</span>
              </Label>
              <Input
                id="api_token"
                type="password"
                placeholder="For cloud/auth proxy"
                value={config.api_token || ''}
                onChange={(e) => updateConfig('api_token', e.target.value)}
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
                placeholder="Basic auth username"
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
                placeholder="Basic auth password"
                value={config.password || ''}
                onChange={(e) => updateConfig('password', e.target.value)}
                className="w-full"
              />
            </div>
          </>
        );
      case 'alertmanager':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="base_url" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Base URL
              </Label>
              <Input
                id="base_url"
                type="url"
                placeholder="https://alertmanager.example.com"
                value={config.base_url || ''}
                onChange={(e) => updateConfig('base_url', e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="api_token" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                API Token <span className="text-gray-500">(optional)</span>
              </Label>
              <Input
                id="api_token"
                type="password"
                placeholder="API token"
                value={config.api_token || ''}
                onChange={(e) => updateConfig('api_token', e.target.value)}
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
                placeholder="Username"
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
                placeholder="Password"
                value={config.password || ''}
                onChange={(e) => updateConfig('password', e.target.value)}
                className="w-full"
              />
            </div>
          </>
        );
      case 'grafana':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="base_url" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Base URL
              </Label>
              <Input
                id="base_url"
                type="url"
                placeholder="https://grafana.example.com"
                value={config.base_url || ''}
                onChange={(e) => updateConfig('base_url', e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="api_key" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                API Key
              </Label>
              <Input
                id="api_key"
                type="password"
                placeholder="Grafana API key"
                value={config.api_key || ''}
                onChange={(e) => updateConfig('api_key', e.target.value)}
                className="w-full"
              />
            </div>
          </>
        );
      case 'signoz':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="base_url" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Base URL
              </Label>
              <Input
                id="base_url"
                type="url"
                placeholder="https://signoz.example.com"
                value={config.base_url || ''}
                onChange={(e) => updateConfig('base_url', e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="api_key" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                API Key <span className="text-gray-500">(optional)</span>
              </Label>
              <Input
                id="api_key"
                type="password"
                placeholder="SigNoz API key"
                value={config.api_key || ''}
                onChange={(e) => updateConfig('api_key', e.target.value)}
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
                placeholder="Username"
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
                placeholder="Password"
                value={config.password || ''}
                onChange={(e) => updateConfig('password', e.target.value)}
                className="w-full"
              />
            </div>
          </>
        );
      case 'datadog':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="api_key" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                API Key
              </Label>
              <Input
                id="api_key"
                type="password"
                placeholder="Datadog API key"
                value={config.api_key || ''}
                onChange={(e) => updateConfig('api_key', e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="app_key" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                App Key
              </Label>
              <Input
                id="app_key"
                type="password"
                placeholder="Datadog application key"
                value={config.app_key || ''}
                onChange={(e) => updateConfig('app_key', e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="site" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Site <span className="text-gray-500">(optional - defaults to US1)</span>
              </Label>
              <Input
                id="site"
                type="text"
                placeholder="datadoghq.com, datadoghq.eu, etc."
                value={config.site || ''}
                onChange={(e) => updateConfig('site', e.target.value)}
                className="w-full"
              />
            </div>
          </>
        );
      case 'opencost':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="base_url" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Base URL <span className="text-gray-500">(optional - for external OpenCost)</span>
              </Label>
              <Input
                id="base_url"
                type="url"
                placeholder="https://opencost.example.com (leave empty for internal proxy)"
                value={config.base_url || ''}
                onChange={(e) => updateConfig('base_url', e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="namespace" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Namespace
              </Label>
              <Input
                id="namespace"
                type="text"
                placeholder="opencost"
                value={config.namespace || ''}
                onChange={(e) => updateConfig('namespace', e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="server" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Server Address
              </Label>
              <Input
                id="server"
                type="text"
                placeholder="service name or address"
                value={config.server || ''}
                onChange={(e) => updateConfig('server', e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="api_token" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                API Token <span className="text-gray-500">(optional)</span>
              </Label>
              <Input
                id="api_token"
                type="password"
                placeholder="Authentication token if needed"
                value={config.api_token || ''}
                onChange={(e) => updateConfig('api_token', e.target.value)}
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
        return (
          <div className="text-center text-gray-500 py-4">
            No configuration required for {tool.name}
          </div>
        );
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
