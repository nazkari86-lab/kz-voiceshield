import { analyzeTranscript } from '@scoring'
import type { Severity } from '@scoring'

export type ScamToolResult = {
  score: number
  risk: Severity
  reasons: string[]
  links: string[]
  schemeLabel: string
}

const officialDomains: Record<string, string[]> = {
  kaspi: ['kaspi.kz'],
  halyk: ['halykbank.kz'],
  homebank: ['halykbank.kz'],
  forte: ['forte.kz'],
  bcc: ['bcc.kz'],
  centercredit: ['bcc.kz'],
  egov: ['egov.kz', 'gov.kz'],
}

const shorteners = new Set(['bit.ly', 'cutt.ly', 'is.gd', 't.co', 'tinyurl.com', 'goo.su', 'clck.ru'])
const suspiciousTlds = new Set(['click', 'top', 'xyz', 'live', 'support', 'shop', 'info'])

const extractLinks = (text: string) => text.match(/(?:https?:\/\/|www\.)[^\s<>()]+/giu)?.map((link) => link.replace(/[.,!?;:]+$/u, '')) ?? []

const parseHost = (link: string) => {
  const withoutScheme = link.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//iu, '')
  const authority = withoutScheme.split(/[/?#]/u, 1)[0]?.split('@').at(-1) ?? ''
  return authority.replace(/:\d+$/u, '').toLowerCase().replace(/\.$/u, '')
}

const isOfficialForBrand = (host: string, brand: string) =>
  (officialDomains[brand] ?? []).some((domain) => host === domain || host.endsWith(`.${domain}`))

export const analyzeScamContent = (text: string): ScamToolResult => {
  const analysis = analyzeTranscript(text)
  const links = extractLinks(text)
  const reasons = analysis.evidence.map((item) => `${item.title}: ${item.matches.join(', ')}`)
  let score = analysis.score
  const lower = text.toLowerCase()

  links.forEach((link) => {
    const host = parseHost(link)
    if (!host) {
      score += 20
      reasons.push('Malformed or obfuscated link')
      return
    }
    if (link.toLowerCase().startsWith('http://')) {
      score += 15
      reasons.push('Link does not use HTTPS')
    }
    if (/^(?:\d{1,3}\.){3}\d{1,3}$/u.test(host)) {
      score += 35
      reasons.push('Link uses a raw IP address')
    }
    if (host.includes('xn--')) {
      score += 30
      reasons.push('Internationalized punycode domain may imitate a brand')
    }
    if (shorteners.has(host)) {
      score += 20
      reasons.push('Shortened link hides its destination')
    }
    if (host.split('.').length >= 5) {
      score += 12
      reasons.push('Unusually deep subdomain chain')
    }
    const tld = host.split('.').at(-1) ?? ''
    if (suspiciousTlds.has(tld)) {
      score += 12
      reasons.push(`High-abuse domain zone .${tld}`)
    }
    if (/\.apk(?:$|[?#])/iu.test(link)) {
      score += 50
      reasons.push('Direct Android APK download')
    }
    Object.keys(officialDomains).forEach((brand) => {
      if ((lower.includes(brand) || host.includes(brand)) && !isOfficialForBrand(host, brand)) {
        score += 40
        reasons.push(`Domain is not an official ${brand} domain`)
      }
    })
  })

  score = Math.max(0, Math.min(100, Math.round(score)))
  const risk: Severity = score >= 85 ? 'critical' : score >= 65 ? 'high' : score >= 35 ? 'medium' : 'low'
  return {
    score,
    risk,
    reasons: [...new Set(reasons)].slice(0, 20),
    links,
    schemeLabel: analysis.schemeLabel,
  }
}
