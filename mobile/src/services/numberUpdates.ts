import { SecureStorage } from '../bridge/SecureStorageBridge'
import { getBackendConfig } from './backendConfig'
import { decodeBase64, encodeUtf8, isNewerVersion } from './seedUpdates'
import { setRemoteScamPatterns, type ScamEntry } from '../data/scamNumbers'
import { VOICESHIELD_OTA_PUBLIC_KEY_B64 } from '../config/otaPublicKey'
import { verify } from '@noble/ed25519'

const KEY = 'voiceshield.number-feed.v1'
const MAX_BYTES = 256 * 1024
type NumberFeed = { schemaVersion: 'voiceshield.number-feed.v1'; version: string; publishedAt: string; entries: ScamEntry[]; signature: string }

const canonical = (feed: Omit<NumberFeed, 'signature'>) => JSON.stringify({ schemaVersion: feed.schemaVersion, version: feed.version, publishedAt: feed.publishedAt, entries: feed.entries })
const validEntry = (entry: unknown): entry is ScamEntry => {
  if (!entry || typeof entry !== 'object') return false
  const value = entry as Record<string, unknown>
  return typeof value.id === 'string' && typeof value.pattern === 'string' && ['prefix', 'exact', 'contains'].includes(String(value.matchType)) && typeof value.reason === 'string' && ['critical', 'high', 'medium'].includes(String(value.risk)) && typeof value.source === 'string' && typeof value.verifiedAt === 'string'
}

export async function loadStoredNumberFeed(): Promise<void> {
  try {
    const raw = await SecureStorage.getItem(KEY)
    if (!raw) return
    const feed = JSON.parse(raw) as NumberFeed
    if (Array.isArray(feed.entries) && feed.entries.every(validEntry)) setRemoteScamPatterns(feed.entries)
  } catch {}
}

export async function refreshNumberFeed(currentVersion = '0.0.0'): Promise<{ updated: boolean; version?: string }> {
  const config = await getBackendConfig()
  if (!config.baseUrl.startsWith('https://')) throw new Error('Number feed updates require an HTTPS backend')
  const response = await fetch(`${config.baseUrl}/api/number-feed/kz`, { headers: config.token ? { Authorization: `Bearer ${config.token}` } : undefined })
  if (!response.ok) throw new Error(`Number feed server responded with ${response.status}`)
  const raw = await response.text()
  if (encodeUtf8(raw).byteLength > MAX_BYTES) throw new Error('Number feed is too large')
  const feed = JSON.parse(raw) as NumberFeed
  if (feed.schemaVersion !== 'voiceshield.number-feed.v1' || !Array.isArray(feed.entries) || feed.entries.length > 500 || !feed.signature || !feed.entries.every(validEntry)) throw new Error('Invalid number feed')
  const unsigned = { schemaVersion: feed.schemaVersion, version: feed.version, publishedAt: feed.publishedAt, entries: feed.entries }
  if (!(await verify(decodeBase64(feed.signature), encodeUtf8(canonical(unsigned)), decodeBase64(VOICESHIELD_OTA_PUBLIC_KEY_B64)))) throw new Error('Number feed signature is invalid')
  if (!isNewerVersion(feed.version, currentVersion)) return { updated: false, version: currentVersion }
  await SecureStorage.setItem(KEY, JSON.stringify(feed))
  setRemoteScamPatterns(feed.entries)
  return { updated: true, version: feed.version }
}
