import generatedPack from '../data/ksc2LanguagePack.generated.json'
import { detectTranscriptLanguage, identifyWordLanguages, languageConfidence, type DetectedWordLanguage, type DetectedLanguage } from './kazakhLanguageIdentifier'
import { applyKazakhGec } from './kazakhGec'

export type TranscriptLanguage = 'kk' | 'ru' | 'mixed' | 'unknown'

export type TranscriptCorrection = {
  original: string
  replacement: string
  confidence: number
  applied: boolean
  source: 'ksc2_lexicon' | 'normalization' | 'gec'
}

export type LanguageSegment = {
  text: string
  language: TranscriptLanguage
}

export type TranscriptEnhancement = {
  rawTranscript: string
  normalizedTranscript: string
  corrections: TranscriptCorrection[]
  languageSegments: LanguageSegment[]
  dominantLanguage: TranscriptLanguage
  languageConfidence: number
  wordLanguages: Array<{ word: string; language: DetectedWordLanguage; confidence: number }>
  lexiconCoverage: number | null
  packVersion: string
  packReady: boolean
  source: 'ksc2_language_pack'
}

export type Ksc2LanguagePack = {
  schemaVersion: string
  packVersion: string
  generatedAt: string
  source: {
    name: string
    doi: string
    license: string
    attribution: string
    transcriptDigestSha256: string
  }
  statistics: { utterances: number; tokens: number; uniqueTokens: number }
  vocabulary: string[]
  phrases: string[]
}

const pack = generatedPack as Ksc2LanguagePack
const tokenPattern = /[а-яёәғқңөұүһі]+(?:-[а-яёәғқңөұүһі]+)?/giu
const kazakhChars = /[әғқңөұүһі]/iu
const kazakhOnlyChars = /[әғқңөұүһі]/iu

// High-confidence fixes for common Kazakh ASR spellings. KSC2 is a language
// resource, not a grammar model, so arbitrary words must not be rewritten.
const commonKazakhAsrCorrections: Record<string, string> = {
  'қауіпсі': 'қауіпсіз', 'қауіпсиз': 'қауіпсіз', 'кауіпсіз': 'қауіпсіз',
  'казір': 'қазір', 'қазыр': 'қазір', 'кызметкер': 'қызметкер', 'кызметкері': 'қызметкері',
  'айтпаныз': 'айтпаңыз', 'айтпаныздар': 'айтпаңыздар', 'кодыныз': 'кодыңыз',
  'картаныз': 'картаңыз', 'аударыныз': 'аударыңыз', 'жібериниз': 'жіберіңіз', 'орнатыныз': 'орнатыңыз',
}

const normalizeSurface = (text: string): string => text
  .normalize('NFC')
  .replace(/[\u00a0\u2007\u202f]/gu, ' ')
  .replace(/[«»„“”]/gu, '"')
  .replace(/[‐‑‒–—]/gu, '-')
  .replace(/\s+([,.;:!?])/gu, '$1')
  .replace(/([,.;:!?])(?=[а-яёәғқңөұүһі])/giu, '$1 ')
  .replace(/\s+/gu, ' ')
  .trim()

const foldKazakhLetters = (text: string): string => text.toLocaleLowerCase('kk-KZ')
  .replace(/[ә]/gu, 'а').replace(/[ғ]/gu, 'г').replace(/[қ]/gu, 'к').replace(/[ң]/gu, 'н')
  .replace(/[ө]/gu, 'о').replace(/[ұү]/gu, 'у').replace(/[һ]/gu, 'х').replace(/[і]/gu, 'и')

const preserveCase = (surface: string, replacement: string): string => surface[0] === surface[0]?.toUpperCase()
  ? `${replacement[0]?.toUpperCase() ?? ''}${replacement.slice(1)}`
  : replacement

const editDistanceAtMostOne = (left: string, right: string): boolean => {
  if (Math.abs(left.length - right.length) > 1 || left === right) return false
  let a = 0
  let b = 0
  let edits = 0
  while (a < left.length && b < right.length) {
    if (left[a] === right[b]) {
      a += 1
      b += 1
      continue
    }
    edits += 1
    if (edits > 1) return false
    if (left.length > right.length) a += 1
    else if (right.length > left.length) b += 1
    else {
      a += 1
      b += 1
    }
  }
  return edits + Number(a < left.length || b < right.length) === 1
}

const mapLanguage = (language: DetectedLanguage): TranscriptLanguage => language

const splitLanguageSegments = (text: string, vocabulary: Set<string>): LanguageSegment[] => {
  const chunks = text.match(/[^.!?]+[.!?]?/gu)?.map((item) => item.trim()).filter(Boolean) ?? []
  return chunks.map((chunk) => ({ text: chunk, language: mapLanguage(detectTranscriptLanguage(chunk, vocabulary)) }))
}

const bucketVocabulary = (languagePack: Ksc2LanguagePack): Map<string, string[]> => {
  const buckets = new Map<string, string[]>()
  languagePack.vocabulary.forEach((token) => {
    if (token.length < 4 || !kazakhChars.test(token)) return
    const key = `${token[0]}:${token.length}`
    const current = buckets.get(key) ?? []
    if (current.length < 300) current.push(token)
    buckets.set(key, current)
  })
  return buckets
}

const generatedVocabulary = new Set(pack.vocabulary)
const generatedBuckets = bucketVocabulary(pack)
const bucketFoldedVocabulary = (languagePack: Ksc2LanguagePack): Map<string, string[]> => {
  const buckets = new Map<string, string[]>()
  languagePack.vocabulary.forEach((token) => {
    if (token.length < 4 || !kazakhOnlyChars.test(token)) return
    const folded = foldKazakhLetters(token)
    const key = `${folded[0]}:${folded.length}`
    const current = buckets.get(key) ?? []
    if (current.length < 300) current.push(token)
    buckets.set(key, current)
  })
  return buckets
}
const generatedFoldedBuckets = bucketFoldedVocabulary(pack)

