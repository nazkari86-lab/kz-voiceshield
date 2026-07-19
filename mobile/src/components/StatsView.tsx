import React, { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { SavedCase } from '@scoring'
import { colors, riskColor } from '../theme'
import { Card, Metric, SectionTitle } from './ui'
import { LocalizedText as Text } from './LocalizedText'
import { readCallStats, type CallStats } from '../services/callStats'

type Props = {
  cases: SavedCase[]
}

type SessionStats = {
  total: number
  thisWeek: number
  allTime: number
}

const SESSIONS_KEY = 'voiceshield.session-stats.v1'

const msPerDay = 86400000

function weekStart() {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(now.setDate(diff)).setHours(0, 0, 0, 0)
}

export function StatsView({ cases }: Props) {
  const [sessions, setSessions] = useState<SessionStats>({ total: 0, thisWeek: 0, allTime: 0 })
  const [callStats, setCallStats] = useState<CallStats>({ blocked: 0, rejected: 0, feedbackHelpful: 0, feedbackNotHelpful: 0 })

  useEffect(() => {
    void AsyncStorage.getItem(SESSIONS_KEY).then((raw) => {
      if (!raw) return
      const data = JSON.parse(raw) as SessionStats
      setSessions(data)
    }).catch(() => undefined)
  }, [])
  useEffect(() => { void readCallStats().then(setCallStats) }, [])

  const wStart = weekStart()
  const casesThisWeek = cases.filter((c) => new Date(c.createdAt).getTime() >= wStart).length
  const criticalCount = cases.filter((c) => c.analysis.risk === 'critical').length
  const highCount = cases.filter((c) => c.analysis.risk === 'high').length
  const mediumCount = cases.filter((c) => c.analysis.risk === 'medium').length
  const lowCount = cases.filter((c) => c.analysis.risk === 'low').length

  // Scheme frequency
  const schemeCounts: Record<string, number> = {}
  for (const c of cases) {
    const label = c.analysis.schemeLabel
    schemeCounts[label] = (schemeCounts[label] ?? 0) + 1
  }
  const topSchemes = Object.entries(schemeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  // Average score
  const avgScore = cases.length === 0 ? 0 : Math.round(cases.reduce((sum, c) => sum + c.analysis.score, 0) / cases.length)

  // Days since first case
  const firstCaseMs = cases.length === 0 ? null : Math.min(...cases.map((c) => new Date(c.createdAt).getTime()))
  const daysSinceFirst = firstCaseMs == null ? 0 : Math.floor((Date.now() - firstCaseMs) / msPerDay)

  const highRiskRate = cases.length === 0 ? 0 : Math.round(((criticalCount + highCount) / cases.length) * 100)

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Statistics</Text>
      <Text style={styles.sub}>Based on saved cases on this device</Text>

      <SectionTitle>Sessions</SectionTitle>
      <View style={styles.metricRow}>
        <Metric value={sessions.allTime} label="total sessions" />
        <Metric value={sessions.thisWeek} label="this week" />
        <Metric value={daysSinceFirst} label="days using app" />
      </View>

      <SectionTitle>Saved cases</SectionTitle>
      <View style={styles.metricRow}>
        <Metric value={cases.length} label="total cases" />
        <Metric value={casesThisWeek} label="this week" />
        <Metric value={avgScore} label="avg risk score" />
        <Metric value={highRiskRate} label="% high risk" />
      </View>

      <SectionTitle>Call protection</SectionTitle>
      <View style={styles.metricRow}>
        <Metric value={callStats.blocked} label="blocked calls" />
        <Metric value={callStats.rejected} label="rejected calls" />
        <Metric value={callStats.feedbackHelpful} label="helpful alerts" />
      </View>

      <SectionTitle>Risk distribution</SectionTitle>
      <View style={styles.barContainer}>
        {cases.length > 0 && (
          <>
            {[
              { label: 'Critical', count: criticalCount, color: riskColor.critical },
              { label: 'High', count: highCount, color: riskColor.high },
              { label: 'Medium', count: mediumCount, color: riskColor.medium },
              { label: 'Low', count: lowCount, color: riskColor.low },
            ].map(({ label, count, color }) => (
              <View key={label} style={styles.barRow}>
                <Text style={styles.barLabel}>{label}</Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { backgroundColor: color, width: `${(count / cases.length) * 100}%` }]} />
                </View>
                <Text style={[styles.barCount, { color }]}>{count}</Text>
              </View>
            ))}
          </>
        )}
        {cases.length === 0 && <Text style={styles.empty}>No cases saved yet. Start a session and save reviewed calls.</Text>}
      </View>

      {topSchemes.length > 0 && (
        <>
          <SectionTitle>Most detected schemes</SectionTitle>
          {topSchemes.map(([scheme, count]) => (
            <Card key={scheme}>
              <View style={styles.schemeRow}>
                <Text style={styles.schemeName}>{scheme}</Text>
                <Text style={styles.schemeCount}>{count}×</Text>
              </View>
            </Card>
          ))}
        </>
      )}
    </View>
  )
}

export async function recordSession() {
  try {
    const raw = await AsyncStorage.getItem(SESSIONS_KEY)
    const data: SessionStats = raw ? (JSON.parse(raw) as SessionStats) : { total: 0, thisWeek: 0, allTime: 0 }
    const wStart = new Date()
    const day = wStart.getDay()
    wStart.setDate(wStart.getDate() - day + (day === 0 ? -6 : 1))
    wStart.setHours(0, 0, 0, 0)
    await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify({
      total: (data.total ?? 0) + 1,
      thisWeek: (data.thisWeek ?? 0) + 1,
      allTime: (data.allTime ?? 0) + 1,
    }))
  } catch {
    // non-fatal
  }
}

const styles = StyleSheet.create({
  container: { gap: 4 },
  title: { color: colors.ink, fontSize: 22, fontWeight: '900' },
  sub: { color: colors.sub, fontSize: 13, lineHeight: 18, marginBottom: 4 },
  metricRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 },
  barContainer: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, gap: 10, marginBottom: 12, padding: 14 },
  barRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  barLabel: { color: colors.sub, fontSize: 12, fontWeight: '700', width: 56 },
  barTrack: { backgroundColor: colors.chipBg, borderRadius: 4, flex: 1, height: 10, overflow: 'hidden' },
  barFill: { borderRadius: 4, height: 10 },
  barCount: { fontSize: 13, fontWeight: '900', width: 32 },
  empty: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  schemeRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  schemeName: { color: colors.ink, flex: 1, fontSize: 13, fontWeight: '800' },
  schemeCount: { color: colors.brand, fontSize: 14, fontWeight: '900' },
})
