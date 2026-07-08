import {
  AlertTriangle,
  AudioLines,
  Banknote,
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
  Upload,
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
  advice: string
}

type Evidence = SignalRule & {
  matches: string[]
}

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

const SAMPLE_TRANSCRIPTS = {
  bank: `Здравствуйте, это служба безопасности банка. На вашей карте подозрительная операция. Срочно продиктуйте SMS-код, чтобы мы отменили перевод. Не кладите трубку и никому не говорите. Переведите деньги на безопасный счет, мы поможем вернуть доступ.`,
  relative: `Апа, это я. У меня проблема, я попал в аварию. Срочно нужны деньги, переведи на Kaspi сейчас. Потом объясню, только не звони другим, времени нет. Мой номер временно не работает, напиши в WhatsApp.`,
  safe: `Сәлеметсіз бе. Это оператор клиники. Мы напоминаем о записи на завтра в 10:30. Если время неудобно, можете перезаписаться через официальный номер на сайте.`,
}

const RULES: SignalRule[] = [
  {
    id: 'bank-impersonation',
    title: 'Bank or authority impersonation',
    severity: 'high',
    weight: 26,
    terms: [
      'служба безопасности',
      'банк',
      'полиция',
      'прокуратура',
      'ұлттық банк',
      'халық банк',
      'kaspi bank',
      'сотрудник банка',
      'қаржы мониторингі',
    ],
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
      'pin',
      'пароль',
      'cvv',
      'одноразовый код',
      'кодты айтыңыз',
      'жсн',
      'иин',
    ],
    advice: 'Never share SMS codes, PINs, CVV, passwords or one-time login links.',
  },
  {
    id: 'money-transfer',
    title: 'Pressure to transfer money',
    severity: 'high',
    weight: 28,
    terms: [
      'переведи',
      'перевести деньги',
      'безопасный счет',
      'kaspi',
      'карта',
      'счет',
      'кредит',
      'ақша аудар',
      'қауіпсіз шот',
    ],
    advice: 'Do not transfer funds during a call. Verify through a trusted channel.',
  },
  {
    id: 'urgency',
    title: 'Urgency and emotional pressure',
    severity: 'medium',
    weight: 18,
    terms: ['срочно', 'немедленно', 'времени нет', 'қазір', 'тез', 'авария', 'проблема', 'шұғыл', 'блокировка'],
    advice: 'Slow down. Scammers use time pressure to block verification.',
  },
  {
    id: 'isolation',
    title: 'Attempts to isolate the victim',
    severity: 'medium',
    weight: 14,
    terms: ['никому не говорите', 'не звони', 'не кладите трубку', 'оставайтесь на линии', 'құпия', 'ешкімге айтпа'],
    advice: 'End the call and ask a trusted person to verify the situation.',
  },
  {
    id: 'unofficial-channel',
    title: 'Unofficial channel or off-platform request',
    severity: 'low',
    weight: 8,
    terms: ['whatsapp', 'telegram', 'личный номер', 'ссылка', 'бот', 'приложение скачайте', 'қосымша жүктеңіз'],
    advice: 'Use official websites, verified apps and published phone numbers only.',
  },
  {
    id: 'remote-access',
    title: 'Remote access or app installation',
    severity: 'high',
    weight: 24,
    terms: ['anydesk', 'teamviewer', 'экран', 'удаленный доступ', 'демонстрация экрана', 'screen share'],
    advice: 'Do not install remote access apps or share your screen during financial calls.',
  },
  {
    id: 'deepfake-family',
    title: 'Family emergency script',
    severity: 'medium',
    weight: 17,
    terms: ['апа', 'мама', 'папа', 'сын', 'дочь', 'авария', 'больница', 'мой номер временно не работает'],
    advice: 'Call the relative back using a saved number before sending money.',
  },
]

