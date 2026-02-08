import React, { useEffect, useState } from 'react';
import { useTheme } from "next-themes";
import { Blur } from '@/assets/icons';
import { useCustomTheme } from './theme-provider';
import type { ThemeMode } from '@/types/theme';

function SwitchDarkMode() {
  const [mounted, setMounted] = useState(false);
  const { setTheme, theme } = useTheme();
  const { themeMode, setThemeMode } = useCustomTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  const darkModeHandler = () => {
    // Simple toggle between light and dark (like themer POC)
    const newMode: ThemeMode = themeMode === 'dark' ? 'light' : 'dark';
    setThemeMode(newMode);
    setTheme(newMode);
  };

  if (!mounted) return null;

  const isDark = themeMode === 'dark' || theme === 'dark';

  return (
    <button
      onClick={darkModeHandler}
      className="p-1 rounded-md hover:bg-accent transition-colors"
      title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
    >
      <Blur size={16} className="text-foreground" />
    </button>
  );
}

export default SwitchDarkMode;