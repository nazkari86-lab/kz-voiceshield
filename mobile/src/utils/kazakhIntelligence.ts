import type { TranscriptEnhancement, TranscriptLanguage } from './transcriptEnhancer'
import { analyzeKazakhText, type KazakhMorpheme } from './kazakhMorphology'

export type KazakhModelMode = 'native' | 'assisted' | 'semantic_bridge'

export type KazakhMorphToken = {
  surface: string
  root: string
  suffixes: string[]
  kazakhSpecific: boolean
  lemmaGuess: string
  upos: string
  features: Record<string, string>
  morphemes: KazakhMorpheme[]
  confidence: number
}

export type KazakhSemanticIR = {
  schemaVersion: 'voiceshield.kazakh-semantic-ir.v1'
  language: TranscriptLanguage
  codeSwitching: boolean
  normalizedText: string
  numbers: string[]
  moneyMentions: string[]
  organizations: string[]
  negations: string[]
  commands: string[]
  imperativeVerbs: string[]
  uncertainWords: string[]
  morphology: KazakhMorphToken[]
}

export type KazakhResponseQuality = {
  score: number
  language: TranscriptLanguage
  introducedNumbers: string[]
  malformedTokens: string[]
  warnings: string[]
  shouldReview: boolean
}

const wordPattern = /[а-яёәғқңөұүһі]+(?:-[а-яёәғқңөұүһі]+)?/giu
const kazakhSpecific = /[әғқңөұүһі]/iu
const cyrillicWord = /^[а-яёәғқңөұүһі-]+$/iu
const broadWordPattern = /[a-zа-яёәғқңөұүһі\ufffd-]+/giu
const trustedSafetyNumbers = new Set(['102', '112', '1459'])

const numberWords = new Set([
  'нөл', 'бір', 'екі', 'үш', 'төрт', 'бес', 'алты', 'жеті', 'сегіз', 'тоғыз',
  'он', 'жиырма', 'отыз', 'қырық', 'елу', 'алпыс', 'жетпіс', 'сексен', 'тоқсан', 'жүз', 'мың', 'миллион',
])

const organizationTerms = ['банк', 'kaspi', 'халық банк', 'полиция', 'прокуратура', 'ұлттық банк', 'egov', 'қазпошта']
const commandTerms = ['айтыңыз', 'атаңыз', 'жіберіңіз', 'аударыңыз', 'орнатыңыз', 'басыңыз', 'жүктеңіз', 'құпия сақтаңыз', 'тұтқаны қоймаңыз']
const negationTerms = ['емес', 'жоқ', 'болмайды', 'айтпаңыз', 'жібермеңіз', 'сенбеңіз', 'бермеңіз']

const unique = (items: string[]): string[] => [...new Set(items)]

export function analyzeKazakhMorphology(text: string): KazakhMorphToken[] {
  return analyzeKazakhText(text).map((analysis) => ({
    surface: analysis.surface,
    root: analysis.lemmaGuess,
    suffixes: analysis.morphemes.filter((part) => part.role !== 'root').map((part) => part.form),
    kazakhSpecific: kazakhSpecific.test(analysis.surface),
    lemmaGuess: analysis.lemmaGuess,
    upos: analysis.upos,
    features: analysis.features,
    morphemes: analysis.morphemes,
    confidence: analysis.confidence,
  }))
}

const extractNumbers = (text: string): string[] => {
  const digits = text.match(/\b\d+(?:[.,]\d+)?\b/gu) ?? []
  const words = (text.toLowerCase().match(wordPattern) ?? []).filter((token) => numberWords.has(token))
  return unique([...digits, ...words])
}

