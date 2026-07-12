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
import { VoiceMessageView } from './components/VoiceMessageView'
import { MotionPressable } from './components/MotionPressable'
import { ShareIntentModule, shareIntentEvents } from './bridge/ShareIntentBridge'
import { VoiceMessageModule, voiceMessageEvents } from './bridge/VoiceMessageBridge'

type Tab =
  | 'live' | 'review' | 'evidence' | 'timeline' | 'threats' | 'chain'
  | 'simulator' | 'emergency' | 'cases' | 'operations' | 'dataset'
  | 'playbook' | 'family' | 'verify' | 'number' | 'tools' | 'voiceMsg'
  | 'model' | 'setup'

const primaryTabs: Array<[Tab, string, string]> = [
  ['live', 'Shield', 'LIVE'],
  ['tools', 'Scan', 'SCAN'],
  ['simulator', 'Learn', 'LAB'],
  ['cases', 'Cases', 'CASE'],
]

const toolTabs: Array<[Tab, string, string]> = [
  ['review', 'Review', 'Explain live risk and response steps'],
  ['evidence', 'Evidence', 'Inspect matched signals and context'],
  ['timeline', 'Timeline', 'Follow risk escalation over time'],
  ['threats', 'Threat lab', 'Explore active fraud patterns'],
  ['chain', 'Attack chain', 'See the manipulation sequence'],
  ['emergency', 'Emergency', 'Recover after sharing information'],
  ['voiceMsg', 'Voice messages', 'Transcribe forwarded audio locally'],
  ['operations', 'Operations', 'Reviewer queues and escalation'],
  ['dataset', 'Dataset', 'Quality and export controls'],
  ['playbook', 'Playbook', 'Response playbooks'],
  ['family', 'Family', 'Trusted contact protection'],
  ['number', 'Number shield', 'Local call-safety controls'],
  ['verify', 'Verify', 'Official callback directory'],
  ['model', 'Data & model', 'Transparent detector details'],
  ['setup', 'Setup', 'Privacy, model and device access'],
]

const tabMeta: Record<Tab, { label: string; group: string }> = {
  live: { label: 'Live shield', group: 'Protect' }, review: { label: 'Review', group: 'Investigate' },
  evidence: { label: 'Evidence', group: 'Investigate' }, timeline: { label: 'Timeline', group: 'Investigate' },
  threats: { label: 'Threat lab', group: 'Learn' }, chain: { label: 'Attack chain', group: 'Learn' },
  simulator: { label: 'Simulator', group: 'Learn' }, emergency: { label: 'Emergency', group: 'Recover' },
  cases: { label: 'Cases', group: 'Workspace' }, operations: { label: 'Operations', group: 'Workspace' },
  dataset: { label: 'Dataset', group: 'Workspace' }, playbook: { label: 'Playbook', group: 'Learn' },
  family: { label: 'Family', group: 'Protect' }, verify: { label: 'Verify', group: 'Protect' },
  number: { label: 'Number shield', group: 'Protect' }, tools: { label: 'Scam tools', group: 'Investigate' },
  voiceMsg: { label: 'Voice message', group: 'Investigate' }, model: { label: 'Data & model', group: 'Workspace' },
  setup: { label: 'Setup', group: 'Workspace' },
}

