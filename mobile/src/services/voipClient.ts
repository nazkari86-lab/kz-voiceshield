export type VoipSession = {
  callId: string
  room: string
  serverUrl: string
  token: string
}

const API_URL = String((globalThis as { __VOICESHIELD_API_URL__?: string }).__VOICESHIELD_API_URL__ ?? 'http://127.0.0.1:8000').replace(/\/$/, '')

function apiToken(): string | undefined {
  return (globalThis as { __VOICESHIELD_API_TOKEN__?: string }).__VOICESHIELD_API_TOKEN__
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json')
  const token = apiToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`${API_URL}${path}`, { ...init, headers })
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
