import wallLight from '@/assets/background/sky.jpg';
import wall from '@/assets/background/wall.jpg';
import wall3 from '@/assets/background/wall3.jpg';
import wall4 from '@/assets/background/wall4.jpg';
import wallpaper from '@/assets/background/wallpaper.avif';

export interface ThemeBackground {
  type: 'color' | 'gradient' | 'image' | 'none';
  value: string;
  name: string;
}

export interface CustomTheme {
  id: string;
  name: string;
  baseMode: 'light' | 'dark';
  background: ThemeBackground;
  colors: {
    foreground: string;
    card: string;
    cardForeground: string;
    popover: string;
    popoverForeground: string;
    primary: string;
    primaryForeground: string;
    secondary: string;
    secondaryForeground: string;
    muted: string;
    mutedForeground: string;
    accent: string;
    accentForeground: string;
    destructive: string;
    destructiveForeground: string;
    border: string;
    input: string;
    ring: string;
    drawerGradient: string;
  };
  fontFamily?: string;
}

export interface ThemeConfig {
  baseMode: 'light' | 'dark' | 'system';
  customTheme?: CustomTheme;
  wallpaper?: ThemeBackground;
  allowCustomWallpaper: boolean;
}

export interface AppearanceSettings {
  fontFamily: string;
  fontSize: number;
  colorMode: string;
  themeConfig: ThemeConfig;
  customThemes: CustomTheme[];
}

