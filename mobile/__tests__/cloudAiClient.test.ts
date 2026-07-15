const mockSecureValues = new Map<string, string>()

jest.mock('../src/bridge/SecureStorageBridge', () => ({
  SecureStorage: {
    getItem: jest.fn(async (key: string) => mockSecureValues.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { mockSecureValues.set(key, value); return true }),
    removeItem: jest.fn(async (key: string) => { mockSecureValues.delete(key); return true }),
  },
}))

import {
  generateCloudResponse,
  listCloudModels,
  providerKeyStorageKey,
  saveProviderApiKey,
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

  it('redacts a provider key from API errors', async () => {
    const secret = 'sensitive-api-secret'
    mockSecureValues.set(providerKeyStorageKey('openai'), secret)
    ;(global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ error: { message: `invalid ${secret}` } }, false, 401))

    await expect(generateCloudResponse(
      { providerId: 'openai', modelId: 'gpt-test', modelName: 'Test' },
      'system',
      'user',
    )).rejects.toThrow('invalid [REDACTED]')
  })
})
