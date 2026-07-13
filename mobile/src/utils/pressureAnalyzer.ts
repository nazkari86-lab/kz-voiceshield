// Pressure pattern analyzer: measures speech density, repetition,
// and urgency phrase concentration in the transcript.
// Returns an augmented risk signal that can be fed into the analysis pipeline.

const URGENCY_PHRASES_RU = [
  'срочно', 'немедленно', 'сейчас же', 'прямо сейчас', 'не теряйте время',
  'времени нет', 'через минуту', 'через час', 'до конца дня', 'сегодня только',
  'не кладите трубку', 'не вешайте', 'оставайтесь на линии', 'ждите',
  'никому не говорите', 'это конфиденциально', 'без посторонних', 'в тайне',
  'не говорите родственникам', 'не сообщайте', 'молчите',
]
const URGENCY_PHRASES_KZ = [
  'шұғыл', 'дереу', 'қазір', 'тез', 'ешкімге айтпа', 'құпия',
  'күте тұрыңыз', 'желіде қалыңыз',
]
const AUTHORITY_PHRASES = [
  'банк', 'полиция', 'прокуратура', 'следователь', 'министерство',
  'финансовый мониторинг', 'налоговая', 'суд', 'арест', 'уголовный',
  'банк', 'полиция', 'afm', 'nbrk', 'ұлттық банк',
]

const ALL_URGENCY = [...URGENCY_PHRASES_RU, ...URGENCY_PHRASES_KZ]

export type PressureScore = {
  urgencyDensity: number   // 0–1: ratio of urgency phrases to total words
  authorityScore: number   // 0–1: presence of authority impersonation terms
  repetitionScore: number  // 0–1: ratio of repeated unique words
  overallPressure: number  // 0–100 composite
  flags: string[]
}

export function analyzePressure(transcript: string): PressureScore {
  if (!transcript || transcript.trim().length < 10) {
    return { urgencyDensity: 0, authorityScore: 0, repetitionScore: 0, overallPressure: 0, flags: [] }
  }

  const lower = transcript.toLowerCase()
  const words = lower.split(/\s+/).filter((w) => w.length > 2)
  const total = Math.max(1, words.length)

  // Urgency density
  let urgencyHits = 0
  const flags: string[] = []
  for (const phrase of ALL_URGENCY) {
    if (lower.includes(phrase)) {
      urgencyHits++
      if (flags.length < 3) flags.push(phrase)
    }
  }
  const urgencyDensity = Math.min(1, urgencyHits / 5)

  // Authority impersonation
  let authHits = 0
  for (const phrase of AUTHORITY_PHRASES) {
    if (lower.includes(phrase)) authHits++
  }
  const authorityScore = Math.min(1, authHits / 3)

  // Word repetition (scammers repeat key phrases to pressure)
  const uniqueWords = new Set(words)
  const repetitionScore = words.length > 10 ? Math.min(1, 1 - uniqueWords.size / total) : 0

  // Composite (weighted)
  const overallPressure = Math.min(100, Math.round(
    (urgencyDensity * 40) + (authorityScore * 35) + (repetitionScore * 25),
  ))

  return { urgencyDensity, authorityScore, repetitionScore, overallPressure, flags }
}
