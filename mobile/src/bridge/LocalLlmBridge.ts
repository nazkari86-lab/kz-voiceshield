import { initLlama, type LlamaContext } from '@pocketpalai/llama.rn'

export const LOCAL_IMPORTED_MODEL_FILE = 'voiceshield-local.gguf'
export const LEGACY_GGUF_MODEL_FILE = 'voiceshield-pocketpal.gguf'
export const LOCAL_MODELS_STORAGE_KEY = 'voiceshield.local-models.v1'

export type InstalledLocalModel = {
  id: string
  title: string
  repoId: string
  fileName: string
  sourceFileName: string
  quantization: string
  size: number
  sha256: string
  license: string
  downloadedAt: string
  source: 'huggingface' | 'imported' | 'legacy'
}

const stopWords = [
  '</s>', '<|end|>', '<|eot_id|>', '<|end_of_text|>', '<|im_end|>', '<|EOT|>',
  '<|END_OF_TURN_TOKEN|>', '<|end_of_turn|>', '<|endoftext|>', '<end_of_turn>', '<start_of_turn>',
]
const controlMarkers = stopWords.filter((word) => word !== '</s>')
const safeFileName = /^[A-Za-z0-9._-]{1,120}$/
const sha256 = /^[a-fA-F0-9]{64}$/

export function parseInstalledLocalModels(raw: string | null): InstalledLocalModel[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const valid = parsed.filter((item): item is InstalledLocalModel => {
      if (typeof item !== 'object' || item === null) return false
      const value = item as Partial<InstalledLocalModel>
      return typeof value.id === 'string' && typeof value.title === 'string' &&
        typeof value.repoId === 'string' && typeof value.fileName === 'string' && safeFileName.test(value.fileName) &&
        typeof value.sourceFileName === 'string' && typeof value.quantization === 'string' &&
        typeof value.size === 'number' && Number.isFinite(value.size) && value.size >= 0 &&
        typeof value.sha256 === 'string' && (value.sha256 === '' || sha256.test(value.sha256)) &&
        typeof value.license === 'string' && typeof value.downloadedAt === 'string' &&
        (value.source === 'huggingface' || value.source === 'imported' || value.source === 'legacy')
    })
    const ids = new Set<string>()
    const files = new Set<string>()
    return valid.filter((model) => {
      if (ids.has(model.id) || files.has(model.fileName)) return false
      ids.add(model.id)
      files.add(model.fileName)
      return true
    })
  } catch {
    return []
  }
}

export async function loadLocalGgufModel(modelPath: string): Promise<LlamaContext> {
  return initLlama({
    model: modelPath,
    n_ctx: 2048,
    n_batch: 256,
    n_threads: 4,
    n_gpu_layers: 0,
    use_mmap: true,
    use_mlock: false,
    flash_attn_type: 'off',
  })
}

export async function generateLocalResponse(
  context: LlamaContext,
  systemPrompt: string,
  userMessage: string,
  onToken: (token: string) => void,
): Promise<string> {
  const result = await context.completion({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    jinja: context.isJinjaSupported(),
    add_generation_prompt: true,
    enable_thinking: false,
    n_predict: 192,
    temperature: 0.2,
    top_k: 40,
    top_p: 0.9,
    penalty_last_n: 128,
    penalty_repeat: 1.12,
    stop: stopWords,
  }, data => {
    const token = truncateAtControlMarker(data.token)
    if (token) onToken(token)
  })
  return sanitizeLocalOutput(result.text)
}

function truncateAtControlMarker(text: string): string {
  const lower = text.toLowerCase()
  const firstMarker = controlMarkers.reduce((earliest, marker) => {
    const index = lower.indexOf(marker.toLowerCase())
    return index >= 0 && (earliest < 0 || index < earliest) ? index : earliest
  }, -1)
  return firstMarker >= 0 ? text.slice(0, firstMarker) : text
}

export function sanitizeLocalOutput(text: string): string {
  return truncateAtControlMarker(text)
    .replace(/<think>[\s\S]*?<\/think>\s*/gi, '')
    .replace(/^(?:assistant|model)\s*:?\s*/i, '')
    .trim()
}
