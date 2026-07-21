import { NativeEventEmitter, NativeModules } from 'react-native'

export type VoiceMessageResult = {
  transcript: string
  durationMs: number
  sampleCount: number
  audioQuality?: {
    level: 'usable' | 'quiet' | 'clipped' | 'unusable'
    rms: number
    peak: number
    clippingRatio: number
    signalRatio: number
  }
}

type VoiceMessageNativeModule = {
  pickAndTranscribe(language: string): Promise<VoiceMessageResult>
  pickCallRecordingAndTranscribe(language: string): Promise<VoiceMessageResult>
  transcribePendingAudio(language: string): Promise<VoiceMessageResult | null>
  consumePendingAudio(): Promise<boolean>
  pickAudioUri(): Promise<string>
}

export const VoiceMessageModule = NativeModules.VoiceMessageModule as VoiceMessageNativeModule | undefined

const nativeModule = NativeModules.VoiceMessageModule
export const voiceMessageEvents = nativeModule
  ? new NativeEventEmitter(nativeModule)
  : ({ addListener: () => ({ remove: () => {} }) } as unknown as NativeEventEmitter)
