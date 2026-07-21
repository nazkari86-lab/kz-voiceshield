import React, { useEffect, useState } from 'react'
import { Pressable, Share, StyleSheet, Switch, TextInput, View } from 'react-native'
import { CallModule } from '@bridge/CallModule'
import type { PhoneAssessment, PhoneCustomRule, PhoneProtectionConfig, PhoneRelationship } from '@bridge/CallModule'
import type { ScamEntry } from '../data/scamNumbers'
import { colors } from '../theme'
import { LocalizedText as Text } from './LocalizedText'
import type { OnDeviceAiRuntime } from '../hooks/useOnDeviceAiRuntime'
import { AiAssistButton } from './AiAssistButton'
import { inspectPhoneIdentity } from '../utils/phoneIdentity'
import { getNumberReputation, type NumberReputation } from '../utils/numberReputation'
import { lookupNumber, type ExternalNumberResult } from '../services/externalIntel'

const defaultConfig: PhoneProtectionConfig = {
  enabled: false,
  autoBlockCritical: false,
  blockHidden: false,
  blockInternational: false,
  blockUnknownNotContacts: false,
  blockRepeated: true,
  blockUnknownAtNight: false,
  repeatedMinIntervalSeconds: 5,
  nightStartHour: 22,
  nightEndHour: 7,
  quietHoursEnabled: false,
  quietStartMinute: 1320,
  quietEndMinute: 420,
  allowTrustedDuringQuiet: true,
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
  ai,
}: {
  autoDeleteTranscript: boolean
  onSetAutoDeleteTranscript: (enabled: boolean) => Promise<void>
  ai?: OnDeviceAiRuntime
}) {
  const [number, setNumber] = useState('')
  const [assessment, setAssessment] = useState<PhoneAssessment | null>(null)
  const [scamMatch, setScamMatch] = useState<ScamEntry | null>(null)
  const [numberReputation, setNumberReputation] = useState<NumberReputation | null>(null)
  const [config, setConfig] = useState<PhoneProtectionConfig>(defaultConfig)
  const [backup, setBackup] = useState('')
  const [status, setStatus] = useState('Local reputation is ready')
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [label, setLabel] = useState('')
  const [relationship, setRelationship] = useState<PhoneRelationship>('unknown')
  const [familyProtected, setFamilyProtected] = useState(false)
  const [customRules, setCustomRules] = useState<PhoneCustomRule[]>([])
  const [externalLookup, setExternalLookup] = useState<ExternalNumberResult | null>(null)
  const [ruleLabel, setRuleLabel] = useState('')
  const [rulePattern, setRulePattern] = useState('')
  const [ruleAction, setRuleAction] = useState<PhoneCustomRule['action']>('warn')
  const phoneIdentity = inspectPhoneIdentity(number)

  useEffect(() => {
    void CallModule.getProtectionConfig().then(setConfig).catch(() => setStatus('Call screening is not available on this build'))
    void CallModule.listCustomRules().then(setCustomRules).catch(() => undefined)
  }, [])

  const run = async (operation: (normalized: string) => Promise<PhoneAssessment>, message: string) => {
    const normalized = phoneIdentity.canonical
    if (!phoneIdentity.possible || normalized.replace(/\D/g, '').length < 3) {
      setStatus('Введите полный номер телефона перед выполнением действия')
      return
    }
    try {
      const result = await operation(normalized)
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

  const saveCustomRule = async () => {
    try {
      await CallModule.upsertCustomRule(ruleLabel, rulePattern, ruleAction, true)
      setCustomRules(await CallModule.listCustomRules())
      setRuleLabel('')
      setRulePattern('')
      setStatus('Custom number rule saved')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save custom rule')
    }
  }

  const runExternalLookup = async () => {
    if (!phoneIdentity.possible) { setStatus('Введите полный номер телефона перед онлайн-проверкой'); return }
    try {
      const result = await lookupNumber(phoneIdentity.canonical)
      setExternalLookup({ ...result, checkedAt: new Date().toISOString() })
      setStatus('Онлайн-данные номера получены. Это не подтверждение личности звонящего.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Онлайн-проверка недоступна')
    }
  }

  const deleteCustomRule = async (id: string) => {
    try {
      await CallModule.deleteCustomRule(id)
      setCustomRules(await CallModule.listCustomRules())
      setStatus('Custom number rule removed')
    } catch {
      setStatus('Could not remove custom rule')
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
          <Action label="Check" tone="primary" onPress={() => { const reputation = getNumberReputation(phoneIdentity.canonical); setNumberReputation(reputation); setScamMatch(reputation.scamMatch); void run((value) => CallModule.evaluateNumber(value), 'Number checked locally') }} />
          <Action label="Trust" onPress={() => { void run((value) => CallModule.setNumberDisposition(value, 'trusted'), 'Added to trusted list') }} />
          <Action label="Block" tone="danger" onPress={() => { void run((value) => CallModule.setNumberDisposition(value, 'blocked'), 'Added to block list') }} />
          <Action label="Neutral" onPress={() => { void run((value) => CallModule.setNumberDisposition(value, 'neutral'), 'Local disposition removed') }} />
          <Action label="Report spam" tone="danger" onPress={() => { void run((value) => CallModule.reportNumber(value, 'user_reported_spam'), 'Local complaint recorded') }} />
          <Action label="Online lookup" onPress={() => { void runExternalLookup() }} />
        </View>
      </View>
      {externalLookup ? <View style={[styles.panel, styles.verifiedAlert]}>
        <Text style={styles.verifiedTitle}>External provider: {externalLookup.provider}</Text>
        <Text style={styles.scamReason}>{externalLookup.valid === null ? 'Validity unknown' : externalLookup.valid ? 'Number format accepted' : 'Number format rejected'} · {externalLookup.countryCode ?? 'country unknown'} · {externalLookup.lineType ?? 'line type unknown'}</Text>
        <Text style={styles.scamSource}>{externalLookup.carrier ?? 'Carrier unavailable'} · Source: {externalLookup.provider} · Checked: {new Date(externalLookup.checkedAt ?? Date.now()).toLocaleString()} · Evidence only. Caller ID can still be spoofed.</Text>
      </View> : null}
      {number.trim() ? <View style={styles.formatNotice}>
        <Text style={styles.formatTitle}>{phoneIdentity.kind === 'short-code' ? 'Short code' : phoneIdentity.valid ? 'Validated format' : 'Check number format'}</Text>
        <Text style={styles.formatCopy}>{phoneIdentity.display} · {phoneIdentity.note}</Text>
      </View> : null}

      {scamMatch && (
        <View style={[styles.panel, styles.scamAlert]}>
          <Text style={styles.scamTitle}>{scamMatch.risk === 'critical' ? 'CRITICAL' : scamMatch.risk === 'high' ? 'HIGH RISK' : 'CAUTION'} — Pattern match</Text>
          <Text style={styles.scamReason}>{scamMatch.reason}</Text>
          <Text style={styles.scamSource}>Source: {scamMatch.source} · {scamMatch.verifiedAt}</Text>
        </View>
      )}

      {numberReputation?.verifiedBusiness && !scamMatch && (
        <View style={[styles.panel, styles.verifiedAlert]}>
          <Text style={styles.verifiedTitle}>Known official identifier · {numberReputation.verifiedBusiness.name}</Text>
          <Text style={styles.scamReason}>Channel: {numberReputation.verifiedBusiness.channel} · verified {numberReputation.verifiedBusiness.verifiedAt}</Text>
          <Text style={styles.scamSource}>Caller ID can be spoofed. Never share OTP, passwords or transfer money because a known short code is displayed.</Text>
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
          <View style={styles.confidenceBlock}>
            <View style={styles.confidenceHeading}><Text style={styles.confidenceLabel}>Local confidence</Text><Text style={styles.confidenceValue}>{Math.min(95, 35 + assessment.complaintCount * 12 + (scamMatch ? 35 : 0) + (assessment.category !== 'unknown' ? 15 : 0))}%</Text></View>
            <View style={styles.confidenceTrack}><View style={[styles.confidenceFill, { width: `${Math.min(95, 35 + assessment.complaintCount * 12 + (scamMatch ? 35 : 0) + (assessment.category !== 'unknown' ? 15 : 0))}%` }]} /></View>
            <Text style={styles.confidenceCopy}>{scamMatch ? 'Known-risk data and local history agree: do not call this number back.' : assessment.score >= 65 ? 'Local history indicates elevated risk. Verify using an official number, not this caller.' : 'This is a local estimate, not proof of identity. Verify unexpected requests independently.'}</Text>
          </View>
          {assessment.annotation.label ? <Text style={styles.annotationTitle}>{assessment.annotation.label} · {assessment.annotation.rating || '—'}/5</Text> : null}
          {assessment.annotation.comment ? <Text style={styles.annotationComment}>{assessment.annotation.comment}</Text> : null}
          {assessment.reasons.map((reason) => <Text key={reason} style={styles.reason}>• {reason}</Text>)}
        </View>
      )}
      {assessment && ai && <AiAssistButton ai={ai} context={`Number reputation: ${assessment.maskedNumber}. Risk ${assessment.score}/100. Category: ${assessment.category}. Action: ${assessment.action}. Reasons: ${assessment.reasons.join('; ')}`} label="Объяснить оценку номера через AI" />}

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
          <Action label="Save profile" tone="primary" onPress={() => { void run((value) => CallModule.annotateNumber(value, rating, comment, relationship, label, familyProtected), 'Encrypted number profile saved') }} />
          <Action label="Clear profile" onPress={() => { void run((value) => CallModule.clearNumberAnnotation(value), 'Private number profile removed') }} />
        </View>
      </View>

      <Text style={styles.section}>Automatic call rules</Text>
      <Setting label="Block only critical reputation" value={config.autoBlockCritical} onChange={(value) => { void updateConfig({ autoBlockCritical: value }) }} />
      <Setting label="Treat hidden numbers as critical" value={config.blockHidden} onChange={(value) => { void updateConfig({ blockHidden: value }) }} />
      <Setting label="Treat international numbers as high risk" value={config.blockInternational} onChange={(value) => { void updateConfig({ blockInternational: value }) }} />
      <Setting label="Warn when number is not in contacts" value={config.blockUnknownNotContacts} onChange={(value) => { void updateConfig({ blockUnknownNotContacts: value }) }} />
      <Setting label="Escalate repeated calls" value={config.blockRepeated} onChange={(value) => { void updateConfig({ blockRepeated: value }) }} />
      <View style={styles.setting}>
        <Text style={styles.settingLabel}>Rapid callback window</Text>
        <TextInput
          accessibilityLabel="Rapid callback interval in seconds"
          keyboardType="number-pad"
          onChangeText={(value) => {
            const next = Number(value.replace(/\D/gu, ''))
            if (Number.isFinite(next) && next > 0) void updateConfig({ repeatedMinIntervalSeconds: Math.min(300, next) })
          }}
          placeholder="5"
          placeholderTextColor={colors.muted}
          style={styles.intervalInput}
          value={String(config.repeatedMinIntervalSeconds)}
        />
      </View>
      <Setting label="Protect unknown callers during quiet hours" value={config.quietHoursEnabled} onChange={(value) => { void updateConfig({ quietHoursEnabled: value, blockUnknownAtNight: value }) }} />
      <View style={styles.setting}>
        <Text style={styles.settingLabel}>Quiet hours (minutes after midnight)</Text>
        <View style={styles.row}>
          <TextInput accessibilityLabel="Quiet hours start" keyboardType="number-pad" onChangeText={(value) => { const n = Number(value.replace(/\D/gu, '')); if (Number.isFinite(n)) void updateConfig({ quietStartMinute: Math.min(1439, n) }) }} placeholder="1320" placeholderTextColor={colors.muted} style={styles.intervalInput} value={String(config.quietStartMinute)} />
          <TextInput accessibilityLabel="Quiet hours end" keyboardType="number-pad" onChangeText={(value) => { const n = Number(value.replace(/\D/gu, '')); if (Number.isFinite(n)) void updateConfig({ quietEndMinute: Math.min(1439, n) }) }} placeholder="420" placeholderTextColor={colors.muted} style={styles.intervalInput} value={String(config.quietEndMinute)} />
        </View>
      </View>
      <Setting label="Allow trusted and family contacts during quiet hours" value={config.allowTrustedDuringQuiet} onChange={(value) => { void updateConfig({ allowTrustedDuringQuiet: value }) }} />
      <Setting label="Delete transcript when protection stops" value={autoDeleteTranscript} onChange={(value) => { void onSetAutoDeleteTranscript(value) }} />

      <Text style={styles.section}>Custom local rules</Text>
      <Text style={styles.copy}>Add lightweight regex rules for prefixes, short codes or known spam patterns. Rules run only on the normalized phone number and stay encrypted on this device.</Text>
      <View style={styles.panel}>
        <TextInput accessibilityLabel="Rule label" maxLength={80} onChangeText={setRuleLabel} placeholder="Rule label, e.g. Suspicious premium short codes" placeholderTextColor={colors.muted} style={styles.input} value={ruleLabel} />
        <TextInput accessibilityLabel="Number regex rule" autoCapitalize="none" maxLength={160} onChangeText={setRulePattern} placeholder="Regex, e.g. ^8?809|^\\+?998" placeholderTextColor={colors.muted} style={styles.input} value={rulePattern} />
        <View style={styles.row}>
          {(['warn', 'suggest_reject', 'block'] as const).map((action) => (
            <Pressable key={action} onPress={() => setRuleAction(action)} style={[styles.chip, ruleAction === action && styles.chipActive]}>
              <Text style={[styles.chipText, ruleAction === action && styles.chipTextActive]}>{action.replace('_', ' ')}</Text>
            </Pressable>
          ))}
          <Action label="Save rule" tone="primary" onPress={() => { void saveCustomRule() }} />
        </View>
        {customRules.length === 0 ? <Text style={styles.status}>No custom rules yet.</Text> : customRules.map((rule) => (
          <View key={rule.id} style={styles.ruleRow}>
            <View style={styles.ruleCopy}>
              <Text style={styles.ruleTitle}>{rule.label}</Text>
              <Text style={styles.ruleMeta}>{rule.action.replace('_', ' ')} · /{rule.pattern}/</Text>
            </View>
            <Pressable style={styles.removeRule} onPress={() => { void deleteCustomRule(rule.id) }}>
              <Text style={styles.removeRuleText}>Remove</Text>
            </Pressable>
          </View>
        ))}
      </View>

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
  confidenceBlock: { backgroundColor: '#f8fafc', borderRadius: 7, gap: 5, padding: 10 },
  confidenceHeading: { flexDirection: 'row', justifyContent: 'space-between' },
  confidenceLabel: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  confidenceValue: { color: colors.brandDark, fontSize: 12, fontWeight: '900' },
  confidenceTrack: { backgroundColor: '#dbeafe', borderRadius: 99, height: 7, overflow: 'hidden' },
  confidenceFill: { backgroundColor: colors.brand, borderRadius: 99, height: '100%' },
  confidenceCopy: { color: colors.sub, fontSize: 11, lineHeight: 16 },
  formatNotice: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe', borderRadius: 7, borderWidth: 1, gap: 3, padding: 10 },
  formatTitle: { color: '#1d4ed8', fontSize: 11, fontWeight: '900' },
  formatCopy: { color: '#334155', fontSize: 11, lineHeight: 16 },
  annotationTitle: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  annotationComment: { backgroundColor: '#f8fafc', borderRadius: 6, color: colors.sub, fontSize: 13, lineHeight: 19, padding: 10 },
  reason: { color: '#334155', fontSize: 12, lineHeight: 18 },
  section: { color: colors.ink, fontSize: 15, fontWeight: '900', marginTop: 5 },
  setting: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 52, paddingHorizontal: 13 },
  settingLabel: { color: colors.ink, flex: 1, fontSize: 13, fontWeight: '800', paddingRight: 8 },
  intervalInput: { backgroundColor: '#fff', borderColor: colors.border, borderRadius: 8, borderWidth: 1, color: colors.ink, fontSize: 13, fontWeight: '900', minWidth: 70, paddingHorizontal: 10, paddingVertical: 8, textAlign: 'center' },
  status: { color: colors.sub, fontSize: 12, lineHeight: 18 },
  scamAlert: { borderColor: '#dc2626', borderLeftWidth: 4, borderWidth: 1 },
  verifiedAlert: { backgroundColor: '#ecfdf5', borderColor: '#86efac', borderWidth: 1 },
  verifiedTitle: { color: '#166534', fontSize: 12, fontWeight: '900' },
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
  ruleRow: { alignItems: 'center', backgroundColor: '#f8fafc', borderColor: colors.border, borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 8, padding: 10 },
  ruleCopy: { flex: 1 },
  ruleTitle: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  ruleMeta: { color: colors.sub, fontSize: 11, marginTop: 2 },
  removeRule: { borderColor: '#fecaca', borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  removeRuleText: { color: '#991b1b', fontSize: 11, fontWeight: '900' },
})
