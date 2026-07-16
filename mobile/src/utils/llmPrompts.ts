export const SYSTEM_PROMPT = `Ты VoiceShield AI — ассистент по защите от телефонного мошенничества в Казахстане.
Анализируешь транскрипты подозрительных звонков на русском и казахском языках.
Правила: отвечай по существу, но заканчивай мысль и все запрошенные пункты. Отвечай на том же языке, что вопрос. Называй конкретные фразы-улики из транскрипта. Не выдумывай факты которых нет в транскрипте. Если данных нет — скажи честно.`

export function preserveTextWindow(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value
  const headLength = Math.ceil(maxChars / 2)
  const tailLength = Math.floor(maxChars / 2)
  return `${value.slice(0, headLength)}\n\n[... middle omitted to keep this analysis within the model context ...]\n\n${value.slice(-tailLength)}`
}

export type QuickQuestion = { id: string; label: string; prompt: string }

export const QUICK_QUESTIONS: QuickQuestion[] = [
  {
    id: 'why_suspicious',
    label: 'Почему подозрительно?',
    prompt: 'На основе транскрипта ниже: почему этот звонок подозрителен? Назови конкретные фразы которые выдают мошенника.\n\nТранскрипт:\n',
  },
  {
    id: 'what_tactics',
    label: 'Какие тактики?',
    prompt: 'На основе транскрипта ниже: какие именно манипулятивные тактики использует звонящий? Назови схему.\n\nТранскрипт:\n',
  },
  {
    id: 'what_to_do',
    label: 'Что делать сейчас?',
    prompt: 'На основе транскрипта ниже: дай конкретные немедленные действия — что сделать прямо сейчас для защиты.\n\nТранскрипт:\n',
  },
  {
    id: 'callback_safe',
    label: 'Перезванивать?',
    prompt: 'На основе транскрипта ниже: безопасно ли перезванивать по упомянутому номеру? Объясни риск.\n\nТранскрипт:\n',
  },
  {
    id: 'explain_simple',
    label: 'Объясни простыми словами',
    prompt: 'На основе транскрипта ниже: объясни простыми словами — это мошенничество или нет, и почему.\n\nТранскрипт:\n',
  },
  {
    id: 'kz_explain',
    label: 'Қазақша түсіндір',
    prompt: 'Төмендегі транскрипт негізінде: бұл алаяқтық па? Қазақ тілінде қысқа түсіндір.\n\nТранскрипт:\n',
  },
]

export function buildUserMessage(question: string, transcript: string): string {
  return transcript.trim().length > 0
    ? `${question}${preserveTextWindow(transcript, 12_000)}`
    : question
}

export function buildPrompt(systemPrompt: string, question: string, transcript: string): string {
  const ctx = buildUserMessage(question, transcript)
  return `<start_of_turn>user\n${systemPrompt}\n\n${ctx}<end_of_turn>\n<start_of_turn>model\n`
}
