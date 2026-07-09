export type Severity = 'critical' | 'high' | 'medium' | 'low'
export type CaseLabel = 'unreviewed' | 'true_positive' | 'false_positive' | 'needs_review'
export type CaseStatus = 'new' | 'reviewing' | 'escalated' | 'closed'

export type ThreatRule = {
  id: string
  title: string
  tactic: string
  stage: string
  severity: Severity
  weight: number
  minHits?: number
  terms: string[]
  advice: string
}

export type Evidence = ThreatRule & {
  matches: string[]
  score: number
}

export type StageCoverage = {
  stage: string
  count: number
  score: number
}

export type Analysis = {
  score: number
  confidence: number
  risk: Severity
  evidence: Evidence[]
  escalationReasons: string[]
  responseChecklist: string[]
  stageCoverage: StageCoverage[]
  matchedTerms: number
  wordCount: number
  caseId: string
  verdict: string
  nextAction: string
}

export type WorkflowFlags = {
  bankContactNeeded: boolean
  evidenceBundleReady: boolean
  customerCallbackNeeded: boolean
}

export type AuditEntry = {
  at: string
  actor: string
  action: string
  detail: string
}

export type IncidentEvent = {
  at: string
  title: string
  detail: string
}

export type SavedCase = {
  id: string
  createdAt: string
  updatedAt: string
  fileName: string
  transcript: string
  label: CaseLabel
  status: CaseStatus
  assignedTo: string
  flags: WorkflowFlags
  analystNote: string
  decisionHistory: AuditEntry[]
  auditLog: AuditEntry[]
  incidentTimeline: IncidentEvent[]
  analysis: Analysis
}

export type DatasetQuality = {
  total: number
  schemaVersion: string
  labelBalance: Record<CaseLabel, number>
  duplicateGroups: Array<{ fingerprint: string; ids: string[] }>
  falsePositiveReview: SavedCase[]
  unlabeledCount: number
  averageWords: number
}

export const datasetSchemaVersion = 'voiceshield.dataset.v1'

export const samples = {
  bank:
    'Здравствуйте, это служба безопасности банка. На вашей карте подозрительная операция. Срочно продиктуйте SMS-код, чтобы мы отменили перевод. Не кладите трубку и никому не говорите. Переведите деньги на безопасный счет.',
  aiFamily:
    'Апа, это я. Голос плохо слышно, я попал в аварию. Срочно нужны деньги, переведи на Kaspi сейчас. Мой номер временно не работает, никому не звони, потом объясню.',
  courier:
    'Курьерская служба. Ваша посылка задержана. Нужно оплатить таможенный сбор по ссылке и назвать ИИН, код из SMS для подтверждения доставки. Сделайте сейчас, иначе посылку вернут.',
  investment:
    'Біз инвестициялық платформа өкіліміз. Бүгін ғана депозит салсаңыз, табыс 30 пайыз болады. Қазір Kaspi арқылы ақша аударыңыз, менеджер Telegram ботқа сілтеме жібереді. Ұсыныс құпия.',
  whatsapp:
    'Я из поддержки WhatsApp. Ваш аккаунт будет заблокирован. Отправьте код подтверждения, который пришел в SMS, и перейдите по ссылке для восстановления доступа.',
  victimCall:
    'Вы оставляли заявку на замену домофона. Для подтверждения заявки назовите код из SMS и ИИН. Если не подтвердите сейчас, доступ в подъезд будет заблокирован.',
  safe:
    'Сәлеметсіз бе. Это оператор клиники. Мы напоминаем о записи на завтра в 10:30. Если время неудобно, можете перезаписаться через официальный номер на сайте. Никому не сообщайте SMS-коды.',
}

export const sampleMeta = [
  ['bank', 'Bank takeover'],
  ['aiFamily', 'AI voice family'],
  ['courier', 'Delivery/customs'],
  ['investment', 'Investment/crypto'],
  ['whatsapp', 'Messenger takeover'],
  ['victimCall', 'Victim-called setup'],
  ['safe', 'Safe call'],
] as const

export const storageKey = 'kz-voiceshield-cases-v2'

const safeContext = [
  'официальный номер',
  'официальный сайт',
  'не сообщайте',
  'не называйте код',
  'никому не сообщайте',
  'напоминаем о записи',
  'можете перезаписаться',
  'құпия кодты айтпаңыз',
]

