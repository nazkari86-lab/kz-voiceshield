import { SecureStorage } from '../bridge/SecureStorageBridge'

const KEY = 'voiceshield.knowledge-notes.v1'
export type KnowledgeNote = { id: string; nodeId: string; text: string; updatedAt: string }

export async function loadKnowledgeNotes(): Promise<KnowledgeNote[]> {
  const raw = await SecureStorage.getItem(KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((item): item is KnowledgeNote => typeof item?.id === 'string' && typeof item?.nodeId === 'string' && typeof item?.text === 'string') : []
  } catch { return [] }
}

export async function saveKnowledgeNote(nodeId: string, text: string): Promise<KnowledgeNote[]> {
  const existing = await loadKnowledgeNotes()
  const trimmed = text.trim()
  const next = trimmed
    ? [...existing.filter((item) => item.nodeId !== nodeId), { id: `note:${nodeId}`, nodeId, text: trimmed.slice(0, 1_000), updatedAt: new Date().toISOString() }]
    : existing.filter((item) => item.nodeId !== nodeId)
  await SecureStorage.setItem(KEY, JSON.stringify(next))
  return next
}
