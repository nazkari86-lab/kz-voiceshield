import { describe, expect, it } from 'vitest'
import { analyzeTranscript, exportCsv, exportJsonl, samples } from './scoring'
import type { SavedCase } from './scoring'

const savedCase = (transcript: string): SavedCase => {
  const analysis = analyzeTranscript(transcript)
  return {
    id: analysis.caseId,
    createdAt: '2026-07-08T00:00:00.000Z',
    updatedAt: '2026-07-08T00:00:00.000Z',
    fileName: 'case.txt',
    transcript,
    label: 'true_positive',
    analystNote: 'reviewed',
    analysis,
  }
}

describe('scam scoring', () => {
  it('keeps empty and ordinary text at zero risk', () => {
    expect(analyzeTranscript('').score).toBe(0)
    expect(analyzeTranscript('a').score).toBe(0)
    expect(analyzeTranscript('Здравствуйте, я хочу узнать график работы офиса завтра.').score).toBe(0)
  })

  it('does not flag defensive warnings as scam attempts', () => {
    const result = analyzeTranscript('Никому не сообщайте SMS код, PIN или CVV. Проверяйте номер банка только через официальное приложение.')

    expect(result.score).toBe(0)
    expect(result.risk).toBe('low')
    expect(result.evidence).toHaveLength(0)
  })

  it('flags bank cash-out and code extraction as critical', () => {
    const result = analyzeTranscript('Здравствуйте, это служба безопасности банка. На вас оформляют кредит. Срочно назовите SMS код и переведите деньги на безопасный счет.')

    expect(result.score).toBe(99)
    expect(result.risk).toBe('critical')
    expect(result.evidence.map((item) => item.id)).toEqual(expect.arrayContaining(['bank-security', 'otp-code', 'safe-account']))
  })

  it('flags AI voice family emergency pressure as critical', () => {
    const result = analyzeTranscript(samples.aiFamily)

    expect(result.score).toBe(99)
    expect(result.risk).toBe('critical')
    expect(result.evidence.map((item) => item.id)).toContain('ai-family')
  })

  it('flags reverse-vishing setup calls as critical when OTP extraction appears', () => {
    const result = analyzeTranscript('Вы сами позвонили на официальный номер, поэтому операция безопасна. Теперь продиктуйте SMS код для отмены кредита.')

    expect(result.score).toBe(99)
    expect(result.risk).toBe('critical')
    expect(result.evidence.map((item) => item.id)).toEqual(expect.arrayContaining(['victim-called', 'otp-code']))
  })
})

describe('dataset exports', () => {
  it('exports JSONL and CSV with analyst labels and transcript text', () => {
    const cases = [savedCase(samples.bank)]

    expect(exportJsonl(cases)).toContain('"label":"true_positive"')
    expect(exportJsonl(cases)).toContain('"risk":"critical"')
    expect(exportCsv(cases)).toContain('"true_positive"')
    expect(exportCsv(cases)).toContain('служба безопасности банка')
  })
})
