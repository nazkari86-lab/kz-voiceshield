import {
  GEMMA_CONTEXT_TOKENS,
  GEMMA_MODEL_BYTES,
  GEMMA_MODEL_FILE,
  GEMMA_MODEL_SHA256,
  GEMMA_MODEL_URL,
  GEMMA_RELEASE_ASSET_FILE,
} from '../src/bridge/LLMBridge'

describe('Gemma release contract', () => {
  it('uses the published asset while keeping a stable local file name', () => {
    expect(GEMMA_RELEASE_ASSET_FILE).toBe('gemma3-1b-it-int4.task')
    expect(GEMMA_MODEL_URL).toBe(
      `https://github.com/nazkari86-lab/kz-voiceshield/releases/download/gemma-v1.0.0/${GEMMA_RELEASE_ASSET_FILE}`,
    )
    expect(GEMMA_MODEL_FILE).toBe('gemma-3-1b-it-int4.task')
  })

  it('matches the verified GitHub release metadata', () => {
    expect(GEMMA_MODEL_BYTES).toBe(554_661_243)
    expect(GEMMA_MODEL_SHA256).toBe('e3d981c01aeaaac69a84ffa0d4be13281b3176731063f1bea1c9fe6887bd9dee')
    expect(GEMMA_CONTEXT_TOKENS).toBe(2048)
  })
})
