import type { TranscriptLanguage } from './transcriptEnhancer'

export type GecCorrection = {
  original: string
  replacement: string
  confidence: number
  rule: string
}

const kazakhToken = /[а-яёәғқңөұүһі]+/iu
const preserveCase = (original: string, replacement: string): string => original[0] === original[0]?.toUpperCase()
  ? `${replacement[0]?.toUpperCase() ?? ''}${replacement.slice(1)}`
  : replacement

const safeWordRules: Record<string, { replacement: string; rule: string }> = {
  айтпаныз: { replacement: 'айтпаңыз', rule: 'polite-imperative-ending' },
  бериниз: { replacement: 'беріңіз', rule: 'polite-imperative-ending' },
  аударыныз: { replacement: 'аударыңыз', rule: 'polite-imperative-ending' },
  жібериниз: { replacement: 'жіберіңіз', rule: 'polite-imperative-ending' },
  орнатыныз: { replacement: 'орнатыңыз', rule: 'polite-imperative-ending' },
  басыныз: { replacement: 'басыңыз', rule: 'polite-imperative-ending' },
  кодыныз: { replacement: 'кодыңыз', rule: 'possessive-ending' },
  картаныз: { replacement: 'картаңыз', rule: 'possessive-ending' },
  шотыныз: { replacement: 'шотыңыз', rule: 'possessive-ending' },
  телефоныныз: { replacement: 'телефоныңыз', rule: 'possessive-ending' },
}

export function applyKazakhGec(text: string, language: TranscriptLanguage): { text: string; corrections: GecCorrection[] } {
  if (language === 'ru' || language === 'unknown') return { text, corrections: [] }
  let corrected = text
  const corrections: GecCorrection[] = []

  corrected = corrected.replace(/[а-яёәғқңөұүһі]+/giu, (surface) => {
    const rule = safeWordRules[surface.toLocaleLowerCase('kk-KZ')]
    if (!rule || !kazakhToken.test(surface)) return surface
    const next = preserveCase(surface, rule.replacement)
    corrections.push({ original: surface, replacement: next, confidence: 0.9, rule: rule.rule })
    return next
  })

  corrected = corrected.replace(/(^|[\s,.;:!?])([а-яёәғқңөұүһі]+)\s+\2(?=$|[\s,.;:!?])/giu, (surface, prefix: string, word: string) => {
    const replacement = `${prefix}${word}`
    corrections.push({ original: surface, replacement, confidence: 0.86, rule: 'duplicate-word' })
    return replacement
  })
  return { text: corrected, corrections }
}
