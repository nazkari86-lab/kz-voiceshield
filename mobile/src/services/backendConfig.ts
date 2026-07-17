import { SecureStorage } from '../bridge/SecureStorageBridge'

const URL_KEY = 'voiceshield.backend.url.v1'
const TOKEN_KEY = 'voiceshield.backend.token.v1'
const DEFAULT_URL = 'http://127.0.0.1:8000'

export type BackendConfig = { baseUrl: string; token: string }
export type BackendTransport = 'https' | 'private-http' | 'insecure-http' | 'loopback-http'
export type BackendDiagnostics = {
  detail: string
  transport: BackendTransport
  warning?: string
  version?: string
  apiVersion?: string
  capabilities: Record<string, boolean>
}

const normalizeUrl = (value: string): string => {
  const url = value.trim().replace(/\/$/, '')
  if (!/^https?:\/\//i.test(url)) throw new Error('Server URL must start with http:// or https://')
  return url
}

const isPrivateIpv4 = (host: string): boolean => {
  const parts = host.split('.').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
  const [first = -1, second = -1] = parts
  return first === 10
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
}

export function inspectBackendTransport(value: string): { transport: BackendTransport; warning?: string } {
  const url = normalizeUrl(value)
  const match = url.match(/^(https?):\/\/([^/:?#]+)/iu)
  const protocol = match?.[1]?.toLowerCase()
  const host = match?.[2]?.toLowerCase() ?? ''
  if (protocol === 'https') return { transport: 'https' }
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    return { transport: 'loopback-http', warning: 'This server address works only on the same device. Use your Mac LAN IP on a phone.' }
  }
  if (isPrivateIpv4(host) || host.endsWith('.local')) {
    return { transport: 'private-http', warning: 'HTTP is acceptable only on a trusted private network. Do not use this address on public Wi-Fi.' }
  }
  return { transport: 'insecure-http', warning: 'This server uses unencrypted HTTP. Use HTTPS before sending any personal data outside a trusted LAN.' }
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

export async function testBackendConnection(config?: BackendConfig): Promise<{ ok: true } & BackendDiagnostics> {
  const active = config ?? await getBackendConfig()
  const transport = inspectBackendTransport(active.baseUrl)
  const headers = active.token ? { Authorization: `Bearer ${active.token}` } : undefined
  let response: Response
  try {
    response = await fetch(`${active.baseUrl}/readyz`, { headers })
  } catch {
    throw new Error('Network unavailable or server cannot be reached')
  }
  if (response.status === 401 || response.status === 403) throw new Error('Server reached, but the API token is not accepted')
  if (!response.ok) throw new Error(`Server responded with ${response.status}`)
  const payload = await response.json().catch(() => ({})) as { version?: unknown; apiVersion?: unknown; capabilities?: unknown }
  const capabilities = typeof payload.capabilities === 'object' && payload.capabilities !== null
    ? Object.fromEntries(Object.entries(payload.capabilities).filter(([, value]) => typeof value === 'boolean')) as Record<string, boolean>
    : {}
  return {
    ok: true,
    detail: 'Server connection verified',
    transport: transport.transport,
    warning: transport.warning,
    version: typeof payload.version === 'string' ? payload.version : undefined,
    apiVersion: typeof payload.apiVersion === 'string' ? payload.apiVersion : undefined,
    capabilities,
  }
}
