import React from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import type { Analysis } from '@scoring'
import { colors, riskColor } from '../theme'
import { Card, RiskBadge } from './ui'

type Props = {
  analysis: Analysis
  transcript: string
  source: string
  isListening: boolean
  audioLevel: number
  error: string | null
  onChangeTranscript: (text: string) => void
  onToggleListening: () => void
  onSave: () => void
  onExportReport: () => void
}

export function LiveView({ analysis, transcript, source, isListening, audioLevel, error, onChangeTranscript, onToggleListening, onSave, onExportReport }: Props) {
  return (
    <View>
      <Card tone={analysis.risk}>
        <View style={styles.topline}>
          <RiskBadge risk={analysis.risk} />
          <Text style={styles.source}>{source}</Text>
        </View>
        <Text style={[styles.score, { color: riskColor[analysis.risk] }]}>{analysis.score}<Text style={styles.scoreMax}>/100</Text></Text>
        <Text style={styles.verdict}>{analysis.verdict}</Text>
        <Text style={styles.next}>{analysis.nextAction}</Text>
        {isListening && (
          <View style={styles.levelTrack}>
            <View style={[styles.levelFill, { width: `${Math.min(100, Math.round(audioLevel * 100))}%` }]} />
          </View>
        )}
      </Card>

      {error && <Text style={styles.error}>{error}</Text>}

      <TextInput
        multiline
        value={transcript}
        onChangeText={onChangeTranscript}
        placeholder="Live transcript appears here — or paste/type a call to analyse"
        placeholderTextColor={colors.muted}
        style={styles.input}
      />

      <View style={styles.actions}>
        <Pressable style={[styles.primary, isListening && styles.stop]} onPress={onToggleListening}>
          <Text style={styles.primaryText}>{isListening ? 'Stop' : 'Start protection'}</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={onSave}><Text style={styles.secondaryText}>Save case</Text></Pressable>
        <Pressable style={styles.secondary} onPress={onExportReport}><Text style={styles.secondaryText}>Share report</Text></Pressable>
      </View>

      {analysis.responseChecklist.map((item) => <Text key={item} style={styles.check}>• {item}</Text>)}
    </View>
  )
}

const styles = StyleSheet.create({
  topline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  source: { color: colors.sub, fontSize: 12, fontWeight: '700' },
  score: { fontSize: 46, fontWeight: '900' },
  scoreMax: { color: colors.muted, fontSize: 18, fontWeight: '800' },
  verdict: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  next: { color: colors.sub, fontSize: 13, lineHeight: 19 },
  levelTrack: { backgroundColor: colors.chipBg, borderRadius: 999, height: 6, overflow: 'hidden' },
  levelFill: { backgroundColor: colors.brand, height: 6 },
  error: { backgroundColor: '#fee2e2', borderColor: '#fecaca', borderRadius: 12, borderWidth: 1, color: '#991b1b', fontSize: 13, lineHeight: 19, marginBottom: 12, padding: 12 },
  input: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 14, borderWidth: 1, color: colors.ink, marginBottom: 12, minHeight: 150, padding: 14, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  primary: { backgroundColor: colors.brand, borderRadius: 12, flexGrow: 1, paddingHorizontal: 16, paddingVertical: 13 },
  stop: { backgroundColor: '#ef4444' },
  primaryText: { color: '#fff', fontWeight: '900', textAlign: 'center' },
  secondary: { borderColor: colors.border, borderRadius: 12, borderWidth: 1, flexGrow: 1, paddingHorizontal: 12, paddingVertical: 13 },
  secondaryText: { color: colors.ink, fontWeight: '800', textAlign: 'center' },
  check: { color: '#334155', fontSize: 13, lineHeight: 20 },
})
