import { describe, expect, it } from 'vitest'
import { analyzeTranscript, buildEvidenceBundle, createWorkflowState, datasetQuality, datasetSchemaVersion, exportCsv, exportJsonl, exportSplitJson, samples } from './scoring'
import type { SavedCase } from './scoring'

const savedCase = (transcript: string): SavedCase => {
  const analysis = analyzeTranscript(transcript)
  const workflow = createWorkflowState(analysis, '2026-07-08T00:00:00.000Z', 'test-reviewer')
  return {
    id: analysis.caseId,
    createdAt: '2026-07-08T00:00:00.000Z',
    updatedAt: '2026-07-08T00:00:00.000Z',
    fileName: 'case.txt',
    transcript,
    label: 'true_positive',
    ...workflow,
    analystNote: 'reviewed',
    analysis,
  }
}

describe('scam scoring — safe input', () => {
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

  it('does not flag clinic reminder with safe phrases', () => {
    const result = analyzeTranscript(samples.safe)
    expect(result.score).toBe(0)
    expect(result.risk).toBe('low')
  })

  it('returns wordCount 0 for empty string', () => {
    expect(analyzeTranscript('').wordCount).toBe(0)
  })
})

describe('scam scoring — classic bank fraud', () => {
  it('flags bank cash-out and code extraction as critical', () => {
    const result = analyzeTranscript('Здравствуйте, это служба безопасности банка. На вас оформляют кредит. Срочно назовите SMS код и переведите деньги на безопасный счет.')
    expect(result.score).toBe(99)
    expect(result.risk).toBe('critical')
    expect(result.evidence.map((item) => item.id)).toEqual(expect.arrayContaining(['bank-security', 'otp-code', 'safe-account']))
  })

  it('applies combo bonus when otp-code and safe-account both match', () => {
    const withBoth = analyzeTranscript('Сотрудник банка. Назовите SMS код и переведите деньги на безопасный счет.')
    const withOtpOnly = analyzeTranscript('Назовите SMS код подтверждения пожалуйста.')
    expect(withBoth.score).toBeGreaterThan(withOtpOnly.score)
  })

  it('flags remote access with bank impersonation as critical', () => {
    const result = analyzeTranscript('Это служба безопасности банка. Скачайте AnyDesk для удаленного доступа, чтобы мы защитили ваш счет.')
    expect(result.risk).toBe('critical')
    expect(result.evidence.map((e) => e.id)).toEqual(expect.arrayContaining(['bank-security', 'remote-access']))
  })

  it('includes new KZ bank names in bank-security rule', () => {
    const r1 = analyzeTranscript('Это сотрудник Bereke Bank. Назовите SMS код и ИИН.')
    const r2 = analyzeTranscript('Forte Bank служба безопасности. Продиктуйте код подтверждения.')
    expect(r1.evidence.some((e) => e.id === 'bank-security')).toBe(true)
    expect(r2.evidence.some((e) => e.id === 'bank-security')).toBe(true)
  })
})

describe('scam scoring — AI voice and family scam', () => {
  it('flags AI voice family emergency pressure as critical', () => {
    const result = analyzeTranscript(samples.aiFamily)
    expect(result.score).toBe(99)
    expect(result.risk).toBe('critical')
    expect(result.evidence.map((item) => item.id)).toContain('ai-family')
  })

  it('single family word without pressure does not trigger', () => {
    const result = analyzeTranscript('Апа, как ты?')
    expect(result.score).toBe(0)
  })
})

describe('scam scoring — reverse vishing', () => {
  it('flags reverse-vishing setup calls as critical when OTP extraction appears', () => {
    const result = analyzeTranscript('Вы сами позвонили на официальный номер, поэтому операция безопасна. Теперь продиктуйте SMS код для отмены кредита.')
    expect(result.score).toBe(99)
    expect(result.risk).toBe('critical')
    expect(result.evidence.map((item) => item.id)).toEqual(expect.arrayContaining(['victim-called', 'otp-code']))
  })
})

describe('scam scoring — SIM swap (new rule)', () => {
  it('flags SIM swap + OTP extraction as critical', () => {
    const result = analyzeTranscript(samples.simSwap)
    expect(result.risk).toBe('critical')
    expect(result.evidence.map((e) => e.id)).toContain('sim-swap')
    expect(result.evidence.map((e) => e.id)).toContain('otp-code')
  })

  it('adds sim-swap checklist item to response', () => {
    const result = analyzeTranscript(samples.simSwap)
    expect(result.responseChecklist.some((item) => item.includes('mobile operator'))).toBe(true)
  })
})

describe('scam scoring — eGov/benefits fraud (new rule)', () => {
  it('flags eGov benefit extraction as high or critical', () => {
    const result = analyzeTranscript(samples.egovBenefits)
    expect(['high', 'critical']).toContain(result.risk)
    expect(result.evidence.map((e) => e.id)).toContain('egov-benefits')
  })

  it('adds egov checklist item', () => {
    const result = analyzeTranscript(samples.egovBenefits)
    expect(result.responseChecklist.some((item) => item.includes('egov.kz'))).toBe(true)
  })
})

