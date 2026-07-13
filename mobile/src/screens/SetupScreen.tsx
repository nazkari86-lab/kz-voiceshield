import React, { useCallback, useEffect, useState } from 'react'
import { AppState, Linking, PermissionsAndroid, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { AccessibilityModule } from '@bridge/AccessibilityBridge'
import { CallModule } from '@bridge/CallModule'
import { DeviceSettings } from '@bridge/DeviceSettingsBridge'
import type { DeviceInfo } from '@bridge/DeviceSettingsBridge'
import { OverlayModule } from '@bridge/OverlayBridge'
import { NotificationAccess } from '@bridge/NotificationAccessBridge'
import { GEMMA_MODEL_URL, GEMMA_MODEL_SIZE_MB } from '../bridge/LLMBridge'
import { useTheme } from '../ThemeContext'
import { useI18n } from '../I18nContext'
import type { Language } from '../I18nContext'
import { colors } from '../theme'

type ModelSize = 'tiny' | 'small'

type Props = {
  modelReady: boolean
  modelProgress: number | null
  modelSizePref: ModelSize
  privacyConsent: boolean
  storageError: string | null
  callStatus: string
  caseCount: number
  onPrepareWhisper: () => void
  onImportWhisper: () => void
  onSetModelSize: (size: ModelSize) => Promise<void>
  onAcceptPrivacy: () => Promise<void>
  onDeclinePrivacy: () => Promise<void>
  onDeleteAllData: () => Promise<void>
}

type Status = { accessibility: boolean; battery: boolean; callRole: boolean; microphone: boolean; notificationAccess: boolean; notifications: boolean; overlay: boolean }
const emptyStatus: Status = { accessibility: false, battery: false, callRole: false, microphone: false, notificationAccess: false, notifications: false, overlay: false }

const Step = ({ label, status, disabled, onPress }: { label: string; status: boolean; disabled?: boolean; onPress: () => void }) => (
  <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.step, disabled && styles.disabled]}>
    <Text style={styles.stepTitle}>{label}</Text>
    <Text style={[styles.status, status && styles.statusReady]}>{status ? 'Ready' : 'Set up'}</Text>
  </Pressable>
)

