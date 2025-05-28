import React, { useState, useEffect } from 'react';
import { Check, Moon, Sun, Monitor, Loader2 } from 'lucide-react';
import DARKMODE from '@/assets/mode-dark.png';
import LIGHTMODE from '@/assets/mode-light.png';
import SYSTEMMODE from '@/assets/mode-system.png';
import { getSettings, updateSettingsSection } from '@/api/settings';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTheme } from 'next-themes';

const Appearance = () => {
  // State for appearance settings
  const [fontFamily, setFontFamily] = useState('DM Sans');
  const [fontSize, setFontSize] = useState(14);
  const [colorMode, setColorMode] = useState('dark');
  const [themeOptions, setThemeOptions] = useState<string[]>(['light', 'dark']);

  // UI state
  const [selectedTheme, setSelectedTheme] = useState('aubergine');
  const [isDark, setIsDark] = useState(true);
  const { setTheme, theme } = useTheme()
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const { toast } = useToast();

  // Fetch settings on component mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setIsLoading(true);
        const settings = await getSettings();

        // Set state with appearance settings
        setFontFamily(settings.appearance.fontFamily || 'DM Sans');
        setFontSize(settings.appearance.fontSize || 14);
        setColorMode(settings.appearance.colorMode || 'dark');
        setThemeOptions(settings.appearance.themeOptions || ['light', 'dark']);

        // Apply the color mode
        applyColorMode(settings.appearance.colorMode);
      } catch (error) {
        console.error('Failed to load appearance settings:', error);
        toast({
          title: "Error loading settings",
          description: "Could not load appearance settings. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, [toast]);

  // Apply color mode to document
  const applyColorMode = (mode: string) => {
    if (mode === 'dark') {
      setTheme('dark');
      setIsDark(true);
      document.body.classList.add('dark');
      document.body.classList.remove('light');
    } else if (mode === 'light') {
      setTheme('light');
      setIsDark(false);
      document.body.classList.add('light');
      document.body.classList.remove('dark');
    } else if (mode === 'system') {
      setTheme('system');
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setIsDark(prefersDark);
      if (prefersDark) {
        document.body.classList.add('dark');
        document.body.classList.remove('light');
      } else {
        document.body.classList.add('light');
        document.body.classList.remove('dark');
      }
    }
  };

  // Listen for system preference changes if in system mode
  useEffect(() => {
    if (colorMode === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

      const handleChange = (e: MediaQueryListEvent) => {
        setIsDark(e.matches);
        if (e.matches) {
          document.body.classList.add('dark');
          document.body.classList.remove('light');
        } else {
          document.body.classList.add('light');
          document.body.classList.remove('dark');
        }
      };

      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [colorMode]);

  // Save settings when color mode changes
  const handleColorModeChange = async (mode: string) => {
    try {
      setIsSaving(true);
      setColorMode(mode);
      applyColorMode(mode);

      const currentSettings = await getSettings();

      await updateSettingsSection('appearance', {
        ...currentSettings.appearance,
        colorMode: mode
      });

      toast({
        title: "Color mode updated",
        description: `Theme has been updated to ${mode} mode.`,
      });
    } catch (error) {
      console.error('Failed to save color mode:', error);
      toast({
        title: "Error saving settings",
        description: "Could not save color mode settings. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle font change
  const handleFontChange = async (font: string) => {
    try {
      setIsSaving(true);
      setFontFamily(font);

      const currentSettings = await getSettings();

      await updateSettingsSection('appearance', {
        ...currentSettings.appearance,
        fontFamily: font
      });

      // Apply font
      document.documentElement.style.setProperty('--font-family', font);

      toast({
        title: "Font updated",
        description: `Font has been updated to ${font}.`,
      });
    } catch (error) {
      console.error('Failed to save font settings:', error);
      toast({
        title: "Error saving settings",
        description: "Could not save font settings. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle font size change
  const handleFontSizeChange = async (size: number) => {
    try {
      setIsSaving(true);
      setFontSize(size);

      // Get current settings
      const currentSettings = await getSettings();

      // Save to API with all fields
      await updateSettingsSection('appearance', {
        ...currentSettings.appearance,
        fontSize: size
      });

      // Apply font size
      document.documentElement.style.setProperty('--font-size', `${size}px`);

      toast({
        title: "Font size updated",
        description: `Font size has been updated to ${size}px.`,
      });
    } catch (error) {
      console.error('Failed to save font size settings:', error);
      toast({
        title: "Error saving settings",
        description: "Could not save font size settings. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const themes = [
    { id: 'aubergine', name: 'Aubergine', color: '#5D3F6A' },
    { id: 'clementine', name: 'Clementine', color: '#D93F0B' },
    { id: 'banana', name: 'Banana', color: '#9C6A1D' },
    { id: 'jade', name: 'Jade', color: '#1A6152' },
    { id: 'lagoon', name: 'Lagoon', color: '#1D5C8D' },
    { id: 'barbra', name: 'Barbra', color: '#BE1934' },
    { id: 'gray', name: 'Gray', color: '#242424' },
    { id: 'mood-indigo', name: 'Mood Indigo', color: '#162854' },
  ];

  const fontOptions = [
    { value: 'DM Sans', label: 'DM Sans (Default)' },
    { value: 'Roboto', label: 'Roboto' },
    { value: 'Inter', label: 'Inter' },
    { value: 'Helvetica Neue', label: 'Helvetica Neue' },
  ];

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full p-8">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
        <span className="ml-2 text-gray-500">Loading appearance settings...</span>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-8">
      <div>
        <h1 className="text-4xl font-[Anton] uppercase text-gray-700/20 dark:text-gray-200/20 font-medium">Appearance</h1>
        <p className="text-gray-500 dark:text-gray-400">Customize how Agentkube looks and feels</p>
      </div>

      {/* Font Selection */}
      <div className="mb-8">
        <h2 className="text-lg font-medium mb-2">Font</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm mb-1 text-gray-700 dark:text-gray-300">Font Family</label>
            <Select
              value={fontFamily}
              onValueChange={handleFontChange}
              disabled={isSaving}

            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select font family" />
              </SelectTrigger>
              <SelectContent className='dark:bg-gray-900/90 backdrop-blur-md'>
                {fontOptions.map((font) => (
                  <SelectItem key={font.value} value={font.value}>
                    {font.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Uncomment if you want to include font size selector */}
          {/* <div>
            <label className="block text-sm mb-1 text-gray-700 dark:text-gray-300">Font Size</label>
            <div className="flex items-center space-x-2">
              <input 
                type="range" 
                min="12" 
                max="20" 
                value={fontSize} 
                onChange={(e) => setFontSize(parseInt(e.target.value))}
                onMouseUp={() => handleFontSizeChange(fontSize)}
                className="flex-grow"
              />
              <span className="text-sm">{fontSize}px</span>
            </div>
          </div> */}
        </div>
      </div>

      {/* Color Mode */}
      <div className="mb-8">
        <h2 className="text-lg font-medium mb-2">Color Mode</h2>
        <p className="text-gray-700 dark:text-gray-400 text-sm mb-4">
          Choose if the appearance should be light or dark, or follow your computer's settings.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            disabled={isSaving}
            className={`flex flex-col items-center justify-center p-4 rounded border ${colorMode === 'light'
                ? 'border-blue-500 bg-gray-100 dark:bg-gray-800'
                : 'border-gray-300 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            onClick={() => handleColorModeChange('light')}
          >
            <div className="relative mb-2">
              <img src={LIGHTMODE} alt="Light Mode" className="w-full h-auto rounded-md" />
              {colorMode === 'light' && (
                <div className="absolute top-2 right-2 bg-blue-500 rounded-full p-1">
                  <Check size={14} className="text-white" />
                </div>
              )}
            </div>
            <Sun size={20} className="mb-2" />
            <span className="text-sm">Light</span>
          </button>

          <button
            disabled={isSaving}
            className={`flex flex-col items-center justify-center p-4 rounded border ${colorMode === 'dark'
                ? 'border-blue-500 bg-gray-100 dark:bg-gray-800'
                : 'border-gray-300 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            onClick={() => handleColorModeChange('dark')}
          >
            <div className="relative mb-2">
              <img src={DARKMODE} alt="Dark Mode" className="w-full h-auto rounded-md" />
              {colorMode === 'dark' && (
                <div className="absolute top-2 right-2 bg-blue-500 rounded-full p-1">
                  <Check size={14} className="text-white" />
                </div>
              )}
            </div>
            <Moon size={20} className="mb-2" />
            <span className="text-sm">Dark</span>
          </button>

          <button
            disabled={isSaving}
            className={`flex flex-col items-center justify-center p-4 rounded border ${colorMode === 'system'
                ? 'border-blue-500 bg-gray-100 dark:bg-gray-800'
                : 'border-gray-300 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            onClick={() => handleColorModeChange('system')}
          >
            <div className="relative mb-2">
              <img src={SYSTEMMODE} alt="System Mode" className="w-full h-auto rounded-md" />
              {colorMode === 'system' && (
                <div className="absolute top-2 right-2 bg-blue-500 rounded-full p-1">
                  <Check size={14} className="text-white" />
                </div>
              )}
            </div>
            <Monitor size={20} className="mb-2" />
            <span className="text-sm">System</span>
          </button>
        </div>
      </div>

      {/* Theme variants - will be enabled in a future version */}
      <div className="mb-8 opacity-50 pointer-events-none">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-medium">Theme Variants</h2>
          <span className="text-xs bg-gray-200 dark:bg-gray-800 px-2 py-1 rounded">Coming Soon</span>
        </div>
        <p className="text-gray-700 dark:text-gray-400 text-sm mb-4">
          Choose a color variation for your selected mode.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {themes.map((theme) => (
            <button
              key={theme.id}
              disabled
              className={`flex items-center p-3 rounded border ${selectedTheme === theme.id
                  ? 'border-blue-500 bg-gray-100 dark:bg-gray-800'
                  : 'border-gray-300 dark:border-gray-700'
                }`}
            >
              <div
                className="w-6 h-6 rounded-full mr-2"
                style={{ backgroundColor: theme.color }}
              ></div>
              <span className="text-sm">{theme.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Save button for all settings */}
      <div className="flex justify-end">
        <Button
          className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white"
          disabled={isSaving}
          onClick={async () => {
            try {
              setIsSaving(true);
              await updateSettingsSection('appearance', {
                fontFamily,
                fontSize,
                colorMode,
                themeOptions
              });

              toast({
                title: "Settings saved",
                description: "Your appearance settings have been saved successfully.",
              });
            } catch (error) {
              console.error('Failed to save all settings:', error);
              toast({
                title: "Error saving settings",
                description: "Could not save all settings. Please try again.",
                variant: "destructive",
              });
            } finally {
              setIsSaving(false);
            }
          }}
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>Save Settings</>
          )}
        </Button>
      </div>
    </div>
  );
};

export default Appearance;