describe('scam scoring — Kaspi QR fraud (new rule)', () => {
  it('flags Kaspi QR + safe-account as high risk', () => {
    const result = analyzeTranscript('Скину Kaspi QR код на каспи кошелек. Переведите деньги на Kaspi Gold.')
    expect(['high', 'critical']).toContain(result.risk)
    expect(result.evidence.map((e) => e.id)).toContain('kaspi-qr')
  })
})

describe('scam scoring — job scam (new rule)', () => {
  it('flags fake job offer with upfront payment', () => {
    const result = analyzeTranscript(samples.jobScam)
    expect(['medium', 'high', 'critical']).toContain(result.risk)
    expect(result.evidence.map((e) => e.id)).toContain('job-scam')
  })

  it('single "работа на дому" without payment demand does not trigger', () => {
    const result = analyzeTranscript('Ищу работу на дому.')
    expect(result.evidence.some((e) => e.id === 'job-scam')).toBe(false)
  })
})

describe('scam scoring — investment and delivery', () => {
  it('flags investment scam', () => {
    const result = analyzeTranscript(samples.investment)
    expect(['high', 'critical']).toContain(result.risk)
    expect(result.evidence.map((e) => e.id)).toContain('investment-crypto')
  })

  it('flags delivery customs scam', () => {
    const result = analyzeTranscript(samples.courier)
    expect(['high', 'critical']).toContain(result.risk)
    expect(result.evidence.map((e) => e.id)).toContain('delivery-customs')
  })
})

describe('scam scoring — messenger takeover', () => {
  it('flags WhatsApp account takeover', () => {
    const result = analyzeTranscript(samples.whatsapp)
    expect(['high', 'critical']).toContain(result.risk)
    expect(result.evidence.map((e) => e.id)).toContain('messenger-takeover')
  })
})

describe('scam scoring — law enforcement intimidation', () => {
  it('flags КНБ with urgency as medium or higher', () => {
    const result = analyzeTranscript('КНБ. По вашему делу возбуждено уголовное дело. Срочно не кладите трубку.')
    expect(['medium', 'high', 'critical']).toContain(result.risk)
    expect(result.evidence.map((e) => e.id)).toContain('law-enforcement')
  })
})

describe('scam scoring — short text penalty', () => {
  it('penalizes very short transcripts', () => {
    const shortResult = analyzeTranscript('SMS код')
    const longResult = analyzeTranscript('Это служба безопасности. Назовите SMS код подтверждения и ИИН для отмены перевода на безопасный счет.')
    expect(longResult.score).toBeGreaterThan(shortResult.score)
  })
})

describe('dataset exports', () => {
  it('exports JSONL and CSV with analyst labels and transcript text', () => {
    const cases = [savedCase(samples.bank)]
    expect(exportJsonl(cases)).toContain(`"schemaVersion":"${datasetSchemaVersion}"`)
    expect(exportJsonl(cases)).toContain('"label":"true_positive"')
    expect(exportJsonl(cases)).toContain('"status":"escalated"')
    expect(exportJsonl(cases)).toContain('"risk":"critical"')
    expect(exportCsv(cases)).toContain('"true_positive"')
    expect(exportCsv(cases)).toContain('служба безопасности банка')
  })

  it('reports dataset quality and exports deterministic train/dev/test splits', () => {
    const cases = [savedCase(samples.bank), savedCase(samples.bank), { ...savedCase(samples.safe), label: 'false_positive' as const }]
    const quality = datasetQuality(cases)
    const split = JSON.parse(exportSplitJson(cases)) as { schemaVersion: string; counts: { train: number; dev: number; test: number } }
    expect(quality.schemaVersion).toBe(datasetSchemaVersion)
    expect(quality.duplicateGroups).toHaveLength(1)
    expect(quality.falsePositiveReview).toHaveLength(0)
    expect(split.schemaVersion).toBe(datasetSchemaVersion)
    expect(split.counts.train + split.counts.dev + split.counts.test).toBe(cases.length)
  })

  it('builds an evidence bundle with workflow flags and audit history', () => {
    const bundle = buildEvidenceBundle(savedCase(samples.bank))
    expect(bundle).toContain('KZ VoiceShield Evidence Bundle')
    expect(bundle).toContain('Bank contact needed: yes')
    expect(bundle).toContain('Audit log:')
    expect(bundle).toContain('Transcript:')
  })

  it('new sample transcripts export correctly', () => {
    const cases = [savedCase(samples.simSwap), savedCase(samples.egovBenefits), savedCase(samples.jobScam)]
    const jsonl = exportJsonl(cases)
    expect(jsonl.split('\n')).toHaveLength(3)
    expect(jsonl).toContain('sim-swap')
    expect(jsonl).toContain('egov-benefits')
  })

  it('dataset quality tracks all label types', () => {
    const cases = [
      { ...savedCase(samples.bank), label: 'true_positive' as const },
      { ...savedCase(samples.safe), label: 'false_positive' as const },
      { ...savedCase(samples.aiFamily), label: 'needs_review' as const },
      { ...savedCase(samples.courier), label: 'unreviewed' as const },
    ]
    const quality = datasetQuality(cases)
    expect(quality.labelBalance.true_positive).toBe(1)
    expect(quality.labelBalance.false_positive).toBe(1)
    expect(quality.labelBalance.needs_review).toBe(1)
    expect(quality.unlabeledCount).toBe(1)
    expect(quality.total).toBe(4)
  })
})
