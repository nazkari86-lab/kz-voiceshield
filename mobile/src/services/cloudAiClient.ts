import { SecureStorage } from '../bridge/SecureStorageBridge'
import {
  cloudProviderById,
  type CloudModel,
  type CloudModelConfig,
  type CloudProvider,
  type CloudProviderId,
  type CloudSpeechModelConfig,
} from '../data/cloudAiProviders'
import { redactSensitiveText } from '../scoring'

const KEY_PREFIX = 'voiceshield.cloud-api-key.'
const DATA_CONSENT_PREFIX = 'voiceshield.cloud-data-consent.v1.'
const LIVE_CONSENT_PREFIX = 'voiceshield.cloud-live-consent.v1.'
const REQUEST_TIMEOUT_MS = 90_000
const REQUEST_TIMEOUT_SECONDS = REQUEST_TIMEOUT_MS / 1_000
export const CLOUD_OUTPUT_TOKEN_BUDGET = 1_600
const MAX_CLOUD_CONTINUATIONS = 2
export const ACTIVE_CLOUD_SPEECH_MODEL_KEY = 'voiceshield.cloud-speech-model.v1'

type JsonRecord = Record<string, unknown>

const asRecord = (value: unknown): JsonRecord => value && typeof value === 'object' ? value as JsonRecord : {}
const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : []
const asString = (value: unknown): string => typeof value === 'string' ? value : ''
const asNumber = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null

export const providerKeyStorageKey = (providerId: CloudProviderId): string => `${KEY_PREFIX}${providerId}`
export const providerDataConsentStorageKey = (providerId: CloudProviderId): string => `${DATA_CONSENT_PREFIX}${providerId}`
export const providerLiveConsentStorageKey = (providerId: CloudProviderId): string => `${LIVE_CONSENT_PREFIX}${providerId}`

export async function hasProviderDataConsent(providerId: CloudProviderId): Promise<boolean> {
  return await SecureStorage.getItem(providerDataConsentStorageKey(providerId)) === 'accepted'
}

export async function setProviderDataConsent(providerId: CloudProviderId, accepted: boolean): Promise<void> {
  if (accepted) await SecureStorage.setItem(providerDataConsentStorageKey(providerId), 'accepted')
  else await Promise.all([
    SecureStorage.removeItem(providerDataConsentStorageKey(providerId)),
    SecureStorage.removeItem(providerLiveConsentStorageKey(providerId)),
  ])
}

export async function hasProviderLiveConsent(providerId: CloudProviderId): Promise<boolean> {
  return await SecureStorage.getItem(providerLiveConsentStorageKey(providerId)) === 'accepted'
}

export async function setProviderLiveConsent(providerId: CloudProviderId, accepted: boolean): Promise<void> {
  if (accepted) await SecureStorage.setItem(providerLiveConsentStorageKey(providerId), 'accepted')
  else await SecureStorage.removeItem(providerLiveConsentStorageKey(providerId))
}

export function prepareCloudUserMessage(message: string): string {
  return redactSensitiveText(message)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, '[REDACTED EMAIL]')
    .replace(/(?:https?:\/\/)?(?:t\.me|wa\.me)\/[^\s]+/giu, '[REDACTED LINK]')
}

export async function hasProviderApiKey(providerId: CloudProviderId): Promise<boolean> {
  return Boolean(await SecureStorage.getItem(providerKeyStorageKey(providerId)))
}

export async function saveProviderApiKey(providerId: CloudProviderId, rawKey: string): Promise<void> {
  const key = rawKey.trim()
  if (key.length < 8 || key.length > 4096 || /\s/u.test(key)) throw new Error('API-ключ имеет недопустимый формат.')
  await SecureStorage.setItem(providerKeyStorageKey(providerId), key)
}

export async function removeProviderApiKey(providerId: CloudProviderId): Promise<void> {
  await Promise.all([
    SecureStorage.removeItem(providerKeyStorageKey(providerId)),
    setProviderDataConsent(providerId, false),
    setProviderLiveConsent(providerId, false),
  ])
}

