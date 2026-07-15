import { buildKsc2LanguageContext, enhanceTranscript, type Ksc2LanguagePack } from '../src/utils/transcriptEnhancer'

const testPack: Ksc2LanguagePack = {
  schemaVersion: 'voiceshield.ksc2-language-pack.v1',
  packVersion: 'test',
  generatedAt: '2026-07-15T00:00:00Z',
  source: { name: 'KSC2', doi: 'test', license: 'CC BY 4.0', attribution: 'test', transcriptDigestSha256: 'test' },
  statistics: { utterances: 2, tokens: 8, uniqueTokens: 8 },
  vocabulary: ['сәлем', 'қызметкері', 'хабарласты', 'банктен', 'келген', 'кодты', 'айтпаңыз', 'қауіпсіз'],
  phrases: ['кодты айтпаңыз'],
}

describe('KSC2 transcript enhancer', () => {
  it('normalizes Unicode punctuation while preserving the raw evidence', () => {
    const result = enhanceTranscript('  Сәлем—банктен   хабарласты!  ', testPack)
    expect(result.rawTranscript).toBe('  Сәлем—банктен   хабарласты!  ')
    expect(result.normalizedTranscript).toBe('Сәлем-банктен хабарласты!')
    expect(result.corrections[0]).toMatchObject({ applied: true, source: 'normalization' })
  })

  it('applies only one unambiguous Kazakh lexicon correction', () => {
    const result = enhanceTranscript('Сәлем, қызметкері хабарласты. Қауіпсі кодты айтпаңыз.', testPack)
    expect(result.packReady).toBe(true)
    expect(result.dominantLanguage).toBe('kk')
    expect(result.lexiconCoverage).toBeGreaterThan(0.7)
    expect(result.normalizedTranscript).toContain('Қауіпсіз')
    expect(result.corrections).toContainEqual(expect.objectContaining({ original: 'Қауіпсі', replacement: 'Қауіпсіз', source: 'ksc2_lexicon' }))
  })

  it('does not claim KSC2 coverage when the pack is only a bootstrap manifest', () => {
    const result = enhanceTranscript('Назовите код', { ...testPack, statistics: { utterances: 0, tokens: 0, uniqueTokens: 0 }, vocabulary: [] })
    expect(result.packReady).toBe(false)
    expect(result.lexiconCoverage).toBeNull()
    expect(buildKsc2LanguageContext(result)).toContain('not built')
  })

  it('repairs common Kazakh ASR spellings with the generated pack', () => {
    const result = enhanceTranscript('Қауіпсі кодты айтпаныз. Казір кодынызды сұрайды.')
    expect(result.packReady).toBe(true)
    expect(result.normalizedTranscript).toContain('Қауіпсіз')
    expect(result.normalizedTranscript).toContain('айтпаңыз')
    expect(result.normalizedTranscript).toContain('Қазір')
    expect(result.corrections.filter((item) => item.source === 'ksc2_lexicon').length).toBeGreaterThanOrEqual(3)
  })
})
