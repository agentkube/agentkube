// pages/settings/GeneralSettings.tsx
import React, { useState, useEffect } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getSettings, updateSettingsSection } from '@/api/settings';
import { useToast } from '@/hooks/use-toast';
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";

const GeneralSettings: React.FC = () => {
  const { toast } = useToast();

  // State for settings
  const [language, setLanguage] = useState('en');
  const [defaultLocation, setDefaultLocation] = useState('');
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [usageAnalytics, setUsageAnalytics] = useState(true);
  const [startOnLogin, setStartOnLogin] = useState(false);
  const [excludeNamespaces, setExcludeNamespaces] = useState<string[]>([]);

  // Loading and saving states
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch settings on component mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setIsLoading(true);
        const settings = await getSettings();

        // Set state with fetched settings
        setLanguage(settings.general?.language || 'en');
        setAutoUpdate(settings.general?.autoUpdate || false);
        setUsageAnalytics(settings.general?.usageAnalytics || false);
        
        // Check actual autostart status from Tauri
        const autoStartEnabled = await isEnabled();
        setStartOnLogin(autoStartEnabled);
        
        setExcludeNamespaces(settings.general?.excludeNamespaces || []);

        // Default location is stored in agentkubeconfig.path
        setDefaultLocation(settings.agentkubeconfig?.path || '');
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
  }, [toast]);

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

  // Handle settings save
  const handleSaveSettings = async () => {
    try {
      setIsSaving(true);

      // Update general settings
      await updateSettingsSection('general', {
        language,
        autoUpdate,
        usageAnalytics,
        startOnLogin, // Store the current state in settings too
        excludeNamespaces
      });

      // Update agent kube config path
      await updateSettingsSection('agentkubeconfig', {
        path: defaultLocation
      });

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
        <h1 className="text-2xl font-semibold dark:text-white">General Settings</h1>
        <p className="text-gray-500 dark:text-gray-400">Manage your application preferences</p>
      </div>

      <div className="space-y-6">

        <div className="grid gap-2">
          <Label htmlFor="default-location">Default Config Location</Label>
          <Input
            id="default-location"
            value={defaultLocation}
            onChange={(e) => setDefaultLocation(e.target.value)}
          />
        </div>

        <div className="grid gap-2">
          <Label>Language</Label>
          <Select
            value={language}
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
          <div>
            <Label htmlFor="auto-update" className="block">Automatic Updates</Label>
            <p className="text-sm text-gray-500 dark:text-gray-400">Keep the application up to date automatically</p>
          </div>
          <Switch
            id="auto-update"
            checked={autoUpdate}
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
            checked={usageAnalytics}
            onCheckedChange={setUsageAnalytics}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="start-on-login" className="block">Start on Login</Label>
            <p className="text-sm text-gray-500 dark:text-gray-400">Launch the application when you log in</p>
          </div>
          <Switch
            id="start-on-login"
            checked={startOnLogin}
            onCheckedChange={handleAutoStartChange}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          className="flex items-center gap-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-900"
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
