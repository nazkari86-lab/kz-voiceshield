export type ScamEntry = {
  id: string
  pattern: string
  matchType: 'prefix' | 'exact' | 'contains'
  reason: string
  risk: 'critical' | 'high' | 'medium'
  source: string
  verifiedAt: string
}

// Known fraud patterns for KZ/RU. Prefixes and patterns, not a denylist of real
// subscriber numbers (those change too fast). Updated per-release.
export const scamPatterns: ScamEntry[] = [
  // Premium-rate / charged number prefixes (KZ)
  { id: 'kz-premium-809', pattern: '+7809', matchType: 'prefix', reason: 'KZ premium-rate number prefix — calls are billed at high rate', risk: 'high', source: 'МЦРИАП РК', verifiedAt: '2026-07-13' },
  { id: 'kz-premium-890', pattern: '+7890', matchType: 'prefix', reason: 'KZ paid-service number prefix frequently used for fraud callbacks', risk: 'high', source: 'МЦРИАП РК', verifiedAt: '2026-07-13' },
  // Spoofed short codes — scammers spoof Kaspi/Halyk short codes from different numbers
  { id: 'spoof-kaspi', pattern: '9999', matchType: 'exact', reason: 'Official Kaspi Bank number — verify caller is actually Kaspi (they never ask for OTP)', risk: 'medium', source: 'Kaspi Guide', verifiedAt: '2026-07-13' },
  { id: 'spoof-halyk', pattern: '7111', matchType: 'exact', reason: 'Official Halyk Bank number — frequently spoofed by scammers claiming account issues', risk: 'medium', source: 'Halyk contacts', verifiedAt: '2026-07-13' },
  // VOIP gateway prefixes used to fake local KZ numbers
  { id: 'intl-uk', pattern: '+44', matchType: 'prefix', reason: 'UK number — frequently used by VOIP scammers impersonating KZ banks', risk: 'medium', source: 'Community reports', verifiedAt: '2026-07-13' },
  { id: 'intl-us', pattern: '+1', matchType: 'prefix', reason: 'US/Canada number — used as VOIP gateway for impersonation calls to KZ', risk: 'medium', source: 'Community reports', verifiedAt: '2026-07-13' },
  { id: 'intl-ru', pattern: '+375', matchType: 'prefix', reason: 'Belarus number — used as routing hub for KZ-targeted VOIP fraud', risk: 'medium', source: 'Community reports', verifiedAt: '2026-07-13' },
  // Fake government/police numbers
  { id: 'fake-gov-102', pattern: '102', matchType: 'exact', reason: 'Official police number — verify through official eGov portal if call seems suspicious', risk: 'medium', source: 'MIA RK', verifiedAt: '2026-07-13' },
  // Zero-prefix international masking
  { id: 'zero-prefix', pattern: '+00', matchType: 'prefix', reason: 'Double-zero international prefix — non-standard, often spoofed caller ID', risk: 'high', source: 'Telecom analysis', verifiedAt: '2026-07-13' },
]

let remoteScamPatterns: ScamEntry[] = []

export function setRemoteScamPatterns(entries: ScamEntry[]): void {
  remoteScamPatterns = entries.slice(0, 500)
}

export function checkScamNumber(phone: string): ScamEntry | null {
  const normalized = phone.replace(/[\s\-()]/g, '')
  for (const entry of [...remoteScamPatterns, ...scamPatterns]) {
    if (entry.matchType === 'prefix' && normalized.startsWith(entry.pattern)) return entry
    if (entry.matchType === 'exact' && normalized === entry.pattern) return entry
    if (entry.matchType === 'contains' && normalized.includes(entry.pattern)) return entry
  }
  return null
}
