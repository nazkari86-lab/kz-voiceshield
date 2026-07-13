import type { Severity } from '@scoring'

export type AppColors = typeof lightColors

export const lightColors = {
  bg: '#f3f7f4',
  card: '#ffffff',
  border: '#d6e2da',
  ink: '#10251d',
  sub: '#4d665b',
  muted: '#789085',
  brand: '#147a5c',
  brandDark: '#0d4d3a',
  accent: '#f06a4d',
  chipBg: '#e8f0eb',
  softBrand: '#dff1e8',
  softDanger: '#fde9e4',
}

export const darkColors: AppColors = {
  bg: '#0d1a15',
  card: '#152219',
  border: '#1e3329',
  ink: '#d6ede3',
  sub: '#8ab8a4',
  muted: '#5a8172',
  brand: '#1fa876',
  brandDark: '#29d698',
  accent: '#f47c60',
  chipBg: '#1a2e24',
  softBrand: '#1a3328',
  softDanger: '#2a1a18',
}

// Default export for backward-compatibility — overridden by ThemeContext at runtime
export const colors = lightColors

export const riskColor: Record<Severity, string> = {
  critical: '#9f2339',
  high: '#d84a43',
  medium: '#cc7a13',
  low: '#15805d',
}

export const riskLabel: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High risk',
  medium: 'Review',
  low: 'Low risk',
}
