"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"
import { ThemeProviderProps } from "next-themes/dist/types"
import { getSettings } from "@/api/settings"
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  const [initialTheme, setInitialTheme] = React.useState<string | undefined>(props.defaultTheme)

  React.useEffect(() => {
    const loadThemeFromSettings = async () => {
      try {
        const settings = await getSettings()
        const configTheme = settings.appearance?.colorMode
        if (configTheme) {
          setInitialTheme(configTheme)
        }
      } catch (error) {
        console.error("Failed to load theme from settings:", error)
        // Fall back to defaultTheme provided in props
      }
    }

    loadThemeFromSettings()
  }, [])

  return <NextThemesProvider {...props} defaultTheme={initialTheme}>{children}</NextThemesProvider>
}
