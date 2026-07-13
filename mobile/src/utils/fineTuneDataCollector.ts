import AsyncStorage from '@react-native-async-storage/async-storage'
import { SecureStorage } from '@bridge/SecureStorageBridge'

const KEY = 'voiceshield.finetune-dataset.v2'
const MAX_EXAMPLES = 500

async function readExamples(): Promise<FineTuneExample[]> {
  const encrypted = await SecureStorage.getItem(KEY)
  if (encrypted) return JSON.parse(encrypted) as FineTuneExample[]

  // One-time migration from releases that stored transcripts in plaintext.
  const legacy = await AsyncStorage.getItem(KEY)
  if (!legacy) return []
  const parsed = JSON.parse(legacy) as FineTuneExample[]
  await SecureStorage.setItem(KEY, JSON.stringify(parsed))
  await AsyncStorage.removeItem(KEY)
  return parsed
}

async function writeExamples(examples: FineTuneExample[]): Promise<void> {
  await SecureStorage.setItem(KEY, JSON.stringify(examples))
  await AsyncStorage.removeItem(KEY)
}

export type LabelSource = 'auto_rules' | 'user_feedback' | 'analyst_gold'
export type ReviewStatus = 'pending' | 'confirmed' | 'rejected'

export type FineTuneExample = {
  id: string
  ts: number
  transcript: string
  label: 'scam' | 'safe' | 'uncertain'
  schemeLabel: string
  score: number
  // provenance fields — CRITICAL for preventing self-training feedback loop
  labelSource: LabelSource
  trainingWeight: number   // auto_rules=0.2, user_feedback=0.6, analyst_gold=1.0
  reviewStatus: ReviewStatus
  lang: 'ru' | 'kz' | 'mixed'
}

function detectLang(text: string): 'ru' | 'kz' | 'mixed' {
  const kzChars = (text.match(/[әіңғүұқөһ]/gi) ?? []).length
  if (kzChars > 5) return 'kz'
  if (kzChars > 0) return 'mixed'
  return 'ru'
}

const LABEL_WEIGHTS: Record<LabelSource, number> = {
  auto_rules: 0.2,
  user_feedback: 0.6,
  analyst_gold: 1.0,
}

export async function addFineTuneExample(
  transcript: string,
  label: 'scam' | 'safe' | 'uncertain',
  schemeLabel: string,
  score: number,
  labelSource: LabelSource = 'auto_rules',
): Promise<void> {
  if (transcript.trim().length < 20) return
  try {
    const list = await readExamples()
    const example: FineTuneExample = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ts: Date.now(),
      transcript: transcript.slice(0, 4000),
      label,
      schemeLabel,
      score,
      labelSource,
      trainingWeight: LABEL_WEIGHTS[labelSource],
      reviewStatus: labelSource === 'analyst_gold' ? 'confirmed' : 'pending',
      lang: detectLang(transcript),
    }
    list.push(example)
    if (list.length > MAX_EXAMPLES) list.splice(0, list.length - MAX_EXAMPLES)
    await writeExamples(list)
  } catch {}
}

export async function confirmFineTuneExample(id: string): Promise<void> {
  try {
    const list = await readExamples()
    const idx = list.findIndex((e) => e.id === id)
    if (idx === -1) return
    list[idx] = { ...list[idx]!, reviewStatus: 'confirmed', labelSource: 'user_feedback', trainingWeight: LABEL_WEIGHTS.user_feedback }
    await writeExamples(list)
  } catch {}
}

export async function getFineTuneExamples(): Promise<FineTuneExample[]> {
  try {
    return await readExamples()
  } catch { return [] }
}

export async function exportFineTuneDataset(minWeight = 0.5): Promise<string> {
  const examples = await getFineTuneExamples()
  return examples
    .filter(e => e.trainingWeight >= minWeight && e.reviewStatus !== 'rejected' && e.transcript.length > 30)
    .map(e => {
      const answer = e.label === 'scam'
        ? `Это мошенничество (схема: ${e.schemeLabel}, оценка риска: ${e.score}/100). Немедленно завершите звонок.`
        : e.label === 'safe'
          ? 'Признаков мошенничества не обнаружено. Звонок выглядит безопасным.'
          : 'Звонок требует осторожности. Проверьте личность звонящего через официальные каналы.'
      const prompt = `<start_of_turn>user\nПроанализируй транскрипт звонка и определи — мошенничество это или нет:\n\n${e.transcript}<end_of_turn>\n<start_of_turn>model\n${answer}<end_of_turn>`
      return JSON.stringify({ text: prompt, label: e.label, scheme: e.schemeLabel, lang: e.lang, weight: e.trainingWeight })
    })
    .join('\n')
}

export async function getDatasetStats(): Promise<{
  total: number; scam: number; safe: number
  bySource: Record<LabelSource, number>; byLang: Record<string, number>
  trainableCount: number
}> {
  const examples = await getFineTuneExamples()
  return {
    total: examples.length,
    scam: examples.filter(e => e.label === 'scam').length,
    safe: examples.filter(e => e.label === 'safe').length,
    bySource: examples.reduce((acc, e) => ({ ...acc, [e.labelSource]: (acc[e.labelSource] ?? 0) + 1 }), {} as Record<LabelSource, number>),
    byLang: examples.reduce((acc, e) => ({ ...acc, [e.lang]: (acc[e.lang] ?? 0) + 1 }), {} as Record<string, number>),
    trainableCount: examples.filter(e => e.trainingWeight >= 0.5 && e.reviewStatus !== 'rejected').length,
  }
}

export async function clearFineTuneDataset(): Promise<void> {
  await Promise.all([
    SecureStorage.removeItem(KEY),
    AsyncStorage.removeItem(KEY),
  ])
}
