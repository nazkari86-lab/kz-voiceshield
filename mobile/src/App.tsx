import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SetupScreen } from '@screens/SetupScreen'
import { OnboardingScreen } from '@screens/OnboardingScreen'
import { useWorkspace } from '@hooks/useWorkspace'
import { LiveAlertModule } from './bridge/LiveAlertBridge'
import { riskColor } from './theme'
import { ThemeProvider, useTheme } from './ThemeContext'
import { I18nProvider } from './I18nContext'
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
import { StatsView, recordSession } from './components/StatsView'
import { NumberShieldView } from './components/NumberShieldView'
import { ScamToolsView } from './components/ScamToolsView'
import { SmsScannerView } from './components/SmsScannerView'
import { TranscriptHistoryView } from './components/TranscriptHistoryView'
import { LLMAssistantView } from './components/LLMAssistantView'
import { ProtectionWalkthroughView } from './components/ProtectionWalkthroughView'
import { EmergencyView } from './components/EmergencyView'
import { ScreenMotion } from './components/ScreenMotion'
import { VoiceMessageView } from './components/VoiceMessageView'
import { MotionPressable } from './components/MotionPressable'
import { ShareIntentModule, shareIntentEvents } from './bridge/ShareIntentBridge'
import { VoiceMessageModule, voiceMessageEvents } from './bridge/VoiceMessageBridge'
import { useOnDeviceAiRuntime } from './hooks/useOnDeviceAiRuntime'
import { useLiveAiAnalysis } from './hooks/useLiveAiAnalysis'
import { buildKazakhIntelligenceContext } from './utils/kazakhIntelligence'
import { useI18n } from './I18nContext'

type Tab =
  | 'live' | 'review' | 'evidence' | 'timeline' | 'threats' | 'chain'
  | 'simulator' | 'emergency' | 'cases' | 'operations' | 'dataset'
  | 'playbook' | 'family' | 'verify' | 'number' | 'tools' | 'voiceMsg'
  | 'model' | 'setup' | 'stats' | 'sms' | 'history' | 'llm'
  | 'demo'

const primaryTabs: Array<[Tab, string, string]> = [
  ['live', 'Shield', 'LIVE'],
  ['tools', 'Scan', 'SCAN'],
  ['demo', 'Walkthrough', 'RUN'],
  ['simulator', 'Learn', 'LAB'],
  ['cases', 'Cases', 'CASE'],
]

const toolTabs: Array<[Tab, string, string]> = [
  ['demo', 'Protection walkthrough', 'Run the complete protection workflow with synthetic data'],
  ['review', 'Case review', 'Explain live risk, evidence and response steps'],
  ['evidence', 'Evidence & signals', 'Inspect matched signals and device context'],
  ['timeline', 'Incident timeline', 'Follow risk escalation sentence by sentence'],
  ['threats', 'Threat library', 'Explore active fraud patterns'],
  ['chain', 'Attack sequence', 'See the manipulation sequence'],
  ['emergency', 'Emergency', 'Recover after sharing information'],
  ['voiceMsg', 'Voice messages', 'Transcribe forwarded audio locally'],
  ['operations', 'Operations', 'Reviewer queues and escalation'],
  ['dataset', 'Training dataset', 'Quality and export controls'],
  ['playbook', 'Playbook', 'Response playbooks'],
  ['family', 'Family', 'Trusted contact protection'],
  ['number', 'Number shield', 'Local call-safety controls'],
  ['verify', 'Verify', 'Official callback directory'],
  ['model', 'Models & data', 'Transparent detector details'],
  ['stats', 'Statistics', 'Session and case analytics'],
  ['sms', 'SMS scanner', 'Scan SMS for scam patterns'],
  ['history', 'Call history', 'Transcript history and past calls'],
  ['llm', 'AI analysis', 'Ask a local or connected AI about suspicious calls'],
  ['setup', 'Setup', 'Privacy, model and device access'],
]

