import { NativeModules } from 'react-native'

export type SmsMessage = {
  id: string
  address: string
  body: string
  date: number
}

type SmsScannerModuleType = {
  hasPermission: () => Promise<boolean>
  getRecentMessages: (limit: number) => Promise<SmsMessage[]>
}

export const SmsScannerModule: SmsScannerModuleType | null =
  (NativeModules.SmsScannerModule as SmsScannerModuleType | undefined) ?? null