export function SetupScreen({
  modelReady,
  modelProgress,
  modelSizePref,
  privacyConsent,
  storageError,
  callStatus,
  caseCount,
  onPrepareWhisper,
  onImportWhisper,
  onSetModelSize,
  onAcceptPrivacy,
  onDeclinePrivacy,
  onDeleteAllData,
}: Props) {
  const { colors: themeColors, mode: themeMode, setMode: setThemeMode } = useTheme()
  const { lang, setLang } = useI18n()

  const [status, setStatus] = useState<Status>(emptyStatus)
  const [device, setDevice] = useState<DeviceInfo | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const refresh = useCallback(async () => {
    const notificationPermission = Platform.OS === 'android' && Platform.Version >= 33
      ? await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)
      : true
    const [accessibility, overlay, callRole, microphone, battery, notificationAccess, deviceInfo] = await Promise.all([
      AccessibilityModule.isEnabled().catch(() => false),
      OverlayModule.canDrawOverlays().catch(() => false),
      CallModule.isRoleHeld().catch(() => false),
      PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO).catch(() => false),
      DeviceSettings.isIgnoringBatteryOptimizations().catch(() => false),
      NotificationAccess.isEnabled().catch(() => false),
      DeviceSettings.getDeviceInfo().catch(() => null),
    ])
    setStatus({ accessibility, battery, callRole, microphone, notificationAccess, notifications: notificationPermission, overlay })
    setDevice(deviceInfo)
  }, [])

  useEffect(() => {
    void refresh()
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh()
    })
    return () => subscription.remove()
  }, [refresh])

  const requestMicrophone = async () => {
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO)
    await refresh()
  }

  const requestNotifications = async () => {
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)
    }
    await refresh()
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Privacy and setup</Text>
      <Text style={styles.device}>{device ? `${device.manufacturer} ${device.model} · Android API ${device.androidApi}` : 'Android device'}</Text>

      <View style={[styles.notice, privacyConsent && styles.noticeAccepted]}>
        <Text style={styles.noticeTitle}>{privacyConsent ? 'Local protection consent accepted' : 'Consent required before protection starts'}</Text>
        <Text style={styles.copy}>VoiceShield processes call captions, microphone audio, active app names and notification types only during an active protection session. Notification text, secret codes and raw phone numbers are not retained. Number rules use device-bound HMAC identifiers. Saved cases are redacted and encrypted with Android Keystore. Local-only mode does not upload transcripts or audio.</Text>
        <View style={styles.row}>
          <Pressable style={styles.primary} onPress={() => { void onAcceptPrivacy().then(refresh) }}><Text style={styles.primaryText}>Agree</Text></Pressable>
          <Pressable style={styles.secondary} onPress={() => { void onDeclinePrivacy() }}><Text style={styles.secondaryText}>Not now</Text></Pressable>
        </View>
      </View>

      <View style={styles.prefSection}>
        <Text style={styles.section}>Внешний вид</Text>
        <View style={styles.toggleRow}>
          {(['auto', 'light', 'dark'] as const).map((m) => (
            <Pressable
              key={m}
              style={[styles.toggleChip, themeMode === m && styles.toggleChipActive]}
              onPress={() => setThemeMode(m)}
            >
              <Text style={[styles.toggleText, themeMode === m && styles.toggleTextActive]}>
                {m === 'auto' ? 'Авто' : m === 'light' ? 'Светлая' : 'Тёмная'}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={[styles.section, { marginTop: 10 }]}>Язык / Тіл</Text>
        <View style={styles.toggleRow}>
          {(['ru', 'kz'] as Language[]).map((l) => (
            <Pressable
              key={l}
              style={[styles.toggleChip, lang === l && styles.toggleChipActive]}
              onPress={() => setLang(l)}
            >
              <Text style={[styles.toggleText, lang === l && styles.toggleTextActive]}>
                {l === 'ru' ? 'Русский' : 'Қазақша'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {storageError && <Text style={styles.error}>{storageError}</Text>}
      <Text style={styles.section}>Required protection access</Text>
      <Step label="Accessibility Live Caption" status={status.accessibility} disabled={!privacyConsent} onPress={() => AccessibilityModule.openSettings()} />
      <Step label="Risk overlay" status={status.overlay} disabled={!privacyConsent} onPress={() => OverlayModule.openOverlaySettings()} />
      <Step label="Call screening role" status={status.callRole} disabled={!privacyConsent} onPress={() => { void CallModule.requestRole() }} />
      <Step label="Microphone fallback" status={status.microphone} disabled={!privacyConsent} onPress={() => { void requestMicrophone() }} />
      <Step label="Protection notification" status={status.notifications} disabled={!privacyConsent} onPress={() => { void requestNotifications() }} />
      <Step label="OTP notification type detection" status={status.notificationAccess} disabled={!privacyConsent} onPress={() => NotificationAccess.openSettings()} />
      <Step label="Battery optimization exemption" status={status.battery} disabled={!privacyConsent} onPress={() => DeviceSettings.openBatteryOptimizationSettings()} />

      <Text style={styles.section}>On-device speech model</Text>
      <Text style={styles.copy}>Choose model size then tap to download. Tiny (~75 MB) is faster with slightly lower accuracy. Small (~488 MB) is more accurate for RU/KZ. If Live Caption is available, download is optional.</Text>
      <View style={styles.modelToggle}>
        <Pressable style={[styles.modelOption, modelSizePref === 'tiny' && styles.modelOptionActive]} onPress={() => { void onSetModelSize('tiny') }}>
          <Text style={[styles.modelOptionText, modelSizePref === 'tiny' && styles.modelOptionTextActive]}>Tiny — Fast</Text>
          <Text style={[styles.modelOptionSub, modelSizePref === 'tiny' && styles.modelOptionSubActive]}>~75 MB · 1.5s latency</Text>
        </Pressable>
        <Pressable style={[styles.modelOption, modelSizePref === 'small' && styles.modelOptionActive]} onPress={() => { void onSetModelSize('small') }}>
          <Text style={[styles.modelOptionText, modelSizePref === 'small' && styles.modelOptionTextActive]}>Small — Accurate</Text>
          <Text style={[styles.modelOptionSub, modelSizePref === 'small' && styles.modelOptionSubActive]}>~488 MB · 3s latency</Text>
        </Pressable>
      </View>
      <Step label={modelProgress === null ? `Download ${modelSizePref === 'tiny' ? 'Whisper Tiny' : 'Whisper Small'}` : `Downloading: ${modelProgress}%`} status={modelReady} disabled={!privacyConsent || modelProgress !== null} onPress={onPrepareWhisper} />
      {modelSizePref === 'small' && <Step label="Import Whisper Small from Downloads" status={false} disabled={!privacyConsent || modelProgress !== null} onPress={onImportWhisper} />}

      <View style={styles.gemmaSection}>
        <Text style={styles.noticeTitle}>AI-ассистент (Gemma 3 1B IT)</Text>
        <Text style={styles.copy}>Нейросеть ~{GEMMA_MODEL_SIZE_MB}МБ для анализа транскриптов прямо на устройстве. Требует скачивания один раз.</Text>
        <Pressable style={styles.secondaryWide} onPress={() => { void Linking.openURL(GEMMA_MODEL_URL) }}>
          <Text style={styles.secondaryText}>Скачать gemma-3-1b-it-int4.task (~{GEMMA_MODEL_SIZE_MB}МБ)</Text>
        </Pressable>
        <Text style={styles.gemmaCopy}>После скачивания поместите файл в Загрузки. Затем откройте «AI-ассистент» → «Загрузить модель».</Text>
      </View>

      <View style={styles.localData}>
        <Text style={styles.noticeTitle}>Local data</Text>
        <Text style={styles.copy}>{caseCount} encrypted case(s). {callStatus}.</Text>
        {!confirmDelete ? (
          <Pressable style={styles.dangerOutline} onPress={() => setConfirmDelete(true)}><Text style={styles.dangerText}>Delete all local data</Text></Pressable>
        ) : (
          <View style={styles.row}>
            <Pressable style={styles.danger} onPress={() => { void onDeleteAllData(); setConfirmDelete(false) }}><Text style={styles.dangerButtonText}>Confirm delete</Text></Pressable>
            <Pressable style={styles.secondary} onPress={() => setConfirmDelete(false)}><Text style={styles.secondaryText}>Cancel</Text></Pressable>
          </View>
        )}
      </View>

      <Pressable accessibilityRole="button" onPress={() => DeviceSettings.openAppSettings()} style={styles.secondaryWide}>
        <Text style={styles.secondaryText}>Open Android app settings</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 11, padding: 4 },
  title: { color: colors.ink, fontSize: 24, fontWeight: '900' },
  device: { color: colors.sub, fontSize: 12 },
  notice: { backgroundColor: '#fff7ed', borderColor: '#fdba74', borderRadius: 8, borderWidth: 1, gap: 10, padding: 14 },
  noticeAccepted: { backgroundColor: '#f0fdf4', borderColor: '#86efac' },
  noticeTitle: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  copy: { color: colors.sub, fontSize: 13, lineHeight: 19 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primary: { backgroundColor: colors.brand, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 11 },
  primaryText: { color: '#fff', fontWeight: '900' },
  secondary: { borderColor: colors.border, borderRadius: 8, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 11 },
  secondaryWide: { alignItems: 'center', borderColor: colors.border, borderRadius: 8, borderWidth: 1, padding: 13 },
  secondaryText: { color: colors.ink, fontWeight: '800' },
  section: { color: colors.ink, fontSize: 14, fontWeight: '900', marginTop: 8 },
  step: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 52, paddingHorizontal: 14, paddingVertical: 10 },
  disabled: { opacity: 0.45 },
  stepTitle: { color: colors.ink, flex: 1, fontSize: 14, fontWeight: '800' },
  status: { color: '#b45309', fontSize: 12, fontWeight: '900' },
  statusReady: { color: '#15803d' },
  error: { backgroundColor: '#fef2f2', borderRadius: 8, color: '#991b1b', fontSize: 13, padding: 12 },
  localData: { borderColor: colors.border, borderRadius: 8, borderWidth: 1, gap: 9, marginTop: 8, padding: 14 },
  dangerOutline: { alignSelf: 'flex-start', borderColor: '#dc2626', borderRadius: 8, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 9 },
  dangerText: { color: '#dc2626', fontWeight: '900' },
  danger: { backgroundColor: '#dc2626', borderRadius: 8, paddingHorizontal: 13, paddingVertical: 10 },
  modelToggle: { flexDirection: 'row', gap: 8 },
  modelOption: { borderColor: colors.border, borderRadius: 8, borderWidth: 1, flex: 1, gap: 2, padding: 12 },
  modelOptionActive: { backgroundColor: colors.softBrand, borderColor: colors.brand },
  modelOptionText: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  modelOptionTextActive: { color: colors.brandDark },
  modelOptionSub: { color: colors.muted, fontSize: 11 },
  modelOptionSubActive: { color: colors.sub },
  dangerButtonText: { color: '#fff', fontWeight: '900' },
  gemmaSection: { backgroundColor: colors.chipBg, borderColor: colors.border, borderRadius: 10, borderWidth: 1, gap: 8, marginBottom: 14, padding: 14 },
  gemmaCopy: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  prefSection: { gap: 6 },
  toggleRow: { flexDirection: 'row', gap: 8 },
  toggleChip: { borderColor: colors.border, borderRadius: 8, borderWidth: 1, flex: 1, padding: 10 },
  toggleChipActive: { backgroundColor: colors.softBrand, borderColor: colors.brand },
  toggleText: { color: colors.ink, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  toggleTextActive: { color: colors.brandDark, fontWeight: '900' },
})
