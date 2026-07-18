export type SmsRiskResult = { score: number; reasons: string[] }

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
