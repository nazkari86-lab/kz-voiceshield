import { analyzeTranscript, deviceSignalsFromPackage } from '../src/scoring'

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

  it('uses an active banking app only to amplify an already suspicious call', () => {
    const signals = deviceSignalsFromPackage('kz.kaspi.mobile')
    const safe = analyzeTranscript('Здравствуйте, напоминаем о записи в клинику завтра утром.', { signals })
    const suspicious = analyzeTranscript('Служба безопасности банка. Назовите SMS код и переведите деньги на безопасный счет.', { signals })

    expect(safe.score).toBe(0)
    expect(suspicious.contextSignals.map((signal) => signal.id)).toContain('bank_app_open')
    expect(suspicious.scheme).toBe('fake_bank_employee')
  })

  it('recognizes remote-access app packages without reading their content', () => {
    expect(deviceSignalsFromPackage('com.anydesk.anydeskandroid')[0]?.id).toBe('remote_access_app_open')
  })
})
