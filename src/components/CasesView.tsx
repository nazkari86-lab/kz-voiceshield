import { Database, FileDown, Save, Send, Trash2 } from 'lucide-react'
import type { CaseLabel, CaseStatus, SavedCase, WorkflowFlags } from '../scoring'
import { labelText, statusText } from '../scoring'

type SyncState = { status: 'idle' | 'syncing' | 'synced' | 'failed'; message: string; syncedAt?: string }

type Props = {
  cases: SavedCase[]
  reviewerName: string
  syncState: Record<string, SyncState>
  onSaveCurrent: () => void
  onLoadCase: (item: SavedCase) => void
  onUpdateLabel: (id: string, label: CaseLabel) => void
  onUpdateStatus: (id: string, status: CaseStatus) => void
  onUpdateAssignee: (id: string, assignedTo: string) => void
  onToggleFlag: (id: string, flag: keyof WorkflowFlags) => void
  onExportBundle: (item: SavedCase) => void
  onSyncCase: (item: SavedCase) => void
  onDeleteCase: (id: string) => void
}

export function CasesView({
  cases,
  syncState,
  onSaveCurrent,
  onLoadCase,
  onUpdateLabel,
  onUpdateStatus,
  onUpdateAssignee,
  onToggleFlag,
  onExportBundle,
  onSyncCase,
  onDeleteCase,
}: Props) {
  return (
    <div className="case-library">
      <div className="library-actions">
        <strong>{cases.length} saved cases</strong>
        <button className="primary-button" type="button" onClick={onSaveCurrent}><Save size={15} />Save current</button>
      </div>
      {cases.length === 0 ? (
        <div className="empty-state">
          <Database size={22} />
          <strong>No saved cases yet</strong>
          <span>Save reviewed calls to build a local investigation library.</span>
        </div>
      ) : (
        cases.map((item) => (
          <article className={`saved-case ${item.analysis.risk}`} key={item.id}>
            <button className="case-open" type="button" onClick={() => onLoadCase(item)}>
              <strong>{item.id}</strong>
              <span>{item.analysis.score}/100 · {item.analysis.verdict} · {labelText(item.label)} · {statusText(item.status)} · {item.provenance.trusted ? 'trusted' : 'not training-eligible'}</span>
              <p>{item.transcript.slice(0, 180)}{item.transcript.length > 180 ? '...' : ''}</p>
              <span className="case-workflow-meta">
                <span>{item.assignedTo}</span>
                {item.flags.bankContactNeeded && <span>Bank contact</span>}
                {item.flags.customerCallbackNeeded && <span>Callback</span>}
                {item.flags.evidenceBundleReady && <span>Evidence ready</span>}
              </span>
            </button>
            <div className="case-tools">
              <select value={item.label} onChange={(e) => onUpdateLabel(item.id, e.target.value as CaseLabel)}>
                <option value="unreviewed">Unreviewed</option>
                <option value="true_positive">True positive</option>
                <option value="false_positive">False positive</option>
                <option value="needs_review">Needs review</option>
              </select>
              <select value={item.status} onChange={(e) => onUpdateStatus(item.id, e.target.value as CaseStatus)}>
                <option value="new">New</option>
                <option value="reviewing">Reviewing</option>
                <option value="escalated">Escalated</option>
                <option value="closed">Closed</option>
              </select>
              <input value={item.assignedTo} onChange={(e) => onUpdateAssignee(item.id, e.target.value)} aria-label="Assignee" />
              <button className={item.flags.bankContactNeeded ? 'flag-button active' : 'flag-button'} type="button" onClick={() => onToggleFlag(item.id, 'bankContactNeeded')}>Bank</button>
              <button className={item.flags.customerCallbackNeeded ? 'flag-button active' : 'flag-button'} type="button" onClick={() => onToggleFlag(item.id, 'customerCallbackNeeded')}>Callback</button>
              <button className={item.flags.evidenceBundleReady ? 'flag-button active' : 'flag-button'} type="button" onClick={() => onToggleFlag(item.id, 'evidenceBundleReady')}>Evidence</button>
              <button className="ghost-button" type="button" onClick={() => onExportBundle(item)}><FileDown size={15} />Bundle</button>
              <button className="ghost-button" type="button" onClick={() => onSyncCase(item)}><Send size={15} />Sync</button>
              <button className="icon-button" type="button" onClick={() => onDeleteCase(item.id)} aria-label="Delete case"><Trash2 size={16} /></button>
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
  )
}
