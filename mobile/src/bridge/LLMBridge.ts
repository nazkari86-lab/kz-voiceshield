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
// Access requires accepting the Gemma license in Hugging Face. The repository
// provides LiteRT bundles compatible with MediaPipe LLM Inference on Android.
export const GEMMA_MODEL_URL =
  'https://huggingface.co/litert-community/Gemma3-1B-IT'
export const GEMMA_MODEL_SIZE_MB = 670
