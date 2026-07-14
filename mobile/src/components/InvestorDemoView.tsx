import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native'
import { riskColor, colors } from '../theme'
import { buildInvestorDemoSnapshot, investorDemoSteps } from '../data/investorDemo'
import { trainingScenarios } from '../training'
import { whisperModels } from '../data/whisperModels'

type Props = {
  onOpenAi: (transcript: string) => void
  onOpenEmergency: () => void
  onOpenReview: (transcript: string) => void
}

const stepIntervalMs = 1_650

export function InvestorDemoView({ onOpenAi, onOpenEmergency, onOpenReview }: Props) {
  const [stepIndex, setStepIndex] = useState(0)
  const [running, setRunning] = useState(false)
  const progress = useRef(new Animated.Value(0)).current
  const snapshot = useMemo(() => buildInvestorDemoSnapshot(stepIndex), [stepIndex])
  const { analysis } = snapshot
  const complete = stepIndex === investorDemoSteps.length - 1

  useEffect(() => {
    Animated.timing(progress, {
      duration: 420,
      easing: Easing.out(Easing.cubic),
      toValue: analysis.score / 100,
      useNativeDriver: true,
    }).start()
  }, [analysis.score, progress])

  useEffect(() => {
    if (!running) return undefined
    if (complete) {
      setRunning(false)
      return undefined
    }
    const timer = setTimeout(() => setStepIndex((current) => current + 1), stepIntervalMs)
    return () => clearTimeout(timer)
  }, [complete, running, stepIndex])

  const replay = () => {
    progress.setValue(0)
    setStepIndex(0)
    setRunning(true)
  }

  const next = () => {
    if (complete) return
    setRunning(false)
    setStepIndex((current) => current + 1)
  }

  return (
    <View style={styles.root}>
      <View style={styles.heroBand}>
        <View style={styles.heroTopline}>
          <Text style={styles.demoLabel}>GUIDED DEMO · SYNTHETIC DATA</Text>
          <Text style={styles.stepCount}>{stepIndex + 1}/{investorDemoSteps.length}</Text>
        </View>
        <Text style={styles.heroTitle}>Fraud risk becomes an action, live.</Text>
        <Text style={styles.heroCopy}>A guided walkthrough of local transcription, explainable scoring and intervention workflow.</Text>
        <View style={styles.proofRow}>
          {['LOCAL-FIRST', 'RU / KZ', 'EXPLAINABLE', 'ACTIONABLE'].map((item) => <Text key={item} style={styles.proofChip}>{item}</Text>)}
        </View>
      </View>

      <View style={styles.riskPanel}>
        <View style={styles.riskHeading}>
          <View>
            <Text style={styles.eyebrow}>LIVE RISK ENGINE</Text>
            <Text style={styles.scheme}>{analysis.schemeLabel}</Text>
          </View>
          <View style={[styles.riskBadge, { backgroundColor: riskColor[analysis.risk] }]}>
            <Text style={styles.riskScore}>{analysis.score}</Text>
            <Text style={styles.riskCaption}>{analysis.risk.toUpperCase()}</Text>
          </View>
        </View>
        <View style={styles.track}>
          <Animated.View style={[styles.progress, { backgroundColor: riskColor[analysis.risk], transform: [{ scaleX: progress }] }]} />
        </View>
        <View style={styles.metricRow}>
          <View style={styles.metric}><Text style={styles.metricValue}>{Math.round(analysis.fraudProbability * 100)}%</Text><Text style={styles.metricLabel}>fraud probability</Text></View>
          <View style={styles.metric}><Text style={styles.metricValue}>{analysis.evidence.length}</Text><Text style={styles.metricLabel}>evidence signals</Text></View>
          <View style={styles.metric}><Text style={styles.metricValue}>{analysis.stageCoverage.length}</Text><Text style={styles.metricLabel}>attack stages</Text></View>
        </View>
      </View>

      <View style={styles.pipeline}>
        {['CALL', 'STT', 'RULES + CONTEXT', 'ACTION'].map((label, index) => {
          const active = stepIndex >= Math.min(index, 3)
          return (
            <React.Fragment key={label}>
              {index > 0 && <View style={[styles.pipelineLine, active && styles.pipelineLineActive]} />}
              <View style={[styles.pipelineNode, active && styles.pipelineNodeActive]}><Text style={[styles.pipelineText, active && styles.pipelineTextActive]}>{label}</Text></View>
            </React.Fragment>
          )
        })}
      </View>

      <Text style={styles.sectionTitle}>Incident timeline</Text>
      <View style={styles.timeline}>
        {snapshot.visibleSteps.map((step, index) => (
          <View key={step.id} style={styles.timelineRow}>
            <View style={[styles.timelineDot, index === stepIndex && { backgroundColor: riskColor[analysis.risk] }]} />
            <View style={styles.timelineBody}>
              <View style={styles.timelineMeta}><Text style={styles.stage}>{step.stage}</Text><Text style={styles.speaker}>{step.speaker === 'caller' ? 'CALLER' : 'DEVICE'}</Text></View>
              <Text style={styles.transcript}>{step.text}</Text>
              {step.signal && <Text style={styles.contextSignal}>+ device context · {step.signal.label}</Text>}
            </View>
          </View>
        ))}
      </View>

      <View style={styles.twoColumn}>
        <View style={styles.column}>
          <Text style={styles.columnEyebrow}>WHY IT ESCALATED</Text>
          {(analysis.escalationReasons.length ? analysis.escalationReasons : ['Waiting for actionable scam language.']).slice(0, 3).map((reason) => <Text key={reason} style={styles.bullet}>• {reason}</Text>)}
        </View>
        <View style={styles.column}>
          <Text style={styles.columnEyebrow}>SAFE NEXT ACTIONS</Text>
          {(analysis.responseChecklist.length ? analysis.responseChecklist : ['Continue monitoring without interrupting the user.']).slice(0, 3).map((action) => <Text key={action} style={styles.bullet}>• {action}</Text>)}
        </View>
      </View>

      <View style={styles.controls}>
        <Pressable accessibilityRole="button" style={styles.primaryButton} onPress={running ? () => setRunning(false) : replay}>
          <Text style={styles.primaryButtonText}>{running ? 'Pause demo' : complete ? 'Replay demo' : 'Run demo'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={complete || running} style={[styles.secondaryButton, (complete || running) && styles.disabled]} onPress={next}>
          <Text style={styles.secondaryButtonText}>Next signal</Text>
        </Pressable>
      </View>

      {complete && (
        <View style={styles.outcomeBand}>
          <Text style={styles.outcomeEyebrow}>INTERVENTION READY</Text>
          <Text style={styles.outcomeTitle}>{analysis.verdict}</Text>
          <Text style={styles.outcomeCopy}>{analysis.nextAction}</Text>
          <View style={styles.outcomeActions}>
            <Pressable style={styles.outcomePrimary} onPress={() => onOpenReview(snapshot.transcript)}><Text style={styles.outcomePrimaryText}>Open full analysis</Text></Pressable>
            <Pressable style={styles.outcomeSecondary} onPress={() => onOpenAi(snapshot.transcript)}><Text style={styles.outcomeSecondaryText}>Ask local AI</Text></Pressable>
            <Pressable style={styles.outcomeSecondary} onPress={onOpenEmergency}><Text style={styles.outcomeSecondaryText}>Recovery plan</Text></Pressable>
          </View>
        </View>
      )}

      <View style={styles.productProof}>
        <Text style={styles.productProofTitle}>One product, three defensible layers</Text>
        <View style={styles.productProofRow}>
          <View style={styles.productProofItem}><Text style={styles.productProofValue}>{whisperModels.length}</Text><Text style={styles.productProofLabel}>speech models</Text></View>
          <View style={styles.productProofItem}><Text style={styles.productProofValue}>2</Text><Text style={styles.productProofLabel}>local LLM runtimes</Text></View>
          <View style={styles.productProofItem}><Text style={styles.productProofValue}>{trainingScenarios.length}</Text><Text style={styles.productProofLabel}>training drills</Text></View>
        </View>
        <Text style={styles.disclaimer}>Product capability counts from this build. Detection output shown above uses the deterministic VoiceShield scorer and synthetic demo text, not claimed field accuracy.</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: 12 },
  heroBand: { backgroundColor: colors.brandDark, borderRadius: 8, gap: 8, overflow: 'hidden', padding: 18 },
  heroTopline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  demoLabel: { color: '#8de5bd', fontSize: 9, fontWeight: '900', letterSpacing: 0.9 },
  stepCount: { color: '#fff', fontSize: 11, fontWeight: '900' },
  heroTitle: { color: '#fff', fontSize: 25, fontWeight: '900', lineHeight: 30 },
  heroCopy: { color: '#c2ddd1', fontSize: 13, lineHeight: 19 },
  proofRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 3 },
  proofChip: { borderColor: '#4f8a73', borderRadius: 4, borderWidth: 1, color: '#d8eee5', fontSize: 8, fontWeight: '900', paddingHorizontal: 7, paddingVertical: 4 },
  riskPanel: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, gap: 12, padding: 15 },
  riskHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  eyebrow: { color: colors.brand, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  scheme: { color: colors.ink, fontSize: 17, fontWeight: '900', marginTop: 3 },
  riskBadge: { alignItems: 'center', borderRadius: 6, minWidth: 64, paddingHorizontal: 10, paddingVertical: 7 },
  riskScore: { color: '#fff', fontSize: 23, fontWeight: '900' },
  riskCaption: { color: '#fff', fontSize: 8, fontWeight: '900' },
  track: { backgroundColor: colors.chipBg, borderRadius: 4, height: 8, overflow: 'hidden' },
  progress: { height: 8, transformOrigin: 'left' },
  metricRow: { flexDirection: 'row', gap: 7 },
  metric: { backgroundColor: colors.chipBg, borderRadius: 6, flex: 1, padding: 9 },
  metricValue: { color: colors.ink, fontSize: 17, fontWeight: '900' },
  metricLabel: { color: colors.sub, fontSize: 9, lineHeight: 12 },
  pipeline: { alignItems: 'center', flexDirection: 'row', paddingHorizontal: 2, paddingVertical: 6 },
  pipelineNode: { alignItems: 'center', borderColor: colors.border, borderRadius: 5, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 7 },
  pipelineNodeActive: { backgroundColor: colors.softBrand, borderColor: colors.brand },
  pipelineText: { color: colors.muted, fontSize: 8, fontWeight: '900' },
  pipelineTextActive: { color: colors.brandDark },
  pipelineLine: { backgroundColor: colors.border, flex: 1, height: 2 },
  pipelineLineActive: { backgroundColor: colors.brand },
  sectionTitle: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  timeline: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, padding: 13 },
  timelineRow: { flexDirection: 'row', gap: 10, paddingBottom: 12 },
  timelineDot: { backgroundColor: colors.border, borderRadius: 5, height: 10, marginTop: 4, width: 10 },
  timelineBody: { flex: 1, gap: 3 },
  timelineMeta: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  stage: { color: colors.brandDark, fontSize: 10, fontWeight: '900' },
  speaker: { color: colors.muted, fontSize: 8, fontWeight: '900' },
  transcript: { color: colors.ink, fontSize: 12, lineHeight: 18 },
  contextSignal: { color: colors.brand, fontSize: 9, fontWeight: '800' },
  twoColumn: { flexDirection: 'row', gap: 8 },
  column: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, flex: 1, gap: 6, padding: 11 },
  columnEyebrow: { color: colors.brand, fontSize: 8, fontWeight: '900', letterSpacing: 0.7 },
  bullet: { color: colors.sub, fontSize: 10, lineHeight: 15 },
  controls: { flexDirection: 'row', gap: 8 },
  primaryButton: { alignItems: 'center', backgroundColor: colors.brand, borderRadius: 7, flex: 1, padding: 13 },
  primaryButtonText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  secondaryButton: { alignItems: 'center', borderColor: colors.brand, borderRadius: 7, borderWidth: 1, flex: 1, padding: 13 },
  secondaryButtonText: { color: colors.brandDark, fontSize: 12, fontWeight: '900' },
  disabled: { opacity: 0.45 },
  outcomeBand: { backgroundColor: colors.softDanger, borderColor: '#e8a18f', borderRadius: 8, borderWidth: 1, gap: 6, padding: 15 },
  outcomeEyebrow: { color: '#9f2339', fontSize: 9, fontWeight: '900', letterSpacing: 0.9 },
  outcomeTitle: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  outcomeCopy: { color: colors.sub, fontSize: 12, lineHeight: 18 },
  outcomeActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 4 },
  outcomePrimary: { backgroundColor: '#9f2339', borderRadius: 6, paddingHorizontal: 11, paddingVertical: 9 },
  outcomePrimaryText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  outcomeSecondary: { borderColor: '#c9796c', borderRadius: 6, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 9 },
  outcomeSecondaryText: { color: '#7d2938', fontSize: 10, fontWeight: '900' },
  productProof: { borderTopColor: colors.border, borderTopWidth: 1, gap: 10, marginTop: 3, paddingTop: 14 },
  productProofTitle: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  productProofRow: { flexDirection: 'row', gap: 8 },
  productProofItem: { backgroundColor: colors.chipBg, borderRadius: 7, flex: 1, padding: 10 },
  productProofValue: { color: colors.brandDark, fontSize: 20, fontWeight: '900' },
  productProofLabel: { color: colors.sub, fontSize: 9, lineHeight: 12 },
  disclaimer: { color: colors.muted, fontSize: 9, lineHeight: 14 },
})