const explicitActionTerms = [
  'продиктуйте',
  'назовите',
  'сообщите',
  'отправьте',
  'переведите',
  'переведи',
  'установите',
  'скачайте',
  'перейдите по ссылке',
  'оплатить',
  'ақша аудар',
  'айтыңыз',
]

export const threatRules: ThreatRule[] = [
  {
    id: 'bank-security',
    title: 'Bank security impersonation',
    tactic: 'Authority impersonation',
    stage: 'Hook',
    severity: 'critical',
    weight: 30,
    terms: ['служба безопасности банка', 'сотрудник банка', 'подозрительная операция', 'карта заблокирована', 'kaspi bank', 'халық банк'],
    advice: 'End the call and call the bank through the official app or card number.',
  },
  {
    id: 'law-enforcement',
    title: 'Police, regulator or prosecutor pressure',
    tactic: 'Institutional intimidation',
    stage: 'Control',
    severity: 'high',
    weight: 24,
    terms: ['полиция', 'прокуратура', 'финмониторинг', 'ұлттық банк', 'қаржы мониторингі', 'уголовное дело', 'тергеу'],
    advice: 'Do not discuss money or accounts by phone. Verify through official published numbers.',
  },
  {
    id: 'otp-code',
    title: 'SMS, OTP, PIN or account code request',
    tactic: 'Credential theft',
    stage: 'Extraction',
    severity: 'critical',
    weight: 34,
    minHits: 2,
    terms: ['sms код', 'sms-код', 'код из sms', 'код подтверждения', 'одноразовый код', 'pin', 'пароль', 'cvv', 'продиктуйте', 'назовите', 'сообщите', 'айтыңыз', 'жсн', 'иин'],
    advice: 'Never share codes, PIN, CVV, IIN or passwords during a call.',
  },
  {
    id: 'safe-account',
    title: 'Safe account or urgent transfer script',
    tactic: 'Money movement',
    stage: 'Cash-out',
    severity: 'critical',
    weight: 34,
    terms: ['безопасный счет', 'қауіпсіз шот', 'переведите деньги', 'переведи', 'ақша аудар', 'снять наличные', 'оформить кредит', 'кредит на ваше имя'],
    advice: 'Do not move money during a call. Freeze the action and verify offline.',
  },
  {
    id: 'remote-access',
    title: 'Remote access, screen sharing or device control',
    tactic: 'Device compromise',
    stage: 'Takeover',
    severity: 'critical',
    weight: 32,
    terms: ['anydesk', 'teamviewer', 'удаленный доступ', 'демонстрация экрана', 'screen share', 'экран', 'қосымша жүктеңіз', 'приложение скачайте'],
    advice: 'Do not install apps or share your screen during financial calls.',
  },
  {
    id: 'messenger-takeover',
    title: 'WhatsApp or Telegram account takeover',
    tactic: 'Account takeover',
    stage: 'Extraction',
    severity: 'high',
    weight: 25,
    terms: ['whatsapp', 'telegram', 'аккаунт будет заблокирован', 'восстановления доступа', 'код подтверждения', 'бот', 'личный номер'],
    advice: 'Do not share messenger verification codes. Check the app security settings directly.',
  },
  {
    id: 'ai-family',
    title: 'AI voice or family emergency pressure',
    tactic: 'Emotional manipulation',
    stage: 'Hook',
    severity: 'high',
    weight: 25,
    minHits: 2,
    terms: ['апа', 'мама', 'папа', 'сын', 'дочь', 'авария', 'больница', 'голос плохо слышно', 'мой номер временно не работает', 'не звони'],
    advice: 'Call the relative back using a saved number and ask a private verification question.',
  },
  {
    id: 'delivery-customs',
    title: 'Courier, delivery or customs fee link',
    tactic: 'Phishing payment',
    stage: 'Cash-out',
    severity: 'high',
    weight: 24,
    terms: ['курьерская служба', 'посылка задержана', 'таможенный сбор', 'оплатить по ссылке', 'доставка', 'вернут отправителю'],
    advice: 'Use the official courier app/site; do not pay through a call link.',
  },
  {
    id: 'investment-crypto',
    title: 'Investment, crypto or guaranteed-profit offer',
    tactic: 'Long-con fraud',
    stage: 'Grooming',
    severity: 'high',
    weight: 24,
    minHits: 2,
    terms: ['инвестиция', 'крипто', 'доход', 'табыс', '30 пайыз', 'гарантия', 'депозит', 'платформа', 'менеджер', 'вывести прибыль'],
    advice: 'Verify licenses, do not deposit from an unsolicited call, and check withdrawal terms.',
  },
  {
    id: 'romance-work',
    title: 'Romance, job or marketplace payment setup',
    tactic: 'Trust-building fraud',
    stage: 'Grooming',
    severity: 'medium',
    weight: 18,
    minHits: 2,
    terms: ['знакомства', 'подарок', 'работа удаленно', 'предоплата', 'olx', 'krisha', 'маркетплейс', 'бронь', 'залог'],
    advice: 'Avoid prepayments and verify identities through platform-protected channels.',
  },
  {
    id: 'victim-called',
    title: 'Victim-called setup from fake notice or service',
    tactic: 'Reverse vishing',
    stage: 'Hook',
    severity: 'high',
    weight: 23,
    minHits: 2,
    terms: [
      'вы сами позвонили',
      'сами позвонили',
      'официальный номер',
      'операция безопасна',
      'для отмены кредита',
      'отмены кредита',
      'домофон',
      'счетчик',
      'заявка',
      'подтверждения заявки',
      'доступ будет заблокирован',
      'замена сим карты',
      'оператор связи',
    ],
    advice: 'Do not trust numbers from notices/messages; find the provider number independently.',
  },
  {
    id: 'urgency-isolation',
    title: 'Urgency, secrecy or isolation',
    tactic: 'Behavior control',
    stage: 'Control',
    severity: 'medium',
    weight: 18,
    terms: ['срочно', 'немедленно', 'времени нет', 'қазір', 'тез', 'никому не говорите', 'не кладите трубку', 'оставайтесь на линии', 'құпия', 'ешкімге айтпа'],
    advice: 'Pause. Scammers use speed and isolation to prevent verification.',
  },
  {
    id: 'phishing-link',
    title: 'Suspicious link, QR or off-platform payment',
    tactic: 'Phishing',
    stage: 'Extraction',
    severity: 'medium',
    weight: 17,
    terms: ['ссылка', 'link', 'qr', 'бот', 'перейдите', 'личный кабинет', 'форма оплаты', 'неофициальный сайт'],
    advice: 'Open services manually through official apps or typed domains.',
  },
]

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const normalizeText = (text: string) =>
  text
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const fingerprintTranscript = (text: string) => normalizeText(text).slice(0, 220)
const pattern = (term: string) => new RegExp(`(^|\\s)${escapeRegExp(normalizeText(term)).replace(/\s+/g, '\\s+')}(?=\\s|$)`, 'u')
const createCaseId = (text: string) => {
  let hash = 0
  for (let index = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index)) >>> 0
  return `KZVS-${hash.toString(16).padStart(8, '0').toUpperCase().slice(0, 8)}`
}

