import { localFileNameForVariant, type GgufVariant, type PublicGgufModel } from './huggingFaceCatalog'

export const KAZAKH_PACK_MAX_BYTES = 5 * 1024 ** 3
export const QOLDA_COMMIT = 'd59a178a52cb0abf68e6323037907d411a0763f6'

export const qoldaModel: PublicGgufModel = {
  id: 'issai/Qolda_GGUF',
  commit: QOLDA_COMMIT,
  downloads: 0,
  likes: 0,
  license: 'apache-2.0',
  pipelineTag: 'text-generation',
  tags: ['gguf', 'conversational', 'kazakh', 'russian', 'license:apache-2.0'],
}

const qoldaVariant = (quantization: 'Q4_K_M' | 'Q5_K_M', size: number, sha256: string): GgufVariant => ({
  id: `${qoldaModel.id}:${sha256}`,
  repoId: qoldaModel.id,
  commit: QOLDA_COMMIT,
  fileName: `${quantization}/Qolda-${quantization}.gguf`,
  quantization,
  size,
  sha256,
  downloadUrl: `https://huggingface.co/issai/Qolda_GGUF/resolve/${QOLDA_COMMIT}/${quantization}/Qolda-${quantization}.gguf?download=true`,
  localFileName: localFileNameForVariant(sha256, quantization),
})

export const qoldaVariants = {
  balanced: qoldaVariant('Q4_K_M', 2_497_280_576, '670a2c7a8b09bdf70c35b2b4d26a0c3bab182b78164a18266161c3cdb7b1c74d'),
  maximum: qoldaVariant('Q5_K_M', 2_889_513_536, '6e0600a832b8ced6082321648d10c6c85ec1bd850af874038da518d9ff795bbe'),
} as const

export type KazakhPackComponentStatus = 'bundled' | 'downloadable' | 'external_build'

export type KazakhPackComponent = {
  id: string
  title: string
  purpose: string
  bytes: number
  status: KazakhPackComponentStatus
  license: string
}

export const kazakhQualityPackComponents: readonly KazakhPackComponent[] = [
  { id: 'qolda-q5', title: 'Qolda Q5_K_M', purpose: 'Kazakh semantic coprocessor and response critic', bytes: qoldaVariants.maximum.size, status: 'downloadable', license: 'Apache-2.0' },
  { id: 'fastconformer', title: 'FastConformer KZ/RU INT8', purpose: 'Offline Kazakh/Russian speech recognition', bytes: 131_741_652, status: 'downloadable', license: 'model artifact terms' },
  { id: 'ksc2-pack', title: 'KSC2 language pack', purpose: 'Lexicon, phrase statistics, code-switch context', bytes: 621_000, status: 'bundled', license: 'CC BY 4.0' },
  { id: 'til-gec-q4', title: 'Til-2B-GEC Q4', purpose: 'Grammar, spelling and punctuation correction', bytes: 1_300_000_000, status: 'external_build', license: 'Apache-2.0, gated source' },
] as const

export const currentKazakhPackBytes = kazakhQualityPackComponents
  .filter((component) => component.status !== 'external_build')
  .reduce((total, component) => total + component.bytes, 0)

export const plannedKazakhPackBytes = kazakhQualityPackComponents.reduce((total, component) => total + component.bytes, 0)

export function recommendedQoldaVariant(ramBytes: number, availableBytes: number): GgufVariant | null {
  const reserve = 512 * 1024 ** 2
  const usable = Math.max(0, availableBytes - reserve)
  if (ramBytes >= 7 * 1024 ** 3 && qoldaVariants.maximum.size <= usable) return qoldaVariants.maximum
  if (ramBytes >= 6 * 1024 ** 3 && qoldaVariants.balanced.size <= usable) return qoldaVariants.balanced
  return null
}

export function validatesKazakhPackBudget(bytes = plannedKazakhPackBytes): boolean {
  return bytes <= KAZAKH_PACK_MAX_BYTES
}
