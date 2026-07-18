import React, { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { datasetSplitAudit, type DatasetQuality, type SavedCase } from '@scoring'
import { colors } from '../theme'
import { Card, Metric, SectionTitle, ui } from './ui'
import { LocalizedText as Text } from './LocalizedText'
import type { DonationReadiness } from '../utils/donationLab'

type Props = {
  cases: SavedCase[]
  quality: DatasetQuality
  caseCount: number
  donationReadiness: DonationReadiness
  datasetStageTotals: [string, number][]
  donationConsent: boolean
  onSetDonation: (accepted: boolean) => void
  onDonate: () => void
  onExportJsonl: () => void
  onExportCsv: () => void
  onExportSplit: () => void
  onClear: () => void
}

export function DatasetView({ cases, quality, caseCount, donationReadiness, datasetStageTotals, donationConsent, onSetDonation, onDonate, onExportJsonl, onExportCsv, onExportSplit, onClear }: Props) {
  const disabled = caseCount === 0
  const canDonate = donationConsent && donationReadiness.eligibleCases > 0
  const [confirmClear, setConfirmClear] = useState(false)
  const splitAudit = datasetSplitAudit(cases)
  const readiness = [
    splitAudit.eligibleCaseCount < 30 ? 'Need at least 30 trusted, labelled cases before using a split for experimentation.' : '',
    quality.labelBalance.true_positive === 0 ? 'No reviewer-confirmed fraud examples yet.' : '',
    quality.labelBalance.false_positive === 0 ? 'No false-positive examples yet; safe-message coverage is incomplete.' : '',
    quality.duplicateGroups.length > 0 ? `${quality.duplicateGroups.length} duplicate group(s) should be reviewed before training.` : '',
  ].filter(Boolean)
  return (
    <View>
      <SectionTitle>Improve protection (opt-in)</SectionTitle>
      <Card tone={donationConsent ? 'low' : undefined}>
        <Text style={styles.donateBody}>
          Donate reviewed cases to improve RU/KZ fraud detection. Nothing is uploaded automatically:
          VoiceShield builds a redacted quarantine JSONL and Android shows the share sheet. Raw audio,
          raw phone numbers, SMS codes, PIN/CVV and long numbers are excluded.
        </Text>
        <View style={ui.row}>
          <Metric value={donationReadiness.eligibleCases} label="donation-ready" />
          <Metric value={donationReadiness.trustedEligibleCases} label="review-trusted" />
          <Metric value={donationReadiness.labelBalance.fraud} label="fraud" />
          <Metric value={donationReadiness.labelBalance.safe} label="safe" />
          <Metric value={donationReadiness.labelBalance.needs_review} label="needs review" />
        </View>
        <View style={styles.redactionBox}>
          <Text style={styles.schema}>Redaction preview</Text>
          <Text style={styles.muted}>Long numbers/cards: {donationReadiness.redactionTotals.cardOrLongNumber} · code/IIN context: {donationReadiness.redactionTotals.codeOrIdentity} · other numbers: {donationReadiness.redactionTotals.genericNumber}</Text>
        </View>
        {donationReadiness.warnings.map((warning) => <Text key={warning} style={styles.warning}>• {warning}</Text>)}
        <View style={styles.actions}>
          <Pressable
            style={[styles.toggle, donationConsent && styles.toggleOn]}
            onPress={() => onSetDonation(!donationConsent)}
          >
            <Text style={[styles.toggleText, donationConsent && styles.toggleTextOn]}>
              {donationConsent ? '✓ Donation consent on' : 'Enable donation'}
            </Text>
          </Pressable>
          <Pressable style={[styles.ghost, !canDonate && styles.off]} disabled={!canDonate} onPress={onDonate}>
            <Text style={styles.ghostText}>Share {donationReadiness.eligibleCases} quarantine row(s)</Text>
          </Pressable>
        </View>
      </Card>

      <SectionTitle>Export</SectionTitle>
      <View style={styles.actions}>
        <Pressable style={[styles.ghost, disabled && styles.off]} disabled={disabled} onPress={onExportJsonl}><Text style={styles.ghostText}>Share JSONL</Text></Pressable>
        <Pressable style={[styles.ghost, disabled && styles.off]} disabled={disabled} onPress={onExportCsv}><Text style={styles.ghostText}>Share CSV</Text></Pressable>
        <Pressable style={[styles.ghost, disabled && styles.off]} disabled={disabled} onPress={onExportSplit}><Text style={styles.ghostText}>Share split</Text></Pressable>
        {confirmClear ? (
          <>
            <Pressable style={[styles.dangerFill, disabled && styles.off]} disabled={disabled} onPress={() => { onClear(); setConfirmClear(false) }}><Text style={styles.dangerFillText}>Confirm clear</Text></Pressable>
            <Pressable style={styles.cancel} onPress={() => setConfirmClear(false)}><Text style={styles.cancelText}>Cancel</Text></Pressable>
          </>
        ) : (
          <Pressable style={[styles.danger, disabled && styles.off]} disabled={disabled} onPress={() => setConfirmClear(true)}><Text style={styles.dangerText}>Clear</Text></Pressable>
        )}
      </View>

      <View style={ui.row}>
        <Metric value={quality.total} label="cases" />
        <Metric value={quality.labelBalance.true_positive} label="true positive" />
        <Metric value={quality.labelBalance.false_positive} label="false positive" />
        <Metric value={quality.labelBalance.needs_review} label="needs review" />
        <Metric value={quality.unlabeledCount} label="unreviewed" />
        <Metric value={quality.untrustedCount} label="untrusted" />
        <Metric value={quality.duplicateGroups.length} label="duplicate groups" />
        <Metric value={quality.falsePositiveReview.length} label="FP to review" />
        <Metric value={quality.averageWords} label="avg words" />
      </View>

      <SectionTitle>Dataset readiness</SectionTitle>
      <Card tone={readiness.length ? 'medium' : 'low'}>
        <Text style={styles.schema}>Frozen split · {splitAudit.strategy}</Text>
        <Text style={styles.muted}>Eligible: {splitAudit.eligibleCaseCount} · train {splitAudit.counts.train} · dev {splitAudit.counts.dev} · test {splitAudit.counts.test}</Text>
        <Text style={styles.muted}>Split fingerprint: {splitAudit.fingerprint}. The same eligible case IDs and versions always produce the same split.</Text>
        {readiness.length > 0 ? readiness.map((item) => <Text key={item} style={styles.warning}>• {item}</Text>) : <Text style={styles.ready}>Quality checks passed for an experimental export. This is not proof of production model accuracy.</Text>}
      </Card>

      <SectionTitle>Stage coverage</SectionTitle>
      {datasetStageTotals.length === 0 ? (
        <Text style={styles.muted}>No stage coverage yet.</Text>
      ) : (
        datasetStageTotals.map(([stage, count]) => (
          <View key={stage} style={styles.stageRow}>
            <Text style={styles.stageName}>{stage}</Text>
            <Text style={styles.stageMeta}>{count} matched rule(s)</Text>
          </View>
        ))
      )}

      <Card>
        <Text style={styles.schema}>Training fields · {quality.schemaVersion}</Text>
        <Text style={styles.muted}>
          Exports include redacted transcript, provenance, trust state, score, risk, confidence, evidence and label.
          Split JSON includes only reviewer-trusted, labeled cases to reduce training-data poisoning.
        </Text>
      </Card>
    </View>
  )
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  ghost: { borderColor: colors.brand, borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  ghostText: { color: colors.brand, fontSize: 12, fontWeight: '800' },
  danger: { borderColor: '#ef4444', borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  dangerText: { color: '#ef4444', fontSize: 12, fontWeight: '800' },
  dangerFill: { backgroundColor: '#dc2626', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  dangerFillText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  cancel: { borderColor: colors.border, borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  cancelText: { color: colors.sub, fontSize: 12, fontWeight: '800' },
  off: { opacity: 0.4 },
  donateBody: { color: '#334155', fontSize: 13, lineHeight: 19, marginBottom: 4 },
  redactionBox: { backgroundColor: colors.chipBg, borderColor: colors.border, borderRadius: 8, borderWidth: 1, gap: 4, marginBottom: 8, padding: 10 },
  toggle: { borderColor: colors.border, borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  toggleOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  toggleText: { color: colors.sub, fontSize: 12, fontWeight: '800' },
  toggleTextOn: { color: '#fff' },
  muted: { color: colors.sub, fontSize: 12, lineHeight: 18 },
  warning: { color: '#92400e', fontSize: 12, lineHeight: 18 },
  ready: { color: '#166534', fontSize: 12, lineHeight: 18 },
  schema: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  stageRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  stageName: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  stageMeta: { color: colors.sub, fontSize: 12 },
})
