import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { CaseLabel, CaseStatus, SavedCase, WorkflowFlags } from '@scoring'
import { labelText, statusText } from '@scoring'
import { colors, riskColor } from '../theme'
import { Card, EmptyState } from './ui'

const LABELS: CaseLabel[] = ['unreviewed', 'true_positive', 'false_positive', 'needs_review']
const STATUSES: CaseStatus[] = ['new', 'reviewing', 'escalated', 'closed']
const next = <T,>(list: T[], current: T): T => list[(list.indexOf(current) + 1) % list.length] as T

type Props = {
  cases: SavedCase[]
  onSaveCurrent: () => void
  onLoadCase: (item: SavedCase) => void
  onUpdateLabel: (id: string, label: CaseLabel) => void
  onUpdateStatus: (id: string, status: CaseStatus) => void
  onToggleFlag: (id: string, flag: keyof WorkflowFlags) => void
  onExportBundle: (item: SavedCase) => void
  onDeleteCase: (id: string) => void
}

export function CasesView({ cases, onSaveCurrent, onLoadCase, onUpdateLabel, onUpdateStatus, onToggleFlag, onExportBundle, onDeleteCase }: Props) {
  return (
    <View>
      <View style={styles.actions}>
        <Text style={styles.count}>{cases.length} saved cases</Text>
        <Pressable style={styles.primary} onPress={onSaveCurrent}><Text style={styles.primaryText}>Save current</Text></Pressable>
      </View>

      {cases.length === 0 ? (
        <EmptyState title="No saved cases yet" subtitle="Save reviewed calls to build a local investigation library." />
      ) : (
        cases.map((item) => (
          <Card key={item.id} tone={item.analysis.risk}>
            <Pressable onPress={() => onLoadCase(item)}>
              <Text style={styles.id}>{item.id}</Text>
              <Text style={styles.meta}>{item.analysis.score}/100 · {item.analysis.verdict}</Text>
              <Text style={styles.trust}>{item.provenance.trusted ? 'Reviewer trusted' : 'Not training-eligible'} · {item.provenance.origin}</Text>
              <Text style={styles.snippet}>{item.transcript.slice(0, 160)}{item.transcript.length > 160 ? '…' : ''}</Text>
            </Pressable>

            <View style={styles.toolRow}>
              <Pressable style={[styles.tool, { borderColor: riskColor[item.analysis.risk] }]} onPress={() => onUpdateLabel(item.id, next(LABELS, item.label))}>
                <Text style={styles.toolText}>{labelText(item.label)}</Text>
              </Pressable>
              <Pressable style={styles.tool} onPress={() => onUpdateStatus(item.id, next(STATUSES, item.status))}>
                <Text style={styles.toolText}>{statusText(item.status)}</Text>
              </Pressable>
            </View>

            <View style={styles.toolRow}>
              {(['bankContactNeeded', 'customerCallbackNeeded', 'evidenceBundleReady'] as Array<keyof WorkflowFlags>).map((flag) => (
                <Pressable key={flag} style={[styles.flag, item.flags[flag] && styles.flagActive]} onPress={() => onToggleFlag(item.id, flag)}>
                  <Text style={[styles.flagText, item.flags[flag] && styles.flagTextActive]}>
                    {flag === 'bankContactNeeded' ? 'Bank' : flag === 'customerCallbackNeeded' ? 'Callback' : 'Evidence'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.toolRow}>
              <Pressable style={styles.ghost} onPress={() => onExportBundle(item)}><Text style={styles.ghostText}>Share bundle</Text></Pressable>
              <Pressable style={styles.danger} onPress={() => onDeleteCase(item.id)}><Text style={styles.dangerText}>Delete</Text></Pressable>
            </View>

            <Text style={styles.audit}>{item.auditLog.length} audit events · updated {new Date(item.updatedAt).toLocaleString()}</Text>
          </Card>
        ))
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  actions: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  count: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  primary: { backgroundColor: colors.brand, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  primaryText: { color: '#fff', fontWeight: '800' },
  id: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  meta: { color: colors.sub, fontSize: 12 },
  trust: { color: colors.muted, fontSize: 11, marginTop: 2 },
  snippet: { color: colors.sub, fontSize: 12, lineHeight: 17, marginTop: 4 },
  toolRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tool: { backgroundColor: colors.chipBg, borderColor: colors.border, borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  toolText: { color: colors.ink, fontSize: 12, fontWeight: '700' },
  flag: { borderColor: colors.border, borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  flagActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  flagText: { color: colors.sub, fontSize: 12, fontWeight: '700' },
  flagTextActive: { color: '#fff' },
  ghost: { borderColor: colors.brand, borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  ghostText: { color: colors.brand, fontSize: 12, fontWeight: '800' },
  danger: { borderColor: '#ef4444', borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  dangerText: { color: '#ef4444', fontSize: 12, fontWeight: '800' },
  audit: { color: colors.muted, fontSize: 11 },
})
