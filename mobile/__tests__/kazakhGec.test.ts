import { applyKazakhGec } from '../src/utils/kazakhGec'

describe('Kazakh GEC layer', () => {
  it('repairs safe polite endings and duplicated words', () => {
    const result = applyKazakhGec('Айтпаныз кодты кодты.', 'kk')
    expect(result.text).toBe('Айтпаңыз кодты.')
    expect(result.corrections.map((item) => item.rule)).toEqual(expect.arrayContaining(['polite-imperative-ending', 'duplicate-word']))
  })

  it('does not rewrite Russian-only text', () => {
    expect(applyKazakhGec('Назовите код ещё раз.', 'ru').corrections).toHaveLength(0)
  })
})
