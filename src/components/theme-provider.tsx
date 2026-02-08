"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"
import { ThemeProviderProps } from "next-themes/dist/types"
import {
  ThemeMode,
  ThemePattern,
  applyThemeToDocument
} from "@/types/theme"

// ============================================
// SIMPLIFIED THEME CONTEXT (Like Themer POC)
// ============================================

interface CustomThemeContextType {
  themePattern: ThemePattern
  themeMode: ThemeMode
  setThemePattern: (pattern: ThemePattern) => void
  setThemeMode: (mode: ThemeMode) => void
  toggleTheme: () => void
}

const CustomThemeContext = React.createContext<CustomThemeContextType | undefined>(undefined)

export function useCustomTheme() {
  const context = React.useContext(CustomThemeContext)
  if (context === undefined) {
    throw new Error('useCustomTheme must be used within a CustomThemeProvider')
  }
  return context
}

// ============================================
// THEME PROVIDER (Simplified like Themer POC)
// ============================================

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  // Load from localStorage on mount (like themer POC)
  const [themePattern, setThemePatternState] = React.useState<ThemePattern>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('theme-pattern') as ThemePattern
      return stored || 'default'
    }
    return 'default'
  })

  const [themeMode, setThemeModeState] = React.useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('theme-mode') as ThemeMode
      return stored || 'dark'
    }
    return 'dark'
  })

  // Apply theme on mount and when it changes
  React.useEffect(() => {
    applyThemeToDocument(themePattern, themeMode)
  }, [themePattern, themeMode])

  // Listen for system theme changes if in system mode
  React.useEffect(() => {
    if (themeMode === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

      const handleChange = () => {
        applyThemeToDocument(themePattern, 'system')
      }

      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }
  }, [themeMode, themePattern])

  // Set theme pattern
  const setThemePattern = (pattern: ThemePattern) => {
    setThemePatternState(pattern)
    localStorage.setItem('theme-pattern', pattern)
    applyThemeToDocument(pattern, themeMode)
  }

  // Set theme mode
  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode)
    localStorage.setItem('theme-mode', mode)
    applyThemeToDocument(themePattern, mode)
  }

  // Toggle between light and dark (like themer POC)
  const toggleTheme = () => {
    const newMode: ThemeMode = themeMode === 'dark' ? 'light' : 'dark'
    setThemeMode(newMode)
  }

  const contextValue: CustomThemeContextType = {
    themePattern,
    themeMode,
    setThemePattern,
    setThemeMode,
    toggleTheme,
  }

  return (
    <CustomThemeContext.Provider value={contextValue}>
      <NextThemesProvider {...props} defaultTheme={themeMode}>
        {children}
      </NextThemesProvider>
    </CustomThemeContext.Provider>
  )
}
