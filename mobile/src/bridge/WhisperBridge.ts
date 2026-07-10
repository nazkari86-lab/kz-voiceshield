import { NativeEventEmitter, NativeModules } from 'react-native'

type WhisperNativeModule = {
  initialize(modelPath: string, language: string): Promise<boolean>
  startStreaming(): Promise<void>
  stopStreaming(): Promise<void>
  resetBuffer(): Promise<void>
  getBufferSize(): Promise<number>
}

type ModelDownloaderNativeModule = {
  downloadModel(url: string, fileName: string): Promise<string>
  getModelPath(fileName: string): Promise<string | null>
  hasModel(fileName: string): Promise<boolean>
}

type AudioCaptureNativeModule = {
  startCapture(): Promise<void>
  stopCapture(): Promise<void>
}

export const WhisperModule = NativeModules.WhisperModule as WhisperNativeModule
export const ModelDownloader = NativeModules.ModelDownloader as ModelDownloaderNativeModule
export const AudioCaptureModule = NativeModules.AudioCaptureModule as AudioCaptureNativeModule

// Guard against null modules — NativeEventEmitter(null) throws immediately at
// module-load time if a native module wasn't registered, crashing the whole app.
// Lazy getters ensure we only create the emitter when the module is confirmed present.
const _whisperModule = NativeModules.WhisperModule
const _audioModule = NativeModules.AudioCaptureModule

export const whisperEvents = _whisperModule
  ? new NativeEventEmitter(_whisperModule)
  : ({ addListener: () => ({ remove: () => {} }) } as unknown as NativeEventEmitter)

export const audioEvents = _audioModule
  ? new NativeEventEmitter(_audioModule)
  : ({ addListener: () => ({ remove: () => {} }) } as unknown as NativeEventEmitter)
