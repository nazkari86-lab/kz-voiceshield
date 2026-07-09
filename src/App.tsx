import { FileDown, LockKeyhole, Radar, Save } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import './App.css'
import { analyzeTranscriptWithBackend, isBackendConfigured, syncCaseWithBackend, transcribeAudioWithBackend } from './apiClient'
import type { MlAssessment } from './apiClient'
import { CasesView } from './components/CasesView'
import { DatasetView } from './components/DatasetView'
import { EvidencePanel } from './components/EvidencePanel'
import { OperationsView } from './components/OperationsView'
import { PlaybookView } from './components/PlaybookView'
import { ReviewView } from './components/ReviewView'
import { SimulatorView } from './components/SimulatorView'
import { ThreatsView } from './components/ThreatsView'
import { TimelineView } from './components/TimelineView'
import { TranscriptInput } from './components/TranscriptInput'
import {
  analyzeTranscript,
  buildEvidenceBundle,
  buildReport,
  createWorkflowState,
  datasetQuality,
  exportCsv,
  exportJsonl,
  exportSplitJson,
  labelText,
  samples,
  sentenceTimeline,
  statusText,
  storageKey,
} from './scoring'
import type { CaseLabel, CaseStatus, SavedCase, WorkflowFlags } from './scoring'

type View = 'review' | 'timeline' | 'threats' | 'simulator' | 'cases' | 'operations' | 'dataset' | 'playbook'

type SpeechRecognitionResultShape = {
  isFinal: boolean
  [index: number]: { transcript: string }
}

type SpeechRecognitionEventShape = {
  resultIndex: number
  results: { length: number; [index: number]: SpeechRecognitionResultShape }
}

type SpeechRecognitionInstance = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onend: (() => void) | null
  onerror: ((event: { error: string }) => void) | null
  onresult: ((event: SpeechRecognitionEventShape) => void) | null
  start: () => void
  stop: () => void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}

type SyncState = {
  status: 'idle' | 'syncing' | 'synced' | 'failed'
  message: string
  syncedAt?: string
}

const downloadFile = (fileName: string, body: string, type = 'text/plain;charset=utf-8') => {
  const blob = new Blob([body], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

const tabs: Array<[View, string]> = [
  ['review', 'Case Review'],
  ['timeline', 'Timeline'],
  ['threats', 'Threat Lab'],
  ['simulator', 'Simulator'],
  ['cases', 'Cases'],
  ['operations', 'Operations'],
  ['dataset', 'Dataset'],
  ['playbook', 'Playbook'],
]

const validLabels: CaseLabel[] = ['unreviewed', 'true_positive', 'false_positive', 'needs_review']
const validStatuses: CaseStatus[] = ['new', 'reviewing', 'escalated', 'closed']

const mlDisagreement = (risk: string, ml?: MlAssessment) => {
  if (!ml) return 'No backend ML result yet'
  const rulesHigh = risk === 'critical' || risk === 'high'
  const mlHigh = ml.verdict === 'fraud'
  if (rulesHigh && !mlHigh) return 'Disagreement: rules high, ML low'
  if (!rulesHigh && mlHigh) return 'Disagreement: rules low, ML high'
  return 'Rules and ML are aligned'
}

const parseImportedCases = (body: string, fileName: string) => {
  const now = new Date().toISOString()
  const rejected: number[] = []
  const imported = body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line, index) => {
      try {
        const parsed = JSON.parse(line) as { transcript?: string; label?: CaseLabel; fileName?: string; analystNote?: string; createdAt?: string }
        const importedTranscript = parsed.transcript ?? line
        const importedAnalysis = analyzeTranscript(importedTranscript)
        const workflow = createWorkflowState(importedAnalysis, parsed.createdAt ?? now, 'jsonl-import')
        return [{
          id: `${importedAnalysis.caseId}-${Date.now()}-${index}`,
          createdAt: parsed.createdAt ?? now,
          updatedAt: now,
          fileName: parsed.fileName ?? fileName,
          transcript: importedTranscript,
          label: validLabels.includes(parsed.label ?? 'unreviewed') ? (parsed.label ?? 'unreviewed') : 'unreviewed',
          ...workflow,
          analystNote: parsed.analystNote ?? '',
          analysis: importedAnalysis,
        } satisfies SavedCase]
      } catch {
        rejected.push(index + 1)
        return []
      }
    })
  return { imported, rejected }
}

