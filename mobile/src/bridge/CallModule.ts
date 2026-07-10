import { NativeEventEmitter, NativeModules } from 'react-native'

export type SafeCallEvent = {
  direction: 'incoming' | 'unknown'
  verificationStatus: 'passed' | 'failed' | 'unverified' | 'unavailable'
  detectedAt: number
}

type CallNativeModule = {
  isAvailable(): Promise<boolean>
  isRoleHeld(): Promise<boolean>
  requestRole(): Promise<boolean>
  consumePendingCall(): Promise<SafeCallEvent | null>
}

export const CallModule = NativeModules.CallScreeningModule as CallNativeModule
const _callModule = NativeModules.CallScreeningModule
export const callEvents = _callModule
  ? new NativeEventEmitter(_callModule)
  : ({ addListener: () => ({ remove: () => {} }) } as unknown as NativeEventEmitter)
