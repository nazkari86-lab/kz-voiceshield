import { NativeEventEmitter, NativeModules } from 'react-native'

type NotificationAccessNativeModule = {
  isEnabled(): Promise<boolean>
  openSettings(): void
}

export const NotificationAccess = NativeModules.NotificationAccessModule as NotificationAccessNativeModule
const nativeModule = NativeModules.NotificationAccessModule
export const notificationEvents = nativeModule
  ? new NativeEventEmitter(nativeModule)
  : ({ addListener: () => ({ remove: () => {} }) } as unknown as NativeEventEmitter)
