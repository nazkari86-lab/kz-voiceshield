import { SecureStorage } from '../bridge/SecureStorageBridge'

const KEY = 'voiceshield.incoming-call-history.v1'
const MAX_ENTRIES = 100

export type IncomingCallEntry = {
  id: string
  ts: number
  maskedNumber: string
  durationSeconds: number
  reason: string
  wangiri: boolean
  blocked: boolean
}

export async function getIncomingCallHistory(): Promise<IncomingCallEntry[]> {
  try {
    const raw = await SecureStorage.getItem(KEY)
    return raw ? JSON.parse(raw) as IncomingCallEntry[] : []
  } catch { return [] }
}

export async function saveIncomingCall(entry: Omit<IncomingCallEntry, 'id' | 'ts'>): Promise<void> {
  try {
    const next: IncomingCallEntry = { ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ts: Date.now() }
    const history = await getIncomingCallHistory()
    history.unshift(next)
    await SecureStorage.setItem(KEY, JSON.stringify(history.slice(0, MAX_ENTRIES)))
  } catch {}
}

export async function clearIncomingCallHistory(): Promise<void> {
  await SecureStorage.removeItem(KEY)
}
