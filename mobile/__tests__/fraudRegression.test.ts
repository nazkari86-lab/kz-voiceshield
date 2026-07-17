import fs from 'node:fs'
import path from 'node:path'
import { analyzeTranscript } from '../src/scoring'

type RegressionCase = {
  id: string
  text: string
  expectedRisk: 'critical' | 'high' | 'medium' | 'low'
  expectedMinimumScore: number
}

const fixturePath = path.resolve(__dirname, '../../ml/fixtures/fraud_regression.jsonl')
const cases = fs.readFileSync(fixturePath, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line) as RegressionCase)
const riskRank = { low: 0, medium: 1, high: 2, critical: 3 } as const

describe('fraud regression fixture', () => {
  it.each(cases)('$id retains its expected risk floor', (item) => {
    const analysis = analyzeTranscript(item.text)
    expect(analysis.score).toBeGreaterThanOrEqual(item.expectedMinimumScore)
    expect(riskRank[analysis.risk]).toBeGreaterThanOrEqual(riskRank[item.expectedRisk])
  })
})
