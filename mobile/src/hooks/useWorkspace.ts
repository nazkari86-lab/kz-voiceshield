import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Linking, PermissionsAndroid, Platform, Share, Vibration } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { accessibilityEvents, AccessibilityModule } from '@bridge/AccessibilityBridge'
import { callEvents, CallModule } from '@bridge/CallModule'
import type { SafeCallEvent } from '@bridge/CallModule'
import { AudioCaptureModule, audioEvents, ModelDownloader, modelEvents, WhisperModule, whisperEvents } from '@bridge/WhisperBridge'
import { OverlayModule } from '@bridge/OverlayBridge'
import { notificationEvents } from '@bridge/NotificationAccessBridge'
import { SecureStorage } from '@bridge/SecureStorageBridge'
import { detectCallbackNumber } from '../utils/callbackDetector'
import { buildKsc2LanguageContext, enhanceTranscript } from '../utils/transcriptEnhancer'
import { analyzePressure } from '../utils/pressureAnalyzer'
import { matchSemanticTemplates } from '../utils/semanticMatcher'
import { getRepeatRiskBonus, recordCall } from '../utils/callMemory'
import { saveTranscriptEntry } from '../utils/transcriptHistory'
import { addFineTuneExample } from '../utils/fineTuneDataCollector'
import { assessTranscriptQuality } from '../utils/transcriptQuality'
import { modelFor, recommendedModel, whisperModels } from '../data/whisperModels'
import type { ModelStorageInfo, WhisperModelChoice } from '../data/whisperModels'
import {
  analyzeTranscript,
  buildEvidenceBundle,
  buildReport,
  callSignalsFromVerification,
  createWorkflowState,
  datasetQuality,
  deviceSignalsFromId,
  exportCsv,
  exportJsonl,
  exportSplitJson,
  labelText,
  notificationSignalsFromId,
  phoneReputationSignals,
  redactSensitiveText,
  samples,
  sentenceTimeline,
  statusText,
  storageKey,
} from '@scoring'
import type { CaseLabel, CaseStatus, RiskSignal, SavedCase, WorkflowFlags } from '@scoring'

const validStatuses: CaseStatus[] = ['new', 'reviewing', 'escalated', 'closed']

const modelSizeKey = 'voiceshield.model-size.v1'
const recognitionLanguageKey = 'voiceshield.recognition-language.v1'
const privacyConsentKey = 'voiceshield.privacy-consent.v1'
const donationConsentKey = 'voiceshield.donation-consent.v1'
const trustedContactKey = 'voiceshield.trusted-contact.v1'
const autoDeleteTranscriptKey = 'voiceshield.auto-delete-transcript.v1'
const autoDisconnectKey = 'voiceshield.auto-disconnect-critical.v1'

const ensureMicrophonePermission = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return true
  const permission = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
  if (await PermissionsAndroid.check(permission)) return true
  const result = await PermissionsAndroid.request(permission)
  return result === PermissionsAndroid.RESULTS.GRANTED
}

export type TrustedContact = { name: string; phone: string }

const normalizeSavedCase = (item: SavedCase): SavedCase => {
  const transcript = redactSensitiveText(item.transcript)
  const enhancement = enhanceTranscript(transcript)
  const normalizedTranscript = redactSensitiveText(item.normalizedTranscript ?? enhancement.normalizedTranscript)
  const analysis = analyzeTranscript(normalizedTranscript, { signals: item.analysis?.contextSignals ?? [] })
  const workflow = createWorkflowState(analysis, item.createdAt, 'migration')
  return {
    ...item,
    transcript,
    normalizedTranscript,
    provenance: item.provenance ?? { origin: 'migration', trusted: false },
    analysis,
    assignedTo: item.assignedTo || workflow.assignedTo,
    auditLog: item.auditLog?.length ? item.auditLog : workflow.auditLog,
    decisionHistory: item.decisionHistory ?? [],
    flags: { ...workflow.flags, ...(item.flags ?? {}) },
    incidentTimeline: item.incidentTimeline?.length ? item.incidentTimeline : workflow.incidentTimeline,
    status: validStatuses.includes(item.status) ? item.status : workflow.status,
  }
}

