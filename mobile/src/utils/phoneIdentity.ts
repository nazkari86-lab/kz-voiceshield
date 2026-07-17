import { parsePhoneNumberFromString } from 'libphonenumber-js/mobile'

export type PhoneIdentity = {
  input: string
  canonical: string
  display: string
  kind: 'short-code' | 'phone' | 'unknown'
  possible: boolean
  valid: boolean
  country: string | null
  note: string
}

function kazakhFriendlyInput(value: string): string {
  const trimmed = value.trim()
  const digits = trimmed.replace(/\D/gu, '')
  // Kazakhstan uses +7. This only normalises common national dialling forms;
  // all other country numbers remain untouched for libphonenumber to parse.
  if (/^8\d{10}$/u.test(digits)) return `+7${digits.slice(1)}`
  if (/^7\d{10}$/u.test(digits) && !trimmed.startsWith('+')) return `+${digits}`
  return trimmed
}

export function inspectPhoneIdentity(rawValue: string): PhoneIdentity {
  const input = rawValue.trim()
  const compact = input.replace(/[\s().-]/gu, '')
  const digits = compact.replace(/\D/gu, '')
  if (/^\d{3,5}$/u.test(digits)) {
    return {
      input,
      canonical: digits,
      display: digits,
      kind: 'short-code',
      possible: true,
      valid: true,
      country: 'KZ',
      note: 'Short code: format is recognised, but it does not identify a caller.',
    }
  }
  const parsed = parsePhoneNumberFromString(kazakhFriendlyInput(input), 'KZ')
  if (!parsed) {
    return { input, canonical: compact, display: input, kind: 'unknown', possible: false, valid: false, country: null, note: 'Number format could not be recognised.' }
  }
  const possible = parsed.isPossible()
  const valid = parsed.isValid()
  return {
    input,
    canonical: parsed.number,
    display: parsed.formatInternational(),
    kind: 'phone',
    possible,
    valid,
    country: parsed.country ?? null,
    note: valid
      ? `Recognised ${parsed.country ?? 'international'} number format. Format validity does not prove caller identity.`
      : possible
        ? 'Possible number length, but the prefix or range could not be validated.'
        : 'This number format is not valid for the detected region.',
  }
}
