import { analyzeSms, type SmsAnalysis } from './smsRisk'

export type RecentSmsLike = { address: string; body: string; date: number }
export type CrossChannelSignal = {
  matched: boolean
  confidence: number
  reasons: string[]
  recentSms: Array<{ sender: string; analysis: SmsAnalysis }>
}

function digits(value: string): string {
  return value.replace(/\D/gu, '').slice(-10)
}

export function correlateSmsWithCall(callNumber: string, transcript: string, messages: RecentSmsLike[], now = Date.now()): CrossChannelSignal {
  const callDigits = digits(callNumber)
  const recent = messages
    .filter((message) => now - message.date >= 0 && now - message.date <= 15 * 60 * 1000)
    .map((message) => ({ sender: message.address, analysis: analyzeSms(message.body, message.address), date: message.date }))
    .filter((message) => message.analysis.score >= 20 || message.analysis.entities.some((entity) => entity.type === 'otp' || entity.type === 'action'))
  const sameNumber = recent.some((message) => {
    const senderDigits = digits(message.sender)
    return Boolean(callDigits && senderDigits && (callDigits.endsWith(senderDigits) || senderDigits.endsWith(callDigits)))
  })
  const transcriptMentionsCode = /(?:код|otp|парол|cvv|растау коды|кіру коды)/iu.test(transcript)
  const transcriptMentionsTransfer = /(?:перевед|аудар|безопасн[а-яё]* сч[её]т|шотқа)/iu.test(transcript)
  const smsHasSecret = recent.some((message) => message.analysis.entities.some((entity) => entity.type === 'otp'))
  const smsHasAction = recent.some((message) => message.analysis.entities.some((entity) => entity.type === 'action' || entity.type === 'link'))
  const reasons: string[] = []
  if (sameNumber) reasons.push('recent SMS came from the calling number')
  if (transcriptMentionsCode && smsHasSecret) reasons.push('call and SMS both reference a one-time code')
  if (transcriptMentionsTransfer && smsHasAction) reasons.push('call asks for an action also signalled by a recent SMS')
  const matched = reasons.length > 0
  return { matched, confidence: matched ? Math.min(0.95, 0.45 + reasons.length * 0.2) : 0.1, reasons, recentSms: recent.map(({ sender, analysis }) => ({ sender, analysis })) }
}
