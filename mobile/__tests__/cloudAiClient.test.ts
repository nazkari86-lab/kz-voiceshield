const mockSecureValues = new Map<string, string>()

jest.mock('../src/bridge/SecureStorageBridge', () => ({
  SecureStorage: {
    getItem: jest.fn(async (key: string) => mockSecureValues.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { mockSecureValues.set(key, value); return true }),
    removeItem: jest.fn(async (key: string) => { mockSecureValues.delete(key); return true }),
  },
}))

import {
  CLOUD_OUTPUT_TOKEN_BUDGET,
  generateCloudResponse,
  listCloudModels,
  prepareCloudUserMessage,
  providerDataConsentStorageKey,
  providerKeyStorageKey,
  providerLiveConsentStorageKey,
  removeProviderApiKey,
  saveProviderApiKey,
  setProviderDataConsent,
  setProviderLiveConsent,
  transcribeCloudAudio,
} from '../src/services/cloudAiClient'

const jsonResponse = (payload: unknown, ok = true, status = 200) => ({
  json: jest.fn(async () => payload),
  ok,
  status,
})

describe('cloud AI client', () => {
  beforeEach(() => {
    mockSecureValues.clear()
    global.fetch = jest.fn() as typeof fetch
  })

  it('stores provider keys only through secure storage', async () => {
    await saveProviderApiKey('openai', 'sk-test-secret')
    expect(mockSecureValues.get(providerKeyStorageKey('openai'))).toBe('sk-test-secret')
    expect(providerKeyStorageKey('openai')).toContain('openai')
  })

  it('revokes provider and Live AI consent when access is disabled', async () => {
    await saveProviderApiKey('openai', 'sk-test-secret')
    await setProviderDataConsent('openai', true)
    await setProviderLiveConsent('openai', true)

    await removeProviderApiKey('openai')

    expect(mockSecureValues.has(providerKeyStorageKey('openai'))).toBe(false)
    expect(mockSecureValues.has(providerDataConsentStorageKey('openai'))).toBe(false)
    expect(mockSecureValues.has(providerLiveConsentStorageKey('openai'))).toBe(false)
  })

  it('parses OpenRouter free and paid model metadata', async () => {
    mockSecureValues.set(providerKeyStorageKey('openrouter'), 'or-test-secret')
    ;(global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ data: [
      { id: 'vendor/free:free', name: 'Free', context_length: 32768, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools'] },
      { id: 'vendor/paid', name: 'Paid', pricing: { prompt: '0.000001', completion: '0.000002' } },
    ] }))

    const models = await listCloudModels('openrouter')

    expect(models).toHaveLength(2)
    expect(models[0]).toMatchObject({ id: 'vendor/free:free', free: true, contextLength: 32768 })
    expect(models[0].capabilities).toContain('tools')
    expect(models[1]).toMatchObject({ id: 'vendor/paid', free: false })
  })

  it.each([
    ['openai', 'https://api.openai.com/v1/chat/completions', 'Authorization', 'Bearer openai-secret', { choices: [{ message: { content: 'OpenAI result' } }] }, 'OpenAI result'],
    ['anthropic', 'https://api.anthropic.com/v1/messages', 'x-api-key', 'anthropic-secret', { content: [{ type: 'text', text: 'Claude result' }] }, 'Claude result'],
    ['gemini', 'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent', 'x-goog-api-key', 'gemini-secret', { candidates: [{ content: { parts: [{ text: 'Gemini result' }] } }] }, 'Gemini result'],
  ] as const)('uses the official %s protocol', async (providerId, expectedUrl, header, expectedHeader, payload, expectedText) => {
    mockSecureValues.set(providerKeyStorageKey(providerId), `${providerId}-secret`)
    mockSecureValues.set(providerDataConsentStorageKey(providerId), 'accepted')
    ;(global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(payload))

    const result = await generateCloudResponse(
      { providerId, modelId: providerId === 'gemini' ? 'gemini-test' : 'model-test', modelName: 'Test' },
      'system',
      'user',
    )

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe(expectedUrl)
    expect(init.headers[header]).toBe(expectedHeader)
    expect(result).toBe(expectedText)
  })

  it('uploads an explicitly selected audio file to Groq Whisper Turbo', async () => {
    mockSecureValues.set(providerKeyStorageKey('groq'), 'gsk-test-secret')
    mockSecureValues.set(providerDataConsentStorageKey('groq'), 'accepted')
    ;(global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ text: 'Қауіпсіздік кодыңызды айтыңыз', segments: [{ text: 'x' }] }))

    const result = await transcribeCloudAudio(
      { providerId: 'groq', modelId: 'whisper-large-v3-turbo', name: 'Whisper Large v3 Turbo' },
      'content://selected-audio',
      'call.ogg',
      'audio/ogg',
      'kk',
    )

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('https://api.groq.com/openai/v1/audio/transcriptions')
    expect(init.headers.Authorization).toBe('Bearer gsk-test-secret')
    expect(init.body).toBeInstanceOf(FormData)
    expect(result).toMatchObject({ transcript: 'Қауіпсіздік кодыңызды айтыңыз', confidence: 90 })
  })

  it('redacts a provider key from API errors', async () => {
    const secret = 'sensitive-api-secret'
    mockSecureValues.set(providerKeyStorageKey('openai'), secret)
    mockSecureValues.set(providerDataConsentStorageKey('openai'), 'accepted')
    ;(global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ error: { message: `invalid ${secret}` } }, false, 401))

    await expect(generateCloudResponse(
      { providerId: 'openai', modelId: 'gpt-test', modelName: 'Test' },
      'system',
      'user',
    )).rejects.toThrow('invalid [REDACTED]')
  })

  it('blocks generation until provider-specific data consent exists', async () => {
    mockSecureValues.set(providerKeyStorageKey('openai'), 'openai-secret')

    await expect(generateCloudResponse(
      { providerId: 'openai', modelId: 'gpt-test', modelName: 'Test' },
      'system',
      'user',
    )).rejects.toThrow('CLOUD_CONSENT_REQUIRED')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('redacts sensitive transcript data before transmission', async () => {
    mockSecureValues.set(providerKeyStorageKey('openai'), 'openai-secret')
    mockSecureValues.set(providerDataConsentStorageKey('openai'), 'accepted')
    ;(global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: 'ok' } }] }))

    await generateCloudResponse(
      { providerId: 'openai', modelId: 'gpt-test', modelName: 'Test' },
      'system',
      'SMS код 123456, карта 4400 1234 5678 9012, test@example.com, t.me/private-user',
    )

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
    const sent = body.messages[1].content as string
    expect(sent).not.toContain('123456')
    expect(sent).not.toContain('4400 1234 5678 9012')
    expect(sent).not.toContain('test@example.com')
    expect(sent).not.toContain('t.me/private-user')
    expect(prepareCloudUserMessage('код 1234')).toContain('[REDACTED]')
  })

  it('continues a cloud answer when the provider reports an output length limit', async () => {
    mockSecureValues.set(providerKeyStorageKey('openai'), 'openai-secret')
    mockSecureValues.set(providerDataConsentStorageKey('openai'), 'accepted')
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: 'Первый законченный фрагмент.' }, finish_reason: 'length' }] }))
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: 'Второй фрагмент с итогом.' }, finish_reason: 'stop' }] }))

    const result = await generateCloudResponse(
      { providerId: 'openai', modelId: 'gpt-test', modelName: 'Test' },
      'system',
      'user',
    )

    expect(result).toContain('Первый законченный фрагмент.')
    expect(result).toContain('Второй фрагмент с итогом.')
    expect(global.fetch).toHaveBeenCalledTimes(2)
    const firstBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
    const continuationBody = JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body)
    expect(firstBody.max_tokens).toBe(CLOUD_OUTPUT_TOKEN_BUDGET)
    expect(continuationBody.messages.at(-1).content).toContain('Continue exactly')
  })
})
