import AsyncStorage from '@react-native-async-storage/async-storage'

export type VoipSession = {
  callId: string
  room: string
  serverUrl: string
  token: string
}

const VOIP_URL_KEY = 'voiceshield.voip.api-url.v1'
const VOIP_TOKEN_KEY = 'voiceshield.voip.api-token.v1'

export async function saveVoipConfig(url: string, token: string): Promise<void> {
  const normalized = url.trim().replace(/\/+$/, '')
  if (normalized) await AsyncStorage.setItem(VOIP_URL_KEY, normalized)
  else await AsyncStorage.removeItem(VOIP_URL_KEY)
  if (token.trim()) await AsyncStorage.setItem(VOIP_TOKEN_KEY, token.trim())
  else await AsyncStorage.removeItem(VOIP_TOKEN_KEY)
}

export async function getVoipConfig(): Promise<{ url: string; token: string }> {
  const [url, token] = await Promise.all([AsyncStorage.getItem(VOIP_URL_KEY), AsyncStorage.getItem(VOIP_TOKEN_KEY)])
  return {
    url: url ?? String((globalThis as { __VOICESHIELD_API_URL__?: string }).__VOICESHIELD_API_URL__ ?? ''),
    token: token ?? (globalThis as { __VOICESHIELD_API_TOKEN__?: string }).__VOICESHIELD_API_TOKEN__ ?? '',
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const config = await getVoipConfig()
  if (!config.url) throw new Error('Настройте адрес VoiceShield backend в разделе VoIP.')
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json')
  if (config.token) headers.set('Authorization', `Bearer ${config.token}`)
  const response = await fetch(`${config.url.replace(/\/$/, '')}${path}`, { ...init, headers })
  const body = await response.json().catch(() => ({})) as { detail?: string }
  if (!response.ok) throw new Error(body.detail ?? `VoiceShield API error (${response.status})`)
  return body as T
}

export function createVoipCall(): Promise<VoipSession> {
  return request<VoipSession>('/calls/create', { method: 'POST', body: '{}' })
}

export function joinVoipCall(callId: string): Promise<VoipSession> {
  return request<VoipSession>(`/calls/${encodeURIComponent(callId)}/join`, { method: 'POST', body: '{}' })
}

export function endVoipCall(callId: string): Promise<{ callId: string; status: string }> {
  return request(`/calls/${encodeURIComponent(callId)}/end`, { method: 'POST', body: '{}' })
}
