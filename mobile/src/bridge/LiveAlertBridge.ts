import { NativeModules } from 'react-native'

type LiveAlertModuleType = {
  showThreatAlert: (risk: string, score: number, schemeLabel: string) => void
  cancelAlert: () => void
}

export const LiveAlertModule: LiveAlertModuleType | null =
  (NativeModules.LiveAlertModule as LiveAlertModuleType | undefined) ?? null
