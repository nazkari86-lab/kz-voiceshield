import { checkScamNumber, type ScamEntry } from '../data/scamNumbers'
import { findVerifiedBusiness, type VerifiedBusiness } from '../data/verifiedBusinesses'

export type NumberReputation = {
  status: 'known_risk' | 'verified_identifier' | 'unknown'
  scamMatch: ScamEntry | null
  verifiedBusiness: VerifiedBusiness | null
  spoofingWarning: boolean
}

export function getNumberReputation(phone: string): NumberReputation {
  const scamMatch = checkScamNumber(phone)
  const verifiedBusiness = findVerifiedBusiness(phone)
  return { status: scamMatch ? 'known_risk' : verifiedBusiness ? 'verified_identifier' : 'unknown', scamMatch, verifiedBusiness, spoofingWarning: Boolean(verifiedBusiness) }
}
