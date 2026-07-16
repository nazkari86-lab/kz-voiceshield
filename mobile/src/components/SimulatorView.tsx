import AsyncStorage from '@react-native-async-storage/async-storage'
import React, { useEffect, useRef, useState } from 'react'
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from '../theme'
import { dailyTrainingScenario, examScenarios, scenarioSkill, trainingScenarios, trainingScore, trainingSkillLabels } from '../training'
import type { TrainingSkill } from '../training'
import { TrainingVoiceModule } from '../bridge/TrainingVoiceBridge'

export function SimulatorView() {
  const [scenarioId, setScenarioId] = useState<string | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [answers, setAnswers] = useState<boolean[]>([])
  const [feedback, setFeedback] = useState('')
  const [bestScore, setBestScore] = useState(0)
  const [completedCount, setCompletedCount] = useState(0)
  const [voiceStatus, setVoiceStatus] = useState('')
  const [selectedSkill, setSelectedSkill] = useState<TrainingSkill | 'all'>('all')
  const [examQueue, setExamQueue] = useState<string[]>([])
  const [examIndex, setExamIndex] = useState(0)
  const [examScores, setExamScores] = useState<number[]>([])
  const [examResult, setExamResult] = useState<number | null>(null)
  const reveal = useRef(new Animated.Value(0)).current
  const scenario = trainingScenarios.find((item) => item.id === scenarioId)
  const step = scenario?.steps[stepIndex]

  useEffect(() => {
    void AsyncStorage.getItem('voiceshield.training.v1').then((stored) => {
      if (!stored) return
      const data = JSON.parse(stored) as { bestScore?: number; completedCount?: number }
      setBestScore(data.bestScore ?? 0)
      setCompletedCount(data.completedCount ?? 0)
    }).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!scenario || !step) return
    reveal.setValue(0)
    Animated.timing(reveal, { duration: 260, toValue: 1, useNativeDriver: true }).start()
  }, [reveal, scenario, step])

  const start = (id: string) => { setScenarioId(id); setStepIndex(0); setAnswers([]); setFeedback(''); setVoiceStatus('') }
  const startExam = () => {
    const queue = examScenarios().map((item) => item.id)
    setExamQueue(queue)
    setExamIndex(0)
    setExamScores([])
    setExamResult(null)
    start(queue[0]!)
  }
  const choose = (safe: boolean, message: string) => {
    if (feedback) return
    setAnswers((current) => [...current, safe])
    setFeedback(message)
  }
  const next = () => {
    if (!scenario) return
    if (stepIndex + 1 < scenario.steps.length) { setStepIndex((current) => current + 1); setFeedback('') }
    else {
      const score = trainingScore(answers)
      const nextBest = Math.max(bestScore, score)
      setBestScore(nextBest)
      setCompletedCount((current) => {
        const nextCount = current + 1
        void AsyncStorage.setItem('voiceshield.training.v1', JSON.stringify({ bestScore: nextBest, completedCount: nextCount }))
        return nextCount
      })
      if (examQueue.length > 0) {
        const scores = [...examScores, score]
        if (examIndex + 1 < examQueue.length) {
          setExamScores(scores)
          setExamIndex((current) => current + 1)
          start(examQueue[examIndex + 1]!)
          return
        }
        setExamResult(Math.round(scores.reduce((sum, item) => sum + item, 0) / scores.length))
        setExamQueue([])
        setScenarioId(null)
        return
      }
      setStepIndex(scenario.steps.length)
    }
  }

  const speakCaller = async () => {
    if (!scenario || !step || !TrainingVoiceModule) {
      setVoiceStatus('Voice simulation is available in the Android app.')
      return
    }
    try {
      setVoiceStatus('Playing caller voice…')
      await TrainingVoiceModule.speak(step.caller, scenario.language)
      setVoiceStatus('')
    } catch {
      setVoiceStatus(`Install a ${scenario.language} speech voice in Android settings to use this simulation.`)
    }
  }

  if (scenario && stepIndex >= scenario.steps.length) {
    const score = trainingScore(answers)
    return <View style={styles.result}><Text style={styles.kicker}>SESSION COMPLETE</Text><Text style={styles.title}>Training result</Text><Text style={styles.score}>{score}<Text style={styles.outOf}>/100</Text></Text><Text style={styles.copy}>{score === 100 ? 'You interrupted every pressure pattern safely.' : 'Review the unsafe decision, then replay this scenario.'}</Text><Pressable style={styles.primary} onPress={() => start(scenario.id)}><Text style={styles.primaryText}>Repeat scenario</Text></Pressable><Pressable style={styles.secondary} onPress={() => setScenarioId(null)}><Text style={styles.secondaryText}>Choose another</Text></Pressable></View>
  }

  if (scenario && step) {
    return <Animated.View style={[styles.container, { opacity: reveal, transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.title}>{scenario.title}</Text>
            <Text style={styles.meta}>{scenario.language} · {scenario.difficulty} · {stepIndex + 1}/{scenario.steps.length}</Text>
          </View>
          <Pressable style={styles.exit} onPress={() => { setScenarioId(null); setStepIndex(0); setAnswers([]); setFeedback('') }}>
            <Text style={styles.exitText}>Exit</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.call}><Text style={styles.caller}>Unknown caller</Text><Text style={styles.callText}>{step.caller}</Text></View>
      <Pressable style={styles.voiceButton} onPress={() => { void speakCaller() }}><Text style={styles.voiceButtonText}>Play caller voice</Text></Pressable>
      {voiceStatus ? <Text style={styles.voiceStatus}>{voiceStatus}</Text> : null}
      <Text style={styles.prompt}>What do you do?</Text>
      {step.choices.map((choice) => <Pressable key={choice.id} disabled={Boolean(feedback)} style={styles.choice} onPress={() => choose(choice.safe, choice.feedback)}><Text style={styles.choiceText}>{choice.text}</Text></Pressable>)}
      {feedback ? <View style={styles.feedback}><Text style={styles.feedbackText}>{feedback}</Text><Text style={styles.pattern}>Pattern: {step.pattern}</Text><Pressable style={styles.primary} onPress={next}><Text style={styles.primaryText}>{stepIndex + 1 === scenario.steps.length ? 'See result' : 'Next call step'}</Text></Pressable></View> : null}
    </Animated.View>
  }

  if (examResult !== null) {
    return <View style={styles.result}><Text style={styles.kicker}>EXAM COMPLETE</Text><Text style={styles.title}>Fraud recognition score</Text><Text style={styles.score}>{examResult}<Text style={styles.outOf}>/100</Text></Text><Text style={styles.copy}>{examResult >= 80 ? 'You recognised the main pressure patterns. Review any unsafe answers before a real call.' : 'Review the weak skill cards, then take another exam.'}</Text><Pressable style={styles.primary} onPress={startExam}><Text style={styles.primaryText}>New exam</Text></Pressable><Pressable style={styles.secondary} onPress={() => setExamResult(null)}><Text style={styles.secondaryText}>Back to training</Text></Pressable></View>
  }

  const daily = dailyTrainingScenario()
  const visibleScenarios = selectedSkill === 'all' ? trainingScenarios : trainingScenarios.filter((item) => scenarioSkill(item) === selectedSkill)
  return (
    <View>
      <View style={styles.trainingHero}><Text style={styles.kicker}>VOICE LAB</Text><Text style={styles.trainingHeroTitle}>Scam call training</Text><Text style={styles.heroHint}>Practice decisions under pressure. No real call or personal data is used.</Text><View style={styles.stats}><Text style={styles.stat}>{completedCount} sessions</Text><Text style={styles.stat}>{bestScore} best score</Text><Text style={styles.stat}>{trainingScenarios.length} scenarios</Text></View></View>
      <View style={styles.modeRow}><Pressable style={styles.daily} onPress={() => start(daily.id)}><Text style={styles.modeKicker}>TODAY</Text><Text style={styles.modeTitle}>{daily.title}</Text><Text style={styles.modeCopy}>Daily practice</Text></Pressable><Pressable style={styles.exam} onPress={startExam}><Text style={styles.modeKicker}>EXAM</Text><Text style={styles.modeTitle}>5-case challenge</Text><Text style={styles.modeCopy}>Measure your skills</Text></Pressable></View>
      <Text style={styles.filterTitle}>Practice by skill</Text>
      <View style={styles.filters}><Pressable style={[styles.filter, selectedSkill === 'all' && styles.filterActive]} onPress={() => setSelectedSkill('all')}><Text style={[styles.filterText, selectedSkill === 'all' && styles.filterTextActive]}>All</Text></Pressable>{(Object.keys(trainingSkillLabels) as TrainingSkill[]).map((skill) => <Pressable key={skill} style={[styles.filter, selectedSkill === skill && styles.filterActive]} onPress={() => setSelectedSkill(skill)}><Text style={[styles.filterText, selectedSkill === skill && styles.filterTextActive]}>{trainingSkillLabels[skill]}</Text></Pressable>)}</View>
      {visibleScenarios.map((item) => <Pressable key={item.id} style={styles.item} onPress={() => start(item.id)}><Text style={styles.label}>{item.title}</Text><Text style={styles.meta}>{item.language} · {item.difficulty} · {trainingSkillLabels[scenarioSkill(item)]} · {item.steps.length} decisions</Text></Pressable>)}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 11 },
  header: { gap: 3 },
  headerRow: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  headerText: { flex: 1, gap: 3 },
  exit: { borderColor: colors.border, borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  exitText: { color: colors.sub, fontSize: 12, fontWeight: '800' },
  trainingHero: { backgroundColor: colors.brandDark, borderRadius: 8, gap: 7, marginBottom: 12, padding: 18 },
  kicker: { color: colors.brand, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  title: { color: colors.ink, fontSize: 23, fontWeight: '900' },
  trainingHeroTitle: { color: '#fff', fontSize: 23, fontWeight: '900' },
  copy: { color: colors.sub, fontSize: 13, lineHeight: 19 },
  hint: { color: colors.sub, fontSize: 12, lineHeight: 18, marginBottom: 4 },
  heroHint: { color: '#d8ebe1', fontSize: 12, lineHeight: 18, marginBottom: 4 },
  stats: { flexDirection: 'row', gap: 8 }, stat: { backgroundColor: '#1e5948', borderRadius: 5, color: '#e8f7ef', fontSize: 11, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 5 },
  modeRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  daily: { backgroundColor: '#e8f7ef', borderColor: '#88c5ad', borderRadius: 8, borderWidth: 1, flex: 1, gap: 4, padding: 13 },
  exam: { backgroundColor: '#eef5ff', borderColor: '#a8c7f0', borderRadius: 8, borderWidth: 1, flex: 1, gap: 4, padding: 13 },
  modeKicker: { color: colors.brandDark, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  modeTitle: { color: colors.ink, fontSize: 13, fontWeight: '900' }, modeCopy: { color: colors.sub, fontSize: 11 },
  filterTitle: { color: colors.ink, fontSize: 14, fontWeight: '900', marginBottom: 8 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 14 },
  filter: { borderColor: colors.border, borderRadius: 8, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 7 }, filterActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  filterText: { color: colors.sub, fontSize: 11, fontWeight: '800' }, filterTextActive: { color: '#fff' },
  item: { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: colors.brand, borderLeftWidth: 4, borderRadius: 8, borderWidth: 1, gap: 3, marginBottom: 10, padding: 14 },
  label: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  meta: { color: colors.sub, fontSize: 12 },
  call: { backgroundColor: colors.softDanger, borderColor: '#f4b4a8', borderRadius: 8, borderWidth: 1, gap: 8, padding: 16 },
  caller: { color: '#a33d2d', fontSize: 12, fontWeight: '900' },
  callText: { color: colors.ink, fontSize: 17, fontWeight: '700', lineHeight: 25 },
  voiceButton: { alignSelf: 'flex-start', borderColor: colors.brand, borderRadius: 8, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 10 },
  voiceButtonText: { color: colors.brandDark, fontSize: 12, fontWeight: '900' },
  voiceStatus: { color: colors.sub, fontSize: 11, lineHeight: 16 },
  prompt: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  choice: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, padding: 14 },
  choiceText: { color: colors.ink, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  feedback: { backgroundColor: '#f8fafc', borderColor: colors.border, borderRadius: 8, borderWidth: 1, gap: 8, padding: 14 },
  feedbackText: { color: colors.ink, fontSize: 13, lineHeight: 19 },
  pattern: { color: colors.sub, fontSize: 11, fontWeight: '800' },
  primary: { alignSelf: 'flex-start', backgroundColor: colors.brand, borderRadius: 8, paddingHorizontal: 15, paddingVertical: 11 },
  primaryText: { color: '#fff', fontWeight: '900' },
  secondary: { alignSelf: 'flex-start', borderColor: colors.border, borderRadius: 8, borderWidth: 1, paddingHorizontal: 15, paddingVertical: 11 },
  secondaryText: { color: colors.ink, fontWeight: '800' },
  result: { alignItems: 'flex-start', gap: 12 },
  score: { color: colors.brand, fontSize: 54, fontWeight: '900' },
  outOf: { color: colors.muted, fontSize: 20 },
})
