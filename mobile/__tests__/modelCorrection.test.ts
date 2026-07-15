import { parseAndValidateModelCorrection } from '../src/utils/modelCorrection'

describe('model correction validator', () => {
  it('accepts a high-confidence Kazakh correction', () => {
    const result = parseAndValidateModelCorrection(
      JSON.stringify({ correctedTranscript: 'Айтпаңыз кодты.', corrections: [{ original: 'Айтпаныз', replacement: 'Айтпаңыз', confidence: 0.96, reason: 'ending' }] }),
      'Айтпаныз кодты.',
      'kk',
    )
    expect(result.rejected).toBe(false)
    expect(result.correctedTranscript).toBe('Айтпаңыз кодты.')
    expect(result.corrections).toHaveLength(1)
  })

  it('rejects a model that changes a number or a negation', () => {
    const result = parseAndValidateModelCorrection(
      JSON.stringify({ correctedTranscript: 'Назовите код 987654.', corrections: [] }),
      'Не называйте код 123456.',
      'ru',
    )
    expect(result.rejected).toBe(true)
    expect(result.rejectionReason).toMatch(/номер|число|отрицание/iu)
  })
})
