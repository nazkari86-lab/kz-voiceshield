import React, { useCallback, useEffect, useState } from 'react'
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native'
import { colors } from '../theme'
import { Card, SectionTitle } from './ui'
import { LocalizedText as Text } from './LocalizedText'
import { clearIncomingCallHistory, getIncomingCallHistory, type IncomingCallEntry } from '../services/incomingCallHistory'

const formatDuration = (seconds: number) => seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`

export function IncomingCallHistoryView() {
  const [entries, setEntries] = useState<IncomingCallEntry[]>([])
  const load = useCallback(async () => setEntries(await getIncomingCallHistory()), [])
  useEffect(() => { void load() }, [load])
  const clear = () => Alert.alert('Clear incoming call history?', 'Stored locally in encrypted storage.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Clear', style: 'destructive', onPress: async () => { await clearIncomingCallHistory(); await load() } },
  ])
  return <View style={styles.root}>
    <View style={styles.header}><SectionTitle>Incoming call history</SectionTitle>{entries.length > 0 && <TouchableOpacity onPress={clear} style={styles.clear}><Text style={styles.clearText}>Clear</Text></TouchableOpacity>}</View>
    <Text style={styles.copy}>Numbers are masked. This history stores call metadata, not audio.</Text>
    {entries.length === 0 ? <Text style={styles.empty}>No incoming calls recorded yet.</Text> : entries.map((entry) => <Card key={entry.id} tone={entry.wangiri || entry.blocked ? 'high' : 'low'}>
      <View style={styles.row}><Text style={styles.number}>{entry.maskedNumber || 'Hidden number'}</Text><Text style={styles.date}>{new Date(entry.ts).toLocaleString()}</Text></View>
      <Text style={styles.meta}>{entry.wangiri ? 'Wangiri warning' : entry.blocked ? 'Blocked by protection' : 'Incoming call'} · {formatDuration(entry.durationSeconds)}</Text>
      <Text style={styles.reason}>{entry.reason}</Text>
    </Card>)}
  </View>
}

const styles = StyleSheet.create({
  root: { gap: 10, paddingBottom: 24 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  clear: { backgroundColor: '#fee2e2', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  clearText: { color: '#b91c1c', fontWeight: '900' },
  copy: { color: colors.sub, fontSize: 13, lineHeight: 19 },
  empty: { color: colors.muted, marginTop: 32, textAlign: 'center' },
  row: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  number: { color: colors.ink, flex: 1, fontSize: 16, fontWeight: '900' },
  date: { color: colors.muted, fontSize: 11 },
  meta: { color: colors.brandDark, fontSize: 12, fontWeight: '800', marginTop: 5 },
  reason: { color: colors.sub, fontSize: 12, marginTop: 4 },
})
