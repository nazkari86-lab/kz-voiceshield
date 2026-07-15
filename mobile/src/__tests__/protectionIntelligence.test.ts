import { analyzeTranscript } from '@scoring'
import { buildAttackGraph, buildIncidentCopilot, buildModelConsensus, calibratedRiskScore } from '../utils/protectionIntelligence'
import { parseLiveAiResponse } from '../utils/liveAiAnalysis'

describe('protection intelligence', () => {
  const analysis = analyzeTranscript('Это служба безопасности банка. Срочно назовите код из SMS и переведите деньги на безопасный счет.')

  it('keeps rules as the protective decision when models disagree', () => {
    const ai = parseLiveAiResponse('{"risk":"low","scheme":"unknown","evidence":"short","action":"verify"}')
    const consensus = buildModelConsensus(analysis, ai)
    expect(consensus.label).toBe('rules_lead')
    expect(consensus.ruleRisk).toBe(analysis.risk)
  })

  it('produces safe immediate actions and an attack graph', () => {
    const actions = buildIncidentCopilot(analysis, 'Срочно назовите код из SMS и переведите деньги.')
    expect(actions.some((item) => item.id === 'no-secrets')).toBe(true)
    expect(actions.some((item) => item.priority === 'now')).toBe(true)
    const graph = buildAttackGraph(analysis)
    expect(graph.nodes.length).toBeGreaterThan(1)
    expect(graph.edges.length).toBeGreaterThan(0)
  })

  it('bounds personal calibration changes', () => {
    expect(calibratedRiskScore(99, 'confirmed_fraud')).toBe(100)
    expect(calibratedRiskScore(1, 'confirmed_safe')).toBe(0)
  })
})
