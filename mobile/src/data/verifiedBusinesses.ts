export type VerifiedBusiness = {
  id: string
  name: string
  country: 'KZ'
  pattern: string
  matchType: 'exact' | 'prefix'
  channel: string
  verifiedAt: string
}

// A known identifier is not proof of caller authenticity: caller ID can be spoofed.
export const verifiedKzBusinesses: VerifiedBusiness[] = [
  { id: 'kaspi-9999', name: 'Kaspi', country: 'KZ', pattern: '9999', matchType: 'exact', channel: 'kaspi.kz', verifiedAt: '2026-07-19' },
  { id: 'halyk-7111', name: 'Halyk', country: 'KZ', pattern: '7111', matchType: 'exact', channel: 'halykbank.kz', verifiedAt: '2026-07-19' },
  { id: 'egov-1414', name: 'eGov', country: 'KZ', pattern: '1414', matchType: 'exact', channel: 'egov.kz', verifiedAt: '2026-07-19' },
  { id: 'beeline-116', name: 'Beeline', country: 'KZ', pattern: '116', matchType: 'exact', channel: 'beeline.kz', verifiedAt: '2026-07-19' },
  { id: 'kcell-9090', name: 'Kcell', country: 'KZ', pattern: '9090', matchType: 'exact', channel: 'kcell.kz', verifiedAt: '2026-07-19' },
  { id: 'tele2-611', name: 'Tele2', country: 'KZ', pattern: '611', matchType: 'exact', channel: 'tele2.kz', verifiedAt: '2026-07-19' },
]

export function findVerifiedBusiness(phone: string): VerifiedBusiness | null {
  const normalized = phone.replace(/[\s\-()+]/gu, '')
  return verifiedKzBusinesses.find((item) => item.matchType === 'exact' && normalized === item.pattern)
    ?? verifiedKzBusinesses.find((item) => item.matchType === 'prefix' && normalized.startsWith(item.pattern))
    ?? null
}
