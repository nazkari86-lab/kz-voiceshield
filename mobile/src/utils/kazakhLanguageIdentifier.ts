export type DetectedWordLanguage = 'kk' | 'ru' | 'unknown'
export type DetectedLanguage = 'kk' | 'ru' | 'mixed' | 'unknown'

export type WordLanguageResult = {
  word: string
  language: DetectedWordLanguage
  confidence: number
  reason: 'lexicon' | 'kazakh_letter' | 'russian_stopword' | 'unknown'
}

const wordPattern = /[а-яёәғқңөұүһі]+(?:-[а-яёәғқңөұүһі]+)?/giu
const kazakhLetters = /[әғқңөұүһі]/iu
const russianStopwords = new Set('и в во не что он на я с со как а то все она так его но да ты к тебе у же вы за бы по только ее мне было вот от меня еще нет о из ему теперь сейчас когда даже ну вдруг ли если уже или быть был него до тебя ведь там потом себя ничего ей может они тут где есть надо'.split(' '))
const kazakhStopwords = new Set('мен және де да бұл ол біз сіз сен үшін бойынша бірақ ғана емес керек қазір қалай немесе не бар жоқ айтпаңыз'.split(' '))

const foldKazakhLetters = (text: string): string => text.toLocaleLowerCase('kk-KZ')
  .replace(/[ә]/gu, 'а').replace(/[ғ]/gu, 'г').replace(/[қ]/gu, 'к').replace(/[ң]/gu, 'н')
  .replace(/[ө]/gu, 'о').replace(/[ұү]/gu, 'у').replace(/[һ]/gu, 'х').replace(/[і]/gu, 'и')

export function classifyWord(word: string, kazakhVocabulary = new Set<string>()): WordLanguageResult {
  const normalized = word.toLocaleLowerCase('kk-KZ')
  if (normalized.length < 2) return { word, language: 'unknown', confidence: 0, reason: 'unknown' }
  if (kazakhVocabulary.has(normalized)) return { word, language: 'kk', confidence: 0.98, reason: 'lexicon' }
  if (kazakhStopwords.has(normalized)) return { word, language: 'kk', confidence: 0.95, reason: 'lexicon' }
  if (russianStopwords.has(normalized)) return { word, language: 'ru', confidence: 0.95, reason: 'russian_stopword' }
  if (kazakhLetters.test(normalized)) return { word, language: 'kk', confidence: 0.88, reason: 'kazakh_letter' }
  const folded = foldKazakhLetters(normalized)
  const foldedMatch = [...kazakhVocabulary].some((candidate) => foldKazakhLetters(candidate) === folded && kazakhLetters.test(candidate))
  if (foldedMatch) return { word, language: 'kk', confidence: 0.84, reason: 'lexicon' }
  return { word, language: 'unknown', confidence: 0.35, reason: 'unknown' }
}

export function identifyWordLanguages(text: string, kazakhVocabulary = new Set<string>()): WordLanguageResult[] {
  return (text.match(wordPattern) ?? []).map((word) => classifyWord(word, kazakhVocabulary))
}

export function detectTranscriptLanguage(text: string, kazakhVocabulary = new Set<string>()): DetectedLanguage {
  const results = identifyWordLanguages(text, kazakhVocabulary)
  const known = results.filter((result) => result.language !== 'unknown')
  if (known.length === 0) return 'unknown'
  const kk = known.filter((result) => result.language === 'kk').length
  const ru = known.filter((result) => result.language === 'ru').length
  if (kk > 0 && ru > 0) return 'mixed'
  return kk > 0 ? 'kk' : 'ru'
}

export function languageConfidence(text: string, kazakhVocabulary = new Set<string>): number {
  const known = identifyWordLanguages(text, kazakhVocabulary).filter((result) => result.language !== 'unknown')
  if (known.length === 0) return 0
  return Math.round((known.reduce((sum, result) => sum + result.confidence, 0) / known.length) * 100) / 100
}
