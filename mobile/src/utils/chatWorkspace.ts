import { analyzeTranscript, buildReport, sentenceTimeline, type Severity } from '@scoring'
import { redactForCloud, summarizeRedactions } from './privacyGateway'

export type WorkspaceAttachment = {
  fileName: string
  mimeType: string
  text: string
  truncated: boolean
  kind: 'text' | 'image' | 'document' | 'audio' | 'archive'
  uri?: string
}

export type WorkspaceMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  attachmentNames?: string[]
  createdAt: string
  streaming?: boolean
}

export type ChatSession = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: WorkspaceMessage[]
  evidence?: CaseEvidenceItem[]
  notes?: string[]
}

export type CaseEvidenceItem = {
  id: string
  fileName: string
  mimeType: string
  kind: WorkspaceAttachment['kind']
  capturedAt: string
  risk: Severity
  score: number
  excerpt: string
}

export type AttachmentEvidence = {
  risk: Severity
  score: number
  confidence: number
  scheme: string
  reasons: string[]
  references: Array<{ line: number; text: string }>
  actions: string[]
}

export type AttachmentIndicators = { phones: string[]; links: string[]; codes: string[] }
export type AttachmentQuality = { level: 'good' | 'limited' | 'poor'; summary: string }
export type LinkSafety = { url: string; host: string; risk: 'low' | 'medium' | 'high'; reasons: string[] }
export type ReceiptFields = { amounts: string[]; dates: string[]; iban: string[]; cardLike: string[]; bin: string[] }
export type DocumentComparison = { summary: string; additions: string[]; removals: string[]; changedIndicators: string[] }

const MAX_SAVED_SESSIONS = 12
const MAX_SAVED_MESSAGES = 40
const MAX_SAVED_MESSAGE_CHARS = 3_000

const clip = (value: string, max: number) => value.length > max ? `${value.slice(0, max - 1)}…` : value

export const createChatId = (prefix = 'chat') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export function createChatSession(): ChatSession {
  const now = new Date().toISOString()
  return { id: createChatId(), title: 'Новый анализ', createdAt: now, updatedAt: now, messages: [] }
}

export function titleForChat(messages: WorkspaceMessage[]): string {
  const first = messages.find((message) => message.role === 'user')
  return first ? clip(first.text.replace(/\s+/gu, ' ').trim(), 48) : 'Новый анализ'
}

export function normalizeChatSessions(raw: string | null): ChatSession[] {
  if (!raw) return []
  try {
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value)) return []
    return value.flatMap((item): ChatSession[] => {
      if (!item || typeof item !== 'object') return []
      const record = item as Partial<ChatSession>
      if (typeof record.id !== 'string' || !Array.isArray(record.messages)) return []
      const messages = record.messages.flatMap((message): WorkspaceMessage[] => {
        if (!message || typeof message !== 'object') return []
        const candidate = message as Partial<WorkspaceMessage>
        if ((candidate.role !== 'user' && candidate.role !== 'assistant') || typeof candidate.text !== 'string') return []
        return [{
          id: typeof candidate.id === 'string' ? candidate.id : createChatId('message'),
          role: candidate.role,
          text: clip(candidate.text, MAX_SAVED_MESSAGE_CHARS),
          attachmentNames: Array.isArray(candidate.attachmentNames) ? candidate.attachmentNames.filter((name): name is string => typeof name === 'string').slice(0, 5) : undefined,
          createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date().toISOString(),
        }]
      }).slice(-MAX_SAVED_MESSAGES)
      return [{
        id: record.id,
        title: typeof record.title === 'string' && record.title.trim() ? clip(record.title, 80) : titleForChat(messages),
        createdAt: typeof record.createdAt === 'string' ? record.createdAt : new Date().toISOString(),
        updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString(),
        messages,
        evidence: Array.isArray(record.evidence) ? record.evidence.flatMap((item): CaseEvidenceItem[] => {
          if (!item || typeof item !== 'object') return []
          const evidence = item as Partial<CaseEvidenceItem>
          if (typeof evidence.id !== 'string' || typeof evidence.fileName !== 'string' || typeof evidence.excerpt !== 'string') return []
          if (!['low', 'medium', 'high', 'critical'].includes(evidence.risk ?? '')) return []
          return [{ id: evidence.id, fileName: clip(evidence.fileName, 160), mimeType: typeof evidence.mimeType === 'string' ? evidence.mimeType : 'application/octet-stream', kind: ['text', 'image', 'document', 'audio', 'archive'].includes(evidence.kind ?? '') ? evidence.kind as WorkspaceAttachment['kind'] : 'text', capturedAt: typeof evidence.capturedAt === 'string' ? evidence.capturedAt : new Date().toISOString(), risk: evidence.risk as Severity, score: typeof evidence.score === 'number' ? evidence.score : 0, excerpt: clip(evidence.excerpt, 280) }]
        }).slice(0, 20) : [],
        notes: Array.isArray(record.notes) ? record.notes.filter((note): note is string => typeof note === 'string').map((note) => clip(note, 500)).slice(0, 20) : [],
      }]
    }).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, MAX_SAVED_SESSIONS)
  } catch {
    return []
  }
}

