import { BadgeCheck, Banknote, BrainCircuit, ClipboardCheck, Clock3, ShieldAlert } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { MlAssessment } from '../apiClient'
import type { Analysis } from '../scoring'
import { RiskBadge } from './RiskBadge'

type Props = {
  analysis: Analysis
  timelineLength: number
  mlAssessment: MlAssessment | undefined
  mlDisagreementText: string
  backendStatus: string
  highSignals: number
  onRunBackendAnalysis: () => void
}

const mlVerdictLabel = (verdict: MlAssessment['verdict']) =>
  verdict === 'fraud' ? 'Fraud' : verdict === 'safe' ? 'Safe' : 'Needs review'

export function ReviewView({ analysis, timelineLength, mlAssessment, mlDisagreementText, backendStatus, highSignals, onRunBackendAnalysis }: Props) {
  const progressStyle = { '--score': `${analysis.score}%` } as CSSProperties
  const mlProgressStyle = { '--score': `${mlAssessment?.score ?? 0}%` } as CSSProperties

  return (
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
            <span>{mlDisagreementText}</span>
          </div>
          <button className="primary-button" type="button" onClick={onRunBackendAnalysis}>
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
            {mlAssessment.signals.length > 0 && (
              <div className="term-row">{mlAssessment.signals.map((signal) => <span key={signal}>{signal}</span>)}</div>
            )}
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
        <div><Clock3 size={18} /><strong>{timelineLength}</strong><span>segments</span></div>
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
  )
}