export async function getActiveCloudSpeechModel(): Promise<CloudSpeechModelConfig | null> {
  const raw = await SecureStorage.getItem(ACTIVE_CLOUD_SPEECH_MODEL_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<CloudSpeechModelConfig>
    if ((parsed.providerId === 'openai' || parsed.providerId === 'groq' || parsed.providerId === 'mistral')
      && typeof parsed.modelId === 'string' && typeof parsed.name === 'string') {
      return { providerId: parsed.providerId, modelId: parsed.modelId, name: parsed.name }
    }
  } catch { /* corrupted preference is ignored */ }
  return null
}

export async function setActiveCloudSpeechModel(config: CloudSpeechModelConfig | null): Promise<void> {
  if (!config) await SecureStorage.removeItem(ACTIVE_CLOUD_SPEECH_MODEL_KEY)
  else await SecureStorage.setItem(ACTIVE_CLOUD_SPEECH_MODEL_KEY, JSON.stringify(config))
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
      throw new Error(`AI API не ответил за ${REQUEST_TIMEOUT_SECONDS} секунд.`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
    init?.signal?.removeEventListener('abort', relayAbort)
  }
}

function speechResponseText(payload: unknown): string {
  const root = asRecord(payload)
  return asString(root.text) || extractOpenAiText(payload)
}

