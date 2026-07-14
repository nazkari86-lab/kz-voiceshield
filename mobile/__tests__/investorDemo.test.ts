import { buildInvestorDemoSnapshot, investorDemoSteps } from '../src/data/investorDemo'

describe('investor demo', () => {
  it('progresses from monitoring to critical intervention', () => {
    const snapshots = investorDemoSteps.map((_, index) => buildInvestorDemoSnapshot(index))
    expect(snapshots[0].analysis.risk).toBe('low')
    expect(snapshots.at(-1)?.analysis.risk).toBe('critical')
    expect(snapshots.at(-1)?.analysis.score).toBeGreaterThanOrEqual(85)
  })

  it('shows explainable evidence and response actions at completion', () => {
    const completed = buildInvestorDemoSnapshot(investorDemoSteps.length - 1)
    expect(completed.analysis.evidence.length).toBeGreaterThanOrEqual(3)
    expect(completed.analysis.stageCoverage.length).toBeGreaterThanOrEqual(2)
    expect(completed.analysis.responseChecklist.length).toBeGreaterThan(0)
    expect(completed.transcript).toContain('код из SMS')
  })

  it('clamps invalid step indexes', () => {
    expect(buildInvestorDemoSnapshot(-10).visibleSteps).toHaveLength(1)
    expect(buildInvestorDemoSnapshot(999).visibleSteps).toHaveLength(investorDemoSteps.length)
  })
})
