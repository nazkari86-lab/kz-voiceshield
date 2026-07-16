import { SecureStorage } from '../bridge/SecureStorageBridge'

const URL_KEY = 'voiceshield.backend.url.v1'
const TOKEN_KEY = 'voiceshield.backend.token.v1'
const DEFAULT_URL = 'http://127.0.0.1:8000'

export type BackendConfig = { baseUrl: string; token: string }

const normalizeUrl = (value: string): string => {
  const url = value.trim().replace(/\/$/, '')
  if (!/^https?:\/\//i.test(url)) throw new Error('Server URL must start with http:// or https://')
  return url
}

export async function getBackendConfig(): Promise<BackendConfig> {
  const [storedUrl, storedToken] = await Promise.all([
    SecureStorage.getItem(URL_KEY),
    SecureStorage.getItem(TOKEN_KEY),
  ])
  const runtime = globalThis as { __VOICESHIELD_API_URL__?: string; __VOICESHIELD_API_TOKEN__?: string }
  return {
    baseUrl: storedUrl ?? runtime.__VOICESHIELD_API_URL__ ?? DEFAULT_URL,
    token: storedToken ?? runtime.__VOICESHIELD_API_TOKEN__ ?? '',
  }
}

export async function saveBackendConfig(config: BackendConfig): Promise<BackendConfig> {
  const next = { baseUrl: normalizeUrl(config.baseUrl), token: config.token.trim() }
  await Promise.all([
    SecureStorage.setItem(URL_KEY, next.baseUrl),
    next.token ? SecureStorage.setItem(TOKEN_KEY, next.token) : SecureStorage.removeItem(TOKEN_KEY),
  ])
  return next
}

export async function testBackendConnection(config?: BackendConfig): Promise<{ ok: true; detail: string }> {
  const active = config ?? await getBackendConfig()
  const headers = active.token ? { Authorization: `Bearer ${active.token}` } : undefined
  let response: Response
  try {
    response = await fetch(`${active.baseUrl}/readyz`, { headers })
  } catch {
    throw new Error('Network unavailable or server cannot be reached')
  }
  if (response.status === 401 || response.status === 403) throw new Error('Server reached, but the API token is not accepted')
  if (!response.ok) throw new Error(`Server responded with ${response.status}`)
  return { ok: true, detail: 'Server connection verified' }
}
