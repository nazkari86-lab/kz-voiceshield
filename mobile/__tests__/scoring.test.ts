import { scoreTranscript } from '../src/scoring'

describe('mobile scoring', () => {
  it('flags bank OTP transfer scripts as critical', () => {
    const result = scoreTranscript('Служба безопасности банка. Срочно назовите SMS код и переведите деньги на безопасный счет.')

    expect(result.level).toBe('critical')
    expect(result.score).toBeGreaterThanOrEqual(85)
  })

  it('keeps ordinary reminders safe', () => {
    const result = scoreTranscript('Здравствуйте, напоминаем о записи в клинику завтра утром.')

    expect(result.level).toBe('safe')
    expect(result.score).toBe(0)
  })
})
