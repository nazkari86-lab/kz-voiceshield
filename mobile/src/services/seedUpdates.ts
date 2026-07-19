import { SecureStorage } from '../bridge/SecureStorageBridge'
import { getBackendConfig } from './backendConfig'
import { verify } from '@noble/ed25519'
import { VOICESHIELD_OTA_PUBLIC_KEY_B64 } from '../config/otaPublicKey'

const CANDIDATE_KEY = 'voiceshield.seed-update.candidate.v1'
const MAX_UPDATE_BYTES = 256 * 1024
const SEED_SCHEMA = 'voiceshield.grammar.seed.v1'

function utf8ByteLength(value: string): number {
  return Array.from(value).reduce((size, character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return size + (codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4)
  }, 0)
}

export function encodeUtf8(value: string): Uint8Array {
  const bytes: number[] = []
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0
    if (codePoint <= 0x7f) bytes.push(codePoint)
    else if (codePoint <= 0x7ff) bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f))
    else if (codePoint <= 0xffff) bytes.push(0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f))
    else bytes.push(0xf0 | (codePoint >> 18), 0x80 | ((codePoint >> 12) & 0x3f), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f))
  }
  return Uint8Array.from(bytes)
}

export type SeedUpdate = {
  schemaVersion: string
  version: string
  publishedAt: string
  rules: unknown[]
  signature: string
  source: 'verified_backend'
}
export type SeedUpdateStatus = { status: 'none' | 'candidate'; version?: string; publishedAt?: string }

function versionParts(version: string): number[] {
  return version.split('.').map((part) => Number(part)).filter((part) => Number.isInteger(part) && part >= 0)
}

export function decodeBase64(value: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const clean = value.replace(/=+$/u, '')
  const bytes: number[] = []
  let buffer = 0
  let bits = 0
  for (const character of clean) {
    const digit = alphabet.indexOf(character)
    if (digit < 0) throw new Error('Invalid base64 signature')
    buffer = (buffer << 6) | digit
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes.push((buffer >> bits) & 0xff)
    }
  }
  return Uint8Array.from(bytes)
}

export function canonicalSeedPayload(candidate: Pick<SeedUpdate, 'schemaVersion' | 'version' | 'publishedAt' | 'rules'>): string {
  return JSON.stringify({ schemaVersion: candidate.schemaVersion, version: candidate.version, publishedAt: candidate.publishedAt, rules: candidate.rules })
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const left = versionParts(candidate)
  const right = versionParts(current)
  const size = Math.max(left.length, right.length)
  for (let index = 0; index < size; index += 1) {
    const a = left[index] ?? 0
    const b = right[index] ?? 0
    if (a !== b) return a > b
  }
  return false
}

export function validateSeedUpdate(value: unknown): SeedUpdate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Seed update must be an object')
  const candidate = value as Record<string, unknown>
  if (candidate.schemaVersion !== SEED_SCHEMA || typeof candidate.version !== 'string' || !/^\d+(?:\.\d+){0,3}$/u.test(candidate.version)) throw new Error('Unsupported seed update schema or version')
  if (typeof candidate.publishedAt !== 'string' || !Number.isFinite(Date.parse(candidate.publishedAt))) throw new Error('Invalid seed publication date')
  if (!Array.isArray(candidate.rules) || candidate.rules.length > 500) throw new Error('Invalid seed rules payload')
  if (typeof candidate.signature !== 'string' || decodeBase64(candidate.signature).length !== 64) throw new Error('Ed25519 signature is required')
  return { schemaVersion: SEED_SCHEMA, version: candidate.version, publishedAt: candidate.publishedAt, rules: candidate.rules, signature: candidate.signature, source: 'verified_backend' }
}

export async function verifySeedUpdate(candidate: SeedUpdate): Promise<boolean> {
  try {
    return await verify(decodeBase64(candidate.signature), encodeUtf8(canonicalSeedPayload(candidate)), decodeBase64(VOICESHIELD_OTA_PUBLIC_KEY_B64))
  } catch {
    return false
  }
}

export async function getSeedUpdateStatus(): Promise<SeedUpdateStatus> {
  const raw = await SecureStorage.getItem(CANDIDATE_KEY)
  if (!raw) return { status: 'none' }
  try {
    const candidate = validateSeedUpdate(JSON.parse(raw))
    if (!(await verifySeedUpdate(candidate))) throw new Error('Seed candidate signature is invalid')
    return { status: 'candidate', version: candidate.version, publishedAt: candidate.publishedAt }
  } catch {
    await SecureStorage.removeItem(CANDIDATE_KEY)
    return { status: 'none' }
  }
}

export async function checkForSeedUpdate(currentVersion: string): Promise<SeedUpdateStatus> {
  const config = await getBackendConfig()
  if (!config.baseUrl.startsWith('https://')) throw new Error('Seed updates require an HTTPS backend')
  const response = await fetch(`${config.baseUrl}/api/seed/voiceshield-kz`, { headers: config.token ? { Authorization: `Bearer ${config.token}` } : undefined })
  if (!response.ok) throw new Error(`Seed update server responded with ${response.status}`)
  const raw = await response.text()
  if (utf8ByteLength(raw) > MAX_UPDATE_BYTES) throw new Error('Seed update is too large')
  const candidate = validateSeedUpdate(JSON.parse(raw))
  if (!(await verifySeedUpdate(candidate))) throw new Error('Seed update signature is invalid')
  if (!isNewerVersion(candidate.version, currentVersion)) return { status: 'none' }
  await SecureStorage.setItem(CANDIDATE_KEY, JSON.stringify(candidate))
  return { status: 'candidate', version: candidate.version, publishedAt: candidate.publishedAt }
}

export async function discardSeedUpdate(): Promise<void> {
  await SecureStorage.removeItem(CANDIDATE_KEY)
}
