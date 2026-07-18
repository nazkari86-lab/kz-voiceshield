import { APP_VERSION } from '../data/modelManifest'
import { buildKnowledgeGraph, searchKnowledge, type KnowledgeGraph } from '../data/knowledgeGraph'
import { analyzeScamContent, type ScamToolResult } from '../scamTools'
import { scoreSms } from '../utils/smsRisk'
import type { ModelStorageInfo } from '../data/whisperModels'
import { getBackendConfig } from './backendConfig'
import { DEFAULT_MCP_PERMISSIONS, isMcpCapabilityAllowed, loadMcpPermissions, mcpCapabilityForTool, type McpCapability, type McpPermissions } from './mcpPermissions'

export type McpToolKind = 'local' | 'backend'
export type McpToolDefinition = {
  name: string
  description: string
  kind: McpToolKind
  capability: McpCapability
  readOnly: true
  requiresConfirmation: boolean
}

export type LocalMcpRuntime = {
  graph?: KnowledgeGraph
  storage?: ModelStorageInfo | null
  installedModelIds?: readonly string[]
  downloadingModelIds?: readonly string[]
  permissions?: McpPermissions
}

export const VOICESHIELD_MCP_TOOLS: readonly McpToolDefinition[] = [
  { name: 'voiceshield_analyze_transcript', description: 'Rule-based RU/KZ triage with reasons; never ends a call.', kind: 'local', capability: 'transcript', readOnly: true, requiresConfirmation: false },
  { name: 'voiceshield_analyze_sms', description: 'Local SMS risk check with false-positive-aware OTP handling.', kind: 'local', capability: 'sms', readOnly: true, requiresConfirmation: false },
  { name: 'voiceshield_app_knowledge', description: 'Read-only features, model status and release history.', kind: 'local', capability: 'knowledge', readOnly: true, requiresConfirmation: false },
  { name: 'voiceshield_redact_text', description: 'Redact common PII before any cloud request.', kind: 'local', capability: 'cloud', readOnly: true, requiresConfirmation: false },
  { name: 'voiceshield_backend_status', description: 'Read-only backend capabilities and MCP health.', kind: 'backend', capability: 'cloud', readOnly: true, requiresConfirmation: false },
]

export function listVoiceShieldMcpTools(): readonly McpToolDefinition[] {
  return VOICESHIELD_MCP_TOOLS
}

export function filterMcpTools(permissions: McpPermissions): readonly McpToolDefinition[] {
  return VOICESHIELD_MCP_TOOLS.filter((tool) => isMcpCapabilityAllowed(permissions, tool.capability))
}

export async function callRemoteMcpTool(
  name: string,
  arguments_: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const permissions = await loadMcpPermissions()
  if (!isMcpCapabilityAllowed(permissions, mcpCapabilityForTool(name))) throw new Error(`MCP capability is disabled: ${mcpCapabilityForTool(name)}`)
  const config = await getBackendConfig()
  if (!config.token) throw new Error('MCP backend token is not configured')
  const response = await fetch(`${config.baseUrl}/mcp`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: `mcp-${Date.now()}`, method: 'tools/call', params: { name, arguments: arguments_ } }),
  })
  if (!response.ok) throw new Error(`MCP backend responded with ${response.status}`)
  const payload = await response.json() as { error?: { message?: string }; result?: { structuredContent?: Record<string, unknown> } }
  if (payload.error) throw new Error(payload.error.message || 'MCP tool failed')
  return payload.result?.structuredContent ?? {}
}

export function callLocalMcpTool(name: string, arguments_: Record<string, unknown>, runtime: LocalMcpRuntime = {}): Record<string, unknown> {
  if (name === 'voiceshield_analyze_transcript') {
    const text = typeof arguments_.text === 'string' ? arguments_.text : ''
    const result: ScamToolResult = analyzeScamContent(text)
    return { ...result, source: 'local-rules', actionPolicy: 'advisory-only' }
  }
  if (name === 'voiceshield_analyze_sms') {
    const text = typeof arguments_.text === 'string' ? arguments_.text : ''
    return { ...scoreSms(text), source: 'local-rules', actionPolicy: 'advisory-only' }
  }
  if (name === 'voiceshield_app_knowledge') {
    const graph = runtime.graph ?? buildKnowledgeGraph(runtime.storage ?? null, {
      installedModelIds: runtime.installedModelIds,
      downloadingModelIds: runtime.downloadingModelIds,
    })
    const query = typeof arguments_.query === 'string' ? arguments_.query : ''
    const nodes = searchKnowledge(graph, query).slice(0, 24)
    return { app: 'KZ VoiceShield', version: APP_VERSION, schemaVersion: graph.schemaVersion, nodes, toolPolicy: 'read-only' }
  }
  if (name === 'voiceshield_redact_text') {
    const text = typeof arguments_.text === 'string' ? arguments_.text : ''
    return { text: redactMcpText(text), redacted: true }
  }
  throw new Error(`MCP tool is not available locally: ${name}`)
}

function redactMcpText(value: string): string {
  return value
    .replace(/\b(?:\+?7|8)\d{10}\b/gu, '[PHONE]')
    .replace(/\b\d{16}\b/gu, '[CARD]')
    .replace(/\b\d{12}\b/gu, '[IIN]')
    .replace(/\b\d{4,8}\b/gu, '[CODE]')
}

export function buildLocalMcpContext(text: string, runtime: LocalMcpRuntime = {}): string {
  const transcript = text.trim()
  const permissions = runtime.permissions ?? DEFAULT_MCP_PERMISSIONS
  const availableTools = filterMcpTools(permissions)
  const knowledge = isMcpCapabilityAllowed(permissions, 'knowledge') ? callLocalMcpTool('voiceshield_app_knowledge', { query: '' }, runtime) : { disabled: true }
  const triage = transcript
    && isMcpCapabilityAllowed(permissions, 'transcript')
    ? callLocalMcpTool('voiceshield_analyze_transcript', { text: transcript.slice(0, 12_000) }, runtime)
    : null
  return [
    `MCP local tools allowed by user: ${availableTools.map((tool) => tool.name).join(', ') || 'none'}.`,
    `MCP policy: read-only advisory tools; no call control, SMS sending, contact access, shell, or arbitrary file access.`,
    `VoiceShield knowledge snapshot: ${JSON.stringify(knowledge).slice(0, 7_000)}`,
    triage ? `Local transcript pre-check (not final verdict): ${JSON.stringify(triage).slice(0, 2_000)}` : '',
  ].filter(Boolean).join('\n')
}