const tabMeta: Record<Tab, { label: string; group: string }> = {
  demo: { label: 'Protection walkthrough', group: 'Learn' },
  live: { label: 'Live shield', group: 'Protect' }, review: { label: 'Review', group: 'Investigate' },
  evidence: { label: 'Evidence', group: 'Investigate' }, timeline: { label: 'Timeline', group: 'Investigate' },
  threats: { label: 'Threat lab', group: 'Learn' }, chain: { label: 'Attack chain', group: 'Learn' },
  simulator: { label: 'Simulator', group: 'Learn' }, emergency: { label: 'Emergency', group: 'Recover' },
  cases: { label: 'Cases', group: 'Workspace' }, operations: { label: 'Operations', group: 'Workspace' },
  dataset: { label: 'Dataset', group: 'Workspace' }, playbook: { label: 'Playbook', group: 'Learn' },
  family: { label: 'Family', group: 'Protect' }, verify: { label: 'Verify', group: 'Protect' },
  number: { label: 'Number shield', group: 'Protect' }, tools: { label: 'Scam tools', group: 'Investigate' },
  voiceMsg: { label: 'Voice message', group: 'Investigate' }, model: { label: 'Data & model', group: 'Workspace' },
  stats: { label: 'Statistics', group: 'Workspace' },
  sms: { label: 'SMS scanner', group: 'Protect' },
  history: { label: 'Call history', group: 'Investigate' },
  llm: { label: 'AI assistant', group: 'Investigate' },
  setup: { label: 'Setup', group: 'Workspace' },
}

const ONBOARDING_KEY = 'voiceshield.onboarding-done.v1'

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <I18nProvider>
          <AppContent />
        </I18nProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}

