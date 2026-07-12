import { NativeEventEmitter, NativeModules } from 'react-native'

export type VoiceMessageResult = {
  transcript: string
  durationMs: number
  sampleCount: number
}

type VoiceMessageNativeModule = {
  pickAndTranscribe(language: string): Promise<VoiceMessageResult>
  transcribePendingAudio(language: string): Promise<VoiceMessageResult | null>
  consumePendingAudio(): Promise<boolean>
}

export const VoiceMessageModule = NativeModules.VoiceMessageModule as VoiceMessageNativeModule | undefined

const nativeModule = NativeModules.VoiceMessageModule
export const voiceMessageEvents = nativeModule
  ? new NativeEventEmitter(nativeModule)
  : ({ addListener: () => ({ remove: () => {} }) } as unknown as NativeEventEmitter)
