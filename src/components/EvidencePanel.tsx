import { BookOpenCheck, CheckCircle2, MessageCircleWarning } from 'lucide-react'
import type { Analysis } from '../scoring'

type Props = {
  analysis: Analysis
}

export function EvidencePanel({ analysis }: Props) {
  return (
    <aside className="panel evidence-panel">
      <div className="panel-heading">
        <div><h2>Evidence</h2><p>Matched tactics, stages and concrete terms.</p></div>
        <MessageCircleWarning size={20} />
      </div>
      <div className="evidence-list">
        {analysis.evidence.length === 0 ? (
          <div className="empty-state">
            <CheckCircle2 size={22} />
            <strong>No actionable scam pattern</strong>
            <span>Ordinary text now stays at 0 unless real signals appear.</span>
          </div>
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
        <span>
          Threat model covers bank vishing, OTP theft, remote access, AI-family scams, SIM swap,
          eGov/benefit fraud, Kaspi QR fraud, job scam, delivery phishing, investment fraud,
          messenger takeover, marketplace deposits and reverse-vishing setup calls.
        </span>
      </div>
    </aside>
  )
}
