import {
  formatModelBytes,
  localFileNameForVariant,
  parseGgufVariants,
  parsePublicGgufModels,
  quantizationFromFileName,
  recommendedModelBytes,
  type PublicGgufModel,
} from '../src/data/huggingFaceCatalog'

const model: PublicGgufModel = {
  id: 'Qwen/Qwen2.5-0.5B-Instruct-GGUF',
  commit: '9217f5db79a29953eb74d5343926648285ec7e67',
  downloads: 170_000,
  likes: 112,
  license: 'apache-2.0',
  pipelineTag: 'text-generation',
  tags: ['gguf', 'text-generation', 'license:apache-2.0'],
}

describe('Hugging Face GGUF catalog', () => {
  it('keeps only public, non-gated, text-capable GGUF repositories', () => {
    const rows = parsePublicGgufModels([
      { id: model.id, sha: model.commit, private: false, gated: false, downloads: 12, likes: 3, pipeline_tag: 'text-generation', tags: model.tags },
      { id: 'private/model', sha: model.commit, private: true, gated: false, tags: ['gguf'] },
      { id: 'gated/model', sha: model.commit, private: false, gated: 'auto', tags: ['gguf'] },
      { id: 'vision/model', sha: model.commit, private: false, gated: false, pipeline_tag: 'image-text-to-text', tags: ['gguf'] },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: model.id, license: 'apache-2.0' })
  })

  it('builds immutable verified variants and rejects split or unverified files', () => {
    const sha = '6eb923e7d26e9cea28811e1a8e852009b21242fb157b26149d3b188f3a8c8653'
    const variants = parseGgufVariants(model, [
      { type: 'file', path: 'Qwen2.5-Q4_K_M.gguf', size: 397_808_192, lfs: { oid: sha, size: 397_808_192 } },
      { type: 'file', path: 'Qwen2.5-Q5_K_M.gguf', size: 420_086_336, lfs: { oid: 'a'.repeat(64), size: 420_086_336 } },
      { type: 'file', path: 'split-00001-of-00002.gguf', size: 300_000_000, lfs: { oid: 'b'.repeat(64) } },
      { type: 'file', path: 'unverified.gguf', size: 300_000_000 },
    ])
    expect(variants).toHaveLength(2)
    expect(variants[0]).toMatchObject({ quantization: 'Q4_K_M', sha256: sha })
    expect(variants[0]?.downloadUrl).toContain(`/resolve/${model.commit}/Qwen2.5-Q4_K_M.gguf?download=true`)
    expect(variants[0]?.localFileName).toBe(`hf-${sha.slice(0, 20)}-Q4_K_M.gguf`)
  })

  it('recognizes common quantizations and phone limits', () => {
    expect(quantizationFromFileName('model-Q4_K_M.gguf')).toBe('Q4_K_M')
    expect(quantizationFromFileName('model-IQ3_XS.gguf')).toBe('IQ3_XS')
    expect(localFileNameForVariant('C'.repeat(64), 'Q5_K_M')).toMatch(/^hf-c{20}-Q5_K_M\.gguf$/)
    expect(recommendedModelBytes(8 * 1024 ** 3)).toBe(2560 * 1024 * 1024)
    expect(formatModelBytes(397_808_192)).toBe('379 МБ')
  })
})
