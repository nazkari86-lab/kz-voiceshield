import { voiceShieldKzSeed } from '../data/voiceShieldKzSeed'

export type SmsRiskResult = { score: number; reasons: string[] }

export type SmsCategory = 'safe' | 'otp' | 'transaction' | 'transfer' | 'loan' | 'delivery' | 'government' | 'fraud' | 'needs_review'
export type SmsEntity = { type: 'bank' | 'amount' | 'otp' | 'link' | 'phone' | 'action' | 'pressure'; value: string }
export type SmsRiskClass = 'SAFE' | 'UNKNOWN' | 'ALERT' | 'SPAM' | 'PHISHING' | 'FRAUD' | 'DANGER'
export type SmsSeverityColor = 'green' | 'gray' | 'yellow' | 'orange' | 'red'
export type SmsFinanceCategory = 'none' | 'banking' | 'transfer' | 'payment' | 'loan' | 'investment' | 'refund' | 'delivery' | 'government'
export type SmsFeedback = 'confirmed_fraud' | 'not_fraud'
export type SmsAnalysis = SmsRiskResult & {
  category: SmsCategory
  entities: SmsEntity[]
  knownSender: string | null
  likelyBenignNotification: boolean
  fuzzyMatches: string[]
  riskClass: SmsRiskClass
  severityColor: SmsSeverityColor
  financeCategory: SmsFinanceCategory
  analysisSource: 'rules'
}

