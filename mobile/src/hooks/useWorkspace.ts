import { useCallback, useEffect, useMemo, useState } from 'react'
import { Share } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { accessibilityEvents, AccessibilityModule } from '@bridge/AccessibilityBridge'
import { AudioCaptureModule, audioEvents, ModelDownloader, WhisperModule, whisperEvents } from '@bridge/WhisperBridge'
import { OverlayModule } from '@bridge/OverlayBridge'
import {
  analyzeTranscript,
  buildEvidenceBundle,
  buildReport,
  createWorkflowState,
  datasetQuality,
  deviceSignalsFromPackage,
  exportCsv,
  exportJsonl,
  exportSplitJson,
  labelText,
  samples,
  sentenceTimeline,
  statusText,
  storageKey,
} from '@scoring'
import type { CaseLabel, CaseStatus, RiskSignal, SavedCase, WorkflowFlags } from '@scoring'

const validStatuses: CaseStatus[] = ['new', 'reviewing', 'escalated', 'closed']

const modelFile = 'ggml-small.bin'
const modelUrl = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin'

const normalizeSavedCase = (item: SavedCase): SavedCase => {
  const analysis = analyzeTranscript(item.transcript, { signals: item.analysis?.contextSignals ?? [] })
  const workflow = createWorkflowState(analysis, item.createdAt, 'migration')
  return {
    ...item,
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
  const [transcript, setTranscript] = useState(samples.bank)
  const [fileName, setFileName] = useState('sample-bank-call.txt')
  const [caseLabel, setCaseLabel] = useState<CaseLabel>('unreviewed')
  const [analystNote, setAnalystNote] = useState('')
  const [reviewerName, setReviewerName] = useState('Fraud reviewer')
  const [source, setSource] = useState<'Live Caption' | 'Whisper' | 'Manual'>('Manual')

  // ---- live capture ----
  const [isListening, setIsListening] = useState(false)
  const [modelReady, setModelReady] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const [captureError, setCaptureError] = useState<string | null>(null)
  const [deviceSignals, setDeviceSignals] = useState<RiskSignal[]>([])

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

  // ---- persistence (AsyncStorage) ----
  useEffect(() => {
    let active = true
    AsyncStorage.getItem(storageKey)
      .then((stored) => {
        if (!active) return
        if (stored) setCases((JSON.parse(stored) as SavedCase[]).map(normalizeSavedCase))
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setHydrated(true)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    AsyncStorage.setItem(storageKey, JSON.stringify(cases)).catch(() => undefined)
  }, [cases, hydrated])

  // ---- live transcript wiring ----
  useEffect(() => {
    const liveCaptionSub = accessibilityEvents.addListener('VS_ACCESSIBILITY_TEXT', (event: { packageName?: string; text?: string }) => {
      if (isListening && event.packageName) {
        const nextSignals = deviceSignalsFromPackage(event.packageName)
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
    const levelSub = audioEvents.addListener('VS_AUDIO_LEVEL', (event: { level?: number }) => setAudioLevel(event.level ?? 0))
    return () => {
      liveCaptionSub.remove()
      whisperSub.remove()
      levelSub.remove()
    }
  }, [isListening])

  useEffect(() => {
    void OverlayModule.updateRisk(analysis.score, analysis.risk, source).catch(() => undefined)
  }, [analysis.risk, analysis.score, source])

  const prepareWhisper = useCallback(async () => {
    setCaptureError(null)
    try {
      const existing = await ModelDownloader.getModelPath(modelFile)
      const path = existing ?? (await ModelDownloader.downloadModel(modelUrl, modelFile))
      await WhisperModule.initialize(path, 'ru')
      setModelReady(true)
    } catch {
      setModelReady(false)
      setCaptureError('Could not prepare the speech model. Check internet access and free storage.')
    }
  }, [])

  const startListening = useCallback(async () => {
    setCaptureError(null)
    setDeviceSignals([])
    try {
      const accessibilityEnabled = await AccessibilityModule.isEnabled()
      if (!accessibilityEnabled && !modelReady) await prepareWhisper()
      await OverlayModule.show()
      if (!accessibilityEnabled) {
        await AudioCaptureModule.startCapture()
        await WhisperModule.startStreaming()
      }
      setIsListening(true)
    } catch {
      setIsListening(false)
      setCaptureError('Protection could not start. Enable microphone, overlay and accessibility permissions in setup.')
    }
  }, [modelReady, prepareWhisper])

  const stopListening = useCallback(async () => {
    await AudioCaptureModule.stopCapture().catch(() => undefined)
    await WhisperModule.stopStreaming().catch(() => undefined)
    setIsListening(false)
    setDeviceSignals([])
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
    const current = analyzeTranscript(transcript, { signals: deviceSignals })
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
        transcript,
        label: caseLabel,
        status: existing?.status ?? workflow.status,
        assignedTo: existing?.assignedTo ?? workflow.assignedTo,
        flags: existing?.flags ?? workflow.flags,
        analystNote,
        auditLog: [...(existing?.auditLog ?? workflow.auditLog), auditEntry],
        decisionHistory: existing?.decisionHistory ?? workflow.decisionHistory,
        incidentTimeline: existing?.incidentTimeline ?? workflow.incidentTimeline,
        analysis: current,
      }
      return [next, ...existingCases.filter((item) => item.id !== next.id)]
    })
  }, [analystNote, caseLabel, deviceSignals, fileName, reviewerName, transcript])

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
        return { ...item, auditLog: [...item.auditLog, entry], decisionHistory: [...item.decisionHistory, entry], label, updatedAt: now }
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

  return {
    // intake
    transcript, setTranscript,
    fileName, setFileName,
    caseLabel, setCaseLabel,
    analystNote, setAnalystNote,
    reviewerName, setReviewerName,
    source,
    // capture
    isListening, modelReady, audioLevel, captureError, deviceSignals,
    startListening, stopListening, prepareWhisper,
    // computed
    analysis, timeline, quality, datasetStageTotals, operations, highSignals, cases,
    // handlers
    loadSample, saveCurrentCase, loadCase,
    updateCaseLabel, updateCaseStatus, toggleCaseFlag, deleteCase, clearCases,
    exportReport, exportEvidenceBundle,
    exportJsonlCases, exportCsvCases, exportSplitCases,
  }
}
