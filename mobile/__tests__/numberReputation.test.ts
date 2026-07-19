import { findVerifiedBusiness } from '../src/data/verifiedBusinesses'
import { getNumberReputation } from '../src/utils/numberReputation'

describe('number reputation', () => {
  it('recognizes a known official identifier without treating it as proof of identity', () => {
    const result = getNumberReputation('7111')
    expect(result.status).toBe('known_risk')
    expect(result.verifiedBusiness?.name).toBe('Halyk')
    expect(result.spoofingWarning).toBe(true)
  })

  it('keeps known-risk patterns above the business label', () => {
    const result = getNumberReputation('+7809 123 45 67')
    expect(result.status).toBe('known_risk')
    expect(result.scamMatch?.risk).toBe('high')
  })

  it('does not infer a business from an unknown number', () => {
    expect(findVerifiedBusiness('+7 700 123 45 67')).toBeNull()
  })
})