export function serializeChatSessions(sessions: ChatSession[]): string {
  return JSON.stringify(sessions
    .flatMap((session): ChatSession[] => {
      if (!session || typeof session !== 'object' || !Array.isArray(session.messages) || typeof session.id !== 'string') return []
      const messages = session.messages.flatMap((message): WorkspaceMessage[] => {
        if (!message || typeof message !== 'object' || (message.role !== 'user' && message.role !== 'assistant') || typeof message.text !== 'string') return []
        return [{ ...message, text: clip(message.text, MAX_SAVED_MESSAGE_CHARS), streaming: undefined }]
      }).slice(-MAX_SAVED_MESSAGES)
      return [{ ...session, messages }]
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, MAX_SAVED_SESSIONS))
}

export function inspectAttachment(attachment: WorkspaceAttachment): AttachmentEvidence {
  const analysis = analyzeTranscript(attachment.text)
  const references = sentenceTimeline(attachment.text)
    .filter((entry) => entry.analysis.evidence.length > 0)
    .slice(0, 4)
    .map((entry) => ({ line: entry.index, text: clip(entry.segment, 180) }))
  return {
    risk: analysis.risk,
    score: analysis.score,
    confidence: analysis.confidence,
    scheme: analysis.schemeLabel,
    reasons: analysis.escalationReasons.slice(0, 3),
    references,
    actions: analysis.responseChecklist.slice(0, 4),
  }
}

export function assessAttachmentQuality(attachment: WorkspaceAttachment): AttachmentQuality {
  if (attachment.text.trim().length < 24) return { level: 'poor', summary: 'Слишком мало извлечённого текста: проверьте качество изображения, PDF или аудио.' }
  if (attachment.truncated) return { level: 'limited', summary: 'Файл большой: для анализа использовано только безопасное начало.' }
  if (attachment.kind === 'image' && attachment.text.trim().length < 100) return { level: 'limited', summary: 'OCR извлёк мало текста. Проверьте скриншот и важные реквизиты вручную.' }
  if (attachment.kind === 'audio') return { level: 'limited', summary: 'Это расшифровка аудио: имена, числа и коды следует сверить с записью.' }
  return { level: 'good', summary: 'Текст извлечён и пригоден для локального анализа.' }
}

export function cloudAttachmentPrivacySummary(attachments: WorkspaceAttachment[]): string {
  const combined = attachments.map((attachment) => attachment.text).join('\n')
  const summary = summarizeRedactions(redactForCloud(combined).counts)
  return summary || 'Явные номера, карты, ИИН, коды, email и ссылки не обнаружены.'
}

export function extractAttachmentIndicators(attachment: WorkspaceAttachment): AttachmentIndicators {
  const unique = (values: string[]) => [...new Set(values)].slice(0, 4)
  const text = attachment.text
  return {
    phones: unique(text.match(/(?<!\d)(?:\+?7|8)[\s()-]?\d{3}[\s()-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}(?!\d)/gu) ?? []),
    links: unique(text.match(/(?:https?:\/\/|www\.)[^\s<>()]+/giu) ?? []),
    codes: unique([...text.matchAll(/(?:sms|смс|код|otp|pin|cvv|растау)[^\p{L}\p{N}]{0,16}(\d{3,12})\b/giu)]
      .map((match) => match[1]).filter((code): code is string => Boolean(code))),
  }
}

export function extractReceiptFields(attachment: WorkspaceAttachment): ReceiptFields {
  const unique = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, 5)
  const text = attachment.text
  return {
    amounts: unique(text.match(/\b\d{1,3}(?:[\s,]\d{3})*(?:[.,]\d{1,2})?\s?(?:₸|тенге|kzt|тг)(?=\s|$|[,.])/giu) ?? []),
    dates: unique(text.match(/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/gu) ?? []),
    iban: unique(text.match(/\bKZ\d{2}[A-Z0-9]{10,30}\b/giu) ?? []),
    cardLike: unique(text.match(/\b(?:\d[ -]?){12,19}\b/gu) ?? []),
    bin: unique(text.match(/\b(?:БИН|BIN)\s*[:№-]?\s*\d{12}\b/giu) ?? []),
  }
}

