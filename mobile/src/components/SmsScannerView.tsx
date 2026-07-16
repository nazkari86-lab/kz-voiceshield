import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, PermissionsAndroid, Platform, Share, StyleSheet, TouchableOpacity, View } from 'react-native'
import { SmsScannerModule, type SmsMessage } from '../bridge/SmsScannerBridge'
import { checkScamNumber } from '../data/scamNumbers'
import { colors } from '../theme'
import { Card, SectionTitle } from './ui'
import { LocalizedText as Text } from './LocalizedText'
import type { OnDeviceAiRuntime } from '../hooks/useOnDeviceAiRuntime'
import { AiAssistButton } from './AiAssistButton'
import { scoreSms, smsRiskTier } from '../utils/smsRisk'

function RiskChip({ score }: { score: number }) {
  const level = smsRiskTier(score)
  const bg = level === 'critical' ? '#fee2e2' : level === 'high' ? '#fff7ed' : level === 'medium' ? '#fffbeb' : '#f0fdf4'
  const fg = level === 'critical' ? '#991b1b' : level === 'high' ? '#9a3412' : level === 'medium' ? '#92400e' : '#15803d'
  return <View style={[styles.chip, { backgroundColor: bg }]}><Text style={[styles.chipText, { color: fg }]}>{level.toUpperCase()} {score > 0 ? `·${score}` : ''}</Text></View>
}

function responseActions(score: number, hasKnownScamNumber: boolean): string[] {
  if (hasKnownScamNumber || score >= 75) return [
    'Do not reply, open links, or share any code.',
    'Block the sender and take a screenshot for your report.',
    'If you entered data, call your bank using its official number immediately.',
  ]
  if (score >= 45) return [
    'Do not use links or phone numbers from this message.',
    'Verify the claim through the organisation’s official app or website.',
  ]
  if (score >= 20) return ['Treat this message cautiously and verify it through an official channel.']
  return ['No high-risk signal was found. Never share SMS codes with callers.']
}

