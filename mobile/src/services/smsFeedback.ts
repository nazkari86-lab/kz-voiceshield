import AsyncStorage from '@react-native-async-storage/async-storage'
import type { SmsFeedback } from '../utils/smsRisk'

const STORAGE_KEY = 'voiceshield.sms.feedback.v1'
type FeedbackMap = Record<string, SmsFeedback>

async function readFeedback(): Promise<FeedbackMap> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => value === 'confirmed_fraud' || value === 'not_fraud')) as FeedbackMap
  } catch {
    return {}
  }
}

export async function getSmsFeedback(fingerprint: string): Promise<SmsFeedback | null> {
  return (await readFeedback())[fingerprint] ?? null
}

export async function saveSmsFeedback(fingerprint: string, feedback: SmsFeedback): Promise<void> {
  const next = await readFeedback()
  next[fingerprint] = feedback
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}

export async function clearSmsFeedback(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY)
}
