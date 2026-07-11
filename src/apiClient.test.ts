import { beforeEach, describe, expect, it, vi } from 'vitest'

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  headers: { 'Content-Type': 'application/json' },
  status,
})

describe('backend adapter', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    vi.stubEnv('VITE_VOICESHIELD_API_URL', 'https://api.example.test')
    vi.stubEnv('VITE_VOICESHIELD_API_TOKEN', 'test-token')
  })

  it('sends bearer auth and normalizes ML assessment', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      ml: { confidence: 87.6, model: 'baseline', score: 91.2, signals: ['transfer'], verdict: 'fraud' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const { analyzeTranscriptWithBackend } = await import('./apiClient')

    const result = await analyzeTranscriptWithBackend('Назовите код', {} as never)

    expect(result.ml).toMatchObject({ confidence: 88, score: 91, verdict: 'fraud' })
    const headers = new Headers(fetchMock.mock.calls[0][1].headers)
    expect(headers.get('Authorization')).toBe('Bearer test-token')
  })

  it('polls queued audio jobs until a transcript is ready', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ jobId: 'job-1', status: 'queued' }, 202))
      .mockResolvedValueOnce(response({
        jobId: 'job-1',
        ml: { confidence: 80, model: 'baseline', score: 70, signals: [], verdict: 'fraud' },
        status: 'completed',
        transcript: 'Готовый текст',
        transcriptConfidence: 93,
      }))
    vi.stubGlobal('fetch', fetchMock)
    const { transcribeAudioWithBackend } = await import('./apiClient')

    const result = await transcribeAudioWithBackend(new File(['audio'], 'call.wav', { type: 'audio/wav' }))

    expect(result.transcript).toBe('Готовый текст')
    expect(result.transcriptConfidence).toBe(93)
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.example.test/audio-jobs/job-1')
  })

  it('surfaces structured backend errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ detail: 'Invalid bearer token' }, 401)))
    const { analyzeTranscriptWithBackend } = await import('./apiClient')

    await expect(analyzeTranscriptWithBackend('test transcript', {} as never)).rejects.toThrow('Invalid bearer token')
  })
})

