import { Activity, Banknote, CheckCircle2, Clock3, Database, FileDown, Send, ShieldAlert } from 'lucide-react'
import type { CaseStatus, SavedCase, WorkflowFlags } from '../scoring'
import { statusText } from '../scoring'

type SyncState = { status: 'idle' | 'syncing' | 'synced' | 'failed'; message: string; syncedAt?: string }

type Operations = {
  openCases: SavedCase[]
  escalationQueue: SavedCase[]
  bankContactQueue: SavedCase[]
  staleCases: SavedCase[]
  unsyncedCount: number
  statusCounts: Record<CaseStatus, number>
}

type Props = {
  operations: Operations
  cases: SavedCase[]
  syncState: Record<string, SyncState>
  onSyncAll: () => void
  onSyncCase: (item: SavedCase) => void
  onLoadCase: (item: SavedCase) => void
  onUpdateStatus: (id: string, status: CaseStatus) => void
  onToggleFlag: (id: string, flag: keyof WorkflowFlags) => void
  onExportBundle: (item: SavedCase) => void
  onOpenCases: () => void
}

const validStatuses: CaseStatus[] = ['new', 'reviewing', 'escalated', 'closed']

export function OperationsView({ operations, cases, syncState, onSyncAll, onSyncCase, onLoadCase, onUpdateStatus, onToggleFlag, onExportBundle, onOpenCases }: Props) {
  return (
    <div className="operations-panel">
      <div className="dataset-actions">
        <button className="primary-button" disabled={cases.length === 0} type="button" onClick={onSyncAll}><Send size={15} />Sync all</button>
        <button className="ghost-button" type="button" onClick={onOpenCases}><Database size={16} />Open cases</button>
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
          <div className="empty-state">
            <CheckCircle2 size={22} />
            <strong>No escalated cases</strong>
            <span>High-risk cases saved from review will appear here.</span>
          </div>
        ) : (
          operations.escalationQueue.map((item) => (
            <article className={`queue-item ${item.analysis.risk}`} key={`ops-${item.id}`}>
              <button className="case-open" type="button" onClick={() => onLoadCase(item)}>
                <strong>{item.id}</strong>
                <span>{item.analysis.score}/100 · {item.assignedTo} · {syncState[item.id]?.status ?? 'unsynced'}</span>
                <p>{item.analysis.escalationReasons[0]}</p>
              </button>
              <div className="queue-actions">
                <button className="ghost-button" type="button" onClick={() => onUpdateStatus(item.id, 'reviewing')}>Review</button>
                <button className="ghost-button" type="button" onClick={() => onSyncCase(item)}><Send size={15} />Sync</button>
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
            <button className="case-open" type="button" onClick={() => onLoadCase(item)}>
              <strong>{item.id}</strong>
              <span>{statusText(item.status)} · {item.assignedTo}</span>
              <p>{item.analysis.nextAction}</p>
            </button>
            <div className="queue-actions">
              <button className="ghost-button" type="button" onClick={() => onToggleFlag(item.id, 'bankContactNeeded')}>Clear bank flag</button>
              <button className="ghost-button" type="button" onClick={() => onExportBundle(item)}><FileDown size={15} />Bundle</button>
            </div>
          </article>
        ))}
      </section>
    </div>
  )
}
