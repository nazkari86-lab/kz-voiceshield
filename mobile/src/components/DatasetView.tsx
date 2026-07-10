import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { DatasetQuality } from '@scoring'
import { colors } from '../theme'
import { Card, Metric, SectionTitle, ui } from './ui'

type Props = {
  quality: DatasetQuality
  caseCount: number
  labelledCount: number
  datasetStageTotals: [string, number][]
  donationConsent: boolean
  onSetDonation: (accepted: boolean) => void
  onDonate: () => void
  onExportJsonl: () => void
  onExportCsv: () => void
  onExportSplit: () => void
  onClear: () => void
}

export function DatasetView({ quality, caseCount, labelledCount, datasetStageTotals, donationConsent, onSetDonation, onDonate, onExportJsonl, onExportCsv, onExportSplit, onClear }: Props) {
  const disabled = caseCount === 0
  const canDonate = donationConsent && labelledCount > 0
  return (
    <View>
      <SectionTitle>Improve protection (opt-in)</SectionTitle>
      <Card tone={donationConsent ? 'low' : undefined}>
        <Text style={styles.donateBody}>
          Donate your reviewed cases to help improve RU/KZ fraud detection. Transcripts are redacted
          (codes, PIN/CVV and long numbers removed) and never leave the device until you pick a target
          in the share sheet. You can turn this off anytime.
        </Text>
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
            <Text style={styles.ghostText}>Donate {labelledCount} reviewed (redacted)</Text>
          </Pressable>
        </View>
      </Card>

      <SectionTitle>Export</SectionTitle>
      <View style={styles.actions}>
        <Pressable style={[styles.ghost, disabled && styles.off]} disabled={disabled} onPress={onExportJsonl}><Text style={styles.ghostText}>Share JSONL</Text></Pressable>
        <Pressable style={[styles.ghost, disabled && styles.off]} disabled={disabled} onPress={onExportCsv}><Text style={styles.ghostText}>Share CSV</Text></Pressable>
        <Pressable style={[styles.ghost, disabled && styles.off]} disabled={disabled} onPress={onExportSplit}><Text style={styles.ghostText}>Share split</Text></Pressable>
        <Pressable style={[styles.danger, disabled && styles.off]} disabled={disabled} onPress={onClear}><Text style={styles.dangerText}>Clear</Text></Pressable>
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
  off: { opacity: 0.4 },
  donateBody: { color: '#334155', fontSize: 13, lineHeight: 19, marginBottom: 4 },
  toggle: { borderColor: colors.border, borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  toggleOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  toggleText: { color: colors.sub, fontSize: 12, fontWeight: '800' },
  toggleTextOn: { color: '#fff' },
  muted: { color: colors.sub, fontSize: 12, lineHeight: 18 },
  schema: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  stageRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  stageName: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  stageMeta: { color: colors.sub, fontSize: 12 },
})
