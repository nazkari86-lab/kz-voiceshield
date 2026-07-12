import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { Severity } from '@scoring'
import { colors, riskColor, riskLabel } from '../theme'

export function Card({ children, tone }: { children: React.ReactNode; tone?: Severity }) {
  return <View style={[ui.card, tone ? { borderTopColor: riskColor[tone], borderTopWidth: 4 } : null]}>{children}</View>
}

export function RiskBadge({ risk }: { risk: Severity }) {
  return (
    <View style={[ui.badge, { backgroundColor: riskColor[risk] }]}>
      <Text style={ui.badgeText}>{riskLabel[risk]}</Text>
    </View>
  )
}

export function Chip({ label, active, tone, onPress }: { label: string; active?: boolean; tone?: string; onPress?: () => void }) {
  return (
    <Text
      onPress={onPress}
      style={[ui.chip, active && { backgroundColor: tone ?? colors.brand, borderColor: tone ?? colors.brand, color: '#fff' }]}
    >
      {label}
    </Text>
  )
}

export function Metric({ value, label }: { value: string | number; label: string }) {
  return (
    <View style={ui.metric}>
      <Text style={ui.metricValue}>{value}</Text>
      <Text style={ui.metricLabel}>{label}</Text>
    </View>
  )
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={ui.sectionTitle}>{children}</Text>
}

export function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={ui.empty}>
      <Text style={ui.emptyTitle}>{title}</Text>
      <Text style={ui.emptySub}>{subtitle}</Text>
    </View>
  )
}

// eslint-disable-next-line react/only-export-components
export const ui = StyleSheet.create({
  card: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, gap: 10, marginBottom: 12, padding: 16, shadowColor: '#123c32', shadowOffset: { height: 5, width: 0 }, shadowOpacity: 0.06, shadowRadius: 12 },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  chip: {
    borderColor: colors.border, borderRadius: 999, borderWidth: 1, color: colors.ink,
    fontSize: 12, fontWeight: '700', marginBottom: 6, marginRight: 6, overflow: 'hidden',
    paddingHorizontal: 12, paddingVertical: 6,
  },
  metric: { backgroundColor: colors.chipBg, borderRadius: 8, flexBasis: '31%', flexGrow: 1, gap: 2, padding: 10 },
  metricValue: { color: colors.ink, fontSize: 20, fontWeight: '900' },
  metricLabel: { color: colors.sub, fontSize: 11 },
  sectionTitle: { color: colors.ink, fontSize: 15, fontWeight: '900', marginBottom: 6, marginTop: 2 },
  empty: { alignItems: 'center', backgroundColor: colors.chipBg, borderRadius: 14, gap: 4, padding: 20 },
  emptyTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  emptySub: { color: colors.sub, fontSize: 12, textAlign: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap' },
})
