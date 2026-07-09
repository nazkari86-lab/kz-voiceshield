import { FileDown, LockKeyhole, Radar, Save } from 'lucide-react'
import { useState } from 'react'
import './App.css'
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
import { useAppState } from './hooks/useAppState'
import { exportCsv, exportJsonl, exportSplitJson, samples } from './scoring'
import type { MlAssessment } from './apiClient'

type View = 'review' | 'timeline' | 'threats' | 'simulator' | 'cases' | 'operations' | 'dataset' | 'playbook'

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

const mlDisagreement = (risk: string, ml?: MlAssessment) => {
  if (!ml) return 'No backend ML result yet'
  const rulesHigh = risk === 'critical' || risk === 'high'
  const mlHigh = ml.verdict === 'fraud'
  if (rulesHigh && !mlHigh) return 'Disagreement: rules high, ML low'
  if (!rulesHigh && mlHigh) return 'Disagreement: rules low, ML high'
  return 'Rules and ML are aligned'
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

function App() {
  const [activeView, setActiveView] = useState<View>('review')
  const state = useAppState()
  const {
    transcript, setTranscript,
    fileName, setFileName,
    cases,
    caseLabel, setCaseLabel,
    analystNote, setAnalystNote,
    reviewerName, setReviewerName,
    liveLanguage, setLiveLanguage,
    isListening, liveStatus, importStatus, backendStatus,
    mlAssessment, syncState,
    analysis, timeline, quality, datasetStageTotals, operations,
    isSpeechSupported, highSignals,
    handleFile, saveCurrentCase, loadCase,
    updateCaseLabel, updateCaseStatus, updateCaseAssignee,
    toggleCaseFlag, exportReport, exportEvidenceBundle,
    syncCase, syncAllCases, deleteCase, clearCases,
    runBackendAnalysis, startLiveTranscription, stopLiveTranscription,
  } = state

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
          <button className="ghost-button" type="button" onClick={() => { saveCurrentCase(); setActiveView('cases') }}><Save size={16} />Save case</button>
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
              onSaveCurrent={() => { saveCurrentCase(); setActiveView('cases') }}
              onLoadCase={(item) => { loadCase(item); setActiveView('review') }}
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
              onLoadCase={(item) => { loadCase(item); setActiveView('review') }}
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
