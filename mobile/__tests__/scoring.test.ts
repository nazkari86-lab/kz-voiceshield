import { analyzeTranscript, callSignalsFromVerification, deviceSignalsFromPackage, notificationSignalsFromId, phoneReputationSignals, redactSensitiveText, serializeCase, type SavedCase } from '../src/scoring'

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

  it('maps call and notification metadata without raw values', () => {
    expect(callSignalsFromVerification('failed')[0]?.id).toBe('caller_verification_failed')
    expect(notificationSignalsFromId('otp_notification')[0]?.id).toBe('otp_notification')
    expect(phoneReputationSignals(86)[0]?.id).toBe('caller_reputation_high')
    expect(phoneReputationSignals(40)).toEqual([])
  })

  it('shows high phone reputation risk before a transcript exists', () => {
    const result = analyzeTranscript('', { signals: phoneReputationSignals(86) })
    expect(result.score).toBe(86)
    expect(result.risk).toBe('critical')
  })

  it('redacts codes and long numbers before storage', () => {
    const value = redactSensitiveText('SMS код 123456, ИИН 990101123456, карта 4400 1234 5678 9012')
    expect(value).not.toContain('123456')
    expect(value).not.toContain('990101123456')
    expect(value).not.toContain('4400 1234 5678 9012')
  })

  it('redacts transcript correction provenance during dataset export', () => {
    const transcript = 'Назовите код 123456'
    const analysis = analyzeTranscript(transcript)
    const item = {
      id: analysis.caseId,
      createdAt: '2026-07-15T00:00:00Z',
      updatedAt: '2026-07-15T00:00:00Z',
      fileName: 'call.txt',
      transcript,
      normalizedTranscript: transcript,
      transcriptDerivation: {
        source: 'ksc2_language_pack',
        packVersion: '1.0.0',
        dominantLanguage: 'ru',
        lexiconCoverage: 0.8,
        corrections: [{ original: transcript, replacement: transcript, confidence: 1, applied: true, source: 'normalization' }],
      },
      provenance: { origin: 'live', trusted: false },
      label: 'unreviewed',
      status: 'new',
      assignedTo: 'Triage',
      flags: { bankContactNeeded: false, customerCallbackNeeded: false, evidenceBundleReady: true },
      analystNote: '',
      decisionHistory: [],
      auditLog: [],
      incidentTimeline: [],
      analysis,
    } satisfies SavedCase

    const exported = JSON.stringify(serializeCase(item))
    expect(exported).not.toContain('123456')
    expect(exported).toContain('[REDACTED]')
  })
})
