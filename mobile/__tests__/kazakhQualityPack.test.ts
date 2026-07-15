import {
  KAZAKH_PACK_MAX_BYTES,
  plannedKazakhPackBytes,
  qoldaVariants,
  recommendedQoldaVariant,
  validatesKazakhPackBudget,
} from '../src/data/kazakhQualityPack'

describe('Kazakh quality pack', () => {
  it('pins official Qolda artifacts and stays below five GiB', () => {
    expect(qoldaVariants.maximum.size).toBe(2_889_513_536)
    expect(qoldaVariants.maximum.sha256).toBe('6e0600a832b8ced6082321648d10c6c85ec1bd850af874038da518d9ff795bbe')
    expect(plannedKazakhPackBytes).toBeLessThanOrEqual(KAZAKH_PACK_MAX_BYTES)
    expect(validatesKazakhPackBudget()).toBe(true)
  })

  it('selects Q5 only when storage and RAM are sufficient', () => {
    expect(recommendedQoldaVariant(8 * 1024 ** 3, 8 * 1024 ** 3)?.quantization).toBe('Q5_K_M')
    expect(recommendedQoldaVariant(6 * 1024 ** 3, 4 * 1024 ** 3)?.quantization).toBe('Q4_K_M')
    expect(recommendedQoldaVariant(4 * 1024 ** 3, 8 * 1024 ** 3)).toBeNull()
  })
})