const normalizeFlags = (flags: Partial<WorkflowFlags> | undefined, fallback: WorkflowFlags): WorkflowFlags => ({
  bankContactNeeded: flags?.bankContactNeeded ?? fallback.bankContactNeeded,
  customerCallbackNeeded: flags?.customerCallbackNeeded ?? fallback.customerCallbackNeeded,
  evidenceBundleReady: flags?.evidenceBundleReady ?? fallback.evidenceBundleReady,
})

const normalizeSavedCase = (item: SavedCase): SavedCase => {
  const analysis = analyzeTranscript(item.transcript)
  const workflow = createWorkflowState(analysis, item.createdAt, 'migration')
  return {
    ...item,
    analysis,
    assignedTo: item.assignedTo || workflow.assignedTo,
    auditLog: item.auditLog?.length ? item.auditLog : workflow.auditLog,
    decisionHistory: item.decisionHistory ?? [],
    flags: normalizeFlags(item.flags, workflow.flags),
    incidentTimeline: item.incidentTimeline?.length ? item.incidentTimeline : workflow.incidentTimeline,
    status: validStatuses.includes(item.status) ? item.status : workflow.status,
  }
}

function App() {
  const [activeView, setActiveView] = useState<View>('review')
  const [transcript, setTranscript] = useState(samples.bank)
  const [fileName, setFileName] = useState('sample-bank-call.txt')
  const [cases, setCases] = useState<SavedCase[]>([])
  const [caseLabel, setCaseLabel] = useState<CaseLabel>('unreviewed')
  const [analystNote, setAnalystNote] = useState('')
  const [reviewerName, setReviewerName] = useState('Fraud reviewer')
  const [liveLanguage, setLiveLanguage] = useState('ru-RU')
  const [isListening, setIsListening] = useState(false)
  const [liveStatus, setLiveStatus] = useState('Live mode is ready')
  const [importStatus, setImportStatus] = useState('')
  const [backendStatus, setBackendStatus] = useState(isBackendConfigured() ? 'Backend adapter ready' : 'Local-only mode: no backend URL configured')
  const [mlResult, setMlResult] = useState<{ caseId: string; assessment: MlAssessment } | undefined>()
  const [syncState, setSyncState] = useState<Record<string, SyncState>>({})
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)

  const analysis = useMemo(() => analyzeTranscript(transcript), [transcript])
  const mlAssessment = mlResult?.caseId === analysis.caseId ? mlResult.assessment : undefined
  const timeline = useMemo(() => sentenceTimeline(transcript), [transcript])
  const quality = useMemo(() => datasetQuality(cases), [cases])
  const datasetStageTotals = useMemo(
    () =>
      Object.entries(cases.reduce<Record<string, number>>((totals, item) => {
        item.analysis.stageCoverage.forEach((stage) => {
          totals[stage.stage] = (totals[stage.stage] ?? 0) + stage.count
        })
        return totals
      }, {})),
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
      statusCounts: validStatuses.reduce<Record<CaseStatus, number>>((totals, status) => {
        totals[status] = cases.filter((item) => item.status === status).length
        return totals
      }, { closed: 0, escalated: 0, new: 0, reviewing: 0 }),
      unsyncedCount: cases.filter((item) => syncState[item.id]?.status !== 'synced').length,
    }
  }, [cases, syncState])

  const isSpeechSupported = typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  const highSignals = analysis.evidence.filter((item) => item.severity === 'critical' || item.severity === 'high').length

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored) setCases((JSON.parse(stored) as SavedCase[]).map(normalizeSavedCase))
    } catch {
      setCases([])
    }
    return () => recognitionRef.current?.stop()
  }, [])

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(cases))
  }, [cases])

  const exportReport = () => downloadFile(`kz-voiceshield-${analysis.caseId}.txt`, buildReport(transcript, analysis))

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    if (file.type.startsWith('audio/')) {
      if (!isBackendConfigured()) {
        setTranscript(`Audio file queued for transcription: ${file.name}. Add a transcript here or use live browser recognition.`)
        setImportStatus('Audio queued locally. Configure VITE_VOICESHIELD_API_URL for server transcription.')
        return
      }
      setImportStatus(`Uploading ${file.name} for backend transcription...`)
      transcribeAudioWithBackend(file)
        .then((result) => {
          setTranscript(result.transcript)
          if (result.ml) setMlResult({ assessment: result.ml, caseId: analyzeTranscript(result.transcript).caseId })
          setImportStatus(`Audio transcribed with ${result.transcriptConfidence}/100 confidence.`)
          setActiveView('review')
        })
        .catch((error) => {
          setTranscript(`Audio file queued for transcription: ${file.name}. Backend upload failed; add transcript manually.`)
          setImportStatus(error instanceof Error ? error.message : 'Backend audio upload failed.')
        })
      return
    }
    if (file.type.startsWith('text/') || file.name.endsWith('.txt') || file.name.endsWith('.jsonl') || file.name.endsWith('.csv')) {
      file.text().then((body) => {
        if (file.name.endsWith('.jsonl')) {
          const { imported, rejected } = parseImportedCases(body, file.name)
          setCases((current) => [...imported, ...current])
          setImportStatus(`${imported.length} JSONL cases imported${rejected.length ? `, ${rejected.length} line(s) skipped` : ''}.`)
          setActiveView('dataset')
          return
        }
        setTranscript(body)
        setImportStatus(`${file.name} loaded into transcript intake.`)
      })
    }
  }

  const saveCurrentCase = () => {
    const now = new Date().toISOString()
    setCases((current) => {
      const existing = current.find((item) => item.id === analysis.caseId)
      const workflow = existing ?? createWorkflowState(analysis, now, reviewerName)
      const auditEntry = {
        action: existing ? 'case_updated' : 'case_saved',
        actor: reviewerName,
        at: now,
        detail: `${analysis.verdict} at ${analysis.score}/100`,
      }
      const next: SavedCase = {
        id: analysis.caseId,
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
        analysis,
      }
      return [next, ...current.filter((item) => item.id !== next.id)]
    })
    setActiveView('cases')
  }

  const loadCase = (item: SavedCase) => {
    setTranscript(item.transcript)
    setFileName(item.fileName)
    setCaseLabel(item.label)
    setAnalystNote(item.analystNote)
    setActiveView('review')
  }

  const updateCaseLabel = (id: string, label: CaseLabel) => {
    const now = new Date().toISOString()
    setCases((current) => current.map((item) => {
      if (item.id !== id) return item
      const entry = { action: 'label_changed', actor: reviewerName, at: now, detail: `${labelText(item.label)} -> ${labelText(label)}` }
      return { ...item, auditLog: [...item.auditLog, entry], decisionHistory: [...item.decisionHistory, entry], label, updatedAt: now }
    }))
  }

  const updateCaseStatus = (id: string, status: CaseStatus) => {
    const now = new Date().toISOString()
    setCases((current) => current.map((item) => {
      if (item.id !== id) return item
      const entry = { action: 'status_changed', actor: reviewerName, at: now, detail: `${statusText(item.status)} -> ${statusText(status)}` }
      return { ...item, auditLog: [...item.auditLog, entry], decisionHistory: [...item.decisionHistory, entry], status, updatedAt: now }
    }))
  }

  const updateCaseAssignee = (id: string, assignedTo: string) => {
    const now = new Date().toISOString()
    setCases((current) => current.map((item) => {
      if (item.id !== id) return item
      const entry = { action: 'assignment_changed', actor: reviewerName, at: now, detail: `${item.assignedTo || 'Unassigned'} -> ${assignedTo || 'Unassigned'}` }
      return { ...item, assignedTo, auditLog: [...item.auditLog, entry], updatedAt: now }
    }))
  }

  const toggleCaseFlag = (id: string, flag: keyof WorkflowFlags) => {
    const now = new Date().toISOString()
    setCases((current) => current.map((item) => {
      if (item.id !== id) return item
      const flags = { ...item.flags, [flag]: !item.flags[flag] }
      const entry = { action: 'flag_changed', actor: reviewerName, at: now, detail: `${flag}: ${flags[flag] ? 'enabled' : 'disabled'}` }
      return { ...item, auditLog: [...item.auditLog, entry], flags, updatedAt: now }
    }))
  }

  const exportEvidenceBundle = (item: SavedCase) => downloadFile(`kz-voiceshield-evidence-${item.id}.txt`, buildEvidenceBundle(item))

  const syncCase = async (item: SavedCase) => {
    if (!isBackendConfigured()) {
      setSyncState((current) => ({ ...current, [item.id]: { message: 'Set VITE_VOICESHIELD_API_URL to enable case sync.', status: 'failed' } }))
      return
    }
    setSyncState((current) => ({ ...current, [item.id]: { message: 'Syncing case to backend...', status: 'syncing' } }))
    try {
      const result = await syncCaseWithBackend(item)
      setSyncState((current) => ({
        ...current,
        [item.id]: {
          message: result.remoteId ? `Synced as ${result.remoteId}` : 'Synced to backend',
          status: result.ok ? 'synced' : 'failed',
          syncedAt: result.syncedAt,
        },
      }))
    } catch (error) {
      setSyncState((current) => ({
        ...current,
        [item.id]: { message: error instanceof Error ? error.message : 'Case sync failed', status: 'failed' },
      }))
    }
  }

  const syncAllCases = async () => {
    for (const item of cases) await syncCase(item)
  }

  const deleteCase = (id: string) => setCases((current) => current.filter((item) => item.id !== id))
  const clearCases = () => setCases([])

  const runBackendAnalysis = async () => {
    if (!isBackendConfigured()) {
      setBackendStatus('Set VITE_VOICESHIELD_API_URL to enable server ML scoring.')
      return
    }
    setBackendStatus('Sending transcript to backend for ML comparison...')
    try {
      const result = await analyzeTranscriptWithBackend(transcript, analysis)
      setMlResult({ assessment: result.ml, caseId: analysis.caseId })
      setBackendStatus(`Backend ML completed: ${result.ml.verdict} (${result.ml.score}/100).`)
    } catch (error) {
      setBackendStatus(error instanceof Error ? error.message : 'Backend ML request failed')
    }
  }

  const stopLiveTranscription = () => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setIsListening(false)
    setLiveStatus('Live transcription stopped')
  }

  const startLiveTranscription = () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Recognition) {
      setLiveStatus('Live speech recognition is not supported in this browser')
      return
    }
    recognitionRef.current?.stop()
    const recognition = new Recognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = liveLanguage
    recognition.onresult = (event) => {
      let finalText = ''
      let interimText = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const phrase = event.results[index][0]?.transcript.trim()
        if (!phrase) continue
        if (event.results[index].isFinal) finalText += `${phrase}. `
        else interimText += phrase
      }
      if (finalText) setTranscript((current) => `${current.trim()} ${finalText}`.trim())
      setLiveStatus(interimText ? `Listening: ${interimText}` : 'Listening for speech...')
    }
    recognition.onerror = (event) => {
      setLiveStatus(`Live transcription error: ${event.error}`)
      setIsListening(false)
    }
    recognition.onend = () => {
      setIsListening(false)
      recognitionRef.current = null
    }
    recognitionRef.current = recognition
    setTranscript('')
    setFileName('live-call-transcript')
    setIsListening(true)
    setLiveStatus('Listening for speech...')
    recognition.start()
  }

  const activeLabel = tabs.find(([view]) => view === activeView)?.[1]

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><LockKeyhole size={19} /></div>
          <div>
            <h1>KZ VoiceShield</h1>
            <p>Threat intelligence workspace for Kazakh/Russian phone fraud</p>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="ghost-button" type="button" onClick={saveCurrentCase}><Save size={16} />Save case</button>
          <button className="ghost-button" type="button" onClick={exportReport}><FileDown size={16} />Export report</button>
        </div>
      </header>

      <nav className="view-tabs" aria-label="Application views">
        {tabs.map(([view, label]) => (
          <button className={activeView === view ? 'active' : ''} key={view} type="button" onClick={() => setActiveView(view)}>
            {label}
          </button>
        ))}
      </nav>

      <section className="workspace">
        <TranscriptInput
          transcript={transcript}
          fileName={fileName}
          caseLabel={caseLabel}
          reviewerName={reviewerName}
          analystNote={analystNote}
          isListening={isListening}
          liveLanguage={liveLanguage}
          liveStatus={liveStatus}
          isSpeechSupported={isSpeechSupported}
          onTranscriptChange={setTranscript}
          onFileNameChange={setFileName}
          onCaseLabelChange={setCaseLabel}
          onReviewerNameChange={setReviewerName}
          onAnalystNoteChange={setAnalystNote}
          onLiveLanguageChange={setLiveLanguage}
          onStartListening={startLiveTranscription}
          onStopListening={stopLiveTranscription}
          onFileUpload={handleFile}
        />

        <section className="panel main-panel">
          <div className="panel-heading">
            <div><h2>{activeLabel}</h2><p>{analysis.caseId} · {analysis.verdict}</p></div>
            <Radar size={20} />
          </div>

          {activeView === 'review' && (
            <ReviewView
              analysis={analysis}
              timelineLength={timeline.length}
              mlAssessment={mlAssessment}
              mlDisagreementText={mlDisagreement(analysis.risk, mlAssessment)}
              backendStatus={backendStatus}
              highSignals={highSignals}
              onRunBackendAnalysis={() => { void runBackendAnalysis() }}
            />
          )}

          {activeView === 'timeline' && <TimelineView timeline={timeline} />}

          {activeView === 'threats' && <ThreatsView />}

          {activeView === 'simulator' && (
            <SimulatorView
              onLoadScenario={(key) => {
                setTranscript(samples[key])
                setFileName(`${key}.txt`)
                setActiveView('review')
              }}
            />
          )}

          {activeView === 'cases' && (
            <CasesView
              cases={cases}
              reviewerName={reviewerName}
              syncState={syncState}
              onSaveCurrent={saveCurrentCase}
              onLoadCase={loadCase}
              onUpdateLabel={updateCaseLabel}
              onUpdateStatus={updateCaseStatus}
              onUpdateAssignee={updateCaseAssignee}
              onToggleFlag={toggleCaseFlag}
              onExportBundle={exportEvidenceBundle}
              onSyncCase={(item) => { void syncCase(item) }}
              onDeleteCase={deleteCase}
            />
          )}

          {activeView === 'operations' && (
            <OperationsView
              operations={operations}
              cases={cases}
              syncState={syncState}
              onSyncAll={() => { void syncAllCases() }}
              onSyncCase={(item) => { void syncCase(item) }}
              onLoadCase={loadCase}
              onUpdateStatus={updateCaseStatus}
              onToggleFlag={toggleCaseFlag}
              onExportBundle={exportEvidenceBundle}
              onOpenCases={() => setActiveView('cases')}
            />
          )}

          {activeView === 'dataset' && (
            <DatasetView
              quality={quality}
              caseCount={cases.length}
              importStatus={importStatus}
              datasetStageTotals={datasetStageTotals}
              onExportJsonl={() => downloadFile('kz-voiceshield-dataset.jsonl', exportJsonl(cases), 'application/x-ndjson;charset=utf-8')}
              onExportCsv={() => downloadFile('kz-voiceshield-dataset.csv', exportCsv(cases), 'text/csv;charset=utf-8')}
              onExportSplit={() => downloadFile('kz-voiceshield-split.json', exportSplitJson(cases), 'application/json;charset=utf-8')}
              onClear={clearCases}
            />
          )}

          {activeView === 'playbook' && <PlaybookView />}
        </section>

        <EvidencePanel analysis={analysis} />
      </section>
    </main>
  )
}

export default App
