import { analyzeTranscript } from '../src/scoring'

describe('mobile scoring', () => {
  it('flags bank OTP transfer scripts as critical', () => {
    const result = analyzeTranscript('Служба безопасности банка. Срочно назовите SMS код и переведите деньги на безопасный счет.')

    expect(result.risk).toBe('critical')
    expect(result.score).toBeGreaterThanOrEqual(85)
  })

  it('keeps ordinary reminders low risk', () => {
    const result = analyzeTranscript('Здравствуйте, напоминаем о записи в клинику завтра утром.')

    expect(result.risk).toBe('low')
    expect(result.score).toBe(0)
  })
})
