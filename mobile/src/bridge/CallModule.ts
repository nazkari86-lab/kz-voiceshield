import { NativeEventEmitter, NativeModules } from 'react-native'

type CallNativeModule = {
  isAvailable(): Promise<boolean>
  requestRole(): Promise<boolean>
}

export const CallModule = NativeModules.CallScreeningModule as CallNativeModule
export const callEvents = new NativeEventEmitter(NativeModules.CallScreeningModule)
