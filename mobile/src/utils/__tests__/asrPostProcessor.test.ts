import { postProcessAsrSegments } from '../asrPostProcessor'

describe('postProcessAsrSegments', () => {
  it('removes overlapping decoder text while preserving raw segments', () => {
    const result = postProcessAsrSegments([
      { text: 'Назовите код из', startMs: 0, endMs: 1200, confidence: 0.92 },
      { text: 'код из SMS срочно', startMs: 1000, endMs: 2200, confidence: 0.86 },
    ])
    expect(result.derivedText).toBe('Назовите код из SMS срочно')
    expect(result.segments).toHaveLength(2)
    expect(result.flags).toContain('overlap')
  })

  it('keeps low-confidence as a quality flag, not a fraud verdict', () => {
    const result = postProcessAsrSegments([{ text: 'Сіздің шотыңыз', startMs: 0, endMs: 800, confidence: 0.3 }])
    expect(result.quality.level).toBe('degraded')
    expect(result.flags).toContain('low_confidence')
  })
})
