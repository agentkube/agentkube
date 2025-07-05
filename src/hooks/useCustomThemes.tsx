import { invoke } from '@tauri-apps/api/core';

export const loadCustomThemes = async () => {
  // Will read from ~/.agentkube/themes/*.yaml
  return await invoke('load_custom_themes');
};

export const applyCustomTheme = (themeName: string, colors: Record<string, string>) => {
  const root = document.documentElement;
  Object.entries(colors).forEach(([key, value]) => {
    root.style.setProperty(`--${key}`, value);
  });
  document.body.className = `${themeName}-theme`;
};