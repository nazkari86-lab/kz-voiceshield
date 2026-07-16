import React, { useEffect, useRef, useState } from 'react'
import { Alert, Animated, Easing, StyleSheet, Text, TextInput, View } from 'react-native'
import { WaveformView } from './WaveformView'
import type { Analysis } from '@scoring'
import { colors, riskColor } from '../theme'
import { Card, RiskBadge } from './ui'
import { MotionPressable } from './MotionPressable'
import { LiveAiPanel } from './LiveAiPanel'
import { useI18n } from '../I18nContext'
import type { LiveAiAnalysisController } from '../hooks/useLiveAiAnalysis'
import type { TranscriptEnhancement } from '../utils/transcriptEnhancer'

type Props = {
  analysis: Analysis
  transcript: string
  enhancement: TranscriptEnhancement
  source: string
  isListening: boolean
  audioLevel: number
  error: string | null
  notice: string | null
  callStatus: string
  storageError: string | null
  trustedContactName?: string
  callbackWarning?: string | null
  liveAi: LiveAiAnalysisController
  onChangeTranscript: (text: string) => void
  onToggleListening: () => void
  onSave: () => void
  onExportReport: () => void
  onCallTrusted: () => void
  onOpenEmergency: () => void
  onOpenSimulator: () => void
  onOpenAi: () => void
  onUseMicrophoneFallback: () => void
  onEndCall: () => Promise<boolean>
}

