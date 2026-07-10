import React, { useEffect, useState } from 'react'
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SetupScreen } from '@screens/SetupScreen'
import { useWorkspace } from '@hooks/useWorkspace'
import { colors, riskColor } from './theme'
import { AttackChainView } from './components/AttackChainView'
import { CasesView } from './components/CasesView'
import { DatasetView } from './components/DatasetView'
import { EvidenceView } from './components/EvidenceView'
import { FamilyView } from './components/FamilyView'
import { LiveView } from './components/LiveView'
import { OperationsView } from './components/OperationsView'
import { PlaybookView } from './components/PlaybookView'
import { ReviewView } from './components/ReviewView'
import { SimulatorView } from './components/SimulatorView'
import { ThreatsView } from './components/ThreatsView'
import { TimelineView } from './components/TimelineView'
import { VerifyView } from './components/VerifyView'

type Tab =
  | 'live' | 'review' | 'evidence' | 'timeline' | 'threats'
  | 'chain' | 'simulator' | 'cases' | 'operations' | 'dataset' | 'playbook' | 'family' | 'verify' | 'setup'

const TABS: Array<[Tab, string]> = [
  ['live', 'Live'],
  ['review', 'Review'],
  ['evidence', 'Evidence'],
  ['timeline', 'Timeline'],
  ['threats', 'Threat Lab'],
  ['chain', 'Attack Chain'],
  ['simulator', 'Simulator'],
  ['cases', 'Cases'],
  ['operations', 'Operations'],
  ['dataset', 'Dataset'],
  ['playbook', 'Playbook'],
  ['family', 'Family'],
  ['verify', 'Verify'],
  ['setup', 'Setup'],
]

export default function App() {
  const [tab, setTab] = useState<Tab>('live')
  const w = useWorkspace()

  useEffect(() => {
    if (w.hydrated && !w.privacyConsent) setTab('setup')
  }, [w.hydrated, w.privacyConsent])

  return (
    <SafeAreaView style={styles.shell}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>KZ VoiceShield</Text>
          <Text style={styles.subtitle}>On-device RU/KZ call fraud protection</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: riskColor[w.analysis.risk] }]}>
          <Text style={styles.badgeText}>{w.analysis.score}</Text>
        </View>
      </View>

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {TABS.map(([key, label]) => (
            <Pressable key={key} onPress={() => setTab(key)} style={[styles.tab, tab === key && styles.tabActive]}>
              <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {tab === 'live' && (
          <LiveView
            analysis={w.analysis}
            transcript={w.transcript}
            source={w.source}
            isListening={w.isListening}
            audioLevel={w.audioLevel}
            error={w.captureError}
            notice={w.captureNotice}
            callStatus={w.callStatus}
            storageError={w.storageError}
            trustedContactName={w.trustedContact?.name}
            onChangeTranscript={w.setTranscript}
            onToggleListening={() => { void (w.isListening ? w.stopListening() : w.startListening()) }}
            onSave={w.saveCurrentCase}
            onExportReport={w.exportReport}
            onCallTrusted={() => { void w.callTrustedContact() }}
          />
        )}
        {tab === 'review' && <ReviewView analysis={w.analysis} timelineLength={w.timeline.length} highSignals={w.highSignals} />}
        {tab === 'evidence' && <EvidenceView analysis={w.analysis} />}
        {tab === 'timeline' && <TimelineView timeline={w.timeline} />}
        {tab === 'threats' && <ThreatsView />}
        {tab === 'chain' && <AttackChainView analysis={w.analysis} />}
        {tab === 'simulator' && (
          <SimulatorView onLoadScenario={(key, label) => { w.loadSample(key, label); setTab('review') }} />
        )}
        {tab === 'cases' && (
          <CasesView
            cases={w.cases}
            onSaveCurrent={() => { w.saveCurrentCase() }}
            onLoadCase={(item) => { w.loadCase(item); setTab('review') }}
            onUpdateLabel={w.updateCaseLabel}
            onUpdateStatus={w.updateCaseStatus}
            onToggleFlag={w.toggleCaseFlag}
            onExportBundle={w.exportEvidenceBundle}
            onDeleteCase={w.deleteCase}
          />
        )}
        {tab === 'operations' && (
          <OperationsView
            operations={w.operations}
            onLoadCase={(item) => { w.loadCase(item); setTab('review') }}
            onUpdateStatus={w.updateCaseStatus}
            onToggleFlag={w.toggleCaseFlag}
            onExportBundle={w.exportEvidenceBundle}
          />
        )}
        {tab === 'dataset' && (
          <DatasetView
            quality={w.quality}
            caseCount={w.cases.length}
            datasetStageTotals={w.datasetStageTotals}
            onExportJsonl={w.exportJsonlCases}
            onExportCsv={w.exportCsvCases}
            onExportSplit={w.exportSplitCases}
            onClear={w.clearCases}
          />
        )}
        {tab === 'playbook' && <PlaybookView />}
        {tab === 'family' && (
          <FamilyView
            contact={w.trustedContact}
            privacyConsent={w.privacyConsent}
            onSave={w.saveTrustedContact}
            onClear={w.clearTrustedContact}
            onCall={w.callTrustedContact}
            onShareAlert={w.shareTrustedAlert}
          />
        )}
        {tab === 'verify' && <VerifyView />}
        {tab === 'setup' && (
          <SetupScreen
            modelReady={w.modelReady}
            modelProgress={w.modelProgress}
            privacyConsent={w.privacyConsent}
            storageError={w.storageError}
            callStatus={w.callStatus}
            caseCount={w.cases.length}
            onPrepareWhisper={() => { void w.prepareWhisper() }}
            onAcceptPrivacy={w.acceptPrivacy}
            onDeclinePrivacy={w.declinePrivacy}
            onDeleteAllData={w.deleteAllLocalData}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  shell: { backgroundColor: colors.bg, flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14 },
  headerText: { flex: 1 },
  title: { color: colors.ink, fontSize: 22, fontWeight: '900' },
  subtitle: { color: colors.sub, fontSize: 12, marginTop: 2 },
  badge: { alignItems: 'center', borderRadius: 16, height: 54, justifyContent: 'center', width: 54 },
  badgeText: { color: '#fff', fontSize: 20, fontWeight: '900' },
  tabs: { gap: 8, paddingHorizontal: 14, paddingBottom: 8 },
  tab: { backgroundColor: colors.chipBg, borderColor: colors.border, borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  tabActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  tabText: { color: '#334155', fontSize: 12, fontWeight: '800' },
  tabTextActive: { color: '#fff' },
  content: { padding: 16, paddingBottom: 40 },
})
