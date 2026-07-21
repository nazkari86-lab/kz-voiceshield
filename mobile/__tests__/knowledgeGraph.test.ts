import { adviceForModelError, buildAssistantKnowledgeContext, buildKnowledgeGraph } from '../src/data/knowledgeGraph'

describe('knowledge graph runtime state', () => {
  it('reports installed models and device advice without affecting audio capture', () => {
    const graph = buildKnowledgeGraph({ availableBytes: 1_000, totalBytes: 10_000, ramBytes: 1_000 }, { installedModelIds: ['fastconformer'] })
    expect(graph.schemaVersion).toBe('voiceshield.knowledge.v3')
    expect(graph.nodes.find((node) => node.id === 'model:fastconformer')?.status).toBe('ready')
    expect(graph.nodes.some((node) => node.id === 'advice:low-storage')).toBe(true)
    expect(graph.nodes.some((node) => node.id === 'advice:low-ram')).toBe(true)
  })

  it('maps model errors to actionable knowledge advice', () => {
    const graph = buildKnowledgeGraph({ availableBytes: 1_000, totalBytes: 10_000, ramBytes: 8_000_000_000 })
    expect(adviceForModelError('not enough disk space', graph)?.id).toBe('advice:low-storage')
  })

  it('creates bounded, truthful product context for the assistant', () => {
    const graph = buildKnowledgeGraph()
    const context = buildAssistantKnowledgeContext(graph, 32)
    expect(context).toContain('Version: 2.2.3')
    expect(context).toContain('Live Shield')
    expect(context).toContain('SMS Scanner')
    expect(context).toContain('Number Shield')
    expect(context).toContain('v2.0.8 caption-source hardening')
    expect(context).toContain('v2.0.3 patch release')
    expect(context).toContain('v2.0.4 local backend patch')
    expect(context).toContain('v2.0.6 quality lab patch')
    expect(context).toContain('Do not claim an external')
    expect(context.split('\n').length).toBeLessThanOrEqual(35)
  })
})
