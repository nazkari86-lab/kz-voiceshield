import React, { useEffect, useState } from 'react'
import { Pressable, Share, StyleSheet, Switch, TextInput, View } from 'react-native'
import { CallModule } from '@bridge/CallModule'
import type { PhoneAssessment, PhoneProtectionConfig, PhoneRelationship } from '@bridge/CallModule'
import { checkScamNumber } from '../data/scamNumbers'
import type { ScamEntry } from '../data/scamNumbers'
import { colors } from '../theme'
import { LocalizedText as Text } from './LocalizedText'

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

const relationships: { id: PhoneRelationship; label: string }[] = [
  { id: 'family', label: 'Family' }, { id: 'friend', label: 'Friend' },
  { id: 'work', label: 'Work' }, { id: 'bank', label: 'Bank' },
  { id: 'delivery', label: 'Delivery' }, { id: 'medical', label: 'Medical' },
  { id: 'government', label: 'Government' }, { id: 'unknown', label: 'Other' },
]

export function NumberShieldView({
  autoDeleteTranscript,
  onSetAutoDeleteTranscript,
}: {
  autoDeleteTranscript: boolean
  onSetAutoDeleteTranscript: (enabled: boolean) => Promise<void>
}) {
  const [number, setNumber] = useState('')
  const [assessment, setAssessment] = useState<PhoneAssessment | null>(null)
  const [scamMatch, setScamMatch] = useState<ScamEntry | null>(null)
  const [config, setConfig] = useState<PhoneProtectionConfig>(defaultConfig)
  const [backup, setBackup] = useState('')
  const [status, setStatus] = useState('Local reputation is ready')
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [label, setLabel] = useState('')
  const [relationship, setRelationship] = useState<PhoneRelationship>('unknown')
  const [familyProtected, setFamilyProtected] = useState(false)

  useEffect(() => {
    void CallModule.getProtectionConfig().then(setConfig).catch(() => setStatus('Call screening is not available on this build'))
  }, [])

  const run = async (operation: () => Promise<PhoneAssessment>, message: string) => {
    try {
      const result = await operation()
      setAssessment(result)
      setRating(result.annotation.rating)
      setComment(result.annotation.comment)
      setLabel(result.annotation.label)
      setRelationship(result.annotation.relationship)
      setFamilyProtected(result.annotation.familyProtected)
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
      <Text style={styles.copy}>Check a number before calling back. VoiceShield stores a device-bound HMAC identifier, not the full number. Reputation is local until a verified shared service is available.</Text>

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
          <Action label="Check" tone="primary" onPress={() => { setScamMatch(checkScamNumber(number)); void run(() => CallModule.evaluateNumber(number), 'Number checked locally') }} />
          <Action label="Trust" onPress={() => { void run(() => CallModule.setNumberDisposition(number, 'trusted'), 'Added to trusted list') }} />
          <Action label="Block" tone="danger" onPress={() => { void run(() => CallModule.setNumberDisposition(number, 'blocked'), 'Added to block list') }} />
          <Action label="Neutral" onPress={() => { void run(() => CallModule.setNumberDisposition(number, 'neutral'), 'Local disposition removed') }} />
          <Action label="Report spam" tone="danger" onPress={() => { void run(() => CallModule.reportNumber(number, 'user_reported_spam'), 'Local complaint recorded') }} />
        </View>
      </View>

      {scamMatch && (
        <View style={[styles.panel, styles.scamAlert]}>
          <Text style={styles.scamTitle}>{scamMatch.risk === 'critical' ? 'CRITICAL' : scamMatch.risk === 'high' ? 'HIGH RISK' : 'CAUTION'} — Pattern match</Text>
          <Text style={styles.scamReason}>{scamMatch.reason}</Text>
          <Text style={styles.scamSource}>Source: {scamMatch.source} · {scamMatch.verifiedAt}</Text>
        </View>
      )}

      {assessment && (
        <View style={[styles.panel, assessment.score >= 65 && styles.risky]}>
          <View style={styles.scoreRow}>
            <View><Text style={styles.masked}>{assessment.maskedNumber}</Text><Text style={styles.category}>{assessment.category.replace('_', ' ')}</Text></View>
            <View style={styles.score}><Text style={styles.scoreValue}>{assessment.score}</Text><Text style={styles.scoreLabel}>risk</Text></View>
          </View>
          <Text style={styles.actionLabel}>Action: {assessment.action.replace('_', ' ')}</Text>
          <Text style={styles.meta}>Trust {assessment.trustRating}/100 · {assessment.complaintCount} local complaint(s)</Text>
          {assessment.annotation.label ? <Text style={styles.annotationTitle}>{assessment.annotation.label} · {assessment.annotation.rating || '—'}/5</Text> : null}
          {assessment.annotation.comment ? <Text style={styles.annotationComment}>{assessment.annotation.comment}</Text> : null}
          {assessment.reasons.map((reason) => <Text key={reason} style={styles.reason}>• {reason}</Text>)}
        </View>
      )}

      <Text style={styles.section}>Private number profile</Text>
      <Text style={styles.copy}>Your label, rating and comment are encrypted with Android Keystore. They appear on the VoiceShield call screen and never enter the exported rules backup.</Text>
      <View style={styles.panel}>
        <TextInput accessibilityLabel="Contact label" maxLength={80} onChangeText={setLabel} placeholder="Name or label" placeholderTextColor={colors.muted} style={styles.input} value={label} />
        <Text style={styles.fieldLabel}>Your rating</Text>
        <View style={styles.ratingRow}>
          {[1, 2, 3, 4, 5].map((value) => (
            <Pressable accessibilityLabel={`Rate ${value} of 5`} key={value} onPress={() => setRating(value === rating ? 0 : value)} style={[styles.star, value <= rating && styles.starActive]}>
              <Text style={[styles.starText, value <= rating && styles.starTextActive]}>★</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.fieldLabel}>Number type</Text>
        <View style={styles.row}>
          {relationships.map((item) => (
            <Pressable key={item.id} onPress={() => { setRelationship(item.id); if (item.id === 'family') setFamilyProtected(true) }} style={[styles.chip, relationship === item.id && styles.chipActive]}>
              <Text style={[styles.chipText, relationship === item.id && styles.chipTextActive]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput accessibilityLabel="Private number comment" maxLength={500} multiline onChangeText={setComment} placeholder="What should you or a family member know about this caller?" placeholderTextColor={colors.muted} style={[styles.input, styles.comment]} value={comment} />
        <Setting label="Protected family number" value={familyProtected} onChange={setFamilyProtected} />
        <View style={styles.row}>
          <Action label="Save profile" tone="primary" onPress={() => { void run(() => CallModule.annotateNumber(number, rating, comment, relationship, label, familyProtected), 'Encrypted number profile saved') }} />
          <Action label="Clear profile" onPress={() => { void run(() => CallModule.clearNumberAnnotation(number), 'Private number profile removed') }} />
        </View>
      </View>

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
  annotationTitle: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  annotationComment: { backgroundColor: '#f8fafc', borderRadius: 6, color: colors.sub, fontSize: 13, lineHeight: 19, padding: 10 },
  reason: { color: '#334155', fontSize: 12, lineHeight: 18 },
  section: { color: colors.ink, fontSize: 15, fontWeight: '900', marginTop: 5 },
  setting: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 52, paddingHorizontal: 13 },
  settingLabel: { color: colors.ink, flex: 1, fontSize: 13, fontWeight: '800', paddingRight: 8 },
  status: { color: colors.sub, fontSize: 12, lineHeight: 18 },
  scamAlert: { borderColor: '#dc2626', borderLeftWidth: 4, borderWidth: 1 },
  scamTitle: { color: '#991b1b', fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },
  scamReason: { color: colors.ink, fontSize: 13, lineHeight: 19 },
  scamSource: { color: colors.muted, fontSize: 11 },
  fieldLabel: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  ratingRow: { flexDirection: 'row', gap: 8 },
  star: { alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 8, height: 44, justifyContent: 'center', width: 44 },
  starActive: { backgroundColor: '#fef3c7' },
  starText: { color: '#94a3b8', fontSize: 24 },
  starTextActive: { color: '#d97706' },
  chip: { backgroundColor: '#f1f5f9', borderColor: colors.border, borderRadius: 8, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 9 },
  chipActive: { backgroundColor: '#e0f2fe', borderColor: colors.brand },
  chipText: { color: colors.sub, fontSize: 12, fontWeight: '800' },
  chipTextActive: { color: colors.brand },
  comment: { minHeight: 92, textAlignVertical: 'top' },
})
