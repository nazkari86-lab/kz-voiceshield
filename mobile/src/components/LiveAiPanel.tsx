import React from 'react'
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native'
import type { LiveAiAnalysisController } from '../hooks/useLiveAiAnalysis'
import { colors, riskColor } from '../theme'
import { MotionPressable } from './MotionPressable'

type Props = {
  controller: LiveAiAnalysisController
  hasTranscript: boolean
  onOpenAssistant: () => void
}

const riskLabel = {
  low: 'НИЗКИЙ',
  medium: 'СРЕДНИЙ',
  high: 'ВЫСОКИЙ',
  critical: 'КРИТИЧЕСКИЙ',
  unknown: 'НЕ ОПРЕДЕЛЁН',
} as const

const statusText = {
  disabled: 'Выключен',
  waiting: 'Ждёт новые фразы',
  loading: 'Загружает модель',
  analyzing: 'Анализирует речь',
  ready: 'Анализ обновлён',
  error: 'Требуется действие',
} as const

export function LiveAiPanel({ controller, hasTranscript, onOpenAssistant }: Props) {
  const busy = controller.status === 'loading' || controller.status === 'analyzing'
  const visibleText = busy ? controller.draft : controller.result?.raw
  const aiRisk = controller.result?.risk ?? 'unknown'
  const aiRiskColor = aiRisk === 'unknown' ? colors.muted : riskColor[aiRisk]

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>LIVE AI ANALYSIS</Text>
          <Text numberOfLines={1} style={styles.model}>{controller.modelName}</Text>
        </View>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>{controller.enabled ? 'ON' : 'OFF'}</Text>
          <Switch
            accessibilityLabel="Live AI analysis"
            onValueChange={(value) => { void controller.setEnabled(value) }}
            thumbColor="#ffffff"
            trackColor={{ false: '#cbd5e1', true: colors.brand }}
            value={controller.enabled}
          />
        </View>
      </View>

      <View style={styles.statusRow}>
        {busy ? <ActivityIndicator color={colors.brand} size="small" /> : <View style={[styles.statusDot, { backgroundColor: controller.status === 'error' ? '#dc2626' : controller.enabled ? colors.brand : colors.muted }]} />}
        <Text style={styles.status}>{statusText[controller.status]}</Text>
        <Text style={styles.rules}>RULES {controller.ruleScore}/100</Text>
      </View>

      {controller.result && controller.status !== 'error' && (
        <>
          <View style={styles.riskRow}>
            <View style={[styles.aiRisk, { borderColor: aiRiskColor }]}>
              <Text style={styles.aiRiskLabel}>AI RISK</Text>
              <Text style={[styles.aiRiskValue, { color: aiRiskColor }]}>{riskLabel[aiRisk]}</Text>
            </View>
            <View style={styles.schemeBox}>
              <Text style={styles.fieldLabel}>СХЕМА</Text>
              <Text numberOfLines={2} style={styles.scheme}>{controller.result.scheme}</Text>
            </View>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>УЛИКИ МОДЕЛИ</Text>
            <Text style={styles.fieldText}>{controller.result.evidence}</Text>
          </View>
          <View style={styles.actionField}>
            <Text style={styles.actionLabel}>ДЕЙСТВИЕ СЕЙЧАС</Text>
            <Text style={styles.actionText}>{controller.result.action}</Text>
          </View>
          {controller.disagreement && <Text style={styles.disagreement}>DISAGREEMENT: {controller.disagreement}</Text>}
        </>
      )}

      {busy && (
        <View style={styles.streamingBox}>
          <Text style={styles.fieldLabel}>ПОТОКОВЫЙ ВЫВОД</Text>
          <Text style={styles.streamingText}>{visibleText || (controller.status === 'loading' ? 'Подготовка локальной модели…' : 'Модель читает текущий транскрипт…')}</Text>
        </View>
      )}

      {controller.status === 'waiting' && !controller.result && (
        <Text style={styles.placeholder}>{hasTranscript ? 'Анализ начнётся после короткой паузы в новых фразах.' : 'Результат появится после первых распознанных фраз.'}</Text>
      )}

      {controller.error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{controller.error}</Text>
          <MotionPressable style={styles.setupButton} onPress={onOpenAssistant}>
            <Text style={styles.setupButtonText}>Открыть выбор AI-модели</Text>
          </MotionPressable>
        </View>
      )}

      {controller.enabled && hasTranscript && !busy && (
        <MotionPressable style={styles.refreshButton} onPress={() => { void controller.analyzeNow() }}>
          <Text style={styles.refreshButtonText}>{controller.result ? 'Обновить анализ сейчас' : 'Анализировать сейчас'}</Text>
        </MotionPressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  panel: { backgroundColor: '#f8fffc', borderColor: '#8ed8ba', borderRadius: 8, borderWidth: 1, gap: 10, marginBottom: 12, padding: 13 },
  header: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: { color: colors.brandDark, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  model: { color: colors.ink, fontSize: 15, fontWeight: '900', marginTop: 2 },
  toggleRow: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  toggleLabel: { color: colors.sub, fontSize: 9, fontWeight: '900' },
  statusRow: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', gap: 7, paddingBottom: 9 },
  statusDot: { borderRadius: 4, height: 8, width: 8 },
  status: { color: colors.sub, flex: 1, fontSize: 11, fontWeight: '800' },
  rules: { color: colors.muted, fontSize: 9, fontWeight: '900' },
  riskRow: { flexDirection: 'row', gap: 8 },
  aiRisk: { borderRadius: 6, borderWidth: 1, justifyContent: 'center', minWidth: 112, padding: 9 },
  aiRiskLabel: { color: colors.muted, fontSize: 8, fontWeight: '900' },
  aiRiskValue: { fontSize: 12, fontWeight: '900', marginTop: 3 },
  schemeBox: { backgroundColor: colors.card, borderRadius: 6, flex: 1, justifyContent: 'center', padding: 9 },
  field: { backgroundColor: colors.card, borderRadius: 6, padding: 10 },
  fieldLabel: { color: colors.muted, fontSize: 8, fontWeight: '900', letterSpacing: 0.7 },
  scheme: { color: colors.ink, fontSize: 12, fontWeight: '800', lineHeight: 17, marginTop: 3 },
  fieldText: { color: colors.ink, fontSize: 12, lineHeight: 18, marginTop: 4 },
  actionField: { backgroundColor: '#e8f7f0', borderColor: '#b5e4cf', borderRadius: 6, borderWidth: 1, padding: 10 },
  actionLabel: { color: colors.brandDark, fontSize: 8, fontWeight: '900', letterSpacing: 0.7 },
  actionText: { color: colors.brandDark, fontSize: 12, fontWeight: '800', lineHeight: 18, marginTop: 4 },
  disagreement: { backgroundColor: '#fff7ed', borderRadius: 5, color: '#9a3412', fontSize: 10, fontWeight: '900', padding: 8 },
  streamingBox: { backgroundColor: colors.card, borderRadius: 6, minHeight: 64, padding: 10 },
  streamingText: { color: colors.ink, fontSize: 12, lineHeight: 18, marginTop: 4 },
  placeholder: { color: colors.sub, fontSize: 12, lineHeight: 18 },
  errorBox: { gap: 8 },
  errorText: { color: '#991b1b', fontSize: 12, lineHeight: 18 },
  setupButton: { alignSelf: 'flex-start', backgroundColor: colors.brandDark, borderRadius: 6, height: 38, paddingHorizontal: 11, paddingVertical: 9 },
  setupButtonText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  refreshButton: { alignSelf: 'flex-start', borderColor: colors.brand, borderRadius: 6, borderWidth: 1, height: 38, paddingHorizontal: 11, paddingVertical: 8 },
  refreshButtonText: { color: colors.brandDark, fontSize: 10, fontWeight: '900' },
})
