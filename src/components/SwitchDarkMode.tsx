import React, { useEffect, useState } from 'react';
import { useTheme } from "next-themes";
import { getSettings, updateSettingsSection } from '@/api/settings';
import { Blur } from '@/assets/icons';
import { useCustomTheme } from './theme-provider';
import { DEFAULT_THEMES } from '@/types/theme';

function SwitchDarkMode() {
  const [mounted, setMounted] = useState(false);
  const { setTheme, theme } = useTheme();
  const { currentTheme, applyTheme } = useCustomTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  const darkModeHandler = async () => {
    try {
      // Determine the new theme based on current theme
      let newThemeId: string;
      let newTheme;

      if (!currentTheme || currentTheme.baseMode === 'dark') {
        // Switch to light theme
        newTheme = DEFAULT_THEMES.find(t => t.id === 'default-light');
        newThemeId = 'light';
      } else {
        // Switch to dark theme
        newTheme = DEFAULT_THEMES.find(t => t.id === 'default-dark');
        newThemeId = 'dark';
      }

      if (newTheme) {
        // Apply the theme immediately
        applyTheme(newTheme);
        setTheme(newThemeId);

        // Save to settings
        const currentSettings = await getSettings();
        await updateSettingsSection('appearance', {
          ...currentSettings.appearance,
          colorMode: newThemeId
        });
      }
    } catch (error) {
      console.error('Failed to save theme preference:', error);
      // Fallback to next-themes only switching
      const fallbackTheme = theme === 'dark' ? 'light' : 'dark';
      setTheme(fallbackTheme);
    }
  };

  if (!mounted) return null;

  const isDark = currentTheme?.baseMode === 'dark' || theme === 'dark';

  return (
    <button
      onClick={darkModeHandler}
      className="p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
      title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
    >
      <Blur size={16} className="text-gray-700 dark:text-gray-300" />
    </button>
  );
}

export default SwitchDarkMode;