import { NativeModules } from 'react-native'

type DeepfakeDetectorModuleType = {
  loadModel: (modelPath?: string) => Promise<boolean>
  analyzeFrame: (samples: number[], sampleRate: number) => Promise<number>
  reset: () => Promise<void>
  isModelLoaded: () => Promise<boolean>
}

export const DeepfakeDetectorModule: DeepfakeDetectorModuleType | null =
  (NativeModules.DeepfakeDetectorModule as DeepfakeDetectorModuleType | undefined) ?? null
