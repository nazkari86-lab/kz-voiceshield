import type { Analysis, Severity } from '@scoring'
import type { LiveAiResult } from './liveAiAnalysis'

export type CopilotAction = {
  id: string
  priority: 'now' | 'next' | 'later'
  title: string
  reason: string
  safe: boolean
}

export type ModelConsensus = {
  label: 'aligned' | 'rules_lead' | 'ai_lead' | 'insufficient'
  confidence: number
  ruleRisk: Severity
  aiRisk: string | null
  explanation: string
}

export type DeviceDiagnostic = {
  id: string
  status: 'pass' | 'warn' | 'fail'
  title: string
  detail: string
  fix: string
}

export type AttackGraph = {
  nodes: Array<{ id: string; label: string; kind: 'actor' | 'tactic' | 'asset' | 'action' }>
  edges: Array<{ from: string; to: string; label: string }>
}

export type DriftReport = {
  status: 'stable' | 'watch' | 'unknown'
  score: number
  signals: string[]
}

export function adaptiveTrainingRecommendation(bestScore: number, completedCount: number, selectedSkill: string): string {
  if (completedCount === 0) return 'Начните с короткого сценария: после каждой ошибки VoiceShield покажет паттерн и безопасную альтернативу.'
  if (bestScore < 70) return `Сначала повторите ${selectedSkill === 'all' ? 'слабые навыки' : selectedSkill}: цель следующей сессии — распознать давление до обсуждения денег.`
  if (bestScore < 90) return 'Переходите к Advanced-сценариям и смешанным RU/KZ кейсам: они проверяют перенос навыка на новую формулировку.'
  return 'Навык устойчивый. Пройдите экзамен и проверьте, сохраняется ли результат при другом языке и схеме атаки.'
}

export function calibratedRiskScore(ruleScore: number, confirmation: 'none' | 'confirmed_fraud' | 'confirmed_safe'): number {
  const delta = confirmation === 'confirmed_fraud' ? 4 : confirmation === 'confirmed_safe' ? -4 : 0
  return Math.max(0, Math.min(100, ruleScore + delta))
}

const severityRank: Record<Severity, number> = { low: 0, medium: 1, high: 2, critical: 3 }

export function buildIncidentCopilot(analysis: Analysis, transcript: string, captureCompleteness = analysis.captureCompleteness): CopilotAction[] {
  const text = transcript.toLowerCase()
  const actions: CopilotAction[] = [
    { id: 'pause', priority: 'now', title: 'Поставьте разговор на паузу', reason: 'Пауза снижает давление и не даёт принять решение под диктовку.', safe: true },
    { id: 'no-secrets', priority: 'now', title: 'Не сообщайте коды, пароли и реквизиты', reason: 'Настоящие организации не запрашивают одноразовые коды по входящему звонку.', safe: true },
  ]
  if (analysis.score >= 60 || analysis.risk === 'critical' || analysis.risk === 'high') {
    actions.push({ id: 'end-call', priority: 'now', title: 'Завершите звонок', reason: `Правила нашли ${analysis.evidence.length} подтверждённых признака риска (${analysis.score}/100).`, safe: true })
  }
  if (/ссылк|перейдите|qr|qr-код|установите|скачайте/iu.test(text)) {
    actions.push({ id: 'avoid-link', priority: 'now', title: 'Не открывайте ссылку и не устанавливайте приложение', reason: 'Ссылка или удалённый доступ могут дать злоумышленнику контроль над устройством.', safe: true })
  }
  if (/перевед|оплат|безопасн.*сч[её]т|ақша аудар/iu.test(text)) {
    actions.push({ id: 'bank', priority: 'next', title: 'Проверьте банк только через официальное приложение', reason: 'Перевод по инструкции звонящего нельзя считать подтверждением личности.', safe: true })
  }
  if (analysis.scheme === 'family_emergency' || /авари|попал в бед|жол апат|ақша керек/iu.test(text)) {
    actions.push({ id: 'family-callback', priority: 'next', title: 'Перезвоните близкому по сохранённому номеру', reason: 'Новый номер и просьба не проверять историю контактов являются сильными сигналами подмены.', safe: true })
  }
  if (captureCompleteness < 0.7) {
    actions.push({ id: 'capture-quality', priority: 'now', title: 'Считайте результат предварительным', reason: `Захвачено только ${Math.round(captureCompleteness * 100)}% ожидаемого разговора.`, safe: true })
  }
  actions.push({ id: 'evidence', priority: 'later', title: 'Сохраните evidence bundle', reason: 'Сохранённые фразы, время и решение помогут банку или оператору расследовать инцидент.', safe: true })
  return actions.filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index).slice(0, 7)
}

