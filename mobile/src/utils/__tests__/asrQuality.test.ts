import { assessAsrQuality } from '../asrQuality'

describe('assessAsrQuality', () => {
  it('detects Kazakh without changing evidence text', () => {
    const result = assessAsrQuality('Сіздің шотыңыз бұғатталды, кодты айтыңыз.')
    expect(result.language).toBe('kk')
    expect(result.level).toBe('good')
    expect(result.normalizedText).toContain('кодты')
  })

  it('marks notification and media hallucinations unusable', () => {
    expect(assessAsrQuality('Спасибо за просмотр').level).toBe('unusable')
    expect(assessAsrQuality('подписывайтесь подписывайтесь подписывайтесь подписывайтесь').flags).toContain('non_speech_hallucination')
  })

  it('keeps low confidence separate from fraud analysis', () => {
    const result = assessAsrQuality('Назовите код из SMS', 42)
    expect(result.level).toBe('degraded')
    expect(result.normalizedText).toBe('Назовите код из SMS')
  })
})
