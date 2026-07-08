import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  BookOpenCheck,
  BrainCircuit,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Database,
  FileDown,
  FileText,
  Languages,
  LockKeyhole,
  MessageCircleWarning,
  Mic,
  MicOff,
  PhoneCall,
  Radar,
  Save,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Trash2,
  Upload,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, CSSProperties } from 'react'
import './App.css'

type Severity = 'critical' | 'high' | 'medium' | 'low'
type View = 'review' | 'timeline' | 'threats' | 'simulator' | 'cases' | 'dataset' | 'playbook'
type CaseLabel = 'unreviewed' | 'true_positive' | 'false_positive' | 'needs_review'

type ThreatRule = {
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

type Evidence = ThreatRule & {
  matches: string[]
  score: number
}

type Analysis = {
  score: number
  confidence: number
  risk: Severity
  evidence: Evidence[]
  matchedTerms: number
  wordCount: number
  caseId: string
  verdict: string
  nextAction: string
}

type SavedCase = {
  id: string
  createdAt: string
  updatedAt: string
  fileName: string
  transcript: string
  label: CaseLabel
  analystNote: string
  analysis: Analysis
}

type SpeechRecognitionResultShape = {
  isFinal: boolean
  [index: number]: { transcript: string }
}

type SpeechRecognitionEventShape = {
  resultIndex: number
  results: { length: number; [index: number]: SpeechRecognitionResultShape }
}

type SpeechRecognitionInstance = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onend: (() => void) | null
  onerror: ((event: { error: string }) => void) | null
  onresult: ((event: SpeechRecognitionEventShape) => void) | null
  start: () => void
  stop: () => void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}

