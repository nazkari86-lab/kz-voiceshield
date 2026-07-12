import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Linking, Share, Vibration } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { accessibilityEvents, AccessibilityModule } from '@bridge/AccessibilityBridge'
import { callEvents, CallModule } from '@bridge/CallModule'
import type { SafeCallEvent } from '@bridge/CallModule'
import { AudioCaptureModule, audioEvents, ModelDownloader, modelEvents, WhisperModule, whisperEvents } from '@bridge/WhisperBridge'
import { OverlayModule } from '@bridge/OverlayBridge'
import { notificationEvents } from '@bridge/NotificationAccessBridge'
import { SecureStorage } from '@bridge/SecureStorageBridge'
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

const modelFile = 'ggml-small.bin'
const modelUrl = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin'
const modelSha256 = '1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b'
const modelSize = 487601967
const privacyConsentKey = 'voiceshield.privacy-consent.v1'
const donationConsentKey = 'voiceshield.donation-consent.v1'
const trustedContactKey = 'voiceshield.trusted-contact.v1'
const autoDeleteTranscriptKey = 'voiceshield.auto-delete-transcript.v1'

export type TrustedContact = { name: string; phone: string }

const normalizeSavedCase = (item: SavedCase): SavedCase => {
  const transcript = redactSensitiveText(item.transcript)
  const analysis = analyzeTranscript(transcript, { signals: item.analysis?.contextSignals ?? [] })
  const workflow = createWorkflowState(analysis, item.createdAt, 'migration')
  return {
    ...item,
    transcript,
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
  const criticalAlertedRef = useRef(false)
  const lastAudibleAtRef = useRef(Date.now())

  // ---- saved cases ----
  const [cases, setCases] = useState<SavedCase[]>([])
  const [hydrated, setHydrated] = useState(false)

  const analysis = useMemo(() => analyzeTranscript(transcript, { signals: deviceSignals }), [deviceSignals, transcript])
  const timeline = useMemo(() => sentenceTimeline(transcript), [transcript])
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
    ])
      .then(([encryptedCases, consent, legacyCases, storedTrustedContact, donation, autoDelete]) => {
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
        setSource('Live Caption')
        setTranscript((current) => `${current} ${event.text}`.trim())
      }
    })
    const whisperSub = whisperEvents.addListener('VS_WHISPER_TRANSCRIPT', (event: { text?: string }) => {
      if (!event.text) return
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
    const notificationSub = notificationEvents.addListener('VS_NOTIFICATION_SIGNAL', (event: { signalId?: string }) => {
      if (!isListening) return
      const nextSignals = notificationSignalsFromId(event.signalId)
      setDeviceSignals((current) => [...new Map([...current, ...nextSignals].map((item) => [item.id, item])).values()])
    })
    const modelSub = modelEvents.addListener('VS_MODEL_DOWNLOAD_PROGRESS', (event: { progress?: number }) => setModelProgress(event.progress ?? null))
    return () => {
      liveCaptionSub.remove()
      whisperSub.remove()
      levelSub.remove()
      audioErrorSub.remove()
      notificationSub.remove()
      modelSub.remove()
    }
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

  useEffect(() => {
    if (isListening && analysis.score >= 85 && !criticalAlertedRef.current) {
      criticalAlertedRef.current = true
      Vibration.vibrate([0, 300, 150, 300])
    }
    if (!isListening || analysis.score < 65) criticalAlertedRef.current = false
  }, [analysis.score, isListening])

  const prepareWhisper = useCallback(async () => {
    setCaptureError(null)
    setCaptureNotice(null)
    setModelProgress(0)
    try {
      const existing = await ModelDownloader.getVerifiedModelPath(modelFile, modelSha256, modelSize)
      const path = existing ?? (await ModelDownloader.downloadModel(modelUrl, modelFile, modelSha256, modelSize))
      await WhisperModule.initialize(path, 'auto')
      setModelReady(true)
      setModelProgress(null)
    } catch (error) {
      setModelReady(false)
      setModelProgress(null)
      setCaptureError('Could not prepare the speech model. Check internet access and free storage.')
      throw error
    }
  }, [])

  const startListening = useCallback(async () => {
    setCaptureError(null)
    setCaptureNotice(null)
    setDeviceSignals((current) => current.filter((signal) => signal.id === 'caller_verification_failed' || signal.id === 'caller_unverified'))
    if (!privacyConsent) {
      setCaptureError('Review and accept the privacy notice in Setup before starting protection.')
      return
    }
    try {
      const accessibilityEnabled = await AccessibilityModule.isEnabled()
      if (!accessibilityEnabled) {
        // A downloaded model is only a file. After an app restart, its native
        // Whisper context must be recreated before audio chunks can be decoded.
        const nativeModelReady = await WhisperModule.isInitialized()
        if (!nativeModelReady) await prepareWhisper()
        await WhisperModule.resetBuffer()
      }
      await OverlayModule.show(!accessibilityEnabled)
      if (!accessibilityEnabled) {
        await AudioCaptureModule.startCapture()
        await WhisperModule.startStreaming()
        lastAudibleAtRef.current = Date.now()
        setAudioLevel(0)
        setSource('Whisper')
        setCaptureNotice('Whisper is ready. Android cannot read internal call audio: turn on speakerphone so the microphone can hear the caller. Audio stays on this device.')
      } else {
        setCaptureNotice('Live Caption mode is active. Only approved system caption text is processed.')
      }
      await AccessibilityModule.setProtectionActive(true)
      setIsListening(true)
    } catch {
      await AccessibilityModule.setProtectionActive(false).catch(() => undefined)
      await OverlayModule.hide().catch(() => undefined)
      setIsListening(false)
      setCaptureError('Protection could not start. Enable microphone, overlay and accessibility permissions in setup.')
    }
  }, [prepareWhisper, privacyConsent])

  const stopListening = useCallback(async () => {
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
  }, [autoDeleteTranscript])

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
    const current = analyzeTranscript(safeTranscript, { signals: deviceSignals })
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

  const deleteAllLocalData = useCallback(async () => {
    await AccessibilityModule.setProtectionActive(false).catch(() => undefined)
    await AudioCaptureModule.stopCapture().catch(() => undefined)
    await WhisperModule.stopStreaming().catch(() => undefined)
    await OverlayModule.hide().catch(() => undefined)
    await ModelDownloader.deleteModel(modelFile).catch(() => undefined)
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
    transcript, setTranscript,
    fileName, setFileName,
    caseLabel, setCaseLabel,
    analystNote, setAnalystNote,
    reviewerName, setReviewerName,
    source,
    // capture
    isListening, modelReady, modelProgress, audioLevel, captureError, captureNotice, deviceSignals, privacyConsent, donationConsent, storageError, callStatus, trustedContact, autoDeleteTranscript,
    startListening, stopListening, prepareWhisper,
    // computed
    analysis, timeline, quality, datasetStageTotals, operations, highSignals, cases, hydrated,
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
