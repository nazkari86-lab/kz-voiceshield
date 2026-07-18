export type McpPermissionMode = 'none' | 'safe' | 'custom' | 'all'
export type McpCapability = 'knowledge' | 'transcript' | 'sms' | 'number' | 'contacts' | 'files' | 'cloud' | 'device' | 'callControl' | 'messaging' | 'shell'
export type McpPermissions = { mode: McpPermissionMode; capabilities: Record<McpCapability, boolean>; updatedAt: string }

export const MCP_PERMISSIONS_KEY = 'voiceshield.mcp.permissions.v1'
export const MCP_CAPABILITIES: readonly McpCapability[] = ['knowledge', 'transcript', 'sms', 'number', 'contacts', 'files', 'cloud', 'device', 'callControl', 'messaging', 'shell']

const emptyCapabilities = (): Record<McpCapability, boolean> => Object.fromEntries(MCP_CAPABILITIES.map((capability) => [capability, false])) as Record<McpCapability, boolean>

export const DEFAULT_MCP_PERMISSIONS: McpPermissions = {
  mode: 'safe',
  capabilities: { ...emptyCapabilities(), knowledge: true, transcript: true, sms: true, number: true },
  updatedAt: '',
}

export const MCP_CAPABILITY_LABELS: Record<McpCapability, string> = {
  knowledge: 'Знания приложения и версии', transcript: 'Анализ транскриптов', sms: 'Чтение и анализ SMS', number: 'Проверка номеров', contacts: 'Контакты', files: 'Выбранные файлы', cloud: 'Облачные AI и MCP', device: 'Сведения об устройстве', callControl: 'Управление звонком', messaging: 'Отправка сообщений', shell: 'Команды системы',
}

export function normalizeMcpPermissions(value: unknown): McpPermissions {
  if (!value || typeof value !== 'object') return DEFAULT_MCP_PERMISSIONS
  const candidate = value as Partial<McpPermissions>
  const mode = candidate.mode === 'none' || candidate.mode === 'safe' || candidate.mode === 'custom' || candidate.mode === 'all' ? candidate.mode : 'safe'
  const capabilities = { ...emptyCapabilities(), ...(candidate.capabilities && typeof candidate.capabilities === 'object' ? candidate.capabilities : {}) }
  return { mode, capabilities, updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : '' }
}

export async function loadMcpPermissions(): Promise<McpPermissions> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default
    const raw = await AsyncStorage.getItem(MCP_PERMISSIONS_KEY)
    return raw ? normalizeMcpPermissions(JSON.parse(raw)) : DEFAULT_MCP_PERMISSIONS
  } catch {
    return DEFAULT_MCP_PERMISSIONS
  }
}

export async function saveMcpPermissions(value: McpPermissions): Promise<McpPermissions> {
  const next = normalizeMcpPermissions({ ...value, updatedAt: new Date().toISOString() })
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default
  await AsyncStorage.setItem(MCP_PERMISSIONS_KEY, JSON.stringify(next))
  return next
}

export function isMcpCapabilityAllowed(permissions: McpPermissions, capability: McpCapability): boolean {
  if (permissions.mode === 'none') return false
  if (permissions.mode === 'all') return true
  return permissions.capabilities[capability] === true
}

export function mcpCapabilityForTool(name: string): McpCapability {
  if (name.includes('sms')) return 'sms'
  if (name.includes('transcript')) return 'transcript'
  if (name.includes('number')) return 'number'
  if (name.includes('redact')) return 'cloud'
  if (name.includes('backend')) return 'cloud'
  return 'knowledge'
}

export function applyMcpMode(mode: McpPermissionMode, previous: McpPermissions = DEFAULT_MCP_PERMISSIONS): McpPermissions {
  if (mode === 'none') return { ...previous, mode, capabilities: emptyCapabilities() }
  if (mode === 'safe') return { ...previous, mode, capabilities: { ...emptyCapabilities(), knowledge: true, transcript: true, sms: true, number: true } }
  if (mode === 'all') return { ...previous, mode, capabilities: Object.fromEntries(MCP_CAPABILITIES.map((capability) => [capability, true])) as Record<McpCapability, boolean> }
  return { ...previous, mode: 'custom' }
}
