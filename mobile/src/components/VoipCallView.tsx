import React, { useCallback, useEffect, useState } from 'react'
import { Share, StyleSheet, Text, TextInput, View } from 'react-native'
import { AndroidAudioTypePresets, AudioSession, LiveKitRoom, useLocalParticipant, useRemoteParticipants } from '@livekit/react-native'
import { createVoipCall, endVoipCall, joinVoipCall, type VoipSession } from '../services/voipClient'
import { MotionPressable } from './MotionPressable'
import { useTheme } from '../ThemeContext'
import { useI18n } from '../I18nContext'
import type { I18nKeys } from '../i18n/ru'

type Status = 'idle' | 'starting' | 'connected' | 'ending' | 'error'

const outputLabels: Record<string, string> = {
  bluetooth: 'Bluetooth',
  earpiece: 'Телефон',
  headset: 'Гарнитура',
  speaker: 'Динамик',
}

async function prepareCallAudio() {
  await AudioSession.configureAudio({
    android: {
      preferredOutputList: ['bluetooth', 'headset', 'speaker', 'earpiece'],
      audioTypeOptions: AndroidAudioTypePresets.communication,
    },
    ios: { defaultOutput: 'speaker' },
  })
  await AudioSession.startAudioSession()
}

function explainVoipError(cause: unknown, copy: I18nKeys['voip']): string {
  const message = cause instanceof Error ? cause.message : ''
  if (message.startsWith('NETWORK:')) return copy.errorNetwork
  if (/^401:|^403:/.test(message)) return copy.errorAuthorization
  if (/^503:/.test(message)) return copy.errorUnavailable
  if (/^404:/.test(message)) return copy.errorNotFound
  return message || copy.errorFallback
}

function ActiveCallPanel({ session, status, onEnd }: { session: VoipSession; status: Status; onEnd: () => void }) {
  const { colors } = useTheme()
  const { t } = useI18n()
  const copy = t.voip
  const { isMicrophoneEnabled, lastMicrophoneError, localParticipant } = useLocalParticipant()
  const remoteParticipants = useRemoteParticipants()
  const [isUpdatingMicrophone, setIsUpdatingMicrophone] = useState(false)
  const [audioOutputs, setAudioOutputs] = useState<string[]>([])
  const [audioError, setAudioError] = useState('')

  useEffect(() => {
    let mounted = true
    void AudioSession.getAudioOutputs()
      .then((outputs) => { if (mounted) setAudioOutputs(outputs) })
      .catch(() => { if (mounted) setAudioError(copy.errorAudioDevices) })
    return () => { mounted = false }
  }, [copy.errorAudioDevices])

  const toggleMicrophone = useCallback(async () => {
    setIsUpdatingMicrophone(true)
    setAudioError('')
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)
    } catch (cause) {
      setAudioError(explainVoipError(cause, copy))
    } finally {
      setIsUpdatingMicrophone(false)
    }
  }, [copy, isMicrophoneEnabled, localParticipant])

  const selectOutput = useCallback(async (output: string) => {
    setAudioError('')
    try {
      await AudioSession.selectAudioOutput(output)
    } catch {
      setAudioError(copy.errorAudioOutput)
    }
  }, [copy.errorAudioOutput])

  const shareCallId = useCallback(async () => {
    await Share.share({ message: `${copy.title}\n${copy.callId}: ${session.callId}` })
  }, [copy.callId, copy.title, session.callId])

  return (
    <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.status, { color: colors.brandDark }]}>{status === 'connected' ? copy.connected : copy.connecting}</Text>
      <Text style={[styles.muted, { color: colors.sub }]}>{copy.participants}: {remoteParticipants.length + 1}</Text>
      <Text style={[styles.muted, { color: colors.sub }]}>{remoteParticipants.length ? copy.participantConnected : copy.waiting}</Text>
      <Text style={[styles.callId, { color: colors.ink }]}>{copy.callId}: {session.callId}</Text>
      <View style={styles.controlRow}>
        <MotionPressable disabled={isUpdatingMicrophone || status !== 'connected'} onPress={() => { void toggleMicrophone() }} style={[styles.controlButton, { backgroundColor: isMicrophoneEnabled ? colors.brandDark : '#667085' }]}>
          <Text style={styles.buttonText}>{isUpdatingMicrophone ? '...' : isMicrophoneEnabled ? copy.microphoneOn : copy.microphoneOff}</Text>
        </MotionPressable>
        <MotionPressable onPress={() => { void shareCallId() }} style={[styles.shareButton, { borderColor: colors.brandDark }]}><Text style={[styles.shareButtonText, { color: colors.brandDark }]}>{copy.shareCallId}</Text></MotionPressable>
      </View>
      {audioOutputs.length > 0 ? (
        <View style={styles.outputs}>
          <Text style={[styles.outputTitle, { color: colors.sub }]}>{copy.audioOutput}</Text>
          <View style={styles.outputRow}>
            {audioOutputs.map((output) => (
              <MotionPressable key={output} onPress={() => { void selectOutput(output) }} style={[styles.outputButton, { borderColor: colors.brandDark }]}>
                <Text style={[styles.outputText, { color: colors.brandDark }]}>{outputLabels[output] ?? output}</Text>
              </MotionPressable>
            ))}
          </View>
        </View>
      ) : null}
      {lastMicrophoneError ? <Text style={styles.error}>{copy.errorMicrophone}: {lastMicrophoneError.message}</Text> : null}
      {audioError ? <Text style={styles.error}>{audioError}</Text> : null}
      <Text style={[styles.muted, { color: colors.sub }]}>{copy.analysisBoundary}</Text>
      <MotionPressable onPress={onEnd} style={[styles.button, { backgroundColor: '#b42318' }]}><Text style={styles.buttonText}>{status === 'ending' ? copy.ending : copy.end}</Text></MotionPressable>
    </View>
  )
}

