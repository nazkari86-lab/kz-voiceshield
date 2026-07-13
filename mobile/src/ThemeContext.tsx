import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useColorScheme } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { darkColors, lightColors, type AppColors } from './theme'

type ThemeMode = 'auto' | 'light' | 'dark'

type ThemeContextValue = {
  colors: AppColors
  mode: ThemeMode
  isDark: boolean
  setMode: (mode: ThemeMode) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  colors: lightColors,
  mode: 'auto',
  isDark: false,
  setMode: () => undefined,
})

const THEME_KEY = 'voiceshield.theme-mode.v1'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme()
  const [mode, setModeState] = useState<ThemeMode>('auto')

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then(v => {
      if (v === 'light' || v === 'dark' || v === 'auto') setModeState(v)
    }).catch(() => undefined)
  }, [])

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next)
    void AsyncStorage.setItem(THEME_KEY, next)
  }, [])

  const isDark = mode === 'dark' || (mode === 'auto' && system === 'dark')
  const themeColors = isDark ? darkColors : lightColors

  return (
    <ThemeContext.Provider value={{ colors: themeColors, mode, isDark, setMode }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
