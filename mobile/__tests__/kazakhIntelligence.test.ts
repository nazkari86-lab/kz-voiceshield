import { buildKazakhIntelligenceContext, buildKazakhSemanticIR, modelKazakhMode, validateKazakhResponse } from '../src/utils/kazakhIntelligence'
import { enhanceTranscript, type Ksc2LanguagePack } from '../src/utils/transcriptEnhancer'

const pack: Ksc2LanguagePack = {
  schemaVersion: 'voiceshield.ksc2-language-pack.v1', packVersion: 'test', generatedAt: 'now',
  source: { name: 'KSC2', doi: 'x', license: 'CC BY 4.0', attribution: 'x', transcriptDigestSha256: 'x' },
  statistics: { utterances: 1, tokens: 20, uniqueTokens: 20 },
  vocabulary: ['банк', 'қызметкері', 'кодты', 'айтпаңыз', 'теңге', 'аударыңыз'], phrases: [],
}

describe('Kazakh intelligence runtime', () => {
  const enhancement = enhanceTranscript('Банк қызметкері кодты айтпаңыз деді. 50000 теңге аударыңыз.', pack)

  it('creates structured semantics and morphology', () => {
    const ir = buildKazakhSemanticIR(enhancement)
    expect(ir.language).toBe('kk')
    expect(ir.numbers).toContain('50000')
    expect(ir.moneyMentions.join(' ')).toContain('теңге')
    expect(ir.negations).toContain('айтпаңыз')
    expect(ir.morphology.some((token) => token.suffixes.length > 0)).toBe(true)
    expect(ir.imperativeVerbs).toContain('айт')
  })

  it('keeps formal case, possession, plural and imperative information', () => {
    const ir = buildKazakhSemanticIR(enhanceTranscript('Кітаптарымыздан кодты айтпаңыз. Ақшаны аударыңыз.', pack))
    const ablative = ir.morphology.find((token) => token.surface.toLowerCase() === 'кітаптарымыздан')
    const negativeImperative = ir.morphology.find((token) => token.surface.toLowerCase() === 'айтпаңыз')
    const politeImperative = ir.morphology.find((token) => token.surface.toLowerCase() === 'аударыңыз')
    expect(ablative?.lemmaGuess).toBe('кітап')
    expect(ablative?.features.Case).toBe('Abl')
    expect(ablative?.features.Number).toBe('Plur')
    expect(negativeImperative?.features.Polarity).toBe('Neg')
    expect(negativeImperative?.features.Mood).toBe('Imp')
    expect(politeImperative?.lemmaGuess).toBe('аудар')
    expect(politeImperative?.features.Mood).toBe('Imp')
  })

  it('routes Kazakh-specialized and generic models differently', () => {
    expect(modelKazakhMode('local', 'Qolda Q5')).toBe('native')
    expect(modelKazakhMode('cloud', 'Claude')).toBe('assisted')
    expect(modelKazakhMode('local', 'Generic GGUF')).toBe('semantic_bridge')
    expect(buildKazakhIntelligenceContext(enhancement)).toContain('Preserve names, numbers, negation')
  })

  it('flags language loss and introduced numbers', () => {
    const result = validateKazakhResponse(enhancement.normalizedTranscript, 'Нужно перевести 70000 тенге.')
    expect(result.introducedNumbers).toContain('70000')
    expect(result.shouldReview).toBe(true)
    expect(result.warnings.join(' ')).toContain('казахский')
  })
})
