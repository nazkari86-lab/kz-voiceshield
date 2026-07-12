import type { Severity } from '@scoring'

// Shared palette so every screen reads as one system.
export const colors = {
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
