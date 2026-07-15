import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import type { CaseStatus, SavedCase, WorkflowFlags } from '@scoring'
import { statusText } from '@scoring'
import { colors } from '../theme'
import { Card, EmptyState, Metric, SectionTitle, ui } from './ui'
import { LocalizedText as Text } from './LocalizedText'

type Operations = {
  openCases: SavedCase[]
  escalationQueue: SavedCase[]
  bankContactQueue: SavedCase[]
  staleCases: SavedCase[]
  statusCounts: Record<CaseStatus, number>
}

const STATUSES: CaseStatus[] = ['new', 'reviewing', 'escalated', 'closed']

type Props = {
  operations: Operations
  onLoadCase: (item: SavedCase) => void
  onUpdateStatus: (id: string, status: CaseStatus) => void
  onToggleFlag: (id: string, flag: keyof WorkflowFlags) => void
  onExportBundle: (item: SavedCase) => void
}

export function OperationsView({ operations, onLoadCase, onUpdateStatus, onToggleFlag, onExportBundle }: Props) {
  return (
    <View>
      <View style={ui.row}>
        <Metric value={operations.openCases.length} label="open cases" />
        <Metric value={operations.escalationQueue.length} label="escalated" />
        <Metric value={operations.bankContactQueue.length} label="bank contact" />
        <Metric value={operations.staleCases.length} label="stale open" />
      </View>

      <View style={ui.row}>
        {STATUSES.map((status) => <Metric key={status} value={operations.statusCounts[status]} label={statusText(status)} />)}
      </View>

      <SectionTitle>Escalation queue · {operations.escalationQueue.length}</SectionTitle>
      {operations.escalationQueue.length === 0 ? (
        <EmptyState title="No escalated cases" subtitle="High-risk cases saved from review appear here." />
      ) : (
        operations.escalationQueue.map((item) => (
          <Card key={`ops-${item.id}`} tone={item.analysis.risk}>
            <Pressable onPress={() => onLoadCase(item)}>
              <Text style={styles.id}>{item.id}</Text>
              <Text style={styles.meta}>{item.analysis.score}/100 · {item.assignedTo}</Text>
              <Text style={styles.snippet}>{item.analysis.escalationReasons[0] ?? item.analysis.nextAction}</Text>
            </Pressable>
            <View style={styles.row}>
              <Pressable style={styles.ghost} onPress={() => onUpdateStatus(item.id, 'reviewing')}><Text style={styles.ghostText}>Move to review</Text></Pressable>
              <Pressable style={styles.ghost} onPress={() => onExportBundle(item)}><Text style={styles.ghostText}>Share bundle</Text></Pressable>
            </View>
          </Card>
        ))
      )}

      <SectionTitle>Bank contact queue · {operations.bankContactQueue.length}</SectionTitle>
      {operations.bankContactQueue.length === 0 ? (
        <EmptyState title="No bank-contact cases" subtitle="Cases flagged for bank contact appear here." />
      ) : (
        operations.bankContactQueue.map((item) => (
          <Card key={`bank-${item.id}`} tone={item.analysis.risk}>
            <Pressable onPress={() => onLoadCase(item)}>
              <Text style={styles.id}>{item.id}</Text>
              <Text style={styles.meta}>{statusText(item.status)} · {item.assignedTo}</Text>
              <Text style={styles.snippet}>{item.analysis.nextAction}</Text>
            </Pressable>
            <View style={styles.row}>
              <Pressable style={styles.ghost} onPress={() => onToggleFlag(item.id, 'bankContactNeeded')}><Text style={styles.ghostText}>Clear bank flag</Text></Pressable>
              <Pressable style={styles.ghost} onPress={() => onExportBundle(item)}><Text style={styles.ghostText}>Share bundle</Text></Pressable>
            </View>
          </Card>
        ))
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  id: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  meta: { color: colors.sub, fontSize: 12 },
  snippet: { color: colors.sub, fontSize: 12, lineHeight: 17, marginTop: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  ghost: { borderColor: colors.brand, borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  ghostText: { color: colors.brand, fontSize: 12, fontWeight: '800' },
})
