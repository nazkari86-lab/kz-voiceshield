import React, { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { AudioSession, LiveKitRoom } from '@livekit/react-native'
import { createVoipCall, endVoipCall, getVoipConfig, joinVoipCall, saveVoipConfig, type VoipSession } from '../services/voipClient'
import { MotionPressable } from './MotionPressable'
import { useTheme } from '../ThemeContext'

type Status = 'idle' | 'starting' | 'connected' | 'ending' | 'error'

export function VoipCallView() {
  const { colors } = useTheme()
  const [session, setSession] = useState<VoipSession | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [backendUrl, setBackendUrl] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [callId, setCallId] = useState('')

  useEffect(() => { void getVoipConfig().then((config) => { setBackendUrl(config.url); setApiToken(config.token) }).catch(() => undefined) }, [])

  useEffect(() => () => { void AudioSession.stopAudioSession() }, [])

  const start = useCallback(async () => {
    setStatus('starting')
    setError('')
    try {
      const next = await createVoipCall()
      await AudioSession.startAudioSession()
      setSession(next)
    } catch (cause) {
      setStatus('error')
      setError(cause instanceof Error ? cause.message : 'Не удалось создать защищённый звонок.')
    }
  }, [])

  const join = useCallback(async () => {
    setStatus('starting'); setError('')
    try { const next = await joinVoipCall(callId.trim()); await AudioSession.startAudioSession(); setSession(next) }
    catch (cause) { setStatus('error'); setError(cause instanceof Error ? cause.message : 'Не удалось подключиться к звонку.') }
  }, [callId])

  const end = useCallback(async () => {
    if (!session) return
    setStatus('ending')
    try { await endVoipCall(session.callId) } catch { /* local disconnect still matters */ }
    setSession(null)
    await AudioSession.stopAudioSession()
    setStatus('idle')
  }, [session])

  return (
    <View style={styles.root}>
      <View style={[styles.hero, { backgroundColor: colors.brandDark }]}>
        <Text style={styles.eyebrow}>PRIVATE CALLING</Text>
        <Text style={styles.title}>Protected VoIP</Text>
        <Text style={styles.copy}>Аудиозвонок внутри VoiceShield через временную комнату LiveKit. Токены и секреты остаются на сервере.</Text>
      </View>
      {session ? (
        <LiveKitRoom serverUrl={session.serverUrl} token={session.token} connect audio video={false} onConnected={() => setStatus('connected')} onDisconnected={() => setStatus('idle')} onError={(cause) => { setStatus('error'); setError(cause.message) }}>
          <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.status, { color: colors.brandDark }]}>{status === 'connected' ? 'Звонок подключён' : 'Подключение...'}</Text>
            <Text style={[styles.muted, { color: colors.sub }]}>Комната: {session.room}</Text>
            <Text style={[styles.muted, { color: colors.sub }]}>Live Shield-анализ подключается отдельным этапом и не выдаёт фиктивный transcript.</Text>
            <MotionPressable onPress={() => { void end() }} style={[styles.button, { backgroundColor: '#b42318' }]}><Text style={styles.buttonText}>{status === 'ending' ? 'Завершение...' : 'Завершить звонок'}</Text></MotionPressable>
          </View>
        </LiveKitRoom>
      ) : (
        <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TextInput value={backendUrl} onChangeText={setBackendUrl} placeholder="Backend URL, например http://192.168.1.10:8000" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.ink, borderColor: colors.border }]} autoCapitalize="none" />
          <TextInput value={apiToken} onChangeText={setApiToken} placeholder="API token" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.ink, borderColor: colors.border }]} secureTextEntry autoCapitalize="none" />
          <MotionPressable onPress={() => { void saveVoipConfig(backendUrl, apiToken); setError('Настройки VoIP сохранены на устройстве.') }} style={[styles.secondaryButton, { borderColor: colors.border }]}><Text style={[styles.secondaryText, { color: colors.ink }]}>Сохранить backend</Text></MotionPressable>
          <Text style={[styles.status, { color: colors.ink }]}>Готово к защищённому звонку</Text>
          <Text style={[styles.muted, { color: colors.sub }]}>Для работы нужен запущенный backend VoiceShield и LiveKit server. Для звонка второго участника он должен присоединиться по тому же call ID.</Text>
          <MotionPressable onPress={() => { void start() }} style={[styles.button, { backgroundColor: colors.brandDark }]}><Text style={styles.buttonText}>{status === 'starting' ? 'Создание комнаты...' : 'Создать звонок'}</Text></MotionPressable>
          <TextInput value={callId} onChangeText={setCallId} placeholder="Call ID для подключения" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.ink, borderColor: colors.border }]} autoCapitalize="none" />
          <MotionPressable onPress={() => { void join() }} style={[styles.secondaryButton, { borderColor: colors.border }]}><Text style={[styles.secondaryText, { color: colors.ink }]}>Подключиться по Call ID</Text></MotionPressable>
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
  button: { alignItems: 'center', borderRadius: 7, marginTop: 5, padding: 14 },
  buttonText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  error: { color: '#b42318', fontSize: 12, lineHeight: 18 },
  input: { borderRadius: 7, borderWidth: 1, fontSize: 12, padding: 11 },
  secondaryButton: { alignItems: 'center', borderRadius: 7, borderWidth: 1, padding: 12 },
  secondaryText: { fontSize: 12, fontWeight: '900' },
})
