import { assessTranscriptQuality } from '../src/utils/transcriptQuality'

describe('transcript quality gate', () => {
  it('rejects common Whisper hallucinations', () => {
    expect(assessTranscriptQuality('Спасибо за просмотр')).toEqual({ accepted: false, reason: 'hallucination' })
  })
  it('rejects repetitive noise output', () => {
    expect(assessTranscriptQuality('да да да да да да да да')).toEqual({ accepted: false, reason: 'repetition' })
  })
  it('accepts a normal phrase', () => {
    expect(assessTranscriptQuality('Банк просит назвать код из SMS')).toEqual({ accepted: true })
  })
})
