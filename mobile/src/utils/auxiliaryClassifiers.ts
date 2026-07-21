import type { Evidence } from '@scoring'

export type ClassifierStatus = 'ready' | 'shadow' | 'unavailable'
export type AuxiliaryClassifierId = 'synthetic_voice' | 'robocall' | 'phishing' | 'caller_context'

export type AuxiliaryClassifierResult = {
  id: AuxiliaryClassifierId
  label: string
  score: number | null
  confidence: number
  status: ClassifierStatus
  rules: string[]
  model?: string
}

export type AudioModelEvidence = {
  syntheticVoiceScore?: number
  syntheticVoiceConfidence?: number
  model?: string
  speechProbability?: number
  clippingRatio?: number
  signalRatio?: number
}

const clamp = (value: number): number => Math.max(0, Math.min(100, Math.round(value)))

function audioSyntheticVoice(evidence?: AudioModelEvidence): AuxiliaryClassifierResult {
  if (evidence?.syntheticVoiceScore === undefined) {
    return { id: 'synthetic_voice', label: 'Synthetic voice', score: null, confidence: 0, status: 'unavailable', rules: ['No calibrated audio model result was supplied'] }
  }
  const score = clamp(evidence.syntheticVoiceScore)
  const confidence = clamp(evidence.syntheticVoiceConfidence ?? 0)
  const rules = score >= 70 ? ['anti-spoof model classified the segment as likely synthetic'] : score >= 40 ? ['anti-spoof model found an uncertain synthetic-voice signal'] : ['anti-spoof model found no strong synthetic-voice signal']
  const model = evidence.model ?? 'anti-spoof model'
  return { id: 'synthetic_voice', label: 'Synthetic voice', score, confidence, status: model === 'conservative audio heuristic' ? 'shadow' : 'ready', rules, model }
}

export function classifyAudioEvidence(evidence?: AudioModelEvidence): AuxiliaryClassifierResult[] {
  return [audioSyntheticVoice(evidence)]
}

export function classifyAuxiliarySignals(text: string, evidence: Evidence[], contextSignalIds: string[] = []): AuxiliaryClassifierResult[] {
  const normalized = text.toLocaleLowerCase()
  const evidenceIds = new Set(evidence.map((item) => item.id))
  const robocallRules: string[] = []
  if (/(?:нажмите\s+[0-9]|для\s+соединения\s+нажмите|автоматическ(?:ое|ий)\s+сообщение|робот\s+сообщает)/iu.test(normalized)) robocallRules.push('interactive IVR or automated-message phrase')
  if (/(?:ваш\s+звонок\s+очень\s+важен|оставайтесь\s+на\s+линии|ожидайте\s+соединения)/iu.test(normalized)) robocallRules.push('call-center queue phrase')
  if (/(.)\1{5,}/u.test(normalized.replace(/\s+/gu, ''))) robocallRules.push('repeated transcript fragment')
  const robocallScore = robocallRules.length === 0 ? 0 : clamp(robocallRules.length * 28)
  const phishingRules: string[] = []
  if (evidenceIds.has('phishing-link') || /(?:https?:\/\/|www\.|перейдите\s+по\s+ссылке|сілтемеге\s+өтіңіз)/iu.test(normalized)) phishingRules.push('link or link-following instruction')
  if (evidenceIds.has('smishing-bridge')) phishingRules.push('cross-channel message-to-call bridge')
  if (/(?:введите|заполните|подтвердите).{0,80}(?:данн|карт|код|парол)/iu.test(normalized)) phishingRules.push('credential collection form instruction')
  const phishingScore = phishingRules.length === 0 ? 0 : clamp(phishingRules.length * 32)
  const contextRules = contextSignalIds.filter((id) => ['caller_reputation_high', 'caller_verification_failed', 'caller_unverified', 'suspicious_link_open'].includes(id))
  const contextScore = contextRules.length === 0 ? 0 : clamp(Math.min(90, contextRules.length * 27))
  return [
    audioSyntheticVoice(),
    { id: 'robocall', label: 'Robocall pattern', score: robocallScore, confidence: robocallRules.length > 0 ? Math.min(90, 46 + robocallRules.length * 14) : 45, status: robocallRules.length > 0 ? 'shadow' : 'ready', rules: robocallRules.length > 0 ? robocallRules : ['No robocall-specific phrase detected'] },
    { id: 'phishing', label: 'Phishing / smishing', score: phishingScore, confidence: phishingRules.length > 0 ? Math.min(92, 55 + phishingRules.length * 12) : 48, status: phishingRules.length > 0 ? 'shadow' : 'ready', rules: phishingRules.length > 0 ? phishingRules : ['No phishing-specific signal detected'] },
    { id: 'caller_context', label: 'Caller context', score: contextScore, confidence: contextRules.length > 0 ? Math.min(94, 58 + contextRules.length * 10) : 40, status: contextRules.length > 0 ? 'shadow' : 'ready', rules: contextRules.length > 0 ? contextRules : ['No independent caller-context signal detected'] },
  ]
}
