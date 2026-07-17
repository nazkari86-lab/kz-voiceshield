import { SecureStorage } from '../bridge/SecureStorageBridge'

const CLOUD_USAGE_KEY = 'voiceshield.cloud-token-usage.v1'
export const DAILY_CLOUD_TOKEN_LIMIT = 40_000

type CloudUsage = { date: string; usedTokens: number }

const today = () => new Date().toISOString().slice(0, 10)

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.trim().length / 4))
}

export function normalizeCloudUsage(raw: string | null): CloudUsage {
  try {
    const value: unknown = raw ? JSON.parse(raw) : null
    if (value && typeof value === 'object') {
      const record = value as Partial<CloudUsage>
      if (record.date === today() && typeof record.usedTokens === 'number' && record.usedTokens >= 0) return { date: record.date, usedTokens: Math.floor(record.usedTokens) }
    }
  } catch {
    // Reset an unreadable local counter rather than blocking a chat request.
  }
  return { date: today(), usedTokens: 0 }
}

export async function getCloudUsage(): Promise<CloudUsage> {
  return normalizeCloudUsage(await SecureStorage.getItem(CLOUD_USAGE_KEY))
}

export async function recordCloudUsage(tokens: number): Promise<CloudUsage> {
  const current = await getCloudUsage()
  const next = { date: today(), usedTokens: current.usedTokens + Math.max(0, Math.floor(tokens)) }
  await SecureStorage.setItem(CLOUD_USAGE_KEY, JSON.stringify(next))
  return next
}

export function canUseCloud(usage: CloudUsage, estimatedRequestTokens: number): boolean {
  return usage.usedTokens + estimatedRequestTokens <= DAILY_CLOUD_TOKEN_LIMIT
}
