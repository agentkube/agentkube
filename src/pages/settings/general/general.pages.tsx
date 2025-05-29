import React, { useState, useEffect } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getSettings, patchConfig } from '@/api/settings';
import { useToast } from '@/hooks/use-toast';
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { usePostHog } from '@/contexts/useAnalytics'; 
import { useCluster } from '@/contexts/clusterContext';

const GeneralSettings: React.FC = () => {
  const { toast } = useToast();
  const { analyticsEnabled, setAnalyticsEnabled } = usePostHog();
  const { fullWidth, setFullWidth } = useCluster();
  
  // State for settings
  const [language, setLanguage] = useState<string | undefined>(undefined);
  const [defaultLocation, setDefaultLocation] = useState<string | undefined>(undefined);
  const [kubectlPath, setKubectlPath] = useState<string | undefined>(undefined);
  const [autoUpdate, setAutoUpdate] = useState<boolean | undefined>(undefined);
  const [usageAnalytics, setUsageAnalytics] = useState<boolean | undefined>(undefined);
  const [startOnLogin, setStartOnLogin] = useState<boolean | undefined>(undefined);
  const [excludeNamespaces, setExcludeNamespaces] = useState<string[] | undefined>(undefined);

  // Loading and saving states
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch settings on component mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setIsLoading(true);
        const settings = await getSettings();

        // Set state with fetched settings using nullish coalescing
        setLanguage(settings.general?.language ?? 'en');
        setAutoUpdate(settings.general?.autoUpdate);
        setKubectlPath(settings.general?.kubectlPath ?? '');
        
        // Set usageAnalytics and sync with PostHog
        const analyticsValue = settings.general?.usageAnalytics;
        setUsageAnalytics(analyticsValue);
        
        // Sync PostHog state with settings - only if we have a defined value
        if (analyticsValue !== undefined) {
          setAnalyticsEnabled(analyticsValue);
        }
        
        // Check actual autostart status from Tauri
        const autoStartEnabled = await isEnabled();
        setStartOnLogin(autoStartEnabled);
        
        setExcludeNamespaces(settings.general?.excludeNamespaces ?? []);

        // Default location is stored in agentkubeconfig.path
        setDefaultLocation(settings.agentkubeconfig?.path ?? '');
      } catch (error) {
        console.error('Failed to load settings:', error);
        toast({
          title: "Error loading settings",
          description: "Could not load application settings. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, [toast, setAnalyticsEnabled]);

  // Sync state when PostHog analyticsEnabled changes externally
  useEffect(() => {
    // Only update if we've already loaded initial settings
    if (!isLoading && usageAnalytics !== analyticsEnabled) {
      setUsageAnalytics(analyticsEnabled);
    }
  }, [analyticsEnabled, isLoading, usageAnalytics]);

  // Handle language change
  const handleLanguageChange = (lang: string) => {
    setLanguage(lang);
    // Note: i18n handling is removed until proper i18n setup is done
  };

  // Handle autostart toggle
  const handleAutoStartChange = async (checked: boolean) => {
    try {
      if (checked) {
        await enable();
      } else {
        await disable();
      }
      setStartOnLogin(checked);
    } catch (error) {
      console.error('Failed to update autostart setting:', error);
      toast({
        title: "Error updating autostart",
        description: "Could not update the autostart setting. Please try again.",
        variant: "destructive",
      });
      // Revert the UI state back to actual state
      const autoStartEnabled = await isEnabled();
      setStartOnLogin(autoStartEnabled);
    }
  };

  // Handle analytics toggle with PostHog sync
  const handleAnalyticsChange = (checked: boolean) => {
    setUsageAnalytics(checked);
    // Also update PostHog context
    setAnalyticsEnabled(checked);
  };

  // Handle settings save
  const handleSaveSettings = async () => {
    try {
      setIsSaving(true);

      // Create a config patch object with only defined values
      const configPatch: Record<string, any> = {};
      
      // Only add general section if there are changes
      const generalChanges: Record<string, any> = {};
      if (language !== undefined) generalChanges.language = language;
      if (autoUpdate !== undefined) generalChanges.autoUpdate = autoUpdate;
      if (usageAnalytics !== undefined) generalChanges.usageAnalytics = usageAnalytics;
      if (startOnLogin !== undefined) generalChanges.startOnLogin = startOnLogin;
      if (excludeNamespaces !== undefined) generalChanges.excludeNamespaces = excludeNamespaces;
      if (kubectlPath !== undefined) generalChanges.kubectlPath = kubectlPath;
      
      if (Object.keys(generalChanges).length > 0) {
        configPatch.general = generalChanges;
      }
      
      // Only add agentkubeconfig section if there are changes
      if (defaultLocation !== undefined) {
        configPatch.agentkubeconfig = {
          path: defaultLocation
        };
      }

      // Only send patch request if there are any changes
      if (Object.keys(configPatch).length > 0) {
        await patchConfig(configPatch);
      }

      toast({
        title: "Settings saved",
        description: "Your settings have been updated successfully.",
      });
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast({
        title: "Error saving settings",
        description: "Could not save your settings. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const languages = [
    {
      value: 'en',
      label: 'English'
    },
    // Uncomment when Spanish translation is ready
    // {
    //   value: 'es',
    //   label: 'Español'
    // },
  ];

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
        <span className="ml-2 text-gray-500">Loading settings...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-[Anton] uppercase text-gray-700/20 dark:text-gray-200/20 font-medium">General Settings</h1>
        <p className="text-gray-500 dark:text-gray-400">Manage your application preferences</p>
      </div>

      <div className="space-y-6">

        <div className="grid gap-2">
          <Label htmlFor="default-location">Default Config Location</Label>
          <Input
            id="default-location"
            value={defaultLocation || ''}
            onChange={(e) => setDefaultLocation(e.target.value)}
            placeholder="Enter default config location"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="kubectl-path">Kubectl Path</Label>
          <Input
            id="kubectl-path"
            value={kubectlPath || ''}
            onChange={(e) => setKubectlPath(e.target.value)}
            placeholder="Enter kubectl executable path"
          />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Path to the kubectl executable (e.g., /usr/local/bin/kubectl or C:\Program Files\Docker\Docker\resources\bin\kubectl)
          </p>
        </div>

        <div className="grid gap-2">
          <Label>Language</Label>
          <Select
            value={language || 'en'}
            onValueChange={handleLanguageChange}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select language" />
            </SelectTrigger>
            <SelectContent>
              {languages.map(({ value, label }) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex items-center justify-between">
  <div className="space-y-0.5">
    <Label htmlFor="full-width">Full Width</Label>
    <div className="text-sm text-muted-foreground">
      Use full width for resource views
    </div>
  </div>
  <Switch
    id="full-width"
    checked={fullWidth}
    onCheckedChange={setFullWidth}
  />
</div>
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="auto-update" className="block">Automatic Updates</Label>
            <p className="text-sm text-gray-500 dark:text-gray-400">Keep the application up to date automatically</p>
          </div>
          <Switch
            id="auto-update"
            checked={!!autoUpdate}
            onCheckedChange={setAutoUpdate}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="send-analytics" className="block">Usage Analytics</Label>
            <p className="text-sm text-gray-500 dark:text-gray-400">Help improve the app by sending anonymous usage data</p>
          </div>
          <Switch
            id="send-analytics"
            checked={!!usageAnalytics}
            onCheckedChange={handleAnalyticsChange}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="start-on-login" className="block">Start on Login</Label>
            <p className="text-sm text-gray-500 dark:text-gray-400">Launch the application when you log in</p>
          </div>
          <Switch
            id="start-on-login"
            checked={!!startOnLogin}
            onCheckedChange={handleAutoStartChange}
          />
        </div>
      </div>

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

export default GeneralSettings;