export function inspectLinkOffline(value: string): LinkSafety {
  const candidate = /^https?:\/\//iu.test(value) ? value : `https://${value}`
  const match = candidate.match(/^https?:\/\/([^/?#]+)/iu)
  if (!match?.[1]) return { url: value, host: '', risk: 'high', reasons: ['Некорректный формат ссылки. Не открывайте её.'] }
  const host = match[1].split('@').at(-1)?.split(':')[0]?.toLowerCase() || ''
  const reasons: string[] = []
  if (!candidate.startsWith('https://')) reasons.push('Используется незашифрованный HTTP.')
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(host)) reasons.push('Ссылка ведёт на IP-адрес, а не на проверяемый домен.')
  if (host.includes('xn--')) reasons.push('Домен использует punycode: проверьте похожие символы.')
  if (/(?:kaspi|halyk|egov|gov|bank).{0,18}(?:verify|secure|support|bonus|pay)/iu.test(host)) reasons.push('Домен похож на финансовый или государственный бренд с дополнительными словами.')
  if (host.split('.').length > 4) reasons.push('У домена необычно много поддоменов.')
  return { url: value, host, risk: reasons.length >= 2 ? 'high' : reasons.length === 1 ? 'medium' : 'low', reasons: reasons.length > 0 ? reasons : ['Offline-проверка не нашла явного паттерна. Возраст домена и редиректы не проверяются автоматически.'] }
}

export function compareAttachments(left: WorkspaceAttachment, right: WorkspaceAttachment): DocumentComparison {
  const normalizeLine = (line: string) => line.replace(/\s+/gu, ' ').trim()
  const leftLines = new Set(left.text.split(/\n+/u).map(normalizeLine).filter((line) => line.length > 8))
  const rightLines = new Set(right.text.split(/\n+/u).map(normalizeLine).filter((line) => line.length > 8))
  const additions = [...rightLines].filter((line) => !leftLines.has(line)).slice(0, 6)
  const removals = [...leftLines].filter((line) => !rightLines.has(line)).slice(0, 6)
  const leftIndicators = extractReceiptFields(left)
  const rightIndicators = extractReceiptFields(right)
  const changedIndicators = (Object.keys(leftIndicators) as Array<keyof ReceiptFields>).flatMap((key) => {
    const before = leftIndicators[key].join(', ') || 'нет'
    const after = rightIndicators[key].join(', ') || 'нет'
    return before === after ? [] : [`${key}: ${before} → ${after}`]
  })
  return {
    summary: additions.length === 0 && removals.length === 0 && changedIndicators.length === 0 ? 'Существенных текстовых различий не найдено.' : `Найдено: +${additions.length} новых строк, -${removals.length} удалённых строк, ${changedIndicators.length} изменённых реквизитов.`,
    additions,
    removals,
    changedIndicators,
  }
}

export function toCaseEvidenceItem(attachment: WorkspaceAttachment): CaseEvidenceItem {
  const analysis = inspectAttachment(attachment)
  return { id: createChatId('evidence'), fileName: attachment.fileName, mimeType: attachment.mimeType, kind: attachment.kind, capturedAt: new Date().toISOString(), risk: analysis.risk, score: analysis.score, excerpt: clip(attachment.text.replace(/\s+/gu, ' '), 280) }
}

export function buildAttachmentEvidenceBundle(attachments: WorkspaceAttachment[]): string {
  return attachments.map((attachment) => {
    const evidence = inspectAttachment(attachment)
    const report = buildReport(attachment.text, analyzeTranscript(attachment.text))
    return [
      `Файл: ${attachment.fileName}`,
      `Тип: ${attachment.mimeType}`,
      `Риск: ${evidence.risk.toUpperCase()} (${evidence.score}/100), уверенность ${evidence.confidence}/100`,
      `Схема: ${evidence.scheme}`,
      'Ссылки на фрагменты:',
      ...(evidence.references.length > 0 ? evidence.references.map((reference) => `- §${reference.line}: ${reference.text}`) : ['- Совпадений rule-based проверки нет.']),
      '',
      report,
    ].join('\n')
  }).join('\n\n---\n\n')
}
