export type RedactionKind = 'phone' | 'iin' | 'card' | 'iban' | 'otp' | 'email' | 'link'

export type CloudRedaction = {
  text: string
  counts: Record<RedactionKind, number>
}

const emptyCounts = (): Record<RedactionKind, number> => ({ phone: 0, iin: 0, card: 0, iban: 0, otp: 0, email: 0, link: 0 })

const redact = (value: string, expression: RegExp, replacement: string, kind: RedactionKind, counts: Record<RedactionKind, number>) =>
  value.replace(expression, () => {
    counts[kind] += 1
    return replacement
  })

/** Text-only privacy boundary before a consented cloud request. Audio is never passed here. */
export function redactForCloud(value: string): CloudRedaction {
  const counts = emptyCounts()
  let text = value
  text = redact(text, /\bKZ\d{2}[A-Z0-9]{10,30}\b/giu, '[REDACTED IBAN]', 'iban', counts)
  text = redact(text, /(?<!\d)(?:\+?7|8)[\s()-]?\d{3}[\s()-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}(?!\d)/gu, '[REDACTED PHONE]', 'phone', counts)
  text = redact(text, /\b\d[ -]?\d{3}[ -]?\d{4}[ -]?\d{4}[ -]?\d{3,6}\b/gu, '[REDACTED CARD]', 'card', counts)
  text = redact(text, /\b\d{12}\b/gu, '[REDACTED IIN]', 'iin', counts)
  const otpPattern = /((?:sms|смс|код|otp|pin|cvv|пароль|иин|жсн|растау)[^\p{L}\p{N}]{0,16})\d{3,12}\b/giu
  counts.otp += [...text.matchAll(otpPattern)].length
  // Replace only the number so the explanatory context remains useful to the model.
  text = text.replace(otpPattern, '$1[REDACTED]')
  text = redact(text, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, '[REDACTED EMAIL]', 'email', counts)
  text = redact(text, /(?:https?:\/\/)?(?:t\.me|wa\.me)\/[^\s]+/giu, '[REDACTED LINK]', 'link', counts)
  return { text, counts }
}

export function summarizeRedactions(counts: Record<RedactionKind, number>): string {
  const labels: Record<RedactionKind, string> = { phone: 'phone', iin: 'IIN', card: 'card', iban: 'IBAN', otp: 'code', email: 'email', link: 'link' }
  return (Object.entries(counts) as Array<[RedactionKind, number]>).filter(([, count]) => count > 0).map(([kind, count]) => `${labels[kind]}: ${count}`).join(', ')
}
