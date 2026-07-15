jest.mock('@pocketpalai/llama.rn', () => ({ initLlama: jest.fn() }))

import { generateLocalResponse, parseInstalledLocalModels, sanitizeLocalOutput } from '../src/bridge/LocalLlmBridge'

describe('local model library', () => {
  it('restores only valid local model records', () => {
    const models = parseInstalledLocalModels(JSON.stringify([
      {
        id: 'model-1', title: 'Qwen 0.5B', repoId: 'Qwen/model', fileName: 'hf-a-Q4_K_M.gguf',
        sourceFileName: 'model-Q4_K_M.gguf', quantization: 'Q4_K_M', size: 400_000_000,
        sha256: 'a'.repeat(64), license: 'apache-2.0', downloadedAt: '2026-07-15T00:00:00.000Z', source: 'huggingface',
      },
      { id: 'bad', fileName: '../model.gguf' },
    ]))
    expect(models).toHaveLength(1)
    expect(models[0]?.quantization).toBe('Q4_K_M')
  })

  it('handles malformed storage without crashing', () => {
    expect(parseInstalledLocalModels('{broken')).toEqual([])
    expect(parseInstalledLocalModels(null)).toEqual([])
  })

  it('deduplicates records that point to the same local file', () => {
    const base = {
      id: 'model-1', title: 'Qwen 0.5B', repoId: 'Qwen/model', fileName: 'hf-a-Q4_K_M.gguf',
      sourceFileName: 'model-Q4_K_M.gguf', quantization: 'Q4_K_M', size: 400_000_000,
      sha256: 'a'.repeat(64), license: 'apache-2.0', downloadedAt: '2026-07-15T00:00:00.000Z', source: 'huggingface',
    }
    const models = parseInstalledLocalModels(JSON.stringify([base, { ...base, id: 'duplicate' }]))
    expect(models).toHaveLength(1)
    expect(models[0]?.id).toBe('model-1')
  })

  it('uses the GGUF embedded chat template and removes control tokens', async () => {
    const completion = jest.fn(async (_params, callback: (data: { token: string }) => void) => {
      callback({ token: 'Отключите звонок.' })
      callback({ token: '<end_of_turn>' })
      return { text: 'Отключите звонок.<end_of_turn>model\nПовтор' }
    })
    const context = { completion, isJinjaSupported: () => true }
    const tokens: string[] = []
    const result = await generateLocalResponse(context as never, 'Системные правила', 'Что делать?', token => tokens.push(token))

    expect(completion).toHaveBeenCalledWith(expect.objectContaining({
      messages: [
        { role: 'system', content: 'Системные правила' },
        { role: 'user', content: 'Что делать?' },
      ],
      jinja: true,
      add_generation_prompt: true,
      n_predict: 192,
      penalty_repeat: 1.12,
    }), expect.any(Function))
    expect(tokens).toEqual(['Отключите звонок.'])
    expect(result).toBe('Отключите звонок.')
    expect(sanitizeLocalOutput('<think>draft</think> assistant: Ответ')).toBe('Ответ')
  })
})
