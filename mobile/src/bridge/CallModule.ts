import { NativeModules } from 'react-native'

type CallNativeModule = {
  isAvailable(): Promise<boolean>
  requestRole(): Promise<boolean>
}

export const CallModule = NativeModules.CallScreeningModule as CallNativeModule
// callEvents was dead code (never subscribed to) + NativeEventEmitter(null) crash risk — removed
