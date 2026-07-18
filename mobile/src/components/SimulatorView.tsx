import AsyncStorage from '@react-native-async-storage/async-storage'
import React, { useEffect, useRef, useState } from 'react'
import { Animated, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { colors } from '../theme'
import { assessSpokenTrainingResponse, dailyTrainingScenario, examScenarios, scenarioSkill, trainingScenarios, trainingScore, trainingSkillLabels } from '../training'
import type { TrainingChoice, TrainingSkill } from '../training'
import { TrainingVoiceModule } from '../bridge/TrainingVoiceBridge'
import { listTrainingVoices, requestTrainingVoice, type TrainingVoiceOption } from '../services/trainingVoiceClient'

type TrainingProgress = { bestScore: number; completedCount: number; skillMistakes: Partial<Record<TrainingSkill, number>>; lastCompletedAt?: string; streak?: number; todayKey?: string; todayCompleted?: number }
type TrainingEvent = { stepIndex: number; pattern: string; safe: boolean; responseText?: string; reactionMs: number }
type TrainingEvidence = { id: string; scenarioId: string; title: string; language: 'RU' | 'KZ'; difficulty: string; score: number; voiceId: string; source: 'synthetic_training' | 'android_tts' | 'voice_response'; events: TrainingEvent[]; createdAt: string }
const TRAINING_KEY = 'voiceshield.training.v2'
const TRAINING_VOICE_KEY = 'voiceshield.training.voice-id.v1'
const dailyGoal = 3

const dayKey = (date = new Date()) => date.toISOString().slice(0, 10)

function SnowLeopardMascot() {
  const float = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(float, { duration: 1500, toValue: -3, useNativeDriver: true }),
      Animated.timing(float, { duration: 1500, toValue: 0, useNativeDriver: true }),
    ]))
    animation.start()
    return () => animation.stop()
  }, [float])
  return <Animated.View style={[styles.mascot, { transform: [{ translateY: float }] }]} accessibilityLabel="Snow leopard mascot">
    <View style={styles.mascotEarLeft} />
    <View style={styles.mascotEarRight} />
    <View style={styles.mascotFace}>
      <Text style={styles.mascotMark}>✦</Text>
      <View style={[styles.mascotSpot, styles.mascotSpotOne]} />
      <View style={[styles.mascotSpot, styles.mascotSpotTwo]} />
      <View style={[styles.mascotSpot, styles.mascotSpotThree]} />
      <View style={styles.mascotEyes}><View style={styles.mascotEye} /><View style={styles.mascotEye} /></View>
      <View style={styles.mascotMuzzle}><Text style={styles.mascotNose}>•</Text></View>
    </View>
    <View style={styles.mascotScarf}><Text style={styles.mascotFlag}>🇰🇿</Text></View>
  </Animated.View>
}

