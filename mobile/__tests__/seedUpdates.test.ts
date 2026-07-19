import { isNewerVersion, validateSeedUpdate } from '../src/services/seedUpdates'

describe('seed update validation', () => {
  it('compares dotted versions numerically', () => {
    expect(isNewerVersion('1.0.10', '1.0.9')).toBe(true)
    expect(isNewerVersion('1.1.0', '1.1')).toBe(false)
    expect(isNewerVersion('1.0.9', '1.0.10')).toBe(false)
  })

  it('accepts only the VoiceShield seed schema', () => {
    const update = validateSeedUpdate({ schemaVersion: 'voiceshield.grammar.seed.v1', version: '1.1.0', publishedAt: '2026-07-19T00:00:00Z', rules: [], signature: `${'A'.repeat(86)}==` })
    expect(update.source).toBe('verified_backend')
    expect(() => validateSeedUpdate({ schemaVersion: 'wrong', version: '1.1.0', publishedAt: '2026-07-19', rules: [] })).toThrow()
  })
})
