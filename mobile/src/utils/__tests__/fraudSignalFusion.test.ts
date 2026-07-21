import { analyzeTranscript } from '@scoring'
import { extractFraudSignals, fuseRiskScores } from '../fraudSignalFusion'

describe('fraud signal fusion', () => {
  test('extracts independent RU/KZ attack intents and ordered stages', () => {
    const result = extractFraudSignals('Банк звонит. Қазір кодты айтыңыз, ақша аударыңыз на безопасный счет. Ешкімге айтпаңыз.')
    expect(result.intents.map((item) => item.id)).toEqual(expect.arrayContaining(['authority_claim', 'credential_request', 'payment_request', 'urgency_pressure', 'victim_isolation']))
    expect(result.stages.map((stage) => stage.id)).toEqual(['pretext', 'pressure', 'credential_request', 'financial_action', 'isolation'])
    expect(result.quality).toBe('strong')
  })

  test('does not score empty or ordinary text as a fraud signal', () => {
    const result = extractFraudSignals('Добрый день, встреча завтра в десять часов.')
    expect(result.semanticScoreDelta).toBe(0)
    expect(result.quality).toBe('none')
  })

  test('keeps rules authoritative when ML disagrees', () => {
    const analysis = analyzeTranscript('Назовите код из SMS и переведите деньги на безопасный счет.')
    const semantic = extractFraudSignals('Назовите код из SMS и переведите деньги на безопасный счет.')
    const result = fuseRiskScores(analysis, semantic, { score: 10, confidence: 90, verdict: 'safe' })
    expect(result.recommendedScore).toBe(analysis.score)
    expect(result.disagreement).toBe('rules_high_ml_low')
  })
})