export function VoipCallView() {
  const { colors } = useTheme()
  const { t } = useI18n()
  const copy = t.voip
  const [session, setSession] = useState<VoipSession | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [joinCode, setJoinCode] = useState('')

  useEffect(() => () => { void AudioSession.stopAudioSession() }, [])

  const start = useCallback(async () => {
    setStatus('starting')
    setError('')
    try {
      const next = await createVoipCall()
      await prepareCallAudio()
      setSession(next)
    } catch (cause) {
      setStatus('error')
      setError(explainVoipError(cause, copy))
    }
  }, [copy])

  const end = useCallback(async () => {
    if (!session) return
    setStatus('ending')
    try { await endVoipCall(session.callId) } catch { /* local disconnect still matters */ }
    setSession(null)
    await AudioSession.stopAudioSession()
    setStatus('idle')
  }, [session])

  const join = useCallback(async () => {
    const callId = joinCode.trim()
    if (!callId) { setError(copy.callIdPlaceholder); return }
    setStatus('starting')
    setError('')
    try {
      const next = await joinVoipCall(callId)
      await prepareCallAudio()
      setSession(next)
    } catch (cause) {
      setStatus('error')
      setError(explainVoipError(cause, copy))
    }
  }, [copy, joinCode])

  return (
    <View style={styles.root}>
      <View style={[styles.hero, { backgroundColor: colors.brandDark }]}>
        <Text style={styles.eyebrow}>{copy.eyebrow}</Text>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.copy}>{copy.description}</Text>
      </View>
      {session ? (
        <LiveKitRoom serverUrl={session.serverUrl} token={session.token} connect audio video={false} onConnected={() => setStatus('connected')} onDisconnected={() => { setSession(null); setStatus('idle'); void AudioSession.stopAudioSession() }} onError={(cause) => { setStatus('error'); setError(explainVoipError(cause, copy)) }}>
          <ActiveCallPanel session={session} status={status} onEnd={() => { void end() }} />
        </LiveKitRoom>
      ) : (
        <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.status, { color: colors.ink }]}>{copy.ready}</Text>
          <Text style={[styles.muted, { color: colors.sub }]}>{copy.readyCopy}</Text>
          <MotionPressable onPress={() => { void start() }} style={[styles.button, { backgroundColor: colors.brandDark }]}><Text style={styles.buttonText}>{status === 'starting' ? copy.creating : copy.create}</Text></MotionPressable>
          <TextInput accessibilityLabel={copy.callId} autoCapitalize="none" onChangeText={setJoinCode} placeholder={copy.callIdPlaceholder} placeholderTextColor={colors.muted} style={[styles.input, { borderColor: colors.border, color: colors.ink }]} value={joinCode} />
          <MotionPressable onPress={() => { void join() }} style={[styles.secondaryButton, { borderColor: colors.brandDark }]}><Text style={[styles.secondaryButtonText, { color: colors.brandDark }]}>{status === 'starting' ? copy.joining : copy.join}</Text></MotionPressable>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: 14 },
  hero: { borderRadius: 8, gap: 7, padding: 18 },
  eyebrow: { color: '#8fe0bd', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: '#fff', fontSize: 26, fontWeight: '900' },
  copy: { color: '#c1dfd0', fontSize: 13, lineHeight: 19 },
  panel: { borderRadius: 8, borderWidth: 1, gap: 10, padding: 16 },
  status: { fontSize: 18, fontWeight: '900' },
  muted: { fontSize: 13, lineHeight: 19 },
  callId: { fontSize: 13, fontWeight: '900' },
  controlRow: { flexDirection: 'row', gap: 8 },
  controlButton: { alignItems: 'center', borderRadius: 7, flex: 1, minHeight: 46, justifyContent: 'center', paddingHorizontal: 12 },
  shareButton: { alignItems: 'center', borderRadius: 7, borderWidth: 1, justifyContent: 'center', minHeight: 46, paddingHorizontal: 12 },
  shareButtonText: { fontSize: 12, fontWeight: '900' },
  outputs: { gap: 6 },
  outputTitle: { fontSize: 12, fontWeight: '800' },
  outputRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  outputButton: { borderRadius: 7, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 9 },
  outputText: { fontSize: 12, fontWeight: '800' },
  button: { alignItems: 'center', borderRadius: 7, marginTop: 5, padding: 14 },
  buttonText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  input: { borderRadius: 7, borderWidth: 1, fontSize: 13, minHeight: 46, paddingHorizontal: 12 },
  secondaryButton: { alignItems: 'center', borderRadius: 7, borderWidth: 1, padding: 13 },
  secondaryButtonText: { fontSize: 13, fontWeight: '900' },
  error: { color: '#b42318', fontSize: 12, lineHeight: 18 },
})