const countMatches = (text: string, terms: string[]) => {
  const normalized = text.toLowerCase()

  return terms.filter((term) => normalized.includes(term.toLowerCase()))
}

const analyzeTranscript = (text: string) => {
  const evidence: Evidence[] = RULES.map((rule) => ({
    ...rule,
    matches: countMatches(text, rule.terms),
  })).filter((rule) => rule.matches.length > 0)

  const rawScore = evidence.reduce((score, rule) => score + rule.weight + rule.matches.length * 3, 0)
  const score = Math.min(98, Math.max(text.trim().length > 0 ? 12 : 0, rawScore))
  const risk: Severity = score >= 70 ? 'high' : score >= 38 ? 'medium' : 'low'
  const matchedTerms = evidence.reduce((total, item) => total + item.matches.length, 0)

  return { evidence, matchedTerms, risk, score }
}

const getRecommendedAction = (risk: Severity) => {
  if (risk === 'high') return 'Block interaction and verify through official numbers'
  if (risk === 'medium') return 'Pause the call and confirm through a trusted channel'
  return 'Continue only through verified official channels'
}

const buildReport = (transcript: string, analysis: ReturnType<typeof analyzeTranscript>) => {
  const evidenceLines = analysis.evidence
    .map((item) => `- ${item.title}: ${item.matches.join(', ')} | ${item.advice}`)
    .join('\n')

  return [
    'KZ VoiceShield Case Report',
    `Generated: ${new Date().toLocaleString()}`,
    `Risk: ${analysis.risk.toUpperCase()} (${analysis.score}/100)`,
    `Matched signals: ${analysis.matchedTerms}`,
    `Recommended action: ${getRecommendedAction(analysis.risk)}`,
    '',
    'Evidence:',
    evidenceLines || '- No matched scam patterns',
    '',
    'Transcript:',
    transcript || '[empty]',
  ].join('\n')
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

  return (
    <main className="app-shell">
      <header className="topbar" aria-label="Product header">
        <div className="brand">
          <div className="brand-mark">
            <LockKeyhole size={19} />
          </div>
          <div>
            <h1>KZ VoiceShield</h1>
            <p>AI anti-scam call review for Kazakh/Russian conversations</p>
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
              <p>Paste a call transcript or upload a text/audio file for review.</p>
            </div>
            <FileAudio size={20} />
          </div>

          <label className="upload-box">
            <input accept=".txt,.mp3,.wav,.m4a,audio/*,text/plain" onChange={handleFile} type="file" />
            <Upload size={20} />
            <span>Upload call file</span>
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
            <button type="button" onClick={() => { setTranscript(SAMPLE_TRANSCRIPTS.bank); setFileName('sample-bank-call.txt') }}>
              Bank scam
            </button>
            <button type="button" onClick={() => { setTranscript(SAMPLE_TRANSCRIPTS.relative); setFileName('sample-relative-call.txt') }}>
              Family scam
            </button>
            <button type="button" onClick={() => { setTranscript(SAMPLE_TRANSCRIPTS.safe); setFileName('sample-safe-call.txt') }}>
              Safe call
            </button>
          </div>
        </aside>

        <section className="panel score-panel">
          <div className="panel-heading">
            <div>
              <h2>Analyze call</h2>
              <p>Rule-based MVP score for pressure, impersonation and money requests.</p>
            </div>
            <PhoneCall size={20} />
          </div>

          <div className={`score-card ${analysis.risk}`}>
            <div className="score-topline">
              <RiskBadge risk={analysis.risk} />
              <span>{analysis.matchedTerms} matched signals</span>
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
              <AudioLines size={18} />
              <strong>{Math.max(1, Math.ceil(transcript.length / 820))}m</strong>
              <span>estimated length</span>
            </div>
            <div>
              <Banknote size={18} />
              <strong>{analysis.evidence.some((item) => item.id === 'money-transfer') ? 'Yes' : 'No'}</strong>
              <span>money request</span>
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
