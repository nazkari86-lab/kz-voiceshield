// Cross-call memory: stores anonymized fingerprints of recent call sessions.
// If the same scam pattern appears in 2+ calls within 24h, base risk is elevated.

import AsyncStorage from '@react-native-async-storage/async-storage'

const MEMORY_KEY = 'voiceshield.call-memory.v1'
const MAX_ENTRIES = 20
const WINDOW_MS = 24 * 60 * 60 * 1000

export type CallFingerprint = {
  ts: number
  matchedRuleIds: string[]
  score: number
  schemeLabel: string
}

async function load(): Promise<CallFingerprint[]> {
  try {
    const raw = await AsyncStorage.getItem(MEMORY_KEY)
    if (!raw) return []
    return JSON.parse(raw) as CallFingerprint[]
  } catch {
    return []
  }
}

async function save(entries: CallFingerprint[]) {
  try {
    await AsyncStorage.setItem(MEMORY_KEY, JSON.stringify(entries))
  } catch {
    // non-fatal
  }
}

export async function recordCall(fp: Omit<CallFingerprint, 'ts'>) {
  const entries = await load()
  const next: CallFingerprint[] = [{ ...fp, ts: Date.now() }, ...entries].slice(0, MAX_ENTRIES)
  await save(next)
}

export async function getRepeatRiskBonus(): Promise<{ bonus: number; reason: string | null }> {
  const entries = await load()
  const cutoff = Date.now() - WINDOW_MS
  const recent = entries.filter((e) => e.ts > cutoff && e.score >= 40)
  if (recent.length < 2) return { bonus: 0, reason: null }
  // Count scheme repeats
  const schemeCounts: Record<string, number> = {}
  for (const e of recent) {
    schemeCounts[e.schemeLabel] = (schemeCounts[e.schemeLabel] ?? 0) + 1
  }
  const maxRepeat = Math.max(...Object.values(schemeCounts))
  if (maxRepeat < 2) return { bonus: 0, reason: null }
  const repeatScheme = Object.entries(schemeCounts).find(([, v]) => v === maxRepeat)?.[0] ?? ''
  const bonus = Math.min(15, maxRepeat * 5)
  return {
    bonus,
    reason: `Repeated call: the same "${repeatScheme}" pattern appeared ${maxRepeat} times in the last 24 hours.`,
  }
}

export async function clearCallMemory() {
  await AsyncStorage.removeItem(MEMORY_KEY)
}
