import { NativeEventEmitter, NativeModules } from 'react-native'

type LLMModuleType = {
  isReady: () => Promise<boolean>
  loadModel: (modelPath: string, maxTokens: number) => Promise<boolean>
  generateResponse: (prompt: string) => Promise<string>
  cancelGeneration: () => Promise<void>
  unloadModel: () => Promise<void>
  addListener: (event: string) => void
  removeListeners: (count: number) => void
}

export const LLMModule: LLMModuleType | null =
  (NativeModules.LLMInferenceModule as LLMModuleType | undefined) ?? null

export const llmEvents = LLMModule
  ? new NativeEventEmitter(NativeModules.LLMInferenceModule)
  : null

// Model file name used by ModelDownloader
export const GEMMA_MODEL_FILE = 'gemma-3-1b-it-int4.task'
export const GEMMA_RELEASE_ASSET_FILE = 'gemma3-1b-it-int4.task'
export const GEMMA_MODEL_SHA256 = 'e3d981c01aeaaac69a84ffa0d4be13281b3176731063f1bea1c9fe6887bd9dee'
export const GEMMA_MODEL_BYTES = 554_661_243
// The verified release asset is downloaded directly by the Android app.
export const GEMMA_MODEL_URL =
  `https://github.com/nazkari86-lab/kz-voiceshield/releases/download/gemma-v1.0.0/${GEMMA_RELEASE_ASSET_FILE}`
export const GEMMA_TERMS_URL = 'https://ai.google.dev/gemma/terms'
export const GEMMA_MODEL_SIZE_MB = 555
export const GEMMA_CONTEXT_TOKENS = 2048
