import { NativeModules } from 'react-native'
import type { Severity } from '@scoring'

type OverlayNativeModule = {
  canDrawOverlays(): Promise<boolean>
  openOverlaySettings(): void
  show(useMicrophone: boolean): Promise<void>
  hide(): Promise<void>
  updateRisk(score: number, level: Severity, source: string): Promise<void>
}

export const OverlayModule = NativeModules.OverlayModule as OverlayNativeModule
// overlayEvents was dead code (never subscribed to) + NativeEventEmitter(null) crash risk — removed