const detectSafeContext = (text: string) => safeContext.some((term) => pattern(term).test(normalizeText(text)))
const hasExplicitAction = (text: string) => explicitActionTerms.some((term) => pattern(term).test(normalizeText(text)))
const matchTerms = (text: string, terms: string[]) => {
  const normalized = normalizeText(text)
  if (!normalized) return []
  return terms.filter((term) => pattern(term).test(normalized))
}

const buildStageCoverage = (evidence: Evidence[]) => {
  const totals = new Map<string, StageCoverage>()
  evidence.forEach((item) => {
    const current = totals.get(item.stage) ?? { stage: item.stage, count: 0, score: 0 }
    current.count += 1
    current.score += item.score
    totals.set(item.stage, current)
  })
  return [...totals.values()].sort((left, right) => right.score - left.score || right.count - left.count)
}

const buildEscalationReasons = (evidence: Evidence[], comboBonus: number) => {
  if (evidence.length === 0) return ['No scam-specific pattern crossed the review threshold.']
  const topEvidence = [...evidence].sort((left, right) => right.score - left.score).slice(0, 3)
  const reasons = topEvidence.map((item) => `${item.title}: ${item.matches.slice(0, 3).join(', ')}`)
  if (comboBonus > 0) reasons.unshift('Multiple tactics appear in the same call, increasing likelihood of coordinated fraud.')
  return reasons
}

