import { analyzeTranscript, type Analysis, type RiskSignal } from '@scoring'

export type DemoStep = {
  id: string
  speaker: 'system' | 'caller'
  stage: string
  text: string
  signal?: RiskSignal
}

export type DemoSnapshot = {
  analysis: Analysis
  signals: RiskSignal[]
  transcript: string
  visibleSteps: DemoStep[]
}

export const investorDemoSteps: readonly DemoStep[] = [
  {
    id: 'incoming',
    speaker: 'system',
    stage: 'Contact',
    text: 'Входящий звонок: номер не подтверждён.',
    signal: { id: 'caller_unverified', label: 'Caller identity is unverified', weight: 24 },
  },
  {
    id: 'authority',
    speaker: 'caller',
    stage: 'Trust',
    text: 'Здравствуйте, это служба безопасности банка. На вашем счёте подозрительная операция.',
  },
  {
    id: 'pressure',
    speaker: 'caller',
    stage: 'Pressure',
    text: 'Не кладите трубку и никому не сообщайте о звонке. Действовать нужно прямо сейчас.',
  },
  {
    id: 'credential',
    speaker: 'caller',
    stage: 'Credential theft',
    text: 'Назовите код из SMS, чтобы мы отменили перевод.',
    signal: { id: 'otp_notification', label: 'OTP notification received during call', weight: 14 },
  },
  {
    id: 'cashout',
    speaker: 'caller',
    stage: 'Cash-out',
    text: 'После этого переведите деньги на безопасный счёт через приложение банка.',
    signal: { id: 'bank_app_open', label: 'Bank app opened during suspicious call', weight: 12 },
  },
]

export const buildInvestorDemoSnapshot = (stepIndex: number): DemoSnapshot => {
  const safeIndex = Math.min(Math.max(stepIndex, 0), investorDemoSteps.length - 1)
  const visibleSteps = investorDemoSteps.slice(0, safeIndex + 1)
  const transcript = visibleSteps
    .filter((step) => step.speaker === 'caller')
    .map((step) => step.text)
    .join(' ')
  const signals = visibleSteps.flatMap((step) => step.signal ? [step.signal] : [])
  return {
    analysis: analyzeTranscript(transcript, { signals, captureCompleteness: 0.9 }),
    signals,
    transcript,
    visibleSteps,
  }
}
