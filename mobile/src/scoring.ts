export type RiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical'

export type RiskSignal = {
  id: string
  title: string
  severity: Exclude<RiskLevel, 'safe'>
  weight: number
  terms: string[]
  advice: string
}

export type RiskResult = {
  score: number
  level: RiskLevel
  matched: Array<RiskSignal & { hits: string[] }>
  summary: string
  checklist: string[]
}

const rules: RiskSignal[] = [
  {
    id: 'bank-security',
    title: 'Bank security impersonation',
    severity: 'critical',
    weight: 34,
    terms: ['служба безопасности банка', 'подозрительная операция', 'карта заблокирована', 'kaspi bank', 'халық банк'],
    advice: 'Hang up and call the bank through the official app or card number.',
  },
  {
    id: 'otp-code',
    title: 'OTP/SMS/PIN/CVV extraction',
    severity: 'critical',
    weight: 36,
    terms: ['sms код', 'sms-код', 'код из sms', 'код подтверждения', 'pin', 'cvv', 'пароль', 'иин', 'жсн', 'назовите', 'продиктуйте'],
    advice: 'Never share one-time codes, IIN, PIN, CVV or passwords during a call.',
  },
  {
    id: 'safe-account',
    title: 'Safe account or urgent transfer',
    severity: 'critical',
    weight: 34,
    terms: ['безопасный счет', 'қауіпсіз шот', 'переведите деньги', 'переведи', 'ақша аудар', 'оформить кредит'],
    advice: 'Do not move money during a call. Freeze the action and verify offline.',
  },
  {
    id: 'remote-access',
    title: 'Remote access or screen sharing',
    severity: 'high',
    weight: 28,
    terms: ['anydesk', 'teamviewer', 'удаленный доступ', 'демонстрация экрана', 'экран', 'приложение скачайте'],
    advice: 'Do not install remote-control apps or share your screen.',
  },
  {
    id: 'ai-family',
    title: 'AI voice or family emergency',
    severity: 'high',
    weight: 24,
    terms: ['апа', 'мама', 'папа', 'авария', 'больница', 'голос плохо слышно', 'не звони', 'мой номер временно не работает'],
    advice: 'Call the relative back using a saved number and ask a private verification question.',
  },
  {
    id: 'urgency',
    title: 'Urgency, secrecy or isolation',
    severity: 'medium',
    weight: 16,
    terms: ['срочно', 'немедленно', 'времени нет', 'қазір', 'тез', 'никому не говорите', 'не кладите трубку', 'құпия'],
    advice: 'Pause. Scammers use speed and isolation to prevent verification.',
  },
]

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const riskFromScore = (score: number): RiskLevel =>
  score >= 85 ? 'critical' : score >= 65 ? 'high' : score >= 35 ? 'medium' : score > 0 ? 'low' : 'safe'

export const scoreTranscript = (text: string): RiskResult => {
  const normalized = normalize(text)
  const matched = rules
    .map((rule) => ({ ...rule, hits: rule.terms.filter((term) => normalized.includes(normalize(term))) }))
    .filter((rule) => rule.hits.length > 0)

  const comboBonus =
    matched.some((item) => item.id === 'otp-code') && matched.some((item) => item.id === 'safe-account')
      ? 20
      : matched.some((item) => item.id === 'bank-security') && matched.some((item) => item.id === 'remote-access')
        ? 16
        : 0
  const rawScore = matched.reduce((sum, item) => sum + item.weight + Math.max(0, item.hits.length - 1) * 4, 0) + comboBonus
  const score = Math.min(99, rawScore)
  const level = riskFromScore(score)

  return {
    checklist:
      level === 'safe'
        ? ['Continue only through official channels.', 'Never share codes, PIN, CVV or IIN.']
        : ['End the call before any transfer or code sharing.', 'Verify through a saved official number.', 'Preserve transcript, number, links and timestamps.'],
    level,
    matched,
    score,
    summary: level === 'safe' ? 'No active scam pattern' : matched.map((item) => item.title).join(', '),
  }
}
