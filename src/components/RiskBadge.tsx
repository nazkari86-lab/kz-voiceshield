import { AlertTriangle, ShieldAlert, ShieldCheck } from 'lucide-react'
import type { Severity } from '../scoring'

export function RiskBadge({ risk }: { risk: Severity }) {
  const label = risk === 'critical' ? 'Critical' : risk === 'high' ? 'High risk' : risk === 'medium' ? 'Review' : 'Low risk'
  const Icon = risk === 'critical' || risk === 'high' ? ShieldAlert : risk === 'medium' ? AlertTriangle : ShieldCheck
  return (
    <span className={`risk-badge ${risk}`}>
      <Icon size={16} />
      {label}
    </span>
  )
}
