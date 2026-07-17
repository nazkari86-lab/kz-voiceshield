import React, { useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import type { ModelStorageInfo } from '../data/whisperModels'
import { DeviceSettings, type DeviceInfo } from '../bridge/DeviceSettingsBridge'
import { colors } from '../theme'
import { LocalizedText as Text } from './LocalizedText'

type Props = { modelReady: boolean; privacyConsent: boolean; modelStorage: ModelStorageInfo | null; callStatus: string }
type Health = { label: string; detail: string; ok: boolean }

export function PrivacyHealthView({ modelReady, privacyConsent, modelStorage, callStatus }: Props) {
  const [device, setDevice] = useState<DeviceInfo | null>(null)
  const [batteryIgnored, setBatteryIgnored] = useState<boolean | null>(null)
  useEffect(() => {
    void DeviceSettings?.getDeviceInfo().then(setDevice).catch(() => undefined)
    void DeviceSettings?.isIgnoringBatteryOptimizations().then(setBatteryIgnored).catch(() => undefined)
  }, [])
  const freeGb = modelStorage ? modelStorage.availableBytes / 1024 ** 3 : null
  const checks: Health[] = [
    { label: 'Локальная модель', detail: modelReady ? 'Готова к локальной расшифровке.' : 'Не подготовлена: Live Shield может быть недоступен.', ok: modelReady },
    { label: 'Приватность', detail: privacyConsent ? 'Локальное хранилище и согласия настроены.' : 'Нужно завершить privacy setup.', ok: privacyConsent },
    { label: 'Свободное место', detail: freeGb === null ? 'Память ещё определяется.' : `${freeGb.toFixed(1)} GB свободно на устройстве.`, ok: freeGb === null || freeGb >= 2 },
    { label: 'Battery optimization', detail: batteryIgnored === true ? 'Исключение включено.' : 'Для долгой работы на Xiaomi можно добавить приложение в исключения.', ok: batteryIgnored === true },
  ]
  return <View style={styles.container}>
    <View style={styles.hero}><Text style={styles.eyebrow}>DEVICE HEALTH</Text><Text style={styles.title}>Privacy and readiness</Text><Text style={styles.copy}>Показывает только состояние устройства. Номера, сообщения и аудио не отправляются для этой проверки.</Text></View>
    {checks.map((check) => <View key={check.label} style={[styles.card, check.ok ? styles.good : styles.attention]}><View style={styles.row}><Text style={styles.cardTitle}>{check.label}</Text><Text style={[styles.badge, check.ok ? styles.goodText : styles.attentionText]}>{check.ok ? 'READY' : 'ACTION'}</Text></View><Text style={styles.detail}>{check.detail}</Text></View>)}
    {device ? <View style={styles.card}><Text style={styles.cardTitle}>{device.manufacturer} {device.model}</Text><Text style={styles.detail}>Android API {device.androidApi}. Call state: {callStatus || 'not active'}.</Text></View> : null}
    <Pressable style={styles.button} onPress={() => DeviceSettings?.requestBatteryOptimizationExemption()}><Text style={styles.buttonText}>Open battery protection</Text></Pressable>
    <Pressable style={styles.secondary} onPress={() => DeviceSettings?.openAppSettings()}><Text style={styles.secondaryText}>Open application settings</Text></Pressable>
  </View>
}

const styles = StyleSheet.create({
  container: { gap: 10 }, hero: { backgroundColor: colors.brandDark, borderRadius: 8, gap: 6, padding: 18 }, eyebrow: { color: '#8fe0bd', fontSize: 10, fontWeight: '900', letterSpacing: 1 }, title: { color: '#fff', fontSize: 23, fontWeight: '900' }, copy: { color: '#d7efe3', fontSize: 13, lineHeight: 19 }, card: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, gap: 5, padding: 13 }, good: { borderLeftColor: '#15803d', borderLeftWidth: 4 }, attention: { borderLeftColor: '#d97706', borderLeftWidth: 4 }, row: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, cardTitle: { color: colors.ink, fontSize: 14, fontWeight: '900' }, detail: { color: colors.sub, fontSize: 12, lineHeight: 18 }, badge: { fontSize: 10, fontWeight: '900' }, goodText: { color: '#15803d' }, attentionText: { color: '#b45309' }, button: { alignSelf: 'flex-start', backgroundColor: colors.brand, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 11 }, buttonText: { color: '#fff', fontWeight: '900' }, secondary: { alignSelf: 'flex-start', borderColor: colors.border, borderRadius: 8, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11 }, secondaryText: { color: colors.ink, fontWeight: '800' },
})
