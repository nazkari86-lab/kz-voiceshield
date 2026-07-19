import { analyzeSms, scoreSms, smsFingerprint, smsRiskTier } from '../src/utils/smsRisk'

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

  it('classifies an ordinary known-bank notification without escalating it', () => {
    const result = analyzeSms('Kaspi: покупка на 12 500 ₸ одобрена. Спасибо за использование Kaspi.', 'Kaspi')

    expect(result.category).toBe('transaction')
    expect(result.knownSender).toBe('Kaspi')
    expect(result.likelyBenignNotification).toBe(true)
    expect(result.score).toBeLessThan(20)
  })

  it('extracts risky entities without retaining secret values', () => {
    const result = analyzeSms('Служба безопасности банка: срочно назовите код 123456 и переведите 50 000 тенге.')

    expect(result.category).toBe('fraud')
    expect(result.entities.map((entity) => entity.value)).not.toContain('123456')
    expect(result.entities.map((entity) => entity.type)).toEqual(expect.arrayContaining(['otp', 'amount', 'action', 'pressure']))
  })

  it('adds a fuzzy fraud pattern as supporting evidence only', () => {
    const result = analyzeSms('Срочно переведите деньги на безопасный счёт.')

    expect(result.fuzzyMatches).toEqual(expect.arrayContaining(['safe_account', 'urgent_transfer']))
    expect(result.score).toBeGreaterThanOrEqual(45)
  })

  it('normalizes the risk class and financial category', () => {
    const result = analyzeSms('Kaspi: срочно переведите деньги на безопасный счёт.')

    expect(result.riskClass).toBe('FRAUD')
    expect(result.severityColor).toBe('red')
    expect(result.financeCategory).toBe('transfer')
    expect(result.analysisSource).toBe('rules')
  })

  it('uses a content-free fingerprint for local feedback', () => {
    const fingerprint = smsFingerprint('Ваш код 123456', 'Kaspi')

    expect(fingerprint).toMatch(/^sms_[0-9a-f]+$/)
    expect(fingerprint).not.toContain('123456')
  })
})
