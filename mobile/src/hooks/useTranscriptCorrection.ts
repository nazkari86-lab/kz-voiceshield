import { useEffect, useRef, useState } from 'react'
import type { OnDeviceAiRuntime } from './useOnDeviceAiRuntime'
import { buildModelCorrectionRequest, parseAndValidateModelCorrection, type ModelCorrection } from '../utils/modelCorrection'
import type { TranscriptEnhancement } from '../utils/transcriptEnhancer'

export type TranscriptCorrectionState = ModelCorrection & { status: 'idle' | 'waiting' | 'running' | 'ready' | 'rejected' | 'error'; error: string | null }

const emptyState: TranscriptCorrectionState = {
  rawTranscript: '', correctedTranscript: '', corrections: [], confidence: 0, rejected: false, status: 'idle', error: null,
}

export function useTranscriptCorrection(ai: OnDeviceAiRuntime | null, transcript: string, enhancement: TranscriptEnhancement, enabled = true) {
  const [state, setState] = useState<TranscriptCorrectionState>(emptyState)
  const requestIdRef = useRef(0)
  const aiRef = useRef(ai)
  aiRef.current = ai ?? aiRef.current

  useEffect(() => {
    const currentId = ++requestIdRef.current
    const raw = transcript.trim()
    if (!enabled || raw.length < 12 || !ai?.hydrated || !ai.modelReady || ai.generating) {
      setState({ ...emptyState, rawTranscript: raw, correctedTranscript: enhancement.normalizedTranscript, status: enabled && raw.length >= 12 ? 'waiting' : 'idle' })
      return undefined
    }
    setState((current) => ({ ...current, rawTranscript: raw, correctedTranscript: enhancement.normalizedTranscript, status: 'waiting', error: null }))
    const timer = setTimeout(() => {
      const request = buildModelCorrectionRequest(raw, enhancement)
      setState((current) => ({ ...current, status: 'running', error: null }))
      const runtime = aiRef.current
      if (!runtime) {
        setState((current) => ({ ...current, status: 'error', error: 'AI runtime is unavailable.' }))
        return
      }
      void runtime.generate({
        owner: 'correction',
        gemmaPrompt: request.gemmaPrompt,
        localSystemPrompt: request.localSystemPrompt,
        localUserMessage: request.localUserMessage,
      }).then((response) => {
        if (requestIdRef.current !== currentId) return
        const result = parseAndValidateModelCorrection(response, raw, enhancement.dominantLanguage)
        setState({ ...result, status: result.rejected ? 'rejected' : 'ready', error: result.rejectionReason ?? null })
      }).catch((error: unknown) => {
        if (requestIdRef.current !== currentId) return
        setState((current) => ({ ...current, status: 'error', error: error instanceof Error ? error.message : 'AI correction failed.' }))
      })
    }, 900)
    return () => clearTimeout(timer)
  }, [ai?.generating, ai?.hydrated, ai?.modelReady, enabled, enhancement, transcript])

  return state
}
