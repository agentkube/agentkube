import React, { useState, useEffect } from 'react';
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

  // Reset config when dialog opens or tool changes
  useEffect(() => {
    if (isOpen) {
      // Filter config to only include valid fields for this tool
      const filteredConfig = filterConfigForTool(tool.id, currentConfig);
      setConfig(filteredConfig);
    }
  }, [isOpen, currentConfig, tool.id]);

  const filterConfigForTool = (toolId: string, config: Record<string, any>): Record<string, any> => {
    const validFields: Record<string, string[]> = {
      argocd: ['service_address', 'url', 'token'],
      prometheus: ['url', 'namespace', 'service_address', 'basic_auth', 'token'],
      loki: ['url', 'namespace', 'service_address', 'basic_auth', 'token', 'tenant_id'],
      opencost: ['service_address', 'namespace', 'url', 'token'],
      grafana: ['url', 'api_token', 'basic_auth'],
      alertmanager: ['url', 'token', 'basic_auth'],
      signoz: ['url', 'api_token', 'basic_auth'],
      datadog: ['url', 'api_token', 'key'],
      trivy: ['url', 'token'],
      docker: ['url', 'endpoint', 'user', 'key'],
      // Add other tools as needed
    };

    const allowedFields = validFields[toolId] || [];
    const filtered: Record<string, any> = {};

    allowedFields.forEach(field => {
      if (config[field] !== undefined) {
        filtered[field] = config[field];
      }
    });

    return filtered;
  };

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(config);
    onClose();
  };

  const updateConfig = (key: string, value: string | any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const renderConfigFields = () => {
    switch (tool.id) {
      case 'docker':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="url" className="text-sm font-medium text-accent dark:text-accent">
                Registry URL <span className="text-gray-500">(defaults to Docker Hub)</span>
              </Label>
              <Input
                id="url"
                type="url"
                placeholder="https://registry-1.docker.io"
                value={config.url || ''}
                onChange={(e) => updateConfig('url', e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endpoint" className="text-sm font-medium text-accent dark:text-accent">
                Auth Endpoint <span className="text-gray-500">(optional)</span>
              </Label>
              <Input
                id="endpoint"
                type="url"
                placeholder="https://auth.docker.io"
                value={config.endpoint || ''}
                onChange={(e) => updateConfig('endpoint', e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user" className="text-sm font-medium text-accent dark:text-accent">
                Username <span className="text-gray-500">(optional)</span>
              </Label>
              <Input
                id="user"
                type="text"
                placeholder="Docker Hub username"
                value={config.user || ''}
                onChange={(e) => updateConfig('user', e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="key" className="text-sm font-medium text-accent dark:text-accent">
                Password/PAT <span className="text-gray-500">(optional)</span>
              </Label>
              <Input
                id="key"
                type="password"
                placeholder="Personal Access Token"
                value={config.key || ''}
                onChange={(e) => updateConfig('key', e.target.value)}
                className="w-full"
              />
            </div>
          </>
        );
      case 'argocd':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="service_address" className="text-sm font-medium text-accent dark:text-accent">
                Service Address <span className="text-red-500">*</span>
              </Label>
              <Input
                id="service_address"
                type="text"
                placeholder="argocd-server.argocd:443"
                value={config.service_address || ''}
                onChange={(e) => updateConfig('service_address', e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="url" className="text-sm font-medium text-accent dark:text-accent">
                URL <span className="text-gray-500">(optional - for external ArgoCD)</span>
              </Label>
              <Input
                id="url"
                type="url"
                placeholder="https://argocd.example.com"
                value={config.url || ''}
                onChange={(e) => updateConfig('url', e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="token" className="text-sm font-medium text-accent dark:text-accent">
                Token <span className="text-red-500">*</span>
              </Label>
              <Input
                id="token"
                type="password"
                placeholder="Enter ArgoCD token"
                value={config.token || ''}
                onChange={(e) => updateConfig('token', e.target.value)}
                className="w-full"
              />
            </div>
          </>
        );
      case 'prometheus':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="url" className="text-sm font-medium text-accent dark:text-accent">
                URL <span className="text-red-500">*</span>
              </Label>
              <Input
                id="url"
                type="url"
                placeholder="https://prometheus.example.com"
                value={config.url || ''}
                onChange={(e) => updateConfig('url', e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="namespace" className="text-sm font-medium text-accent dark:text-accent">
                Namespace <span className="text-red-500">*</span>
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
              <Label htmlFor="service_address" className="text-sm font-medium text-accent dark:text-accent">
                Service Address <span className="text-gray-500">(optional - for internal access)</span>
              </Label>
              <Input
                id="service_address"
                type="text"
                placeholder="prometheus-stack-kube-prom-prometheus:9090"
                value={config.service_address || ''}
                onChange={(e) => updateConfig('service_address', e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="basic_auth" className="text-sm font-medium text-accent dark:text-accent">
                Basic Auth <span className="text-gray-500">(optional - username:password)</span>
              </Label>
              <Input
                id="basic_auth"
                type="text"
                placeholder="username:password"
                value={config.basic_auth ? `${config.basic_auth.username}:${config.basic_auth.password}` : ''}
                onChange={(e) => {
                  const [username, password] = e.target.value.split(':');
                  updateConfig('basic_auth', username && password ? { username, password } : '');
                }}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="token" className="text-sm font-medium text-accent dark:text-accent">
                Token <span className="text-gray-500">(optional)</span>
              </Label>
              <Input
                id="token"
                type="password"
                placeholder="Bearer token for authentication"
                value={config.token || ''}
                onChange={(e) => updateConfig('token', e.target.value)}
                className="w-full"
              />
            </div>
          </>
        );
      case 'loki':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="url" className="text-sm font-medium text-accent dark:text-accent">
                URL <span className="text-red-500">*</span>
              </Label>
              <Input
                id="url"
                type="url"
                placeholder="https://loki.example.com"
                value={config.url || ''}
                onChange={(e) => updateConfig('url', e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="namespace" className="text-sm font-medium text-accent dark:text-accent">
                Namespace <span className="text-red-500">*</span>
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
              <Label htmlFor="service_address" className="text-sm font-medium text-accent dark:text-accent">
                Service Address <span className="text-gray-500">(optional - for internal access)</span>
              </Label>
              <Input
                id="service_address"
                type="text"
                placeholder="loki:3100"
                value={config.service_address || ''}
                onChange={(e) => updateConfig('service_address', e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="basic_auth" className="text-sm font-medium text-accent dark:text-accent">
                Basic Auth <span className="text-gray-500">(optional - username:password)</span>
              </Label>
              <Input
                id="basic_auth"
                type="text"
                placeholder="username:password"
                value={config.basic_auth ? `${config.basic_auth.username}:${config.basic_auth.password}` : ''}
                onChange={(e) => {
                  const [username, password] = e.target.value.split(':');
                  updateConfig('basic_auth', username && password ? { username, password } : '');
                }}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="token" className="text-sm font-medium text-accent dark:text-accent">
                Token <span className="text-gray-500">(optional)</span>
              </Label>
              <Input
                id="token"
                type="password"
                placeholder="Bearer token for authentication"
                value={config.token || ''}
                onChange={(e) => updateConfig('token', e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenant_id" className="text-sm font-medium text-accent dark:text-accent">
                Tenant ID <span className="text-gray-500">(optional)</span>
              </Label>
              <Input
                id="tenant_id"
                type="text"
                placeholder="Tenant ID (X-Scope-OrgID)"
                value={config.tenant_id || ''}
                onChange={(e) => updateConfig('tenant_id', e.target.value)}
                className="w-full"
              />
            </div>
          </>
        );
      case 'alertmanager':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="url" className="text-sm font-medium text-accent dark:text-accent">
                URL <span className="text-red-500">*</span>
              </Label>
              <Input
                id="url"
                type="url"
                placeholder="https://alertmanager.example.com"
                value={config.url || ''}
                onChange={(e) => updateConfig('url', e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="token" className="text-sm font-medium text-accent dark:text-accent">
                Token <span className="text-gray-500">(optional)</span>
              </Label>
              <Input
                id="token"
                type="password"
                placeholder="API token"
                value={config.token || ''}
                onChange={(e) => updateConfig('token', e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="basic_auth" className="text-sm font-medium text-accent dark:text-accent">
                Basic Auth <span className="text-gray-500">(optional - username:password)</span>
              </Label>
              <Input
                id="basic_auth"
                type="text"
                placeholder="username:password"
                value={config.basic_auth ? `${config.basic_auth.username}:${config.basic_auth.password}` : ''}
                onChange={(e) => {
                  const [username, password] = e.target.value.split(':');
                  updateConfig('basic_auth', username && password ? { username, password } : '');
                }}
                className="w-full"
              />
            </div>
          </>
        );
      case 'grafana':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="url" className="text-sm font-medium text-accent dark:text-accent">
                URL <span className="text-red-500">*</span>
              </Label>
              <Input
                id="url"
                type="url"
                placeholder="https://grafana.example.com"
                value={config.url || ''}
                onChange={(e) => updateConfig('url', e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="api_token" className="text-sm font-medium text-accent dark:text-accent">
                API Token <span className="text-red-500">*</span>
              </Label>
              <Input
                id="api_token"
                type="password"
                placeholder="Grafana API key"
                value={config.api_token || ''}
                onChange={(e) => updateConfig('api_token', e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="basic_auth" className="text-sm font-medium text-accent dark:text-accent">
                Basic Auth <span className="text-gray-500">(optional - username:password)</span>
              </Label>
              <Input
                id="basic_auth"
                type="text"
                placeholder="username:password"
                value={config.basic_auth ? `${config.basic_auth.username}:${config.basic_auth.password}` : ''}
                onChange={(e) => {
                  const [username, password] = e.target.value.split(':');
                  updateConfig('basic_auth', username && password ? { username, password } : '');
                }}
                className="w-full"
              />
            </div>
          </>
        );
      case 'signoz':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="url" className="text-sm font-medium text-accent dark:text-accent">
                URL <span className="text-red-500">*</span>
              </Label>
              <Input
                id="url"
                type="url"
                placeholder="https://signoz.example.com"
                value={config.url || ''}
                onChange={(e) => updateConfig('url', e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="api_token" className="text-sm font-medium text-accent dark:text-accent">
                API Token <span className="text-gray-500">(optional)</span>
              </Label>
              <Input
                id="api_token"
                type="password"
                placeholder="SigNoz API key"
                value={config.api_token || ''}
                onChange={(e) => updateConfig('api_token', e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="basic_auth" className="text-sm font-medium text-accent dark:text-accent">
                Basic Auth <span className="text-gray-500">(optional - username:password)</span>
              </Label>
              <Input
                id="basic_auth"
                type="text"
                placeholder="username:password"
                value={config.basic_auth ? `${config.basic_auth.username}:${config.basic_auth.password}` : ''}
                onChange={(e) => {
                  const [username, password] = e.target.value.split(':');
                  updateConfig('basic_auth', username && password ? { username, password } : '');
                }}
                className="w-full"
              />
            </div>
          </>
        );
      case 'datadog':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="url" className="text-sm font-medium text-accent dark:text-accent">
                URL <span className="text-gray-500">(defaults to US1)</span>
              </Label>
              <Input
                id="url"
                type="url"
                placeholder="https://api.datadoghq.com"
                value={config.url || ''}
                onChange={(e) => updateConfig('url', e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="api_token" className="text-sm font-medium text-accent dark:text-accent">
                API Key <span className="text-red-500">*</span>
              </Label>
              <Input
                id="api_token"
                type="password"
                placeholder="Datadog API key"
                value={config.api_token || ''}
                onChange={(e) => updateConfig('api_token', e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="key" className="text-sm font-medium text-accent dark:text-accent">
                App Key <span className="text-red-500">*</span>
              </Label>
              <Input
                id="key"
                type="password"
                placeholder="Datadog application key"
                value={config.key || ''}
                onChange={(e) => updateConfig('key', e.target.value)}
                className="w-full"
              />
            </div>
          </>
        );
      case 'opencost':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="service_address" className="text-sm font-medium text-accent dark:text-accent">
                Service Address <span className="text-red-500">*</span>
              </Label>
              <Input
                id="service_address"
                type="text"
                placeholder="opencost:9090"
                value={config.service_address || ''}
                onChange={(e) => updateConfig('service_address', e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="namespace" className="text-sm font-medium text-accent dark:text-accent">
                Namespace <span className="text-red-500">*</span>
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
              <Label htmlFor="url" className="text-sm font-medium text-accent dark:text-accent">
                URL <span className="text-gray-500">(optional - for external OpenCost)</span>
              </Label>
              <Input
                id="url"
                type="url"
                placeholder="https://opencost.example.com"
                value={config.url || ''}
                onChange={(e) => updateConfig('url', e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="token" className="text-sm font-medium text-accent dark:text-accent">
                Token <span className="text-gray-500">(optional)</span>
              </Label>
              <Input
                id="token"
                type="password"
                placeholder="Authentication token if needed"
                value={config.token || ''}
                onChange={(e) => updateConfig('token', e.target.value)}
                className="w-full"
              />
            </div>
          </>
        );
      case 'trivy':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="url" className="text-sm font-medium text-accent dark:text-accent">
                URL <span className="text-red-500">*</span>
              </Label>
              <Input
                id="url"
                type="url"
                placeholder="https://trivy.example.com"
                value={config.url || ''}
                onChange={(e) => updateConfig('url', e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="token" className="text-sm font-medium text-accent dark:text-accent">
                Token <span className="text-gray-500">(optional)</span>
              </Label>
              <Input
                id="token"
                type="password"
                placeholder="Authentication token"
                value={config.token || ''}
                onChange={(e) => updateConfig('token', e.target.value)}
                className="w-full"
              />
            </div>
          </>
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
    <div className="fixed inset-0 bg-accent/20 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-card/40 backdrop-blur-md border dark:border-accent/40 rounded-lg w-[500px] max-w-full mx-4">
        <div className="flex items-center justify-between px-2 py-1 dark:bg-card">
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
          <Button onClick={handleSave}>
            Save Configuration
          </Button>
        </div>
      </div>
    </div>
  );
};
