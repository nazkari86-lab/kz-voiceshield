import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { Analysis } from '@scoring'
import { colors, riskColor } from '../theme'
import { Card, Metric, RiskBadge, SectionTitle, ui } from './ui'

type Props = { analysis: Analysis; timelineLength: number; highSignals: number }

export function ReviewView({ analysis, timelineLength, highSignals }: Props) {
  const cashOut = analysis.evidence.some((item) => item.stage === 'Cash-out')
  return (
    <View>
      <Card tone={analysis.risk}>
        <View style={styles.topline}>
          <RiskBadge risk={analysis.risk} />
          <Text style={styles.caseId}>{analysis.caseId}</Text>
        </View>
        <Text style={[styles.score, { color: riskColor[analysis.risk] }]}>{analysis.score}</Text>
        <View style={styles.meterTrack}>
          <View style={[styles.meterFill, { backgroundColor: riskColor[analysis.risk], width: `${analysis.score}%` }]} />
        </View>
        <Text style={styles.next}>{analysis.nextAction}</Text>
      </Card>

      <View style={ui.row}>
        <Metric value={highSignals} label="major signals" />
        <Metric value={analysis.confidence} label="confidence" />
        <Metric value={analysis.evidence.length} label="rules matched" />
        <Metric value={analysis.matchedTerms} label="terms found" />
        <Metric value={timelineLength} label="segments" />
        <Metric value={cashOut ? 'Yes' : 'No'} label="cash-out stage" />
      </View>

      <Card>
        <SectionTitle>Escalation reasons</SectionTitle>
        {analysis.escalationReasons.length === 0
          ? <Text style={styles.muted}>No escalation signals.</Text>
          : analysis.escalationReasons.map((reason) => <Text key={reason} style={styles.bullet}>• {reason}</Text>)}
      </Card>

      <Card>
        <SectionTitle>Response checklist</SectionTitle>
        {analysis.responseChecklist.map((item) => <Text key={item} style={styles.bullet}>• {item}</Text>)}
      </Card>

      <Card>
        <SectionTitle>Threat stage coverage</SectionTitle>
        {analysis.stageCoverage.length === 0 ? (
          <Text style={styles.muted}>No active threat stages.</Text>
        ) : (
          analysis.stageCoverage.map((stage) => (
            <View key={stage.stage} style={styles.stageRow}>
              <Text style={styles.stageName}>{stage.stage}</Text>
              <Text style={styles.stageMeta}>{stage.count} rule(s) · {stage.score} pts</Text>
            </View>
          ))
        )}
      </Card>
    </View>
  )
}

const styles = StyleSheet.create({
  topline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  caseId: { color: colors.sub, fontSize: 12, fontWeight: '700' },
  score: { fontSize: 48, fontWeight: '900' },
  meterTrack: { backgroundColor: colors.chipBg, borderRadius: 999, height: 8, overflow: 'hidden' },
  meterFill: { borderRadius: 999, height: 8 },
  next: { color: colors.sub, fontSize: 13, lineHeight: 19 },
  bullet: { color: '#334155', fontSize: 13, lineHeight: 20 },
  muted: { color: colors.muted, fontSize: 13 },
  stageRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  stageName: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  stageMeta: { color: colors.sub, fontSize: 12 },
})
