import { serializeCase } from './scoring'
import type { Analysis, SavedCase } from './scoring'

export type MlVerdict = 'fraud' | 'safe' | 'needs_review'

export type MlAssessment = {
  verdict: MlVerdict
  score: number
  confidence: number
  model: string
  embeddingModel?: string
  signals: string[]
}

export type BackendTranscriptResult = {
  transcript: string
  transcriptConfidence: number
  ml?: MlAssessment
}

export type BackendAnalysisResult = {
  ml: MlAssessment
}

export type CaseSyncResult = {
  ok: boolean
  remoteId?: string
  syncedAt: string
}

const apiBaseUrl = (import.meta.env.VITE_VOICESHIELD_API_URL ?? '').replace(/\/+$/u, '')
const apiToken = import.meta.env.VITE_VOICESHIELD_API_TOKEN ?? ''
const audioPollIntervalMs = 1_000
const audioPollAttempts = 120

const clampScore = (value: unknown, fallback: number) => {
  const score = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.max(0, Math.min(100, Math.round(score)))
}

const normalizeVerdict = (value: unknown): MlVerdict =>
  value === 'fraud' || value === 'safe' || value === 'needs_review' ? value : 'needs_review'

const normalizeMl = (value: unknown): MlAssessment | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const payload = value as Record<string, unknown>
  return {
    verdict: normalizeVerdict(payload.verdict),
    score: clampScore(payload.score, 50),
    confidence: clampScore(payload.confidence, 50),
    model: typeof payload.model === 'string' ? payload.model : 'backend-baseline',
    embeddingModel: typeof payload.embeddingModel === 'string' ? payload.embeddingModel : undefined,
    signals: Array.isArray(payload.signals) ? payload.signals.filter((item): item is string => typeof item === 'string') : [],
  }
}

const requestJson = async <T>(path: string, init: RequestInit): Promise<T> => {
  if (!apiBaseUrl) throw new Error('Backend URL is not configured')
  const headers = new Headers(init.headers)
  if (apiToken) headers.set('Authorization', `Bearer ${apiToken}`)
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers })
  if (!response.ok) {
    const payload = await response.json().catch(() => undefined) as { detail?: string } | undefined
    throw new Error(payload?.detail ?? `Backend request failed: ${response.status}`)
  }
  return response.json() as Promise<T>
}

const wait = (milliseconds: number) => new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds))

const pollAudioJob = async (jobId: string): Promise<Record<string, unknown>> => {
  for (let attempt = 0; attempt < audioPollAttempts; attempt += 1) {
    const response = await requestJson<Record<string, unknown>>(`/audio-jobs/${encodeURIComponent(jobId)}`, { method: 'GET' })
    if (response.status === 'completed') return response
    if (response.status === 'failed') throw new Error(typeof response.error === 'string' ? response.error : 'Backend transcription failed')
    await wait(audioPollIntervalMs)
  }
  throw new Error('Backend transcription timed out')
}

export const isBackendConfigured = () => Boolean(apiBaseUrl)

export const analyzeTranscriptWithBackend = async (transcript: string, ruleAnalysis: Analysis): Promise<BackendAnalysisResult> => {
  const response = await requestJson<Record<string, unknown>>('/analyze-transcript', {
    body: JSON.stringify({ transcript, ruleAnalysis }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })
  return {
    ml: normalizeMl(response.ml ?? response) ?? {
      confidence: 50,
      model: 'backend-baseline',
      score: 50,
      signals: [],
      verdict: 'needs_review',
    },
  }
}

export const transcribeAudioWithBackend = async (file: File): Promise<BackendTranscriptResult> => {
  const body = new FormData()
  body.append('audio', file)
  const accepted = await requestJson<Record<string, unknown>>('/transcribe-audio', { body, method: 'POST' })
  const jobId = typeof accepted.jobId === 'string' ? accepted.jobId : undefined
  const response = typeof accepted.transcript === 'string'
    ? accepted
    : jobId
      ? await pollAudioJob(jobId)
      : accepted
  return {
    transcript: typeof response.transcript === 'string' ? response.transcript : '',
    transcriptConfidence: clampScore(response.transcriptConfidence ?? response.confidence, 0),
    ml: normalizeMl(response.ml),
  }
}

export const syncCaseWithBackend = async (item: SavedCase): Promise<CaseSyncResult> => {
  const response = await requestJson<Record<string, unknown>>(`/cases/${encodeURIComponent(item.id)}`, {
    body: JSON.stringify(serializeCase(item)),
    headers: { 'Content-Type': 'application/json' },
    method: 'PUT',
  })
  return {
    ok: response.ok !== false,
    remoteId: typeof response.remoteId === 'string' ? response.remoteId : undefined,
    syncedAt: typeof response.syncedAt === 'string' ? response.syncedAt : new Date().toISOString(),
  }
}
