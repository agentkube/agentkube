import React, { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from "next-themes";
import { getSettings, patchConfig } from '@/api/settings';

function SwitchDarkMode() {
  const [mounted, setMounted] = useState(false);
  const { setTheme, theme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  const darkModeHandler = async () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);

    try {
      const currentSettings = await getSettings();
      await patchConfig({
        appearance: {
          ...currentSettings.appearance,
          colorMode: newTheme
        }
      });
    } catch (error) {
      console.error('Failed to save theme preference:', error);
    }
  };

  if (!mounted) return null;

  return (
    <button
      onClick={darkModeHandler}
      className="p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
      title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
    >
      {theme === 'dark' ? (
        <Sun size={15} className="text-white" />
      ) : (
        <Moon size={15} className="text-black" />
      )}
    </button>
  );
}

export default SwitchDarkMode;