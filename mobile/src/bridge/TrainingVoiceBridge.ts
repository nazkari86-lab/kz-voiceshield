import { NativeModules } from 'react-native'

type TrainingVoiceNativeModule = {
  speak(text: string, language: 'RU' | 'KZ'): Promise<number | boolean>
  stop(): Promise<void>
}

export const TrainingVoiceModule = NativeModules.TrainingVoiceModule as TrainingVoiceNativeModule
