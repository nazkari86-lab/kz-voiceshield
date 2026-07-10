import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { sentenceTimeline } from '@scoring'
import { colors, riskColor } from '../theme'
import { Card, EmptyState } from './ui'

type TimelineItem = ReturnType<typeof sentenceTimeline>[number]

export function TimelineView({ timeline }: { timeline: TimelineItem[] }) {
  if (timeline.length === 0) return <EmptyState title="No segments" subtitle="Add a transcript to see a per-sentence breakdown." />
  return (
    <View>
      {timeline.map((item) => (
        <Card key={`${item.index}-${item.segment}`} tone={item.analysis.risk}>
          <View style={styles.head}>
            <Text style={[styles.idx, { backgroundColor: riskColor[item.analysis.risk] }]}>{item.index}</Text>
            <Text style={styles.verdict}>{item.analysis.score}/100 · {item.analysis.verdict}</Text>
          </View>
          <Text style={styles.segment}>{item.segment}</Text>
        </Card>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  idx: { borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 3 },
  verdict: { color: colors.ink, fontSize: 13, fontWeight: '800', flex: 1 },
  segment: { color: colors.sub, fontSize: 13, lineHeight: 19 },
})
