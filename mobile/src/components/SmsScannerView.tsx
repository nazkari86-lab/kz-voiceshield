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
import { useI18n } from '../I18nContext'

type SmsCopy = {
  title: string; scan: string; all: string; riskOnly: string; share: string; unavailable: string; permissionDetail: string; allow: string; shareHint: string
  scanHint: string; found: string; suspicious: string; knownNumber: string; reasons: string; actions: string; fullAnalysis: string; reportTitle: string; scanned: string
  error: string; permissionTitle: string; permissionMessage: string; allowButton: string; notNow: string
  risk: Record<'critical' | 'high' | 'medium' | 'safe', string>
  criticalActions: string[]; mediumActions: string[]; cautionAction: string; safeAction: string
}

const smsCopyFor = (lang: 'ru' | 'kz' | 'en'): SmsCopy => lang === 'kz' ? {
  title: 'SMS тексеру', scan: 'Сканерлеу', all: 'Барлық SMS', riskOnly: 'Тек қауіп', share: 'Бөлісу', unavailable: 'SMS сканері қолжетімсіз', permissionDetail: 'Рұқсат тек соңғы SMS-ті қолмен тексеру үшін қажет. Хабарламалар жергілікті талданады, жіберілмейді және өзгертілмейді.', allow: 'SMS тексеруге рұқсат ету', shareHint: 'Жеке хабарламаны жүйелік «Бөлісу» мәзірі арқылы VoiceShield-ке де жібере аласыз.', scanHint: 'Соңғы 50 SMS талдау үшін «Сканерлеу» басыңыз.', found: 'Табылды', suspicious: 'күдікті', knownNumber: 'Белгілі алаяқ нөмірі', reasons: 'Неліктен белгіленді', actions: 'Қазір не істеу керек', fullAnalysis: 'Толық талдауды ашу', reportTitle: 'VoiceShield SMS есебі', scanned: 'Тексерілді', error: 'Қате', permissionTitle: 'VoiceShield SMS рұқсаты', permissionMessage: 'Алаяқтық белгілерін жергілікті тексеру үшін ғана рұқсат беріңіз. SMS жіберілмейді және жүктелмейді.', allowButton: 'Рұқсат ету', notNow: 'Қазір емес', risk: { critical: 'КРИТИКАЛЫҚ', high: 'ЖОҒАРЫ ҚАУІП', medium: 'САҚТЫҚ', safe: 'ҚАУІПСІЗ' }, criticalActions: ['Жауап бермеңіз, сілтемелерді ашпаңыз және ешқандай код бермеңіз.', 'Жіберушіні бұғаттап, есеп үшін скриншот жасаңыз.', 'Дерек енгізсеңіз, банкіңізге ресми нөмірмен дереу қоңырау шалыңыз.'], mediumActions: ['Осы хабарламадағы сілтемелерді немесе нөмірлерді пайдаланбаңыз.', 'Ұйымды ресми қолданба не сайт арқылы тексеріңіз.'], cautionAction: 'Бұл хабарламаға сақтықпен қарап, ресми арна арқылы тексеріңіз.', safeAction: 'Жоғары қауіп белгісі табылмады. Қоңырау шалушыларға SMS кодтарын ешқашан бермеңіз.'
} : lang === 'ru' ? {
  title: 'SMS-сканер', scan: 'Сканировать', all: 'Все SMS', riskOnly: 'Только риск', share: 'Поделиться', unavailable: 'SMS-сканер недоступен', permissionDetail: 'Разрешение нужно только для ручного сканирования последних SMS. Сообщения анализируются локально, не отправляются и не изменяются.', allow: 'Разрешить SMS-сканирование', shareHint: 'Можно также отправить отдельное сообщение в VoiceShield через системное меню «Поделиться».', scanHint: 'Нажмите «Сканировать» для анализа последних 50 SMS.', found: 'Найдено', suspicious: 'подозрительных', knownNumber: 'Известный мошеннический номер', reasons: 'Почему отмечено', actions: 'Что делать сейчас', fullAnalysis: 'Открыть полный анализ', reportTitle: 'VoiceShield SMS отчёт', scanned: 'Проверено', error: 'Ошибка', permissionTitle: 'Доступ VoiceShield к SMS', permissionMessage: 'Разрешите доступ только для локального поиска признаков мошенничества. Сообщения не загружаются, и VoiceShield не отправляет SMS.', allowButton: 'Разрешить', notNow: 'Не сейчас', risk: { critical: 'КРИТИЧЕСКИЙ', high: 'ВЫСОКИЙ РИСК', medium: 'ОСТОРОЖНО', safe: 'БЕЗ ВЫСОКОГО РИСКА' }, criticalActions: ['Не отвечайте, не открывайте ссылки и не сообщайте коды.', 'Заблокируйте отправителя и сохраните скриншот для обращения.', 'Если уже ввели данные, срочно позвоните в банк по официальному номеру.'], mediumActions: ['Не используйте ссылки или номера из этого сообщения.', 'Проверьте утверждение в официальном приложении или на сайте организации.'], cautionAction: 'Отнеситесь к сообщению с осторожностью и проверьте его через официальный канал.', safeAction: 'Высоких признаков риска не найдено. Никогда не сообщайте коды из SMS звонящим.'
} : {
  title: 'SMS scanner', scan: 'Scan', all: 'All SMS', riskOnly: 'Risk only', share: 'Share', unavailable: 'SMS Scanner unavailable', permissionDetail: 'Permission is used only to manually scan recent SMS. Messages are analysed locally, never uploaded or changed.', allow: 'Allow SMS scanning', shareHint: 'You can also share one message to VoiceShield from the system Share menu.', scanHint: 'Tap Scan to analyse the latest 50 SMS messages.', found: 'Found', suspicious: 'suspicious', knownNumber: 'Known scam number', reasons: 'Why it was flagged', actions: 'What to do now', fullAnalysis: 'Open full analysis', reportTitle: 'VoiceShield SMS report', scanned: 'Scanned', error: 'Error', permissionTitle: 'VoiceShield SMS access', permissionMessage: 'Allow access only to scan recent messages for scam indicators locally. Messages are not uploaded and VoiceShield does not send SMS.', allowButton: 'Allow', notNow: 'Not now', risk: { critical: 'CRITICAL', high: 'HIGH RISK', medium: 'CAUTION', safe: 'NO HIGH RISK' }, criticalActions: ['Do not reply, open links, or share any code.', 'Block the sender and take a screenshot for your report.', 'If you entered data, call your bank using its official number immediately.'], mediumActions: ['Do not use links or phone numbers from this message.', 'Verify the claim through the organisation’s official app or website.'], cautionAction: 'Treat this message cautiously and verify it through an official channel.', safeAction: 'No high-risk signal was found. Never share SMS codes with callers.'
}

