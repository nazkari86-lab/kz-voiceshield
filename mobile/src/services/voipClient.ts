import { getBackendConfig } from './backendConfig'

export type VoipSession = {
  callId: string
  room: string
  serverUrl: string
  token: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const config = await getBackendConfig()
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json')
  if (config.token) headers.set('Authorization', `Bearer ${config.token}`)
  let response: Response
  try {
    response = await fetch(`${config.baseUrl}${path}`, { ...init, headers })
  } catch {
    throw new Error('NETWORK: VoiceShield server cannot be reached')
  }
  const body = await response.json().catch(() => ({})) as { detail?: string }
  if (!response.ok) throw new Error(`${response.status}: ${body.detail ?? 'VoiceShield API error'}`)
  return body as T
}

export function createVoipCall(): Promise<VoipSession> {
  return request<VoipSession>('/calls/create', { method: 'POST', body: '{}' })
}

export function joinVoipCall(callId: string): Promise<VoipSession> {
  return request<VoipSession>(`/calls/${encodeURIComponent(callId)}/join`, { method: 'POST', body: '{}' })
}

export function endVoipCall(callId: string): Promise<{ callId: string; ok: boolean }> {
  return request(`/calls/${encodeURIComponent(callId)}/end`, { method: 'POST', body: '{}' })
}
