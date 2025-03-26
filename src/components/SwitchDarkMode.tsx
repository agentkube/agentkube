import React, { useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from "next-themes";

function SwitchDarkMode() {
  const [isDark, setDark] = useState(true);
  const { setTheme, theme } = useTheme()

  const darkModeHandler = () => {
    setDark(!isDark);
    // document.body.classList.toggle('dark');
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <button 
      onClick={darkModeHandler}
      className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
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