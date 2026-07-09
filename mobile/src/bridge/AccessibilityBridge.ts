import { NativeEventEmitter, NativeModules } from 'react-native'

type AccessibilityNativeModule = {
  isEnabled(): Promise<boolean>
  openSettings(): void
}

export const AccessibilityModule = NativeModules.AccessibilityModule as AccessibilityNativeModule
export const accessibilityEvents = new NativeEventEmitter(NativeModules.AccessibilityModule)
