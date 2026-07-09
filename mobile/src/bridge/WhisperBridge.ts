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
export const whisperEvents = new NativeEventEmitter(NativeModules.WhisperModule)
export const audioEvents = new NativeEventEmitter(NativeModules.AudioCaptureModule)
