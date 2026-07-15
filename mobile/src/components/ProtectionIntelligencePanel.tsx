import React from 'react'
import { StyleSheet, View } from 'react-native'
import { LocalizedText as Text } from './LocalizedText'
import type { Analysis } from '@scoring'
import type { LiveAiResult } from '../utils/liveAiAnalysis'
import { buildAttackGraph, buildDeviceDiagnostics, buildDriftReport, buildFamilyAlert, buildIncidentCopilot, buildModelConsensus } from '../utils/protectionIntelligence'
import { colors } from '../theme'
import { Card, SectionTitle } from './ui'

type Props = {
  analysis: Analysis
  transcript?: string
  liveAi?: LiveAiResult | null
  device?: { audioLevel: number; modelReady: boolean; isListening: boolean; source: string; captureError?: string | null }
  repeatBonus?: number
}

const statusColor = { pass: '#15803d', warn: '#b45309', fail: '#b91c1c' } as const

export function ProtectionIntelligencePanel({ analysis, transcript = '', liveAi, device, repeatBonus = 0 }: Props) {
  const copilot = buildIncidentCopilot(analysis, transcript)
  const consensus = buildModelConsensus(analysis, liveAi)
  const drift = buildDriftReport(analysis, liveAi)
  const graph = buildAttackGraph(analysis)
  const family = buildFamilyAlert(analysis)
  const diagnostics = device ? buildDeviceDiagnostics(analysis, device) : []
  const urgent = copilot.filter((item) => item.priority === 'now').slice(0, 3)
  return (
    <View style={styles.root}>
      <Card tone={analysis.risk}>
        <SectionTitle>Protection Intelligence</SectionTitle>
        <Text style={styles.summary}>Правила остаются главным защитным контуром. Дополнительные модели и контекст только повышают прозрачность решения.</Text>
        <View style={styles.consensusRow}>
          <View style={styles.metric}><Text style={styles.metricLabel}>CONSENSUS</Text><Text style={styles.metricValue}>{consensus.label.replace('_', ' ')}</Text></View>
          <View style={styles.metric}><Text style={styles.metricLabel}>CONFIDENCE</Text><Text style={styles.metricValue}>{consensus.confidence}%</Text></View>
          <View style={styles.metric}><Text style={styles.metricLabel}>DRIFT</Text><Text style={[styles.metricValue, { color: drift.status === 'watch' ? '#b45309' : colors.brandDark }]}>{drift.status}</Text></View>
        </View>
        <Text style={styles.explanation}>{consensus.explanation}</Text>
        {drift.signals.map((signal) => <Text key={signal} style={styles.signal}>• {signal}</Text>)}
      </Card>

      <Card>
        <SectionTitle>Incident Copilot · сейчас</SectionTitle>
        {urgent.map((action) => <View key={action.id} style={styles.action}><View style={styles.actionBadge}><Text style={styles.actionBadgeText}>!</Text></View><View style={styles.actionBody}><Text style={styles.actionTitle}>{action.title}</Text><Text style={styles.actionReason}>{action.reason}</Text></View></View>)}
        {copilot.filter((item) => item.priority !== 'now').slice(0, 3).map((action) => <Text key={action.id} style={styles.secondaryAction}>› {action.title}</Text>)}
      </Card>

      <Card>
        <SectionTitle>Device readiness</SectionTitle>
        {diagnostics.length === 0 ? <Text style={styles.summary}>Диагностика появится в Live Shield во время активного захвата.</Text> : diagnostics.map((item) => <View key={item.id} style={styles.diagnostic}><Text style={[styles.status, { color: statusColor[item.status] }]}>{item.status.toUpperCase()}</Text><View style={styles.diagnosticBody}><Text style={styles.diagnosticTitle}>{item.title}</Text><Text style={styles.diagnosticDetail}>{item.detail}</Text>{item.status !== 'pass' && <Text style={styles.fix}>{item.fix}</Text>}</View></View>)}
      </Card>

      <Card>
        <SectionTitle>Attack graph</SectionTitle>
        <Text style={styles.summary}>{graph.nodes.length - 1} узлов · {graph.edges.length} связей · сохранено без чувствительных данных.</Text>
        {graph.edges.slice(0, 5).map((edge, index) => <Text key={`${edge.from}-${edge.to}-${index}`} style={styles.graphLine}>• {graph.nodes.find((node) => node.id === edge.from)?.label} → {graph.nodes.find((node) => node.id === edge.to)?.label}</Text>)}
      </Card>

      <Card>
        <SectionTitle>Family-safe alert</SectionTitle>
        <Text style={styles.alertTitle}>{family.title}</Text><Text style={styles.alertBody}>{family.body}</Text><Text style={styles.redacted}>REDACTED · transcript and number are not included</Text>
        {repeatBonus > 0 && <Text style={styles.signal}>Повторный паттерн усилил персональную настороженность на +{repeatBonus}.</Text>}
      </Card>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: 10 },
  summary: { color: colors.sub, fontSize: 12, lineHeight: 18 },
  consensusRow: { flexDirection: 'row', gap: 7, marginTop: 10 },
  metric: { backgroundColor: colors.chipBg, borderRadius: 6, flex: 1, padding: 8 },
  metricLabel: { color: colors.muted, fontSize: 8, fontWeight: '900' },
  metricValue: { color: colors.brandDark, fontSize: 11, fontWeight: '900', marginTop: 3, textTransform: 'uppercase' },
  explanation: { color: colors.ink, fontSize: 12, lineHeight: 17, marginTop: 9 },
  signal: { color: '#9a3412', fontSize: 11, lineHeight: 16, marginTop: 4 },
  action: { alignItems: 'flex-start', flexDirection: 'row', gap: 9, marginBottom: 9 },
  actionBadge: { alignItems: 'center', backgroundColor: '#b91c1c', borderRadius: 10, height: 20, justifyContent: 'center', width: 20 },
  actionBadgeText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  actionBody: { flex: 1 },
  actionTitle: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  actionReason: { color: colors.sub, fontSize: 11, lineHeight: 16, marginTop: 2 },
  secondaryAction: { color: colors.brandDark, fontSize: 12, fontWeight: '800', marginTop: 4 },
  diagnostic: { alignItems: 'flex-start', flexDirection: 'row', gap: 8, marginBottom: 9 },
  status: { fontSize: 9, fontWeight: '900', width: 42 },
  diagnosticBody: { flex: 1 },
  diagnosticTitle: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  diagnosticDetail: { color: colors.sub, fontSize: 11, lineHeight: 16 },
  fix: { color: '#9a3412', fontSize: 11, lineHeight: 16, marginTop: 2 },
  graphLine: { color: colors.ink, fontSize: 11, lineHeight: 17, marginTop: 3 },
  alertTitle: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  alertBody: { color: colors.sub, fontSize: 12, lineHeight: 18, marginTop: 3 },
  redacted: { color: colors.brandDark, fontSize: 9, fontWeight: '900', marginTop: 8 },
})