export function useWorkspace() {
  // ---- intake + analysis ----
  const [transcript, setTranscript] = useState('')
  const [fileName, setFileName] = useState('manual-call.txt')
  const [caseLabel, setCaseLabel] = useState<CaseLabel>('unreviewed')
  const [analystNote, setAnalystNote] = useState('')
  const [reviewerName, setReviewerName] = useState('Fraud reviewer')
  const [source, setSource] = useState<'Live Caption' | 'Whisper' | 'Manual'>('Manual')

  // ---- model size preference ----
  const [modelSizePref, setModelSizePref] = useState<WhisperModelChoice>('auto')
  const [modelStorage, setModelStorage] = useState<ModelStorageInfo | null>(null)
  const [recognitionLanguage, setRecognitionLanguage] = useState<'auto' | 'ru' | 'kk'>('auto')

  // ---- live capture ----
  const [isListening, setIsListening] = useState(false)
  const [modelReady, setModelReady] = useState(false)
  const [modelProgress, setModelProgress] = useState<number | null>(null)
  const [audioLevel, setAudioLevel] = useState(0)
  const [captureError, setCaptureError] = useState<string | null>(null)
  const [captureNotice, setCaptureNotice] = useState<string | null>(null)
  const [deviceSignals, setDeviceSignals] = useState<RiskSignal[]>([])
  const [privacyConsent, setPrivacyConsent] = useState(false)
  const [donationConsent, setDonationConsent] = useState(false)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [callStatus, setCallStatus] = useState('No active call context')
  const [trustedContact, setTrustedContact] = useState<TrustedContact | null>(null)
  const [autoDeleteTranscript, setAutoDeleteTranscript] = useState(true)
  const [autoDisconnectCritical, setAutoDisconnectCritical] = useState(false)
  const [captureCompleteness, setCaptureCompleteness] = useState(1.0)
  // Hysteresis: track displayed risk to avoid bouncing alerts
  const lastAlertedRiskRef = useRef<string>('low')
  const alertCooldownRef = useRef<number>(0)
  // Dedup: last N chars from each source to prevent double-counting
  const lastLiveCaptionRef = useRef('')
  const lastWhisperRef = useRef('')
  // Temporal signals: track when each signal was received for decay
  const signalTimestampsRef = useRef<Map<string, number>>(new Map())
  const lastAudibleAtRef = useRef(Date.now())
  const sessionStartRef = useRef(Date.now())

  // ---- saved cases ----
  const [cases, setCases] = useState<SavedCase[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [repeatBonusData, setRepeatBonusData] = useState<{ bonus: number; reason: string } | null>(null)
  const llmAutoAnalysis: string | null = null

  const transcriptEnhancement = useMemo(() => enhanceTranscript(transcript), [transcript])
  const analysisTranscript = transcriptEnhancement.normalizedTranscript
  const ksc2LanguageContext = useMemo(() => buildKsc2LanguageContext(transcriptEnhancement), [transcriptEnhancement])
  const analysis = useMemo(() => analyzeTranscript(analysisTranscript, { signals: deviceSignals, captureCompleteness }), [analysisTranscript, deviceSignals, captureCompleteness])
  const pressureAnalysis = useMemo(() => analyzePressure(analysisTranscript), [analysisTranscript])
  const semanticMatches = useMemo(() => matchSemanticTemplates(analysisTranscript), [analysisTranscript])
  const callbackInfo = useMemo(() => detectCallbackNumber(analysisTranscript), [analysisTranscript])
  const timeline = useMemo(() => sentenceTimeline(analysisTranscript), [analysisTranscript])
  const quality = useMemo(() => datasetQuality(cases), [cases])
  const highSignals = analysis.evidence.filter((item) => item.severity === 'critical' || item.severity === 'high').length

  const datasetStageTotals = useMemo<[string, number][]>(
    () =>
      Object.entries(
        cases.reduce<Record<string, number>>((totals, item) => {
          item.analysis.stageCoverage.forEach((stage) => {
            totals[stage.stage] = (totals[stage.stage] ?? 0) + stage.count
          })
          return totals
        }, {}),
      ),
    [cases],
  )

  const operations = useMemo(() => {
    const openCases = cases.filter((item) => item.status !== 'closed')
    const escalationQueue = cases.filter((item) => item.status === 'escalated')
    const bankContactQueue = cases.filter((item) => item.flags.bankContactNeeded && item.status !== 'closed')
    const staleCases = cases.filter((item) => {
      const ageMs = Date.now() - new Date(item.updatedAt).getTime()
      return item.status !== 'closed' && ageMs > 1000 * 60 * 60 * 24
    })
    return {
      bankContactQueue,
      escalationQueue,
      openCases,
      staleCases,
      statusCounts: validStatuses.reduce<Record<CaseStatus, number>>(
        (totals, status) => {
          totals[status] = cases.filter((item) => item.status === status).length
          return totals
        },
        { closed: 0, escalated: 0, new: 0, reviewing: 0 },
      ),
    }
  }, [cases])

  // ---- encrypted persistence with one-time plaintext migration ----
  useEffect(() => {
    let active = true
    Promise.all([
      SecureStorage.getItem(storageKey).catch(() => null),
      SecureStorage.getItem(privacyConsentKey).catch(() => null),
      AsyncStorage.getItem(storageKey).catch(() => null),
      SecureStorage.getItem(trustedContactKey).catch(() => null),
      SecureStorage.getItem(donationConsentKey).catch(() => null),
      SecureStorage.getItem(autoDeleteTranscriptKey).catch(() => null),
      SecureStorage.getItem(autoDisconnectKey).catch(() => null),
      AsyncStorage.getItem(modelSizeKey).catch(() => null),
      AsyncStorage.getItem(recognitionLanguageKey).catch(() => null),
    ])
      .then(([encryptedCases, consent, legacyCases, storedTrustedContact, donation, autoDelete, autoDisconnect, storedModelSize, storedRecognitionLanguage]) => {
        if (storedModelSize === 'auto' || whisperModels.some((model) => model.id === storedModelSize)) {
          setModelSizePref(storedModelSize as WhisperModelChoice)
        }
        if (storedRecognitionLanguage === 'auto' || storedRecognitionLanguage === 'ru' || storedRecognitionLanguage === 'kk') setRecognitionLanguage(storedRecognitionLanguage)
        if (!active) return
        const stored = encryptedCases ?? legacyCases
        if (stored) {
          try {
            const parsed = JSON.parse(stored)
            if (!Array.isArray(parsed)) throw new Error('Case storage is not an array')
            const normalized = (parsed as SavedCase[]).map(normalizeSavedCase)
            setCases(normalized)
            if (!encryptedCases && legacyCases) {
              void SecureStorage.setItem(storageKey, JSON.stringify(normalized))
                .then(() => AsyncStorage.removeItem(storageKey))
                .catch(() => setStorageError('Could not migrate existing cases into encrypted storage.'))
            }
          } catch {
            setStorageError('Saved cases are damaged and were not loaded. Delete local data to recover.')
          }
        }
        setPrivacyConsent(consent === 'accepted')
        if (consent === 'accepted') void CallModule.updateProtectionConfig({ enabled: true }).catch(() => undefined)
        setDonationConsent(donation === 'accepted')
        setAutoDeleteTranscript(autoDelete !== 'disabled')
        setAutoDisconnectCritical(autoDisconnect === 'enabled')
        if (storedTrustedContact) {
          try {
            const parsed = JSON.parse(storedTrustedContact) as TrustedContact
            if (parsed.name && parsed.phone) setTrustedContact(parsed)
          } catch {
            setStorageError('The trusted contact record is damaged and was ignored.')
          }
        }
      })
      .catch(() => setStorageError('Encrypted local storage could not be opened.'))
      .finally(() => {
        if (active) setHydrated(true)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    const refreshStorage = () => ModelDownloader.getStorageInfo()
      .then((storage) => { if (active) setModelStorage(storage) })
      .catch(() => { if (active) setModelStorage(null) })
    void refreshStorage()
    const timer = setInterval(refreshStorage, 30_000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    SecureStorage.setItem(storageKey, JSON.stringify(cases))
      .then(() => setStorageError(null))
      .catch(() => setStorageError('Could not encrypt and save local cases.'))
  }, [cases, hydrated])

  useEffect(() => {
    const applyCallEvent = (event: SafeCallEvent) => {
      const ageMs = Date.now() - event.detectedAt
      if (ageMs < 0 || ageMs > 1000 * 60 * 5) return
      setCallStatus(
        event.reputation
          ? `${event.reputation.maskedNumber}: risk ${event.reputation.score}/100 · ${event.reputation.action.replace('_', ' ')}`
          : event.verificationStatus === 'failed'
          ? 'Incoming call detected: caller ID verification failed'
          : event.verificationStatus === 'passed'
            ? 'Incoming call detected: caller ID verification passed'
            : 'Incoming call detected: caller ID is not verified',
      )
      if (!privacyConsent) return
      const nextSignals = callSignalsFromVerification(event.verificationStatus)
      const reputationSignals = phoneReputationSignals(event.reputation?.score)
      setDeviceSignals((current) => [...new Map([...current, ...nextSignals, ...reputationSignals].map((item) => [item.id, item])).values()])
    }

    const subscription = callEvents.addListener('VS_CALL_INCOMING', applyCallEvent)
    if (privacyConsent) {
      void CallModule.consumePendingCall().then((event) => event && applyCallEvent(event)).catch(() => undefined)
    }
    return () => subscription.remove()
  }, [privacyConsent])

  // ---- live transcript wiring ----
  useEffect(() => {
    const liveCaptionSub = accessibilityEvents.addListener('VS_ACCESSIBILITY_TEXT', (event: { appSignalId?: string; text?: string }) => {
      if (!isListening) return
      if (event.appSignalId) {
        const nextSignals = deviceSignalsFromId(event.appSignalId)
        if (nextSignals.length > 0) {
          setDeviceSignals((current) => [...new Map([...current, ...nextSignals].map((item) => [item.id, item])).values()])
        }
      }
      if (event.text) {
        const incoming = event.text.trim().toLowerCase().slice(-60)
        // Dedup: skip if Whisper recently produced the same text
        if (lastWhisperRef.current && incoming && lastWhisperRef.current.includes(incoming)) return
        lastLiveCaptionRef.current = incoming
        setSource('Live Caption')
        setTranscript((current) => `${current} ${event.text}`.trim())
      }
    })
    const whisperSub = whisperEvents.addListener('VS_WHISPER_TRANSCRIPT', (event: { text?: string }) => {
      if (!event.text) return
      const quality = assessTranscriptQuality(event.text)
      if (!quality.accepted) {
        setCaptureNotice('Speech segment was too noisy or repetitive and was ignored. Keep the speakerphone close and try again.')
        return
      }
      const incoming = event.text.trim().toLowerCase().slice(-60)
      // Dedup: skip if Live Caption recently produced the same text
      if (lastLiveCaptionRef.current && incoming && lastLiveCaptionRef.current.includes(incoming)) return
      lastWhisperRef.current = incoming
      setSource('Whisper')
      setTranscript((current) => `${current} ${event.text}`.trim())
    })
    const levelSub = audioEvents.addListener('VS_AUDIO_LEVEL', (event: { level?: number }) => {
      const level = event.level ?? 0
      if (level >= 0.015) lastAudibleAtRef.current = Date.now()
      setAudioLevel(level)
    })
    const audioErrorSub = audioEvents.addListener('VS_AUDIO_CAPTURE_ERROR', (event: { message?: string }) => {
      if (event.message) setCaptureError(event.message)
    })
    const audioStartedSub = audioEvents.addListener('VS_AUDIO_CAPTURE_STARTED', (event: { source?: string }) => {
      if (event.source === 'microphone') {
        setCaptureNotice('Speakerphone microphone capture is active. VoiceShield keeps the call audio route unchanged.')
      } else if (event.source === 'voice_recognition') {
        setCaptureNotice('Compatibility microphone capture is active. Turn on speakerphone and raise call volume.')
      }
    })
    const audioRouteSub = audioEvents.addListener('VS_AUDIO_ROUTE_STATUS', (event: { bluetoothScoOn?: boolean; microphoneMuted?: boolean; speakerphoneOn?: boolean }) => {
      if (event.microphoneMuted) {
        setCaptureError('The phone microphone is muted. Unmute it before VoiceShield can transcribe speakerphone audio.')
      } else if (event.bluetoothScoOn) {
        setCaptureNotice('Bluetooth call audio is active. Switch the call to the phone speaker for reliable local transcription.')
      } else if (!event.speakerphoneOn) {
        setCaptureNotice('Phone speaker is off. Enable speakerphone so VoiceShield can hear the caller acoustically.')
      }
    })
    const notificationSub = notificationEvents.addListener('VS_NOTIFICATION_SIGNAL', (event: { signalId?: string }) => {
      if (!isListening) return
      const nextSignals = notificationSignalsFromId(event.signalId)
      // Track timestamp for temporal decay
      nextSignals.forEach((s) => signalTimestampsRef.current.set(s.id, Date.now()))
      setDeviceSignals((current) => [...new Map([...current, ...nextSignals].map((item) => [item.id, item])).values()])
    })
    const modelSub = modelEvents.addListener('VS_MODEL_DOWNLOAD_PROGRESS', (event: { progress?: number }) => setModelProgress(event.progress ?? null))
    return () => {
      liveCaptionSub.remove()
      whisperSub.remove()
      levelSub.remove()
      audioErrorSub.remove()
      audioStartedSub.remove()
      audioRouteSub.remove()
      notificationSub.remove()
      modelSub.remove()
    }
  }, [isListening])

  // Expire OTP/notification signals after TTL (OTP: 120s, others: 300s)
  useEffect(() => {
    if (!isListening) return undefined
    const timer = setInterval(() => {
      const now = Date.now()
      setDeviceSignals((current) => current.filter((signal) => {
        const ts = signalTimestampsRef.current.get(signal.id)
        if (!ts) return true
        const ttl = signal.id === 'otp_notification' ? 120_000 : 300_000
        return now - ts < ttl
      }))
    }, 15_000)
    return () => clearInterval(timer)
  }, [isListening])

  useEffect(() => {
    if (!isListening || source !== 'Whisper') return undefined
    lastAudibleAtRef.current = Date.now()
    const timer = setInterval(() => {
      if (Date.now() - lastAudibleAtRef.current > 8000) {
        setCaptureNotice('No clear caller audio detected. Turn on speakerphone, raise call volume, or enable Android Live Caption.')
      }
    }, 2000)
    return () => clearInterval(timer)
  }, [isListening, source])

  useEffect(() => {
    void OverlayModule.updateRisk(analysis.score, analysis.risk, source).catch(() => undefined)
  }, [analysis.risk, analysis.score, source])

  // Hysteresis alert: vibrate only when risk level rises, with 60s cooldown per level
  useEffect(() => {
    if (!isListening) {
      lastAlertedRiskRef.current = 'low'
      alertCooldownRef.current = 0
      return
    }
    const riskOrder = ['low', 'medium', 'high', 'critical']
    const currentIdx = riskOrder.indexOf(analysis.risk)
    const alertedIdx = riskOrder.indexOf(lastAlertedRiskRef.current)
    const now = Date.now()
    if (currentIdx > alertedIdx || (currentIdx === alertedIdx && now > alertCooldownRef.current)) {
      if (analysis.risk === 'critical') Vibration.vibrate([0, 300, 150, 300])
      else if (analysis.risk === 'high') Vibration.vibrate([0, 200])
      lastAlertedRiskRef.current = analysis.risk
      alertCooldownRef.current = now + 60_000
    }
    // Downgrade slowly: only clear alert state when risk has been low for a while
    if (analysis.risk === 'low' && now > alertCooldownRef.current) {
      lastAlertedRiskRef.current = 'low'
    }
  }, [analysis.risk, isListening])

  // Update captureCompleteness based on active source
  useEffect(() => {
    if (!isListening) { setCaptureCompleteness(1.0); return }
    // Live Caption reads both sides; Whisper/mic hears owner only (typically)
    setCaptureCompleteness(source === 'Live Caption' ? 0.9 : source === 'Whisper' ? 0.45 : 1.0)
  }, [source, isListening])

  const updateModelSize = useCallback(async (size: WhisperModelChoice) => {
    setModelSizePref(size)
    await AsyncStorage.setItem(modelSizeKey, size)
    // Reset model ready state — new model needs to be downloaded/verified
    setModelReady(false)
  }, [])

  const updateRecognitionLanguage = useCallback(async (language: 'auto' | 'ru' | 'kk') => {
    setRecognitionLanguage(language)
    await AsyncStorage.setItem(recognitionLanguageKey, language)
    setModelReady(false)
  }, [])

  const prepareWhisper = useCallback(async () => {
    const cfg = modelSizePref === 'auto' ? recommendedModel(modelStorage) : modelFor(modelSizePref)
    setCaptureError(null)
    setCaptureNotice(null)
    setModelProgress(0)
    try {
      const existing = await ModelDownloader.getVerifiedModelPath(cfg.file, cfg.sha256, cfg.size)
      if (!existing && cfg.importOnly) {
        throw new Error('Import the verified FastConformer INT8 model from Setup before preparing it.')
      }
      const path = existing ?? (await ModelDownloader.downloadModel(cfg.url, cfg.file, cfg.sha256, cfg.size))
      await WhisperModule.initialize(path, recognitionLanguage)
      await ModelDownloader.setActiveWhisperModel(cfg.file)
      setModelReady(true)
      setModelProgress(null)
      void ModelDownloader.getStorageInfo().then(setModelStorage).catch(() => undefined)
    } catch (error) {
      setModelReady(false)
      setModelProgress(null)
      setCaptureError(error instanceof Error ? error.message : 'Could not prepare the speech model. Check internet access and free storage.')
      throw error
    }
  }, [modelSizePref, modelStorage, recognitionLanguage])

  const startListening = useCallback(async () => {
    setCaptureError(null)
    setCaptureNotice(null)
    setDeviceSignals((current) => current.filter((signal) => signal.id === 'caller_verification_failed' || signal.id === 'caller_unverified'))
    if (!privacyConsent) {
      setCaptureError('Review and accept the privacy notice in Setup before starting protection.')
      return
    }
    try {
      const overlayReady = await OverlayModule.canDrawOverlays()
      if (!overlayReady) {
        setCaptureError('Enable the VoiceShield risk overlay in Setup before starting protection.')
        return
      }
      const accessibilityEnabled = await AccessibilityModule.isEnabled()
      if (!accessibilityEnabled) {
        const microphoneReady = await ensureMicrophonePermission()
        if (!microphoneReady) {
          setCaptureError('Microphone access is required for local Whisper protection. Enable it in Setup or Android app settings.')
          return
        }
        // A downloaded model is only a file. After an app restart, its native
        // Whisper context must be recreated before audio chunks can be decoded.
        const nativeModelReady = await WhisperModule.isInitialized()
        if (!nativeModelReady || !modelReady) await prepareWhisper()
        await WhisperModule.resetBuffer()
      }
      await OverlayModule.show(!accessibilityEnabled)
      if (!accessibilityEnabled) {
        await WhisperModule.startStreaming()
        await AudioCaptureModule.startCapture()
        lastAudibleAtRef.current = Date.now()
        setAudioLevel(0)
        setSource('Whisper')
        setCaptureNotice('Whisper is ready. Android cannot read internal call audio: turn on speakerphone so the microphone can hear the caller. Audio stays on this device.')
      } else {
        setSource('Live Caption')
        setCaptureNotice('Live Caption mode is active. Only approved system caption text is processed.')
      }
      await AccessibilityModule.setProtectionActive(true)
      sessionStartRef.current = Date.now()
      setIsListening(true)
    } catch {
      await AccessibilityModule.setProtectionActive(false).catch(() => undefined)
      await OverlayModule.hide().catch(() => undefined)
      setIsListening(false)
      setCaptureError('Protection could not start. Enable microphone, overlay and accessibility permissions in setup.')
    }
  }, [modelReady, prepareWhisper, privacyConsent])

  const endActiveCall = useCallback(async () => {
    try {
      return await CallModule.endActiveCall()
    } catch {
      return false
    }
  }, [])

  const switchToMicrophoneFallback = useCallback(async () => {
    setCaptureError(null)
    try {
      const overlayReady = await OverlayModule.canDrawOverlays()
      if (!overlayReady) {
        setCaptureError('Enable the VoiceShield risk overlay in Setup before using microphone fallback.')
        return
      }
      const microphoneReady = await ensureMicrophonePermission()
      if (!microphoneReady) {
        setCaptureError('Microphone access is required for fallback transcription. Enable it in Setup or Android app settings.')
        return
      }
      const nativeModelReady = await WhisperModule.isInitialized()
      if (!nativeModelReady || !modelReady) await prepareWhisper()
      await WhisperModule.resetBuffer()
      await WhisperModule.startStreaming()
      await AudioCaptureModule.startCapture()
      lastAudibleAtRef.current = Date.now()
      setAudioLevel(0)
      setSource('Whisper')
      setCaptureNotice('Microphone fallback is active. Turn on speakerphone and raise call volume so VoiceShield can hear the caller.')
      await OverlayModule.show(true)
    } catch {
      setCaptureError('Microphone fallback could not start. Check the microphone permission and Whisper model in Setup.')
    }
  }, [modelReady, prepareWhisper])

  const stopListening = useCallback(async () => {
    // Record fingerprint before stopping for cross-call memory
    const snap = analyzeTranscript(analysisTranscript, { signals: deviceSignals })
    const durationSec = Math.round((Date.now() - sessionStartRef.current) / 1000)
    if (snap.score >= 40) {
      void recordCall({ matchedRuleIds: snap.evidence.map((e) => e.id), score: snap.score, schemeLabel: snap.schemeLabel })
    }
    if (transcript.trim().length > 0) {
      void saveTranscriptEntry({ ts: sessionStartRef.current, transcript, score: snap.score, risk: snap.risk, schemeLabel: snap.schemeLabel, durationSec })
    }
    void getRepeatRiskBonus().then((data) => {
      if (data.bonus > 0) setRepeatBonusData({ bonus: data.bonus, reason: data.reason ?? '' })
    })
    // Auto-collect fine-tune example from confirmed scam/safe sessions
    const ftLabel = snap.risk === 'critical' || snap.risk === 'high' ? 'scam' : snap.risk === 'low' ? 'safe' : 'uncertain'
    // labelSource='auto_rules' — weight 0.2; user must confirm before gold training
    void addFineTuneExample(transcript, ftLabel, snap.schemeLabel, snap.score, 'auto_rules')
    await AccessibilityModule.setProtectionActive(false).catch(() => undefined)
    await AudioCaptureModule.stopCapture().catch(() => undefined)
    await WhisperModule.stopStreaming().catch(() => undefined)
    await OverlayModule.hide().catch(() => undefined)
    setIsListening(false)
    setDeviceSignals([])
    setCaptureNotice(null)
    setCallStatus('No active call context')
    if (autoDeleteTranscript) {
      setTranscript('')
      setFileName('manual-call.txt')
      setSource('Manual')
    }
  }, [analysisTranscript, autoDeleteTranscript, deviceSignals, transcript])

  useEffect(() => () => {
    void AccessibilityModule.setProtectionActive(false).catch(() => undefined)
    void AudioCaptureModule.stopCapture().catch(() => undefined)
    void WhisperModule.stopStreaming().catch(() => undefined)
    void OverlayModule.hide().catch(() => undefined)
  }, [])

  const loadSample = useCallback((key: keyof typeof samples, label: string) => {
    setTranscript(samples[key])
    setFileName(`${key}.txt`)
    setSource('Manual')
    setCaseLabel('unreviewed')
    setAnalystNote(`Loaded scenario: ${label}`)
  }, [])

  // ---- case management ----
  const saveCurrentCase = useCallback(() => {
    const now = new Date().toISOString()
    const safeTranscript = redactSensitiveText(transcript)
    const safeEnhancement = enhanceTranscript(safeTranscript)
    const safeNormalizedTranscript = safeEnhancement.normalizedTranscript
    const current = analyzeTranscript(safeNormalizedTranscript, { signals: deviceSignals })
    setCases((existingCases) => {
      const existing = existingCases.find((item) => item.id === current.caseId)
      const workflow = existing ?? createWorkflowState(current, now, reviewerName)
      const auditEntry = {
        action: existing ? 'case_updated' : 'case_saved',
        actor: reviewerName,
        at: now,
        detail: `${current.verdict} at ${current.score}/100`,
      }
      const next: SavedCase = {
        id: current.caseId,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        fileName,
        transcript: safeTranscript,
        normalizedTranscript: safeNormalizedTranscript,
        transcriptDerivation: {
          source: safeEnhancement.source,
          packVersion: safeEnhancement.packVersion,
          dominantLanguage: safeEnhancement.dominantLanguage,
          lexiconCoverage: safeEnhancement.lexiconCoverage,
          corrections: safeEnhancement.corrections,
        },
        label: caseLabel,
        status: existing?.status ?? workflow.status,
        assignedTo: existing?.assignedTo ?? workflow.assignedTo,
        flags: existing?.flags ?? workflow.flags,
        analystNote,
        provenance: existing?.provenance ?? {
          origin: source === 'Manual' ? 'manual' : 'live',
          trusted: caseLabel !== 'unreviewed',
          reviewedAt: caseLabel !== 'unreviewed' ? now : undefined,
        },
        auditLog: [...(existing?.auditLog ?? workflow.auditLog), auditEntry],
        decisionHistory: existing?.decisionHistory ?? workflow.decisionHistory,
        incidentTimeline: existing?.incidentTimeline ?? workflow.incidentTimeline,
        analysis: current,
      }
      return [next, ...existingCases.filter((item) => item.id !== next.id)]
    })
  }, [analystNote, caseLabel, deviceSignals, fileName, reviewerName, source, transcript])

  const acceptPrivacy = useCallback(async () => {
    await SecureStorage.setItem(privacyConsentKey, 'accepted')
    await CallModule.updateProtectionConfig({ enabled: true }).catch(() => undefined)
    setPrivacyConsent(true)
  }, [])

  const declinePrivacy = useCallback(async () => {
    await AccessibilityModule.setProtectionActive(false).catch(() => undefined)
    await AudioCaptureModule.stopCapture().catch(() => undefined)
    await WhisperModule.stopStreaming().catch(() => undefined)
    await SecureStorage.removeItem(privacyConsentKey).catch(() => undefined)
    await CallModule.updateProtectionConfig({ enabled: false }).catch(() => undefined)
    await OverlayModule.hide().catch(() => undefined)
    setPrivacyConsent(false)
    setIsListening(false)
    setDeviceSignals([])
    setCaptureNotice(null)
    setAutoDeleteTranscript(true)
  }, [])

  const updateAutoDeleteTranscript = useCallback(async (enabled: boolean) => {
    if (enabled) await SecureStorage.removeItem(autoDeleteTranscriptKey)
    else await SecureStorage.setItem(autoDeleteTranscriptKey, 'disabled')
    setAutoDeleteTranscript(enabled)
  }, [])

  const updateAutoDisconnectCritical = useCallback(async (enabled: boolean) => {
    if (enabled && !privacyConsent) return
    setAutoDisconnectCritical(enabled)
    await SecureStorage.setItem(autoDisconnectKey, enabled ? 'enabled' : 'disabled')
  }, [privacyConsent])

  const deleteAllLocalData = useCallback(async () => {
    await AccessibilityModule.setProtectionActive(false).catch(() => undefined)
    await AudioCaptureModule.stopCapture().catch(() => undefined)
    await WhisperModule.stopStreaming().catch(() => undefined)
    await OverlayModule.hide().catch(() => undefined)
    await Promise.all(whisperModels.map((model) => ModelDownloader.deleteModel(model.file).catch(() => undefined)))
    await CallModule.clearProtectionData().catch(() => undefined)
    await AsyncStorage.removeItem(storageKey).catch(() => undefined)
    await SecureStorage.clear()
    setCases([])
    setTranscript('')
    setDeviceSignals([])
    setPrivacyConsent(false)
    setModelReady(false)
    setIsListening(false)
    setStorageError(null)
    setTrustedContact(null)
    setCaptureNotice(null)
  }, [])

  const saveTrustedContact = useCallback(async (name: string, phone: string) => {
    const normalized: TrustedContact = {
      name: name.trim().slice(0, 60),
      phone: phone.replace(/[^+\d]/gu, '').slice(0, 20),
    }
    if (!normalized.name || normalized.phone.replace(/\D/gu, '').length < 7) throw new Error('Enter a valid trusted contact name and phone number.')
    await SecureStorage.setItem(trustedContactKey, JSON.stringify(normalized))
    setTrustedContact(normalized)
  }, [])

  const clearTrustedContact = useCallback(async () => {
    await SecureStorage.removeItem(trustedContactKey)
    setTrustedContact(null)
  }, [])

  const callTrustedContact = useCallback(async () => {
    if (!trustedContact) return
    await Linking.openURL(`tel:${trustedContact.phone}`)
  }, [trustedContact])

  const shareTrustedAlert = useCallback(async () => {
    if (!trustedContact) return
    await Share.share({
      title: 'VoiceShield risk alert',
      message: `VoiceShield detected ${analysis.schemeLabel} risk at ${analysis.score}/100. Please call me using my saved number. No secret codes or transcript are included.`,
    })
  }, [analysis.schemeLabel, analysis.score, trustedContact])

  const loadCase = useCallback((item: SavedCase) => {
    setTranscript(item.transcript)
    setFileName(item.fileName)
    setCaseLabel(item.label)
    setAnalystNote(item.analystNote)
    setSource('Manual')
  }, [])

  const updateCaseLabel = useCallback((id: string, label: CaseLabel) => {
    const now = new Date().toISOString()
    setCases((current) =>
      current.map((item) => {
        if (item.id !== id) return item
        const entry = { action: 'label_changed', actor: reviewerName, at: now, detail: `${labelText(item.label)} -> ${labelText(label)}` }
        return {
          ...item,
          auditLog: [...item.auditLog, entry],
          decisionHistory: [...item.decisionHistory, entry],
          label,
          provenance: { ...item.provenance, trusted: label !== 'unreviewed', reviewedAt: label !== 'unreviewed' ? now : undefined },
          updatedAt: now,
        }
      }),
    )
  }, [reviewerName])

  const updateCaseStatus = useCallback((id: string, status: CaseStatus) => {
    const now = new Date().toISOString()
    setCases((current) =>
      current.map((item) => {
        if (item.id !== id) return item
        const entry = { action: 'status_changed', actor: reviewerName, at: now, detail: `${statusText(item.status)} -> ${statusText(status)}` }
        return { ...item, auditLog: [...item.auditLog, entry], decisionHistory: [...item.decisionHistory, entry], status, updatedAt: now }
      }),
    )
  }, [reviewerName])

  const toggleCaseFlag = useCallback((id: string, flag: keyof WorkflowFlags) => {
    const now = new Date().toISOString()
    setCases((current) =>
      current.map((item) => {
        if (item.id !== id) return item
        const flags = { ...item.flags, [flag]: !item.flags[flag] }
        const entry = { action: 'flag_changed', actor: reviewerName, at: now, detail: `${flag}: ${flags[flag] ? 'enabled' : 'disabled'}` }
        return { ...item, auditLog: [...item.auditLog, entry], flags, updatedAt: now }
      }),
    )
  }, [reviewerName])

  const deleteCase = useCallback((id: string) => setCases((current) => current.filter((item) => item.id !== id)), [])
  const clearCases = useCallback(() => setCases([]), [])

  // ---- exports via native Share sheet ----
  const share = (title: string, message: string) => Share.share({ title, message }).catch(() => undefined)
  const exportReport = useCallback(() => share(`Report ${analysis.caseId}`, buildReport(transcript, analysis)), [analysis, transcript])
  const exportEvidenceBundle = useCallback((item: SavedCase) => share(`Evidence ${item.id}`, buildEvidenceBundle(item)), [])
  const exportJsonlCases = useCallback(() => share('VoiceShield dataset (JSONL)', exportJsonl(cases)), [cases])
  const exportCsvCases = useCallback(() => share('VoiceShield dataset (CSV)', exportCsv(cases)), [cases])
  const exportSplitCases = useCallback(() => share('VoiceShield split', exportSplitJson(cases)), [cases])

  // ---- consented data donation (opt-in, redacted) ----
  const setDonation = useCallback(async (accepted: boolean) => {
    if (accepted) await SecureStorage.setItem(donationConsentKey, 'accepted').catch(() => undefined)
    else await SecureStorage.removeItem(donationConsentKey).catch(() => undefined)
    setDonationConsent(accepted)
  }, [])

  // Shares the reviewer-labelled cases as a redacted training-schema JSONL. Rows
  // are already redacted (codes/PIN/CVV/long numbers stripped) by serializeCase
  // and carry provenance.trusted=false, so they stay untrusted until a reviewer
  // confirms them. No upload happens unless the user picks a target in the sheet.
  const donateDataset = useCallback(() => {
    if (!donationConsent) return
    const labelled = cases.filter((item) => item.label !== 'unreviewed')
    if (labelled.length === 0) return
    return share('VoiceShield donation (redacted, opt-in)', exportJsonl(labelled))
  }, [cases, donationConsent])

  const donateCase = useCallback((item: SavedCase) => {
    if (!donationConsent) return
    return share(`VoiceShield donation ${item.id} (redacted)`, exportJsonl([item]))
  }, [donationConsent])

  return {
    // intake
    transcript, setTranscript, transcriptEnhancement, analysisTranscript, ksc2LanguageContext,
    fileName, setFileName,
    caseLabel, setCaseLabel,
    analystNote, setAnalystNote,
    reviewerName, setReviewerName,
    source,
    // capture
    isListening, modelReady, modelProgress, audioLevel, captureError, captureNotice, deviceSignals, privacyConsent, donationConsent, storageError, callStatus, trustedContact, autoDeleteTranscript, autoDisconnectCritical, modelStorage,
    startListening, stopListening, prepareWhisper, switchToMicrophoneFallback,
    endActiveCall,
    modelSizePref, updateModelSize, recognitionLanguage, updateRecognitionLanguage,
    updateAutoDisconnectCritical,
    repeatBonusData, llmAutoAnalysis, captureCompleteness,
    // computed
    analysis, pressureAnalysis, semanticMatches, callbackInfo,
    timeline, quality, datasetStageTotals, operations, highSignals, cases, hydrated,
    // handlers
    loadSample, saveCurrentCase, loadCase, acceptPrivacy, declinePrivacy, deleteAllLocalData,
    saveTrustedContact, clearTrustedContact, callTrustedContact, shareTrustedAlert,
    updateCaseLabel, updateCaseStatus, toggleCaseFlag, deleteCase, clearCases,
    exportReport, exportEvidenceBundle,
    exportJsonlCases, exportCsvCases, exportSplitCases,
    setDonation, donateDataset, donateCase,
    updateAutoDeleteTranscript,
  }
}