export default function App() {
  const [tab, setTab] = useState<Tab>('live')
  const [sharedText, setSharedText] = useState('')
  const [pendingSharedAudio, setPendingSharedAudio] = useState(false)
  const [hubOpen, setHubOpen] = useState(false)
  const w = useWorkspace()
  const selectTab = (next: Tab) => { setHubOpen(false); setTab(next) }

  useEffect(() => {
    if (w.hydrated && !w.privacyConsent) selectTab('setup')
  }, [w.hydrated, w.privacyConsent])

  useEffect(() => {
    const accept = (text?: string | null) => {
      if (!text) return
      setSharedText(text)
      selectTab('tools')
    }
    const sub = shareIntentEvents.addListener('VS_SHARED_TEXT', (event: { text?: string }) => accept(event.text))
    void ShareIntentModule?.consumePendingText?.().then(accept).catch(() => undefined)
    return () => sub.remove()
  }, [])

  useEffect(() => {
    const sub = voiceMessageEvents.addListener('VS_SHARED_AUDIO', () => {
      setPendingSharedAudio(true)
      selectTab('voiceMsg')
    })
    return () => sub.remove()
  }, [])

  useEffect(() => {
    void VoiceMessageModule?.consumePendingAudio?.().then((hasPending) => {
      if (!hasPending) return
      setPendingSharedAudio(true)
      selectTab('voiceMsg')
    }).catch(() => undefined)
  }, [])

  const primaryActive = primaryTabs.some(([key]) => key === tab) && !hubOpen
  const content = (
    <>
      {tab === 'live' && <LiveView analysis={w.analysis} transcript={w.transcript} source={w.source} isListening={w.isListening} audioLevel={w.audioLevel} error={w.captureError} notice={w.captureNotice} callStatus={w.callStatus} storageError={w.storageError} trustedContactName={w.trustedContact?.name} onChangeTranscript={w.setTranscript} onToggleListening={() => { void (w.isListening ? w.stopListening() : w.startListening()) }} onSave={w.saveCurrentCase} onExportReport={w.exportReport} onCallTrusted={() => { void w.callTrustedContact() }} onOpenEmergency={() => selectTab('emergency')} onOpenSimulator={() => selectTab('simulator')} />}
      {tab === 'review' && <ReviewView analysis={w.analysis} timelineLength={w.timeline.length} highSignals={w.highSignals} />}
      {tab === 'evidence' && <EvidenceView analysis={w.analysis} />}
      {tab === 'timeline' && <TimelineView timeline={w.timeline} />}
      {tab === 'threats' && <ThreatsView />}
      {tab === 'chain' && <AttackChainView analysis={w.analysis} />}
      {tab === 'simulator' && <SimulatorView />}
      {tab === 'emergency' && <EmergencyView trustedContactName={w.trustedContact?.name} onCallTrusted={() => { void w.callTrustedContact() }} onOpenVerify={() => selectTab('verify')} />}
      {tab === 'cases' && <CasesView cases={w.cases} onSaveCurrent={w.saveCurrentCase} onLoadCase={(item) => { w.loadCase(item); selectTab('review') }} onUpdateLabel={w.updateCaseLabel} onUpdateStatus={w.updateCaseStatus} onToggleFlag={w.toggleCaseFlag} onExportBundle={w.exportEvidenceBundle} onDeleteCase={w.deleteCase} />}
      {tab === 'operations' && <OperationsView operations={w.operations} onLoadCase={(item) => { w.loadCase(item); selectTab('review') }} onUpdateStatus={w.updateCaseStatus} onToggleFlag={w.toggleCaseFlag} onExportBundle={w.exportEvidenceBundle} />}
      {tab === 'dataset' && <DatasetView quality={w.quality} caseCount={w.cases.length} labelledCount={w.cases.filter((item) => item.label !== 'unreviewed').length} datasetStageTotals={w.datasetStageTotals} donationConsent={w.donationConsent} onSetDonation={(accepted) => { void w.setDonation(accepted) }} onDonate={() => { void w.donateDataset() }} onExportJsonl={w.exportJsonlCases} onExportCsv={w.exportCsvCases} onExportSplit={w.exportSplitCases} onClear={w.clearCases} />}
      {tab === 'playbook' && <PlaybookView />}
      {tab === 'family' && <FamilyView contact={w.trustedContact} privacyConsent={w.privacyConsent} onSave={w.saveTrustedContact} onClear={w.clearTrustedContact} onCall={w.callTrustedContact} onShareAlert={w.shareTrustedAlert} />}
      {tab === 'number' && <NumberShieldView autoDeleteTranscript={w.autoDeleteTranscript} onSetAutoDeleteTranscript={w.updateAutoDeleteTranscript} />}
      {tab === 'tools' && <ScamToolsView initialText={sharedText} onAnalyzeAsCall={(text) => { w.setTranscript(text); w.setFileName('manual-scam-check.txt'); selectTab('review') }} />}
      {tab === 'voiceMsg' && <VoiceMessageView modelReady={w.modelReady} pendingSharedAudio={pendingSharedAudio} onClearSharedAudio={() => setPendingSharedAudio(false)} onAnalyzeAsCall={(transcript) => { w.setTranscript(transcript); w.setFileName('voice-message.ogg'); selectTab('review') }} />}
      {tab === 'verify' && <VerifyView />}
      {tab === 'model' && <ModelView />}
      {tab === 'setup' && <SetupScreen modelReady={w.modelReady} modelProgress={w.modelProgress} privacyConsent={w.privacyConsent} storageError={w.storageError} callStatus={w.callStatus} caseCount={w.cases.length} onPrepareWhisper={() => { void w.prepareWhisper() }} onAcceptPrivacy={w.acceptPrivacy} onDeclinePrivacy={w.declinePrivacy} onDeleteAllData={w.deleteAllLocalData} />}
    </>
  )

  return (
    <SafeAreaView style={styles.shell}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.brand}>KZ VOICESHIELD</Text>
          <Text style={styles.title}>{hubOpen ? 'Protection center' : tabMeta[tab].label}</Text>
          <Text style={styles.subtitle}>{hubOpen ? 'ALL PROTECTION, REVIEW AND RECOVERY TOOLS' : tabMeta[tab].group.toUpperCase()}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: riskColor[w.analysis.risk] }]}><Text style={styles.badgeText}>{w.analysis.score}</Text><Text style={styles.badgeLabel}>RISK</Text></View>
      </View>

      <View style={styles.navigation}>
        {primaryTabs.map(([key, label, glyph]) => <Pressable key={key} onPress={() => selectTab(key)} style={[styles.navItem, !hubOpen && tab === key && styles.navItemActive]}><Text style={[styles.navGlyph, !hubOpen && tab === key && styles.navGlyphActive]}>{glyph}</Text><Text style={[styles.navText, !hubOpen && tab === key && styles.navTextActive]}>{label}</Text></Pressable>)}
        <Pressable onPress={() => setHubOpen((current) => !current)} style={[styles.navItem, (!primaryActive || hubOpen) && styles.navItemActive]}><Text style={[styles.navGlyph, (!primaryActive || hubOpen) && styles.navGlyphActive]}>ALL</Text><Text style={[styles.navText, (!primaryActive || hubOpen) && styles.navTextActive]}>More</Text></Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenMotion screenKey={hubOpen ? 'hub' : tab}>
          {hubOpen ? (
            <View>
              <View style={styles.hubHero}><Text style={styles.hubEyebrow}>WORKSPACE</Text><Text style={styles.hubTitle}>Everything else, clearly organized.</Text><Text style={styles.hubCopy}>Choose a tool for investigation, recovery, reviewers or device setup.</Text></View>
              <View style={styles.toolGrid}>{toolTabs.map(([key, label, copy]) => <MotionPressable key={key} onPress={() => selectTab(key)} style={styles.toolCard}><Text style={styles.toolGroup}>{tabMeta[key].group.toUpperCase()}</Text><Text style={styles.toolTitle}>{label}</Text><Text style={styles.toolCopy}>{copy}</Text><Text style={styles.toolArrow}>OPEN</Text></MotionPressable>)}</View>
            </View>
          ) : content}
        </ScreenMotion>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  shell: { backgroundColor: colors.bg, flex: 1 },
  header: { alignItems: 'center', backgroundColor: colors.brandDark, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 17 },
  headerText: { flex: 1 },
  brand: { color: '#8fe0bd', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: '#fff', fontSize: 25, fontWeight: '900', marginTop: 2 },
  subtitle: { color: '#b7d8c8', fontSize: 10, fontWeight: '900', letterSpacing: 0.8, marginTop: 3 },
  badge: { alignItems: 'center', borderRadius: 8, height: 54, justifyContent: 'center', width: 58 },
  badgeText: { color: '#fff', fontSize: 21, fontWeight: '900', lineHeight: 24 },
  badgeLabel: { color: '#fff', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  navigation: { backgroundColor: colors.card, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', gap: 4, paddingHorizontal: 10, paddingVertical: 8 },
  navItem: { alignItems: 'center', borderRadius: 7, flex: 1, gap: 2, paddingVertical: 7 },
  navItemActive: { backgroundColor: colors.softBrand },
  navGlyph: { color: colors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 0.4 },
  navGlyphActive: { color: colors.brandDark },
  navText: { color: colors.sub, fontSize: 10, fontWeight: '800' },
  navTextActive: { color: colors.brandDark, fontWeight: '900' },
  content: { padding: 16, paddingBottom: 36 },
  hubHero: { backgroundColor: colors.brandDark, borderRadius: 8, gap: 7, marginBottom: 14, padding: 18 },
  hubEyebrow: { color: '#8fe0bd', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  hubTitle: { color: '#fff', fontSize: 23, fontWeight: '900', lineHeight: 29 },
  hubCopy: { color: '#c1dfd0', fontSize: 13, lineHeight: 19 },
  toolGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  toolCard: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, flexBasis: '48%', flexGrow: 1, gap: 5, minHeight: 136, padding: 13 },
  toolGroup: { color: colors.brand, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  toolTitle: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  toolCopy: { color: colors.sub, fontSize: 11, lineHeight: 16 },
  toolArrow: { color: colors.brandDark, fontSize: 9, fontWeight: '900', letterSpacing: 0.8, marginTop: 'auto' },
})
