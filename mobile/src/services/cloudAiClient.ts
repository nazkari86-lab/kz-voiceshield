import { SecureStorage } from '../bridge/SecureStorageBridge'
import {
  cloudProviderById,
  type CloudModel,
  type CloudModelConfig,
  type CloudProvider,
  type CloudProviderId,
} from '../data/cloudAiProviders'

const KEY_PREFIX = 'voiceshield.cloud-api-key.'
const REQUEST_TIMEOUT_MS = 60_000

type JsonRecord = Record<string, unknown>

const asRecord = (value: unknown): JsonRecord => value && typeof value === 'object' ? value as JsonRecord : {}
const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : []
const asString = (value: unknown): string => typeof value === 'string' ? value : ''
const asNumber = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null

export const providerKeyStorageKey = (providerId: CloudProviderId): string => `${KEY_PREFIX}${providerId}`

export async function hasProviderApiKey(providerId: CloudProviderId): Promise<boolean> {
  return Boolean(await SecureStorage.getItem(providerKeyStorageKey(providerId)))
}

export async function saveProviderApiKey(providerId: CloudProviderId, rawKey: string): Promise<void> {
  const key = rawKey.trim()
  if (key.length < 8 || key.length > 4096 || /\s/u.test(key)) throw new Error('API-ключ имеет недопустимый формат.')
  await SecureStorage.setItem(providerKeyStorageKey(providerId), key)
}

export async function removeProviderApiKey(providerId: CloudProviderId): Promise<void> {
  await SecureStorage.removeItem(providerKeyStorageKey(providerId))
}

async function readProviderApiKey(providerId: CloudProviderId): Promise<string> {
  const key = await SecureStorage.getItem(providerKeyStorageKey(providerId))
  if (!key) throw new Error('API_KEY_MISSING: добавьте ключ выбранного провайдера.')
  return key
}

function authHeaders(provider: CloudProvider, apiKey: string): Record<string, string> {
  if (provider.apiStyle === 'anthropic') {
    return { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
  }
  if (provider.apiStyle === 'gemini') return { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }
  if (provider.id === 'openrouter') {
    headers['HTTP-Referer'] = 'https://github.com/nazkari86-lab/kz-voiceshield'
    headers['X-OpenRouter-Title'] = 'KZ VoiceShield'
  }
  return headers
}

function safeErrorMessage(payload: unknown, status: number, apiKey: string): string {
  const root = asRecord(payload)
  const nested = asRecord(root.error)
  const message = asString(nested.message) || asString(root.message) || `HTTP ${status}`
  return message.replaceAll(apiKey, '[REDACTED]').replace(/[\r\n]+/gu, ' ').slice(0, 320)
}

async function requestJson(url: string, provider: CloudProvider, apiKey: string, init?: RequestInit): Promise<unknown> {
  const controller = new AbortController()
  let timedOut = false
  const relayAbort = () => controller.abort()
  init?.signal?.addEventListener('abort', relayAbort, { once: true })
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      ...init,
      headers: { ...authHeaders(provider, apiKey), ...(init?.headers ?? {}) },
      signal: controller.signal,
    })
    const payload: unknown = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(safeErrorMessage(payload, response.status, apiKey))
    return payload
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      if (!timedOut && init?.signal?.aborted) throw new Error('AI generation cancelled.')
      throw new Error('AI API не ответил за 60 секунд.')
    }
    throw error
  } finally {
    clearTimeout(timeout)
    init?.signal?.removeEventListener('abort', relayAbort)
  }
}

function textModelAllowed(providerId: CloudProviderId, id: string, raw: JsonRecord): boolean {
  if (!id) return false
  if (providerId === 'gemini') {
    return asArray(raw.supportedGenerationMethods).some((method) => method === 'generateContent')
  }
  if (providerId === 'groq') return !/(whisper|guard|tts|speech)/iu.test(id)
  if (providerId === 'xai') return !/(image|video)/iu.test(id)
  if (providerId === 'mistral') {
    const capabilities = asRecord(raw.capabilities)
    return raw.archived !== true && capabilities.completion_chat !== false
  }
  if (providerId === 'openai') {
    return /^(gpt-|chatgpt-|o[1345](?:-|$))/iu.test(id)
      && !/(embedding|moderation|whisper|tts|transcri|realtime|audio|image)/iu.test(id)
  }
  return true
}

