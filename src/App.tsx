import {
  AlertTriangle,
  AudioLines,
  Banknote,
  BadgeCheck,
  Ban,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileAudio,
  FileDown,
  Languages,
  LockKeyhole,
  Mic,
  MicOff,
  PhoneCall,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Smartphone,
  Upload,
  WalletCards,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, CSSProperties } from 'react'
import './App.css'

type Severity = 'high' | 'medium' | 'low'

type SignalRule = {
  id: string
  title: string
  severity: Severity
  weight: number
  terms: string[]
  minTerms?: number
  advice: string
}

type Evidence = SignalRule & {
  matches: string[]
  score: number
}

type SampleKey = 'bank' | 'relative' | 'investment' | 'delivery' | 'safe'

type SpeechRecognitionResultShape = {
  isFinal: boolean
  [index: number]: {
    transcript: string
  }
}

type SpeechRecognitionEventShape = {
  resultIndex: number
  results: {
    length: number
    [index: number]: SpeechRecognitionResultShape
  }
}

type SpeechRecognitionErrorEventShape = {
  error: string
}

type SpeechRecognitionInstance = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onend: (() => void) | null
  onerror: ((event: SpeechRecognitionErrorEventShape) => void) | null
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

const SAMPLE_TRANSCRIPTS: Record<SampleKey, string> = {
  bank: `Здравствуйте, это служба безопасности банка. На вашей карте подозрительная операция. Срочно продиктуйте SMS-код, чтобы мы отменили перевод. Не кладите трубку и никому не говорите. Переведите деньги на безопасный счет, мы поможем вернуть доступ.`,
  relative: `Апа, это я. У меня проблема, я попал в аварию. Срочно нужны деньги, переведи на Kaspi сейчас. Потом объясню, только не звони другим, времени нет. Мой номер временно не работает, напиши в WhatsApp.`,
  investment: `Сәлеметсіз бе, біз инвестициялық платформа өкіліміз. Бүгін ғана депозит салсаңыз, табыс 30 пайыз болады. Қазір Kaspi арқылы ақша аударыңыз, кейін менеджер сізге Telegram ботқа сілтеме жібереді. Ұсыныс құпия, ешкімге айтпаңыз.`,
  delivery: `Здравствуйте, курьерская служба. Ваша посылка задержана, нужно оплатить таможенный сбор по ссылке. Назовите ИИН и код из SMS для подтверждения доставки. Если не сделаете сейчас, посылку вернут отправителю.`,
  safe: `Сәлеметсіз бе. Это оператор клиники. Мы напоминаем о записи на завтра в 10:30. Если время неудобно, можете перезаписаться через официальный номер на сайте.`,
}

const SAMPLE_META: Record<SampleKey, { label: string; fileName: string }> = {
  bank: { label: 'Bank scam', fileName: 'sample-bank-call.txt' },
  relative: { label: 'Family scam', fileName: 'sample-relative-call.txt' },
  investment: { label: 'Investment scam', fileName: 'sample-investment-call.txt' },
  delivery: { label: 'Delivery scam', fileName: 'sample-delivery-call.txt' },
  safe: { label: 'Safe call', fileName: 'sample-safe-call.txt' },
}

const SAFE_CONTEXT_TERMS = [
  'официальный номер',
  'официальный сайт',
  'не сообщайте',
  'не называйте код',
  'никому не сообщайте',
  'напоминаем о записи',
  'можете перезаписаться',
  'құпия кодты айтпаңыз',
]

