import { NativeModules } from 'react-native'

type SecureStorageNativeModule = {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<boolean>
  removeItem(key: string): Promise<boolean>
  clear(): Promise<boolean>
  setScreenCaptureBlocked(blocked: boolean): Promise<boolean>
}

export const SecureStorage = NativeModules.SecureStorageModule as SecureStorageNativeModule