export const DEFAULT_THEMES: CustomTheme[] = [
  {
    id: 'default-light',
    name: 'Default Light',
    baseMode: 'light',
    background: { type: 'color', value: '#ffffff', name: 'White' },
    colors: {
      foreground: '224 71.4% 4.1%',
      card: '0 0% 100%',
      cardForeground: '224 71.4% 4.1%',
      popover: '0 0% 100%',
      popoverForeground: '224 71.4% 4.1%',
      primary: '220.9 39.3% 11%',
      primaryForeground: '210 20% 98%',
      secondary: '220 14.3% 95.9%',
      secondaryForeground: '220.9 39.3% 11%',
      muted: '220 14.3% 95.9%',
      mutedForeground: '220 8.9% 46.1%',
      accent: '220 14.3% 95.9%',
      accentForeground: '220.9 39.3% 11%',
      destructive: '0 84.2% 60.2%',
      destructiveForeground: '210 20% 98%',
      border: '220 13% 91%',
      input: '220 13% 91%',
      ring: '224 71.4% 4.1%',
      drawerGradient: 'none',
    },
  },
  {
    id: 'default-dark',
    name: 'Default Dark',
    baseMode: 'dark',
    background: { type: 'gradient', value: 'linear-gradient(to bottom right, #232531, #000000)', name: 'Dark Gradient' },
    colors: {
      foreground: '210 20% 98%',
      card: '224 71.4% 4.1%',
      cardForeground: '210 20% 98%',
      popover: '224 71.4% 4.1%',
      popoverForeground: '210 20% 98%',
      primary: '210 20% 98%',
      primaryForeground: '220.9 39.3% 11%',
      secondary: '215 27.9% 16.9%',
      secondaryForeground: '210 20% 98%',
      muted: '215 27.9% 16.9%',
      mutedForeground: '217.9 10.6% 64.9%',
      accent: '215 27.9% 16.9%',
      accentForeground: '210 20% 98%',
      destructive: '0 62.8% 30.6%',
      destructiveForeground: '210 20% 98%',
      border: '215 27.9% 16.9%',
      input: '215 27.9% 16.9%',
      ring: '216 12.2% 83.9%',
      drawerGradient: 'linear-gradient(to bottom right, #232531, #000000)',
    },
  },
  {
    id: 'notion-light',
    name: 'Notion Light',
    baseMode: 'light',
    background: { type: 'color', value: '#ffffff', name: 'White' },
    colors: {
      foreground: '#37352f',
      card: '#ffffff',
      cardForeground: '#37352f',
      popover: '#ffffff',
      popoverForeground: '#37352f',
      primary: '#37352f',
      primaryForeground: '#ffffff',
      secondary: '#f7f6f3',
      secondaryForeground: '#37352f',
      muted: '#f7f6f3',
      mutedForeground: '#787774',
      accent: '#f1f1ef',
      accentForeground: '#37352f',
      destructive: '#eb5757',
      destructiveForeground: '#ffffff',
      border: '#e9e9e7',
      input: '#f7f6f3',
      ring: '#37352f',
      drawerGradient: '#ffffff',
    }
  },
  {
    id: 'notion-dark',
    name: 'Notion Dark',
    baseMode: 'dark',
    background: { type: 'color', value: '#191919', name: 'Dark Gray' },
    colors: {
      foreground: '210 20% 98%',
      card: '#2f3437',
      cardForeground: '#ffffff',
      popover: '#2f3437',
      popoverForeground: '#ffffff',
      primary: '#ffffff',
      primaryForeground: '#191919',
      secondary: '#373737',
      secondaryForeground: '#ffffff',
      muted: '#373737',
      mutedForeground: '#9b9a97',
      accent: '#373737',
      accentForeground: '#ffffff',
      destructive: '#eb5757',
      destructiveForeground: '#ffffff',
      border: '#373737',
      input: '#373737',
      ring: '#ffffff',
      drawerGradient: '#191919',
    },
  },
  {
    id: 'dark-emerald',
    name: 'Dark Emerald',
    baseMode: 'dark',
    background: { type: 'gradient', value: 'linear-gradient(to bottom right, #62bca630, #182525)', name: 'Emerald Gradient' },
    colors: {
      foreground: '210 20% 98%',
      card: '160 50% 15%',
      cardForeground: '210 20% 98%',
      popover: '160 50% 15%',
      popoverForeground: '210 20% 98%',
      primary: '210 20% 98%',
      primaryForeground: '160 84% 39%',
      secondary: '160 60% 20%',
      secondaryForeground: '210 20% 98%',
      muted: '160 60% 20%',
      mutedForeground: '217.9 10.6% 64.9%',
      accent: '160 60% 20%',
      accentForeground: '210 20% 98%',
      destructive: '0 62.8% 30.6%',
      destructiveForeground: '210 20% 98%',
      border: '160 60% 20%',
      input: '160 60% 20%',
      ring: '160 84% 39%',
      drawerGradient: 'linear-gradient(to bottom right, #064e3b, #042f2e)',
    },
  },
  {
    id: 'dark-violet',
    name: 'Dark Violet',
    baseMode: 'dark',
    background: { type: 'gradient', value: 'linear-gradient(to bottom right, #4b238668, #160d26)', name: 'Violet Gradient' },
    colors: {
      foreground: '210 20% 98%',
      card: '270 50% 15%',
      cardForeground: '210 20% 98%',
      popover: '270 50% 15%',
      popoverForeground: '210 20% 98%',
      primary: '210 20% 98%',
      primaryForeground: '270 84% 39%',
      secondary: '270 60% 20%',
      secondaryForeground: '210 20% 98%',
      muted: '270 60% 20%',
      mutedForeground: '217.9 10.6% 64.9%',
      accent: '270 60% 20%',
      accentForeground: '210 20% 98%',
      destructive: '0 62.8% 30.6%',
      destructiveForeground: '210 20% 98%',
      border: '270 60% 20%',
      input: '270 60% 20%',
      ring: '270 84% 39%',
      drawerGradient: 'linear-gradient(to bottom right, #4c1d95, #0a0611)',
    },
  },
];

export const DEFAULT_WALLPAPERS: ThemeBackground[] = [
  { type: 'none', value: 'none', name: 'None' },
  { type: 'image', value: wallLight, name: 'Sky' },
  { type: 'image', value: wall, name: 'Wall' },
  { type: 'image', value: wall3, name: 'Alphs' },
  { type: 'image', value: wall4, name: 'Mountain' },
  { type: 'image', value: wallpaper, name: 'Wallpaper' },
];