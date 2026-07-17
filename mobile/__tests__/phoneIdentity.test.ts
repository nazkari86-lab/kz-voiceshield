import { inspectPhoneIdentity } from '../src/utils/phoneIdentity'

describe('phone identity normalisation', () => {
  it('normalises common Kazakhstan national dialling input to E.164', () => {
    expect(inspectPhoneIdentity('8 (700) 123-45-67')).toMatchObject({ canonical: '+77001234567', kind: 'phone', possible: true })
  })

  it('keeps official short codes distinct from subscriber phone numbers', () => {
    expect(inspectPhoneIdentity('9999')).toMatchObject({ canonical: '9999', kind: 'short-code', valid: true })
  })

  it('does not treat malformed input as a usable number', () => {
    expect(inspectPhoneIdentity('not-a-number')).toMatchObject({ possible: false, valid: false })
  })
})
