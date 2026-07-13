import { NativeModules } from 'react-native'

export type DeviceInfo = {
  manufacturer: string
  model: string
  androidApi: number
}

type DeviceSettingsNativeModule = {
  getDeviceInfo(): Promise<DeviceInfo>
  isIgnoringBatteryOptimizations(): Promise<boolean>
  openBatteryOptimizationSettings(): void
  requestBatteryOptimizationExemption(): void
  openCaptionSettings(): void
  openDefaultAppsSettings(): void
  openAutostartSettings(): void
  openAppSettings(): void
}

export const DeviceSettings = NativeModules.DeviceSettingsModule as DeviceSettingsNativeModule
