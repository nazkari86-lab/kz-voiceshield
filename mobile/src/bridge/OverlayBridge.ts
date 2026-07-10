import { NativeModules } from 'react-native'
import type { RiskLevel } from '@scoring'

type OverlayNativeModule = {
  canDrawOverlays(): Promise<boolean>
  openOverlaySettings(): void
  show(): Promise<void>
  hide(): Promise<void>
  updateRisk(score: number, level: RiskLevel, source: string): Promise<void>
}

export const OverlayModule = NativeModules.OverlayModule as OverlayNativeModule
// overlayEvents was dead code (never subscribed to) + NativeEventEmitter(null) crash risk — removed
