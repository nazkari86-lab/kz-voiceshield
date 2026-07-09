import { threatRules } from '../scoring'

export function ThreatsView() {
  return (
    <div className="threat-grid">
      {threatRules.map((rule) => (
        <article className={`threat-card ${rule.severity}`} key={rule.id}>
          <strong>{rule.title}</strong>
          <span>{rule.tactic} · {rule.stage} · weight {rule.weight}</span>
          <p>{rule.advice}</p>
        </article>
      ))}
    </div>
  )
}
