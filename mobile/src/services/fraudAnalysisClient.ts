import { getBackendConfig } from './backendConfig'
import type { HybridRiskReview, MlShadowAssessment } from '../utils/fraudSignalFusion'
import { extractFraudSignals, fuseRiskScores } from '../utils/fraudSignalFusion'
import type { Analysis } from '@scoring'

type BackendResponse = {
  ml?: { score?: unknown; verdict?: unknown; confidence?: unknown }
  mlAvailable?: unknown
  disagreement?: unknown
}

const DEFAULT_LOCAL_URL = 'http://127.0.0.1:8000'

function boundedInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : fallback
}

export async function requestFraudShadowReview(transcript: string, analysis: Analysis): Promise<HybridRiskReview | null> {
  const text = transcript.trim()
  if (text.length < 3) return null
  const config = await getBackendConfig()
  // A local default is intentionally treated as disabled. The user must
  // configure a reachable backend before any transcript leaves the device.
  if (!config.baseUrl || config.baseUrl === DEFAULT_LOCAL_URL) return null
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8_000)
  try {
    const response = await fetch(`${config.baseUrl}/analyze-transcript`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}) },
      body: JSON.stringify({ transcript: text, ruleAnalysis: { score: analysis.score } }),
    })
    if (!response.ok) return null
    const payload = await response.json() as BackendResponse
    const rawMl = payload.ml
    const validVerdict = rawMl?.verdict === 'fraud' || rawMl?.verdict === 'safe' || rawMl?.verdict === 'needs_review'
    const ml: MlShadowAssessment | null = payload.mlAvailable === true && rawMl && validVerdict
      ? { score: boundedInteger(rawMl.score, 0), confidence: boundedInteger(rawMl.confidence, 0), verdict: rawMl.verdict as MlShadowAssessment['verdict'] }
      : null
    return fuseRiskScores(analysis, extractFraudSignals(text), ml)
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}
