import { correlateSmsWithCall } from '../src/utils/crossChannelSignals'

describe('cross-channel signals', () => {
  it('correlates a code request in a call with a recent risky SMS', () => {
    const result = correlateSmsWithCall('+77001234567', 'Назовите код из SMS для отмены перевода', [{ address: '+77001234567', body: 'Служба безопасности: назовите код 123456', date: 1000 }], 1000 + 60_000)
    expect(result.matched).toBe(true)
    expect(result.reasons).toEqual(expect.arrayContaining(['call and SMS both reference a one-time code']))
  })

  it('ignores stale unrelated messages', () => {
    const result = correlateSmsWithCall('+77001234567', 'Здравствуйте', [{ address: '+77001234567', body: 'Ваш код для входа. Никому не сообщайте', date: 0 }], 20 * 60_000)
    expect(result.matched).toBe(false)
  })
})
