import { Languages, Mic, MicOff, PhoneCall, Upload } from 'lucide-react'
import type { ChangeEvent } from 'react'
import type { CaseLabel } from '../scoring'
import { sampleMeta, samples } from '../scoring'

type Props = {
  transcript: string
  fileName: string
  caseLabel: CaseLabel
  reviewerName: string
  analystNote: string
  isListening: boolean
  liveLanguage: string
  liveStatus: string
  isSpeechSupported: boolean
  onTranscriptChange: (value: string) => void
  onFileNameChange: (name: string) => void
  onCaseLabelChange: (label: CaseLabel) => void
  onReviewerNameChange: (name: string) => void
  onAnalystNoteChange: (note: string) => void
  onLiveLanguageChange: (lang: string) => void
  onStartListening: () => void
  onStopListening: () => void
  onFileUpload: (event: ChangeEvent<HTMLInputElement>) => void
}

export function TranscriptInput({
  transcript,
  fileName,
  caseLabel,
  reviewerName,
  analystNote,
  isListening,
  liveLanguage,
  liveStatus,
  isSpeechSupported,
  onTranscriptChange,
  onFileNameChange,
  onCaseLabelChange,
  onReviewerNameChange,
  onAnalystNoteChange,
  onLiveLanguageChange,
  onStartListening,
  onStopListening,
  onFileUpload,
}: Props) {
  return (
    <aside className="panel input-panel">
      <div className="panel-heading">
        <div>
          <h2>Transcript intake</h2>
          <p>Paste, upload, stream, or load a real-world scam scenario.</p>
        </div>
        <PhoneCall size={20} />
      </div>
      <label className="upload-box">
        <input accept=".txt,.jsonl,.csv,text/plain,application/x-ndjson,audio/*" onChange={onFileUpload} type="file" />
        <Upload size={20} />
        <span>Upload transcript</span>
        <small>{fileName}</small>
      </label>
      <div className={`live-box ${isListening ? 'active' : ''}`}>
        <div className="live-copy"><strong>Live transcription</strong><span>{liveStatus}</span></div>
        <div className="live-controls">
          <select disabled={isListening} value={liveLanguage} onChange={(e) => onLiveLanguageChange(e.target.value)}>
            <option value="ru-RU">Russian</option>
            <option value="kk-KZ">Kazakh</option>
          </select>
          {isListening ? (
            <button className="danger-button" type="button" onClick={onStopListening}><MicOff size={15} />Stop</button>
          ) : (
            <button className="primary-button" disabled={!isSpeechSupported} type="button" onClick={onStartListening}><Mic size={15} />Start</button>
          )}
        </div>
      </div>
      <textarea
        spellCheck={false}
        value={transcript}
        onChange={(e) => onTranscriptChange(e.target.value)}
      />
      <div className="review-controls">
        <select value={caseLabel} onChange={(e) => onCaseLabelChange(e.target.value as CaseLabel)}>
          <option value="unreviewed">Unreviewed</option>
          <option value="true_positive">True positive</option>
          <option value="false_positive">False positive</option>
          <option value="needs_review">Needs review</option>
        </select>
        <input value={reviewerName} onChange={(e) => onReviewerNameChange(e.target.value)} placeholder="Reviewer" />
        <input value={analystNote} onChange={(e) => onAnalystNoteChange(e.target.value)} placeholder="Analyst note" />
      </div>
      <div className="sample-row">
        {sampleMeta.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              onTranscriptChange(samples[key])
              onFileNameChange(`${key}.txt`)
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="topbar-lang">
        <span className="language-chip"><Languages size={15} />KZ/RU</span>
      </div>
    </aside>
  )
}
