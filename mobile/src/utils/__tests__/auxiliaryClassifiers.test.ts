import { analyzeTranscript } from '@scoring'
import { classifyAudioEvidence, classifyAuxiliarySignals } from '../auxiliaryClassifiers'

describe('auxiliary classifiers', () => {
  test('keeps synthetic voice unavailable without audio model evidence', () => {
    const result = classifyAuxiliarySignals('Обычный разговор без действий.', [], [])
    expect(result.find((item) => item.id === 'synthetic_voice')?.score).toBeNull()
    expect(result.find((item) => item.id === 'synthetic_voice')?.status).toBe('unavailable')
  })

  test('scores robocall and phishing with independent rules', () => {
    const text = 'Автоматическое сообщение. Для соединения нажмите 1. Перейдите по ссылке https://example.test и введите код.'
    const analysis = analyzeTranscript(text)
    const result = classifyAuxiliarySignals(text, analysis.evidence, [])
    expect(result.find((item) => item.id === 'robocall')?.score).toBeGreaterThan(0)
    expect(result.find((item) => item.id === 'phishing')?.score).toBeGreaterThan(0)
  })

  test('accepts a real model score without making a claim about calibration', () => {
    const result = classifyAudioEvidence({ syntheticVoiceScore: 84, syntheticVoiceConfidence: 77, model: 'AASIST-ONNX' })
    expect(result[0]).toMatchObject({ score: 84, confidence: 77, status: 'ready', model: 'AASIST-ONNX' })
  })
})
