import { analyzeScamContent } from '../src/scamTools'

describe('scam tools', () => {
  it('flags a fake bank domain and APK download', () => {
    const result = analyzeScamContent('Kaspi security: install https://kaspi-help.xyz/update.apk now')
    expect(result.risk).toBe('critical')
    expect(result.reasons).toContain('Domain is not an official kaspi domain')
    expect(result.reasons).toContain('Direct Android APK download')
  })

  it('flags raw IP and insecure links', () => {
    const result = analyzeScamContent('Open http://192.168.1.5/login')
    expect(result.score).toBeGreaterThanOrEqual(35)
    expect(result.reasons).toContain('Link uses a raw IP address')
  })

  it('does not mark an official bank page as an imitation', () => {
    const result = analyzeScamContent('Kaspi guide https://guide.kaspi.kz/client')
    expect(result.reasons).not.toContain('Domain is not an official kaspi domain')
  })
})