export async function transcribeCloudAudio(
  config: CloudSpeechModelConfig,
  uri: string,
  fileName = 'voice-message.ogg',
  mimeType = 'audio/ogg',
  language = 'kk',
): Promise<{ transcript: string; confidence: number | null }> {
  const provider = cloudProviderById[config.providerId]
  if (!await hasProviderDataConsent(config.providerId)) {
    throw new Error(`CLOUD_CONSENT_REQUIRED: подтвердите передачу аудио в ${provider.title}.`)
  }
  const apiKey = await readProviderApiKey(config.providerId)
  const body = new FormData()
  body.append('file', { uri, name: fileName, type: mimeType } as unknown as Blob)
  body.append('model', config.modelId)
  body.append('language', language)
  body.append('response_format', config.modelId.startsWith('gpt-4o-') ? 'json' : 'verbose_json')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${provider.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: authHeaders(provider, apiKey),
      body,
      signal: controller.signal,
    })
    const payload: unknown = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(safeErrorMessage(payload, response.status, apiKey))
    const root = asRecord(payload)
    const transcript = speechResponseText(payload).trim()
    if (!transcript) throw new Error('Speech API вернул пустую транскрипцию.')
    const segments = asArray(root.segments)
    const logprobs = asArray(root.logprobs)
    const confidence = logprobs.length > 0
      ? Math.round(Math.max(0, Math.min(100, Math.exp(asNumber(asRecord(logprobs[0]).logprob) ?? -1) * 100)))
      : segments.length > 0 ? 90 : null
    return { transcript, confidence }
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw new Error(`Speech API не ответил за ${REQUEST_TIMEOUT_SECONDS} секунд.`)
    throw error
  } finally {
    clearTimeout(timeout)
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

function outputWasTruncated(provider: CloudProvider, payload: unknown): boolean {
  const root = asRecord(payload)
  if (provider.apiStyle === 'anthropic') return asString(root.stop_reason) === 'max_tokens'
  if (provider.apiStyle === 'gemini') {
    const candidate = asRecord(asArray(root.candidates)[0])
    return /max.?tokens?/iu.test(asString(candidate.finishReason))
  }
  const choice = asRecord(asArray(root.choices)[0])
  const finishDetails = asRecord(choice.finish_details)
  return asString(choice.finish_reason) === 'length' || asString(finishDetails.type) === 'length'
}

function appendContinuation(previous: string, next: string): string {
  if (!next || previous.includes(next)) return previous
  const longestPossibleOverlap = Math.min(previous.length, next.length, 1_200)
  for (let length = longestPossibleOverlap; length >= 24; length -= 1) {
    if (previous.slice(-length) === next.slice(0, length)) return `${previous}${next.slice(length)}`
  }
  return `${previous}\n\n${next}`
}

export async function generateCloudResponse(
  config: CloudModelConfig,
  systemPrompt: string,
  userMessage: string,
  signal?: AbortSignal,
): Promise<string> {
  const provider = cloudProviderById[config.providerId]
  if (!await hasProviderDataConsent(config.providerId)) {
    throw new Error(`CLOUD_CONSENT_REQUIRED: подтвердите передачу обезличенного текста в ${provider.title}.`)
  }
  const apiKey = await readProviderApiKey(config.providerId)
  const safeUserMessage = prepareCloudUserMessage(userMessage)
  const continuationInstruction = 'Continue exactly where your previous answer ended. Do not repeat it. Finish the requested answer completely.'
  const buildRequest = (previousResponse = ''): { url: string; body: JsonRecord; extract: (payload: unknown) => string } => {
    if (provider.apiStyle === 'anthropic') {
      const messages = previousResponse
        ? [{ role: 'user', content: safeUserMessage }, { role: 'assistant', content: previousResponse }, { role: 'user', content: continuationInstruction }]
        : [{ role: 'user', content: safeUserMessage }]
      return { url: `${provider.baseUrl}/messages`, body: { model: config.modelId, max_tokens: CLOUD_OUTPUT_TOKEN_BUDGET, system: systemPrompt, messages }, extract: extractAnthropicText }
    }
    if (provider.apiStyle === 'gemini') {
      const contents = previousResponse
        ? [{ role: 'user', parts: [{ text: safeUserMessage }] }, { role: 'model', parts: [{ text: previousResponse }] }, { role: 'user', parts: [{ text: continuationInstruction }] }]
        : [{ role: 'user', parts: [{ text: safeUserMessage }] }]
      return {
        url: `${provider.baseUrl}/models/${encodeURIComponent(config.modelId)}:generateContent`,
        body: { systemInstruction: { parts: [{ text: systemPrompt }] }, contents, generationConfig: { maxOutputTokens: CLOUD_OUTPUT_TOKEN_BUDGET, temperature: 0.2 } },
        extract: extractGeminiText,
      }
    }
    const openAiReasoningModel = provider.id === 'openai' && /^(gpt-5|o[1345](?:-|$))/iu.test(config.modelId)
    const messages = previousResponse
      ? [{ role: 'system', content: systemPrompt }, { role: 'user', content: safeUserMessage }, { role: 'assistant', content: previousResponse }, { role: 'user', content: continuationInstruction }]
      : [{ role: 'system', content: systemPrompt }, { role: 'user', content: safeUserMessage }]
    return {
      url: `${provider.baseUrl}/chat/completions`,
      body: { model: config.modelId, messages, ...(openAiReasoningModel ? { max_completion_tokens: CLOUD_OUTPUT_TOKEN_BUDGET } : { max_tokens: CLOUD_OUTPUT_TOKEN_BUDGET, temperature: 0.2 }), stream: false },
      extract: extractOpenAiText,
    }
  }

  let request = buildRequest()
  let payload = await requestJson(request.url, provider, apiKey, { method: 'POST', body: JSON.stringify(request.body), signal })
  let result = request.extract(payload)
  if (!result) throw new Error('AI API вернул пустой ответ.')
  for (let attempt = 0; outputWasTruncated(provider, payload) && attempt < MAX_CLOUD_CONTINUATIONS; attempt += 1) {
    request = buildRequest(result)
    payload = await requestJson(request.url, provider, apiKey, { method: 'POST', body: JSON.stringify(request.body), signal })
    const continuation = request.extract(payload)
    if (!continuation) break
    result = appendContinuation(result, continuation)
  }
  if (outputWasTruncated(provider, payload)) {
    result = `${result}\n\n[AI reached the provider output limit. Ask it to continue for the remaining analysis.]`
  }
  return result
}
