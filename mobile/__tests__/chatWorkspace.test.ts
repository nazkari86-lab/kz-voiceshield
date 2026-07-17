import {
  buildAttachmentEvidenceBundle, cloudAttachmentPrivacySummary, createChatSession,
  assessAttachmentQuality, compareAttachments, extractAttachmentIndicators, extractReceiptFields, inspectAttachment, inspectLinkOffline, normalizeChatSessions, serializeChatSessions,
} from '../src/utils/chatWorkspace'
import { DAILY_CLOUD_TOKEN_LIMIT, canUseCloud, estimateTokens, normalizeCloudUsage } from '../src/services/cloudBudget'

const attachment = {
  fileName: 'message.txt', mimeType: 'text/plain', kind: 'text' as const, truncated: false,
  text: 'Ваш счет под угрозой. Назовите код из СМС и установите AnyDesk.',
}

describe('chat workspace', () => {
  it('keeps valid encrypted-history payloads and rejects malformed records', () => {
    const session = createChatSession()
    session.messages.push({ id: 'm1', role: 'user', text: 'Проверь это сообщение', createdAt: session.createdAt })
    const restored = normalizeChatSessions(serializeChatSessions([session, { bad: true } as never]))
    expect(restored).toHaveLength(1)
    expect(restored[0].messages[0].text).toContain('Проверь')
  })

  it('produces evidence references and a redacted cloud preflight summary', () => {
    const evidence = inspectAttachment(attachment)
    expect(evidence.score).toBeGreaterThan(0)
    expect(evidence.references.length).toBeGreaterThan(0)
    expect(buildAttachmentEvidenceBundle([attachment])).toContain('Ссылки на фрагменты:')
    expect(cloudAttachmentPrivacySummary([{ ...attachment, text: '+7 701 123 45 67 код 1234' }])).toContain('phone: 1')
    expect(extractAttachmentIndicators({ ...attachment, text: 'Перейдите https://bad.example и назовите код 1234' }).links).toContain('https://bad.example')
    expect(inspectLinkOffline('http://127.0.0.1/verify').risk).toBe('high')
    expect(extractReceiptFields({ ...attachment, text: 'Сумма 25 000 ₸, KZ12ABCDEF1234567890, 17.07.2026' }).amounts).toContain('25 000 ₸')
    expect(assessAttachmentQuality({ ...attachment, text: 'few' }).level).toBe('poor')
    expect(compareAttachments({ ...attachment, text: 'Сумма 10 000 ₸' }, { ...attachment, text: 'Сумма 20 000 ₸' }).changedIndicators.length).toBeGreaterThan(0)
  })

  it('keeps an explicit local cloud token budget', () => {
    expect(estimateTokens('12345678')).toBe(2)
    expect(canUseCloud({ date: new Date().toISOString().slice(0, 10), usedTokens: DAILY_CLOUD_TOKEN_LIMIT - 4 }, 4)).toBe(true)
    expect(normalizeCloudUsage('{bad json}').usedTokens).toBe(0)
  })
})