const buildResponseChecklist = (risk: Severity, evidence: Evidence[]) => {
  if (risk === 'low') return ['Keep the conversation on official channels.', 'Do not share codes, passwords, IIN, PIN or CVV.', 'Save the transcript if anything changes.']

  const checklist = ['Stop the call or chat before any transfer, code sharing or app install.', 'Verify the story through a saved official number or trusted contact.', 'Preserve the transcript, phone number, links and timestamps.']
  if (evidence.some((item) => item.id === 'remote-access')) checklist.push('Remove remote-access apps and check active device sessions.')
  if (evidence.some((item) => item.id === 'messenger-takeover')) checklist.push('Open messenger security settings and revoke unknown linked devices.')
  if (evidence.some((item) => item.id === 'safe-account' || item.stage === 'Cash-out')) checklist.push('Contact the bank fraud line and freeze suspicious money movement.')
  return checklist
}

export const statusText = (status: CaseStatus) =>
  status === 'new'
    ? 'New'
    : status === 'reviewing'
      ? 'Reviewing'
      : status === 'escalated'
        ? 'Escalated'
        : 'Closed'

export const createWorkflowState = (analysis: Analysis, createdAt = new Date().toISOString(), actor = 'system') => {
  const needsBank = analysis.evidence.some((item) => item.id === 'bank-security' || item.stage === 'Cash-out')
  const needsCallback = analysis.risk === 'critical' || analysis.risk === 'high'
  const status: CaseStatus = analysis.risk === 'critical' ? 'escalated' : 'new'
  const auditLog: AuditEntry[] = [
    {
      action: 'case_created',
      actor,
      at: createdAt,
      detail: `${analysis.verdict} at ${analysis.score}/100`,
    },
  ]

  return {
    assignedTo: analysis.risk === 'critical' || analysis.risk === 'high' ? 'Fraud reviewer' : 'Triage queue',
    auditLog,
    decisionHistory: [],
    flags: {
      bankContactNeeded: needsBank,
      customerCallbackNeeded: needsCallback,
      evidenceBundleReady: analysis.evidence.length > 0,
    },
    incidentTimeline: [
      { at: createdAt, detail: analysis.verdict, title: 'Transcript scored' },
      ...analysis.escalationReasons.slice(0, 3).map((reason, index) => ({
        at: createdAt,
        detail: reason,
        title: `Signal ${index + 1}`,
      })),
    ],
    status,
  }
}

export const analyzeTranscript = (text: string): Analysis => {
  const normalized = normalizeText(text)
  const wordCount = normalized ? normalized.split(' ').length : 0
  const initialEvidence = threatRules
    .map((rule) => ({ ...rule, matches: matchTerms(text, rule.terms), score: 0 }))
    .filter((rule) => rule.matches.length >= (rule.minHits ?? 1))
    .map((rule) => {
      const severityBoost = rule.severity === 'critical' ? 1.35 : rule.severity === 'high' ? 1.15 : rule.severity === 'medium' ? 0.9 : 0.65
      return { ...rule, score: Math.round((rule.weight + (rule.matches.length - 1) * 4) * severityBoost) }
    })

  const protective = detectSafeContext(text) && !hasExplicitAction(text)
  const actionable = initialEvidence.some((item) => ['safe-account', 'remote-access', 'urgency-isolation'].includes(item.id))
  const evidence =
    protective && !actionable
      ? initialEvidence.filter((item) => !['bank-security', 'otp-code', 'messenger-takeover'].includes(item.id))
      : initialEvidence
  const matchedTerms = evidence.reduce((total, item) => total + item.matches.length, 0)
  const has = (id: string) => evidence.some((item) => item.id === id)
  const comboBonus =
    has('otp-code') && has('safe-account')
      ? 22
      : has('remote-access') && has('bank-security')
        ? 18
        : has('ai-family') && has('safe-account')
          ? 16
          : has('phishing-link') && (has('delivery-customs') || has('messenger-takeover'))
            ? 14
            : has('victim-called') && has('otp-code')
              ? 22
              : 0
  const shortTextPenalty = wordCount < 3 ? 0.25 : wordCount < 7 ? 0.65 : 1
  const rawScore = Math.round((evidence.reduce((sum, item) => sum + item.score, 0) + comboBonus) * shortTextPenalty)
  const score = evidence.length === 0 ? 0 : Math.min(99, rawScore)
  const risk: Severity = score >= 85 ? 'critical' : score >= 65 ? 'high' : score >= 35 ? 'medium' : 'low'
  const confidence = evidence.length === 0 ? 0 : Math.min(98, Math.round((matchedTerms * 7 + evidence.length * 9 + Math.min(wordCount, 45)) * shortTextPenalty))
  const verdict =
    risk === 'critical'
      ? 'Immediate scam intervention'
      : risk === 'high'
        ? 'Likely fraud attempt'
        : risk === 'medium'
          ? 'Manual review required'
          : 'No actionable scam pattern'
  const nextAction =
    risk === 'critical' || risk === 'high'
      ? 'End contact, verify through official saved channels, preserve the transcript.'
      : risk === 'medium'
        ? 'Pause and verify before any payment, code sharing, or app installation.'
        : 'Continue only through official channels and keep monitoring.'
  const escalationReasons = buildEscalationReasons(evidence, comboBonus)
  const responseChecklist = buildResponseChecklist(risk, evidence)
  const stageCoverage = buildStageCoverage(evidence)

  return { caseId: createCaseId(text), confidence, escalationReasons, evidence, matchedTerms, nextAction, responseChecklist, risk, score, stageCoverage, verdict, wordCount }
}

