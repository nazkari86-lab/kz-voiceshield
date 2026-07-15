import { classifyWord, detectTranscriptLanguage, identifyWordLanguages, languageConfidence } from '../src/utils/kazakhLanguageIdentifier'

const vocabulary = new Set(['қауіпсіз', 'банктен', 'айтпаңыз', 'қызметкері'])

describe('Kazakh language identifier', () => {
  it('classifies individual Kazakh and Russian words', () => {
    expect(classifyWord('қауіпсіз', vocabulary).language).toBe('kk')
    expect(classifyWord('банк', vocabulary).language).toBe('unknown')
    expect(classifyWord('сейчас').language).toBe('ru')
  })

  it('detects mixed speech and returns per-word evidence', () => {
    const words = identifyWordLanguages('Сейчас банк қауіпсіз емес', vocabulary)
    expect(words.some((word) => word.language === 'ru')).toBe(true)
    expect(words.some((word) => word.language === 'kk')).toBe(true)
    expect(detectTranscriptLanguage('Сейчас банк қауіпсіз емес', vocabulary)).toBe('mixed')
    expect(languageConfidence('Сейчас банк қауіпсіз емес', vocabulary)).toBeGreaterThan(0.7)
  })

  it('uses character n-grams when diacritics and exact spelling are missing', () => {
    const result = classifyWord('кауипсиздикк', new Set(['қауіпсіздік', 'қауіпсіз', 'қызметкері']))
    expect(result.language).toBe('kk')
    expect(result.reason).toBe('char_ngram')
  })
})
