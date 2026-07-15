import { NativeModules } from 'react-native'

type SileroVADModuleType = {
  loadModel: (modelPath: string) => Promise<boolean>
  loadBundledModel: () => Promise<boolean>
  processFrame: (samples: number[], sampleRate: number) => Promise<number>
  setThresholds: (energy: number, zcr: number) => Promise<void>
  reset: () => Promise<void>
  isModelLoaded: () => Promise<boolean>
}

export const SileroVADModule: SileroVADModuleType | null =
  (NativeModules.SileroVADModule as SileroVADModuleType | undefined) ?? null
