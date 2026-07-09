import React, { useState } from 'react'
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SetupScreen } from '@screens/SetupScreen'
import { useCallAnalysis } from '@hooks/useCallAnalysis'

type Tab = 'live' | 'history' | 'setup'

const riskColor = {
  safe: '#16a34a',
  low: '#65a30d',
  medium: '#f59e0b',
  high: '#ef4444',
  critical: '#991b1b',
} as const

export default function App() {
  const [tab, setTab] = useState<Tab>('live')
  const [history, setHistory] = useState<Array<{ id: string; text: string; score: number }>>([])
  const analysis = useCallAnalysis()

  const save = () => {
    setHistory((current) => [{ id: String(Date.now()), text: analysis.transcript, score: analysis.result.score }, ...current])
  }

  return (
    <SafeAreaView style={styles.shell}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>KZ VoiceShield</Text>
          <Text style={styles.subtitle}>On-device RU/KZ call fraud protection</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: riskColor[analysis.result.level] }]}>
          <Text style={styles.badgeText}>{analysis.result.score}</Text>
        </View>
      </View>

      <View style={styles.tabs}>
        {(['live', 'history', 'setup'] as Tab[]).map((item) => (
          <Pressable key={item} onPress={() => setTab(item)} style={[styles.tab, tab === item && styles.activeTab]}>
            <Text style={[styles.tabText, tab === item && styles.activeTabText]}>{item.toUpperCase()}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {tab === 'live' && (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>{analysis.result.level.toUpperCase()} · {analysis.source}</Text>
            <Text style={styles.summary}>{analysis.result.summary}</Text>
            {analysis.error && <Text style={styles.error}>{analysis.error}</Text>}
            <TextInput
              multiline
              onChangeText={analysis.setTranscript}
              placeholder="Live transcript will appear here"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              value={analysis.transcript}
            />
            <View style={styles.actions}>
              <Pressable style={styles.primary} onPress={analysis.isListening ? analysis.stop : analysis.start}>
                <Text style={styles.primaryText}>{analysis.isListening ? 'Stop' : 'Start protection'}</Text>
              </Pressable>
              <Pressable style={styles.secondary} onPress={save}>
                <Text style={styles.secondaryText}>Save</Text>
              </Pressable>
            </View>
            {analysis.result.checklist.map((item) => <Text key={item} style={styles.check}>• {item}</Text>)}
          </View>
        )}

        {tab === 'history' && (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>History</Text>
            {history.map((item) => (
              <View key={item.id} style={styles.historyItem}>
                <Text style={styles.historyScore}>{item.score}/100</Text>
                <Text style={styles.historyText}>{item.text.slice(0, 180)}</Text>
              </View>
            ))}
          </View>
        )}

        {tab === 'setup' && <SetupScreen modelReady={analysis.modelReady} onPrepareWhisper={() => { void analysis.prepareWhisper() }} />}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 10 },
  activeTab: { backgroundColor: '#0ea5b7', borderColor: '#0ea5b7' },
  activeTabText: { color: '#ffffff' },
  badge: { alignItems: 'center', borderRadius: 18, height: 64, justifyContent: 'center', width: 64 },
  badgeText: { color: '#ffffff', fontSize: 24, fontWeight: '900' },
  check: { color: '#334155', fontSize: 13, lineHeight: 20 },
  content: { gap: 14, padding: 16 },
  error: { backgroundColor: '#fee2e2', borderColor: '#fecaca', borderRadius: 12, borderWidth: 1, color: '#991b1b', fontSize: 13, lineHeight: 19, padding: 12 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', padding: 18 },
  historyItem: { backgroundColor: '#f8fafc', borderRadius: 12, gap: 6, padding: 12 },
  historyScore: { color: '#0f172a', fontWeight: '900' },
  historyText: { color: '#64748b', lineHeight: 19 },
  input: { backgroundColor: '#f8fafc', borderColor: '#dbe4ef', borderRadius: 14, borderWidth: 1, color: '#0f172a', minHeight: 220, padding: 14, textAlignVertical: 'top' },
  panel: { backgroundColor: '#ffffff', borderColor: '#dbe4ef', borderRadius: 18, borderWidth: 1, gap: 14, padding: 16 },
  panelTitle: { color: '#0f172a', fontSize: 18, fontWeight: '900' },
  primary: { alignItems: 'center', backgroundColor: '#0ea5b7', borderRadius: 12, flex: 1, padding: 14 },
  primaryText: { color: '#ffffff', fontWeight: '900' },
  secondary: { alignItems: 'center', borderColor: '#cbd5e1', borderRadius: 12, borderWidth: 1, flex: 1, padding: 14 },
  secondaryText: { color: '#0f172a', fontWeight: '800' },
  shell: { backgroundColor: '#eef4f8', flex: 1 },
  subtitle: { color: '#64748b', fontSize: 13, marginTop: 3 },
  summary: { color: '#475569', lineHeight: 20 },
  tab: { alignItems: 'center', borderColor: '#cbd5e1', borderRadius: 999, borderWidth: 1, flex: 1, padding: 10 },
  tabText: { color: '#334155', fontSize: 12, fontWeight: '900' },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
  title: { color: '#0f172a', fontSize: 24, fontWeight: '900' },
})
