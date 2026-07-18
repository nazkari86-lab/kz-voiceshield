import { datasetSchemaVersion, redactSensitiveText, type CaseLabel, type SavedCase } from '@scoring'

export const donationSchemaVersion = 'voiceshield.donation.v1'

type RedactionCounts = {
  cardOrLongNumber: number
  codeOrIdentity: number
  genericNumber: number
}

export type DonationLabel = 'fraud' | 'safe' | 'needs_review'

export type DonationRecord = {
  schemaVersion: typeof donationSchemaVersion
  sourceDatasetSchema: typeof datasetSchemaVersion
  caseId: string
  createdAt: string
  updatedAt: string
  label: DonationLabel
  reviewerLabel: CaseLabel
  provenance: {
    origin: SavedCase['provenance']['origin']
    trusted: boolean
    reviewedAt?: string
  }
  analysis: {
    risk: SavedCase['analysis']['risk']
    score: number
    confidence: number
    schemeLabel: string
    evidence: Array<{ id: string; severity: string; stage: string; title: string }>
  }
  language: {
    dominant: SavedCase['transcriptDerivation'] extends undefined ? 'unknown' : string
    normalizedAvailable: boolean
  }
  text: {
    transcript: string
    normalizedTranscript?: string
    redactionCounts: RedactionCounts
  }
  privacy: {
    rawAudioIncluded: false
    rawPhoneIncluded: false
    automaticUpload: false
    requiresReviewerQuarantine: true
  }
}

export type DonationReadiness = {
  totalCases: number
  eligibleCases: number
  unreviewedCases: number
  trustedEligibleCases: number
  labelBalance: Record<DonationLabel, number>
  redactionTotals: RedactionCounts
  warnings: string[]
}

const emptyRedactions = (): RedactionCounts => ({ cardOrLongNumber: 0, codeOrIdentity: 0, genericNumber: 0 })

function mapDonationLabel(label: CaseLabel): DonationLabel | null {
  if (label === 'true_positive') return 'fraud'
  if (label === 'false_positive') return 'safe'
  if (label === 'needs_review') return 'needs_review'
  return null
}

function countRedactions(text: string): RedactionCounts {
  return {
    cardOrLongNumber: (text.match(/\b(?:\d[ -]?){12,19}\b/gu) ?? []).length,
    codeOrIdentity: (text.match(/(?:sms|смс|код|otp|pin|cvv|пароль|иин|жсн)[^\p{L}\p{N}]{0,16}\d{3,12}\b/giu) ?? []).length,
    genericNumber: (text.match(/\b\d{4,11}\b/gu) ?? []).length,
  }
}

function addRedactions(a: RedactionCounts, b: RedactionCounts): RedactionCounts {
  return {
    cardOrLongNumber: a.cardOrLongNumber + b.cardOrLongNumber,
    codeOrIdentity: a.codeOrIdentity + b.codeOrIdentity,
    genericNumber: a.genericNumber + b.genericNumber,
  }
}

export function buildDonationRecord(item: SavedCase): DonationRecord | null {
  const label = mapDonationLabel(item.label)
  if (!label) return null
  const rawText = `${item.transcript}\n${item.normalizedTranscript ?? ''}`
  const redactionCounts = countRedactions(rawText)
  const transcript = redactSensitiveText(item.transcript)
  const normalizedTranscript = item.normalizedTranscript ? redactSensitiveText(item.normalizedTranscript) : undefined
  return {
    schemaVersion: donationSchemaVersion,
    sourceDatasetSchema: datasetSchemaVersion,
    caseId: item.id,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    label,
    reviewerLabel: item.label,
    provenance: {
      origin: item.provenance.origin,
      trusted: item.provenance.trusted,
      reviewedAt: item.provenance.reviewedAt,
    },
    analysis: {
      risk: item.analysis.risk,
      score: item.analysis.score,
      confidence: item.analysis.confidence,
      schemeLabel: item.analysis.schemeLabel,
      evidence: item.analysis.evidence.map((evidence) => ({
        id: evidence.id,
        severity: evidence.severity,
        stage: evidence.stage,
        title: evidence.title,
      })),
    },
    language: {
      dominant: item.transcriptDerivation?.dominantLanguage ?? 'unknown',
      normalizedAvailable: Boolean(normalizedTranscript && normalizedTranscript !== transcript),
    },
    text: {
      transcript,
      normalizedTranscript,
      redactionCounts,
    },
    privacy: {
      rawAudioIncluded: false,
      rawPhoneIncluded: false,
      automaticUpload: false,
      requiresReviewerQuarantine: true,
    },
  }
}

export function buildDonationReadiness(cases: SavedCase[]): DonationReadiness {
  const records = cases.map(buildDonationRecord).filter((item): item is DonationRecord => Boolean(item))
  const labelBalance = records.reduce<Record<DonationLabel, number>>(
    (totals, item) => ({ ...totals, [item.label]: totals[item.label] + 1 }),
    { fraud: 0, needs_review: 0, safe: 0 },
  )
  const redactionTotals = records.reduce((totals, item) => addRedactions(totals, item.text.redactionCounts), emptyRedactions())
  const warnings = [
    records.length === 0 ? 'No reviewed cases are ready for opt-in donation.' : '',
    labelBalance.fraud === 0 ? 'No confirmed fraud examples yet.' : '',
    labelBalance.safe === 0 ? 'No false-positive or safe examples yet.' : '',
    records.length > 0 && records.length < 30 ? 'Less than 30 reviewed examples: useful for review, not enough for training.' : '',
  ].filter(Boolean)
  return {
    totalCases: cases.length,
    eligibleCases: records.length,
    unreviewedCases: cases.filter((item) => item.label === 'unreviewed').length,
    trustedEligibleCases: records.filter((item) => item.provenance.trusted).length,
    labelBalance,
    redactionTotals,
    warnings,
  }
}

export function exportDonationJsonl(cases: SavedCase[]): string {
  return cases
    .map(buildDonationRecord)
    .filter((item): item is DonationRecord => Boolean(item))
    .map((item) => JSON.stringify(item))
    .join('\n')
}
