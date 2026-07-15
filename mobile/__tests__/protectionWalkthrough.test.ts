import { buildProtectionWalkthroughSnapshot, protectionWalkthroughSteps } from '../src/data/protectionWalkthrough'

describe('protection walkthrough', () => {
  it('progresses from monitoring to critical intervention', () => {
    const snapshots = protectionWalkthroughSteps.map((_, index) => buildProtectionWalkthroughSnapshot(index))
    expect(snapshots[0].analysis.risk).toBe('low')
    expect(snapshots.at(-1)?.analysis.risk).toBe('critical')
    expect(snapshots.at(-1)?.analysis.score).toBeGreaterThanOrEqual(85)
  })

  it('shows explainable evidence and response actions at completion', () => {
    const completed = buildProtectionWalkthroughSnapshot(protectionWalkthroughSteps.length - 1)
    expect(completed.analysis.evidence.length).toBeGreaterThanOrEqual(3)
    expect(completed.analysis.stageCoverage.length).toBeGreaterThanOrEqual(2)
    expect(completed.analysis.responseChecklist.length).toBeGreaterThan(0)
    expect(completed.transcript).toContain('код из SMS')
  })

  it('clamps invalid step indexes', () => {
    expect(buildProtectionWalkthroughSnapshot(-10).visibleSteps).toHaveLength(1)
    expect(buildProtectionWalkthroughSnapshot(999).visibleSteps).toHaveLength(protectionWalkthroughSteps.length)
  })
})
