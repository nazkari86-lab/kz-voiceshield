import { analyzeTranscript, type SavedCase } from '../src/scoring'
import { buildDonationReadiness, exportDonationJsonl } from '../src/utils/donationLab'

function makeCase(id: string, transcript: string, label: SavedCase['label']): SavedCase {
  const now = '2026-07-18T12:00:00.000Z'
  const analysis = analyzeTranscript(transcript)
  return {
    id,
    createdAt: now,
    updatedAt: now,
    fileName: `${id}.txt`,
    transcript,
    normalizedTranscript: transcript,
    provenance: { origin: 'live', trusted: label !== 'unreviewed', reviewedAt: label !== 'unreviewed' ? now : undefined },
    label,
    status: 'reviewing',
    assignedTo: 'reviewer',
    flags: {
      bankContactNeeded: false,
      evidenceBundleReady: false,
      customerCallbackNeeded: false,
    },
    analystNote: '',
    decisionHistory: [],
    auditLog: [],
    incidentTimeline: [],
    analysis,
  }
}

describe('donation lab', () => {
  it('exports only reviewed, redacted quarantine rows', () => {
    const cases = [
      makeCase('fraud', 'SMS код 123456, ИИН 990101123456, карта 4400 1234 5678 9012. Срочно переведите деньги.', 'true_positive'),
      makeCase('draft', 'Не размеченный разговор 777777', 'unreviewed'),
    ]

    const jsonl = exportDonationJsonl(cases)
    expect(jsonl).toContain('"schemaVersion":"voiceshield.donation.v1"')
    expect(jsonl).toContain('"label":"fraud"')
    expect(jsonl).not.toContain('123456')
    expect(jsonl).not.toContain('990101123456')
    expect(jsonl).not.toContain('4400 1234 5678 9012')
    expect(jsonl).not.toContain('"caseId":"draft"')
    expect(jsonl).toContain('"rawAudioIncluded":false')
    expect(jsonl).toContain('"automaticUpload":false')
  })

  it('reports readiness and label balance for opt-in improvement', () => {
    const readiness = buildDonationReadiness([
      makeCase('fraud', 'Назовите код из SMS 123456', 'true_positive'),
      makeCase('safe', 'Я сам звоню в банк уточнить лимит', 'false_positive'),
      makeCase('review', 'Странный звонок требует проверки', 'needs_review'),
      makeCase('unreviewed', 'Черновик', 'unreviewed'),
    ])

    expect(readiness.eligibleCases).toBe(3)
    expect(readiness.unreviewedCases).toBe(1)
    expect(readiness.labelBalance).toMatchObject({ fraud: 1, needs_review: 1, safe: 1 })
    expect(readiness.warnings).toContain('Less than 30 reviewed examples: useful for review, not enough for training.')
  })
})