export function buildKazakhSemanticIR(enhancement: TranscriptEnhancement): KazakhSemanticIR {
  const text = enhancement.normalizedTranscript
  const lower = text.toLowerCase()
  const morphology = analyzeKazakhMorphology(text)
  const unknown = morphology
    .filter((token) => token.kazakhSpecific && token.root.length < 2)
    .map((token) => token.surface)
  return {
    schemaVersion: 'voiceshield.kazakh-semantic-ir.v1',
    language: enhancement.dominantLanguage,
    codeSwitching: enhancement.languageSegments.some((segment) => segment.language === 'ru') &&
      enhancement.languageSegments.some((segment) => segment.language === 'kk' || segment.language === 'mixed'),
    normalizedText: text,
    numbers: extractNumbers(text),
    moneyMentions: unique((text.match(/(?:\d[\d\s.,]*|[а-яёәғқңөұүһі-]+)\s*(?:₸|теңге|тенге)/giu) ?? []).map((item) => item.trim())),
    organizations: organizationTerms.filter((term) => lower.includes(term)),
    negations: negationTerms.filter((term) => lower.includes(term)),
    commands: unique([
      ...commandTerms.filter((term) => lower.includes(term)),
      ...morphology.filter((token) => token.features.Mood === 'Imp').map((token) => token.surface),
    ]),
    imperativeVerbs: morphology.filter((token) => token.features.Mood === 'Imp').map((token) => token.lemmaGuess),
    uncertainWords: unknown,
    morphology: morphology.filter((token) => token.suffixes.length > 0).slice(0, 24),
  }
}

export function modelKazakhMode(engine: string, modelName: string): KazakhModelMode {
  const identity = modelName.toLowerCase()
  if (/qolda|kazllm|til-?2b/u.test(identity)) return 'native'
  if (engine === 'cloud' || /gpt|claude|gemini|qwen/u.test(identity)) return 'assisted'
  return 'semantic_bridge'
}

export function buildKazakhIntelligenceContext(
  enhancement: TranscriptEnhancement,
  engine = 'unknown',
  modelName = '',
): string {
  const ir = buildKazakhSemanticIR(enhancement)
  const mode = modelKazakhMode(engine, modelName)
  const morphology = ir.morphology.slice(0, 12).map((token) => {
    const features = Object.entries(token.features).map(([key, value]) => `${key}=${value}`).join('|')
    return `${token.surface}=${token.lemmaGuess}<${token.upos}>${features ? `[${features}]` : ''}+${token.suffixes.join('+')}`
  }).join('; ')
  return [
    `Kazakh runtime mode: ${mode}. Semantic IR is derived context, not call evidence.`,
    `Language=${ir.language}; codeSwitching=${ir.codeSwitching}; numbers=${ir.numbers.join(', ') || 'none'}; money=${ir.moneyMentions.join(', ') || 'none'}.`,
    `Organizations=${ir.organizations.join(', ') || 'none'}; negations=${ir.negations.join(', ') || 'none'}; commands=${ir.commands.join(', ') || 'none'}; imperativeLemmas=${ir.imperativeVerbs.join(', ') || 'none'}.`,
    morphology ? `Morphology: ${morphology}.` : '',
    'Preserve names, numbers, negation and intent exactly. Answer in natural literary Kazakh when the user or transcript is Kazakh; never replace Kazakh-specific letters with Russian equivalents.',
  ].filter(Boolean).join(' ')
}

export function validateKazakhResponse(sourceText: string, response: string): KazakhResponseQuality {
  const sourceNumbers = new Set(extractNumbers(sourceText))
  const responseNumbers = extractNumbers(response)
  const introducedNumbers = responseNumbers.filter((number) => !sourceNumbers.has(number) && !trustedSafetyNumbers.has(number))
  const words = response.match(wordPattern) ?? []
  const malformedTokens = unique((response.match(broadWordPattern) ?? []).filter((word) => {
    if (word.includes('\ufffd')) return true
    const hasLatin = /[a-z]/iu.test(word)
    const hasCyrillic = /[а-яёәғқңөұүһі]/iu.test(word)
    return hasLatin && hasCyrillic && !cyrillicWord.test(word)
  })).slice(0, 8)
  const language: TranscriptLanguage = kazakhSpecific.test(response)
    ? (/(?:^|\s)(?:это|что|который|нужно|можно)(?:\s|$)/iu.test(response) ? 'mixed' : 'kk')
    : words.length > 0 ? 'ru' : 'unknown'
  const warnings: string[] = []
  if (introducedNumbers.length > 0) warnings.push(`Ответ добавил числа, которых нет в исходном тексте: ${introducedNumbers.join(', ')}`)
  if (malformedTokens.length > 0) warnings.push('Обнаружены повреждённые кириллические токены.')
  if (kazakhSpecific.test(sourceText) && language === 'ru') warnings.push('Модель не сохранила казахский язык ответа.')
  const score = Math.max(0, 100 - introducedNumbers.length * 20 - malformedTokens.length * 8 - (warnings.some((item) => item.includes('казахский')) ? 35 : 0))
  return { score, language, introducedNumbers, malformedTokens, warnings, shouldReview: score < 80 }
}
