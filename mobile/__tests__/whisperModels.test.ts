import { fitsDevice, modelFor, recommendedModel, requiredStorageBytes } from '../src/data/whisperModels'

const device = { availableBytes: 4_000_000_000, totalBytes: 8_000_000_000, ramBytes: 8_000_000_000 }

describe('speech model manifest', () => {
  it('selects the specialised FastConformer release when the phone can run it', () => {
    const model = recommendedModel(device)
    expect(model.id).toBe('fastconformer')
    expect(model.url).toBe('https://github.com/nazkari86-lab/kz-voiceshield/releases/download/fastconformer-v1.1.0/fastconformer-kk-ru-int8.onnx')
    expect(model.sha256).toMatch(/^[a-f0-9]{64}$/)
  })

  it('uses Hugging Face download mode so LFS/Xet returns a resumable object', () => {
    expect(modelFor('turboFull').url).toBe('https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin?download=true')
    expect(modelFor('turboFull').size).toBe(1_624_555_275)
  })

  it('requires only the model file and a small first-download reserve', () => {
    const fast = modelFor('fastconformer')
    expect(requiredStorageBytes(fast)).toBe(fast.size + 64 * 1024 * 1024)
    expect(fitsDevice(fast, { availableBytes: fast.size, totalBytes: fast.size, ramBytes: 8_000_000_000 })).toBe(false)
    expect(recommendedModel({ availableBytes: 100_000_000, totalBytes: 1_000_000_000, ramBytes: 1_000_000_000 }).id).toBe('tiny')
  })
})