const RULES: SignalRule[] = [
  {
    id: 'bank-impersonation',
    title: 'Bank or authority impersonation',
    severity: 'high',
    weight: 26,
    terms: [
      'служба безопасности',
      'полиция',
      'прокуратура',
      'ұлттық банк',
      'халық банк',
      'kaspi bank',
      'сотрудник банка',
      'қаржы мониторингі',
      'ұлттық қауіпсіздік',
      'салық комитеті',
      'курьерская служба',
      'таможенный сбор',
    ],
    minTerms: 1,
    advice: 'Hang up and call the official bank or agency number yourself.',
  },
  {
    id: 'secret-code',
    title: 'Requests for SMS, PIN or password',
    severity: 'high',
    weight: 30,
    terms: [
      'sms-код',
      'смс код',
      'код из sms',
      'продиктуйте',
      'назовите',
      'сообщите',
      'айтыңыз',
      'pin',
      'пароль',
      'cvv',
      'одноразовый код',
      'кодты айтыңыз',
      'жсн',
      'иин',
      'код подтверждения',
      'логин',
      'verification code',
    ],
    minTerms: 2,
    advice: 'Never share SMS codes, PINs, CVV, passwords or one-time login links.',
  },
  {
    id: 'money-transfer',
    title: 'Pressure to transfer money',
    severity: 'high',
    weight: 28,
    terms: [
      'переведи',
      'переведите',
      'перевести деньги',
      'безопасный счет',
      'kaspi',
      'кредит',
      'ақша аудар',
      'қауіпсіз шот',
      'депозит',
      'оплатить',
      'таможенный сбор',
    ],
    minTerms: 1,
    advice: 'Do not transfer funds during a call. Verify through a trusted channel.',
  },
  {
    id: 'urgency',
    title: 'Urgency and emotional pressure',
    severity: 'medium',
    weight: 18,
    terms: ['срочно', 'немедленно', 'времени нет', 'қазір', 'тез', 'авария', 'проблема', 'шұғыл', 'блокировка'],
    minTerms: 1,
    advice: 'Slow down. Scammers use time pressure to block verification.',
  },
  {
    id: 'isolation',
    title: 'Attempts to isolate the victim',
    severity: 'medium',
    weight: 14,
    terms: ['никому не говорите', 'не звони', 'не кладите трубку', 'оставайтесь на линии', 'құпия', 'ешкімге айтпа'],
    minTerms: 1,
    advice: 'End the call and ask a trusted person to verify the situation.',
  },
  {
    id: 'unofficial-channel',
    title: 'Unofficial channel or off-platform request',
    severity: 'low',
    weight: 8,
    terms: ['whatsapp', 'telegram', 'личный номер', 'ссылка', 'бот', 'приложение скачайте', 'қосымша жүктеңіз', 'link'],
    minTerms: 1,
    advice: 'Use official websites, verified apps and published phone numbers only.',
  },
  {
    id: 'remote-access',
    title: 'Remote access or app installation',
    severity: 'high',
    weight: 24,
    terms: ['anydesk', 'teamviewer', 'экран', 'удаленный доступ', 'демонстрация экрана', 'screen share'],
    minTerms: 1,
    advice: 'Do not install remote access apps or share your screen during financial calls.',
  },
  {
    id: 'deepfake-family',
    title: 'Family emergency script',
    severity: 'medium',
    weight: 17,
    terms: ['апа', 'мама', 'папа', 'сын', 'дочь', 'авария', 'больница', 'мой номер временно не работает'],
    minTerms: 2,
    advice: 'Call the relative back using a saved number before sending money.',
  },
  {
    id: 'investment-return',
    title: 'Unrealistic investment or prize promise',
    severity: 'medium',
    weight: 16,
    terms: ['инвестиция', 'табыс', 'доход', '30 пайыз', 'гарантия', 'выигрыш', 'приз', 'платформа', 'менеджер'],
    minTerms: 2,
    advice: 'Verify investment licenses and never send deposits during an unsolicited call.',
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

const termPattern = (term: string) => {
  const normalized = normalizeText(term)
  const escaped = escapeRegExp(normalized).replace(/\s+/g, '\\s+')
  return new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, 'u')
}

const countMatches = (text: string, terms: string[]) => {
  const normalized = normalizeText(text)
  if (!normalized) return []

  return terms.filter((term) => termPattern(term).test(normalized))
}

const hasSafeContext = (text: string) => {
  const normalized = normalizeText(text)
  return SAFE_CONTEXT_TERMS.some((term) => termPattern(term).test(normalized))
}

const analyzeTranscript = (text: string) => {
  const normalized = normalizeText(text)
  const wordCount = normalized ? normalized.split(' ').length : 0
  const safeContext = hasSafeContext(text)
  const initialEvidence: Evidence[] = RULES.map((rule) => ({
    ...rule,
    matches: countMatches(text, rule.terms),
    score: 0,
  }))
    .filter((rule) => rule.matches.length >= (rule.minTerms ?? 1))
    .map((rule) => {
      const severityMultiplier = rule.severity === 'high' ? 1.25 : rule.severity === 'medium' ? 1 : 0.7
      const matchScore = rule.weight + Math.max(0, rule.matches.length - 1) * 4
      return { ...rule, score: Math.round(matchScore * severityMultiplier) }
    })
  const hasActionableThreat = initialEvidence.some((item) =>
    ['secret-code', 'money-transfer', 'urgency', 'isolation', 'remote-access'].includes(item.id),
  )
  const evidence = safeContext && !hasActionableThreat ? initialEvidence.filter((item) => item.id !== 'bank-impersonation') : initialEvidence

  const matchedTerms = evidence.reduce((total, item) => total + item.matches.length, 0)
  const highEvidence = evidence.filter((item) => item.severity === 'high').length
  const comboBonus =
    evidence.some((item) => item.id === 'money-transfer') && evidence.some((item) => item.id === 'secret-code')
      ? 18
      : evidence.some((item) => item.id === 'money-transfer') && evidence.some((item) => item.id === 'urgency')
        ? 12
        : 0
  const shortTextPenalty = wordCount < 3 ? 0.35 : wordCount < 6 ? 0.65 : 1
  const safeContextPenalty = safeContext && highEvidence === 0 ? 0.45 : 1
  const rawScore = Math.round(
    (evidence.reduce((score, rule) => score + rule.score, 0) + comboBonus) * shortTextPenalty * safeContextPenalty,
  )
  const score = evidence.length === 0 ? 0 : Math.min(98, rawScore)
  const risk: Severity = score >= 70 ? 'high' : score >= 38 ? 'medium' : 'low'
  const confidence =
    evidence.length === 0
      ? 0
      : Math.min(96, Math.round((matchedTerms * 8 + evidence.length * 10 + Math.min(wordCount, 40)) * shortTextPenalty))

  return { confidence, evidence, matchedTerms, risk, score, wordCount }
}

const getRecommendedAction = (risk: Severity) => {
  if (risk === 'high') return 'Block interaction and verify through official numbers'
  if (risk === 'medium') return 'Pause the call and confirm through a trusted channel'
  return 'Continue only through verified official channels'
}

const buildReport = (transcript: string, analysis: ReturnType<typeof analyzeTranscript>) => {
  const caseId = createCaseId(transcript)
  const evidenceLines = analysis.evidence
    .map((item) => `- ${item.title}: ${item.matches.join(', ')} | ${item.advice}`)
    .join('\n')

  return [
    'KZ VoiceShield Case Report',
    `Case ID: ${caseId}`,
    `Generated: ${new Date().toLocaleString()}`,
    `Risk: ${analysis.risk.toUpperCase()} (${analysis.score}/100)`,
    `Confidence: ${analysis.confidence}/100`,
    `Matched signals: ${analysis.matchedTerms}`,
    `Recommended action: ${getRecommendedAction(analysis.risk)}`,
    '',
    'Immediate checklist:',
    '- End the call before taking any financial action',
    '- Call the bank, relative, courier or agency through an official saved number',
    '- Do not share SMS codes, PIN, CVV, IIN, screen access or remote-control permissions',
    '- Preserve this transcript/report if money was requested',
    '',
    'Evidence:',
    evidenceLines || '- No matched scam patterns',
    '',
    'Transcript:',
    transcript || '[empty]',
  ].join('\n')
}

const createCaseId = (text: string) => {
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0
  }
  return `KZVS-${hash.toString(16).padStart(8, '0').toUpperCase().slice(0, 8)}`
}

