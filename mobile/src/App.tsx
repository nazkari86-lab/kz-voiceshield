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
import { ModelView } from './components/ModelView'
import { NumberShieldView } from './components/NumberShieldView'
import { ScamToolsView } from './components/ScamToolsView'
import { EmergencyView } from './components/EmergencyView'
import { ScreenMotion } from './components/ScreenMotion'
import { ShareIntentModule, shareIntentEvents } from './bridge/ShareIntentBridge'

type Tab =
  | 'live' | 'review' | 'evidence' | 'timeline' | 'threats'
  | 'chain' | 'simulator' | 'emergency' | 'cases' | 'operations' | 'dataset' | 'playbook' | 'family' | 'verify' | 'number' | 'tools' | 'model' | 'setup'

const TABS: Array<[Tab, string]> = [
  ['live', 'Live'],
  ['review', 'Review'],
  ['evidence', 'Evidence'],
  ['timeline', 'Timeline'],
  ['threats', 'Threat Lab'],
  ['chain', 'Attack Chain'],
  ['simulator', 'Simulator'],
  ['emergency', 'Emergency'],
  ['cases', 'Cases'],
  ['operations', 'Operations'],
  ['dataset', 'Dataset'],
  ['playbook', 'Playbook'],
  ['family', 'Family'],
  ['number', 'Number Shield'],
  ['tools', 'Scam Tools'],
  ['verify', 'Verify'],
  ['model', 'Data & Model'],
  ['setup', 'Setup'],
]

const tabMeta: Record<Tab, { label: string; group: string }> = {
  live: { label: 'Live shield', group: 'Protect' }, review: { label: 'Review', group: 'Investigate' }, evidence: { label: 'Evidence', group: 'Investigate' }, timeline: { label: 'Timeline', group: 'Investigate' }, threats: { label: 'Threat lab', group: 'Learn' },
  chain: { label: 'Attack chain', group: 'Learn' }, simulator: { label: 'Simulator', group: 'Learn' }, emergency: { label: 'Emergency', group: 'Recover' }, cases: { label: 'Cases', group: 'Workspace' }, operations: { label: 'Operations', group: 'Workspace' },
  dataset: { label: 'Dataset', group: 'Workspace' }, playbook: { label: 'Playbook', group: 'Learn' }, family: { label: 'Family', group: 'Protect' }, verify: { label: 'Verify', group: 'Protect' }, number: { label: 'Number shield', group: 'Protect' },
  tools: { label: 'Scam tools', group: 'Investigate' }, model: { label: 'Data & model', group: 'Workspace' }, setup: { label: 'Setup', group: 'Workspace' },
}

export default function App() {
  const [tab, setTab] = useState<Tab>('live')
  const [sharedText, setSharedText] = useState('')
  const w = useWorkspace()

  useEffect(() => {
    if (w.hydrated && !w.privacyConsent) setTab('setup')
  }, [w.hydrated, w.privacyConsent])

  useEffect(() => {
    const accept = (text?: string | null) => {
      if (!text) return
      setSharedText(text)
      setTab('tools')
    }
    const subscription = shareIntentEvents.addListener('VS_SHARED_TEXT', (event: { text?: string }) => accept(event.text))
    void ShareIntentModule?.consumePendingText?.().then(accept).catch(() => undefined)
    return () => subscription.remove()
  }, [])

  return (
    <SafeAreaView style={styles.shell}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>{tabMeta[tab].group.toUpperCase()}</Text>
          <Text style={styles.title}>{tabMeta[tab].label}</Text>
          <Text style={styles.subtitle}>KZ VoiceShield · private on-device protection</Text>
        </View>
        <View style={[styles.badge, { borderColor: riskColor[w.analysis.risk] }]}>
          <Text style={[styles.badgeText, { color: riskColor[w.analysis.risk] }]}>{w.analysis.score}</Text>
          <Text style={styles.badgeLabel}>RISK</Text>
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
        <ScreenMotion screenKey={tab}>
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
            onOpenEmergency={() => setTab('emergency')}
            onOpenSimulator={() => setTab('simulator')}
          />
        )}
        {tab === 'review' && <ReviewView analysis={w.analysis} timelineLength={w.timeline.length} highSignals={w.highSignals} />}
        {tab === 'evidence' && <EvidenceView analysis={w.analysis} />}
        {tab === 'timeline' && <TimelineView timeline={w.timeline} />}
        {tab === 'threats' && <ThreatsView />}
        {tab === 'chain' && <AttackChainView analysis={w.analysis} />}
        {tab === 'simulator' && <SimulatorView />}
        {tab === 'emergency' && <EmergencyView trustedContactName={w.trustedContact?.name} onCallTrusted={() => { void w.callTrustedContact() }} onOpenVerify={() => setTab('verify')} />}
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
            labelledCount={w.cases.filter((item) => item.label !== 'unreviewed').length}
            datasetStageTotals={w.datasetStageTotals}
            donationConsent={w.donationConsent}
            onSetDonation={(accepted) => { void w.setDonation(accepted) }}
            onDonate={() => { void w.donateDataset() }}
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
        {tab === 'number' && (
          <NumberShieldView
            autoDeleteTranscript={w.autoDeleteTranscript}
            onSetAutoDeleteTranscript={w.updateAutoDeleteTranscript}
          />
        )}
        {tab === 'tools' && (
          <ScamToolsView initialText={sharedText} onAnalyzeAsCall={(text) => {
            w.setTranscript(text)
            w.setFileName('manual-scam-check.txt')
            setTab('review')
          }} />
        )}
        {tab === 'verify' && <VerifyView />}
        {tab === 'model' && <ModelView />}
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
        </ScreenMotion>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  shell: { backgroundColor: colors.bg, flex: 1 },
  header: { alignItems: 'center', backgroundColor: colors.card, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 15 },
  headerText: { flex: 1 },
  eyebrow: { color: colors.brand, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: colors.ink, fontSize: 24, fontWeight: '900', marginTop: 1 },
  subtitle: { color: colors.sub, fontSize: 11, marginTop: 2 },
  badge: { alignItems: 'center', backgroundColor: colors.softBrand, borderRadius: 8, borderWidth: 2, height: 54, justifyContent: 'center', width: 58 },
  badgeText: { fontSize: 21, fontWeight: '900', lineHeight: 24 },
  badgeLabel: { color: colors.sub, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  tabs: { gap: 7, paddingHorizontal: 14, paddingVertical: 10 },
  tab: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  tabActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  tabText: { color: colors.sub, fontSize: 12, fontWeight: '800' },
  tabTextActive: { color: '#fff' },
  content: { padding: 16, paddingBottom: 40 },
})
