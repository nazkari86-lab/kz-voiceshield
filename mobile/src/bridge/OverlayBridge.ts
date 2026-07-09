import { NativeEventEmitter, NativeModules } from 'react-native'
import type { RiskLevel } from '@scoring'

type OverlayNativeModule = {
  canDrawOverlays(): Promise<boolean>
  openOverlaySettings(): void
  show(): Promise<void>
  hide(): Promise<void>
  updateRisk(score: number, level: RiskLevel, source: string): Promise<void>
}

export const OverlayModule = NativeModules.OverlayModule as OverlayNativeModule
export const overlayEvents = new NativeEventEmitter(NativeModules.OverlayModule)
