import AsyncStorage from '@react-native-async-storage/async-storage'
import type { SmsAnalysis } from '../utils/smsRisk'

const STORAGE_KEY = 'voiceshield.sms.analysis-cache.v1'
const TTL_MS = 7 * 24 * 60 * 60 * 1000
type CacheEntry = { savedAt: number; analysis: SmsAnalysis }
type CacheMap = Record<string, CacheEntry>

async function readCache(): Promise<CacheMap> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as CacheMap
  } catch {
    return {}
  }
}

export async function getCachedSmsAnalysis(fingerprint: string): Promise<SmsAnalysis | null> {
  const cache = await readCache()
  const entry = cache[fingerprint]
  if (!entry || !Number.isFinite(entry.savedAt) || Date.now() - entry.savedAt > TTL_MS) return null
  return entry.analysis
}

export async function cacheSmsAnalysis(fingerprint: string, analysis: SmsAnalysis): Promise<void> {
  const cache = await readCache()
  const freshEntries = Object.fromEntries(Object.entries(cache).filter(([, entry]) => Number.isFinite(entry.savedAt) && Date.now() - entry.savedAt <= TTL_MS))
  freshEntries[fingerprint] = { savedAt: Date.now(), analysis }
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(freshEntries))
}

export async function clearSmsAnalysisCache(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY)
}
