import type { Severity } from '@scoring'

// Shared palette so every screen reads as one system.
export const colors = {
  bg: '#eef4f8',
  card: '#ffffff',
  border: '#dbe4ef',
  ink: '#0f172a',
  sub: '#64748b',
  muted: '#94a3b8',
  brand: '#0ea5b7',
  chipBg: '#f1f5f9',
}

export const riskColor: Record<Severity, string> = {
  critical: '#991b1b',
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#16a34a',
}

export const riskLabel: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High risk',
  medium: 'Review',
  low: 'Low risk',
}
