import { SecureStorage } from '../bridge/SecureStorageBridge'
import type { KnowledgeEdge, KnowledgeGraph, KnowledgeNode } from './knowledgeGraph'

const GRAPH_KEY = 'voiceshield.knowledge.graph.v1'
const BACKEND_URL_KEY = 'voiceshield.knowledge.backend.url.v1'
const BACKEND_TOKEN_KEY = 'voiceshield.knowledge.backend.token.v1'

export type KnowledgeGraphState = {
  notes: KnowledgeNode[]
  customEdges: KnowledgeEdge[]
  diagnostics: Array<{ id: string; message: string; createdAt: string }>
  updatedAt: string
  lastSyncedAt?: string
}

const emptyState = (): KnowledgeGraphState => ({ notes: [], customEdges: [], diagnostics: [], updatedAt: new Date(0).toISOString() })

export async function loadKnowledgeGraphState(): Promise<KnowledgeGraphState> {
  const raw = await SecureStorage.getItem(GRAPH_KEY)
  if (!raw) return emptyState()
  try {
    const value = JSON.parse(raw) as Partial<KnowledgeGraphState>
    return {
      notes: Array.isArray(value.notes) ? value.notes : [],
      customEdges: Array.isArray(value.customEdges) ? value.customEdges : [],
      diagnostics: Array.isArray(value.diagnostics) ? value.diagnostics : [],
      updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date(0).toISOString(),
      ...(typeof value.lastSyncedAt === 'string' ? { lastSyncedAt: value.lastSyncedAt } : {}),
    }
  } catch {
    return emptyState()
  }
}

export async function saveKnowledgeGraphState(state: KnowledgeGraphState): Promise<void> {
  await SecureStorage.setItem(GRAPH_KEY, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }))
}

export function mergeKnowledgeGraph(graph: KnowledgeGraph, state: KnowledgeGraphState): KnowledgeGraph {
  const nodeIds = new Set(graph.nodes.map((node) => node.id))
  const notes = state.notes.filter((node) => !nodeIds.has(node.id))
  return { ...graph, nodes: [...graph.nodes, ...notes], edges: [...graph.edges, ...state.customEdges] }
}

export async function recordKnowledgeDiagnostic(id: string, message: string): Promise<KnowledgeGraphState> {
  const current = await loadKnowledgeGraphState()
  const next = { ...current, diagnostics: [{ id, message, createdAt: new Date().toISOString() }, ...current.diagnostics].slice(0, 50) }
  await saveKnowledgeGraphState(next)
  return next
}

export async function setKnowledgeBackendConfig(url: string, token: string): Promise<void> {
  const normalized = url.trim().replace(/\/+$/u, '')
  if (normalized) await SecureStorage.setItem(BACKEND_URL_KEY, normalized)
  else await SecureStorage.removeItem(BACKEND_URL_KEY)
  if (token.trim()) await SecureStorage.setItem(BACKEND_TOKEN_KEY, token.trim())
  else await SecureStorage.removeItem(BACKEND_TOKEN_KEY)
}

export async function getKnowledgeBackendConfig(): Promise<{ url: string; token: string }> {
  const config = await backendConfig()
  return config ?? { url: '', token: '' }
}

async function backendConfig(): Promise<{ url: string; token: string } | null> {
  const [url, token] = await Promise.all([SecureStorage.getItem(BACKEND_URL_KEY), SecureStorage.getItem(BACKEND_TOKEN_KEY)])
  return url && token ? { url, token } : null
}

export async function syncKnowledgeGraph(graph: KnowledgeGraph, state: KnowledgeGraphState): Promise<{ syncedAt: string }> {
  const config = await backendConfig()
  if (!config) throw new Error('BACKEND_NOT_CONFIGURED')
  const response = await fetch(`${config.url}/knowledge-graph`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ schemaVersion: graph.schemaVersion, appVersion: graph.appVersion, graph: { ...graph, notes: state.notes, customEdges: state.customEdges, diagnostics: state.diagnostics }, clientUpdatedAt: state.updatedAt }),
  })
  const payload = await response.json().catch(() => ({})) as { serverUpdatedAt?: string; detail?: string }
  if (!response.ok) throw new Error(payload.detail ?? `GRAPH_SYNC_FAILED_${response.status}`)
  const syncedAt = payload.serverUpdatedAt ?? new Date().toISOString()
  await saveKnowledgeGraphState({ ...state, lastSyncedAt: syncedAt })
  return { syncedAt }
}

export async function pullKnowledgeGraph(): Promise<KnowledgeGraphState | null> {
  const config = await backendConfig()
  if (!config) throw new Error('BACKEND_NOT_CONFIGURED')
  const response = await fetch(`${config.url}/knowledge-graph`, { headers: { Authorization: `Bearer ${config.token}` } })
  const payload = await response.json().catch(() => ({})) as { found?: boolean; graph?: { graph?: { notes?: KnowledgeNode[]; customEdges?: KnowledgeEdge[]; diagnostics?: KnowledgeGraphState['diagnostics'] }; notes?: KnowledgeNode[]; customEdges?: KnowledgeEdge[]; diagnostics?: KnowledgeGraphState['diagnostics']; serverUpdatedAt?: string } }
  if (!response.ok) throw new Error(`GRAPH_PULL_FAILED_${response.status}`)
  if (!payload.found || !payload.graph) return null
  const remote = payload.graph.graph ?? payload.graph
  const current = await loadKnowledgeGraphState()
  const notes = [...current.notes, ...(remote.notes ?? [])].filter((node, index, all) => all.findIndex((candidate) => candidate.id === node.id) === index)
  const customEdges = [...current.customEdges, ...(remote.customEdges ?? [])].filter((edge, index, all) => all.findIndex((candidate) => candidate.from === edge.from && candidate.to === edge.to && candidate.relation === edge.relation) === index)
  const next = { ...current, notes, customEdges, diagnostics: [...current.diagnostics, ...(remote.diagnostics ?? [])].slice(0, 100), lastSyncedAt: payload.graph.serverUpdatedAt ?? new Date().toISOString() }
  await saveKnowledgeGraphState(next)
  return next
}
