import { analyzeScamContent } from '../src/scamTools'
import { assessApkRisk, type ApkInspection } from '../src/bridge/ApkInspectorBridge'

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

  it('adds APK risk for old SDK and background-heavy packages', () => {
    const inspection: ApkInspection = {
      activityCount: 3,
      fileName: 'sample.apk',
      minSdkVersion: 21,
      packageName: 'example.app',
      receiverCount: 14,
      requestedPermissions: ['android.permission.READ_SMS', 'android.permission.SYSTEM_ALERT_WINDOW'],
      serviceCount: 9,
      sha256: 'a'.repeat(64),
      signingCertificateSha256: [],
      sizeBytes: 42,
      targetSdkVersion: 23,
      versionCode: 1,
      versionName: '1.0',
    }

    const risk = assessApkRisk(inspection)

    expect(risk.level).toBe('high')
    expect(risk.findings).toContain('target SDK is very old, which can bypass modern Android safety expectations')
    expect(risk.findings).toContain('declares an unusually large number of background components')
  })
})