export function LiveView({ analysis, transcript, enhancement, source, isListening, audioLevel, error, notice, callStatus, storageError, trustedContactName, callbackWarning, liveAi, onChangeTranscript, onToggleListening, onSave, onExportReport, onCallTrusted, onOpenEmergency, onOpenSimulator, onOpenAi, onUseMicrophoneFallback, onEndCall }: Props) {
  const { t } = useI18n()
  const [pauseRemaining, setPauseRemaining] = useState(0)
  const signalScale = useRef(new Animated.Value(1)).current
  const scoreFill = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (pauseRemaining <= 0) return undefined
    const timeout = setTimeout(() => setPauseRemaining((current) => current - 1), 1000)
    return () => clearTimeout(timeout)
  }, [pauseRemaining])

  useEffect(() => {
    Animated.timing(scoreFill, { duration: 480, easing: Easing.out(Easing.cubic), toValue: analysis.score / 100, useNativeDriver: false }).start()
  }, [analysis.score, scoreFill])

  useEffect(() => {
    if (!isListening) {
      signalScale.setValue(1)
      return undefined
    }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(signalScale, { duration: 900, easing: Easing.inOut(Easing.sin), toValue: 1.12, useNativeDriver: true }),
      Animated.timing(signalScale, { duration: 900, easing: Easing.inOut(Easing.sin), toValue: 1, useNativeDriver: true }),
    ]))
    loop.start()
    return () => loop.stop()
  }, [isListening, signalScale])

  // A transcript saved from a walkthrough or case review must not render an
  // active-call intervention in the idle Live Shield screen.
  const needsPause = isListening && (analysis.risk === 'critical' || analysis.risk === 'high')
  const confirmEndCall = () => Alert.alert(
    'End active call?',
    'This will disconnect the current call. Use this only when you are ready to stop the conversation.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'End call', style: 'destructive', onPress: () => { void onEndCall() } },
    ],
  )

  return (
    <View style={styles.screen}>
      <View style={styles.statusBar}>
        <Animated.View style={[styles.liveDot, isListening && { transform: [{ scale: signalScale }] }, { backgroundColor: isListening ? colors.accent : colors.muted }]} />
        <Text style={styles.statusText}>{isListening ? t.live.active : t.live.standby}</Text>
        <Text style={styles.statusSource}>{source}</Text>
      </View>
      <Card tone={analysis.risk}>
        <View style={styles.topline}>
          <RiskBadge risk={analysis.risk} />
          <Text style={styles.source}>{analysis.evidence.length} signals</Text>
        </View>
        <View style={styles.scoreRow}>
          <Text style={[styles.score, { color: riskColor[analysis.risk] }]}>{analysis.score}<Text style={styles.scoreMax}>/100</Text></Text>
          <View style={[styles.riskOrb, { borderColor: riskColor[analysis.risk] }]}><Text style={[styles.riskOrbText, { color: riskColor[analysis.risk] }]}>{analysis.risk.toUpperCase()}</Text></View>
        </View>
        <View style={styles.scoreTrack}><Animated.View style={[styles.scoreFill, { backgroundColor: riskColor[analysis.risk], width: scoreFill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} /></View>
        <Text style={styles.scheme}>{analysis.schemeLabel}</Text>
        <Text style={styles.verdict}>{analysis.verdict}</Text>
        <Text style={styles.next}>{analysis.nextAction}</Text>
        <Text style={styles.session}>{callStatus}</Text>
      {isListening && (
          <WaveformView audioLevel={audioLevel} isActive={isListening} height={32} barCount={40} />
        )}
      </Card>

      {error && <Text style={styles.error}>{error}</Text>}
      {notice && <Text style={styles.notice}>{notice}</Text>}
      {isListening && source === 'Live Caption' && (
        <MotionPressable style={styles.fallbackButton} onPress={onUseMicrophoneFallback}>
          <Text style={styles.fallbackTitle}>{t.live.noCaptionTitle}</Text>
          <Text style={styles.fallbackCopy}>{t.live.noCaptionCopy}</Text>
        </MotionPressable>
      )}
      {storageError && <Text style={styles.error}>{storageError}</Text>}
      {callbackWarning && (
        <View style={styles.callbackBanner}>
          <Text style={styles.callbackIcon}>📞</Text>
          <Text style={styles.callbackText}>{callbackWarning}</Text>
        </View>
      )}

      {analysis.contextSignals.length > 0 && (
        <View style={styles.signalRow}>
          {analysis.contextSignals.map((signal) => <Text key={signal.id} style={styles.signal}>{signal.label}</Text>)}
        </View>
      )}

      {needsPause && (
        <View style={styles.pauseCard}>
          <Text style={styles.pauseTitle}>{pauseRemaining > 0 ? `${t.live.pauseActive} ${pauseRemaining}s` : t.live.pauseTitle}</Text>
          <Text style={styles.pauseCopy}>{t.live.pauseCopy}</Text>
          <MotionPressable style={styles.pauseButton} onPress={() => setPauseRemaining(30)}><Text style={styles.pauseButtonText}>{pauseRemaining > 0 ? t.live.restartPause : t.live.startPause}</Text></MotionPressable>
          {isListening && (
            <MotionPressable style={styles.endCallButton} onPress={confirmEndCall}><Text style={styles.endCallText}>{t.live.endCall}</Text></MotionPressable>
          )}
          {trustedContactName && (
            <MotionPressable style={styles.trustedButton} onPress={onCallTrusted}><Text style={styles.trustedButtonText}>{trustedContactName}</Text></MotionPressable>
          )}
        </View>
      )}

      <View style={styles.quickGrid}>
        <MotionPressable style={styles.quickAction} onPress={onOpenEmergency}><Text style={styles.quickIcon}>!</Text><View><Text style={styles.quickTitle}>{t.live.sharedData}</Text><Text style={styles.quickCopy}>{t.live.recoveryPlan}</Text></View></MotionPressable>
        <MotionPressable style={styles.quickAction} onPress={onOpenSimulator}><Text style={styles.quickIcon}>+</Text><View><Text style={styles.quickTitle}>{t.live.practice}</Text><Text style={styles.quickCopy}>{t.live.practiceDesc}</Text></View></MotionPressable>
      </View>

      {analysis.responseChecklist.length > 0 && (
        <View style={styles.actionCard}>
          <Text style={styles.actionTitle}>{t.live.doNow}</Text>
          {analysis.responseChecklist.slice(0, 3).map((item, index) => (
            <View key={item} style={styles.actionRow}>
              <Text style={styles.actionNumber}>{index + 1}</Text>
              <Text style={styles.actionText}>{item}</Text>
            </View>
          ))}
        </View>
      )}

      <LiveAiPanel controller={liveAi} hasTranscript={transcript.trim().length > 0} onOpenAssistant={onOpenAi} />

      <View style={styles.transcriptHeading}><Text style={styles.transcriptLabel}>{t.live.transcript}</Text>{isListening && source === 'Whisper' ? <Text style={styles.transcriptState}>{audioLevel >= 0.015 ? t.live.hearsAudio : t.live.waitAudio}</Text> : null}</View>
      <TextInput
        multiline
        value={transcript}
        onChangeText={onChangeTranscript}
        placeholder={t.live.transcript}
        placeholderTextColor={colors.muted}
        style={styles.input}
      />
      <View style={styles.languageLayer}>
        <View style={styles.languageTopline}>
          <Text style={styles.languageTitle}>KSC2 LANGUAGE LAYER</Text>
          <Text style={styles.languageMeta}>{enhancement.packReady ? `v${enhancement.packVersion}` : 'bootstrap'} · {enhancement.dominantLanguage.toUpperCase()}</Text>
        </View>
        <Text style={styles.languageCopy}>
          {enhancement.packReady
            ? `${enhancement.lexiconCoverage === null ? 'No' : Math.round(enhancement.lexiconCoverage * 100)}% lexicon coverage · ${enhancement.corrections.length} transparent correction(s)`
            : 'Compact KSC2 pack is not built yet; safe Unicode normalization remains active.'}
        </Text>
        {enhancement.normalizedTranscript !== transcript.trim() && (
          <Text style={styles.normalizedPreview} numberOfLines={3}>Derived: {enhancement.normalizedTranscript}</Text>
        )}
      </View>

      <View style={styles.actions}>
        <MotionPressable style={[styles.primary, isListening && styles.stop]} onPress={onToggleListening}><Text style={styles.primaryText}>{isListening ? t.live.stop : t.live.start}</Text></MotionPressable>
        <MotionPressable style={styles.secondary} onPress={onSave}><Text style={styles.secondaryText}>{t.live.saveCase}</Text></MotionPressable>
        <MotionPressable style={styles.secondary} onPress={onExportReport}><Text style={styles.secondaryText}>{t.live.shareReport}</Text></MotionPressable>
      </View>

      {analysis.responseChecklist.slice(3).length > 0 && (
        <View style={styles.extraChecks}>
          {analysis.responseChecklist.slice(3).map((item) => <Text key={item} style={styles.check}>• {item}</Text>)}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { gap: 0 },
  statusBar: { alignItems: 'center', flexDirection: 'row', gap: 7, marginBottom: 10 },
  liveDot: { borderRadius: 5, height: 10, width: 10 },
  statusText: { color: colors.sub, flex: 1, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  statusSource: { color: colors.muted, fontSize: 10, fontWeight: '800' },
  topline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  source: { color: colors.sub, fontSize: 12, fontWeight: '700' },
  scoreRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  score: { fontSize: 54, fontWeight: '900', letterSpacing: -1 },
  scoreMax: { color: colors.muted, fontSize: 18, fontWeight: '800' },
  riskOrb: { borderRadius: 8, borderWidth: 1.5, paddingHorizontal: 9, paddingVertical: 6 },
  riskOrbText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  scoreTrack: { backgroundColor: colors.chipBg, borderRadius: 4, height: 7, overflow: 'hidden' },
  scoreFill: { borderRadius: 4, height: 7 },
  scheme: { color: colors.ink, fontSize: 17, fontWeight: '900', marginTop: 4 },
  verdict: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  next: { color: colors.sub, fontSize: 13, lineHeight: 19 },
  session: { color: colors.muted, fontSize: 11 },
  levelTrack: { backgroundColor: colors.chipBg, borderRadius: 4, height: 6, overflow: 'hidden' },
  levelFill: { backgroundColor: colors.brand, height: 6 },
  error: { backgroundColor: '#fee2e2', borderColor: '#fecaca', borderRadius: 12, borderWidth: 1, color: '#991b1b', fontSize: 13, lineHeight: 19, marginBottom: 12, padding: 12 },
  notice: { backgroundColor: '#fff7ed', borderColor: '#fdba74', borderRadius: 8, borderWidth: 1, color: '#9a3412', fontSize: 13, lineHeight: 19, marginBottom: 12, padding: 12 },
  fallbackButton: { backgroundColor: colors.softBrand, borderColor: colors.brand, borderRadius: 8, borderWidth: 1, marginBottom: 12, padding: 12 },
  fallbackTitle: { color: colors.brandDark, fontSize: 13, fontWeight: '900' },
  fallbackCopy: { color: colors.sub, fontSize: 12, marginTop: 2 },
  signalRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  signal: { backgroundColor: '#fff7ed', borderColor: '#fed7aa', borderRadius: 999, borderWidth: 1, color: '#9a3412', fontSize: 12, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 6 },
  pauseCard: { backgroundColor: '#fff7ed', borderColor: '#fb923c', borderRadius: 14, borderWidth: 1, gap: 7, marginBottom: 12, padding: 14 },
  pauseTitle: { color: '#9a3412', fontSize: 16, fontWeight: '900' },
  pauseCopy: { color: '#7c2d12', fontSize: 13, lineHeight: 18 },
  pauseButton: { alignSelf: 'flex-start', backgroundColor: '#c2410c', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  pauseButtonText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  trustedButton: { alignSelf: 'flex-start', borderColor: '#c2410c', borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  trustedButtonText: { color: '#9a3412', fontSize: 13, fontWeight: '900' },
  endCallButton: { alignSelf: 'stretch', backgroundColor: '#991b1b', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11 },
  endCallText: { color: '#fff', fontSize: 13, fontWeight: '900', textAlign: 'center' },
  quickGrid: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  quickAction: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 9, padding: 12 },
  quickIcon: { backgroundColor: colors.softBrand, borderRadius: 14, color: colors.brandDark, fontSize: 18, fontWeight: '900', height: 28, lineHeight: 28, textAlign: 'center', width: 28 },
  quickTitle: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  quickCopy: { color: colors.sub, fontSize: 10, marginTop: 1 },
  actionCard: { backgroundColor: colors.chipBg, borderColor: colors.border, borderRadius: 8, borderWidth: 1, gap: 10, marginBottom: 12, padding: 14 },
  actionTitle: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  actionRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 10 },
  actionNumber: { backgroundColor: colors.brand, borderRadius: 12, color: '#fff', fontSize: 12, fontWeight: '900', height: 24, lineHeight: 24, textAlign: 'center', width: 24 },
  actionText: { color: colors.ink, flex: 1, fontSize: 13, lineHeight: 19 },
  transcriptLabel: { color: colors.sub, fontSize: 10, fontWeight: '900', letterSpacing: 1, marginBottom: 6 },
  transcriptHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  transcriptState: { color: colors.brandDark, fontSize: 9, fontWeight: '900', letterSpacing: 0.5, marginBottom: 6 },
  input: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, color: colors.ink, marginBottom: 12, minHeight: 150, padding: 14, textAlignVertical: 'top' },
  languageLayer: { backgroundColor: colors.chipBg, borderColor: colors.border, borderRadius: 8, borderWidth: 1, gap: 5, marginBottom: 12, padding: 12 },
  languageTopline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  languageTitle: { color: colors.brandDark, fontSize: 10, fontWeight: '900', letterSpacing: 0 },
  languageMeta: { color: colors.sub, fontSize: 10, fontWeight: '800' },
  languageCopy: { color: colors.sub, fontSize: 12, lineHeight: 17 },
  normalizedPreview: { borderTopColor: colors.border, borderTopWidth: 1, color: colors.ink, fontSize: 12, lineHeight: 18, paddingTop: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  primary: { backgroundColor: colors.brand, borderRadius: 8, flexGrow: 1, paddingHorizontal: 16, paddingVertical: 13 },
  stop: { backgroundColor: colors.accent },
  primaryText: { color: '#fff', fontWeight: '900', textAlign: 'center' },
  secondary: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, flexGrow: 1, paddingHorizontal: 12, paddingVertical: 13 },
  secondaryText: { color: colors.ink, fontWeight: '800', textAlign: 'center' },
  check: { color: '#334155', fontSize: 13, lineHeight: 20 },
  extraChecks: { gap: 6, marginBottom: 8 },
  callbackBanner: { alignItems: 'center', backgroundColor: '#fef3c7', borderColor: '#fbbf24', borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 8, marginBottom: 12, padding: 12 },
  callbackIcon: { fontSize: 18 },
  callbackText: { color: '#92400e', flex: 1, fontSize: 13, fontWeight: '700', lineHeight: 18 },
})
