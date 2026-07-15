import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Animated, Easing, StyleSheet, Text, View } from 'react-native'
import { analyzeTranscript } from '@scoring'
import { enhanceTranscript } from '../utils/transcriptEnhancer'
import { colors, riskColor, riskLabel } from '../theme'
import { VoiceMessageModule } from '../bridge/VoiceMessageBridge'
import { MotionPressable } from './MotionPressable'
import type { CloudSpeechModelConfig } from '../data/cloudAiProviders'
import { getActiveCloudSpeechModel, hasProviderApiKey, transcribeCloudAudio } from '../services/cloudAiClient'

type Phase =
  | { kind: 'idle' }
  | { kind: 'picking' }
  | { kind: 'transcribing'; elapsed: number }
  | { kind: 'result'; transcript: string; durationMs: number; sampleCount: number }
  | { kind: 'error'; message: string }

type Props = {
  modelReady: boolean
  pendingSharedAudio: boolean
  onAnalyzeAsCall: (transcript: string) => void
  onClearSharedAudio: () => void
}

export function VoiceMessageView({ modelReady, pendingSharedAudio, onAnalyzeAsCall, onClearSharedAudio }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [elapsed, setElapsed] = useState(0)
  const [cloudSpeechModel, setCloudSpeechModel] = useState<CloudSpeechModelConfig | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const spin = useRef(new Animated.Value(0)).current

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    setElapsed(0)
  }, [])

  const startTimer = useCallback(() => {
    setElapsed(0)
    timerRef.current = setInterval(() => setElapsed((n) => n + 1), 1000)
  }, [])

  useEffect(() => {
    if (phase.kind === 'transcribing') {
      Animated.loop(Animated.timing(spin, { duration: 1200, easing: Easing.linear, toValue: 1, useNativeDriver: true })).start()
    } else {
      spin.stopAnimation()
      spin.setValue(0)
    }
  }, [phase.kind, spin])

  useEffect(() => () => { stopTimer() }, [stopTimer])

  useEffect(() => {
    void getActiveCloudSpeechModel().then(async (config) => {
      if (config && await hasProviderApiKey(config.providerId)) setCloudSpeechModel(config)
      else setCloudSpeechModel(null)
    }).catch(() => setCloudSpeechModel(null))
  }, [])

  const transcribe = useCallback(async (source: 'pick' | 'call-recording' | 'pending') => {
    if (!VoiceMessageModule) {
      setPhase({ kind: 'error', message: 'Voice message transcription is available in the Android app.' })
      return
    }
    if (!modelReady) {
      setPhase({ kind: 'error', message: 'Download the Whisper model in Setup to enable voice message transcription.' })
      return
    }
    setPhase(source === 'pending' ? { kind: 'transcribing', elapsed: 0 } : { kind: 'picking' })
    if (source === 'pending') startTimer()
    try {
      const result = source === 'pick'
        ? await VoiceMessageModule.pickAndTranscribe('ru')
        : source === 'call-recording'
          ? await VoiceMessageModule.pickCallRecordingAndTranscribe('ru')
          : await VoiceMessageModule.transcribePendingAudio('ru')
      stopTimer()
      onClearSharedAudio()
      if (!result) { setPhase({ kind: 'idle' }); return }
      setPhase({ kind: 'result', transcript: result.transcript, durationMs: result.durationMs, sampleCount: result.sampleCount })
    } catch (err) {
      stopTimer()
      const msg = err instanceof Error ? err.message : 'Could not transcribe this audio.'
      if (msg.includes('CANCELLED') || msg.includes('AUDIO_PICK_CANCELLED')) {
        setPhase({ kind: 'idle' })
      } else {
        setPhase({ kind: 'error', message: msg })
      }
    }
  }, [modelReady, onClearSharedAudio, startTimer, stopTimer])

  const transcribeWithCloud = useCallback(async () => {
    if (!VoiceMessageModule || !cloudSpeechModel) return
    setPhase({ kind: 'picking' })
    const startedAt = Date.now()
    try {
      const uri = await VoiceMessageModule.pickAudioUri()
      setPhase({ kind: 'transcribing', elapsed: 0 })
      const result = await transcribeCloudAudio(cloudSpeechModel, uri, 'voice-message.ogg', 'audio/ogg', 'kk')
      setPhase({ kind: 'result', transcript: result.transcript, durationMs: Date.now() - startedAt, sampleCount: 0 })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not transcribe this audio with the cloud model.'
      if (msg.includes('CANCELLED') || msg.includes('AUDIO_PICK_CANCELLED')) setPhase({ kind: 'idle' })
      else setPhase({ kind: 'error', message: msg })
    }
  }, [cloudSpeechModel])

  // Auto-transcribe when another app shares audio
  useEffect(() => {
    if (pendingSharedAudio && phase.kind === 'idle') void transcribe('pending')
  }, [pendingSharedAudio, phase.kind, transcribe])

  const enhancement = phase.kind === 'result' ? enhanceTranscript(phase.transcript) : null
  const analysis = enhancement ? analyzeTranscript(enhancement.normalizedTranscript, {}) : null
  const isIdle = phase.kind === 'idle' || phase.kind === 'error'
  const isBusy = phase.kind === 'picking' || phase.kind === 'transcribing'

  const spinInterpolate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.heroEyebrow}>FORWARDED AUDIO</Text>
        <Text style={styles.heroTitle}>Inspect a voice message privately</Text>
        <Text style={styles.heroCopy}>Share audio from WhatsApp or Telegram, or select a file. Transcription and fraud analysis stay on this device.</Text>
      </View>

      <View style={styles.capabilityRow}><View style={styles.capability}><Text style={styles.capabilityValue}>LOCAL</Text><Text style={styles.capabilityLabel}>processing</Text></View><View style={styles.capability}><Text style={styles.capabilityValue}>5 MIN</Text><Text style={styles.capabilityLabel}>maximum file</Text></View><View style={styles.capability}><Text style={styles.capabilityValue}>RU/KZ</Text><Text style={styles.capabilityLabel}>speech support</Text></View></View>

      {pendingSharedAudio && phase.kind === 'idle' && (
        <View style={styles.sharedBanner}>
          <Text style={styles.sharedText}>A shared audio message is waiting — starting transcription…</Text>
        </View>
      )}

      {phase.kind === 'error' && (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Could not transcribe</Text>
          <Text style={styles.errorText}>{phase.message}</Text>
          <MotionPressable onPress={() => setPhase({ kind: 'idle' })} style={styles.retryBtn}><Text style={styles.retryText}>Try again</Text></MotionPressable>
        </View>
      )}

      {isBusy && (
        <View style={styles.busyBox}>
          <Animated.Text style={[styles.spinner, { transform: [{ rotate: spinInterpolate }] }]}>◌</Animated.Text>
          <Text style={styles.busyTitle}>
            {phase.kind === 'picking' ? 'Reading audio on this device…' : 'Transcribing on this device…'}
          </Text>
          {elapsed > 0 && <Text style={styles.busyTimer}>{elapsed}s elapsed</Text>}
          <Text style={styles.busySub}>
            {phase.kind === 'picking'
              ? 'Decoding audio format…'
              : 'Whisper is running locally. This may take 20–60 s for a long message.'}
          </Text>
        </View>
      )}

      {phase.kind === 'result' && analysis && (
        <View style={styles.result}>
          <View style={[styles.riskBar, { borderLeftColor: riskColor[analysis.risk] }]}>
            <View>
              <Text style={[styles.riskLabel, { color: riskColor[analysis.risk] }]}>
                {riskLabel[analysis.risk].toUpperCase()}
              </Text>
              <Text style={styles.riskSub}>fraud risk detected</Text>
            </View>
            <Text style={[styles.score, { color: riskColor[analysis.risk] }]}>{analysis.score}<Text style={styles.scoreOf}>/100</Text></Text>
          </View>

          {analysis.evidence.slice(0, 5).map((ev) => (
            <View key={ev.id} style={styles.signalRow}>
              <Text style={styles.signalDot}>▸</Text>
              <Text style={styles.signalText}>{ev.title}</Text>
            </View>
          ))}

          <View style={styles.divider} />
          <Text style={styles.transcriptLabel}>TRANSCRIPT</Text>
          <Text style={styles.transcript} selectable>{phase.transcript || '(no speech detected in this file)'}</Text>

          <Text style={styles.timing}>
            Processed in {Math.round(phase.durationMs / 1_000)}s · {Math.round(phase.sampleCount / 16_000)}s of audio · on-device only
          </Text>

          <View style={styles.actions}>
            <MotionPressable style={styles.primary} onPress={() => onAnalyzeAsCall(phase.transcript)}><Text style={styles.primaryText}>Open call analysis</Text></MotionPressable>
            <MotionPressable style={styles.secondary} onPress={() => setPhase({ kind: 'idle' })}><Text style={styles.secondaryText}>Clear</Text></MotionPressable>
          </View>
        </View>
      )}

      {isIdle && (
        <View style={styles.pickerStack}>
          <MotionPressable
            style={[styles.pickBtn, !modelReady && styles.pickBtnDisabled]}
            onPress={() => { if (modelReady) void transcribe('call-recording') }}
            disabled={!modelReady}
          ><Text style={styles.pickBtnEyebrow}>XIAOMI / HYPEROS</Text><Text style={styles.pickBtnText}>Analyze call recording</Text><Text style={styles.pickBtnCopy}>Choose MIUI / sound_recorder / call_rec</Text></MotionPressable>
          <MotionPressable
            style={[styles.fileBtn, !modelReady && styles.fileBtnDisabled]}
            onPress={() => { if (modelReady) void transcribe('pick') }}
            disabled={!modelReady}
          ><Text style={styles.fileBtnText}>Pick voice message</Text><Text style={styles.fileBtnCopy}>OGG, M4A, MP3 or WAV</Text></MotionPressable>
          {cloudSpeechModel && (
            <MotionPressable style={styles.cloudBtn} onPress={() => { void transcribeWithCloud() }} disabled={!VoiceMessageModule}>
              <Text style={styles.cloudBtnEyebrow}>CLOUD STT · {cloudSpeechModel.providerId.toUpperCase()}</Text>
              <Text style={styles.cloudBtnText}>{cloudSpeechModel.name}</Text>
              <Text style={styles.cloudBtnCopy}>Отправить выбранный аудиофайл в подключенный API</Text>
            </MotionPressable>
          )}
        </View>
      )}

      {!modelReady && isIdle && (
        <View style={styles.modelHint}>
          <Text style={styles.modelHintText}>
            The Whisper model is required for voice message transcription.
            Download it in <Text style={styles.modelHintLink}>Setup</Text>.
          </Text>
        </View>
      )}

      <View style={styles.formats}>
        <Text style={styles.formatsTitle}>PRIVATE BY DESIGN</Text>
        <Text style={styles.formatsText}>
          OGG / Opus (WhatsApp, Telegram), M4A / AAC, MP3, WAV.
          Maximum 5 minutes per file.
          Local mode does not upload audio. The cloud Speech-to-Text button uploads only the file you explicitly select.
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 14 },
  hero: { backgroundColor: colors.brandDark, borderRadius: 8, gap: 6, padding: 18 },
  heroEyebrow: { color: '#9ce1c1', fontSize: 10, fontWeight: '900', letterSpacing: 1 }, heroTitle: { color: '#fff', fontSize: 22, fontWeight: '900' }, heroCopy: { color: '#d7eee2', fontSize: 13, lineHeight: 19 },
  capabilityRow: { flexDirection: 'row', gap: 7 }, capability: { backgroundColor: colors.chipBg, borderRadius: 8, flex: 1, gap: 2, padding: 10 }, capabilityValue: { color: colors.brandDark, fontSize: 12, fontWeight: '900' }, capabilityLabel: { color: colors.sub, fontSize: 10 },

  sharedBanner: { backgroundColor: colors.softBrand, borderColor: '#9fd7b5', borderRadius: 8, borderWidth: 1, padding: 12 },
  sharedText: { color: colors.brandDark, fontSize: 13, fontWeight: '800' },

  errorBox: { backgroundColor: '#fef2f2', borderColor: '#fca5a5', borderRadius: 8, borderWidth: 1, gap: 6, padding: 14 },
  errorTitle: { color: '#991b1b', fontSize: 14, fontWeight: '900' },
  errorText: { color: '#7f1d1d', fontSize: 13, lineHeight: 18 },
  retryBtn: { alignSelf: 'flex-start', marginTop: 4, paddingVertical: 3 },
  retryText: { color: colors.brand, fontSize: 13, fontWeight: '900' },

  busyBox: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 12, borderWidth: 1, gap: 8, padding: 24 },
  spinner: { color: colors.brand, fontSize: 36 },
  busyTitle: { color: colors.ink, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  busyTimer: { color: colors.sub, fontSize: 12 },
  busySub: { color: colors.sub, fontSize: 12, lineHeight: 17, textAlign: 'center' },

  result: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, gap: 10, padding: 14 },
  riskBar: { borderLeftWidth: 4, borderRadius: 4, flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'space-between', paddingLeft: 10 },
  riskLabel: { fontSize: 13, fontWeight: '900', letterSpacing: 0.8 },
  riskSub: { color: colors.sub, fontSize: 11 },
  score: { fontSize: 28, fontWeight: '900' },
  scoreOf: { fontSize: 13, fontWeight: '600' },
  signalRow: { flexDirection: 'row', gap: 6 },
  signalDot: { color: colors.sub, fontSize: 12, marginTop: 1 },
  signalText: { color: colors.ink, flex: 1, fontSize: 13, lineHeight: 18 },
  divider: { backgroundColor: colors.border, height: 1, marginTop: 2 },
  transcriptLabel: { color: colors.sub, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginTop: 4 },
  transcript: { color: colors.ink, fontSize: 13, lineHeight: 20 },
  timing: { color: colors.sub, fontSize: 11 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  primary: { backgroundColor: colors.brand, borderRadius: 8, flex: 1, paddingHorizontal: 14, paddingVertical: 11 },
  primaryText: { color: '#fff', fontWeight: '900', textAlign: 'center' },
  secondary: { borderColor: colors.border, borderRadius: 8, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11 },
  secondaryText: { color: colors.ink, fontWeight: '800' },

  pickBtn: { backgroundColor: colors.brand, borderRadius: 8, gap: 2, paddingHorizontal: 17, paddingVertical: 14 },
  pickerStack: { gap: 8 },
  pickBtnDisabled: { backgroundColor: colors.muted },
  pickBtnEyebrow: { color: '#bce9d4', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 }, pickBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' }, pickBtnCopy: { color: '#ddf5e8', fontSize: 11 },
  fileBtn: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, gap: 2, paddingHorizontal: 17, paddingVertical: 13 },
  fileBtnDisabled: { opacity: 0.55 },
  fileBtnText: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  fileBtnCopy: { color: colors.sub, fontSize: 11 },
  cloudBtn: { backgroundColor: '#163b59', borderRadius: 8, gap: 2, paddingHorizontal: 17, paddingVertical: 14 },
  cloudBtnEyebrow: { color: '#9edbff', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  cloudBtnText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  cloudBtnCopy: { color: '#d2e8f5', fontSize: 11 },

  modelHint: { backgroundColor: colors.softBrand, borderRadius: 8, padding: 12 },
  modelHintText: { color: colors.brandDark, fontSize: 12, lineHeight: 18 },
  modelHintLink: { fontWeight: '900' },

  formats: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, gap: 4, padding: 12 },
  formatsTitle: { color: colors.brandDark, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  formatsText: { color: colors.sub, fontSize: 11, lineHeight: 17 },
})
