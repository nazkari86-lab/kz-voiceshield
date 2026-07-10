import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { Analysis, Evidence } from '@scoring'
import { colors, riskColor } from '../theme'
import { Card, Metric, ui } from './ui'

const CHAIN = [
  { id: 'Hook', label: 'Hook', description: 'First contact — establishes false premise or backstory' },
  { id: 'Grooming', label: 'Grooming', description: 'Builds trust and familiarity over time' },
  { id: 'Control', label: 'Control', description: 'Creates urgency, isolation and time pressure' },
  { id: 'Extraction', label: 'Extraction', description: 'Steals credentials, OTP codes or personal data' },
  { id: 'Takeover', label: 'Takeover', description: 'Compromises accounts, devices or SIM cards' },
  { id: 'Cash-out', label: 'Cash-out', description: 'Moves or extracts money from victim' },
]

const sophistication = (covered: number, total: number) => {
  const ratio = covered / total
  if (ratio === 0) return { label: 'No threat', color: riskColor.low }
  if (ratio <= 0.17) return { label: 'Opportunistic', color: riskColor.low }
  if (ratio <= 0.33) return { label: 'Semi-structured', color: riskColor.medium }
  if (ratio <= 0.5) return { label: 'Structured', color: riskColor.high }
  return { label: 'Coordinated multi-stage attack', color: riskColor.critical }
}

export function AttackChainView({ analysis }: { analysis: Analysis }) {
  const byStage = new Map<string, Evidence[]>()
  CHAIN.forEach((s) => byStage.set(s.id, []))
  analysis.evidence.forEach((item) => byStage.set(item.stage, [...(byStage.get(item.stage) ?? []), item]))
  const covered = CHAIN.filter((s) => (byStage.get(s.id)?.length ?? 0) > 0)
  const soph = sophistication(covered.length, CHAIN.length)

  return (
    <View>
      <Card>
        <Text style={styles.title}>Attack Chain Mapper</Text>
        <Text style={styles.meta}>Which phases of a social-engineering attack are present in this transcript.</Text>
        <View style={[styles.sophBadge, { backgroundColor: soph.color }]}>
          <Text style={styles.sophText}>{soph.label}</Text>
        </View>
      </Card>

      {CHAIN.map((stage) => {
        const ev = byStage.get(stage.id) ?? []
        const active = ev.length > 0
        const stageScore = ev.reduce((sum, item) => sum + item.score, 0)
        return (
          <Card key={stage.id} tone={active ? analysis.risk : undefined}>
            <View style={styles.stageHead}>
              <View style={[styles.dot, { backgroundColor: active ? riskColor[analysis.risk] : colors.border }]} />
              <Text style={styles.stageLabel}>{stage.label}</Text>
              {active && <Text style={[styles.plus, { color: riskColor[analysis.risk] }]}>+{stageScore}</Text>}
            </View>
            <Text style={styles.meta}>{stage.description}</Text>
            {active ? (
              ev.map((item) => (
                <View key={item.id} style={styles.ruleRow}>
                  <Text style={styles.ruleTitle}>🛡 {item.title}</Text>
                  <Text style={styles.ruleTactic}>{item.tactic}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.empty}>No signals detected</Text>
            )}
          </Card>
        )
      })}

      <View style={ui.row}>
        <Metric value={`${covered.length}/${CHAIN.length}`} label="stages covered" />
        <Metric value={analysis.evidence.length} label="rules matched" />
        <Metric value={analysis.matchedTerms} label="threat terms" />
        <Metric value={analysis.confidence} label="confidence" />
      </View>

      {covered.length >= 2 && (
        <Card tone={analysis.risk}>
          <Text style={styles.insight}>
            {covered.length >= 4
              ? `${covered.length} attack stages detected — signs of a coordinated, multi-phase social-engineering script. High confidence in deliberate fraud.`
              : covered.length === 3
                ? `3 attack stages present (${covered.map((s) => s.label).join(' → ')}). Structured attack — attacker has prepared a script.`
                : `2 attack stages active (${covered.map((s) => s.label).join(' → ')}). Combination increases real-fraud probability significantly.`}
          </Text>
        </Card>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  title: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  meta: { color: colors.sub, fontSize: 12, lineHeight: 17 },
  sophBadge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  sophText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  stageHead: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  dot: { borderRadius: 6, height: 12, width: 12 },
  stageLabel: { color: colors.ink, fontSize: 14, fontWeight: '900', flex: 1 },
  plus: { fontSize: 13, fontWeight: '900' },
  ruleRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  ruleTitle: { color: colors.ink, flex: 1, fontSize: 12, fontWeight: '700' },
  ruleTactic: { color: colors.sub, fontSize: 11 },
  empty: { color: colors.muted, fontSize: 12, fontStyle: 'italic' },
  insight: { color: '#334155', fontSize: 13, lineHeight: 19 },
})
