import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { OnDeviceAiRuntime } from './useOnDeviceAiRuntime'
import { SecureStorage } from '../bridge/SecureStorageBridge'
import { cloudProviderById } from '../data/cloudAiProviders'
import { hasProviderLiveConsent, setProviderLiveConsent } from '../services/cloudAiClient'
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
  ruleEvidence: string
  ramBytes: number
  languageContext?: string
}

const LIVE_AI_ENABLED_KEY = 'voiceshield.live-ai.enabled.v1'

export function useLiveAiAnalysis({ ai, transcript, isListening, ruleRisk, ruleScore, ruleEvidence, ramBytes, languageContext = '' }: Options) {
  const [enabled, setEnabledState] = useState(true)
  const [cloudLiveConsent, setCloudLiveConsent] = useState(false)
  const [cloudConsentHydrated, setCloudConsentHydrated] = useState(false)
  const [status, setStatus] = useState<LiveAiStatus>('waiting')
  const [result, setResult] = useState<LiveAiResult | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [analyzedAt, setAnalyzedAt] = useState<number | null>(null)

  const latestTranscriptRef = useRef(transcript)
  const languageContextRef = useRef(languageContext)
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
  const cloudProviderId = ai.engine === 'cloud' ? ai.activeCloudConfig?.providerId ?? null : null
  const aiGenerationOwner = ai.generationOwner
  const stopAiGeneration = ai.stopGeneration
  const isCloud = cloudProviderId !== null
  const canRun = enabled && (!isCloud || (cloudConsentHydrated && cloudLiveConsent))
  const previousModelIdentityRef = useRef(modelIdentity)

  latestTranscriptRef.current = transcript
  languageContextRef.current = languageContext
  enabledRef.current = canRun
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
      const request = buildLiveAiGenerationRequest(currentTranscript, languageContextRef.current, `risk=${ruleRisk}; score=${ruleScore}; evidence=${ruleEvidence.slice(0, 800)}`)
      const full = await ai.generate({ ...request, owner: 'live', onToken: appendToken })
      tokenBufferRef.current = full
      flushDraft()
      setResult(parseLiveAiResponse(full))
      lastAnalyzedRef.current = currentTranscript
      setAnalyzedAt(Date.now())
      setStatus('ready')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'AI не смог проанализировать транскрипт.'
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
  }, [ai, appendToken, flushDraft, ramBytes, result, ruleEvidence, ruleRisk, ruleScore, schedule])

  runRef.current = runAnalysis

  useEffect(() => {
    void Promise.all([
      SecureStorage.getItem(LIVE_AI_ENABLED_KEY),
      AsyncStorage.getItem(LIVE_AI_ENABLED_KEY).catch(() => null),
    ])
      .then(async ([secureValue, legacyValue]) => {
        const value = secureValue ?? legacyValue
        const next = value !== 'disabled'
        setEnabledState(next)
        if (secureValue === null && legacyValue !== null) {
          await SecureStorage.setItem(LIVE_AI_ENABLED_KEY, legacyValue)
          await AsyncStorage.removeItem(LIVE_AI_ENABLED_KEY).catch(() => undefined)
        }
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    let active = true
    setCloudConsentHydrated(!cloudProviderId)
    setCloudLiveConsent(false)
    if (!cloudProviderId) return () => { active = false }
    void hasProviderLiveConsent(cloudProviderId)
      .then((accepted) => {
        if (!active) return
        setCloudLiveConsent(accepted)
        setCloudConsentHydrated(true)
      })
      .catch(() => {
        if (active) setCloudConsentHydrated(true)
      })
    return () => { active = false }
  }, [cloudProviderId])

  useEffect(() => {
    if (!canRun || !isListening || !ai.hydrated) {
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
  }, [ai.hydrated, canRun, clearTimer, isListening, schedule, transcript])

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
    setStatus(canRun ? (result ? 'ready' : 'waiting') : 'disabled')
  }, [canRun, result, transcript])

  useEffect(() => {
    if (canRun) {
      if (status === 'disabled') setStatus('waiting')
      return
    }
    clearTimer()
    pendingRef.current = false
    setStatus('disabled')
    if (aiGenerationOwner === 'live') void stopAiGeneration('live')
  }, [aiGenerationOwner, canRun, clearTimer, status, stopAiGeneration])

  useEffect(() => () => {
    clearTimer()
    if (tokenTimerRef.current) clearTimeout(tokenTimerRef.current)
  }, [clearTimer])

  const setEnabled = useCallback(async (next: boolean) => {
    if (next && cloudProviderId && !cloudLiveConsent) {
      setError(`Подтвердите отдельное согласие на Live AI для ${cloudProviderById[cloudProviderId].title}.`)
      setStatus('disabled')
      return
    }
    enabledRef.current = next
    setEnabledState(next)
    setStatus(next ? 'waiting' : 'disabled')
    await SecureStorage.setItem(LIVE_AI_ENABLED_KEY, next ? 'enabled' : 'disabled')
    await AsyncStorage.removeItem(LIVE_AI_ENABLED_KEY).catch(() => undefined)
    if (!next) {
      clearTimer()
      pendingRef.current = false
      await stopAiGeneration('live')
    } else if (listeningRef.current) {
      schedule(400)
    }
  }, [clearTimer, cloudLiveConsent, cloudProviderId, schedule, stopAiGeneration])

  const acceptCloudLiveConsent = useCallback(async () => {
    if (!cloudProviderId) return
    await setProviderLiveConsent(cloudProviderId, true)
    setCloudLiveConsent(true)
    setCloudConsentHydrated(true)
    setError(null)
    setEnabledState(true)
    enabledRef.current = true
    setStatus('waiting')
    await SecureStorage.setItem(LIVE_AI_ENABLED_KEY, 'enabled')
    if (listeningRef.current) schedule(400)
  }, [cloudProviderId, schedule])

  const revokeCloudLiveConsent = useCallback(async () => {
    if (!cloudProviderId) return
    await setProviderLiveConsent(cloudProviderId, false)
    setCloudLiveConsent(false)
    enabledRef.current = false
    clearTimer()
    pendingRef.current = false
    await stopAiGeneration('live')
    setStatus('disabled')
  }, [clearTimer, cloudProviderId, stopAiGeneration])

  const analyzeNow = useCallback(() => runAnalysis(true), [runAnalysis])
  const disagreement = useMemo(() => liveAiDisagreement(ruleRisk, result?.risk ?? 'unknown'), [result?.risk, ruleRisk])

  return {
    analyzeNow,
    analyzedAt,
    acceptCloudLiveConsent,
    cloudProviderName: cloudProviderId ? cloudProviderById[cloudProviderId].title : null,
    disagreement,
    draft,
    enabled: canRun,
    error,
    modelName: ai.modelName,
    requiresCloudConsent: isCloud && cloudConsentHydrated && !cloudLiveConsent,
    revokeCloudLiveConsent,
    result,
    ruleRisk,
    ruleScore,
    setEnabled,
    status,
  }
}

export type LiveAiAnalysisController = ReturnType<typeof useLiveAiAnalysis>
