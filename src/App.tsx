import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Banknote,
  BookOpenCheck,
  BrainCircuit,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Database,
  FileDown,
  FileText,
  Languages,
  LockKeyhole,
  MessageCircleWarning,
  Mic,
  MicOff,
  PhoneCall,
  Radar,
  Save,
  Send,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Target,
  Trash2,
  Upload,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, CSSProperties } from 'react'
import './App.css'
import { analyzeTranscriptWithBackend, isBackendConfigured, syncCaseWithBackend, transcribeAudioWithBackend } from './apiClient'
import type { MlAssessment } from './apiClient'
import {
  analyzeTranscript,
  buildReport,
  buildEvidenceBundle,
  createWorkflowState,
  datasetQuality,
  exportCsv,
  exportJsonl,
  exportSplitJson,
  labelText,
  sampleMeta,
  samples,
  sentenceTimeline,
  statusText,
  storageKey,
  threatRules,
} from './scoring'
import type { CaseLabel, CaseStatus, SavedCase, Severity, WorkflowFlags } from './scoring'

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

const downloadFile = (fileName: string, body: string, type = 'text/plain;charset=utf-8') => {
  const blob = new Blob([body], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

function RiskBadge({ risk }: { risk: Severity }) {
  const label = risk === 'critical' ? 'Critical' : risk === 'high' ? 'High risk' : risk === 'medium' ? 'Review' : 'Low risk'
  const Icon = risk === 'critical' || risk === 'high' ? ShieldAlert : risk === 'medium' ? AlertTriangle : ShieldCheck
  return (
    <span className={`risk-badge ${risk}`}>
      <Icon size={16} />
      {label}
    </span>
  )
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

const mlVerdictLabel = (verdict: MlAssessment['verdict']) =>
  verdict === 'fraud' ? 'Fraud' : verdict === 'safe' ? 'Safe' : 'Needs review'

const mlDisagreement = (risk: Severity, ml?: MlAssessment) => {
  if (!ml) return 'No backend ML result yet'
  const rulesHigh = risk === 'critical' || risk === 'high'
  const mlHigh = ml.verdict === 'fraud'
  if (rulesHigh && !mlHigh) return 'Disagreement: rules high, ML low'
  if (!rulesHigh && mlHigh) return 'Disagreement: rules low, ML high'
  return 'Rules and ML are aligned'
}

type SyncState = {
  status: 'idle' | 'syncing' | 'synced' | 'failed'
  message: string
  syncedAt?: string
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
  const progressStyle = { '--score': `${analysis.score}%` } as CSSProperties
  const mlProgressStyle = { '--score': `${mlAssessment?.score ?? 0}%` } as CSSProperties

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

  const exportReport = () => {
    downloadFile(`kz-voiceshield-${analysis.caseId}.txt`, buildReport(transcript, analysis))
  }

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
        [item.id]: {
          message: error instanceof Error ? error.message : 'Case sync failed',
          status: 'failed',
        },
      }))
    }
  }

  const syncAllCases = async () => {
    for (const item of cases) await syncCase(item)
  }

  const deleteCase = (id: string) => setCases((current) => current.filter((item) => item.id !== id))

  const clearCases = () => setCases([])

  const exportDatasetJsonl = () => downloadFile('kz-voiceshield-dataset.jsonl', exportJsonl(cases), 'application/x-ndjson;charset=utf-8')

  const exportDatasetCsv = () => downloadFile('kz-voiceshield-dataset.csv', exportCsv(cases), 'text/csv;charset=utf-8')

  const exportDatasetSplit = () => downloadFile('kz-voiceshield-split.json', exportSplitJson(cases), 'application/json;charset=utf-8')

  const runBackendAnalysis = async () => {
    if (!isBackendConfigured()) {
      setBackendStatus('Set VITE_VOICESHIELD_API_URL to enable server ML scoring.')
      return
    }
    setBackendStatus('Sending transcript to backend for ML comparison...')
    try {
      const result = await analyzeTranscriptWithBackend(transcript, analysis)
      setMlResult({ assessment: result.ml, caseId: analysis.caseId })
      setBackendStatus(`Backend ML completed: ${mlVerdictLabel(result.ml.verdict)} (${result.ml.score}/100).`)
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

  const highSignals = analysis.evidence.filter((item) => item.severity === 'critical' || item.severity === 'high').length

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
          <span className="language-chip"><Languages size={15} />KZ/RU</span>
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
        <aside className="panel input-panel">
          <div className="panel-heading">
            <div><h2>Transcript intake</h2><p>Paste, upload, stream, or load a real-world scam scenario.</p></div>
            <PhoneCall size={20} />
          </div>
          <label className="upload-box">
            <input accept=".txt,.jsonl,.csv,text/plain,application/x-ndjson,audio/*" onChange={handleFile} type="file" />
            <Upload size={20} />
            <span>Upload transcript</span>
            <small>{fileName}</small>
          </label>
          <div className={`live-box ${isListening ? 'active' : ''}`}>
            <div className="live-copy"><strong>Live transcription</strong><span>{liveStatus}</span></div>
            <div className="live-controls">
              <select disabled={isListening} value={liveLanguage} onChange={(event) => setLiveLanguage(event.target.value)}>
                <option value="ru-RU">Russian</option>
                <option value="kk-KZ">Kazakh</option>
              </select>
              {isListening ? (
                <button className="danger-button" type="button" onClick={stopLiveTranscription}><MicOff size={15} />Stop</button>
              ) : (
                <button className="primary-button" disabled={!isSpeechSupported} type="button" onClick={startLiveTranscription}><Mic size={15} />Start</button>
              )}
            </div>
          </div>
          <textarea spellCheck={false} value={transcript} onChange={(event) => setTranscript(event.target.value)} />
          <div className="review-controls">
            <select value={caseLabel} onChange={(event) => setCaseLabel(event.target.value as CaseLabel)}>
              <option value="unreviewed">Unreviewed</option>
              <option value="true_positive">True positive</option>
              <option value="false_positive">False positive</option>
              <option value="needs_review">Needs review</option>
            </select>
            <input value={reviewerName} onChange={(event) => setReviewerName(event.target.value)} placeholder="Reviewer" />
            <input value={analystNote} onChange={(event) => setAnalystNote(event.target.value)} placeholder="Analyst note" />
          </div>
          <div className="sample-row">
            {sampleMeta.map(([key, label]) => (
              <button key={key} type="button" onClick={() => { setTranscript(samples[key]); setFileName(`${key}.txt`) }}>{label}</button>
            ))}
          </div>
        </aside>

        <section className="panel main-panel">
          <div className="panel-heading">
            <div><h2>{tabs.find(([view]) => view === activeView)?.[1]}</h2><p>{analysis.caseId} · {analysis.verdict}</p></div>
            <Radar size={20} />
          </div>

          {activeView === 'review' && (
            <>
              <div className={`score-card ${analysis.risk}`}>
                <div className="score-topline"><RiskBadge risk={analysis.risk} /><span>{analysis.caseId}</span></div>
                <div className="score-number">{analysis.score}</div>
                <div className="score-meter" style={progressStyle}><span /></div>
                <p>{analysis.nextAction}</p>
              </div>
              <div className="ml-card">
                <div className="ml-card-heading">
                  <div>
                    <strong>ML comparison layer</strong>
                    <span>{mlDisagreement(analysis.risk, mlAssessment)}</span>
                  </div>
                  <button className="primary-button" type="button" onClick={runBackendAnalysis}>
                    <BrainCircuit size={15} />Run ML check
                  </button>
                </div>
                {mlAssessment ? (
                  <>
                    <div className="ml-score-row">
                      <div><strong>{mlAssessment.score}</strong><span>ML score</span></div>
                      <div><strong>{mlAssessment.confidence}</strong><span>ML confidence</span></div>
                      <div><strong>{mlVerdictLabel(mlAssessment.verdict)}</strong><span>{mlAssessment.model}</span></div>
                    </div>
                    <div className="score-meter compact" style={mlProgressStyle}><span /></div>
                    {mlAssessment.embeddingModel && <p>Embeddings: {mlAssessment.embeddingModel}</p>}
                    {mlAssessment.signals.length > 0 && <div className="term-row">{mlAssessment.signals.map((signal) => <span key={signal}>{signal}</span>)}</div>}
                  </>
                ) : (
                  <p>Rules remain the source of truth. Backend ML can add fraud/safe/needs_review comparison and disagreement review when configured.</p>
                )}
                <small>{backendStatus}</small>
              </div>
              <div className="metric-grid">
                <div><ShieldAlert size={18} /><strong>{highSignals}</strong><span>major signals</span></div>
                <div><BadgeCheck size={18} /><strong>{analysis.confidence}</strong><span>confidence</span></div>
                <div><ClipboardCheck size={18} /><strong>{analysis.evidence.length}</strong><span>rules matched</span></div>
                <div><BrainCircuit size={18} /><strong>{analysis.matchedTerms}</strong><span>terms found</span></div>
                <div><Clock3 size={18} /><strong>{timeline.length}</strong><span>segments</span></div>
                <div><Banknote size={18} /><strong>{analysis.evidence.some((item) => item.stage === 'Cash-out') ? 'Yes' : 'No'}</strong><span>cash-out stage</span></div>
              </div>
              <div className="triage-grid">
                <section className="action-box">
                  <h3>Escalation reasons</h3>
                  <ul>{analysis.escalationReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
                </section>
                <section className="action-box">
                  <h3>Response checklist</h3>
                  <ul>{analysis.responseChecklist.map((item) => <li key={item}>{item}</li>)}</ul>
                </section>
              </div>
              <div className="stage-strip" aria-label="Threat stage coverage">
                {analysis.stageCoverage.length === 0 ? (
                  <span>No active threat stages</span>
                ) : (
                  analysis.stageCoverage.map((stage) => (
                    <div key={stage.stage}>
                      <strong>{stage.stage}</strong>
                      <span>{stage.count} rule(s) · {stage.score} pts</span>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {activeView === 'timeline' && (
            <div className="timeline-list">
              {timeline.map((item) => (
                <article className={`timeline-item ${item.analysis.risk}`} key={`${item.index}-${item.segment}`}>
                  <span>{item.index}</span>
                  <div><strong>{item.analysis.score}/100 · {item.analysis.verdict}</strong><p>{item.segment}</p></div>
                </article>
              ))}
            </div>
          )}

          {activeView === 'threats' && (
            <div className="threat-grid">
              {threatRules.map((rule) => (
                <article className={`threat-card ${rule.severity}`} key={rule.id}>
                  <strong>{rule.title}</strong>
                  <span>{rule.tactic} · {rule.stage} · weight {rule.weight}</span>
                  <p>{rule.advice}</p>
                </article>
              ))}
            </div>
          )}

          {activeView === 'simulator' && (
            <div className="simulator-grid">
              {sampleMeta.map(([key, label]) => {
                const result = analyzeTranscript(samples[key])
                return (
                  <button className={`scenario-button ${result.risk}`} key={key} type="button" onClick={() => { setTranscript(samples[key]); setFileName(`${key}.txt`); setActiveView('review') }}>
                    <strong>{label}</strong>
                    <span>{result.score}/100 · {result.verdict}</span>
                  </button>
                )
              })}
            </div>
          )}

          {activeView === 'cases' && (
            <div className="case-library">
              <div className="library-actions">
                <strong>{cases.length} saved cases</strong>
                <button className="primary-button" type="button" onClick={saveCurrentCase}><Save size={15} />Save current</button>
              </div>
              {cases.length === 0 ? (
                <div className="empty-state"><Database size={22} /><strong>No saved cases yet</strong><span>Save reviewed calls to build a local investigation library.</span></div>
              ) : (
                cases.map((item) => (
                  <article className={`saved-case ${item.analysis.risk}`} key={item.id}>
                    <button className="case-open" type="button" onClick={() => loadCase(item)}>
                      <strong>{item.id}</strong>
                      <span>{item.analysis.score}/100 · {item.analysis.verdict} · {labelText(item.label)} · {statusText(item.status)}</span>
                      <p>{item.transcript.slice(0, 180)}{item.transcript.length > 180 ? '...' : ''}</p>
                      <span className="case-workflow-meta">
                        <span>{item.assignedTo}</span>
                        {item.flags.bankContactNeeded && <span>Bank contact</span>}
                        {item.flags.customerCallbackNeeded && <span>Callback</span>}
                        {item.flags.evidenceBundleReady && <span>Evidence ready</span>}
                      </span>
                    </button>
                    <div className="case-tools">
                      <select value={item.label} onChange={(event) => updateCaseLabel(item.id, event.target.value as CaseLabel)}>
                        <option value="unreviewed">Unreviewed</option>
                        <option value="true_positive">True positive</option>
                        <option value="false_positive">False positive</option>
                        <option value="needs_review">Needs review</option>
                      </select>
                      <select value={item.status} onChange={(event) => updateCaseStatus(item.id, event.target.value as CaseStatus)}>
                        <option value="new">New</option>
                        <option value="reviewing">Reviewing</option>
                        <option value="escalated">Escalated</option>
                        <option value="closed">Closed</option>
                      </select>
                      <input value={item.assignedTo} onChange={(event) => updateCaseAssignee(item.id, event.target.value)} aria-label="Assignee" />
                      <button className={item.flags.bankContactNeeded ? 'flag-button active' : 'flag-button'} type="button" onClick={() => toggleCaseFlag(item.id, 'bankContactNeeded')}>Bank</button>
                      <button className={item.flags.customerCallbackNeeded ? 'flag-button active' : 'flag-button'} type="button" onClick={() => toggleCaseFlag(item.id, 'customerCallbackNeeded')}>Callback</button>
                      <button className={item.flags.evidenceBundleReady ? 'flag-button active' : 'flag-button'} type="button" onClick={() => toggleCaseFlag(item.id, 'evidenceBundleReady')}>Evidence</button>
                      <button className="ghost-button" type="button" onClick={() => exportEvidenceBundle(item)}><FileDown size={15} />Bundle</button>
                      <button className="ghost-button" type="button" onClick={() => { void syncCase(item) }}><Send size={15} />Sync</button>
                      <button className="icon-button" type="button" onClick={() => deleteCase(item.id)} aria-label="Delete case"><Trash2 size={16} /></button>
                    </div>
                    <div className="workflow-timeline">
                      {item.incidentTimeline.slice(0, 4).map((event) => (
                        <div key={`${item.id}-${event.title}-${event.detail}`}>
                          <strong>{event.title}</strong>
                          <span>{event.detail}</span>
                        </div>
                      ))}
                    </div>
                    <div className="audit-strip">
                      <strong>{item.auditLog.length}</strong>
                      <span>audit events · last updated {new Date(item.updatedAt).toLocaleString()} · {syncState[item.id]?.message ?? 'not synced'}</span>
                    </div>
                  </article>
                ))
              )}
            </div>
          )}

          {activeView === 'operations' && (
            <div className="operations-panel">
              <div className="dataset-actions">
                <button className="primary-button" disabled={cases.length === 0} type="button" onClick={() => { void syncAllCases() }}><Send size={15} />Sync all</button>
                <button className="ghost-button" type="button" onClick={() => setActiveView('cases')}><Database size={16} />Open cases</button>
              </div>
              <div className="ops-grid">
                <div><Activity size={18} /><strong>{operations.openCases.length}</strong><span>open cases</span></div>
                <div><ShieldAlert size={18} /><strong>{operations.escalationQueue.length}</strong><span>escalated</span></div>
                <div><Banknote size={18} /><strong>{operations.bankContactQueue.length}</strong><span>bank contact needed</span></div>
                <div><Clock3 size={18} /><strong>{operations.staleCases.length}</strong><span>stale open cases</span></div>
                <div><Send size={18} /><strong>{operations.unsyncedCount}</strong><span>not synced</span></div>
              </div>
              <div className="status-board">
                {validStatuses.map((status) => (
                  <div key={status}>
                    <strong>{operations.statusCounts[status]}</strong>
                    <span>{statusText(status)}</span>
                  </div>
                ))}
              </div>
              <section className="queue-section">
                <div className="section-heading">
                  <strong>Escalation queue</strong>
                  <span>{operations.escalationQueue.length} case(s)</span>
                </div>
                {operations.escalationQueue.length === 0 ? (
                  <div className="empty-state"><CheckCircle2 size={22} /><strong>No escalated cases</strong><span>High-risk cases saved from review will appear here.</span></div>
                ) : (
                  operations.escalationQueue.map((item) => (
                    <article className={`queue-item ${item.analysis.risk}`} key={`ops-${item.id}`}>
                      <button className="case-open" type="button" onClick={() => loadCase(item)}>
                        <strong>{item.id}</strong>
                        <span>{item.analysis.score}/100 · {item.assignedTo} · {syncState[item.id]?.status ?? 'unsynced'}</span>
                        <p>{item.analysis.escalationReasons[0]}</p>
                      </button>
                      <div className="queue-actions">
                        <button className="ghost-button" type="button" onClick={() => updateCaseStatus(item.id, 'reviewing')}>Review</button>
                        <button className="ghost-button" type="button" onClick={() => { void syncCase(item) }}><Send size={15} />Sync</button>
                      </div>
                    </article>
                  ))
                )}
              </section>
              <section className="queue-section">
                <div className="section-heading">
                  <strong>Bank contact queue</strong>
                  <span>{operations.bankContactQueue.length} case(s)</span>
                </div>
                {operations.bankContactQueue.map((item) => (
                  <article className={`queue-item ${item.analysis.risk}`} key={`bank-${item.id}`}>
                    <button className="case-open" type="button" onClick={() => loadCase(item)}>
                      <strong>{item.id}</strong>
                      <span>{statusText(item.status)} · {item.assignedTo}</span>
                      <p>{item.analysis.nextAction}</p>
                    </button>
                    <div className="queue-actions">
                      <button className="ghost-button" type="button" onClick={() => toggleCaseFlag(item.id, 'bankContactNeeded')}>Clear bank flag</button>
                      <button className="ghost-button" type="button" onClick={() => exportEvidenceBundle(item)}><FileDown size={15} />Bundle</button>
                    </div>
                  </article>
                ))}
              </section>
            </div>
          )}

          {activeView === 'dataset' && (
            <div className="dataset-panel">
              <div className="dataset-actions">
                <button className="ghost-button" disabled={cases.length === 0} type="button" onClick={exportDatasetJsonl}><FileText size={16} />Export JSONL</button>
                <button className="ghost-button" disabled={cases.length === 0} type="button" onClick={exportDatasetCsv}><FileDown size={16} />Export CSV</button>
                <button className="ghost-button" disabled={cases.length === 0} type="button" onClick={exportDatasetSplit}><Database size={16} />Export split</button>
                <button className="danger-button" disabled={cases.length === 0} type="button" onClick={clearCases}><Trash2 size={15} />Clear</button>
              </div>
              {importStatus && <div className="import-status"><Target size={16} />{importStatus}</div>}
              <div className="dataset-stats">
                <div><strong>{quality.total}</strong><span>cases</span></div>
                <div><strong>{quality.labelBalance.true_positive}</strong><span>true positive</span></div>
                <div><strong>{quality.labelBalance.false_positive}</strong><span>false positive</span></div>
                <div><strong>{quality.labelBalance.needs_review}</strong><span>needs review</span></div>
              </div>
              <div className="quality-grid">
                <div><strong>{quality.unlabeledCount}</strong><span>unreviewed labels</span></div>
                <div><strong>{quality.duplicateGroups.length}</strong><span>duplicate groups</span></div>
                <div><strong>{quality.falsePositiveReview.length}</strong><span>false positives to review</span></div>
                <div><strong>{quality.averageWords}</strong><span>avg words</span></div>
              </div>
              <div className="stage-strip">
                {datasetStageTotals.length === 0 ? (
                  <span>No stage coverage yet</span>
                ) : (
                  datasetStageTotals.map(([stage, count]) => (
                    <div key={stage}>
                      <strong>{stage}</strong>
                      <span>{count} matched rule(s)</span>
                    </div>
                  ))
                )}
              </div>
              <div className="dataset-schema">
                <strong>Training fields · {quality.schemaVersion}</strong>
                <p>Each export includes transcript, score, risk, confidence, verdict, escalation reasons, response checklist, stage coverage, evidence IDs, matched terms, analyst label and notes. JSONL is for model training, CSV is for spreadsheet audit, and split JSON creates deterministic train/dev/test sets.</p>
              </div>
            </div>
          )}

          {activeView === 'playbook' && (
            <div className="playbook">
              <article><ShieldCheck size={18} /><div><strong>1. Freeze action</strong><p>Stop transfers, code sharing, screen sharing and app installs immediately.</p></div></article>
              <article><PhoneCall size={18} /><div><strong>2. Verify independently</strong><p>Call the bank, courier, relative or agency through a saved official number.</p></div></article>
              <article><Smartphone size={18} /><div><strong>3. Secure accounts</strong><p>Change passwords, end suspicious sessions and check messenger linked devices.</p></div></article>
              <article><FileDown size={18} /><div><strong>4. Preserve evidence</strong><p>Export this report, keep screenshots, phone numbers, links and timestamps.</p></div></article>
            </div>
          )}
        </section>

        <aside className="panel evidence-panel">
          <div className="panel-heading">
            <div><h2>Evidence</h2><p>Matched tactics, stages and concrete terms.</p></div>
            <MessageCircleWarning size={20} />
          </div>
          <div className="evidence-list">
            {analysis.evidence.length === 0 ? (
              <div className="empty-state"><CheckCircle2 size={22} /><strong>No actionable scam pattern</strong><span>Ordinary text now stays at 0 unless real signals appear.</span></div>
            ) : (
              analysis.evidence.map((item) => (
                <article className={`evidence-item ${item.severity}`} key={item.id}>
                  <div><strong>{item.title}</strong><p>{item.tactic} · {item.stage} · +{item.score}</p></div>
                  <div className="term-row">{item.matches.map((match) => <span key={match}>{match}</span>)}</div>
                </article>
              ))
            )}
          </div>
          <div className={`case-summary ${analysis.risk}`}>
            <strong>{analysis.verdict}</strong>
            <span>Score {analysis.score}/100 · Confidence {analysis.confidence}/100</span>
            <p>{analysis.nextAction}</p>
          </div>
          <div className="source-box">
            <BookOpenCheck size={17} />
            <span>Threat model covers bank vishing, OTP theft, remote access, AI-family scams, delivery phishing, investment fraud, messenger takeover, marketplace deposits and reverse-vishing setup calls.</span>
          </div>
        </aside>
      </section>
    </main>
  )
}

export default App
