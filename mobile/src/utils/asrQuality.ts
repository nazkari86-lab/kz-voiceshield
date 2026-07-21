import type { TranscriptLanguage } from './transcriptEnhancer'

export type AsrQualityLevel = 'good' | 'degraded' | 'unusable'

export type AsrQuality = {
  level: AsrQualityLevel
  language: TranscriptLanguage
  normalizedText: string
  confidence: number | null
  flags: string[]
}

const tokenPattern = /[а-яёәғқңөұүһі]+(?:-[а-яёәғқңөұүһі]+)?/giu
const kazakhChars = /[әғқңөұүһі]/iu
const hallucinationPatterns = [
  'субтитры', 'подписывайтесь', 'спасибо за просмотр',
  'thanks for watching', '字幕', 'ご視聴ありがとうございました',
]

function detectLanguage(text: string): TranscriptLanguage {
  const tokens = text.toLocaleLowerCase().match(tokenPattern) ?? []
  if (tokens.length === 0) return 'unknown'
  const kk = tokens.filter((token) => kazakhChars.test(token)).length
  if (kk === 0) return 'ru'
  return kk / tokens.length >= 0.3 ? 'kk' : 'mixed'
}

function normalize(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[\u00a0\u2007\u202f]/gu, ' ')
    .replace(/[«»„“”]/gu, '"')
    .replace(/[‐‑‒–—]/gu, '-')
    .replace(/\s+([,.;:!?])/gu, '$1')
    .replace(/\s+/gu, ' ')
    .trim()
}

function hasHeavyRepetition(text: string): boolean {
  const words = text.toLocaleLowerCase().split(/\s+/u).filter(Boolean)
  return words.length >= 8 && new Set(words).size / words.length < 0.3
}

/**
 * Quality metadata only. It never changes a fraud score and never replaces
 * the raw transcript used for evidence.
 */
export function assessAsrQuality(text: string, providerConfidence: number | null = null): AsrQuality {
  const normalizedText = normalize(text)
  const folded = normalizedText.toLocaleLowerCase()
  const flags: string[] = []
  if (!normalizedText) flags.push('empty')
  if (hasHeavyRepetition(normalizedText)) flags.push('repetition')
  if (hallucinationPatterns.some((phrase) => folded.includes(phrase))) flags.push('non_speech_hallucination')
  if (normalizedText.length < 12 && normalizedText.split(/\s+/u).length < 3) flags.push('too_short')

  const level: AsrQualityLevel = flags.includes('empty') || flags.includes('non_speech_hallucination')
    ? 'unusable'
    : flags.length > 0 || (providerConfidence !== null && providerConfidence < 55)
      ? 'degraded'
      : 'good'
  return {
    level,
    language: detectLanguage(normalizedText),
    normalizedText,
    confidence: providerConfidence === null ? null : Math.max(0, Math.min(100, Math.round(providerConfidence))),
    flags,
  }
}
