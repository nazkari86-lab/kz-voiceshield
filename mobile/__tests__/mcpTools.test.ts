import { buildLocalMcpContext, callLocalMcpTool, filterMcpTools, listVoiceShieldMcpTools } from '../src/services/mcpTools'
import { applyMcpMode, DEFAULT_MCP_PERMISSIONS } from '../src/services/mcpPermissions'

describe('VoiceShield MCP tools', () => {
  it('exposes only read-only allow-listed tools', () => {
    expect(listVoiceShieldMcpTools().length).toBeGreaterThanOrEqual(5)
    expect(listVoiceShieldMcpTools().every((tool) => tool.readOnly && !tool.requiresConfirmation)).toBe(true)
  })

  it('keeps transcript analysis advisory and local', () => {
    const result = callLocalMcpTool('voiceshield_analyze_transcript', { text: 'Назовите код из SMS срочно' })
    expect(result.source).toBe('local-rules')
    expect(result.actionPolicy).toBe('advisory-only')
    expect(result.score).toBeGreaterThan(0)
  })

  it('provides feature and version context to the assistant', () => {
    const context = buildLocalMcpContext('')
    expect(context).toContain('voiceshield_app_knowledge')
    expect(context).toContain('KZ VoiceShield')
    expect(context).toContain('read-only advisory tools')
  })

  it('honors none, safe and all permission profiles', () => {
    expect(filterMcpTools(applyMcpMode('none')).length).toBe(0)
    expect(filterMcpTools(DEFAULT_MCP_PERMISSIONS).map((tool) => tool.name)).toEqual([
      'voiceshield_analyze_transcript', 'voiceshield_analyze_sms', 'voiceshield_app_knowledge',
    ])
    expect(filterMcpTools(applyMcpMode('all')).length).toBe(listVoiceShieldMcpTools().length)
  })
})
