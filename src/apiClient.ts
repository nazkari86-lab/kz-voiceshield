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
  const response = await fetch(`${apiBaseUrl}${path}`, init)
  if (!response.ok) throw new Error(`Backend request failed: ${response.status}`)
  return response.json() as Promise<T>
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
  const response = await requestJson<Record<string, unknown>>('/transcribe-audio', { body, method: 'POST' })
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
