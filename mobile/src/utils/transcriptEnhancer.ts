import generatedPack from '../data/ksc2LanguagePack.generated.json'

export type TranscriptLanguage = 'kk' | 'ru' | 'mixed' | 'unknown'

export type TranscriptCorrection = {
  original: string
  replacement: string
  confidence: number
  applied: boolean
  source: 'ksc2_lexicon' | 'normalization'
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

const normalizeSurface = (text: string): string => text
  .normalize('NFC')
  .replace(/[\u00a0\u2007\u202f]/gu, ' ')
  .replace(/[«»„“”]/gu, '"')
  .replace(/[‐‑‒–—]/gu, '-')
  .replace(/\s+([,.;:!?])/gu, '$1')
  .replace(/([,.;:!?])(?=[а-яёәғқңөұүһі])/giu, '$1 ')
  .replace(/\s+/gu, ' ')
  .trim()

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

const inferLanguage = (text: string): TranscriptLanguage => {
  const tokens = text.toLowerCase().match(tokenPattern) ?? []
  if (tokens.length === 0) return 'unknown'
  const kazakh = tokens.filter((token) => kazakhChars.test(token)).length
  if (kazakh === 0) return 'ru'
  const ratio = kazakh / tokens.length
  return ratio >= 0.3 ? 'kk' : 'mixed'
}

const splitLanguageSegments = (text: string): LanguageSegment[] => {
  const chunks = text.match(/[^.!?]+[.!?]?/gu)?.map((item) => item.trim()).filter(Boolean) ?? []
  return chunks.map((chunk) => ({ text: chunk, language: inferLanguage(chunk) }))
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

export function enhanceTranscript(text: string, languagePack: Ksc2LanguagePack = pack): TranscriptEnhancement {
  const rawTranscript = text
  let normalizedTranscript = normalizeSurface(text)
  const corrections: TranscriptCorrection[] = []
  const vocabulary = languagePack === pack ? generatedVocabulary : new Set(languagePack.vocabulary)
  const buckets = languagePack === pack ? generatedBuckets : bucketVocabulary(languagePack)
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

  if (packReady && inferLanguage(normalizedTranscript) !== 'ru') {
    normalizedTranscript = normalizedTranscript.replace(tokenPattern, (surface) => {
      if (corrections.filter((item) => item.source === 'ksc2_lexicon').length >= 8) return surface
      const token = surface.toLowerCase()
      if (token.length < 5 || vocabulary.has(token) || !kazakhChars.test(token)) return surface
      const candidates = [
        ...(buckets.get(`${token[0]}:${token.length}`) ?? []),
        ...(buckets.get(`${token[0]}:${token.length - 1}`) ?? []),
        ...(buckets.get(`${token[0]}:${token.length + 1}`) ?? []),
      ].filter((candidate) => editDistanceAtMostOne(token, candidate))
      const unique = [...new Set(candidates)]
      if (unique.length !== 1) return surface
      const replacement = unique[0]
      if (!replacement) return surface
      const casedReplacement = surface[0] === surface[0]?.toUpperCase()
        ? `${replacement[0]?.toUpperCase() ?? ''}${replacement.slice(1)}`
        : replacement
      corrections.push({ original: surface, replacement: casedReplacement, confidence: 0.96, applied: true, source: 'ksc2_lexicon' })
      return casedReplacement
    })
  }

  const tokens = normalizedTranscript.toLowerCase().match(tokenPattern) ?? []
  const covered = packReady ? tokens.filter((token) => vocabulary.has(token)).length : 0
  const languageSegments = splitLanguageSegments(normalizedTranscript)
  return {
    rawTranscript,
    normalizedTranscript,
    corrections,
    languageSegments,
    dominantLanguage: inferLanguage(normalizedTranscript),
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
    .filter((item) => item.applied && item.source === 'ksc2_lexicon')
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
