import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { OnDeviceAiRuntime } from './useOnDeviceAiRuntime'
import {
  buildLiveAiGenerationRequest,
  concurrentAiModelLimit,
  LIVE_AI_DEBOUNCE_MS,
  LIVE_AI_MIN_INTERVAL_MS,
  LIVE_AI_MIN_TRANSCRIPT_CHARS,
  liveAiDisagreement,
  parseLiveAiResponse,
  shouldAnalyzeLiveTranscript,
  type LiveAiResult,
} from '../utils/liveAiAnalysis'

export type LiveAiStatus = 'disabled' | 'waiting' | 'loading' | 'analyzing' | 'ready' | 'error'

type Options = {
  ai: OnDeviceAiRuntime
  transcript: string
  isListening: boolean
  ruleRisk: string
  ruleScore: number
  ramBytes: number
}

const LIVE_AI_ENABLED_KEY = 'voiceshield.live-ai.enabled.v1'

export function useLiveAiAnalysis({ ai, transcript, isListening, ruleRisk, ruleScore, ramBytes }: Options) {
  const [enabled, setEnabledState] = useState(true)
  const [status, setStatus] = useState<LiveAiStatus>('waiting')
  const [result, setResult] = useState<LiveAiResult | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [analyzedAt, setAnalyzedAt] = useState<number | null>(null)

  const latestTranscriptRef = useRef(transcript)
  const enabledRef = useRef(true)
  const listeningRef = useRef(isListening)
  const previousListeningRef = useRef(isListening)
  const inFlightRef = useRef(false)
  const pendingRef = useRef(false)
  const lastAnalyzedRef = useRef('')
  const lastStartedAtRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timerDueAtRef = useRef(0)
  const runRef = useRef<(force: boolean) => Promise<void>>(async () => undefined)
  const tokenBufferRef = useRef('')
  const tokenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const modelIdentity = `${ai.engine}:${ai.modelName}:${ai.activeLocalModelId ?? ''}`
  const previousModelIdentityRef = useRef(modelIdentity)

  latestTranscriptRef.current = transcript
  enabledRef.current = enabled
  listeningRef.current = isListening

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    timerDueAtRef.current = 0
  }, [])

  const schedule = useCallback((delayMs: number) => {
    const dueAt = Date.now() + delayMs
    if (timerRef.current && timerDueAtRef.current > 0 && timerDueAtRef.current <= dueAt) return
    clearTimer()
    timerDueAtRef.current = dueAt
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      timerDueAtRef.current = 0
      void runRef.current(false)
    }, delayMs)
  }, [clearTimer])

  const flushDraft = useCallback(() => {
    if (tokenTimerRef.current) clearTimeout(tokenTimerRef.current)
    tokenTimerRef.current = null
    setDraft(tokenBufferRef.current)
  }, [])

  const appendToken = useCallback((token: string) => {
    tokenBufferRef.current += token
    if (tokenTimerRef.current) return
    tokenTimerRef.current = setTimeout(flushDraft, 140)
  }, [flushDraft])

  const runAnalysis = useCallback(async (force: boolean) => {
    const currentTranscript = latestTranscriptRef.current.replace(/\s+/gu, ' ').trim()
    if (!enabledRef.current) {
      setStatus('disabled')
      return
    }
    if (currentTranscript.length < LIVE_AI_MIN_TRANSCRIPT_CHARS) {
      setStatus('waiting')
      setError(null)
      return
    }
    if (!force && !shouldAnalyzeLiveTranscript(currentTranscript, lastAnalyzedRef.current)) return
    if (inFlightRef.current) {
      pendingRef.current = true
      return
    }
    if (ai.generating && ai.generationOwner !== 'live') {
      pendingRef.current = true
      setStatus('waiting')
      schedule(1800)
      return
    }

    const concurrentLimit = concurrentAiModelLimit(ramBytes)
    if (ai.modelSize > 0 && ai.modelSize > concurrentLimit) {
      setStatus('error')
      setError(`Модель ${ai.modelName} слишком тяжёлая для одновременной работы с распознаванием. Выберите Gemma или GGUF до ${Math.round(concurrentLimit / 1024 ** 2)} МБ.`)
      return
    }

    inFlightRef.current = true
    pendingRef.current = false
    lastStartedAtRef.current = Date.now()
    tokenBufferRef.current = ''
    setDraft('')
    setError(null)
    setStatus(ai.modelReady ? 'analyzing' : 'loading')
    try {
      await ai.ensureReady()
      setStatus('analyzing')
      const request = buildLiveAiGenerationRequest(currentTranscript)
      const full = await ai.generate({ ...request, owner: 'live', onToken: appendToken })
      tokenBufferRef.current = full
      flushDraft()
      setResult(parseLiveAiResponse(full))
      lastAnalyzedRef.current = currentTranscript
      setAnalyzedAt(Date.now())
      setStatus('ready')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Локальный AI не смог проанализировать транскрипт.'
      if (!enabledRef.current) {
        setStatus('disabled')
      } else if (/AI_BUSY/iu.test(message)) {
        pendingRef.current = true
        setStatus('waiting')
      } else if (/cancel|отмен/iu.test(message)) {
        setStatus(result ? 'ready' : 'waiting')
      } else {
        setStatus('error')
        setError(message.replace(/^AI_MODEL_MISSING:\s*/u, ''))
      }
    } finally {
      inFlightRef.current = false
      const hasNewText = shouldAnalyzeLiveTranscript(latestTranscriptRef.current, lastAnalyzedRef.current)
      if (enabledRef.current && listeningRef.current && (pendingRef.current || hasNewText)) {
        const throttle = Math.max(0, LIVE_AI_MIN_INTERVAL_MS - (Date.now() - lastStartedAtRef.current))
        schedule(Math.max(1600, throttle))
      }
    }
  }, [ai, appendToken, flushDraft, ramBytes, result, schedule])

  runRef.current = runAnalysis

  useEffect(() => {
    void AsyncStorage.getItem(LIVE_AI_ENABLED_KEY)
      .then((value) => {
        const next = value !== 'disabled'
        enabledRef.current = next
        setEnabledState(next)
        setStatus(next ? 'waiting' : 'disabled')
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!enabled || !isListening || !ai.hydrated) {
      clearTimer()
      return
    }
    if (transcript.trim().length < LIVE_AI_MIN_TRANSCRIPT_CHARS) {
      setStatus('waiting')
      return
    }
    if (shouldAnalyzeLiveTranscript(transcript, lastAnalyzedRef.current)) {
      const throttle = Math.max(0, LIVE_AI_MIN_INTERVAL_MS - (Date.now() - lastStartedAtRef.current))
      schedule(Math.max(LIVE_AI_DEBOUNCE_MS, throttle))
    }
  }, [ai.hydrated, clearTimer, enabled, isListening, schedule, transcript])

  useEffect(() => {
    if (isListening && !previousListeningRef.current) {
      lastAnalyzedRef.current = ''
      pendingRef.current = false
      setResult(null)
      setDraft('')
      setAnalyzedAt(null)
      setError(null)
      setStatus(enabledRef.current ? 'waiting' : 'disabled')
    }
    previousListeningRef.current = isListening
    listeningRef.current = isListening
  }, [isListening])

  useEffect(() => {
    if (previousModelIdentityRef.current === modelIdentity) return
    previousModelIdentityRef.current = modelIdentity
    lastAnalyzedRef.current = ''
    pendingRef.current = false
    setResult(null)
    setDraft('')
    setAnalyzedAt(null)
    setError(null)
    setStatus(enabledRef.current ? 'waiting' : 'disabled')
    if (enabledRef.current && listeningRef.current) schedule(400)
  }, [modelIdentity, schedule])

  useEffect(() => {
    if (transcript.trim()) return
    lastAnalyzedRef.current = ''
    pendingRef.current = false
    setDraft('')
    setError(null)
    setStatus(enabled ? (result ? 'ready' : 'waiting') : 'disabled')
  }, [enabled, result, transcript])

  useEffect(() => () => {
    clearTimer()
    if (tokenTimerRef.current) clearTimeout(tokenTimerRef.current)
  }, [clearTimer])

  const setEnabled = useCallback(async (next: boolean) => {
    enabledRef.current = next
    setEnabledState(next)
    setStatus(next ? 'waiting' : 'disabled')
    await AsyncStorage.setItem(LIVE_AI_ENABLED_KEY, next ? 'enabled' : 'disabled')
    if (!next) {
      clearTimer()
      pendingRef.current = false
      await ai.stopGeneration('live')
    } else if (listeningRef.current) {
      schedule(400)
    }
  }, [ai, clearTimer, schedule])

  const analyzeNow = useCallback(() => runAnalysis(true), [runAnalysis])
  const disagreement = useMemo(() => liveAiDisagreement(ruleRisk, result?.risk ?? 'unknown'), [result?.risk, ruleRisk])

  return {
    analyzeNow,
    analyzedAt,
    disagreement,
    draft,
    enabled,
    error,
    modelName: ai.modelName,
    result,
    ruleRisk,
    ruleScore,
    setEnabled,
    status,
  }
}

export type LiveAiAnalysisController = ReturnType<typeof useLiveAiAnalysis>