const requestVerb = /(?:назовите|сообщите|продиктуйте|отправьте|перешлите|введите|подтвердите|жіберіңіз|айтыңыз|енгізіңіз|растаңыз)/iu
const secretTerm = /(?:код(?:а| из смс| подтверждения)?|парол[ья]?|cvv|реквизит|данные карт[ыы]|sms)/iu
const urgentLanguage = /(?:срочно|немедленно|сейчас же|иначе|заблокир|urgent|шұғыл|бірден|бұғат)/iu
const impersonation = /(?:служб[аы] безопасности|сотрудник банка|банк[а-яё]* поддержк|полици[яи]|национальн[а-яё]* банк|қaуіпсіздік қызмет|банк қызметкер)/iu
const moneyDemand = /(?:переведите|оплатите|погасите|безопасн[а-яё]* сч[её]т|займ|несие|аударыңыз|төлем жасаңыз)/iu
const remoteAccess = /(?:anydesk|teamviewer|rustdesk|удал[её]нн[а-яё]* доступ|установите .*приложени|қосымша орнатыңыз)/iu
const suspiciousLink = /(?:https?:\/\/|www\.|bit\.ly|t\.me\/|wa\.me\/|tinyurl\.com|goo\.gl|rb\.gy|clck\.ru|cutt\.ly)/iu
const shortener = /(?:bit\.ly|tinyurl\.com|goo\.gl|rb\.gy|clck\.ru|cutt\.ly|t\.co)\//iu
const apkOrExecutable = /\.(?:apk|xapk|exe|msi|bat|scr)(?:\b|[?#])/iu
const benignOtpWarning = /(?:никому не сообщайте|do not share|never share|ешкімге айтпаңыз|кодты ешкімге айтпаңыз|не передавайте код)/iu
const loginOrOtpNotice = /(?:код для входа|одноразов[а-яё]* код|one[- ]?time code|otp|verification code|кіру коды)/iu
const prizeOrRefund = /(?:вы выиграли|приз|компенсаци|возврат|refund|winner|claim|сыйлық|ұтыс)/iu
const officialSenderHint = /^(?:kaspi|halyk|bcc|forte|jusan|bereke|egov|1414|homebank)\b/iu

const officialSenders: Array<{ name: string; pattern: RegExp }> = [
  { name: 'Kaspi', pattern: /(?:^|\b)kaspi(?:\s*bank)?\b/iu },
  { name: 'Halyk', pattern: /(?:^|\b)(?:halyk|homebank)\b/iu },
  { name: 'BCC', pattern: /(?:^|\b)(?:bcc|bank\s*center\s*credit)\b/iu },
  { name: 'ForteBank', pattern: /(?:^|\b)forte(?:bank)?\b/iu },
  { name: 'Jusan', pattern: /(?:^|\b)jusan\b/iu },
  { name: 'Beeline', pattern: /(?:^|\b)beeline\b/iu },
  { name: 'Kcell', pattern: /(?:^|\b)kcell\b/iu },
  { name: 'Tele2', pattern: /(?:^|\b)tele2\b/iu },
  { name: 'eGov', pattern: /(?:^|\b)(?:egov|e-?gov|1414)\b/iu },
]

const categoryPatterns: Array<{ category: SmsCategory; pattern: RegExp }> = [
  { category: 'delivery', pattern: /(?:доставк|посылк|курьер|заказ|трек-?номер|жеткізу|сәлемдеме|курьер)/iu },
  { category: 'loan', pattern: /(?:кредит|займ|рассрочк|микрокредит|несие|қарыз|бөліп төлеу)/iu },
  { category: 'government', pattern: /(?:egov|1414|полици|суд|налог|штраф|госуслуг|мемлекеттік|полиция|сот|салық|айыппұл)/iu },
  { category: 'transfer', pattern: /(?:переведите|перевод|отправьте деньги|пополните|сч[её]т|аударыңыз|ақша жібер|шот)/iu },
  { category: 'transaction', pattern: /(?:операци|покупк|списан|зачислен|транзакц|төлем|сатып алу|есептен шығар)/iu },
  { category: 'otp', pattern: /(?:код для входа|одноразов|otp|verification code|код подтверждения|кіру коды|растау коды)/iu },
]

const riskyFraudPatterns: Array<{ id: string; phrase: string }> = voiceShieldKzSeed.rules
  .filter((rule) => rule.risk !== 'none')
  .map((rule) => ({ id: rule.subtype, phrase: rule.phrase }))

const bigrams = (value: string): Set<string> => {
  const compact = value.toLocaleLowerCase().replace(/ё/gu, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  const result = new Set<string>()
  for (let index = 0; index < compact.length - 1; index += 1) result.add(compact.slice(index, index + 2))
  return result
}

function fuzzySimilarity(left: string, right: string): number {
  const normalize = (value: string) => value.toLocaleLowerCase().replace(/ё/gu, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  if (normalize(left).includes(normalize(right))) return 1
  const a = bigrams(left)
  const b = bigrams(right)
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  for (const item of a) if (b.has(item)) intersection += 1
  return (2 * intersection) / (a.size + b.size)
}

function knownSenderFor(body: string, sender?: string): string | null {
  const source = `${sender ?? ''} ${body}`
  return officialSenders.find((item) => item.pattern.test(source))?.name ?? null
}

function extractEntities(text: string): SmsEntity[] {
  const entities: SmsEntity[] = []
  const bank = officialSenders.find((item) => item.pattern.test(text))
  if (bank) entities.push({ type: 'bank', value: bank.name })
  if (/(?:https?:\/\/|www\.)/iu.test(text)) entities.push({ type: 'link', value: '[LINK]' })
  if (/(?:\+?7|8)[\s()-]?\d{3}[\s()-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/u.test(text)) entities.push({ type: 'phone', value: '[PHONE]' })
  if (/(?:\d[\d\s,.]{2,}(?:₸|тенге|тг|руб|₽|сом)?)/iu.test(text)) entities.push({ type: 'amount', value: '[AMOUNT]' })
  if (/(?:код|парол|otp|pin|cvv|кіру коды|растау коды)/iu.test(text)) entities.push({ type: 'otp', value: '[REDACTED]' })
  if (/(?:перевед|оплат|введите|назовите|отправ|установите|растаңыз|аударыңыз)/iu.test(text)) entities.push({ type: 'action', value: 'risky_request' })
  if (/(?:срочно|немедленно|иначе|сейчас|шұғыл|бірден)/iu.test(text)) entities.push({ type: 'pressure', value: 'urgency' })
  return entities
}

function classifyCategory(text: string, score: number, entities: SmsEntity[]): SmsCategory {
  const risky = entities.some((entity) => entity.type === 'action' || entity.type === 'link' || entity.type === 'pressure')
  if (score >= 45 || (risky && /(служб|полици|безопасн|қызмет|подозрева|удален|anydesk)/iu.test(text))) return 'fraud'
  return categoryPatterns.find((item) => item.pattern.test(text))?.category ?? (score >= 20 ? 'needs_review' : 'safe')
}

function classifyFinanceCategory(text: string, category: SmsCategory): SmsFinanceCategory {
  if (category === 'government') return 'government'
  if (category === 'loan') return 'loan'
  if (category === 'delivery') return 'delivery'
  if (/(?:инвест|доход|крипт|влож|инвести|инвестициялық)/iu.test(text)) return 'investment'
  if (/(?:возврат|компенсаци|refund|қайтарым|өтемақ)/iu.test(text)) return 'refund'
  if (category === 'transfer' || /(?:перевед|перевод|отправьте деньги|пополните|аударыңыз|ақша жібер|қауіпсіз шот)/iu.test(text)) return 'transfer'
  if (/(?:покупк|списан|зачислен|транзакц|төлем|оплат|payment|сатып алу)/iu.test(text)) return 'payment'
  if (/(?:kaspi|halyk|bcc|forte|jusan|банк|карта|счет|шот)/iu.test(text)) return 'banking'
  return 'none'
}

function classifyRiskClass(score: number, category: SmsCategory, entities: SmsEntity[], fuzzyMatches: string[], likelyBenignNotification: boolean): SmsRiskClass {
  if (likelyBenignNotification && score < 20) return 'SAFE'
  if (category === 'fraud' || score >= 75) {
    if (entities.some((entity) => entity.type === 'link')) return 'PHISHING'
    return 'FRAUD'
  }
  if (score >= 45) return 'DANGER'
  if (score >= 20 || category === 'needs_review') return 'ALERT'
  if (category === 'safe' || category === 'transaction' || category === 'otp') return 'SAFE'
  return 'UNKNOWN'
}

export function smsSeverityColor(riskClass: SmsRiskClass): SmsSeverityColor {
  if (riskClass === 'SAFE') return 'green'
  if (riskClass === 'UNKNOWN') return 'gray'
  if (riskClass === 'ALERT') return 'yellow'
  if (riskClass === 'SPAM') return 'orange'
  return 'red'
}

export function smsFingerprint(body: string, sender?: string): string {
  const value = `${sender ?? ''}|${body}`.toLocaleLowerCase().replace(/\s+/gu, ' ').trim()
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `sms_${(hash >>> 0).toString(16)}`
}

export function analyzeSms(body: string, sender?: string): SmsAnalysis {
  const text = body.replace(/\s+/gu, ' ').trim()
  const base = scoreSms(text)
  const knownSender = knownSenderFor(text, sender)
  const entities = extractEntities(text)
  const fuzzyMatches = riskyFraudPatterns
    .filter((item) => fuzzySimilarity(text, item.phrase) >= 0.52)
    .map((item) => item.id)
  const ordinaryNotification = Boolean(knownSender)
    && !entities.some((entity) => entity.type === 'action' || entity.type === 'pressure')
    && !/(?:https?:\/\/|www\.|anydesk|teamviewer|apk)/iu.test(text)
  const adjustedScore = ordinaryNotification ? Math.min(base.score, 10) : base.score
  const category = classifyCategory(text, adjustedScore, entities)
  const riskClass = classifyRiskClass(adjustedScore, category, entities, fuzzyMatches, ordinaryNotification)
  return {
    score: adjustedScore,
    reasons: ordinaryNotification && base.score > adjustedScore
      ? [...base.reasons, 'known service notification without a risky request']
      : base.reasons,
    category,
    entities,
    knownSender,
    likelyBenignNotification: ordinaryNotification,
    fuzzyMatches,
    riskClass,
    severityColor: smsSeverityColor(riskClass),
    financeCategory: classifyFinanceCategory(text, category),
    analysisSource: 'rules',
  }
}

export function scoreSms(body: string): SmsRiskResult {
  const text = body.replace(/\s+/gu, ' ').trim()
  if (!text) return { score: 0, reasons: [] }

  const requestsSecret = requestVerb.test(text) && secretTerm.test(text)
  const hasPressure = urgentLanguage.test(text)
  const impersonates = impersonation.test(text)
  const requestsMoney = moneyDemand.test(text)
  const asksRemoteAccess = remoteAccess.test(text)
  const hasLink = suspiciousLink.test(text)
  const hasShortener = shortener.test(text)
  const hasDangerousFile = apkOrExecutable.test(text)
  const looksLikeBenignOtp = loginOrOtpNotice.test(text) && benignOtpWarning.test(text) && !requestVerb.test(text) && !hasLink && !asksRemoteAccess && !moneyDemand.test(text)
  const hasPrizeOrRefund = prizeOrRefund.test(text)
  const hasOfficialSenderHint = officialSenderHint.test(text)
  const reasons: string[] = []
  let score = 0

  if (looksLikeBenignOtp) return { score: 0, reasons: [] }

  if (asksRemoteAccess) {
    score += 65
    reasons.push('requests installation or remote access')
  }
  if (requestsSecret) {
    score += 45
    reasons.push('asks for a code, password, or payment credential')
  }
  if (requestsMoney) {
    score += 35
    reasons.push('asks for money, a transfer, or a loan action')
  }
  if (impersonates && (requestsSecret || requestsMoney || asksRemoteAccess)) {
    score += 25
    reasons.push('claims authority while requesting a risky action')
  }
  if (hasPressure && (requestsSecret || requestsMoney || asksRemoteAccess)) {
    score += 15
    reasons.push('uses urgency together with a risky request')
  }
  if (hasLink && (requestsSecret || requestsMoney || asksRemoteAccess || impersonates)) {
    score += 15
    reasons.push('contains a link alongside a high-risk request')
  } else if (hasLink && hasPressure) {
    score += 10
    reasons.push('contains an urgent link that should be verified')
  }
  if (hasShortener) {
    score += hasLink && (requestsSecret || requestsMoney || hasPressure) ? 18 : 10
    reasons.push('uses a shortened link')
  }
  if (hasDangerousFile) {
    score += 45
    reasons.push('links directly to an installable or executable file')
  }
  if (hasPrizeOrRefund && (hasLink || requestsSecret || requestsMoney)) {
    score += 22
    reasons.push('uses prize, refund, or compensation bait')
  }
  if (hasOfficialSenderHint && score > 0 && !requestsSecret && !requestsMoney && !asksRemoteAccess && !hasDangerousFile) {
    score = Math.max(0, score - 15)
    reasons.push('sender text looks like a known service; verify in the official app')
  }

  return { score: Math.min(score, 100), reasons }
}

export function smsRiskTier(score: number): 'critical' | 'high' | 'medium' | 'safe' {
  if (score >= 75) return 'critical'
  if (score >= 45) return 'high'
  if (score >= 20) return 'medium'
  return 'safe'
}
