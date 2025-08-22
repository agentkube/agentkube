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
import { EditorTheme, Wallpaper, WallpaperSelector } from '@/components/custom';
import { useCustomTheme } from '@/components/theme-provider';
import { DEFAULT_THEMES, CustomTheme } from '@/types/theme';

const Appearance = () => {
  // State for appearance settings
  const [fontFamily, setFontFamily] = useState('DM Sans');
  const [fontSize, setFontSize] = useState(14);
  const [colorMode, setColorMode] = useState('dark');

  // UI state
  const { setTheme, theme } = useTheme();
  const { currentTheme, applyTheme } = useCustomTheme();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const { toast } = useToast();

  const fontOptions = [
    { value: 'DM Sans', label: 'DM Sans (Default)', type: 'custom' },
    { value: 'Inter', label: 'Inter', type: 'google' },
    { value: 'Roboto', label: 'Roboto', type: 'google' },
    { value: 'Poppins', label: 'Poppins', type: 'google' },
    { value: 'Open Sans', label: 'Open Sans', type: 'google' },
    { value: 'Lato', label: 'Lato', type: 'google' },
    { value: 'Montserrat', label: 'Montserrat', type: 'google' },
    { value: 'Source Sans Pro', label: 'Source Sans Pro', type: 'google' },
    { value: 'system-ui', label: 'System UI', type: 'system' },
    { value: '-apple-system', label: 'Apple System', type: 'system' },
    { value: 'Segoe UI', label: 'Segoe UI', type: 'system' },
    { value: 'Arial', label: 'Arial', type: 'system' },
    { value: 'Helvetica', label: 'Helvetica', type: 'system' },
    { value: 'Times New Roman', label: 'Times New Roman', type: 'system' },
    { value: 'Georgia', label: 'Georgia', type: 'system' },
    { value: 'Courier New', label: 'Courier New (Monospace)', type: 'system' }
  ];

  // Fetch settings on component mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setIsLoading(true);
        const settings = await getSettings();

        // Set state with appearance settings
        const fontFamily = settings.appearance?.fontFamily || 'DM Sans';
        setFontFamily(fontFamily);
        setFontSize(settings.appearance?.fontSize || 14);
        setColorMode(settings.appearance?.colorMode || 'dark');

        // Load Google Font if the current font is a Google Font
        const fontOption = fontOptions.find(f => f.value === fontFamily);
        if (fontOption?.type === 'google') {
          loadGoogleFont(fontFamily);
        }

        // Apply the current font
        let appliedFontFamily = fontFamily;
        if (fontOption?.type === 'system') {
          if (fontFamily === 'system-ui') {
            appliedFontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          } else if (fontFamily === '-apple-system') {
            appliedFontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          } else if (fontFamily === 'Courier New') {
            appliedFontFamily = '"Courier New", Courier, monospace';
          } else if (fontFamily === 'Times New Roman') {
            appliedFontFamily = '"Times New Roman", Times, serif';
          } else {
            appliedFontFamily = `"${fontFamily}", sans-serif`;
          }
        } else {
          appliedFontFamily = `"${fontFamily}", sans-serif`;
        }
        
        document.documentElement.style.setProperty('--font-family', appliedFontFamily);
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

  // Handle theme changes using our custom theme system
  const handleThemeChange = async (themeId: string) => {
    try {
      setIsSaving(true);
      setColorMode(themeId);

      // Find the theme to apply
      let themeToApply: CustomTheme | undefined;
      
      if (themeId === 'light') {
        themeToApply = DEFAULT_THEMES.find(t => t.id === 'default-light');
        setTheme('light');
      } else if (themeId === 'dark') {
        themeToApply = DEFAULT_THEMES.find(t => t.id === 'default-dark');
        setTheme('dark');
      } else if (themeId === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        themeToApply = DEFAULT_THEMES.find(t => t.id === (prefersDark ? 'default-dark' : 'default-light'));
        setTheme('system');
      } else {
        // Find custom theme
        themeToApply = DEFAULT_THEMES.find(t => t.id === themeId);
        if (themeToApply) {
          setTheme(themeToApply.baseMode);
        }
      }

      if (themeToApply) {
        applyTheme(themeToApply);
      }

      // Save to settings
      const currentSettings = await getSettings();
      await updateSettingsSection('appearance', {
        ...currentSettings.appearance,
        colorMode: themeId
      });

      toast({
        title: "Theme updated",
        description: `Theme has been updated to ${themeId}.`,
      });
    } catch (error) {
      console.error('Failed to save theme:', error);
      toast({
        title: "Error saving theme",
        description: "Could not save theme settings. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Listen for system preference changes if in system mode
  useEffect(() => {
    if (colorMode === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

      const handleChange = (e: MediaQueryListEvent) => {
        const themeToApply = DEFAULT_THEMES.find(t => t.id === (e.matches ? 'default-dark' : 'default-light'));
        if (themeToApply) {
          applyTheme(themeToApply);
        }
      };

      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [colorMode, applyTheme]);


  // Load Google Font dynamically
  const loadGoogleFont = (fontName: string) => {
    const fontId = `google-font-${fontName.replace(/\s+/g, '-').toLowerCase()}`;
    
    // Check if font is already loaded
    if (document.getElementById(fontId)) {
      return;
    }

    // Create link element for Google Font
    const link = document.createElement('link');
    link.id = fontId;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${fontName.replace(/\s+/g, '+')}:wght@300;400;500;600;700&display=swap`;
    document.head.appendChild(link);
  };

  // Handle font change
  const handleFontChange = async (font: string) => {
    try {
      setIsSaving(true);
      setFontFamily(font);

      // Find font option to check its type
      const fontOption = fontOptions.find(f => f.value === font);
      
      // Load Google Font if needed
      if (fontOption?.type === 'google') {
        loadGoogleFont(font);
      }

      const currentSettings = await getSettings();

      await updateSettingsSection('appearance', {
        ...currentSettings.appearance,
        fontFamily: font
      });

      // Apply font with fallbacks
      let fontFamily = font;
      if (fontOption?.type === 'system') {
        // Add appropriate fallbacks for system fonts
        if (font === 'system-ui') {
          fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        } else if (font === '-apple-system') {
          fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        } else if (font === 'Courier New') {
          fontFamily = '"Courier New", Courier, monospace';
        } else if (font === 'Times New Roman') {
          fontFamily = '"Times New Roman", Times, serif';
        } else {
          fontFamily = `"${font}", sans-serif`;
        }
      } else if (fontOption?.type === 'google') {
        fontFamily = `"${font}", sans-serif`;
      } else {
        // Custom fonts (like DM Sans)
        fontFamily = `"${font}", sans-serif`;
      }
      
      document.documentElement.style.setProperty('--font-family', fontFamily);

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
        <div className='flex items-start gap-1'>
          <h1 className="text-4xl font-[Anton] uppercase text-gray-700/20 dark:text-gray-200/20 font-medium">Appearance</h1>
          <div className='bg-gray-200 dark:bg-gray-500/40 text-gray-800 dark:text-gray-400 px-0.5 text-xs uppercase'>
            <span>Beta</span>
          </div>
        </div>
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
              <SelectContent className='dark:bg-[#0B0D13]/40 backdrop-blur-md'>
                {/* Custom Fonts */}
                <div className="px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Custom Fonts
                </div>
                {fontOptions.filter(f => f.type === 'custom').map((font) => (
                  <SelectItem key={font.value} value={font.value} className="font-dm-sans">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                      {font.label}
                    </span>
                  </SelectItem>
                ))}
                
                {/* Google Fonts */}
                <div className="px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mt-2">
                  Google Fonts
                </div>
                {fontOptions.filter(f => f.type === 'google').map((font) => (
                  <SelectItem key={font.value} value={font.value}>
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                      {font.label}
                    </span>
                  </SelectItem>
                ))}
                
                {/* System Fonts */}
                <div className="px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mt-2">
                  System Fonts
                </div>
                {fontOptions.filter(f => f.type === 'system').map((font) => (
                  <SelectItem key={font.value} value={font.value}>
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-gray-500 rounded-full"></span>
                      {font.label}
                    </span>
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
            onClick={() => handleThemeChange('light')}
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
            onClick={() => handleThemeChange('dark')}
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
            onClick={() => handleThemeChange('system')}
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

      {/* Theme variants */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-medium">Theme Variants</h2>
        </div>
        <p className="text-gray-700 dark:text-gray-400 text-sm mb-4">
          Choose a color variation for your selected mode.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {DEFAULT_THEMES.filter(t => t.id !== 'default-light' && t.id !== 'default-dark').map((themeVariant) => (
            <button
              key={themeVariant.id}
              disabled={isSaving}
              className={`flex items-center p-3 rounded border ${colorMode === themeVariant.id
                ? 'border-blue-500 bg-gray-100 dark:bg-gray-800'
                : 'border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              onClick={() => handleThemeChange(themeVariant.id)}
            >
              <div
                className="w-6 h-6 rounded-full mr-2"
                style={{ 
                  background: themeVariant.background.type === 'color' 
                    ? themeVariant.background.value 
                    : themeVariant.background.type === 'gradient'
                    ? themeVariant.background.value
                    : '#666666'
                }}
              ></div>
              <span className="text-sm">{themeVariant.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Custom Wallpaper Section */}
      <WallpaperSelector />

      <EditorTheme />

      {/* Save button for all settings */}
      <div className="flex justify-end">
        <Button
          className="flex items-center gap-2"
          disabled={isSaving}
          onClick={async () => {
            try {
              setIsSaving(true);
              await updateSettingsSection('appearance', {
                fontFamily,
                fontSize,
                colorMode
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