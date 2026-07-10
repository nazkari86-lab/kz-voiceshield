import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { DatasetQuality } from '@scoring'
import { colors } from '../theme'
import { Card, Metric, SectionTitle, ui } from './ui'

type Props = {
  quality: DatasetQuality
  caseCount: number
  datasetStageTotals: [string, number][]
  onExportJsonl: () => void
  onExportCsv: () => void
  onExportSplit: () => void
  onClear: () => void
}

export function DatasetView({ quality, caseCount, datasetStageTotals, onExportJsonl, onExportCsv, onExportSplit, onClear }: Props) {
  const disabled = caseCount === 0
  return (
    <View>
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
          Each export includes transcript, score, risk, confidence, verdict, escalation reasons, response checklist,
          stage coverage, evidence IDs, matched terms and analyst label. JSONL is for model training, CSV for
          spreadsheet audit, and split JSON creates deterministic train/dev/test sets.
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
  muted: { color: colors.sub, fontSize: 12, lineHeight: 18 },
  schema: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  stageRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  stageName: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  stageMeta: { color: colors.sub, fontSize: 12 },
})
