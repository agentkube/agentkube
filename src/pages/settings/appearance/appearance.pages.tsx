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
import { AVAILABLE_THEMES, ThemeMode, ThemePattern } from '@/types/theme';

const Appearance = () => {
  // State for appearance settings
  const [fontFamily, setFontFamily] = useState('DM Sans');
  const [fontSize, setFontSize] = useState(14);
  const [colorMode, setColorMode] = useState('dark');

  // UI state
  const { setTheme, theme } = useTheme();
  const { themePattern, themeMode, setThemePattern, setThemeMode } = useCustomTheme();
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

  // Handle theme changes using simplified theme system
  const handleThemeChange = async (themeId: string) => {
    try {
      setIsSaving(true);
      setColorMode(themeId);

      // Handle mode changes (light/dark/system)
      if (themeId === 'light' || themeId === 'dark' || themeId === 'system') {
        setThemeMode(themeId as ThemeMode);
        setTheme(themeId);
      } else {
        // Handle theme pattern changes
        setThemePattern(themeId as ThemePattern);
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
        setThemeMode('system');
      };

      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [colorMode, setThemeMode]);


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
          <h1 className="text-4xl font-[Anton] uppercase text-foreground/20 font-medium">Appearance</h1>
          <div className='bg-secondary text-secondary-foreground px-0.5 text-xs uppercase'>
            <span>Beta</span>
          </div>
        </div>
        <p className="text-muted-foreground">Customize how Agentkube looks and feels</p>
      </div>



      {/* Color Mode */}
      <div className="mb-8">
        <h2 className="text-lg font-medium mb-2">Color Mode</h2>
        <p className="text-muted-foreground text-sm mb-4">
          Choose if the appearance should be light or dark, or follow your computer's settings.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            disabled={isSaving}
            className={`flex flex-col items-center justify-center p-4 rounded border ${colorMode === 'light'
              ? 'border-primary bg-accent'
              : 'border-border hover:bg-accent'
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
              ? 'border-primary bg-accent'
              : 'border-border hover:bg-accent'
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
              ? 'border-primary bg-accent'
              : 'border-border hover:bg-accent'
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
          <h2 className="text-lg font-medium">Theme Patterns</h2>
        </div>
        <p className="text-muted-foreground text-sm mb-4">
          Choose a color theme pattern.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {AVAILABLE_THEMES.map((themeVariant) => (
            <button
              key={themeVariant.id}
              disabled={isSaving}
              className={`flex items-center p-3 rounded border ${colorMode === themeVariant.id
                ? 'border-primary bg-accent'
                : 'border-border hover:bg-accent'
                }`}
              onClick={() => handleThemeChange(themeVariant.id)}
            >
              <div
                className="w-6 h-6 rounded-full mr-2"
                style={{ background: themeVariant.previewColor }}
              ></div>
              <div className="flex flex-col items-start">
                <span className="text-sm font-medium">{themeVariant.name}</span>
                <span className="text-xs text-muted-foreground">{themeVariant.description}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Custom Wallpaper Section: Keep it Commented only  */}
      {/* <WallpaperSelector /> */}

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