import { DeepfakeDetectorModule } from '../bridge/DeepfakeBridge'
import { SileroVADModule } from '../bridge/VADBridge'
import { classifyAudioEvidence, type AuxiliaryClassifierResult } from '../utils/auxiliaryClassifiers'

export type AudioClassifierRun = {
  classifiers: AuxiliaryClassifierResult[]
  modelLoaded: boolean
  vadProbability: number | null
  error?: string
}

/**
 * Explicit/offline audio analysis only. The caller must provide a copied PCM
 * frame; this function is intentionally not connected to Live Shield capture.
 */
export async function runAudioModelClassifiers(samples: number[], sampleRate: number): Promise<AudioClassifierRun> {
  if (samples.length === 0 || sampleRate <= 0) {
    return { classifiers: classifyAudioEvidence(), modelLoaded: false, vadProbability: null, error: 'Audio frame is empty or has an invalid sample rate' }
  }
  try {
    const [modelLoaded, vadProbability, syntheticVoiceScore] = await Promise.all([
      DeepfakeDetectorModule?.isModelLoaded() ?? Promise.resolve(false),
      SileroVADModule?.processFrame(samples, sampleRate) ?? Promise.resolve(null),
      DeepfakeDetectorModule?.analyzeFrame(samples, sampleRate) ?? Promise.resolve(null),
    ])
    const classifiers = classifyAudioEvidence(syntheticVoiceScore === null ? undefined : {
      syntheticVoiceScore: syntheticVoiceScore * 100,
      syntheticVoiceConfidence: modelLoaded ? 82 : 42,
      model: modelLoaded ? 'AASIST-ONNX' : 'conservative audio heuristic',
      speechProbability: vadProbability ?? undefined,
    })
    return { classifiers, modelLoaded, vadProbability }
  } catch {
    return { classifiers: classifyAudioEvidence(), modelLoaded: false, vadProbability: null, error: 'Offline audio models could not analyze this frame' }
  }
}
