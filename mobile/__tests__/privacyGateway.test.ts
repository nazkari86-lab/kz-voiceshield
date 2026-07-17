import { redactForCloud, summarizeRedactions } from '../src/utils/privacyGateway'

describe('cloud privacy gateway', () => {
  it('redacts Kazakhstan identifiers before a cloud request', () => {
    const result = redactForCloud('Позвоните +7 777 123 45 67. ИИН 990101123456, карта 4400 1234 5678 9012, IBAN KZ86125KZT5004100100, код 123456.')
    expect(result.text).not.toContain('777 123')
    expect(result.text).not.toContain('990101123456')
    expect(result.text).not.toContain('4400 1234')
    expect(result.text).not.toContain('KZ86125KZT5004100100')
    expect(result.text).not.toContain('123456')
    expect(summarizeRedactions(result.counts)).toContain('phone')
  })
})
