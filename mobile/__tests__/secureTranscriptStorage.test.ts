const mockSecureValues = new Map<string, string>()
const mockLegacyValues = new Map<string, string>()

jest.mock('../src/bridge/SecureStorageBridge', () => ({
  SecureStorage: {
    getItem: jest.fn(async (key: string) => mockSecureValues.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockSecureValues.set(key, value)
      return true
    }),
    removeItem: jest.fn(async (key: string) => {
      mockSecureValues.delete(key)
      return true
    }),
  },
}))

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockLegacyValues.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => mockLegacyValues.set(key, value)),
  removeItem: jest.fn(async (key: string) => mockLegacyValues.delete(key)),
}))

import { addFineTuneExample, getFineTuneExamples } from '../src/utils/fineTuneDataCollector'
import { getTranscriptHistory, saveTranscriptEntry } from '../src/utils/transcriptHistory'

const HISTORY_KEY = 'voiceshield.transcript-history.v1'
const DATASET_KEY = 'voiceshield.finetune-dataset.v2'

describe('encrypted transcript storage', () => {
  beforeEach(() => {
    mockSecureValues.clear()
    mockLegacyValues.clear()
  })

  it('migrates transcript history from plaintext and removes the legacy copy', async () => {
    mockLegacyValues.set(HISTORY_KEY, JSON.stringify([{
      id: 'old-entry', ts: 1, transcript: 'legacy transcript', score: 20,
      risk: 'low', schemeLabel: 'none', durationSec: 5,
    }]))

    const history = await getTranscriptHistory()

    expect(history).toHaveLength(1)
    expect(mockSecureValues.has(HISTORY_KEY)).toBe(true)
    expect(mockLegacyValues.has(HISTORY_KEY)).toBe(false)
  })

  it('writes new history only to encrypted storage', async () => {
    await saveTranscriptEntry({
      ts: 2, transcript: 'new encrypted transcript', score: 70,
      risk: 'high', schemeLabel: 'bank impersonation', durationSec: 20,
    })

    expect(JSON.parse(mockSecureValues.get(HISTORY_KEY) ?? '[]')).toHaveLength(1)
    expect(mockLegacyValues.has(HISTORY_KEY)).toBe(false)
  })

  it('writes fine-tune examples only to encrypted storage', async () => {
    await addFineTuneExample(
      'This transcript is deliberately long enough to be collected.',
      'scam',
      'bank impersonation',
      80,
    )

    expect(await getFineTuneExamples()).toHaveLength(1)
    expect(mockSecureValues.has(DATASET_KEY)).toBe(true)
    expect(mockLegacyValues.has(DATASET_KEY)).toBe(false)
  })
})
