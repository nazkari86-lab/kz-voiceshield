import { analyzeTranscript, sampleMeta, samples } from '../scoring'

type Props = {
  onLoadScenario: (key: keyof typeof samples, label: string) => void
}

export function SimulatorView({ onLoadScenario }: Props) {
  return (
    <div className="simulator-grid">
      {sampleMeta.map(([key, label]) => {
        const result = analyzeTranscript(samples[key])
        return (
          <button
            className={`scenario-button ${result.risk}`}
            key={key}
            type="button"
            onClick={() => onLoadScenario(key, label)}
          >
            <strong>{label}</strong>
            <span>{result.score}/100 · {result.verdict}</span>
          </button>
        )
      })}
    </div>
  )
}
