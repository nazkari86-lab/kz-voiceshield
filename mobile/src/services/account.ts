import { SecureStorage } from '../bridge/SecureStorageBridge'
import { getBackendConfig } from './backendConfig'

const SESSION_KEY = 'voiceshield.account.session.v1'
const DEVICE_KEY = 'voiceshield.account.device.v1'

export type VoiceShieldAccount = { userId: string; deviceId: string; displayName: string; phone: string | null; phoneVerified: boolean; createdAt: string; updatedAt: string }
export type AccountSnapshot = { account: VoiceShieldAccount; family: { groupId: string; name: string; role: string; members: Array<{ userId: string; role: string }> } | null }

async function deviceId(): Promise<string> {
  const existing = await SecureStorage.getItem(DEVICE_KEY)
  if (existing) return existing
  const value = `device_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`
  await SecureStorage.setItem(DEVICE_KEY, value)
  return value
}

export async function getAccountSession(): Promise<string | null> { return SecureStorage.getItem(SESSION_KEY) }

async function accountRequest(path: string, init?: RequestInit): Promise<unknown> {
  const config = await getBackendConfig()
  const session = await getAccountSession()
  const response = await fetch(`${config.baseUrl}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session}` } : {}), ...(init?.headers ?? {}) } })
  if (!response.ok) throw new Error(`Account service unavailable (${response.status})`)
  return response.json()
}

export async function registerDeviceAccount(displayName: string, phone?: string): Promise<AccountSnapshot> {
  const payload = await accountRequest('/account/register', { method: 'POST', body: JSON.stringify({ deviceId: await deviceId(), displayName, phone: phone || null }) }) as { account: VoiceShieldAccount; sessionToken: string }
  await SecureStorage.setItem(SESSION_KEY, payload.sessionToken)
  return { account: payload.account, family: null }
}

export async function loadAccount(): Promise<AccountSnapshot> { return accountRequest('/account/me') as Promise<AccountSnapshot> }

export async function logoutAccount(): Promise<void> {
  try { await accountRequest('/account/logout', { method: 'POST' }) } finally { await SecureStorage.removeItem(SESSION_KEY) }
}

export async function createFamily(name: string): Promise<AccountSnapshot['family']> {
  const result = await accountRequest('/family', { method: 'POST', body: JSON.stringify({ name }) }) as { family: AccountSnapshot['family'] }
  return result.family
}

export async function createFamilyInvite(): Promise<string> {
  const result = await accountRequest('/family/invite', { method: 'POST' }) as { inviteCode: string }
  return result.inviteCode
}

export async function joinFamily(inviteCode: string): Promise<AccountSnapshot['family']> {
  const result = await accountRequest('/family/join', { method: 'POST', body: JSON.stringify({ inviteCode }) }) as { family: AccountSnapshot['family'] }
  return result.family
}
