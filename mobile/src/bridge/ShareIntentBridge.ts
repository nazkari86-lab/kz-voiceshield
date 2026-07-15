import { NativeEventEmitter, NativeModules } from 'react-native'

type ShareIntentNativeModule = {
  consumePendingText(): Promise<string | null>
  consumePendingLiveShield(): Promise<boolean>
}

export const ShareIntentModule = NativeModules.ShareIntentModule as ShareIntentNativeModule

const nativeModule = NativeModules.ShareIntentModule
export const shareIntentEvents = nativeModule
  ? new NativeEventEmitter(nativeModule)
  : ({ addListener: () => ({ remove: () => {} }) } as unknown as NativeEventEmitter)
