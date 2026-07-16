import { NativeModules } from 'react-native'

type SileroVADModuleType = {
  loadModel: (modelPath: string) => Promise<boolean>
  processFrame: (samples: number[], sampleRate: number) => Promise<number>
  setThresholds: (energy: number, zcr: number) => Promise<void>
}

export const SileroVADModule: SileroVADModuleType | null =
  (NativeModules.SileroVADModule as SileroVADModuleType | undefined) ?? null