function RiskChip({ score, copy }: { score: number; copy: SmsCopy }) {
  const level = smsRiskTier(score)
  const bg = level === 'critical' ? '#fee2e2' : level === 'high' ? '#fff7ed' : level === 'medium' ? '#fffbeb' : '#f0fdf4'
  const fg = level === 'critical' ? '#991b1b' : level === 'high' ? '#9a3412' : level === 'medium' ? '#92400e' : '#15803d'
  return <View style={[styles.chip, { backgroundColor: bg }]}><Text style={[styles.chipText, { color: fg }]}>{copy.risk[level]} {score > 0 ? `·${score}` : ''}</Text></View>
}

function responseActions(score: number, hasKnownScamNumber: boolean, copy: SmsCopy): string[] {
  if (hasKnownScamNumber || score >= 75) return copy.criticalActions
  if (score >= 45) return copy.mediumActions
  if (score >= 20) return [copy.cautionAction]
  return [copy.safeAction]
}

export function SmsScannerView({ onAnalyze, ai }: { onAnalyze?: (text: string) => void; ai?: OnDeviceAiRuntime }) {
  const { lang } = useI18n()
  const copy = smsCopyFor(lang)
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
      Alert.alert(copy.error, String(e))
    } finally {
      setLoading(false)
    }
  }, [copy.error])

  const requestSmsPermission = useCallback(async () => {
    if (Platform.OS !== 'android' || !SmsScannerModule) return
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS, {
      title: copy.permissionTitle,
      message: copy.permissionMessage,
      buttonPositive: copy.allowButton,
      buttonNegative: copy.notNow,
    })
    setHasPermission(result === PermissionsAndroid.RESULTS.GRANTED)
  }, [copy])

  if (hasPermission === null) return <ActivityIndicator style={styles.center} />

  if (!hasPermission) {
    return (
      <View style={styles.center}>
        <Text style={styles.permTitle}>{copy.unavailable}</Text>
        <Text style={styles.permSub}>{copy.permissionDetail}</Text>
        <TouchableOpacity style={styles.scanBtn} onPress={() => { void requestSmsPermission() }}><Text style={styles.scanBtnText}>{copy.allow}</Text></TouchableOpacity>
        <Text style={styles.permSub}>{copy.shareHint}</Text>
      </View>
    )
  }

  const visibleMessages = suspiciousOnly ? messages.filter((message) => message.scamScore >= 20) : messages
  const shareReport = async () => {
    if (messages.length === 0) return
    const suspicious = messages.filter((message) => message.scamScore >= 20)
    const body = [
      copy.reportTitle,
      `${copy.scanned}: ${messages.length}`,
      `${copy.suspicious}: ${suspicious.length}`,
      ...suspicious.slice(0, 20).map((message) => `${message.address}: ${message.scamScore}/100\n${message.body}`),
    ].join('\n\n')
    await Share.share({ message: body })
  }

  return (
    <View>
      <View style={styles.headerRow}>
        <SectionTitle>{copy.title}</SectionTitle>
        <View style={styles.headerActions}>
        <TouchableOpacity style={styles.filterBtn} onPress={() => setSuspiciousOnly((current) => !current)} disabled={messages.length === 0}>
          <Text style={styles.filterBtnText}>{suspiciousOnly ? copy.all : copy.riskOnly}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.shareBtn} onPress={() => { void shareReport() }} disabled={messages.length === 0}>
          <Text style={styles.shareBtnText}>{copy.share}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.scanBtn} onPress={scan} disabled={loading}>
          {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.scanBtnText}>{copy.scan}</Text>}
        </TouchableOpacity>
        </View>
      </View>

      {messages.length === 0 && !loading && (
        <Text style={styles.empty}>{copy.scanHint}</Text>
      )}
      {messages.length > 0 && <Text style={styles.summary}>{copy.found}: {messages.length} · {copy.suspicious}: {messages.filter((message) => message.scamScore >= 20).length}</Text>}

      {visibleMessages.map(msg => {
        const scamEntry = checkScamNumber(msg.address)
        const actions = responseActions(msg.scamScore, Boolean(scamEntry), copy)
        return (
          <Card key={msg.id} tone={msg.scamScore >= 75 ? 'critical' : msg.scamScore >= 45 ? 'high' : 'low'}>
            <View style={styles.msgHeader}>
              <Text style={styles.sender} numberOfLines={1}>{msg.address}</Text>
              <RiskChip score={msg.scamScore} copy={copy} />
            </View>
            {scamEntry && (
              <View style={styles.numAlert}>
                <Text style={styles.numAlertText}>⚠ {copy.knownNumber}: {scamEntry.reason}</Text>
              </View>
            )}
            <Text style={styles.body} numberOfLines={4}>{msg.body}</Text>
            {msg.scamReasons.length > 0 && <Text style={styles.reasons}>{copy.reasons}: {msg.scamReasons.slice(0, 3).join(' · ')}</Text>}
            <View style={styles.actionsPanel}>
              <Text style={styles.actionsTitle}>{copy.actions}</Text>
              {actions.map((action) => <Text key={action} style={styles.actionCopy}>• {action}</Text>)}
            </View>
            {onAnalyze && <TouchableOpacity style={styles.analyzeBtn} onPress={() => onAnalyze(msg.body)}><Text style={styles.analyzeBtnText}>{copy.fullAnalysis}</Text></TouchableOpacity>}
            {ai && <AiAssistButton ai={ai} context={`SMS sender: ${msg.address}\nLocal SMS score: ${msg.scamScore}/100\nReasons: ${msg.scamReasons.join('; ')}\nMessage: ${msg.body}`} label="Объяснить SMS через AI" />}
            <Text style={styles.date}>{new Date(msg.date).toLocaleString(lang === 'kz' ? 'kk-KZ' : lang === 'ru' ? 'ru-RU' : 'en-US', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</Text>
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
