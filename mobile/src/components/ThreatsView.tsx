import React, { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { threatRules } from '@scoring'
import type { Severity } from '@scoring'
import { colors, riskColor } from '../theme'
import { Card, Chip } from './ui'

const STAGES = ['All', ...Array.from(new Set(threatRules.map((r) => r.stage))).sort()]
const SEVERITIES: Array<'All' | Severity> = ['All', 'critical', 'high', 'medium', 'low']

export function ThreatsView() {
  const [stage, setStage] = useState('All')
  const [severity, setSeverity] = useState<'All' | Severity>('All')

  const filtered = useMemo(
    () => threatRules.filter((r) => (stage === 'All' || r.stage === stage) && (severity === 'All' || r.severity === severity)),
    [stage, severity],
  )

  return (
    <View>
      <Text style={styles.label}>Stage</Text>
      <View style={styles.wrap}>
        {STAGES.map((s) => <Chip key={s} label={s} active={stage === s} onPress={() => setStage(s)} />)}
      </View>
      <Text style={styles.label}>Severity</Text>
      <View style={styles.wrap}>
        {SEVERITIES.map((s) => (
          <Chip key={s} label={s} active={severity === s} tone={s === 'All' ? undefined : riskColor[s]} onPress={() => setSeverity(s)} />
        ))}
      </View>
      <Text style={styles.count}>{filtered.length} of {threatRules.length} rules</Text>

      {filtered.map((rule) => (
        <Card key={rule.id} tone={rule.severity}>
          <Text style={styles.title}>{rule.title}</Text>
          <Text style={styles.meta}>
            {rule.tactic} · {rule.stage} · weight {rule.weight}{rule.minHits ? ` · min ${rule.minHits} hits` : ''}
          </Text>
          <Text style={styles.advice}>{rule.advice}</Text>
          <View style={styles.terms}>
            {rule.terms.slice(0, 5).map((term) => <Text key={term} style={styles.term}>{term}</Text>)}
            {rule.terms.length > 5 && <Text style={styles.term}>+{rule.terms.length - 5} more</Text>}
          </View>
        </Card>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  label: { color: colors.sub, fontSize: 12, fontWeight: '800', marginBottom: 4, marginTop: 4 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  count: { color: colors.muted, fontSize: 12, marginBottom: 8, marginTop: 2 },
  title: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  meta: { color: colors.sub, fontSize: 11 },
  advice: { color: '#334155', fontSize: 13, lineHeight: 19 },
  terms: { flexDirection: 'row', flexWrap: 'wrap' },
  term: {
    backgroundColor: colors.chipBg, borderRadius: 8, color: '#334155', fontSize: 11,
    marginBottom: 6, marginRight: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
})