export function SimulatorView() {
  const [scenarioId, setScenarioId] = useState<string | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [answers, setAnswers] = useState<boolean[]>([])
  const [feedback, setFeedback] = useState('')
  const [bestScore, setBestScore] = useState(0)
  const [completedCount, setCompletedCount] = useState(0)
  const [voiceStatus, setVoiceStatus] = useState('')
  const [voiceId, setVoiceId] = useState('')
  const [voiceOptions, setVoiceOptions] = useState<TrainingVoiceOption[]>([])
  const [voiceCatalogStatus, setVoiceCatalogStatus] = useState('')
  const [selectedSkill, setSelectedSkill] = useState<TrainingSkill | 'all'>('all')
  const [examQueue, setExamQueue] = useState<string[]>([])
  const [examIndex, setExamIndex] = useState(0)
  const [examScores, setExamScores] = useState<number[]>([])
  const [examResult, setExamResult] = useState<number | null>(null)
  const [skillMistakes, setSkillMistakes] = useState<Partial<Record<TrainingSkill, number>>>({})
  const [streak, setStreak] = useState(0)
  const [todayCompleted, setTodayCompleted] = useState(0)
  const [pendingNextStep, setPendingNextStep] = useState<number | null>(null)
  const [sessionEvents, setSessionEvents] = useState<TrainingEvent[]>([])
  const [stepStartedAt, setStepStartedAt] = useState(Date.now())
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const [isListening, setIsListening] = useState(false)
  const evidenceSavedRef = useRef(false)
  const reveal = useRef(new Animated.Value(0)).current
  const scenario = trainingScenarios.find((item) => item.id === scenarioId)
  const step = scenario?.steps[stepIndex]

  useEffect(() => {
    void AsyncStorage.getItem(TRAINING_KEY).then((stored) => {
      if (!stored) return
      const data = JSON.parse(stored) as Partial<TrainingProgress>
      setBestScore(data.bestScore ?? 0)
      setCompletedCount(data.completedCount ?? 0)
      setSkillMistakes(data.skillMistakes ?? {})
      const today = dayKey()
      setStreak(data.streak ?? 0)
      setTodayCompleted(data.todayKey === today ? data.todayCompleted ?? 0 : 0)
    }).catch(() => undefined)
  }, [])

  useEffect(() => {
    void listTrainingVoices().then((items) => {
      setVoiceOptions(items)
      setVoiceCatalogStatus(items.length ? '' : 'No voices available')
    }).catch(() => setVoiceCatalogStatus('Connect the backend to load ElevenLabs voices'))
  }, [])

  useEffect(() => {
    void AsyncStorage.getItem(TRAINING_VOICE_KEY).then((stored) => {
      if (stored) setVoiceId(stored)
    }).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!scenario || !step) return
    reveal.setValue(0)
    Animated.timing(reveal, { duration: 260, toValue: 1, useNativeDriver: true }).start()
  }, [reveal, scenario, step])

  const start = (id: string) => { setScenarioId(id); setStepIndex(0); setAnswers([]); setFeedback(''); setVoiceStatus(''); setPendingNextStep(null); setSessionEvents([]); setVoiceTranscript(''); setStepStartedAt(Date.now()); evidenceSavedRef.current = false }
  const startExam = () => {
    const queue = examScenarios().map((item) => item.id)
    setExamQueue(queue)
    setExamIndex(0)
    setExamScores([])
    setExamResult(null)
    start(queue[0]!)
  }
  const choose = (safe: boolean, message: string, choice?: TrainingChoice, responseText?: string) => {
    if (feedback) return
    setAnswers((current) => [...current, safe])
    setFeedback(message)
    setPendingNextStep(choice?.nextStepIndex ?? null)
    setSessionEvents((current) => [...current, { stepIndex, pattern: step?.pattern ?? 'unknown', safe, responseText, reactionMs: Math.max(0, Date.now() - stepStartedAt) }])
  }
  const next = () => {
    if (!scenario) return
    const nextStepIndex = pendingNextStep ?? stepIndex + 1
    if (nextStepIndex < scenario.steps.length) { setStepIndex(nextStepIndex); setPendingNextStep(null); setFeedback(''); setStepStartedAt(Date.now()) }
    else {
      const score = trainingScore(answers)
      const nextBest = Math.max(bestScore, score)
      const unsafeAnswers = answers.filter((answer) => !answer).length
      const nextMistakes = unsafeAnswers > 0 ? { ...skillMistakes, [scenarioSkill(scenario)]: (skillMistakes[scenarioSkill(scenario)] ?? 0) + unsafeAnswers } : skillMistakes
      setBestScore(nextBest)
      setSkillMistakes(nextMistakes)
      setCompletedCount((current) => {
        const nextCount = current + 1
        const today = dayKey()
        const nextToday = todayCompleted + 1
        const nextStreak = todayCompleted > 0 ? streak : streak + 1
        setTodayCompleted(nextToday)
        setStreak(nextStreak)
        void AsyncStorage.setItem(TRAINING_KEY, JSON.stringify({ bestScore: nextBest, completedCount: nextCount, skillMistakes: nextMistakes, streak: nextStreak, todayKey: today, todayCompleted: nextToday, lastCompletedAt: new Date().toISOString() } satisfies TrainingProgress))
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
      setPendingNextStep(null)
      setStepStartedAt(Date.now())
    }
  }

  const persistEvidence = (score: number, source: TrainingEvidence['source'] = voiceTranscript ? 'voice_response' : voiceId ? 'synthetic_training' : 'android_tts') => {
    if (!scenario || evidenceSavedRef.current) return
    evidenceSavedRef.current = true
    const evidence: TrainingEvidence = { id: 'training-' + Date.now(), scenarioId: scenario.id, title: scenario.title, language: scenario.language, difficulty: scenario.difficulty, score, voiceId, source, events: sessionEvents, createdAt: new Date().toISOString() }
    void AsyncStorage.getItem('voiceshield.training.evidence.v1').then((stored) => {
      const items = stored ? JSON.parse(stored) as TrainingEvidence[] : []
      return AsyncStorage.setItem('voiceshield.training.evidence.v1', JSON.stringify([evidence, ...items].slice(0, 50)))
    }).catch(() => undefined)
  }

  const listenForAnswer = async () => {
    if (!scenario || !step || !TrainingVoiceModule?.listen) {
      setVoiceStatus('Voice answer mode is available in the Android app.')
      return
    }
    setIsListening(true)
    setVoiceTranscript('')
    try {
      const response = await TrainingVoiceModule.listen(scenario.language)
      setVoiceTranscript(response)
      const assessment = assessSpokenTrainingResponse(response, step)
      if (assessment === 'unclear') {
        setVoiceStatus('I could not map that answer safely. Choose an action below.')
        return
      }
      const choice = step.choices.find((item) => item.safe === (assessment === 'safe'))
      if (choice) choose(choice.safe, choice.feedback + ' Spoken answer: "' + response + '"', choice, response)
    } catch {
      setVoiceStatus('Voice recognition is unavailable. You can choose an action manually.')
    } finally {
      setIsListening(false)
    }
  }

  const speakCaller = async () => {
    if (!scenario || !step || !TrainingVoiceModule) {
      setVoiceStatus('Voice simulation is available in the Android app.')
      return
    }
    try {
      setVoiceStatus('Preparing training voice…')
      try {
        const generated = await requestTrainingVoice(step.caller, scenario.language, voiceId)
        await TrainingVoiceModule.playBase64(generated.audioBase64, generated.mimeType)
        setVoiceStatus(generated.cached ? 'Playing cached synthetic training voice' : 'Playing synthetic training voice')
        return
      } catch {
        setVoiceStatus('Cloud training voice unavailable. Using device voice…')
        await TrainingVoiceModule.speak(step.caller, scenario.language)
      }
      setVoiceStatus('')
    } catch {
      setVoiceStatus(`Install a ${scenario.language} speech voice in Android settings to use this simulation.`)
    }
  }

  if (scenario && stepIndex >= scenario.steps.length) {
    const score = trainingScore(answers)
    persistEvidence(score)
    return <View style={styles.result}><Text style={styles.kicker}>SESSION COMPLETE</Text><Text style={styles.title}>Training result</Text><Text style={styles.score}>{score}<Text style={styles.outOf}>/100</Text></Text><Text style={styles.copy}>{score === 100 ? 'Excellent. You paused, verified and protected your data.' : 'Review the pressure pattern before replaying this scenario.'}</Text><View style={styles.reviewCard}><Text style={styles.reviewTitle}>Call debrief</Text>{sessionEvents.map((event, index) => <View key={String(event.stepIndex) + '-' + index} style={styles.reviewRow}><Text style={styles.reviewIcon}>{event.safe ? '✓' : '!'}</Text><View style={styles.reviewCopy}><Text style={styles.reviewPattern}>{event.pattern}</Text><Text style={styles.reviewMeta}>{event.safe ? 'Safe response' : 'Risky response'} · {Math.round(event.reactionMs / 100) / 10}s</Text></View></View>)}</View><Pressable style={styles.primary} onPress={() => start(scenario.id)}><Text style={styles.primaryText}>Repeat scenario</Text></Pressable><Pressable style={styles.secondary} onPress={() => setScenarioId(null)}><Text style={styles.secondaryText}>Choose another</Text></Pressable></View>
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
      <Pressable style={styles.listenButton} disabled={isListening || Boolean(feedback)} onPress={() => { void listenForAnswer() }}><Text style={styles.listenButtonText}>{isListening ? 'Listening…' : 'Speak your response'}</Text></Pressable>
      {voiceTranscript ? <Text style={styles.voiceTranscript}>You said: {voiceTranscript}</Text> : null}
      {voiceStatus ? <Text style={styles.voiceStatus}>{voiceStatus}</Text> : null}
      <Text style={styles.prompt}>What do you do?</Text>
      {step.choices.map((choice) => <Pressable key={choice.id} disabled={Boolean(feedback)} style={styles.choice} onPress={() => choose(choice.safe, choice.feedback, choice)}><Text style={styles.choiceText}>{choice.text}</Text></Pressable>)}
      {feedback ? <View style={styles.feedback}><Text style={styles.feedbackText}>{feedback}</Text><Text style={styles.pattern}>Pattern: {step.pattern}</Text><Pressable style={styles.primary} onPress={next}><Text style={styles.primaryText}>{stepIndex + 1 === scenario.steps.length ? 'See result' : 'Next call step'}</Text></Pressable></View> : null}
    </Animated.View>
  }

  if (examResult !== null) {
    return <View style={styles.result}><Text style={styles.kicker}>EXAM COMPLETE</Text><Text style={styles.title}>Fraud recognition score</Text><Text style={styles.score}>{examResult}<Text style={styles.outOf}>/100</Text></Text><Text style={styles.copy}>{examResult >= 80 ? 'You recognised the main pressure patterns. Review any unsafe answers before a real call.' : 'Review the weak skill cards, then take another exam.'}</Text><Pressable style={styles.primary} onPress={startExam}><Text style={styles.primaryText}>New exam</Text></Pressable><Pressable style={styles.secondary} onPress={() => setExamResult(null)}><Text style={styles.secondaryText}>Back to training</Text></Pressable></View>
  }

  const weakSkill = (Object.entries(skillMistakes) as Array<[TrainingSkill, number]>).sort((left, right) => right[1] - left[1])[0]?.[0]
  const daily = weakSkill ? trainingScenarios.find((item) => scenarioSkill(item) === weakSkill) ?? dailyTrainingScenario() : dailyTrainingScenario()
  const visibleScenarios = selectedSkill === 'all' ? trainingScenarios : trainingScenarios.filter((item) => scenarioSkill(item) === selectedSkill)
  return (
    <View>
      <View style={styles.trainingHero}>
        <View style={styles.heroTop}><View style={styles.heroCopy}><Text style={styles.kicker}>VOICE LAB · KZ EDITION</Text><Text style={styles.trainingHeroTitle}>Learn to stop a scam</Text><Text style={styles.heroHint}>Short practice calls, real pressure patterns, safer decisions.</Text></View><SnowLeopardMascot /></View>
        <View style={styles.goalRow}><View style={styles.goalCopy}><Text style={styles.goalTitle}>Today&apos;s protection goal</Text><Text style={styles.goalMeta}>{Math.min(todayCompleted, dailyGoal)} of {dailyGoal} lessons · Level {Math.floor(completedCount / 5) + 1}</Text></View><Text style={styles.streak}>🔥 {streak}</Text></View>
        <View style={styles.goalTrack}><View style={[styles.goalFill, { width: `${Math.min(100, (todayCompleted / dailyGoal) * 100)}%` }]} /></View>
        <View style={styles.stats}><Text style={styles.stat}>{completedCount} sessions</Text><Text style={styles.stat}>{bestScore} best</Text><Text style={styles.stat}>{trainingScenarios.length} cases</Text></View>
        {weakSkill ? <Text style={styles.adaptive}>Recommended focus: {trainingSkillLabels[weakSkill]}. Your mistakes stay on this device.</Text> : null}
      </View>
      <View style={styles.voiceSettings}><Text style={styles.filterTitle}>Training voice</Text><Text style={styles.hint}>Choose a voice from your ElevenLabs account.</Text>{voiceOptions.length ? <View style={styles.voiceOptions}>{voiceOptions.map((option) => <Pressable key={option.voiceId} onPress={() => { setVoiceId(option.voiceId); void AsyncStorage.setItem(TRAINING_VOICE_KEY, option.voiceId) }} style={[styles.voiceOption, voiceId === option.voiceId && styles.voiceOptionActive]}><Text style={[styles.voiceOptionText, voiceId === option.voiceId && styles.voiceOptionTextActive]}>{option.name}</Text><Text style={styles.voiceOptionMeta}>{option.category ?? 'Voice'}</Text></Pressable>)}</View> : null}{voiceCatalogStatus ? <Text style={styles.voiceStatus}>{voiceCatalogStatus}</Text> : null}<TextInput value={voiceId} onChangeText={(value) => { setVoiceId(value); void AsyncStorage.setItem(TRAINING_VOICE_KEY, value) }} placeholder="Or paste a Voice ID" placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} style={styles.voiceInput} /></View>
      <View style={styles.modeRow}><Pressable style={styles.daily} onPress={() => start(daily.id)}><Text style={styles.modeKicker}>TODAY</Text><Text style={styles.modeTitle}>{daily.title}</Text><Text style={styles.modeCopy}>Daily practice</Text></Pressable><Pressable style={styles.exam} onPress={startExam}><Text style={styles.modeKicker}>EXAM</Text><Text style={styles.modeTitle}>5-case challenge</Text><Text style={styles.modeCopy}>Measure your skills</Text></Pressable></View>
      <View style={styles.pathHeader}><Text style={styles.filterTitle}>Your protection path</Text><Text style={styles.pathHint}>{todayCompleted >= dailyGoal ? 'Goal complete' : `${dailyGoal - todayCompleted} lesson${dailyGoal - todayCompleted === 1 ? '' : 's'} to go`}</Text></View>
      <View style={styles.pathRow}><View style={[styles.pathNode, styles.pathNodeDone]}><Text style={styles.pathNodeIcon}>✓</Text><Text style={styles.pathNodeText}>Pause</Text></View><View style={styles.pathLine} /><View style={[styles.pathNode, completedCount > 0 && styles.pathNodeDone]}><Text style={styles.pathNodeIcon}>◉</Text><Text style={styles.pathNodeText}>Verify</Text></View><View style={styles.pathLine} /><View style={[styles.pathNode, completedCount >= 5 && styles.pathNodeDone]}><Text style={styles.pathNodeIcon}>★</Text><Text style={styles.pathNodeText}>Protect</Text></View></View>
      <View style={styles.pathHeader}><Text style={styles.filterTitle}>Practice by skill</Text><Text style={styles.pathHint}>{visibleScenarios.length} cases</Text></View>
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
  adaptive: { color: '#d8ebe1', fontSize: 11, lineHeight: 16, marginTop: 2 },
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
  voiceSettings: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, gap: 6, marginBottom: 14, padding: 13 },
  voiceInput: { borderColor: colors.border, borderRadius: 7, borderWidth: 1, color: colors.ink, fontSize: 13, paddingHorizontal: 11, paddingVertical: 9 },
  voiceOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  voiceOption: { backgroundColor: '#f8fafc', borderColor: colors.border, borderRadius: 7, borderWidth: 1, maxWidth: '48%', paddingHorizontal: 9, paddingVertical: 8 },
  voiceOptionActive: { backgroundColor: '#e8f7ef', borderColor: colors.brand },
  voiceOptionText: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  voiceOptionTextActive: { color: colors.brandDark },
  voiceOptionMeta: { color: colors.sub, fontSize: 10, marginTop: 2 },
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
  listenButton: { alignSelf: 'flex-start', backgroundColor: '#e8f7ef', borderColor: '#88c5ad', borderRadius: 8, borderWidth: 1, marginTop: -4, paddingHorizontal: 13, paddingVertical: 10 },
  listenButtonText: { color: colors.brandDark, fontSize: 12, fontWeight: '900' },
  voiceTranscript: { backgroundColor: colors.chipBg, borderRadius: 7, color: colors.sub, fontSize: 12, lineHeight: 17, padding: 9 },
  reviewCard: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8, borderWidth: 1, gap: 10, padding: 13, width: '100%' },
  reviewTitle: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  reviewRow: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  reviewIcon: { backgroundColor: colors.softBrand, borderRadius: 15, color: colors.brandDark, fontSize: 15, fontWeight: '900', height: 28, paddingTop: 4, textAlign: 'center', width: 28 },
  reviewCopy: { flex: 1, gap: 2 },
  reviewPattern: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  reviewMeta: { color: colors.sub, fontSize: 11 },
  heroTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  heroCopy: { flex: 1, gap: 7, paddingRight: 8 },
  goalRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  goalCopy: { gap: 2 },
  goalTitle: { color: '#fff', fontSize: 13, fontWeight: '900' },
  goalMeta: { color: '#b9dfcf', fontSize: 11 },
  streak: { color: '#ffe4a8', fontSize: 16, fontWeight: '900' },
  goalTrack: { backgroundColor: '#1e5948', borderRadius: 6, height: 7, marginTop: 7, overflow: 'hidden' },
  goalFill: { backgroundColor: '#f4c95d', borderRadius: 6, height: '100%' },
  pathHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  pathHint: { color: colors.muted, fontSize: 11, fontWeight: '800' },
  pathRow: { alignItems: 'flex-start', flexDirection: 'row', marginBottom: 17, paddingHorizontal: 4 },
  pathNode: { alignItems: 'center', gap: 4, width: 62 },
  pathNodeDone: { opacity: 1 },
  pathNodeIcon: { backgroundColor: colors.chipBg, borderColor: colors.border, borderRadius: 20, borderWidth: 1, color: colors.sub, fontSize: 16, height: 34, paddingTop: 7, textAlign: 'center', width: 34 },
  pathNodeText: { color: colors.sub, fontSize: 10, fontWeight: '900' },
  pathLine: { backgroundColor: colors.border, flex: 1, height: 2, marginHorizontal: 4, marginTop: 16 },
  mascot: { height: 88, position: 'relative', width: 84 },
  mascotFace: { alignItems: 'center', backgroundColor: '#f8f8f0', borderColor: '#cbd8cf', borderRadius: 42, borderWidth: 2, height: 72, justifyContent: 'center', left: 6, overflow: 'hidden', position: 'absolute', top: 7, width: 72 },
  mascotEarLeft: { backgroundColor: '#f8f8f0', borderColor: '#cbd8cf', borderRadius: 10, borderWidth: 2, height: 22, left: 6, position: 'absolute', top: 1, transform: [{ rotate: '-28deg' }], width: 22 },
  mascotEarRight: { backgroundColor: '#f8f8f0', borderColor: '#cbd8cf', borderRadius: 10, borderWidth: 2, height: 22, position: 'absolute', right: 6, top: 1, transform: [{ rotate: '28deg' }], width: 22 },
  mascotMark: { color: '#d7c25c', fontSize: 18, position: 'absolute', top: 10 },
  mascotSpot: { backgroundColor: '#8b9c91', borderRadius: 4, height: 5, opacity: 0.75, position: 'absolute', width: 5 },
  mascotSpotOne: { left: 16, top: 31 },
  mascotSpotTwo: { right: 16, top: 35 },
  mascotSpotThree: { left: 23, top: 46 },
  mascotEyes: { flexDirection: 'row', gap: 18, marginTop: 10 },
  mascotEye: { backgroundColor: '#10251d', borderRadius: 4, height: 7, width: 7 },
  mascotMuzzle: { alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, height: 20, justifyContent: 'center', marginTop: 4, width: 32 },
  mascotNose: { color: '#3c5147', fontSize: 15, lineHeight: 16 },
  mascotScarf: { alignItems: 'center', backgroundColor: '#147a5c', borderColor: '#f4c95d', borderRadius: 4, borderWidth: 1, bottom: 1, height: 18, justifyContent: 'center', position: 'absolute', right: 1, transform: [{ rotate: '-8deg' }], width: 73 },
  mascotFlag: { fontSize: 13 },
})
