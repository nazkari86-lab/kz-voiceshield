import React, { useCallback, useEffect, useState } from 'react'
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native'
import { clearTranscriptHistory, deleteTranscriptEntry, getTranscriptHistory, type TranscriptEntry } from '../utils/transcriptHistory'
import { colors, riskColor } from '../theme'
import { Card, RiskBadge, SectionTitle } from './ui'
import { LocalizedText as Text } from './LocalizedText'

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function fmtDuration(sec: number): string {
  if (sec < 60) return `${sec}с`
  return `${Math.floor(sec / 60)}м ${sec % 60}с`
}

function HistoryCard({ entry, onDelete }: { entry: TranscriptEntry; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <Card tone={entry.risk as any}>
      <TouchableOpacity onPress={() => setExpanded(e => !e)} activeOpacity={0.8}>
        <View style={styles.cardHeader}>
          <RiskBadge risk={entry.risk as any} />
          <Text style={styles.dateText}>{fmtDate(entry.ts)}</Text>
          <Text style={styles.durationText}>{fmtDuration(entry.durationSec)}</Text>
        </View>
        <Text style={styles.schemeLine}>{entry.schemeLabel}</Text>
        <View style={styles.scoreRow}>
          <Text style={[styles.scoreVal, { color: riskColor[entry.risk as keyof typeof riskColor] ?? colors.sub }]}>
            {entry.score}
          </Text>
          <Text style={styles.scoreLabel}> / 100</Text>
        </View>
        {expanded && (
          <Text style={styles.transcript} numberOfLines={10}>
            {entry.transcript || '(нет транскрипта)'}
          </Text>
        )}
        <Text style={styles.expandHint}>{expanded ? '▲ скрыть' : '▼ транскрипт'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onDelete} style={styles.deleteBtn}>
        <Text style={styles.deleteText}>Удалить</Text>
      </TouchableOpacity>
    </Card>
  )
}

export function TranscriptHistoryView() {
  const [entries, setEntries] = useState<TranscriptEntry[]>([])

  const load = useCallback(async () => {
    setEntries(await getTranscriptHistory())
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = useCallback((id: string) => {
    Alert.alert('Удалить запись?', '', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: async () => { await deleteTranscriptEntry(id); load() } },
    ])
  }, [load])

  const handleClear = useCallback(() => {
    Alert.alert('Очистить историю?', 'Все записи будут удалены.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Очистить', style: 'destructive', onPress: async () => { await clearTranscriptHistory(); load() } },
    ])
  }, [load])

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <SectionTitle>История звонков</SectionTitle>
        {entries.length > 0 && (
          <TouchableOpacity onPress={handleClear} style={styles.clearBtn}>
            <Text style={styles.clearText}>Очистить</Text>
          </TouchableOpacity>
        )}
      </View>
      {entries.length === 0 ? (
        <Text style={styles.empty}>Нет сохранённых звонков.{'\n'}Начните мониторинг — записи появятся здесь.</Text>
      ) : (
        entries.map(entry => (
          <HistoryCard key={entry.id} entry={entry} onDelete={() => handleDelete(entry.id)} />
        ))
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { paddingBottom: 24 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  clearBtn: { backgroundColor: '#fee2e2', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4 },
  clearText: { color: '#dc2626', fontSize: 13, fontWeight: '700' },
  empty: { color: colors.muted, fontSize: 14, lineHeight: 22, textAlign: 'center', marginTop: 40 },
  cardHeader: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  dateText: { color: colors.sub, fontSize: 12 },
  durationText: { color: colors.muted, fontSize: 12, marginLeft: 'auto' },
  schemeLine: { color: colors.ink, fontSize: 14, fontWeight: '800', marginTop: 4 },
  scoreRow: { alignItems: 'baseline', flexDirection: 'row', marginTop: 2 },
  scoreVal: { fontSize: 28, fontWeight: '900' },
  scoreLabel: { color: colors.sub, fontSize: 14 },
  transcript: { backgroundColor: colors.chipBg, borderRadius: 6, color: colors.ink, fontSize: 12, lineHeight: 18, marginTop: 8, padding: 8 },
  expandHint: { color: colors.sub, fontSize: 11, marginTop: 4 },
  deleteBtn: { alignSelf: 'flex-end', marginTop: 8 },
  deleteText: { color: '#dc2626', fontSize: 12 },
})
