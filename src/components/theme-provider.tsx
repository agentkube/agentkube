"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"
import { ThemeProviderProps } from "next-themes/dist/types"
import { getSettings } from "@/api/settings"
import { CustomTheme, ThemeConfig, DEFAULT_THEMES, ThemeBackground } from "@/types/theme"

interface CustomThemeContextType {
  currentTheme: CustomTheme | null
  customWallpaper: ThemeBackground | null
  themeConfig: ThemeConfig | null
  applyTheme: (theme: CustomTheme) => void
  applyWallpaper: (wallpaper: ThemeBackground | null) => void
  resetTheme: () => void
}

const CustomThemeContext = React.createContext<CustomThemeContextType | undefined>(undefined)

export function useCustomTheme() {
  const context = React.useContext(CustomThemeContext)
  if (context === undefined) {
    throw new Error('useCustomTheme must be used within a CustomThemeProvider')
  }
  return context
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  const [initialTheme, setInitialTheme] = React.useState<string | undefined>(props.defaultTheme)
  const [currentTheme, setCurrentTheme] = React.useState<CustomTheme | null>(null)
  const [customWallpaper, setCustomWallpaper] = React.useState<ThemeBackground | null>(null)
  const [themeConfig, setThemeConfig] = React.useState<ThemeConfig | null>(null)

  React.useEffect(() => {
    const loadThemeFromSettings = async () => {
      try {
        const settings = await getSettings()
        const colorMode = settings.appearance?.colorMode || 'dark'
        
        // Load theme config from settings
        const config = settings.appearance?.themeConfig || {
          baseMode: colorMode === 'system' ? 'system' : (colorMode.includes('light') ? 'light' : 'dark'),
          allowCustomWallpaper: true,
        }
        
        setThemeConfig(config)
        setInitialTheme(colorMode)

        // Find and apply the matching theme
        const matchingTheme = DEFAULT_THEMES.find(theme => theme.id === colorMode) || 
                             settings.appearance?.customThemes?.find((theme: CustomTheme) => theme.id === colorMode) ||
                             DEFAULT_THEMES.find(theme => theme.baseMode === config.baseMode)
        
        if (matchingTheme) {
          applyThemeToDocument(matchingTheme)
          setCurrentTheme(matchingTheme)
        }

        // Apply custom wallpaper if set
        if (config.wallpaperPath) {
          // Load wallpaper from path and apply it
          loadWallpaperFromPath(config.wallpaperPath)
        }

      } catch (error) {
        console.error("Failed to load theme from settings:", error)
        // Fall back to default theme
        const defaultTheme = DEFAULT_THEMES.find(theme => theme.id === 'default-dark')
        if (defaultTheme) {
          applyThemeToDocument(defaultTheme)
          setCurrentTheme(defaultTheme)
        }
      }
    }

    loadThemeFromSettings()
  }, [])

  const applyThemeToDocument = (theme: CustomTheme) => {
    const root = document.documentElement
    
    // Remove all existing theme classes
    document.body.classList.remove('light', 'dark', 'notion-light', 'notion-dark', 'dark-emerald', 'dark-violet')
    
    // Add the theme class
    document.body.classList.add(theme.id)
    
    // Apply CSS custom properties
    Object.entries(theme.colors).forEach(([key, value]) => {
      const cssVar = `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`
      root.style.setProperty(cssVar, typeof value === 'string' ? value : `hsl(${value})`)
    })

    // Apply background
    if (theme.background.type === 'color') {
      root.style.setProperty('--background', theme.background.value)
    } else if (theme.background.type === 'gradient') {
      root.style.setProperty('--background', theme.background.value)
    } else if (theme.background.type === 'image') {
      root.style.setProperty('--background', `url("${theme.background.value}")`)
    }

    // Apply font family if specified
    if (theme.fontFamily) {
      root.style.setProperty('--font-family', theme.fontFamily)
      document.body.style.fontFamily = theme.fontFamily
    }
  }

  const loadWallpaperFromPath = async (wallpaperPath: string) => {
    try {
      // Check if the image exists at the given path
      const img = new Image()
      img.onload = () => {
        // Create wallpaper object from path
        const wallpaper: ThemeBackground = {
          type: 'image',
          value: wallpaperPath,
          name: 'Custom Wallpaper'
        }
        applyWallpaperToDocument(wallpaper)
        setCustomWallpaper(wallpaper)
      }
      img.onerror = () => {
        console.warn(`Wallpaper not found at path: ${wallpaperPath}, falling back to default`)
        // Fallback to default theme
        const defaultTheme = DEFAULT_THEMES.find(theme => theme.id === 'default-dark')
        if (defaultTheme) {
          applyThemeToDocument(defaultTheme)
          setCurrentTheme(defaultTheme)
        }
        setCustomWallpaper(null)
      }
      img.src = wallpaperPath
    } catch (error) {
      console.error('Error loading wallpaper from path:', error)
      setCustomWallpaper(null)
    }
  }

  const applyWallpaperToDocument = (wallpaper: ThemeBackground | null) => {
    const root = document.documentElement
    
    if (!wallpaper || wallpaper.type === 'none') {
      root.style.removeProperty('--custom-wallpaper')
      document.body.style.backgroundImage = ''
    } else if (wallpaper.type === 'color') {
      root.style.setProperty('--custom-wallpaper', wallpaper.value)
      document.body.style.background = wallpaper.value
    } else if (wallpaper.type === 'gradient') {
      root.style.setProperty('--custom-wallpaper', wallpaper.value)
      document.body.style.background = wallpaper.value
    } else if (wallpaper.type === 'image') {
      root.style.setProperty('--custom-wallpaper', `url("${wallpaper.value}")`)
      document.body.style.backgroundImage = `url("${wallpaper.value}")`
      document.body.style.backgroundSize = 'cover'
      document.body.style.backgroundPosition = 'center'
      document.body.style.backgroundRepeat = 'no-repeat'
    }
  }

  const applyTheme = (theme: CustomTheme) => {
    applyThemeToDocument(theme)
    setCurrentTheme(theme)
  }

  const applyWallpaper = (wallpaper: ThemeBackground | null) => {
    applyWallpaperToDocument(wallpaper)
    setCustomWallpaper(wallpaper)
  }

  const resetTheme = () => {
    const defaultTheme = DEFAULT_THEMES.find(theme => theme.id === 'default-dark')
    if (defaultTheme) {
      applyTheme(defaultTheme)
    }
    applyWallpaper(null)
  }

  const contextValue = {
    currentTheme,
    customWallpaper,
    themeConfig,
    applyTheme,
    applyWallpaper,
    resetTheme,
  }

  return (
    <CustomThemeContext.Provider value={contextValue}>
      <NextThemesProvider {...props} defaultTheme={initialTheme}>
        {children}
      </NextThemesProvider>
    </CustomThemeContext.Provider>
  )
}