export function buildModelConsensus(analysis: Analysis, liveAi?: LiveAiResult | null): ModelConsensus {
  if (!liveAi || liveAi.risk === 'unknown') return { label: 'insufficient', confidence: Math.round(analysis.confidence * 0.7), ruleRisk: analysis.risk, aiRisk: null, explanation: 'Второй модельный сигнал пока недоступен; решение основано на rules и качестве захвата.' }
  const delta = Math.abs(severityRank[analysis.risk] - severityRank[liveAi.risk as Severity])
  if (delta === 0) return { label: 'aligned', confidence: Math.min(99, Math.round((analysis.confidence + 78) / 2)), ruleRisk: analysis.risk, aiRisk: liveAi.risk, explanation: 'Rules и Live AI согласны по уровню риска.' }
  const rulesLead = severityRank[analysis.risk] > severityRank[liveAi.risk as Severity]
  return {
    label: rulesLead ? 'rules_lead' : 'ai_lead',
    confidence: Math.max(35, Math.round(Math.min(analysis.confidence, 78) - delta * 7)),
    ruleRisk: analysis.risk,
    aiRisk: liveAi.risk,
    explanation: rulesLead ? 'Rules выше Live AI: защитное решение сохраняет более строгий сигнал.' : 'Live AI выше rules: требуется ручная проверка, но правила не заменяются.',
  }
}

export function buildDeviceDiagnostics(analysis: Analysis, input: { audioLevel: number; modelReady: boolean; isListening: boolean; source: string; captureError?: string | null }): DeviceDiagnostic[] {
  const diagnostics: DeviceDiagnostic[] = [
    { id: 'model', status: input.modelReady ? 'pass' : 'fail', title: 'ASR model', detail: input.modelReady ? 'Модель распознавания готова.' : 'Модель распознавания не подтверждена.', fix: 'Откройте каталог моделей и дождитесь статуса Ready.' },
    { id: 'session', status: input.isListening ? 'pass' : 'warn', title: 'Audio session', detail: input.isListening ? `Активный источник: ${input.source}.` : 'Звонок или захват сейчас не активны.', fix: 'Запустите Live Shield перед проверочным звонком.' },
    { id: 'level', status: input.audioLevel >= 0.01 ? 'pass' : 'warn', title: 'Input level', detail: input.audioLevel >= 0.01 ? 'На входе есть слышимый сигнал.' : 'В последнем окне нет уверенного аудиосигнала.', fix: 'Проверьте микрофон, громкую связь и разрешение записи.' },
    { id: 'coverage', status: analysis.captureCompleteness >= 0.7 ? 'pass' : 'warn', title: 'Conversation coverage', detail: `${Math.round(analysis.captureCompleteness * 100)}% ожидаемого разговора доступно для анализа.`, fix: 'Считайте low-coverage результат предварительным.' },
    { id: 'errors', status: input.captureError ? 'fail' : 'pass', title: 'Capture errors', detail: input.captureError ?? 'Ошибок аудиозахвата не зафиксировано.', fix: 'Переключитесь на microphone fallback и повторите проверку.' },
  ]
  return diagnostics
}

export function buildAttackGraph(analysis: Analysis): AttackGraph {
  const nodes: AttackGraph['nodes'] = [{ id: 'caller', label: 'Собеседник', kind: 'actor' }]
  const edges: AttackGraph['edges'] = []
  for (const evidence of analysis.evidence.slice(0, 8)) {
    const tacticId = `tactic:${evidence.id}`
    nodes.push({ id: tacticId, label: evidence.title, kind: 'tactic' })
    edges.push({ from: 'caller', to: tacticId, label: evidence.stage })
  }
  const intent = analysis.intents.find((item) => item.probability >= 0.55)
  if (intent) {
    const assetId = `asset:${intent.id}`
    nodes.push({ id: assetId, label: intent.id.replace(/_/g, ' '), kind: 'asset' })
    for (const edge of edges.slice(-3)) edges.push({ from: edge.to, to: assetId, label: 'ведёт к' })
  }
  nodes.push({ id: 'defense', label: 'Проверка по официальному каналу', kind: 'action' })
  if (nodes.length > 1) edges.push({ from: nodes[nodes.length - 2]!.id, to: 'defense', label: 'остановить' })
  return { nodes, edges }
}

export function buildDriftReport(analysis: Analysis, liveAi?: LiveAiResult | null): DriftReport {
  const signals: string[] = []
  if (analysis.confidence < 50) signals.push('низкая уверенность rules')
  if (analysis.captureCompleteness < 0.7) signals.push('неполный захват разговора')
  if (liveAi && liveAi.risk !== 'unknown' && severityRank[analysis.risk] !== severityRank[liveAi.risk as Severity]) signals.push('disagreement между моделями')
  if (!liveAi) return { status: 'unknown', score: 0, signals: ['нет второго модельного сигнала'] }
  const score = Math.min(100, signals.length * 28 + (analysis.confidence < 50 ? 15 : 0))
  return { status: score >= 55 ? 'watch' : 'stable', score, signals: signals.length ? signals : ['стабильные сигналы в текущем окне'] }
}

export function buildFamilyAlert(analysis: Analysis): { title: string; body: string; redacted: boolean } {
  const level = analysis.risk === 'critical' || analysis.risk === 'high' ? 'Высокий риск звонка' : 'Нужна проверка звонка'
  return { title: level, body: `${analysis.schemeLabel}. Не сообщайте коды и деньги; проверьте собеседника по официальному номеру.`, redacted: true }
}
