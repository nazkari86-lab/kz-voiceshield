export type WhisperModelId = 'fastconformer' | 'tiny' | 'base' | 'small' | 'mediumQ5' | 'turboQ5' | 'turboQ8' | 'turboFull'
export type WhisperModelChoice = WhisperModelId | 'auto'

export type WhisperModel = {
  id: WhisperModelId
  file: string
  url: string
  sha256: string
  size: number
  ramBytes: number
  title: string
  detail: string
  tier: 'fast' | 'balanced' | 'accurate' | 'maximum'
  importOnly?: boolean
}

const host = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main'
const fastConformerRelease = 'https://github.com/nazkari86-lab/kz-voiceshield/releases/download/fastconformer-v1.1.0'

// Hashes and byte sizes are the immutable Hugging Face LFS object identifiers
// for the exact whisper.cpp artifacts referenced below.
export const whisperModels: readonly WhisperModel[] = [
  { id: 'fastconformer', file: 'fastconformer-kk-ru-int8.onnx', url: `${fastConformerRelease}/fastconformer-kk-ru-int8.onnx`, sha256: '63c132a4246dc422ce23a3bb06812b86d95bc8b07592d0d17f8c3031f858b281', size: 131741652, ramBytes: 3_000_000_000, title: 'FastConformer KZ/RU INT8', detail: '132 MB · specialised Kazakh/Russian model', tier: 'maximum' },
  { id: 'tiny', file: 'ggml-tiny.bin', url: `${host}/ggml-tiny.bin`, sha256: 'be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21', size: 77691713, ramBytes: 1_500_000_000, title: 'Tiny', detail: '78 MB · fastest', tier: 'fast' },
  { id: 'base', file: 'ggml-base.bin', url: `${host}/ggml-base.bin`, sha256: '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe', size: 147951465, ramBytes: 2_000_000_000, title: 'Base', detail: '148 MB · balanced', tier: 'balanced' },
  { id: 'small', file: 'ggml-small.bin', url: `${host}/ggml-small.bin`, sha256: '1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b', size: 487601967, ramBytes: 4_000_000_000, title: 'Small', detail: '488 MB · RU/KZ accuracy', tier: 'accurate' },
  { id: 'mediumQ5', file: 'ggml-medium-q5_0.bin', url: `${host}/ggml-medium-q5_0.bin`, sha256: '19fea4b380c3a618ec4723c3eef2eb785ffba0d0538cf43f8f235e7b3b34220f', size: 539212467, ramBytes: 6_000_000_000, title: 'Medium Q5', detail: '539 MB · higher accuracy', tier: 'accurate' },
  { id: 'turboQ5', file: 'ggml-large-v3-turbo-q5_0.bin', url: `${host}/ggml-large-v3-turbo-q5_0.bin`, sha256: '394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2', size: 574041195, ramBytes: 8_000_000_000, title: 'Large v3 Turbo Q5', detail: '574 MB · recommended maximum', tier: 'maximum' },
  { id: 'turboQ8', file: 'ggml-large-v3-turbo-q8_0.bin', url: `${host}/ggml-large-v3-turbo-q8_0.bin`, sha256: '317eb69c11673c9de1e1f0d459b253999804ec71ac4c23c17ecf5fbe24e259a1', size: 874188075, ramBytes: 10_000_000_000, title: 'Large v3 Turbo Q8', detail: '874 MB · best mobile quality', tier: 'maximum' },
  { id: 'turboFull', file: 'ggml-large-v3-turbo.bin', url: `${host}/ggml-large-v3-turbo.bin`, sha256: '1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69', size: 1624555275, ramBytes: 12_000_000_000, title: 'Large v3 Turbo Full', detail: '1.62 GB · prototype only', tier: 'maximum' },
]

export const modelFor = (id: WhisperModelId): WhisperModel => {
  const model = whisperModels.find((candidate) => candidate.id === id)
  if (!model) throw new Error(`Unknown Whisper model: ${id}`)
  return model
}

export type ModelStorageInfo = { availableBytes: number; totalBytes: number; ramBytes: number }

export const requiredStorageBytes = (model: WhisperModel): number => model.size * 2 + 256 * 1024 * 1024

export const fitsDevice = (model: WhisperModel, storage: ModelStorageInfo | null): boolean => {
  if (!storage) return false
  return storage.availableBytes >= requiredStorageBytes(model) && storage.ramBytes >= model.ramBytes
}

export const recommendedModel = (storage: ModelStorageInfo | null): WhisperModel =>
  whisperModels.find((model) => model.id === 'fastconformer' && fitsDevice(model, storage))
  ?? [...whisperModels].reverse().find((model) => fitsDevice(model, storage))
  ?? modelFor('tiny')
