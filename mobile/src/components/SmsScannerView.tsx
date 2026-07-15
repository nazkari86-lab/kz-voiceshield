import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, StyleSheet, TouchableOpacity, View } from 'react-native'
import { SmsScannerModule, type SmsMessage } from '../bridge/SmsScannerBridge'
import { checkScamNumber } from '../data/scamNumbers'
import { colors } from '../theme'
import { Card, SectionTitle } from './ui'
import { LocalizedText as Text } from './LocalizedText'

const SCAM_KEYWORDS = [
  'банк', 'карта', 'заблокир', 'код подтверждени', 'код из смс',
  'срочно', 'мошенник', 'полиция', 'штраф', 'задолженность',
  'инвестици', 'криптовалют', 'выигрыш', 'лотере',
  'банк', 'картаны', 'блоктал', 'кодты жіберіңіз', 'полиция',
]

function scoreSms(body: string): number {
  const lower = body.toLowerCase()
  let score = 0
  for (const kw of SCAM_KEYWORDS) {
    if (lower.includes(kw)) score += 15
  }
  // Short urgent messages with numbers
  if (/\d{4,6}/.test(body) && body.length < 200) score += 10
  return Math.min(score, 100)
}

function RiskChip({ score }: { score: number }) {
  const level = score >= 60 ? 'critical' : score >= 30 ? 'high' : score > 0 ? 'medium' : 'safe'
  const bg = score >= 60 ? '#fee2e2' : score >= 30 ? '#fff7ed' : score > 0 ? '#fffbeb' : '#f0fdf4'
  const fg = score >= 60 ? '#991b1b' : score >= 30 ? '#9a3412' : score > 0 ? '#92400e' : '#15803d'
  return <View style={[styles.chip, { backgroundColor: bg }]}><Text style={[styles.chipText, { color: fg }]}>{level.toUpperCase()} {score > 0 ? `·${score}` : ''}</Text></View>
}

export function SmsScannerView() {
  const [messages, setMessages] = useState<(SmsMessage & { scamScore: number })[]>([])
  const [loading, setLoading] = useState(false)
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)

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
      const scored = raw.map(m => ({ ...m, scamScore: scoreSms(m.body) }))
      scored.sort((a, b) => b.scamScore - a.scamScore)
      setMessages(scored)
    } catch (e) {
      Alert.alert('Ошибка', String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  if (hasPermission === null) return <ActivityIndicator style={styles.center} />

  if (!hasPermission) {
    return (
      <View style={styles.center}>
        <Text style={styles.permTitle}>SMS-сканер недоступен</Text>
        <Text style={styles.permSub}>Эта сборка не запрашивает доступ ко всем SMS. Для проверки сообщения отправьте его в VoiceShield через системное меню «Поделиться».</Text>
      </View>
    )
  }

  return (
    <View>
      <View style={styles.headerRow}>
        <SectionTitle>SMS-сканер</SectionTitle>
        <TouchableOpacity style={styles.scanBtn} onPress={scan} disabled={loading}>
          {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.scanBtnText}>Сканировать</Text>}
        </TouchableOpacity>
      </View>

      {messages.length === 0 && !loading && (
        <Text style={styles.empty}>Нажмите «Сканировать» для анализа последних 50 SMS.</Text>
      )}

      {messages.map(msg => {
        const scamEntry = checkScamNumber(msg.address)
        return (
          <Card key={msg.id} tone={msg.scamScore >= 60 ? 'critical' : msg.scamScore >= 30 ? 'high' : 'low'}>
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
  scanBtn: { backgroundColor: colors.brand, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  scanBtnText: { color: '#fff', fontWeight: '800' },
  permTitle: { color: colors.ink, fontSize: 16, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  permSub: { color: colors.sub, fontSize: 13, lineHeight: 20, marginBottom: 20, textAlign: 'center' },
  empty: { color: colors.muted, fontSize: 14, marginTop: 20, textAlign: 'center' },
  msgHeader: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  sender: { color: colors.ink, flex: 1, fontSize: 13, fontWeight: '800' },
  chip: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontSize: 10, fontWeight: '900' },
  numAlert: { backgroundColor: '#fff7ed', borderRadius: 6, marginTop: 4, padding: 6 },
  numAlertText: { color: '#9a3412', fontSize: 12, fontWeight: '700' },
  body: { color: colors.ink, fontSize: 13, lineHeight: 19, marginTop: 4 },
  date: { color: colors.muted, fontSize: 11, marginTop: 4 },
})