export const sentenceTimeline = (text: string) =>
  text
    .split(/(?<=[.!?。])\s+|\n+/u)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment, index) => ({ index: index + 1, segment, analysis: analyzeTranscript(segment) }))

export const buildReport = (text: string, analysis: Analysis) => [
  'KZ VoiceShield Case Report',
  `Case ID: ${analysis.caseId}`,
  `Generated: ${new Date().toLocaleString()}`,
  `Risk: ${analysis.risk.toUpperCase()} (${analysis.score}/100)`,
  `Confidence: ${analysis.confidence}/100`,
  `Verdict: ${analysis.verdict}`,
  `Recommended action: ${analysis.nextAction}`,
  '',
  'Escalation reasons:',
  ...analysis.escalationReasons.map((reason) => `- ${reason}`),
  '',
  'Response checklist:',
  ...analysis.responseChecklist.map((item) => `- ${item}`),
  '',
  'Evidence:',
  ...(analysis.evidence.length
    ? analysis.evidence.map((item) => `- ${item.title} [${item.tactic}/${item.stage}]: ${item.matches.join(', ')} | ${item.advice}`)
    : ['- No matched scam patterns']),
  '',
  'Transcript:',
  text || '[empty]',
].join('\n')

export const serializeCase = (item: SavedCase) => ({
  schemaVersion: datasetSchemaVersion,
  id: item.id,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
  fileName: item.fileName,
  label: item.label,
  status: item.status,
  assignedTo: item.assignedTo,
  flags: item.flags,
  analystNote: item.analystNote,
  decisionHistory: item.decisionHistory,
  auditLog: item.auditLog,
  incidentTimeline: item.incidentTimeline,
  score: item.analysis.score,
  risk: item.analysis.risk,
  confidence: item.analysis.confidence,
  verdict: item.analysis.verdict,
  escalationReasons: item.analysis.escalationReasons,
  responseChecklist: item.analysis.responseChecklist,
  stageCoverage: item.analysis.stageCoverage,
  evidence: item.analysis.evidence.map((evidence) => ({
    id: evidence.id,
    title: evidence.title,
    severity: evidence.severity,
    tactic: evidence.tactic,
    stage: evidence.stage,
    matches: evidence.matches,
    score: evidence.score,
  })),
  transcript: item.transcript,
})

