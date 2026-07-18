import { NativeModules } from 'react-native'

type TrainingVoiceNativeModule = {
  speak(text: string, language: 'RU' | 'KZ'): Promise<number | boolean>
  playBase64(audioBase64: string, mimeType?: string): Promise<boolean>
  listen(language: 'RU' | 'KZ'): Promise<string>
  stop(): Promise<void>
}

export const TrainingVoiceModule = NativeModules.TrainingVoiceModule as TrainingVoiceNativeModule
