import React, { useEffect, useState } from 'react'
import { Pressable, Share, StyleSheet, Switch, Text, TextInput, View } from 'react-native'
import { CallModule } from '@bridge/CallModule'
import type { PhoneAssessment, PhoneProtectionConfig } from '@bridge/CallModule'
import { colors } from '../theme'

const defaultConfig: PhoneProtectionConfig = {
  enabled: false,
  autoBlockCritical: false,
  blockHidden: false,
  blockInternational: false,
  blockRepeated: true,
  blockUnknownAtNight: false,
  nightStartHour: 22,
  nightEndHour: 7,
}

const Action = ({ label, tone, onPress }: { label: string; tone?: 'danger' | 'primary'; onPress: () => void }) => (
  <Pressable onPress={onPress} style={[styles.action, tone === 'primary' && styles.primary, tone === 'danger' && styles.danger]}>
    <Text style={[styles.actionText, tone && styles.actionTextLight]}>{label}</Text>
  </Pressable>
)

const Setting = ({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) => (
  <View style={styles.setting}>
    <Text style={styles.settingLabel}>{label}</Text>
    <Switch value={value} onValueChange={onChange} trackColor={{ false: '#cbd5e1', true: '#67e8f9' }} thumbColor={value ? colors.brand : '#f8fafc'} />
  </View>
)

export function NumberShieldView({
  autoDeleteTranscript,
  onSetAutoDeleteTranscript,
}: {
  autoDeleteTranscript: boolean
  onSetAutoDeleteTranscript: (enabled: boolean) => Promise<void>
}) {
  const [number, setNumber] = useState('')
  const [assessment, setAssessment] = useState<PhoneAssessment | null>(null)
  const [config, setConfig] = useState<PhoneProtectionConfig>(defaultConfig)
  const [backup, setBackup] = useState('')
  const [status, setStatus] = useState('Local reputation is ready')

  useEffect(() => {
    void CallModule.getProtectionConfig().then(setConfig).catch(() => setStatus('Call screening is not available on this build'))
  }, [])

  const run = async (operation: () => Promise<PhoneAssessment>, message: string) => {
    try {
      const result = await operation()
      setAssessment(result)
      setStatus(message)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Number operation failed')
    }
  }

  const updateConfig = async (patch: Partial<PhoneProtectionConfig>) => {
    try {
      const next = await CallModule.updateProtectionConfig(patch)
      setConfig(next)
      setStatus('Protection rules updated')
    } catch {
      setStatus('Could not update call screening rules')
    }
  }

  const exportRules = async () => {
    const payload = await CallModule.exportProtectionData()
    setBackup(payload)
    await Share.share({ title: 'VoiceShield number rules', message: payload })
  }

  const importRules = async () => {
    try {
      await CallModule.importProtectionData(backup)
      setConfig(await CallModule.getProtectionConfig())
      setStatus('Rules imported. Device-bound identifiers work only on the device that created the backup.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Rules import failed')
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Number Shield</Text>
      <Text style={styles.copy}>Check a number before calling back. VoiceShield stores a device-bound HMAC identifier, not the full number. Reputation is local until a verified shared service is deployed.</Text>

      <View style={styles.panel}>
        <TextInput
          accessibilityLabel="Phone number to check"
          keyboardType="phone-pad"
          onChangeText={setNumber}
          placeholder="+7 700 000 00 00"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={number}
        />
        <View style={styles.row}>
          <Action label="Check" tone="primary" onPress={() => { void run(() => CallModule.evaluateNumber(number), 'Number checked locally') }} />
          <Action label="Trust" onPress={() => { void run(() => CallModule.setNumberDisposition(number, 'trusted'), 'Added to trusted list') }} />
          <Action label="Block" tone="danger" onPress={() => { void run(() => CallModule.setNumberDisposition(number, 'blocked'), 'Added to block list') }} />
          <Action label="Neutral" onPress={() => { void run(() => CallModule.setNumberDisposition(number, 'neutral'), 'Local disposition removed') }} />
          <Action label="Report spam" tone="danger" onPress={() => { void run(() => CallModule.reportNumber(number, 'user_reported_spam'), 'Local complaint recorded') }} />
        </View>
      </View>

      {assessment && (
        <View style={[styles.panel, assessment.score >= 65 && styles.risky]}>
          <View style={styles.scoreRow}>
            <View><Text style={styles.masked}>{assessment.maskedNumber}</Text><Text style={styles.category}>{assessment.category.replace('_', ' ')}</Text></View>
            <View style={styles.score}><Text style={styles.scoreValue}>{assessment.score}</Text><Text style={styles.scoreLabel}>risk</Text></View>
          </View>
          <Text style={styles.actionLabel}>Action: {assessment.action.replace('_', ' ')}</Text>
          <Text style={styles.meta}>Trust {assessment.trustRating}/100 · {assessment.complaintCount} local complaint(s)</Text>
          {assessment.reasons.map((reason) => <Text key={reason} style={styles.reason}>• {reason}</Text>)}
        </View>
      )}

      <Text style={styles.section}>Automatic call rules</Text>
      <Setting label="Block only critical reputation" value={config.autoBlockCritical} onChange={(value) => { void updateConfig({ autoBlockCritical: value }) }} />
      <Setting label="Treat hidden numbers as critical" value={config.blockHidden} onChange={(value) => { void updateConfig({ blockHidden: value }) }} />
      <Setting label="Treat international numbers as high risk" value={config.blockInternational} onChange={(value) => { void updateConfig({ blockInternational: value }) }} />
      <Setting label="Escalate repeated calls" value={config.blockRepeated} onChange={(value) => { void updateConfig({ blockRepeated: value }) }} />
      <Setting label="Block unknown callers 22:00–07:00" value={config.blockUnknownAtNight} onChange={(value) => { void updateConfig({ blockUnknownAtNight: value }) }} />
      <Setting label="Delete transcript when protection stops" value={autoDeleteTranscript} onChange={(value) => { void onSetAutoDeleteTranscript(value) }} />

      <Text style={styles.section}>Rules backup</Text>
      <TextInput
        accessibilityLabel="Rules backup JSON"
        multiline
        onChangeText={setBackup}
        placeholder="Exported rules JSON"
        placeholderTextColor={colors.muted}
        style={[styles.input, styles.backup]}
        value={backup}
      />
      <View style={styles.row}>
        <Action label="Export" onPress={() => { void exportRules() }} />
        <Action label="Import" onPress={() => { void importRules() }} />
      </View>
      <Text style={styles.status}>{status}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  title: { color: colors.ink, fontSize: 22, fontWeight: '900' },
  copy: { color: colors.sub, fontSize: 13, lineHeight: 19 },
  panel: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, gap: 10, padding: 14 },
  risky: { borderColor: '#ef4444', borderLeftWidth: 5 },
  input: { backgroundColor: '#fff', borderColor: colors.border, borderRadius: 8, borderWidth: 1, color: colors.ink, fontSize: 15, minHeight: 48, paddingHorizontal: 12, paddingVertical: 10 },
  backup: { minHeight: 110, textAlignVertical: 'top' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: { borderColor: colors.border, borderRadius: 8, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 10 },
  primary: { backgroundColor: colors.brand, borderColor: colors.brand },
  danger: { backgroundColor: '#b91c1c', borderColor: '#b91c1c' },
  actionText: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  actionTextLight: { color: '#fff' },
  scoreRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  masked: { color: colors.ink, fontSize: 20, fontWeight: '900' },
  category: { color: colors.sub, fontSize: 12, marginTop: 2 },
  score: { alignItems: 'center', backgroundColor: '#fef2f2', borderRadius: 8, minWidth: 64, padding: 8 },
  scoreValue: { color: '#991b1b', fontSize: 24, fontWeight: '900' },
  scoreLabel: { color: '#991b1b', fontSize: 10, fontWeight: '800' },
  actionLabel: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  meta: { color: colors.sub, fontSize: 12 },
  reason: { color: '#334155', fontSize: 12, lineHeight: 18 },
  section: { color: colors.ink, fontSize: 15, fontWeight: '900', marginTop: 5 },
  setting: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 52, paddingHorizontal: 13 },
  settingLabel: { color: colors.ink, flex: 1, fontSize: 13, fontWeight: '800', paddingRight: 8 },
  status: { color: colors.sub, fontSize: 12, lineHeight: 18 },
})