const samples = {
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

const storageKey = 'kz-voiceshield-cases-v2'

const sampleMeta = [
  ['bank', 'Bank takeover'],
  ['aiFamily', 'AI voice family'],
  ['courier', 'Delivery/customs'],
  ['investment', 'Investment/crypto'],
  ['whatsapp', 'Messenger takeover'],
  ['victimCall', 'Victim-called setup'],
  ['safe', 'Safe call'],
] as const

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

const threatRules: ThreatRule[] = [
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

const pattern = (term: string) => new RegExp(`(^|\\s)${escapeRegExp(normalizeText(term)).replace(/\s+/g, '\\s+')}(?=\\s|$)`, 'u')
const createCaseId = (text: string) => {
  let hash = 0
  for (let index = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index)) >>> 0
  return `KZVS-${hash.toString(16).padStart(8, '0').toUpperCase().slice(0, 8)}`
}

const downloadFile = (fileName: string, body: string, type = 'text/plain;charset=utf-8') => {
  const blob = new Blob([body], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

const detectSafeContext = (text: string) => safeContext.some((term) => pattern(term).test(normalizeText(text)))
const hasExplicitAction = (text: string) => explicitActionTerms.some((term) => pattern(term).test(normalizeText(text)))
const matchTerms = (text: string, terms: string[]) => {
  const normalized = normalizeText(text)
  if (!normalized) return []
  return terms.filter((term) => pattern(term).test(normalized))
}

const analyzeTranscript = (text: string): Analysis => {
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

  return { caseId: createCaseId(text), confidence, evidence, matchedTerms, nextAction, risk, score, verdict, wordCount }
}

const sentenceTimeline = (text: string) =>
  text
    .split(/(?<=[.!?。])\s+|\n+/u)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment, index) => ({ index: index + 1, segment, analysis: analyzeTranscript(segment) }))

const buildReport = (text: string, analysis: Analysis) => [
  'KZ VoiceShield Case Report',
  `Case ID: ${analysis.caseId}`,
  `Generated: ${new Date().toLocaleString()}`,
  `Risk: ${analysis.risk.toUpperCase()} (${analysis.score}/100)`,
  `Confidence: ${analysis.confidence}/100`,
  `Verdict: ${analysis.verdict}`,
  `Recommended action: ${analysis.nextAction}`,
  '',
  'Evidence:',
  ...(analysis.evidence.length
    ? analysis.evidence.map((item) => `- ${item.title} [${item.tactic}/${item.stage}]: ${item.matches.join(', ')} | ${item.advice}`)
    : ['- No matched scam patterns']),
  '',
  'Transcript:',
  text || '[empty]',
].join('\n')

const serializeCase = (item: SavedCase) => ({
  id: item.id,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
  fileName: item.fileName,
  label: item.label,
  analystNote: item.analystNote,
  score: item.analysis.score,
  risk: item.analysis.risk,
  confidence: item.analysis.confidence,
  verdict: item.analysis.verdict,
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

const exportJsonl = (cases: SavedCase[]) => cases.map((item) => JSON.stringify(serializeCase(item))).join('\n')

const exportCsv = (cases: SavedCase[]) => {
  const rows = [
    ['id', 'createdAt', 'label', 'risk', 'score', 'confidence', 'verdict', 'evidenceCount', 'transcript'],
    ...cases.map((item) => [
      item.id,
      item.createdAt,
      item.label,
      item.analysis.risk,
      String(item.analysis.score),
      String(item.analysis.confidence),
      item.analysis.verdict,
      String(item.analysis.evidence.length),
      item.transcript,
    ]),
  ]
  return rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\n')
}

const labelText = (label: CaseLabel) =>
  label === 'true_positive'
    ? 'True positive'
    : label === 'false_positive'
      ? 'False positive'
      : label === 'needs_review'
        ? 'Needs review'
        : 'Unreviewed'

function RiskBadge({ risk }: { risk: Severity }) {
  const label = risk === 'critical' ? 'Critical' : risk === 'high' ? 'High risk' : risk === 'medium' ? 'Review' : 'Low risk'
  const Icon = risk === 'critical' || risk === 'high' ? ShieldAlert : risk === 'medium' ? AlertTriangle : ShieldCheck
  return (
    <span className={`risk-badge ${risk}`}>
      <Icon size={16} />
      {label}
    </span>
  )
}

const tabs: Array<[View, string]> = [
  ['review', 'Case Review'],
  ['timeline', 'Timeline'],
  ['threats', 'Threat Lab'],
  ['simulator', 'Simulator'],
  ['cases', 'Cases'],
  ['dataset', 'Dataset'],
  ['playbook', 'Playbook'],
]

function App() {
  const [activeView, setActiveView] = useState<View>('review')
  const [transcript, setTranscript] = useState(samples.bank)
  const [fileName, setFileName] = useState('sample-bank-call.txt')
  const [cases, setCases] = useState<SavedCase[]>([])
  const [caseLabel, setCaseLabel] = useState<CaseLabel>('unreviewed')
  const [analystNote, setAnalystNote] = useState('')
  const [liveLanguage, setLiveLanguage] = useState('ru-RU')
  const [isListening, setIsListening] = useState(false)
  const [liveStatus, setLiveStatus] = useState('Live mode is ready')
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const analysis = useMemo(() => analyzeTranscript(transcript), [transcript])
  const timeline = useMemo(() => sentenceTimeline(transcript), [transcript])
  const isSpeechSupported = typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  const progressStyle = { '--score': `${analysis.score}%` } as CSSProperties

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored) setCases(JSON.parse(stored) as SavedCase[])
    } catch {
      setCases([])
    }
    return () => recognitionRef.current?.stop()
  }, [])

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(cases))
  }, [cases])

  const exportReport = () => {
    downloadFile(`kz-voiceshield-${analysis.caseId}.txt`, buildReport(transcript, analysis))
  }

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    if (file.type.startsWith('audio/')) {
      setTranscript(`Audio file queued for transcription: ${file.name}. Add a transcript here or use live browser recognition.`)
      return
    }
    if (file.type.startsWith('text/') || file.name.endsWith('.txt') || file.name.endsWith('.jsonl') || file.name.endsWith('.csv')) {
      file.text().then((body) => {
        if (file.name.endsWith('.jsonl')) {
          const imported = body
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line, index) => {
              const parsed = JSON.parse(line) as { transcript?: string; label?: CaseLabel; fileName?: string; analystNote?: string }
              const importedTranscript = parsed.transcript ?? line
              const importedAnalysis = analyzeTranscript(importedTranscript)
              return {
                id: `${importedAnalysis.caseId}-${Date.now()}-${index}`,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                fileName: parsed.fileName ?? file.name,
                transcript: importedTranscript,
                label: parsed.label ?? 'unreviewed',
                analystNote: parsed.analystNote ?? '',
                analysis: importedAnalysis,
              } satisfies SavedCase
            })
          setCases((current) => [...imported, ...current])
          setActiveView('dataset')
          return
        }
        setTranscript(body)
      })
    }
  }

  const saveCurrentCase = () => {
    const now = new Date().toISOString()
    const next: SavedCase = {
      id: analysis.caseId,
      createdAt: now,
      updatedAt: now,
      fileName,
      transcript,
      label: caseLabel,
      analystNote,
      analysis,
    }
    setCases((current) => [next, ...current.filter((item) => item.id !== next.id)])
    setActiveView('cases')
  }

  const loadCase = (item: SavedCase) => {
    setTranscript(item.transcript)
    setFileName(item.fileName)
    setCaseLabel(item.label)
    setAnalystNote(item.analystNote)
    setActiveView('review')
  }

  const updateCaseLabel = (id: string, label: CaseLabel) => {
    setCases((current) => current.map((item) => (item.id === id ? { ...item, label, updatedAt: new Date().toISOString() } : item)))
  }

  const deleteCase = (id: string) => setCases((current) => current.filter((item) => item.id !== id))

  const clearCases = () => setCases([])

  const exportDatasetJsonl = () => downloadFile('kz-voiceshield-dataset.jsonl', exportJsonl(cases), 'application/x-ndjson;charset=utf-8')

  const exportDatasetCsv = () => downloadFile('kz-voiceshield-dataset.csv', exportCsv(cases), 'text/csv;charset=utf-8')

  const stopLiveTranscription = () => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setIsListening(false)
    setLiveStatus('Live transcription stopped')
  }

  const startLiveTranscription = () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Recognition) {
      setLiveStatus('Live speech recognition is not supported in this browser')
      return
    }
    recognitionRef.current?.stop()
    const recognition = new Recognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = liveLanguage
    recognition.onresult = (event) => {
      let finalText = ''
      let interimText = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const phrase = event.results[index][0]?.transcript.trim()
        if (!phrase) continue
        if (event.results[index].isFinal) finalText += `${phrase}. `
        else interimText += phrase
      }
      if (finalText) setTranscript((current) => `${current.trim()} ${finalText}`.trim())
      setLiveStatus(interimText ? `Listening: ${interimText}` : 'Listening for speech...')
    }
    recognition.onerror = (event) => {
      setLiveStatus(`Live transcription error: ${event.error}`)
      setIsListening(false)
    }
    recognition.onend = () => {
      setIsListening(false)
      recognitionRef.current = null
    }
    recognitionRef.current = recognition
    setTranscript('')
    setFileName('live-call-transcript')
    setIsListening(true)
    setLiveStatus('Listening for speech...')
    recognition.start()
  }

  const highSignals = analysis.evidence.filter((item) => item.severity === 'critical' || item.severity === 'high').length

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><LockKeyhole size={19} /></div>
          <div>
            <h1>KZ VoiceShield</h1>
            <p>Threat intelligence workspace for Kazakh/Russian phone fraud</p>
          </div>
        </div>
        <div className="topbar-actions">
          <span className="language-chip"><Languages size={15} />KZ/RU</span>
          <button className="ghost-button" type="button" onClick={saveCurrentCase}><Save size={16} />Save case</button>
          <button className="ghost-button" type="button" onClick={exportReport}><FileDown size={16} />Export report</button>
        </div>
      </header>

      <nav className="view-tabs" aria-label="Application views">
        {tabs.map(([view, label]) => (
          <button className={activeView === view ? 'active' : ''} key={view} type="button" onClick={() => setActiveView(view)}>
            {label}
          </button>
        ))}
      </nav>

      <section className="workspace">
        <aside className="panel input-panel">
          <div className="panel-heading">
            <div><h2>Transcript intake</h2><p>Paste, upload, stream, or load a real-world scam scenario.</p></div>
            <PhoneCall size={20} />
          </div>
          <label className="upload-box">
            <input accept=".txt,text/plain" onChange={handleFile} type="file" />
            <Upload size={20} />
            <span>Upload transcript</span>
            <small>{fileName}</small>
          </label>
          <div className={`live-box ${isListening ? 'active' : ''}`}>
            <div className="live-copy"><strong>Live transcription</strong><span>{liveStatus}</span></div>
            <div className="live-controls">
              <select disabled={isListening} value={liveLanguage} onChange={(event) => setLiveLanguage(event.target.value)}>
                <option value="ru-RU">Russian</option>
                <option value="kk-KZ">Kazakh</option>
              </select>
              {isListening ? (
                <button className="danger-button" type="button" onClick={stopLiveTranscription}><MicOff size={15} />Stop</button>
              ) : (
                <button className="primary-button" disabled={!isSpeechSupported} type="button" onClick={startLiveTranscription}><Mic size={15} />Start</button>
              )}
            </div>
          </div>
          <textarea spellCheck={false} value={transcript} onChange={(event) => setTranscript(event.target.value)} />
          <div className="review-controls">
            <select value={caseLabel} onChange={(event) => setCaseLabel(event.target.value as CaseLabel)}>
              <option value="unreviewed">Unreviewed</option>
              <option value="true_positive">True positive</option>
              <option value="false_positive">False positive</option>
              <option value="needs_review">Needs review</option>
            </select>
            <input value={analystNote} onChange={(event) => setAnalystNote(event.target.value)} placeholder="Analyst note" />
          </div>
          <div className="sample-row">
            {sampleMeta.map(([key, label]) => (
              <button key={key} type="button" onClick={() => { setTranscript(samples[key]); setFileName(`${key}.txt`) }}>{label}</button>
            ))}
          </div>
        </aside>

        <section className="panel main-panel">
          <div className="panel-heading">
            <div><h2>{tabs.find(([view]) => view === activeView)?.[1]}</h2><p>{analysis.caseId} · {analysis.verdict}</p></div>
            <Radar size={20} />
          </div>

          {activeView === 'review' && (
            <>
              <div className={`score-card ${analysis.risk}`}>
                <div className="score-topline"><RiskBadge risk={analysis.risk} /><span>{analysis.caseId}</span></div>
                <div className="score-number">{analysis.score}</div>
                <div className="score-meter" style={progressStyle}><span /></div>
                <p>{analysis.nextAction}</p>
              </div>
              <div className="metric-grid">
                <div><ShieldAlert size={18} /><strong>{highSignals}</strong><span>major signals</span></div>
                <div><BadgeCheck size={18} /><strong>{analysis.confidence}</strong><span>confidence</span></div>
                <div><ClipboardCheck size={18} /><strong>{analysis.evidence.length}</strong><span>rules matched</span></div>
                <div><BrainCircuit size={18} /><strong>{analysis.matchedTerms}</strong><span>terms found</span></div>
                <div><Clock3 size={18} /><strong>{timeline.length}</strong><span>segments</span></div>
                <div><Banknote size={18} /><strong>{analysis.evidence.some((item) => item.stage === 'Cash-out') ? 'Yes' : 'No'}</strong><span>cash-out stage</span></div>
              </div>
              <div className="action-box"><h3>Operator action</h3><p>{analysis.nextAction}</p></div>
            </>
          )}

          {activeView === 'timeline' && (
            <div className="timeline-list">
              {timeline.map((item) => (
                <article className={`timeline-item ${item.analysis.risk}`} key={`${item.index}-${item.segment}`}>
                  <span>{item.index}</span>
                  <div><strong>{item.analysis.score}/100 · {item.analysis.verdict}</strong><p>{item.segment}</p></div>
                </article>
              ))}
            </div>
          )}

          {activeView === 'threats' && (
            <div className="threat-grid">
              {threatRules.map((rule) => (
                <article className={`threat-card ${rule.severity}`} key={rule.id}>
                  <strong>{rule.title}</strong>
                  <span>{rule.tactic} · {rule.stage} · weight {rule.weight}</span>
                  <p>{rule.advice}</p>
                </article>
              ))}
            </div>
          )}

          {activeView === 'simulator' && (
            <div className="simulator-grid">
              {sampleMeta.map(([key, label]) => {
                const result = analyzeTranscript(samples[key])
                return (
                  <button className={`scenario-button ${result.risk}`} key={key} type="button" onClick={() => { setTranscript(samples[key]); setFileName(`${key}.txt`); setActiveView('review') }}>
                    <strong>{label}</strong>
                    <span>{result.score}/100 · {result.verdict}</span>
                  </button>
                )
              })}
            </div>
          )}

          {activeView === 'cases' && (
            <div className="case-library">
              <div className="library-actions">
                <strong>{cases.length} saved cases</strong>
                <button className="primary-button" type="button" onClick={saveCurrentCase}><Save size={15} />Save current</button>
              </div>
              {cases.length === 0 ? (
                <div className="empty-state"><Database size={22} /><strong>No saved cases yet</strong><span>Save reviewed calls to build a local investigation library.</span></div>
              ) : (
                cases.map((item) => (
                  <article className={`saved-case ${item.analysis.risk}`} key={item.id}>
                    <button className="case-open" type="button" onClick={() => loadCase(item)}>
                      <strong>{item.id}</strong>
                      <span>{item.analysis.score}/100 · {item.analysis.verdict} · {labelText(item.label)}</span>
                      <p>{item.transcript.slice(0, 180)}{item.transcript.length > 180 ? '...' : ''}</p>
                    </button>
                    <div className="case-tools">
                      <select value={item.label} onChange={(event) => updateCaseLabel(item.id, event.target.value as CaseLabel)}>
                        <option value="unreviewed">Unreviewed</option>
                        <option value="true_positive">True positive</option>
                        <option value="false_positive">False positive</option>
                        <option value="needs_review">Needs review</option>
                      </select>
                      <button className="icon-button" type="button" onClick={() => deleteCase(item.id)} aria-label="Delete case"><Trash2 size={16} /></button>
                    </div>
                  </article>
                ))
              )}
            </div>
          )}

          {activeView === 'dataset' && (
            <div className="dataset-panel">
              <div className="dataset-actions">
                <button className="ghost-button" disabled={cases.length === 0} type="button" onClick={exportDatasetJsonl}><FileText size={16} />Export JSONL</button>
                <button className="ghost-button" disabled={cases.length === 0} type="button" onClick={exportDatasetCsv}><FileDown size={16} />Export CSV</button>
                <button className="danger-button" disabled={cases.length === 0} type="button" onClick={clearCases}><Trash2 size={15} />Clear</button>
              </div>
              <div className="dataset-stats">
                <div><strong>{cases.length}</strong><span>cases</span></div>
                <div><strong>{cases.filter((item) => item.label === 'true_positive').length}</strong><span>true positive</span></div>
                <div><strong>{cases.filter((item) => item.label === 'false_positive').length}</strong><span>false positive</span></div>
                <div><strong>{cases.filter((item) => item.label === 'needs_review').length}</strong><span>needs review</span></div>
              </div>
              <div className="dataset-schema">
                <strong>Training fields</strong>
                <p>Each export includes transcript, score, risk, confidence, verdict, evidence IDs, matched terms, analyst label and notes. Use JSONL for future model training and CSV for spreadsheet audit.</p>
              </div>
            </div>
          )}

          {activeView === 'playbook' && (
            <div className="playbook">
              <article><ShieldCheck size={18} /><div><strong>1. Freeze action</strong><p>Stop transfers, code sharing, screen sharing and app installs immediately.</p></div></article>
              <article><PhoneCall size={18} /><div><strong>2. Verify independently</strong><p>Call the bank, courier, relative or agency through a saved official number.</p></div></article>
              <article><Smartphone size={18} /><div><strong>3. Secure accounts</strong><p>Change passwords, end suspicious sessions and check messenger linked devices.</p></div></article>
              <article><FileDown size={18} /><div><strong>4. Preserve evidence</strong><p>Export this report, keep screenshots, phone numbers, links and timestamps.</p></div></article>
            </div>
          )}
        </section>

        <aside className="panel evidence-panel">
          <div className="panel-heading">
            <div><h2>Evidence</h2><p>Matched tactics, stages and concrete terms.</p></div>
            <MessageCircleWarning size={20} />
          </div>
          <div className="evidence-list">
            {analysis.evidence.length === 0 ? (
              <div className="empty-state"><CheckCircle2 size={22} /><strong>No actionable scam pattern</strong><span>Ordinary text now stays at 0 unless real signals appear.</span></div>
            ) : (
              analysis.evidence.map((item) => (
                <article className={`evidence-item ${item.severity}`} key={item.id}>
                  <div><strong>{item.title}</strong><p>{item.tactic} · {item.stage} · +{item.score}</p></div>
                  <div className="term-row">{item.matches.map((match) => <span key={match}>{match}</span>)}</div>
                </article>
              ))
            )}
          </div>
          <div className={`case-summary ${analysis.risk}`}>
            <strong>{analysis.verdict}</strong>
            <span>Score {analysis.score}/100 · Confidence {analysis.confidence}/100</span>
            <p>{analysis.nextAction}</p>
          </div>
          <div className="source-box">
            <BookOpenCheck size={17} />
            <span>Threat model covers bank vishing, OTP theft, remote access, AI-family scams, delivery phishing, investment fraud, messenger takeover, marketplace deposits and reverse-vishing setup calls.</span>
          </div>
        </aside>
      </section>
    </main>
  )
}

export default App