function AppContent() {
  const { colors } = useTheme()
  const { t } = useI18n()
  const [tab, setTab] = useState<Tab>('live')
  const [sharedText, setSharedText] = useState('')
  const [pendingSharedAudio, setPendingSharedAudio] = useState(false)
  const [hubOpen, setHubOpen] = useState(false)
  const [onboardingDone, setOnboardingDone] = useState(true)
  const lastAlertRiskRef = useRef<string>('')
  const ai = useOnDeviceAiRuntime()
  const w = useWorkspace(ai)
  const { isListening, startListening } = w
  const liveLanguageContext = useMemo(() => [
    w.ksc2LanguageContext,
    buildKazakhIntelligenceContext(w.transcriptEnhancement, ai.engine, ai.modelName),
  ].filter(Boolean).join(' '), [ai.engine, ai.modelName, w.ksc2LanguageContext, w.transcriptEnhancement])
  const liveAi = useLiveAiAnalysis({
    ai,
    transcript: w.analysisTranscript,
    languageContext: liveLanguageContext,
    isListening: w.isListening,
    ruleRisk: w.analysis.risk,
    ruleScore: w.analysis.score,
    ramBytes: w.modelStorage?.ramBytes ?? 0,
  })
  const selectTab = (next: Tab) => { setHubOpen(false); setTab(next) }
  const primaryLabel = (key: Tab) => key === 'live' ? t.nav.live : key === 'tools' ? t.nav.scan : key === 'simulator' ? t.nav.learn : key === 'cases' ? t.nav.cases : t.nav.more

  // Check if onboarding has been completed
  useEffect(() => {
    void AsyncStorage.getItem(ONBOARDING_KEY).then((value) => {
      setOnboardingDone(value === 'done')
    }).catch(() => setOnboardingDone(true))
  }, [])

  useEffect(() => {
    const activate = () => {
      selectTab('live')
      if (!isListening) void startListening()
    }
    const sub = shareIntentEvents.addListener('VS_OPEN_LIVE_PROTECTION', activate)
    void ShareIntentModule?.consumePendingLiveShield?.().then((pending) => { if (pending) activate() }).catch(() => undefined)
    return () => sub.remove()
  }, [isListening, startListening])

  useEffect(() => {
    if (w.hydrated && !w.privacyConsent) selectTab('setup')
  }, [w.hydrated, w.privacyConsent])

  // Fire live alert notification when risk escalates to critical/high during active session
  useEffect(() => {
    if (!w.isListening) { lastAlertRiskRef.current = ''; return }
    const risk = w.analysis.risk
    const prev = lastAlertRiskRef.current
    if ((risk === 'critical' || risk === 'high') && prev !== risk) {
      LiveAlertModule?.showThreatAlert(risk, w.analysis.score, w.analysis.schemeLabel)
    }
    if (risk === 'low' || risk === 'medium') LiveAlertModule?.cancelAlert()
    lastAlertRiskRef.current = risk
  }, [w.isListening, w.analysis.risk, w.analysis.score, w.analysis.schemeLabel])

  // Record session when listening starts
  const prevListeningRef = useRef(false)
  useEffect(() => {
    if (w.isListening && !prevListeningRef.current) { void recordSession() }
    prevListeningRef.current = w.isListening
  }, [w.isListening])

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
      {tab === 'live' && <LiveView analysis={w.analysis} rawAnalysis={w.rawAnalysis} modelCorrection={w.modelCorrection} transcript={w.transcript} enhancement={w.transcriptEnhancement} source={w.source} isListening={w.isListening} audioLevel={w.audioLevel} error={w.captureError} notice={w.captureNotice} callStatus={w.callStatus} storageError={w.storageError} trustedContactName={w.trustedContact?.name} callbackWarning={w.callbackInfo?.warning} liveAi={liveAi} onChangeTranscript={w.setTranscript} onToggleListening={() => { void (w.isListening ? w.stopListening() : w.startListening()) }} onUseMicrophoneFallback={() => { void w.switchToMicrophoneFallback() }} onEndCall={w.endActiveCall} onSave={w.saveCurrentCase} onExportReport={w.exportReport} onCallTrusted={() => { void w.callTrustedContact() }} onOpenEmergency={() => selectTab('emergency')} onOpenSimulator={() => selectTab('simulator')} onOpenAi={() => selectTab('llm')} />}
      {tab === 'review' && <ReviewView analysis={w.analysis} rawAnalysis={w.rawAnalysis} modelCorrection={w.modelCorrection} enhancement={w.transcriptEnhancement} highSignals={w.highSignals} pressureAnalysis={w.pressureAnalysis} semanticMatches={w.semanticMatches} callbackInfo={w.callbackInfo} repeatBonus={w.repeatBonusData ?? undefined} llmAutoAnalysis={liveAi.result?.raw ?? w.llmAutoAnalysis} captureCompleteness={w.captureCompleteness} onOpenEvidence={() => selectTab('evidence')} onOpenTimeline={() => selectTab('timeline')} onOpenChain={() => selectTab('chain')} />}
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
      {tab === 'stats' && <StatsView cases={w.cases} />}
      {tab === 'sms' && <SmsScannerView />}
      {tab === 'history' && <TranscriptHistoryView />}
      {tab === 'llm' && <LLMAssistantView transcript={w.analysisTranscript} languageContext={w.ksc2LanguageContext} ai={ai} />}
      {tab === 'demo' && <ProtectionWalkthroughView
        onOpenReview={(transcript) => { w.setTranscript(transcript); w.setFileName('protection-walkthrough.txt'); selectTab('review') }}
        onOpenAi={(transcript) => { w.setTranscript(transcript); w.setFileName('protection-walkthrough.txt'); selectTab('llm') }}
        onOpenEmergency={() => selectTab('emergency')}
      />}
      {tab === 'model' && <ModelView />}
      {tab === 'setup' && <SetupScreen modelReady={w.modelReady} modelProgress={w.modelProgress} modelSizePref={w.modelSizePref} modelStorage={w.modelStorage} privacyConsent={w.privacyConsent} storageError={w.storageError} callStatus={w.callStatus} caseCount={w.cases.length} onPrepareWhisper={() => { void w.prepareWhisper() }} onSetModelSize={w.updateModelSize} onAcceptPrivacy={w.acceptPrivacy} onDeclinePrivacy={w.declinePrivacy} onDeleteAllData={w.deleteAllLocalData} />}
    </>
  )

  if (!onboardingDone) {
    return (
      <OnboardingScreen onDone={() => {
        void AsyncStorage.setItem(ONBOARDING_KEY, 'done')
        setOnboardingDone(true)
      }} />
    )
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ backgroundColor: colors.bg, flex: 1 }}>
      <View style={{ alignItems: 'center', backgroundColor: colors.brandDark, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 17 }}>
        <View style={styles.headerText}>
          <Text style={styles.brand}>KZ VOICESHIELD</Text>
          <Text style={styles.title}>{hubOpen ? t.app.tagline : tabMeta[tab].label}</Text>
          <Text style={styles.subtitle}>{hubOpen ? t.nav.more : tabMeta[tab].group.toUpperCase()}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: riskColor[w.analysis.risk] }]}><Text style={styles.badgeText}>{w.analysis.score}</Text><Text style={styles.badgeLabel}>{t.risk[w.analysis.risk]}</Text></View>
      </View>

      <View style={{ backgroundColor: colors.card, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', gap: 4, paddingHorizontal: 10, paddingVertical: 8 }}>
        {primaryTabs.map(([key, , glyph]) => {
          const active = !hubOpen && tab === key
          return <Pressable key={key} onPress={() => selectTab(key)} style={[styles.navItem, active && { backgroundColor: colors.softBrand }]}><Text style={[styles.navGlyph, { color: active ? colors.brandDark : colors.muted }]}>{glyph}</Text><Text style={[styles.navText, { color: active ? colors.brandDark : colors.sub, fontWeight: active ? '900' : '800' }]}>{primaryLabel(key)}</Text></Pressable>
        })}
        {(() => { const active = !primaryActive || hubOpen; return <Pressable onPress={() => setHubOpen((current) => !current)} style={[styles.navItem, active && { backgroundColor: colors.softBrand }]}><Text style={[styles.navGlyph, { color: active ? colors.brandDark : colors.muted }]}>ALL</Text><Text style={[styles.navText, { color: active ? colors.brandDark : colors.sub, fontWeight: active ? '900' : '800' }]}>{t.nav.more}</Text></Pressable> })()}
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenMotion screenKey={hubOpen ? 'hub' : tab}>
          {hubOpen ? (
            <View>
              <View style={{ backgroundColor: colors.brandDark, borderRadius: 8, gap: 7, marginBottom: 14, padding: 18 }}><Text style={styles.hubEyebrow}>WORKSPACE</Text><Text style={styles.hubTitle}>Everything else, clearly organized.</Text><Text style={styles.hubCopy}>Choose a tool for investigation, recovery, reviewers or device setup.</Text></View>
              <View style={styles.toolGrid}>{toolTabs.map(([key, label, copy]) => <MotionPressable key={key} onPress={() => selectTab(key)} style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, flexBasis: '48%', flexGrow: 1, gap: 5, minHeight: 136, padding: 13 }}><Text style={{ color: colors.brand, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 }}>{tabMeta[key].group.toUpperCase()}</Text><Text style={{ color: colors.ink, fontSize: 14, fontWeight: '900' }}>{label}</Text><Text style={{ color: colors.sub, fontSize: 11, lineHeight: 16 }}>{copy}</Text><Text style={{ color: colors.brandDark, fontSize: 9, fontWeight: '900', letterSpacing: 0.8, marginTop: 'auto' }}>OPEN</Text></MotionPressable>)}</View>
            </View>
          ) : content}
        </ScreenMotion>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  headerText: { flex: 1 },
  brand: { color: '#8fe0bd', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: '#fff', fontSize: 25, fontWeight: '900', marginTop: 2 },
  subtitle: { color: '#b7d8c8', fontSize: 10, fontWeight: '900', letterSpacing: 0.8, marginTop: 3 },
  badge: { alignItems: 'center', borderRadius: 8, height: 54, justifyContent: 'center', width: 58 },
  badgeText: { color: '#fff', fontSize: 21, fontWeight: '900', lineHeight: 24 },
  badgeLabel: { color: '#fff', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  navItem: { alignItems: 'center', borderRadius: 7, flex: 1, gap: 2, paddingVertical: 7 },
  navGlyph: { fontSize: 9, fontWeight: '900', letterSpacing: 0.4 },
  navText: { fontSize: 10, fontWeight: '800' },
  content: { padding: 16, paddingBottom: 36 },
  hubEyebrow: { color: '#8fe0bd', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  hubTitle: { color: '#fff', fontSize: 23, fontWeight: '900', lineHeight: 29 },
  hubCopy: { color: '#c1dfd0', fontSize: 13, lineHeight: 19 },
  toolGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
})