function RiskBadge({ risk }: { risk: Severity }) {
  const label = risk === 'high' ? 'High risk' : risk === 'medium' ? 'Review needed' : 'Low risk'
  const Icon = risk === 'high' ? ShieldAlert : risk === 'medium' ? AlertTriangle : ShieldCheck

  return (
    <span className={`risk-badge ${risk}`}>
      <Icon size={16} />
      {label}
    </span>
  )
}

function App() {
  const [transcript, setTranscript] = useState(SAMPLE_TRANSCRIPTS.bank)
  const [fileName, setFileName] = useState('sample-bank-call.txt')
  const [liveLanguage, setLiveLanguage] = useState('ru-RU')
  const [isListening, setIsListening] = useState(false)
  const [liveStatus, setLiveStatus] = useState('Live mode is ready')
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const analysis = useMemo(() => analyzeTranscript(transcript), [transcript])
  const caseId = useMemo(() => createCaseId(transcript), [transcript])
  const isSpeechSupported =
    typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop()
    }
  }, [])

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    if (file.type.startsWith('text/') || file.name.endsWith('.txt')) {
      file.text().then(setTranscript)
    }
  }

  const highSignals = analysis.evidence.filter((item) => item.severity === 'high').length
  const progressStyle = { '--score': `${analysis.score}%` } as CSSProperties
  const recommendedAction = getRecommendedAction(analysis.risk)
  const caseReadiness = analysis.risk === 'high' ? 'Ready for alert' : analysis.risk === 'medium' ? 'Needs review' : 'Monitor only'
  const sampleKeys = Object.keys(SAMPLE_TRANSCRIPTS) as SampleKey[]

  const exportReport = () => {
    const report = buildReport(transcript, analysis)
    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `kz-voiceshield-report-${Date.now()}.txt`
    link.click()
    URL.revokeObjectURL(url)
  }

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
        const result = event.results[index]
        const phrase = result[0]?.transcript.trim()
        if (!phrase) continue

        if (result.isFinal) {
          finalText += `${phrase}. `
        } else {
          interimText += phrase
        }
      }

      if (finalText) {
        setTranscript((current) => `${current.trim()} ${finalText}`.trim())
      }

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

  const loadSample = (sample: SampleKey) => {
    setTranscript(SAMPLE_TRANSCRIPTS[sample])
    setFileName(SAMPLE_META[sample].fileName)
  }

  return (
    <main className="app-shell">
      <header className="topbar" aria-label="Product header">
        <div className="brand">
          <div className="brand-mark">
            <LockKeyhole size={19} />
          </div>
          <div>
            <h1>KZ VoiceShield</h1>
            <p>Anti-scam call review for Kazakh/Russian conversations</p>
          </div>
        </div>
        <div className="topbar-actions">
          <span className="language-chip">
            <Languages size={15} />
            Kazakh/Russian
          </span>
          <button className="ghost-button" type="button" onClick={exportReport}>
            <FileDown size={16} />
            Export report
          </button>
        </div>
      </header>

      <section className="workspace" aria-label="Voice scam analysis workspace">
        <aside className="panel input-panel">
          <div className="panel-heading">
            <div>
              <h2>Audio or transcript</h2>
              <p>Paste a call transcript or upload a text file for local review.</p>
            </div>
            <FileAudio size={20} />
          </div>

          <label className="upload-box">
            <input accept=".txt,.mp3,.wav,.m4a,audio/*,text/plain" onChange={handleFile} type="file" />
            <Upload size={20} />
            <span>Upload transcript</span>
            <small>{fileName}</small>
          </label>

          <div className={`live-box ${isListening ? 'active' : ''}`}>
            <div className="live-copy">
              <strong>Real-time call transcription</strong>
              <span>{liveStatus}</span>
            </div>
            <div className="live-controls">
              <select
                aria-label="Live transcription language"
                disabled={isListening}
                value={liveLanguage}
                onChange={(event) => setLiveLanguage(event.target.value)}
              >
                <option value="ru-RU">Russian</option>
                <option value="kk-KZ">Kazakh</option>
              </select>
              {isListening ? (
                <button className="danger-button" type="button" onClick={stopLiveTranscription}>
                  <MicOff size={15} />
                  Stop
                </button>
              ) : (
                <button
                  className="primary-button"
                  disabled={!isSpeechSupported}
                  type="button"
                  onClick={startLiveTranscription}
                >
                  <Mic size={15} />
                  Start live
                </button>
              )}
            </div>
          </div>

          <textarea
            aria-label="Call transcript"
            spellCheck={false}
            value={transcript}
            onChange={(event) => setTranscript(event.target.value)}
          />

          <div className="sample-row" aria-label="Sample transcripts">
            {sampleKeys.map((sample) => (
              <button key={sample} type="button" onClick={() => loadSample(sample)}>
                {SAMPLE_META[sample].label}
              </button>
            ))}
          </div>
        </aside>

        <section className="panel score-panel">
          <div className="panel-heading">
            <div>
              <h2>Analyze call</h2>
              <p>Risk score for pressure, impersonation, money requests and isolation.</p>
            </div>
            <PhoneCall size={20} />
          </div>

          <div className={`score-card ${analysis.risk}`}>
            <div className="score-topline">
              <RiskBadge risk={analysis.risk} />
              <span>{caseId}</span>
            </div>
            <div className="score-number">{analysis.score}</div>
            <div className="score-meter" style={progressStyle}>
              <span />
            </div>
            <p>
              {analysis.risk === 'high'
                ? 'This call contains multiple high-risk scam indicators. Stop the conversation and verify independently.'
                : analysis.risk === 'medium'
                  ? 'Several warning signs are present. Verify through official channels before taking action.'
                  : 'No major scam pattern detected in this transcript, but official verification is still recommended.'}
            </p>
          </div>

          <div className="metric-grid">
            <div>
              <Siren size={18} />
              <strong>{highSignals}</strong>
              <span>critical signals</span>
            </div>
            <div>
              <BadgeCheck size={18} />
              <strong>{analysis.confidence}</strong>
              <span>confidence</span>
            </div>
            <div>
              <Banknote size={18} />
              <strong>{analysis.evidence.some((item) => item.id === 'money-transfer') ? 'Yes' : 'No'}</strong>
              <span>money request</span>
            </div>
            <div>
              <AudioLines size={18} />
              <strong>{Math.max(1, Math.ceil(transcript.length / 820))}m</strong>
              <span>estimated length</span>
            </div>
            <div>
              <Smartphone size={18} />
              <strong>{analysis.evidence.some((item) => item.id === 'unofficial-channel') ? 'Yes' : 'No'}</strong>
              <span>off-platform ask</span>
            </div>
            <div>
              <WalletCards size={18} />
              <strong>{analysis.matchedTerms}</strong>
              <span>matched terms</span>
            </div>
          </div>

          <div className="action-box">
            <h3>Recommended action</h3>
            <p>{recommendedAction}. Do not share codes, money, screen access or personal data during the call.</p>
          </div>

          <div className="pipeline-box">
            <div>
              <Mic size={16} />
              <span>Speech stream</span>
            </div>
            <div>
              <Clock3 size={16} />
              <span>Live transcript</span>
            </div>
            <div>
              <ClipboardCheck size={16} />
              <span>Case report</span>
            </div>
          </div>

          <div className="checklist-box">
            <h3>Response checklist</h3>
            <ul>
              <li><Ban size={14} /> End the call before sending money or codes.</li>
              <li><PhoneCall size={14} /> Call back through a saved official number.</li>
              <li><ClipboardCheck size={14} /> Save the transcript and report for review.</li>
            </ul>
          </div>
        </section>

        <aside className="panel evidence-panel">
          <div className="panel-heading">
            <div>
              <h2>Scam signals</h2>
              <p>Detected evidence and clear next steps.</p>
            </div>
            <ShieldCheck size={20} />
          </div>

          <div className="evidence-list">
            {analysis.evidence.length === 0 ? (
              <div className="empty-state">
                <CheckCircle2 size={22} />
                <strong>No matched scam patterns</strong>
                <span>Try another transcript or add more call context.</span>
              </div>
            ) : (
              analysis.evidence.map((item) => (
                <article className={`evidence-item ${item.severity}`} key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.advice}</p>
                  </div>
                  <div className="term-row">
                    {item.matches.map((match) => (
                      <span key={match}>{match}</span>
                    ))}
                  </div>
                </article>
              ))
            )}
          </div>

          <div className={`case-summary ${analysis.risk}`}>
            <strong>{caseReadiness}</strong>
            <span>Score {analysis.score}/100</span>
            <p>{recommendedAction}</p>
            <button className="ghost-button" type="button" onClick={exportReport}>
              <FileDown size={15} />
              Download case report
            </button>
          </div>
        </aside>
      </section>
    </main>
  )
}

export default App
