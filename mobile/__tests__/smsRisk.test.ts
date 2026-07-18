import { scoreSms, smsRiskTier } from '../src/utils/smsRisk'

describe('SMS risk scoring', () => {
  it('does not flag an ordinary one-time bank code without a request to disclose it', () => {
    const result = scoreSms('Kaspi: код для входа 123456. Никому не сообщайте этот код.')

    expect(result).toEqual({ score: 0, reasons: [] })
    expect(smsRiskTier(result.score)).toBe('safe')
  })

  it('escalates an impersonated bank request for an SMS code', () => {
    const result = scoreSms('Служба безопасности банка. Срочно назовите код из SMS, иначе карта будет заблокирована.')

    expect(result.score).toBeGreaterThanOrEqual(75)
    expect(smsRiskTier(result.score)).toBe('critical')
    expect(result.reasons).toContain('claims authority while requesting a risky action')
  })

  it('escalates remote-access installation requests in Kazakh', () => {
    const result = scoreSms('Шұғыл: қауіпсіздік үшін қосымша орнатыңыз және кодты айтыңыз.')

    expect(result.score).toBeGreaterThanOrEqual(75)
  })

  it('flags shortened links combined with urgent refund bait', () => {
    const result = scoreSms('Срочно получите компенсацию сегодня: https://bit.ly/kaspi-refund')

    expect(result.score).toBeGreaterThanOrEqual(20)
    expect(result.reasons).toContain('uses a shortened link')
    expect(result.reasons).toContain('uses prize, refund, or compensation bait')
  })

  it('flags direct APK downloads in messages', () => {
    const result = scoreSms('Установите обновление банка сейчас: https://secure-example.kz/update.apk')

    expect(result.score).toBeGreaterThanOrEqual(45)
    expect(result.reasons).toContain('links directly to an installable or executable file')
  })
})
