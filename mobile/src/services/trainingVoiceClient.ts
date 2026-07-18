import { getBackendConfig } from './backendConfig'

type TrainingVoiceResponse = {
  audioBase64: string
  mimeType: string
  source: 'synthetic_training'
  provider: string
  voiceIdHash: string
  modelId: string
  cached: boolean
}

export type TrainingVoiceOption = {
  voiceId: string
  name: string
  category?: string | null
  labels: Record<string, string>
}

export async function listTrainingVoices(): Promise<TrainingVoiceOption[]> {
  const config = await getBackendConfig()
  if (!config.token) throw new Error('Training voice backend token is not configured')
  const response = await fetch(`${config.baseUrl}/training/voices`, {
    headers: { Authorization: `Bearer ${config.token}` },
  })
  const payload = await response.json().catch(() => ({})) as { items?: unknown; detail?: string }
  if (!response.ok || !Array.isArray(payload.items)) {
    throw new Error(typeof payload.detail === 'string' ? payload.detail : `Training voice catalog failed (${response.status})`)
  }
  return payload.items.filter((item): item is TrainingVoiceOption => {
    if (!item || typeof item !== 'object') return false
    const candidate = item as Partial<TrainingVoiceOption>
    return typeof candidate.voiceId === 'string' && typeof candidate.name === 'string'
  })
}

export async function requestTrainingVoice(text: string, language: 'RU' | 'KZ', voiceId?: string): Promise<TrainingVoiceResponse> {
  const config = await getBackendConfig()
  if (!config.token) throw new Error('Training voice backend token is not configured')
  const response = await fetch(`${config.baseUrl}/training/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` },
    body: JSON.stringify({ text, language, speed: 0.95, ...(voiceId?.trim() ? { voiceId: voiceId.trim() } : {}) }),
  })
  const payload = await response.json().catch(() => ({})) as Partial<TrainingVoiceResponse> & { detail?: string }
  if (!response.ok || typeof payload.audioBase64 !== 'string' || typeof payload.mimeType !== 'string') {
    throw new Error(typeof payload.detail === 'string' ? payload.detail : `Training voice request failed (${response.status})`)
  }
  return payload as TrainingVoiceResponse
}