export function SmsScannerView({ onAnalyze, ai }: { onAnalyze?: (text: string) => void; ai?: OnDeviceAiRuntime }) {
  const [messages, setMessages] = useState<(SmsMessage & { scamScore: number; scamReasons: string[] })[]>([])
  const [loading, setLoading] = useState(false)
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)
  const [suspiciousOnly, setSuspiciousOnly] = useState(false)

  const checkPermission = useCallback(async () => {
    if (!SmsScannerModule) { setHasPermission(false); return }
    const granted = await SmsScannerModule.hasPermission()
    setHasPermission(granted)
  }, [])

  useEffect(() => { checkPermission() }, [checkPermission])

  const scan = useCallback(async () => {
    if (!SmsScannerModule) return
    setLoading(true)
    try {
      const raw = await SmsScannerModule.getRecentMessages(50)
      const scored = raw.map(m => { const result = scoreSms(m.body); return { ...m, scamScore: result.score, scamReasons: result.reasons } })
      scored.sort((a, b) => b.scamScore - a.scamScore)
      setMessages(scored)
    } catch (e) {
      Alert.alert('Ошибка', String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const requestSmsPermission = useCallback(async () => {
    if (Platform.OS !== 'android' || !SmsScannerModule) return
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS, {
      title: 'VoiceShield SMS access',
      message: 'Allow access only to scan recent messages for scam indicators locally. Messages are not uploaded and VoiceShield does not send SMS.',
      buttonPositive: 'Allow',
      buttonNegative: 'Not now',
    })
    setHasPermission(result === PermissionsAndroid.RESULTS.GRANTED)
  }, [])

  if (hasPermission === null) return <ActivityIndicator style={styles.center} />

  if (!hasPermission) {
    return (
      <View style={styles.center}>
        <Text style={styles.permTitle}>SMS-сканер недоступен</Text>
        <Text style={styles.permSub}>Разрешение нужно только для ручного сканирования последних SMS. Сообщения анализируются локально, не отправляются и не изменяются.</Text>
        <TouchableOpacity style={styles.scanBtn} onPress={() => { void requestSmsPermission() }}><Text style={styles.scanBtnText}>Разрешить SMS-сканирование</Text></TouchableOpacity>
        <Text style={styles.permSub}>Можно также отправить отдельное сообщение в VoiceShield через системное меню «Поделиться».</Text>
      </View>
    )
  }

  const visibleMessages = suspiciousOnly ? messages.filter((message) => message.scamScore >= 20) : messages
  const shareReport = async () => {
    if (messages.length === 0) return
    const suspicious = messages.filter((message) => message.scamScore >= 20)
    const body = [
      'VoiceShield SMS report',
      `Scanned: ${messages.length}`,
      `Suspicious: ${suspicious.length}`,
      ...suspicious.slice(0, 20).map((message) => `${message.address}: ${message.scamScore}/100\n${message.body}`),
    ].join('\n\n')
    await Share.share({ message: body })
  }

  return (
    <View>
      <View style={styles.headerRow}>
        <SectionTitle>SMS-сканер</SectionTitle>
        <View style={styles.headerActions}>
        <TouchableOpacity style={styles.filterBtn} onPress={() => setSuspiciousOnly((current) => !current)} disabled={messages.length === 0}>
          <Text style={styles.filterBtnText}>{suspiciousOnly ? 'Все SMS' : 'Только риск'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.shareBtn} onPress={() => { void shareReport() }} disabled={messages.length === 0}>
          <Text style={styles.shareBtnText}>Поделиться</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.scanBtn} onPress={scan} disabled={loading}>
          {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.scanBtnText}>Сканировать</Text>}
        </TouchableOpacity>
        </View>
      </View>

      {messages.length === 0 && !loading && (
        <Text style={styles.empty}>Нажмите «Сканировать» для анализа последних 50 SMS.</Text>
      )}
      {messages.length > 0 && <Text style={styles.summary}>Найдено: {messages.length} · подозрительных: {messages.filter((message) => message.scamScore >= 20).length}</Text>}

      {visibleMessages.map(msg => {
        const scamEntry = checkScamNumber(msg.address)
        const actions = responseActions(msg.scamScore, Boolean(scamEntry))
        return (
          <Card key={msg.id} tone={msg.scamScore >= 75 ? 'critical' : msg.scamScore >= 45 ? 'high' : 'low'}>
            <View style={styles.msgHeader}>
              <Text style={styles.sender} numberOfLines={1}>{msg.address}</Text>
              <RiskChip score={msg.scamScore} />
            </View>
            {scamEntry && (
              <View style={styles.numAlert}>
                <Text style={styles.numAlertText}>⚠ Известный мошеннический номер: {scamEntry.reason}</Text>
              </View>
            )}
            <Text style={styles.body} numberOfLines={4}>{msg.body}</Text>
            {msg.scamReasons.length > 0 && <Text style={styles.reasons}>Почему отмечено: {msg.scamReasons.slice(0, 3).join(' · ')}</Text>}
            <View style={styles.actionsPanel}>
              <Text style={styles.actionsTitle}>What to do now</Text>
              {actions.map((action) => <Text key={action} style={styles.actionCopy}>• {action}</Text>)}
            </View>
            {onAnalyze && <TouchableOpacity style={styles.analyzeBtn} onPress={() => onAnalyze(msg.body)}><Text style={styles.analyzeBtnText}>Открыть полный анализ</Text></TouchableOpacity>}
            {ai && <AiAssistButton ai={ai} context={`SMS sender: ${msg.address}\nLocal SMS score: ${msg.scamScore}/100\nReasons: ${msg.scamReasons.join('; ')}\nMessage: ${msg.body}`} label="Объяснить SMS через AI" />}
            <Text style={styles.date}>{new Date(msg.date).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</Text>
          </Card>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingTop: 60 },
  headerRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  headerActions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 5, justifyContent: 'flex-end' },
  scanBtn: { backgroundColor: colors.brand, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  scanBtnText: { color: '#fff', fontWeight: '800' },
  filterBtn: { backgroundColor: '#f1f5f9', borderColor: colors.border, borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 8 },
  filterBtnText: { color: colors.sub, fontSize: 11, fontWeight: '800' },
  shareBtn: { borderColor: colors.border, borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 8 },
  shareBtnText: { color: colors.brandDark, fontSize: 11, fontWeight: '800' },
  permTitle: { color: colors.ink, fontSize: 16, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  permSub: { color: colors.sub, fontSize: 13, lineHeight: 20, marginBottom: 20, textAlign: 'center' },
  empty: { color: colors.muted, fontSize: 14, marginTop: 20, textAlign: 'center' },
  summary: { color: colors.sub, fontSize: 12, marginBottom: 8 },
  msgHeader: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  sender: { color: colors.ink, flex: 1, fontSize: 13, fontWeight: '800' },
  chip: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontSize: 10, fontWeight: '900' },
  numAlert: { backgroundColor: '#fff7ed', borderRadius: 6, marginTop: 4, padding: 6 },
  numAlertText: { color: '#9a3412', fontSize: 12, fontWeight: '700' },
  body: { color: colors.ink, fontSize: 13, lineHeight: 19, marginTop: 4 },
  reasons: { color: '#9a3412', fontSize: 11, lineHeight: 16, marginTop: 5 },
  actionsPanel: { backgroundColor: '#f8fafc', borderRadius: 7, gap: 2, marginTop: 8, padding: 9 },
  actionsTitle: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  actionCopy: { color: colors.sub, fontSize: 12, lineHeight: 17 },
  analyzeBtn: { alignSelf: 'flex-start', borderColor: colors.border, borderRadius: 7, borderWidth: 1, marginTop: 8, paddingHorizontal: 10, paddingVertical: 7 },
  analyzeBtnText: { color: colors.brandDark, fontSize: 11, fontWeight: '900' },
  date: { color: colors.muted, fontSize: 11, marginTop: 4 },
})
