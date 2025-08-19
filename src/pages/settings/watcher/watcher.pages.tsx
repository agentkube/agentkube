import React, { useState, useEffect } from 'react';
import { Save, Loader2, Plus, X, Eye, Search, Webhook, MessageSquare, Mail, Users, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useToast } from '@/hooks/use-toast';
import { SiSlack } from '@icons-pack/react-simple-icons';

interface CustomResource {
  group: string;
  version: string;
  resource: string;
}

interface DispatcherConfig {
  slack: {
    token: string;
    channel: string;
  };
  webhook: {
    url: string;
  };
  slackwebhook: {
    url: string;
  };
  smtp: {
    server: string;
    port: number;
    username: string;
    password: string;
    to: string;
    from: string;
  };
  msteam: {
    webhook: string;
  };
}

interface WatcherSettings {
  resourcesToWatch: Record<string, boolean>;
  customresources: CustomResource[];
  dispatchers: DispatcherConfig;
}

const Watcher: React.FC = () => {
  const { toast } = useToast();
  
  // State for resource watching
  const [resourcesToWatch, setResourcesToWatch] = useState<Record<string, boolean>>({});
  const [customResources, setCustomResources] = useState<CustomResource[]>([]);
  const [searchFilter, setSearchFilter] = useState('');
  
  // State for dispatchers
  const [dispatchers, setDispatchers] = useState<DispatcherConfig>({
    slack: { token: '', channel: '' },
    webhook: { url: '' },
    slackwebhook: { url: '' },
    smtp: { server: '', port: 587, username: '', password: '', to: '', from: '' },
    msteam: { webhook: '' }
  });
  
  // Form inputs for adding custom resources
  const [newCustomResource, setNewCustomResource] = useState<CustomResource>({
    group: '',
    version: '',
    resource: ''
  });
  
  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Default resources configuration
  const defaultResources = {
    deployment: false,
    replicationcontroller: false,
    replicaset: false,
    daemonset: false,
    services: false,
    pod: false,
    job: false,
    node: false,
    clusterrole: false,
    clusterrolebinding: false,
    serviceaccount: false,
    persistentvolume: false,
    namespace: false,
    secret: false,
    configmap: false,
    ingress: false,
    coreevent: false,
    event: false
  };

  // Fetch settings on component mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setIsLoading(true);
        // TODO: Replace with actual API call when watcher endpoint is implemented
        // const settings = await getSettings();
        
        // Mock data for now - remove when API is ready
        setResourcesToWatch(defaultResources);
        setCustomResources([]);
        setDispatchers({
          slack: { token: '', channel: '' },
          webhook: { url: '' },
          slackwebhook: { url: '' },
          smtp: { server: '', port: 587, username: '', password: '', to: '', from: '' },
          msteam: { webhook: '' }
        });

      } catch (error) {
        console.error('Failed to load watcher settings:', error);
        toast({
          title: "Error loading settings",
          description: "Could not load watcher settings. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, [toast]);

  // Handle resource toggle
  const handleResourceToggle = (resource: string, enabled: boolean) => {
    setResourcesToWatch(prev => ({
      ...prev,
      [resource]: enabled
    }));
  };

  // Handle adding custom resource
  const handleAddCustomResource = () => {
    if (newCustomResource.group && newCustomResource.version && newCustomResource.resource) {
      setCustomResources(prev => [...prev, { ...newCustomResource }]);
      setNewCustomResource({ group: '', version: '', resource: '' });
    }
  };

  // Handle removing custom resource
  const handleRemoveCustomResource = (index: number) => {
    setCustomResources(prev => prev.filter((_, i) => i !== index));
  };

  // Handle dispatcher config updates
  const handleDispatcherUpdate = (dispatcher: keyof DispatcherConfig, field: string, value: string | number) => {
    setDispatchers(prev => ({
      ...prev,
      [dispatcher]: {
        ...prev[dispatcher],
        [field]: value
      }
    }));
  };

  // Filter resources based on search
  const filteredResources = Object.entries(resourcesToWatch).filter(([resource]) =>
    resource.toLowerCase().includes(searchFilter.toLowerCase())
  );

  // Handle settings save
  const handleSaveSettings = async () => {
    try {
      setIsSaving(true);

      // TODO: Replace with actual API call when watcher endpoint is implemented
      // const watcherConfig: WatcherSettings = {
      //   resourcesToWatch,
      //   customresources: customResources,
      //   dispatchers
      // };
      // await updateSettingsSection('watcher', watcherConfig);

      // Mock success for now - remove when API is ready
      console.log('Would save watcher config:', {
        resourcesToWatch,
        customresources: customResources,
        dispatchers
      });

      toast({
        title: "Settings saved",
        description: "Your watcher settings have been updated successfully.",
      });
    } catch (error) {
      console.error('Failed to save watcher settings:', error);
      toast({
        title: "Error saving settings",
        description: "Could not save your watcher settings. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
        <span className="ml-2 text-gray-500">Loading watcher settings...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-[Anton] uppercase text-gray-700/20 dark:text-gray-200/20 font-medium">Watcher</h1>
        <p className="text-gray-500 dark:text-gray-400">Configure resource monitoring and notification dispatchers</p>
      </div>

      {/* Resources to Watch Section */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Resources to Watch
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Select which Kubernetes resources should be monitored for changes
          </p>
        </div>

        {/* Search Filter */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search resources..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Resource List */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredResources.map(([resource, enabled]) => (
            <div
              key={resource}
              className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50"
            >
              <span className="text-sm font-medium capitalize">
                {resource.replace(/([A-Z])/g, ' $1').trim()}
              </span>
              <Switch
                checked={enabled}
                onCheckedChange={(checked: boolean) => handleResourceToggle(resource, checked)}
              />
            </div>
          ))}
        </div>

        {/* Custom Resources */}
        <div className="space-y-3">
          <div>
            <Label>Custom Resources</Label>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Add custom Kubernetes resources to monitor
            </p>
          </div>
          
          {/* Display existing custom resources */}
          {customResources.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {customResources.map((cr, index) => (
                <Badge
                  key={index}
                  variant="secondary"
                  className="flex items-center gap-2"
                >
                  <span className="font-mono text-xs">{cr.group}/{cr.version}/{cr.resource}</span>
                  <button
                    onClick={() => handleRemoveCustomResource(index)}
                    className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          {/* Add new custom resource */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <Input
              placeholder="Group (e.g. apps)"
              value={newCustomResource.group}
              onChange={(e) => setNewCustomResource(prev => ({ ...prev, group: e.target.value }))}
            />
            <Input
              placeholder="Version (e.g. v1)"
              value={newCustomResource.version}
              onChange={(e) => setNewCustomResource(prev => ({ ...prev, version: e.target.value }))}
            />
            <Input
              placeholder="Resource (e.g. deployments)"
              value={newCustomResource.resource}
              onChange={(e) => setNewCustomResource(prev => ({ ...prev, resource: e.target.value }))}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddCustomResource}
              disabled={!newCustomResource.group || !newCustomResource.version || !newCustomResource.resource}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add
            </Button>
          </div>
        </div>
      </div>

      {/* Dispatchers Section */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Notification Dispatchers</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Configure how notifications are sent when resources change
          </p>
        </div>

        <Accordion type="multiple" className="w-full">
          {/* Slack */}
          <AccordionItem value="slack" className="">
            <AccordionTrigger className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 ">
              <div className="flex items-center gap-2">
                <SiSlack className="w-4 h-4" />
                <span>Slack</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="slack-token">Bot Token</Label>
                  <Input
                    id="slack-token"
                    placeholder=""
                    value={dispatchers.slack.token}
                    onChange={(e) => handleDispatcherUpdate('slack', 'token', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="slack-channel">Channel</Label>
                  <Input
                    id="slack-channel"
                    placeholder="agentkube"
                    value={dispatchers.slack.channel}
                    onChange={(e) => handleDispatcherUpdate('slack', 'channel', e.target.value)}
                  />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Slack Webhook */}
          <AccordionItem value="slack-webhook" className="">
            <AccordionTrigger className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100">
              <div className="flex items-center gap-2">
                <Webhook className="w-4 h-4" />
                <span>Slack Webhook</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div>
                <Label htmlFor="slack-webhook-url">Webhook URL</Label>
                <Input
                  id="slack-webhook-url"
                  placeholder="https://hooks.slack.com/services/..."
                  value={dispatchers.slackwebhook.url}
                  onChange={(e) => handleDispatcherUpdate('slackwebhook', 'url', e.target.value)}
                />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Webhook */}
          <AccordionItem value="webhook" className="">
            <AccordionTrigger className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4" />
                <span>Generic Webhook</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div>
                <Label htmlFor="webhook-url">Webhook URL</Label>
                <Input
                  id="webhook-url"
                  placeholder="https://your-webhook-endpoint.com"
                  value={dispatchers.webhook.url}
                  onChange={(e) => handleDispatcherUpdate('webhook', 'url', e.target.value)}
                />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* SMTP */}
          <AccordionItem value="smtp" className="">
            <AccordionTrigger className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                <span>SMTP Email</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="smtp-server">SMTP Server</Label>
                  <Input
                    id="smtp-server"
                    placeholder="smtp.gmail.com"
                    value={dispatchers.smtp.server}
                    onChange={(e) => handleDispatcherUpdate('smtp', 'server', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="smtp-port">Port</Label>
                  <Input
                    id="smtp-port"
                    type="number"
                    placeholder="587"
                    value={dispatchers.smtp.port}
                    onChange={(e) => handleDispatcherUpdate('smtp', 'port', parseInt(e.target.value) || 587)}
                  />
                </div>
                <div>
                  <Label htmlFor="smtp-username">Username</Label>
                  <Input
                    id="smtp-username"
                    placeholder="your-email@example.com"
                    value={dispatchers.smtp.username}
                    onChange={(e) => handleDispatcherUpdate('smtp', 'username', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="smtp-password">Password</Label>
                  <Input
                    id="smtp-password"
                    type="password"
                    placeholder="Your password"
                    value={dispatchers.smtp.password}
                    onChange={(e) => handleDispatcherUpdate('smtp', 'password', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="smtp-from">From Address</Label>
                  <Input
                    id="smtp-from"
                    placeholder="notifications@example.com"
                    value={dispatchers.smtp.from}
                    onChange={(e) => handleDispatcherUpdate('smtp', 'from', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="smtp-to">To Address</Label>
                  <Input
                    id="smtp-to"
                    placeholder="admin@example.com"
                    value={dispatchers.smtp.to}
                    onChange={(e) => handleDispatcherUpdate('smtp', 'to', e.target.value)}
                  />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Microsoft Teams */}
          <AccordionItem value="msteam" className="">
            <AccordionTrigger className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                <span>Microsoft Teams</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div>
                <Label htmlFor="msteam-webhook">Teams Webhook URL</Label>
                <Input
                  id="msteam-webhook"
                  placeholder="https://outlook.office.com/webhook/..."
                  value={dispatchers.msteam.webhook}
                  onChange={(e) => handleDispatcherUpdate('msteam', 'webhook', e.target.value)}
                />
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          className="flex items-center gap-2"
          onClick={handleSaveSettings}
          disabled={isSaving}
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save size={16} />
          )}
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
};

export default Watcher;