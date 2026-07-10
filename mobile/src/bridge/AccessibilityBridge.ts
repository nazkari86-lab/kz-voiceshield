import { NativeEventEmitter, NativeModules } from 'react-native'

type AccessibilityNativeModule = {
  isEnabled(): Promise<boolean>
  openSettings(): void
}

export const AccessibilityModule = NativeModules.AccessibilityModule as AccessibilityNativeModule

// Guard against null module — NativeEventEmitter(null) throws immediately at
// module-load time if AccessibilityModule wasn't registered, crashing the app
// before the first screen renders. Mirror the safe pattern used in WhisperBridge.
const _accessibilityModule = NativeModules.AccessibilityModule
export const accessibilityEvents = _accessibilityModule
  ? new NativeEventEmitter(_accessibilityModule)
  : ({ addListener: () => ({ remove: () => {} }) } as unknown as NativeEventEmitter)
