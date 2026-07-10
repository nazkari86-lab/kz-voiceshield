import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { Analysis } from '@scoring'
import { colors, riskColor } from '../theme'
import { Card, EmptyState, SectionTitle } from './ui'

export function EvidenceView({ analysis }: { analysis: Analysis }) {
  return (
    <View>
      <SectionTitle>Evidence · matched tactics, stages and terms</SectionTitle>
      {analysis.evidence.length === 0 ? (
        <EmptyState title="No actionable scam pattern" subtitle="Ordinary text stays at 0 unless real signals appear." />
      ) : (
        analysis.evidence.map((item) => (
          <Card key={item.id} tone={item.severity}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.meta}>{item.tactic} · {item.stage} · +{item.score}</Text>
            <View style={styles.terms}>
              {item.matches.map((match) => <Text key={match} style={styles.term}>{match}</Text>)}
            </View>
          </Card>
        ))
      )}
      <Card tone={analysis.risk}>
        <Text style={styles.title}>{analysis.verdict}</Text>
        <Text style={styles.meta}>Score {analysis.score}/100 · Confidence {analysis.confidence}/100</Text>
        <Text style={styles.next}>{analysis.nextAction}</Text>
      </Card>
    </View>
  )
}

const styles = StyleSheet.create({
  title: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  meta: { color: colors.sub, fontSize: 12 },
  next: { color: colors.sub, fontSize: 13, lineHeight: 19 },
  terms: { flexDirection: 'row', flexWrap: 'wrap' },
  term: {
    backgroundColor: colors.chipBg, borderRadius: 8, color: '#334155', fontSize: 11,
    marginBottom: 6, marginRight: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
})
