import { Database, FileDown, FileText, Target, Trash2 } from 'lucide-react'
import type { DatasetQuality } from '../scoring'

type Props = {
  quality: DatasetQuality
  caseCount: number
  importStatus: string
  datasetStageTotals: [string, number][]
  onExportJsonl: () => void
  onExportCsv: () => void
  onExportSplit: () => void
  onClear: () => void
}

export function DatasetView({ quality, caseCount, importStatus, datasetStageTotals, onExportJsonl, onExportCsv, onExportSplit, onClear }: Props) {
  return (
    <div className="dataset-panel">
      <div className="dataset-actions">
        <button className="ghost-button" disabled={caseCount === 0} type="button" onClick={onExportJsonl}><FileText size={16} />Export JSONL</button>
        <button className="ghost-button" disabled={caseCount === 0} type="button" onClick={onExportCsv}><FileDown size={16} />Export CSV</button>
        <button className="ghost-button" disabled={caseCount === 0} type="button" onClick={onExportSplit}><Database size={16} />Export split</button>
        <button className="danger-button" disabled={caseCount === 0} type="button" onClick={onClear}><Trash2 size={15} />Clear</button>
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
  )
}
