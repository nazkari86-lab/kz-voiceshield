import AsyncStorage from '@react-native-async-storage/async-storage'

const KEY = 'voiceshield.call-stats.v1'

export type CallStats = { blocked: number; rejected: number; feedbackHelpful: number; feedbackNotHelpful: number }
const empty: CallStats = { blocked: 0, rejected: 0, feedbackHelpful: 0, feedbackNotHelpful: 0 }

export async function readCallStats(): Promise<CallStats> {
  try { const raw = await AsyncStorage.getItem(KEY); return { ...empty, ...(raw ? JSON.parse(raw) as Partial<CallStats> : {}) } } catch { return { ...empty } }
}
async function update(patch: Partial<CallStats>): Promise<CallStats> { const next = { ...(await readCallStats()), ...patch }; await AsyncStorage.setItem(KEY, JSON.stringify(next)); return next }
export async function recordBlockedCall(): Promise<CallStats> { const current = await readCallStats(); return update({ blocked: current.blocked + 1, rejected: current.rejected + 1 }) }
export async function recordCallFeedback(helpful: boolean): Promise<CallStats> { const current = await readCallStats(); return update({ feedbackHelpful: current.feedbackHelpful + (helpful ? 1 : 0), feedbackNotHelpful: current.feedbackNotHelpful + (helpful ? 0 : 1) }) }
