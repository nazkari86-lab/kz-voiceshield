import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { Analysis } from '@scoring'
import { colors, riskColor } from '../theme'
import { Card, Metric, RiskBadge, SectionTitle, ui } from './ui'
import type { PressureScore } from '../utils/pressureAnalyzer'
import type { TemplateMatch } from '../utils/semanticMatcher'
import type { CallbackResult } from '../utils/callbackDetector'

type Props = {
  analysis: Analysis
  highSignals: number
  pressureAnalysis?: PressureScore
  semanticMatches?: TemplateMatch[]
  callbackInfo?: CallbackResult
  repeatBonus?: { bonus: number; reason: string }
  llmAutoAnalysis?: string | null
  captureCompleteness?: number
}

export function ReviewView({ analysis, highSignals, pressureAnalysis, semanticMatches, callbackInfo, repeatBonus, llmAutoAnalysis, captureCompleteness }: Props) {
  const cashOut = analysis.evidence.some((item) => item.stage === 'Cash-out')
  return (
    <View>
      <Card tone={analysis.risk}>
        <View style={styles.topline}>
          <RiskBadge risk={analysis.risk} />
          <Text style={styles.caseId}>{analysis.caseId}</Text>
        </View>
        <Text style={[styles.score, { color: riskColor[analysis.risk] }]}>{analysis.score}</Text>
        <Text style={styles.scheme}>{analysis.schemeLabel}</Text>
        <View style={styles.meterTrack}>
          <View style={[styles.meterFill, { backgroundColor: riskColor[analysis.risk], width: `${analysis.score}%` }]} />
        </View>
        <Text style={styles.next}>{analysis.nextAction}</Text>
      </Card>

      <View style={ui.row}>
        <Metric value={`${Math.round(analysis.fraudProbability * 100)}%`} label="fraud prob" />
        <Metric value={analysis.harmSeverity} label="harm severity" />
        <Metric value={highSignals} label="major signals" />
        <Metric value={analysis.evidence.length} label="rules matched" />
        <Metric value={analysis.matchedTerms} label="terms found" />
        <Metric value={cashOut ? 'Yes' : 'No'} label="cash-out stage" />
      </View>

      {(captureCompleteness !== undefined && captureCompleteness < 0.7) && (
        <View style={styles.captureWarning}>
          <Text style={styles.captureWarningText}>
            ⚠ Неполный захват ({Math.round(captureCompleteness * 100)}%) — вероятно, слышна только одна сторона разговора. Анализ мог пропустить слова собеседника.
          </Text>
        </View>
      )}

      {analysis.protectiveContextApplied && (
        <View style={styles.protectiveNote}>
          <Text style={styles.protectiveNoteText}>
            ℹ Обнаружен защитный контекст: разговор может быть инициирован самим пользователем. Оценка снижена, но доказательства сохранены.
          </Text>
        </View>
      )}

      {analysis.intents.length > 0 && (
        <Card>
          <SectionTitle>Обнаруженные намерения</SectionTitle>
          {analysis.intents.map(intent => (
            <View key={intent.id} style={styles.intentRow}>
              <Text style={styles.intentId}>{intent.id.replace(/_/g, ' ')}</Text>
              <View style={styles.intentBar}>
                <View style={[styles.intentFill, { width: `${Math.round(intent.probability * 100)}%` }]} />
              </View>
              <Text style={styles.intentProb}>{Math.round(intent.probability * 100)}%</Text>
            </View>
          ))}
        </Card>
      )}

      <Card>
        <SectionTitle>Observed device context</SectionTitle>
        {analysis.contextSignals.length === 0 ? (
          <Text style={styles.muted}>No app-level risk context observed in this session.</Text>
        ) : (
          analysis.contextSignals.map((signal) => <Text key={signal.id} style={styles.bullet}>• {signal.label}</Text>)
        )}
      </Card>

      <Card>
        <SectionTitle>Escalation reasons</SectionTitle>
        {analysis.escalationReasons.length === 0
          ? <Text style={styles.muted}>No escalation signals.</Text>
          : analysis.escalationReasons.map((reason) => <Text key={reason} style={styles.bullet}>• {reason}</Text>)}
      </Card>

      <Card>
        <SectionTitle>Response checklist</SectionTitle>
        {analysis.responseChecklist.map((item) => <Text key={item} style={styles.bullet}>• {item}</Text>)}
      </Card>

      <Card>
        <SectionTitle>Threat stage coverage</SectionTitle>
        {analysis.stageCoverage.length === 0 ? (
          <Text style={styles.muted}>No active threat stages.</Text>
        ) : (
          analysis.stageCoverage.map((stage) => (
            <View key={stage.stage} style={styles.stageRow}>
              <Text style={styles.stageName}>{stage.stage}</Text>
              <Text style={styles.stageMeta}>{stage.count} rule(s) · {stage.score} pts</Text>
            </View>
          ))
        )}
      </Card>

      {pressureAnalysis && pressureAnalysis.overallPressure > 0 && (
        <Card>
          <SectionTitle>Давление на жертву</SectionTitle>
          <View style={styles.pressureRow}>
            <View style={styles.pressureTrack}>
              <View style={[styles.pressureFill, {
                width: `${pressureAnalysis.overallPressure}%`,
                backgroundColor: pressureAnalysis.overallPressure >= 60 ? '#dc2626' : pressureAnalysis.overallPressure >= 30 ? '#f97316' : '#eab308',
              }]} />
            </View>
            <Text style={styles.pressureVal}>{pressureAnalysis.overallPressure}</Text>
          </View>
          <View style={styles.pressureMetrics}>
            <Text style={styles.pressureMetric}>Срочность: {pressureAnalysis.urgencyDensity.toFixed(2)}</Text>
            <Text style={styles.pressureMetric}>Авторитет: {pressureAnalysis.authorityScore.toFixed(2)}</Text>
            <Text style={styles.pressureMetric}>Повторы: {pressureAnalysis.repetitionScore.toFixed(2)}</Text>
          </View>
          {pressureAnalysis.flags.length > 0 && (
            <View style={styles.flagsRow}>
              {pressureAnalysis.flags.map(flag => (
                <View key={flag} style={styles.flagChip}><Text style={styles.flagText}>{flag}</Text></View>
              ))}
            </View>
          )}
        </Card>
      )}

      {semanticMatches && semanticMatches.length > 0 && (
        <Card>
          <SectionTitle>Семантические совпадения</SectionTitle>
          {semanticMatches.map(match => (
            <View key={match.templateId} style={styles.matchRow}>
              <View style={[styles.matchDot, { backgroundColor: match.similarity >= 0.5 ? '#dc2626' : '#f97316' }]} />
              <View style={styles.matchInfo}>
                <Text style={styles.matchLabel}>{match.label}</Text>
                <Text style={styles.matchSim}>схожесть {(match.similarity * 100).toFixed(0)}%</Text>
              </View>
            </View>
          ))}
        </Card>
      )}

      {callbackInfo && callbackInfo.detected && (
        <Card>
          <SectionTitle>Обнаружен запрос перезвонить</SectionTitle>
          {callbackInfo.mentionedNumbers.length > 0 && (
            <Text style={styles.bullet}>Номера: {callbackInfo.mentionedNumbers.join(', ')}</Text>
          )}
          {callbackInfo.officialMatch && (
            <Text style={[styles.bullet, { color: '#15803d' }]}>✓ Официальный номер подтверждён</Text>
          )}
          {callbackInfo.warning && (
            <Text style={[styles.bullet, { color: '#dc2626', fontWeight: '700' }]}>⚠ {callbackInfo.warning}</Text>
          )}
        </Card>
      )}

      {repeatBonus && repeatBonus.bonus > 0 && (
        <Card>
          <SectionTitle>Повторный контакт</SectionTitle>
          <Text style={styles.bullet}>{repeatBonus.reason}</Text>
          <Text style={[styles.muted, { marginTop: 4 }]}>+{repeatBonus.bonus} очков к риску</Text>
        </Card>
      )}

      {llmAutoAnalysis && (
        <Card>
          <SectionTitle>VoiceShield AI — автоанализ</SectionTitle>
          <View style={styles.aiAnalysisBox}>
            <Text style={styles.aiAnalysisText}>{llmAutoAnalysis}</Text>
          </View>
        </Card>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  topline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  caseId: { color: colors.sub, fontSize: 12, fontWeight: '700' },
  score: { fontSize: 48, fontWeight: '900' },
  scheme: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  meterTrack: { backgroundColor: colors.chipBg, borderRadius: 999, height: 8, overflow: 'hidden' },
  meterFill: { borderRadius: 999, height: 8 },
  next: { color: colors.sub, fontSize: 13, lineHeight: 19 },
  bullet: { color: '#334155', fontSize: 13, lineHeight: 20 },
  muted: { color: colors.muted, fontSize: 13 },
  stageRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  stageName: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  stageMeta: { color: colors.sub, fontSize: 12 },
  pressureRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  pressureTrack: { backgroundColor: colors.chipBg, borderRadius: 4, flex: 1, height: 8, overflow: 'hidden' },
  pressureFill: { borderRadius: 4, height: 8 },
  pressureVal: { color: colors.ink, fontSize: 18, fontWeight: '900', width: 32 },
  pressureMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  pressureMetric: { color: colors.sub, fontSize: 12 },
  flagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  flagChip: { backgroundColor: '#fff7ed', borderColor: '#fed7aa', borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  flagText: { color: '#9a3412', fontSize: 11, fontWeight: '700' },
  matchRow: { alignItems: 'center', flexDirection: 'row', gap: 10, marginBottom: 6 },
  matchDot: { borderRadius: 4, height: 8, width: 8 },
  matchInfo: { flex: 1 },
  matchLabel: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  matchSim: { color: colors.sub, fontSize: 11 },
  aiAnalysisBox: { backgroundColor: colors.softBrand, borderRadius: 8, padding: 10 },
  aiAnalysisText: { color: colors.ink, fontSize: 13, lineHeight: 20 },
  captureWarning: { backgroundColor: '#fef3c7', borderColor: '#fbbf24', borderRadius: 8, borderWidth: 1, marginBottom: 8, padding: 10 },
  captureWarningText: { color: '#92400e', fontSize: 12, lineHeight: 18 },
  protectiveNote: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe', borderRadius: 8, borderWidth: 1, marginBottom: 8, padding: 10 },
  protectiveNoteText: { color: '#1e40af', fontSize: 12, lineHeight: 18 },
  intentRow: { alignItems: 'center', flexDirection: 'row', gap: 8, marginBottom: 6 },
  intentId: { color: colors.ink, fontSize: 11, fontWeight: '700', width: 140 },
  intentBar: { backgroundColor: colors.chipBg, borderRadius: 3, flex: 1, height: 6, overflow: 'hidden' },
  intentFill: { backgroundColor: colors.brand, borderRadius: 3, height: 6 },
  intentProb: { color: colors.sub, fontSize: 11, width: 34, textAlign: 'right' },
})
