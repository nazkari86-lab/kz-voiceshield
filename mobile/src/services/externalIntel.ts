import { getBackendConfig } from './backendConfig'

export type ExternalNumberResult = {
  provider: 'numverify' | 'abstractapi'
  valid: boolean | null
  countryCode: string | null
  carrier: string | null
  lineType: string | null
  internationalFormat: string
  evidenceOnly: true
  checkedAt?: string
}

export type ExternalUrlResult = {
  provider: 'phishtank'
  url: string
  inDatabase: boolean
  verified: boolean
  online: boolean
  evidenceOnly: true
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const config = await getBackendConfig()
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}), ...(init?.headers ?? {}) },
  })
  if (!response.ok) throw new Error(`External intelligence unavailable (${response.status})`)
  return response.json()
}

export async function lookupNumber(number: string): Promise<ExternalNumberResult> {
  return request(`/intel/number?number=${encodeURIComponent(number)}`) as Promise<ExternalNumberResult>
}

export async function checkPhishingUrl(url: string): Promise<ExternalUrlResult> {
  return request('/intel/url', { method: 'POST', body: JSON.stringify({ url }) }) as Promise<ExternalUrlResult>
}
