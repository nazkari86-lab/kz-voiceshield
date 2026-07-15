export const HUGGING_FACE_ROOT = 'https://huggingface.co'
export const DEFAULT_MODEL_SEARCH = 'Qwen2.5 0.5B Instruct GGUF'
export const MIN_GGUF_BYTES = 32 * 1024 * 1024
export const MAX_GGUF_BYTES = 4 * 1024 * 1024 * 1024

export type PublicGgufModel = {
  id: string
  commit: string
  downloads: number
  likes: number
  license: string
  pipelineTag: string
  tags: string[]
}

export type GgufVariant = {
  id: string
  repoId: string
  commit: string
  fileName: string
  quantization: string
  size: number
  sha256: string
  downloadUrl: string
  localFileName: string
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const finiteNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

const repoPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/
const commitPattern = /^[a-fA-F0-9]{40}$/
const sha256Pattern = /^[a-fA-F0-9]{64}$/
const splitGgufPattern = /-\d{5}-of-\d{5}\.gguf$/i

export function licenseFromTags(tags: readonly string[]): string {
  return tags.find((tag) => tag.toLowerCase().startsWith('license:'))?.slice('license:'.length) || 'не указана'
}

export function parsePublicGgufModels(payload: unknown): PublicGgufModel[] {
  if (!Array.isArray(payload)) return []
  return payload.flatMap((entry): PublicGgufModel[] => {
    if (!record(entry)) return []
    const id = typeof entry.id === 'string' ? entry.id : ''
    const commit = typeof entry.sha === 'string' ? entry.sha : ''
    const tags = Array.isArray(entry.tags) ? entry.tags.filter((tag): tag is string => typeof tag === 'string') : []
    const pipelineTag = typeof entry.pipeline_tag === 'string' ? entry.pipeline_tag : ''
    const gated = entry.gated
    const isGated = gated === true || (typeof gated === 'string' && gated.length > 0)
    const supportsText = !pipelineTag || pipelineTag === 'text-generation' || tags.includes('text-generation') || tags.includes('conversational')
    if (!repoPattern.test(id) || !commitPattern.test(commit) || entry.private === true || isGated || !tags.includes('gguf') || !supportsText) return []
    return [{
      id,
      commit: commit.toLowerCase(),
      downloads: finiteNumber(entry.downloads),
      likes: finiteNumber(entry.likes),
      license: licenseFromTags(tags),
      pipelineTag: pipelineTag || 'text-generation',
      tags,
    }]
  })
}

export function quantizationFromFileName(fileName: string): string {
  const match = fileName.toUpperCase().match(/(?:^|[-_.])((?:IQ|Q)\d(?:_[A-Z0-9]+)*|BF16|F16)(?=[-_.]|$)/)
  return match?.[1] ?? 'GGUF'
}

export function localFileNameForVariant(sha256: string, quantization: string): string {
  const safeQuantization = quantization.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24) || 'model'
  return `hf-${sha256.slice(0, 20).toLowerCase()}-${safeQuantization}.gguf`
}

function encodeRepoId(repoId: string): string {
  return repoId.split('/').map(encodeURIComponent).join('/')
}

function encodeRepoPath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

export function parseGgufVariants(model: PublicGgufModel, payload: unknown): GgufVariant[] {
  if (!Array.isArray(payload)) return []
  const seen = new Set<string>()
  const variants = payload.flatMap((entry): GgufVariant[] => {
    if (!record(entry) || entry.type !== 'file') return []
    const fileName = typeof entry.path === 'string' ? entry.path : ''
    const size = finiteNumber(entry.size)
    const lfs = record(entry.lfs) ? entry.lfs : null
    const sha256 = lfs && typeof lfs.oid === 'string' ? lfs.oid.toLowerCase() : ''
    if (!fileName.toLowerCase().endsWith('.gguf') || splitGgufPattern.test(fileName)) return []
    if (!Number.isSafeInteger(size) || size < MIN_GGUF_BYTES || size > MAX_GGUF_BYTES || !sha256Pattern.test(sha256)) return []
    const uniqueKey = `${sha256}:${size}`
    if (seen.has(uniqueKey)) return []
    seen.add(uniqueKey)
    const quantization = quantizationFromFileName(fileName)
    return [{
      id: `${model.id}:${sha256}`,
      repoId: model.id,
      commit: model.commit,
      fileName,
      quantization,
      size,
      sha256,
      downloadUrl: `${HUGGING_FACE_ROOT}/${encodeRepoId(model.id)}/resolve/${model.commit}/${encodeRepoPath(fileName)}?download=true`,
      localFileName: localFileNameForVariant(sha256, quantization),
    }]
  })
  return variants.sort((left, right) => quantizationRank(left.quantization) - quantizationRank(right.quantization) || left.size - right.size)
}

function quantizationRank(quantization: string): number {
  const ranks: Record<string, number> = {
    Q4_K_M: 0, Q4_K_S: 1, Q5_K_M: 2, Q5_K_S: 3, Q3_K_M: 4,
    IQ4_XS: 5, Q6_K: 6, Q8_0: 7, Q4_0: 8, Q3_K_S: 9,
    IQ3_M: 10, IQ3_XS: 11, Q2_K: 12, IQ2_M: 13, F16: 20, BF16: 21,
  }
  return ranks[quantization] ?? 15
}

async function fetchJson(url: string, signal: AbortSignal | undefined, fetcher: FetchLike): Promise<unknown> {
  const response = await fetcher(url, { headers: { Accept: 'application/json' }, signal })
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error('Модель закрыта или требует принятия лицензии на Hugging Face.')
    if (response.status === 404) throw new Error('Репозиторий модели больше не доступен.')
    throw new Error(`Hugging Face временно недоступен (${response.status}).`)
  }
  return response.json() as Promise<unknown>
}

export async function searchPublicGgufModels(
  query: string,
  signal?: AbortSignal,
  fetcher: FetchLike = fetch,
): Promise<PublicGgufModel[]> {
  const cleanQuery = query.trim() || DEFAULT_MODEL_SEARCH
  const url = `${HUGGING_FACE_ROOT}/api/models?filter=gguf&search=${encodeURIComponent(cleanQuery)}&sort=downloads&direction=-1&limit=12&full=true`
  return parsePublicGgufModels(await fetchJson(url, signal, fetcher))
}

export async function loadGgufVariants(
  model: PublicGgufModel,
  signal?: AbortSignal,
  fetcher: FetchLike = fetch,
): Promise<GgufVariant[]> {
  const url = `${HUGGING_FACE_ROOT}/api/models/${encodeRepoId(model.id)}/tree/${model.commit}?recursive=true`
  return parseGgufVariants(model, await fetchJson(url, signal, fetcher))
}

export function recommendedModelBytes(ramBytes: number): number {
  const gib = ramBytes / (1024 ** 3)
  if (gib < 4) return 650 * 1024 * 1024
  if (gib < 6) return 1024 * 1024 * 1024
  if (gib < 8) return 1536 * 1024 * 1024
  if (gib < 12) return 2560 * 1024 * 1024
  return 3584 * 1024 * 1024
}

export function formatModelBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / (1024 ** 3)).toFixed(1)} ГБ`
  return `${Math.round(bytes / (1024 ** 2))} МБ`
}
