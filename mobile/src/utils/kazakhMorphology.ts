export type KazakhMorphemeRole = 'root' | 'derivational' | 'plural' | 'possessive' | 'case' | 'tense' | 'mood' | 'negation' | 'person' | 'unknown'

export type KazakhMorpheme = {
  form: string
  role: KazakhMorphemeRole
  features: Record<string, string>
}

export type FormalKazakhAnalysis = {
  surface: string
  lemmaGuess: string
  upos: 'NOUN' | 'VERB' | 'ADJ' | 'ADV' | 'PRON' | 'NUM' | 'X'
  morphemes: KazakhMorpheme[]
  features: Record<string, string>
  confidence: number
}

type SuffixRule = {
  forms: readonly string[]
  role: KazakhMorphemeRole
  features: Record<string, string>
  requiresKazakh?: boolean
}

const kazakhSpecific = /[әғқңөұүһі]/iu
const cyrillicWord = /^[а-яёәғқңөұүһі-]+$/iu

const unsortedSuffixRules: SuffixRule[] = [
  { forms: ['маңыз', 'меңіз', 'баңыз', 'беңіз', 'паңыз', 'пеңіз'], role: 'negation', features: { Polarity: 'Neg', Mood: 'Imp', Person: '2', Polite: 'Yes' }, requiresKazakh: true },
  { forms: ['ыңыз', 'іңіз', 'ңыз', 'ңіз'], role: 'mood', features: { Mood: 'Imp', Person: '2', Polite: 'Yes' }, requiresKazakh: true },
  { forms: ['ғандықтан', 'гендіктен', 'қандықтан', 'кендіктен'], role: 'derivational', features: { VerbForm: 'Part', Case: 'Abl', Reason: 'Yes' }, requiresKazakh: true },
  { forms: ['атын', 'етін', 'йтын', 'йтін'], role: 'tense', features: { Tense: 'Past', Aspect: 'Hab', VerbForm: 'Part' }, requiresKazakh: true },
  { forms: ['ған', 'ген', 'қан', 'кен'], role: 'tense', features: { Tense: 'Past', VerbForm: 'Part' }, requiresKazakh: true },
  { forms: ['ар', 'ер', 'р'], role: 'tense', features: { Tense: 'Fut', Aspect: 'Hab' }, requiresKazakh: true },
  { forms: ['ымыз', 'іміз', 'мыз', 'міз'], role: 'possessive', features: { Person: '1', Number: 'Plur', Poss: 'Yes' }, requiresKazakh: true },
  { forms: ['ың', 'ің', 'ң'], role: 'possessive', features: { Person: '2', Number: 'Sing', Poss: 'Yes' }, requiresKazakh: true },
  { forms: ['ы', 'і', 'сы', 'сі'], role: 'possessive', features: { Person: '3', Poss: 'Yes' }, requiresKazakh: true },
  { forms: ['ларының', 'лерінің', 'дарының', 'дерінің', 'тарының', 'терінің'], role: 'case', features: { Number: 'Plur', Case: 'Gen', Poss: 'Yes' }, requiresKazakh: true },
  { forms: ['лардан', 'лерден', 'дардан', 'дерден', 'тардан', 'терден', 'дан', 'ден', 'тан', 'тен'], role: 'case', features: { Case: 'Abl' }, requiresKazakh: true },
  { forms: ['ларға', 'лерге', 'дарға', 'дерге', 'тарға', 'терге', 'ға', 'ге', 'қа', 'ке'], role: 'case', features: { Case: 'Dat' }, requiresKazakh: true },
  { forms: ['ларды', 'лерді', 'дарды', 'дерді', 'тарды', 'терді', 'ды', 'ді', 'ты', 'ті'], role: 'case', features: { Case: 'Acc' }, requiresKazakh: true },
  { forms: ['ларда', 'лерде', 'дарда', 'дерде', 'тарда', 'терде', 'да', 'де', 'та', 'те'], role: 'case', features: { Case: 'Loc' }, requiresKazakh: true },
  { forms: ['мен', 'бен', 'пен'], role: 'case', features: { Case: 'Ins' }, requiresKazakh: true },
  { forms: ['лар', 'лер', 'дар', 'дер', 'тар', 'тер'], role: 'plural', features: { Number: 'Plur' }, requiresKazakh: true },
]

const suffixRules = [...unsortedSuffixRules].sort((left, right) => Math.max(...right.forms.map((form) => form.length)) - Math.max(...left.forms.map((form) => form.length)))

const mergeFeatures = (target: Record<string, string>, source: Record<string, string>) => Object.assign(target, source)

const wordPattern = /[а-яёәғқңөұүһі]+(?:-[а-яёәғқңөұүһі]+)?/giu

const guessUpos = (surface: string, features: Record<string, string>): FormalKazakhAnalysis['upos'] => {
  if (/^\d+(?:[.,]\d+)?$/u.test(surface)) return 'NUM'
  if (features.Mood === 'Imp' || features.Tense || features.VerbForm) return 'VERB'
  if (features.Case || features.Poss || features.Number) return 'NOUN'
  if (/(?:лы|лі|ды|ді|ты|ті)$/iu.test(surface) && kazakhSpecific.test(surface)) return 'ADJ'
  return kazakhSpecific.test(surface) ? 'X' : 'X'
}

export function analyzeKazakhWord(surface: string): FormalKazakhAnalysis {
  const normalized = surface.toLocaleLowerCase('kk-KZ')
  if (!cyrillicWord.test(normalized) || normalized.length < 2) {
    return { surface, lemmaGuess: normalized, upos: 'X', morphemes: [{ form: normalized, role: 'root', features: {} }], features: {}, confidence: 0 }
  }
  const features: Record<string, string> = {}
  const suffixes: KazakhMorpheme[] = []
  let root = normalized
  const canApplyKazakhRules = kazakhSpecific.test(normalized)

  for (let pass = 0; pass < 4; pass += 1) {
    const rule = suffixRules.find((candidate) =>
      (!candidate.requiresKazakh || canApplyKazakhRules) && candidate.forms.some((form) => root.length - form.length >= 2 && root.endsWith(form)),
    )
    if (!rule) break
    const form = rule.forms.find((candidate) => root.length - candidate.length >= 2 && root.endsWith(candidate))
    if (!form) break
    root = root.slice(0, -form.length)
    suffixes.unshift({ form, role: rule.role, features: rule.features })
    mergeFeatures(features, rule.features)
    if (rule.features.Mood === 'Imp') break
  }

  const morphemes = [{ form: root, role: 'root' as const, features: {} }, ...suffixes]
  const upos = guessUpos(normalized, features)
  const confidence = suffixes.length === 0 ? 0.3 : canApplyKazakhRules ? 0.78 : 0.52
  return { surface, lemmaGuess: root, upos, morphemes, features, confidence }
}

export function analyzeKazakhText(text: string): FormalKazakhAnalysis[] {
  return (text.match(wordPattern) ?? []).slice(0, 120).map(analyzeKazakhWord)
}

export function imperativeForms(text: string): FormalKazakhAnalysis[] {
  return analyzeKazakhText(text).filter((analysis) => analysis.features.Mood === 'Imp')
}
