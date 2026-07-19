export type ThermalState = 'nominal' | 'fair' | 'serious' | 'critical' | 'unknown'
export type ResourceSnapshot = { thermal: ThermalState; availableRamBytes: number; requiredRamBytes: number; captureCompleteness?: number }
export type ResourcePolicy = { shouldPauseHeavyInference: boolean; shouldStopNewModelDownloads: boolean; reason: string }

export function evaluateResourcePolicy(snapshot: ResourceSnapshot): ResourcePolicy {
  if (snapshot.thermal === 'critical' || snapshot.thermal === 'serious') return { shouldPauseHeavyInference: true, shouldStopNewModelDownloads: true, reason: 'thermal_limit' }
  if (snapshot.availableRamBytes > 0 && snapshot.requiredRamBytes > snapshot.availableRamBytes) return { shouldPauseHeavyInference: true, shouldStopNewModelDownloads: true, reason: 'insufficient_ram' }
  if (snapshot.captureCompleteness !== undefined && snapshot.captureCompleteness < 0.35) return { shouldPauseHeavyInference: true, shouldStopNewModelDownloads: false, reason: 'capture_quality' }
  return { shouldPauseHeavyInference: false, shouldStopNewModelDownloads: false, reason: 'ok' }
}
