import { useCallback, useEffect, useMemo, useState } from 'react'
import { accessibilityEvents, AccessibilityModule } from '@bridge/AccessibilityBridge'
import { AudioCaptureModule, audioEvents, ModelDownloader, WhisperModule, whisperEvents } from '@bridge/WhisperBridge'
import { OverlayModule } from '@bridge/OverlayBridge'
import { scoreTranscript } from '@scoring'

type TranscriptSource = 'Live Caption' | 'Whisper' | 'Manual'

const modelFile = 'ggml-small.bin'
const modelUrl = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin'

export const useCallAnalysis = () => {
  const [transcript, setTranscript] = useState('')
  const [source, setSource] = useState<TranscriptSource>('Manual')
  const [isListening, setIsListening] = useState(false)
  const [modelReady, setModelReady] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const result = useMemo(() => scoreTranscript(transcript), [transcript])

  useEffect(() => {
    const liveCaptionSub = accessibilityEvents.addListener('VS_ACCESSIBILITY_TEXT', (event: { text?: string }) => {
      if (!event.text) return
      setSource('Live Caption')
      setTranscript((current) => `${current} ${event.text}`.trim())
    })
    const whisperSub = whisperEvents.addListener('VS_WHISPER_TRANSCRIPT', (event: { text?: string }) => {
      if (!event.text) return
      setSource('Whisper')
      setTranscript((current) => `${current} ${event.text}`.trim())
    })
    const levelSub = audioEvents.addListener('VS_AUDIO_LEVEL', (event: { level?: number }) => setAudioLevel(event.level ?? 0))
    return () => {
      liveCaptionSub.remove()
      whisperSub.remove()
      levelSub.remove()
    }
  }, [])

  useEffect(() => {
    void OverlayModule.updateRisk(result.score, result.level, source)
  }, [result.level, result.score, source])

  const prepareWhisper = useCallback(async () => {
    const existing = await ModelDownloader.getModelPath(modelFile)
    const path = existing ?? await ModelDownloader.downloadModel(modelUrl, modelFile)
    await WhisperModule.initialize(path, 'ru')
    setModelReady(true)
  }, [])

  const start = useCallback(async () => {
    const accessibilityEnabled = await AccessibilityModule.isEnabled()
    if (!accessibilityEnabled && !modelReady) await prepareWhisper()
    if (!accessibilityEnabled) {
      await AudioCaptureModule.startCapture()
      await WhisperModule.startStreaming()
    }
    await OverlayModule.show()
    setIsListening(true)
  }, [modelReady, prepareWhisper])

  const stop = useCallback(async () => {
    await AudioCaptureModule.stopCapture()
    await WhisperModule.stopStreaming()
    setIsListening(false)
  }, [])

  return {
    audioLevel,
    isListening,
    modelReady,
    prepareWhisper,
    result,
    setTranscript,
    source,
    start,
    stop,
    transcript,
  }
}