function price(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function modelFromApi(providerId: CloudProviderId, value: unknown): CloudModel | null {
  const raw = asRecord(value)
  const rawId = asString(raw.id) || asString(raw.name)
  const id = providerId === 'gemini' ? rawId.replace(/^models\//u, '') : rawId
  if (!textModelAllowed(providerId, id, raw)) return null
  const pricing = asRecord(raw.pricing)
  const prompt = price(pricing.prompt ?? pricing.input)
  const completion = price(pricing.completion ?? pricing.output)
  const free = id.endsWith(':free') || (prompt === 0 && completion === 0)
  const perMillion = prompt === null ? null : prompt * 1_000_000
  const supported = asArray(raw.supported_parameters).filter((item): item is string => typeof item === 'string')
  const capabilities = asRecord(raw.capabilities)
  const capabilityNames = Object.entries(capabilities).filter(([, enabled]) => enabled === true).map(([name]) => name)
  return {
    id,
    name: asString(raw.displayName) || asString(raw.name) || id,
    contextLength: asNumber(raw.context_length) ?? asNumber(raw.inputTokenLimit) ?? asNumber(raw.max_context_length),
    free,
    priceLabel: free ? 'Бесплатная' : perMillion === null ? 'Цена аккаунта' : `от $${perMillion.toFixed(perMillion < 1 ? 2 : 1)}/1M input`,
    capabilities: [...new Set([...supported, ...capabilityNames])].slice(0, 8),
  }
}

export async function listCloudModels(providerId: CloudProviderId, temporaryKey?: string): Promise<CloudModel[]> {
  const provider = cloudProviderById[providerId]
  const key = temporaryKey?.trim() || await readProviderApiKey(providerId)
  const payload = asRecord(await requestJson(provider.modelsUrl, provider, key))
  const models = asArray(payload.data).length > 0 ? asArray(payload.data) : asArray(payload.models)
  return models
    .map((item) => modelFromApi(providerId, item))
    .filter((item): item is CloudModel => item !== null)
    .sort((a, b) => Number(b.free) - Number(a.free) || a.name.localeCompare(b.name))
}

function extractOpenAiText(payload: unknown): string {
  const choice = asRecord(asArray(asRecord(payload).choices)[0])
  const content = asRecord(choice.message).content
  if (typeof content === 'string') return content.trim()
  return asArray(content).map((part) => asString(asRecord(part).text)).filter(Boolean).join('\n').trim()
}

function extractAnthropicText(payload: unknown): string {
  return asArray(asRecord(payload).content).map((part) => asString(asRecord(part).text)).filter(Boolean).join('\n').trim()
}

function extractGeminiText(payload: unknown): string {
  const candidate = asRecord(asArray(asRecord(payload).candidates)[0])
  return asArray(asRecord(candidate.content).parts).map((part) => asString(asRecord(part).text)).filter(Boolean).join('\n').trim()
}

export async function generateCloudResponse(
  config: CloudModelConfig,
  systemPrompt: string,
  userMessage: string,
  signal?: AbortSignal,
): Promise<string> {
  const provider = cloudProviderById[config.providerId]
  const apiKey = await readProviderApiKey(config.providerId)
  let url: string
  let body: JsonRecord
  let extract: (payload: unknown) => string

  if (provider.apiStyle === 'anthropic') {
    url = `${provider.baseUrl}/messages`
    body = { model: config.modelId, max_tokens: 700, system: systemPrompt, messages: [{ role: 'user', content: userMessage }] }
    extract = extractAnthropicText
  } else if (provider.apiStyle === 'gemini') {
    url = `${provider.baseUrl}/models/${encodeURIComponent(config.modelId)}:generateContent`
    body = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      generationConfig: { maxOutputTokens: 700, temperature: 0.2 },
    }
    extract = extractGeminiText
  } else {
    url = `${provider.baseUrl}/chat/completions`
    const openAiReasoningModel = provider.id === 'openai' && /^(gpt-5|o[1345](?:-|$))/iu.test(config.modelId)
    body = {
      model: config.modelId,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
      ...(openAiReasoningModel ? { max_completion_tokens: 700 } : { max_tokens: 700, temperature: 0.2 }),
      stream: false,
    }
    extract = extractOpenAiText
  }

  const result = extract(await requestJson(url, provider, apiKey, { method: 'POST', body: JSON.stringify(body), signal }))
  if (!result) throw new Error('AI API вернул пустой ответ.')
  return result
}
