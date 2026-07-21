import type { Analysis } from '@scoring'

export type FraudIntentId =
  | 'credential_request'
  | 'payment_request'
  | 'remote_access'
  | 'identity_request'
  | 'authority_claim'
  | 'urgency_pressure'
  | 'victim_isolation'
  | 'sim_swap'
  | 'phishing_link'

export type FraudIntentSignal = {
  id: FraudIntentId
  confidence: number
  matches: string[]
}

export type FraudAttackStage = {
  id: 'pretext' | 'pressure' | 'credential_request' | 'financial_action' | 'remote_access' | 'isolation'
  confidence: number
  order: number
}

export type FraudSignalFusion = {
  intents: FraudIntentSignal[]
  entities: string[]
  stages: FraudAttackStage[]
  independentSignalCount: number
  semanticScoreDelta: number
  confidence: number
  quality: 'none' | 'weak' | 'strong'
}

type Pattern = { id: FraudIntentId; expressions: RegExp[] }

const patterns: Pattern[] = [
  { id: 'credential_request', expressions: [/код(?:а|у)?\s*(?:из\s*)?sms/iu, /одноразов(?:ый|ого)\s+код/iu, /otp/iu, /құпия\s+код/iu, /кодты\s+(?:айтыңыз|беріңіз)/iu] },
  { id: 'payment_request', expressions: [/перевед(?:ите|и)\s+(?:деньги|средства)/iu, /безопасн(?:ый|ом)\s+сч[её]т/iu, /оплат(?:ите|и)\s+(?:комисс|сбор|сч[её]т)/iu, /ақша\s+аудар/iu, /төлем\s+жаса/iu] },
  { id: 'remote_access', expressions: [/anydesk|teamviewer|rustdesk|удал[её]нн(?:ый|ого)\s+доступ/iu, /установ(?:ите|и)\s+приложение/iu, /экран(?:ом)?\s+подел/iu] },
  { id: 'identity_request', expressions: [/назовите\s+(?:ваш\s+)?иин/iu, /номер\s+карты|срок\s+действия|cvv|cvc/iu, /жеке\s+ку[әә]л[іи]к/iu, /жсн\s*(?:н[өө]мір[іи])?/iu] },
  { id: 'authority_claim', expressions: [/служб[аы]\s+безопасности|банк[а]?\s+звонит/iu, /полици[яи]|следователь|прокуратур/iu, /e-?gov|госуслуг|оператор\s+(?:связи|банка)/iu, /банк\s+қызметкер/iu] },
  { id: 'urgency_pressure', expressions: [/срочно|прямо\s+сейчас|немедленно|в\s+течение\s+\d+\s+минут/iu, /иначе\s+(?:заблок|потеря|уголов)/iu, /қазір|шұғыл|дереу/iu] },
  { id: 'victim_isolation', expressions: [/никому\s+не\s+(?:говорите|звоните)|не\s+кладите\s+трубку/iu, /это\s+секретно|не\s+обсуждайте/iu, /ешкімге\s+айтпа/iu] },
  { id: 'sim_swap', expressions: [/замен[аы]\s+sim|перевыпуск\s+сим|дубликат\s+сим/iu, /нөміріңіз\s+бұғат/iu] },
  { id: 'phishing_link', expressions: [/https?:\/\//iu, /перейдите\s+по\s+ссылке|ссылка\s+для\s+(?:оплаты|подтверждения)/iu, /сілтемеге\s+өтіңіз/iu] },
]

const entityPatterns: Array<[string, RegExp]> = [
  ['Kaspi', /kaspi/iu], ['Halyk', /halyk|халык/iu], ['BCC', /bcc|банк\s+центркредит/iu],
  ['eGov', /e-?gov|еговор/iu], ['полиция', /полици|следователь/iu], ['оператор', /оператор|beeline|kcell|tele2/iu],
  ['WhatsApp/Telegram', /whatsapp|telegram/iu],
]

const stageOrder: Array<[FraudAttackStage['id'], FraudIntentId[]]> = [
  ['pretext', ['authority_claim']],
  ['pressure', ['urgency_pressure']],
  ['credential_request', ['credential_request', 'identity_request']],
  ['financial_action', ['payment_request', 'phishing_link']],
  ['remote_access', ['remote_access']],
  ['isolation', ['victim_isolation']],
]

function matchesFor(pattern: Pattern, text: string): string[] {
  return pattern.expressions.filter((expression) => expression.test(text)).map((expression) => expression.source)
}

export function extractFraudSignals(text: string): FraudSignalFusion {
  const source = text.trim()
  if (!source) return { intents: [], entities: [], stages: [], independentSignalCount: 0, semanticScoreDelta: 0, confidence: 0, quality: 'none' }
  const intents = patterns.map((pattern) => ({ id: pattern.id, matches: matchesFor(pattern, source), confidence: 0 }))
    .filter((item) => item.matches.length > 0)
    .map((item) => ({ ...item, confidence: Math.min(0.96, 0.62 + item.matches.length * 0.1) }))
  const intentIds = new Set(intents.map((item) => item.id))
  const entities = entityPatterns.filter(([, expression]) => expression.test(source)).map(([entity]) => entity)
  const stages = stageOrder.flatMap(([id, ids], index) => {
    const found = ids.filter((intent) => intentIds.has(intent))
    return found.length === 0 ? [] : [{ id, confidence: Math.min(0.95, 0.62 + found.length * 0.12), order: index }]
  })
  const independentSignalCount = new Set([
    ...intents.map((item) => item.id),
    ...entities.map((item) => `entity:${item}`),
    ...stages.map((item) => `stage:${item.id}`),
  ]).size
  const distinctRiskIntents = intents.filter((item) => !['authority_claim'].includes(item.id)).length
  const semanticScoreDelta = Math.min(18,
    (distinctRiskIntents >= 2 ? 7 : 0) +
    (stages.length >= 3 ? 7 : stages.length >= 2 ? 3 : 0) +
    (entities.length >= 2 && distinctRiskIntents >= 1 ? 2 : 0) +
    (intents.some((item) => item.id === 'credential_request' || item.id === 'payment_request') ? 2 : 0),
  )
  const confidence = Math.min(0.95, 0.38 + intents.length * 0.08 + stages.length * 0.08 + (entities.length > 0 ? 0.06 : 0))
  return {
    intents,
    entities,
    stages,
    independentSignalCount,
    semanticScoreDelta,
    confidence,
    quality: independentSignalCount >= 5 && confidence >= 0.7 ? 'strong' : independentSignalCount > 0 ? 'weak' : 'none',
  }
}

export type MlShadowAssessment = { score: number; verdict: 'fraud' | 'safe' | 'needs_review'; confidence: number }
export type HybridRiskReview = {
  rulesScore: number
  semanticScore: number
  mlScore: number | null
  recommendedScore: number
  disagreement: 'aligned' | 'rules_high_ml_low' | 'rules_low_ml_high' | 'unavailable'
}

export function fuseRiskScores(analysis: Pick<Analysis, 'score'>, semantic: FraudSignalFusion, ml?: MlShadowAssessment | null): HybridRiskReview {
  const semanticScore = Math.min(99, analysis.score + semantic.semanticScoreDelta)
  const mlScore = ml?.score ?? null
  const disagreement = ml === undefined || ml === null
    ? 'unavailable'
    : Math.abs(analysis.score - ml.score) < 20
      ? 'aligned'
      : analysis.score > ml.score ? 'rules_high_ml_low' : 'rules_low_ml_high'
  // Rules remain the production decision. The semantic layer only supplies a
  // conservative derived view; ML is explicitly shadow-only until calibrated.
  return { rulesScore: analysis.score, semanticScore, mlScore, recommendedScore: analysis.score, disagreement }
}
