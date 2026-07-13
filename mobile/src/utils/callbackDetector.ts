// Detects when the caller mentions a callback number — classic scam tactic:
// "if you have any questions, call us back at 87001234567"
// If that number doesn't match officialOrganizations, it's suspicious.

import { officialOrganizations } from '../data/officialOrganizations'

const CALLBACK_TRIGGERS_RU = [
  'перезвоните', 'позвоните нам', 'позвоните по номеру', 'наш номер',
  'call back', 'обратный звонок', 'позвоните обратно', 'свяжитесь с нами по',
  'наша горячая линия', 'звоните нам', 'телефон для связи',
]
const CALLBACK_TRIGGERS_KZ = [
  'қайта қоңырау шалыңыз', 'нөміріміз', 'бізге хабарласыңыз',
]

const ALL_TRIGGERS = [...CALLBACK_TRIGGERS_RU, ...CALLBACK_TRIGGERS_KZ]

// Loose phone number pattern for KZ/RU: 7-digit to 11-digit sequences
const PHONE_RE = /(?:\+7|8)?[\s\-]?\(?7\d{2}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}|\b\d{4,5}\b/g

export type CallbackResult = {
  detected: boolean
  mentionedNumbers: string[]
  officialMatch: boolean
  warning: string | null
}

const knownNumbers = new Set(officialOrganizations.map((o) => o.phone.replace(/\s/g, '')))

export function detectCallbackNumber(transcript: string): CallbackResult {
  const lower = transcript.toLowerCase()
  const hasTrigger = ALL_TRIGGERS.some((t) => lower.includes(t))
  if (!hasTrigger) return { detected: false, mentionedNumbers: [], officialMatch: false, warning: null }

  const mentionedNumbers = [...new Set((transcript.match(PHONE_RE) ?? []).map((n) => n.replace(/[\s\-()]/g, '')))]
  if (mentionedNumbers.length === 0) return { detected: false, mentionedNumbers: [], officialMatch: false, warning: null }

  const officialMatch = mentionedNumbers.some((n) => knownNumbers.has(n))

  return {
    detected: true,
    mentionedNumbers,
    officialMatch,
    warning: officialMatch
      ? null
      : `Caller gave a callback number (${mentionedNumbers[0]}) that does not match any official organization in the verified directory. Do not call it back.`,
  }
}
