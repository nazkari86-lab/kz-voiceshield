import AsyncStorage from '@react-native-async-storage/async-storage'
import { SecureStorage } from '@bridge/SecureStorageBridge'

const KEY = 'voiceshield.transcript-history.v1'
const MAX_ENTRIES = 30

export type TranscriptEntry = {
  id: string
  ts: number
  transcript: string
  score: number
  risk: string
  schemeLabel: string
  durationSec: number
}

async function readHistory(): Promise<TranscriptEntry[]> {
  const encrypted = await SecureStorage.getItem(KEY)
  if (encrypted) return JSON.parse(encrypted) as TranscriptEntry[]

  // Migrate old plaintext history only after the encrypted write succeeds.
  const legacy = await AsyncStorage.getItem(KEY)
  if (!legacy) return []
  const parsed = JSON.parse(legacy) as TranscriptEntry[]
  await SecureStorage.setItem(KEY, JSON.stringify(parsed))
  await AsyncStorage.removeItem(KEY)
  return parsed
}

async function writeHistory(entries: TranscriptEntry[]): Promise<void> {
  await SecureStorage.setItem(KEY, JSON.stringify(entries))
  await AsyncStorage.removeItem(KEY)
}

export async function saveTranscriptEntry(entry: Omit<TranscriptEntry, 'id'>): Promise<void> {
  try {
    const list = await readHistory()
    const newEntry: TranscriptEntry = { ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }
    list.unshift(newEntry)
    if (list.length > MAX_ENTRIES) list.length = MAX_ENTRIES
    await writeHistory(list)
  } catch {}
}

export async function getTranscriptHistory(): Promise<TranscriptEntry[]> {
  try {
    return await readHistory()
  } catch {
    return []
  }
}

export async function deleteTranscriptEntry(id: string): Promise<void> {
  try {
    const list = await readHistory()
    await writeHistory(list.filter(e => e.id !== id))
  } catch {}
}

export async function clearTranscriptHistory(): Promise<void> {
  await Promise.all([
    SecureStorage.removeItem(KEY),
    AsyncStorage.removeItem(KEY),
  ])
}