export const buildEvidenceBundle = (item: SavedCase) => [
  'KZ VoiceShield Evidence Bundle',
  `Case ID: ${item.id}`,
  `Generated: ${new Date().toISOString()}`,
  `Status: ${statusText(item.status)}`,
  `Assigned to: ${item.assignedTo}`,
  `Label: ${labelText(item.label)}`,
  `Risk: ${item.analysis.risk.toUpperCase()} (${item.analysis.score}/100)`,
  `Confidence: ${item.analysis.confidence}/100`,
  '',
  'Workflow flags:',
  `- Bank contact needed: ${item.flags.bankContactNeeded ? 'yes' : 'no'}`,
  `- Customer callback needed: ${item.flags.customerCallbackNeeded ? 'yes' : 'no'}`,
  `- Evidence bundle ready: ${item.flags.evidenceBundleReady ? 'yes' : 'no'}`,
  '',
  'Incident timeline:',
  ...(item.incidentTimeline.length ? item.incidentTimeline.map((event) => `- ${event.at} | ${event.title}: ${event.detail}`) : ['- No incident events recorded']),
  '',
  'Decision history:',
  ...(item.decisionHistory.length ? item.decisionHistory.map((entry) => `- ${entry.at} | ${entry.actor}: ${entry.action} | ${entry.detail}`) : ['- No reviewer decisions recorded']),
  '',
  'Audit log:',
  ...(item.auditLog.length ? item.auditLog.map((entry) => `- ${entry.at} | ${entry.actor}: ${entry.action} | ${entry.detail}`) : ['- No audit entries recorded']),
  '',
  'Evidence:',
  ...(item.analysis.evidence.length
    ? item.analysis.evidence.map((evidence) => `- ${evidence.title} [${evidence.tactic}/${evidence.stage}]: ${evidence.matches.join(', ')} | ${evidence.advice}`)
    : ['- No matched scam patterns']),
  '',
  'Transcript:',
  item.transcript || '[empty]',
].join('\n')

export const exportJsonl = (cases: SavedCase[]) => cases.map((item) => JSON.stringify(serializeCase(item))).join('\n')

export const datasetQuality = (cases: SavedCase[]): DatasetQuality => {
  const labelBalance = cases.reduce<Record<CaseLabel, number>>(
    (totals, item) => ({ ...totals, [item.label]: totals[item.label] + 1 }),
    { false_positive: 0, needs_review: 0, true_positive: 0, unreviewed: 0 },
  )
  const duplicateBuckets = cases.reduce<Map<string, string[]>>((buckets, item) => {
    const fingerprint = fingerprintTranscript(item.transcript)
    if (!fingerprint) return buckets
    buckets.set(fingerprint, [...(buckets.get(fingerprint) ?? []), item.id])
    return buckets
  }, new Map())
  const duplicateGroups = [...duplicateBuckets.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([fingerprint, ids]) => ({ fingerprint, ids }))
  const totalWords = cases.reduce((sum, item) => sum + item.analysis.wordCount, 0)

  return {
    averageWords: cases.length ? Math.round(totalWords / cases.length) : 0,
    duplicateGroups,
    falsePositiveReview: cases.filter((item) => item.label === 'false_positive' && item.analysis.score >= 65),
    labelBalance,
    schemaVersion: datasetSchemaVersion,
    total: cases.length,
    unlabeledCount: labelBalance.unreviewed,
  }
}

export const exportSplitJson = (cases: SavedCase[]) => {
  const sorted = [...cases].sort((left, right) => left.id.localeCompare(right.id))
  const trainEnd = Math.ceil(sorted.length * 0.7)
  const devEnd = trainEnd + Math.ceil(sorted.length * 0.15)
  return JSON.stringify(
    {
      schemaVersion: datasetSchemaVersion,
      generatedAt: new Date().toISOString(),
      counts: {
        dev: sorted.slice(trainEnd, devEnd).length,
        test: sorted.slice(devEnd).length,
        train: sorted.slice(0, trainEnd).length,
      },
      train: sorted.slice(0, trainEnd).map(serializeCase),
      dev: sorted.slice(trainEnd, devEnd).map(serializeCase),
      test: sorted.slice(devEnd).map(serializeCase),
    },
    null,
    2,
  )
}

export const exportCsv = (cases: SavedCase[]) => {
  const rows = [
    ['id', 'createdAt', 'label', 'risk', 'score', 'confidence', 'verdict', 'evidenceCount', 'topStages', 'transcript'],
    ...cases.map((item) => [
      item.id,
      item.createdAt,
      item.label,
      item.analysis.risk,
      String(item.analysis.score),
      String(item.analysis.confidence),
      item.analysis.verdict,
      String(item.analysis.evidence.length),
      item.analysis.stageCoverage.map((stage) => `${stage.stage}:${stage.count}`).join('; '),
      item.transcript,
    ]),
  ]
  return rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\n')
}

export const labelText = (label: CaseLabel) =>
  label === 'true_positive'
    ? 'True positive'
    : label === 'false_positive'
      ? 'False positive'
      : label === 'needs_review'
        ? 'Needs review'
        : 'Unreviewed'
