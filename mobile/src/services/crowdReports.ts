import { SecureStorage } from '../bridge/SecureStorageBridge'
import { getBackendConfig } from './backendConfig'
import type { SmsFeedback, SmsRiskClass } from '../utils/smsRisk'

const CONSENT_KEY = 'voiceshield.crowd-report-consent.v1'
const OUTBOX_KEY = 'voiceshield.crowd-report-outbox.v1'
const MAX_OUTBOX = 100

export type CrowdReport = {
  id: string
  numberFingerprint: string
  feedback: SmsFeedback
  riskClass: SmsRiskClass
  score: number
  source: 'local_sms' | 'local_call'
  createdAt: string
  appVersion: string
}

export async function getCrowdReportConsent(): Promise<boolean> {
  return (await SecureStorage.getItem(CONSENT_KEY)) === 'accepted'
}

export async function setCrowdReportConsent(accepted: boolean): Promise<void> {
  if (accepted) await SecureStorage.setItem(CONSENT_KEY, 'accepted')
  else await SecureStorage.removeItem(CONSENT_KEY)
}

async function readOutbox(): Promise<CrowdReport[]> {
  try {
    const raw = await SecureStorage.getItem(OUTBOX_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((item): item is CrowdReport => Boolean(item && typeof item === 'object' && typeof item.id === 'string')).slice(-MAX_OUTBOX) : []
  } catch {
    return []
  }
}

export async function enqueueCrowdReport(report: CrowdReport): Promise<boolean> {
  if (!(await getCrowdReportConsent())) return false
  const outbox = await readOutbox()
  if (outbox.some((item) => item.id === report.id)) return true
  outbox.push(report)
  await SecureStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox.slice(-MAX_OUTBOX)))
  return true
}

export async function flushCrowdReports(): Promise<number> {
  if (!(await getCrowdReportConsent())) return 0
  const outbox = await readOutbox()
  if (outbox.length === 0) return 0
  const config = await getBackendConfig()
  if (!config.baseUrl.startsWith('https://')) return 0
  const response = await fetch(`${config.baseUrl}/api/reputation/reports`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}) }, body: JSON.stringify({ reports: outbox }),
  })
  if (!response.ok) return 0
  await SecureStorage.removeItem(OUTBOX_KEY)
  return outbox.length
}
