// Simplified Theme System - Following Themer Approach
// Colors are ONLY defined in globals.css, not here!

import wallLight from '@/assets/background/sky.jpg';
import wall from '@/assets/background/wall.jpg';
import wall3 from '@/assets/background/wall3.jpg';
import wall4 from '@/assets/background/wall4.jpg';
import wallpaper from '@/assets/background/wallpaper.avif';

// ============================================
// THEME TYPES (Simplified)
// ============================================

export type ThemeMode = 'light' | 'dark' | 'system'
export type ThemePattern =
  | 'default'
  | 'warm'
  | 'brutalist'
  | 'modern-purple'
  | 'vercel'
  | 'perpetuity'
  | 'tangerine'
  | 'supabase'
  | 'bubblegum'
  | 'caffiene'
  | 'doom64'
  | 'mono'
  | 'sage-garden'
  | 'claude'
  | 'darkmatter'
  | 'notebook'

// Just metadata for the UI - no color definitions
export interface ThemeInfo {
  id: ThemePattern
  name: string
  description: string
  previewColor: string // Just for UI preview, not actual theme colors
}

export const AVAILABLE_THEMES: ThemeInfo[] = [
  {
    id: 'default',
    name: 'Default',
    description: 'Clean and contemporary',
    previewColor: '#232531'
  },
  {
    id: 'modern-purple',
    name: 'Modern Purple',
    description: 'Vibrant purple accents',
    previewColor: '#7033ff'
  },
  {
    id: 'warm',
    name: 'Warm Earth',
    description: 'Cozy earth tones',
    previewColor: '#644a40'
  },
  {
    id: 'brutalist',
    name: 'Neo Brutalism',
    description: 'Bold and sharp',
    previewColor: '#ff3333'
  },
  {
    id: 'vercel',
    name: 'Vercel',
    description: 'Minimalist black & white',
    previewColor: '#000000'
  },
  {
    id: 'perpetuity',
    name: 'Perpetuity',
    description: 'Teal monospace retro',
    previewColor: '#06858e'
  },
  {
    id: 'tangerine',
    name: 'Tangerine',
    description: 'Warm orange and blue',
    previewColor: '#e05d38'
  },
  {
    id: 'supabase',
    name: 'Supabase',
    description: 'Fresh green aesthetic',
    previewColor: '#72e3ad'
  },
  {
    id: 'bubblegum',
    name: 'Bubblegum',
    description: 'Playful pink and cyan',
    previewColor: '#d04f99'
  },
  {
    id: 'caffiene',
    name: 'Caffiene',
    description: 'Coffee-inspired browns',
    previewColor: '#644a40'
  },
  {
    id: 'doom64',
    name: 'Doom 64',
    description: 'Retro game aesthetic',
    previewColor: '#b71c1c'
  },
  {
    id: 'mono',
    name: 'Mono',
    description: 'Minimalist grayscale',
    previewColor: '#737373'
  },
  {
    id: 'sage-garden',
    name: 'Sage Garden',
    description: 'Natural green tones',
    previewColor: '#7c9082'
  },
  {
    id: 'claude',
    name: 'Claude',
    description: 'Warm earthy aesthetic',
    previewColor: '#d66a3c'
  },
  {
    id: 'darkmatter',
    name: 'Dark Matter',
    description: 'Deep space theme',
    previewColor: '#d66a40'
  },
  {
    id: 'notebook',
    name: 'Notebook',
    description: 'Paper-like aesthetic',
    previewColor: '#8a7968'
  },
]

// ============================================
// WALLPAPER TYPES (Separate from theme)
// ============================================

export interface ThemeBackground {
  type: 'color' | 'gradient' | 'image' | 'none';
  value: string;
  name: string;
}

export const DEFAULT_WALLPAPERS: ThemeBackground[] = [
  { type: 'none', value: 'none', name: 'None' },
  { type: 'image', value: wallLight, name: 'Sky' },
  { type: 'image', value: wall, name: 'Wall' },
  { type: 'image', value: wall3, name: 'Alphs' },
  { type: 'image', value: wall4, name: 'Mountain' },
  { type: 'image', value: wallpaper, name: 'Wallpaper' },
];

// ============================================
// HELPER FUNCTIONS
// ============================================

// Get theme class name for a pattern
export function getThemeClassName(pattern: ThemePattern): string {
  if (pattern === 'default') return ''
  return `theme-${pattern}`
}

// Get all theme class names for removal
export function getAllThemeClassNames(): string[] {
  return [
    'theme-warm',
    'theme-brutalist',
    'theme-modern-purple',
    'theme-vercel',
    'theme-perpetuity',
    'theme-tangerine',
    'theme-supabase',
    'theme-bubblegum',
    'theme-caffiene',
    'theme-doom64',
    'theme-mono',
    'theme-sage-garden',
    'theme-claude',
    'theme-darkmatter',
    'theme-notebook',
  ]
}

// Apply theme to document
export function applyThemeToDocument(pattern: ThemePattern, mode: ThemeMode) {
  const root = document.documentElement

  // Remove all theme-related classes
  root.classList.remove('light', 'dark', ...getAllThemeClassNames())

  // Apply mode (light/dark/system)
  if (mode === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.add(prefersDark ? 'dark' : 'light')
  } else {
    root.classList.add(mode)
  }

  // Apply theme pattern if not default
  const patternClass = getThemeClassName(pattern)
  if (patternClass) {
    root.classList.add(patternClass)
  }
}

// ============================================
// APPEARANCE SETTINGS (For API compatibility)
// ============================================

export interface AppearanceSettings {
  fontFamily: string;
  fontSize: number;
  colorMode: string; // Can be: 'light', 'dark', 'system', or a ThemePattern
  themePattern?: ThemePattern;
  wallpaper?: ThemeBackground;
}