export function enhanceTranscript(text: string, languagePack: Ksc2LanguagePack = pack): TranscriptEnhancement {
  const rawTranscript = text
  let normalizedTranscript = normalizeSurface(text)
  const corrections: TranscriptCorrection[] = []
  const vocabulary = languagePack === pack ? generatedVocabulary : new Set(languagePack.vocabulary)
  const buckets = languagePack === pack ? generatedBuckets : bucketVocabulary(languagePack)
  const foldedBuckets = languagePack === pack ? generatedFoldedBuckets : bucketFoldedVocabulary(languagePack)
  const packReady = languagePack.statistics.utterances > 0 && vocabulary.size > 0

  if (normalizedTranscript !== rawTranscript.trim()) {
    corrections.push({
      original: rawTranscript,
      replacement: normalizedTranscript,
      confidence: 1,
      applied: true,
      source: 'normalization',
    })
  }

  if (packReady) {
    normalizedTranscript = normalizedTranscript.replace(tokenPattern, (surface) => {
      if (corrections.filter((item) => item.source === 'ksc2_lexicon').length >= 8) return surface
      const token = surface.toLowerCase()
      const direct = commonKazakhAsrCorrections[token]
      if (direct) {
        const replacement = preserveCase(surface, direct)
        corrections.push({ original: surface, replacement, confidence: 0.98, applied: true, source: 'ksc2_lexicon' })
        return replacement
      }
      if (token.length < 5 || vocabulary.has(token)) return surface
      const folded = foldKazakhLetters(token)
      const candidates = [
        ...(buckets.get(`${token[0]}:${token.length}`) ?? []),
        ...(buckets.get(`${token[0]}:${token.length - 1}`) ?? []),
        ...(buckets.get(`${token[0]}:${token.length + 1}`) ?? []),
      ].filter((candidate) => editDistanceAtMostOne(token, candidate))
      const foldedCandidates = [
        ...(foldedBuckets.get(`${folded[0]}:${folded.length}`) ?? []),
        ...(foldedBuckets.get(`${folded[0]}:${folded.length - 1}`) ?? []),
        ...(foldedBuckets.get(`${folded[0]}:${folded.length + 1}`) ?? []),
      ].filter((candidate) => editDistanceAtMostOne(folded, foldKazakhLetters(candidate)))
      const unique = [...new Set([...candidates, ...foldedCandidates])]
      if (unique.length !== 1) return surface
      const replacement = unique[0]
      if (!replacement) return surface
      const casedReplacement = preserveCase(surface, replacement)
      corrections.push({ original: surface, replacement: casedReplacement, confidence: 0.96, applied: true, source: 'ksc2_lexicon' })
      return casedReplacement
    })
  }

  const detectedBeforeGec = mapLanguage(detectTranscriptLanguage(normalizedTranscript, vocabulary))
  const gec = applyKazakhGec(normalizedTranscript, detectedBeforeGec)
  normalizedTranscript = gec.text
  corrections.push(...gec.corrections.map((item) => ({
    original: item.original,
    replacement: item.replacement,
    confidence: item.confidence,
    applied: true,
    source: 'gec' as const,
  })))

  const tokens = normalizedTranscript.toLowerCase().match(tokenPattern) ?? []
  const covered = packReady ? tokens.filter((token) => vocabulary.has(token)).length : 0
  const dominantLanguage = mapLanguage(detectTranscriptLanguage(normalizedTranscript, vocabulary))
  const languageResults = identifyWordLanguages(normalizedTranscript, vocabulary)
  const languageSegments = splitLanguageSegments(normalizedTranscript, vocabulary)
  return {
    rawTranscript,
    normalizedTranscript,
    corrections,
    languageSegments,
    dominantLanguage,
    languageConfidence: languageConfidence(normalizedTranscript, vocabulary),
    wordLanguages: languageResults.map(({ word, language, confidence }) => ({ word, language, confidence })),
    lexiconCoverage: packReady && tokens.length > 0 ? covered / tokens.length : null,
    packVersion: languagePack.packVersion,
    packReady,
    source: 'ksc2_language_pack',
  }
}

export function buildKsc2LanguageContext(enhancement: TranscriptEnhancement): string {
  const language = enhancement.dominantLanguage === 'kk'
    ? 'Kazakh'
    : enhancement.dominantLanguage === 'ru'
      ? 'Russian'
      : enhancement.dominantLanguage === 'mixed'
        ? 'mixed Kazakh/Russian'
        : 'unknown'
  const coverage = enhancement.lexiconCoverage === null ? 'unavailable' : `${Math.round(enhancement.lexiconCoverage * 100)}%`
  const applied = enhancement.corrections
    .filter((item) => item.applied && (item.source === 'ksc2_lexicon' || item.source === 'gec'))
    .map((item) => `${item.original} -> ${item.replacement}`)
    .slice(0, 5)
  return [
    `Language: ${language}.`,
    `KSC2 pack: ${enhancement.packReady ? enhancement.packVersion : 'not built'}; lexicon coverage: ${coverage}.`,
    applied.length > 0 ? `Transparent ASR corrections: ${applied.join('; ')}.` : 'No KSC2 lexical corrections were applied.',
    'Treat the raw call as evidence; language corrections are derived context and may be wrong.',
  ].join(' ')
}

export const ksc2PackInfo = {
  attribution: pack.source.attribution,
  generatedAt: pack.generatedAt,
  packReady: pack.statistics.utterances > 0,
  packVersion: pack.packVersion,
  transcriptCount: pack.statistics.utterances,
}
