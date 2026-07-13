// Semantic template matching engine.
// Uses TF-IDF-style cosine similarity against known scam phrase templates.
// No ML model required — works purely on word frequency vectors.
// Interface is model-ready: when a MiniLM ONNX model is available,
// swap getEmbedding() to use it; the similarity logic stays the same.

export type TemplateMatch = {
  templateId: string
  label: string
  similarity: number
  risk: 'critical' | 'high' | 'medium'
}

type Template = {
  id: string
  label: string
  risk: 'critical' | 'high' | 'medium'
  phrases: string[]
}

// Known scam sentence templates in RU/KZ — paraphrased from real call recordings.
const TEMPLATES: Template[] = [
  {
    id: 'bank-block-otp',
    label: 'Bank blocking + OTP demand',
    risk: 'critical',
    phrases: [
      'ваша карта заблокирована назовите код из смс',
      'банк заблокировал подозрительную операцию скажите код подтверждения',
      'картаңыз бұғатталды смс кодты айтыңыз',
      'suspicious transaction blocked please confirm with your one time password',
      'безопасный перевод требует код верификации из смс',
    ],
  },
  {
    id: 'police-investigation',
    label: 'Police investigation pressure',
    risk: 'critical',
    phrases: [
      'полиция ведет расследование ваши счета под угрозой',
      'уголовное дело ваши деньги нужно перевести на безопасный счет',
      'прокуратура расследует мошенничество вашим именем',
      'следователь требует доступ к вашему интернет банку',
      'финансовый мониторинг заблокирует счет если не подтвердите',
    ],
  },
  {
    id: 'sim-swap-pressure',
    label: 'SIM swap / operator scam',
    risk: 'critical',
    phrases: [
      'оператор зафиксировал заявку на замену сим карты',
      'ваш номер переносят другому человеку назовите код',
      'для отмены замены симки продиктуйте код из смс',
      'сим картаңызды ауыстыру өтінімі тіркелді кодты айтыңыз',
    ],
  },
  {
    id: 'safe-account-transfer',
    label: 'Safe account / urgent transfer',
    risk: 'critical',
    phrases: [
      'срочно переведите деньги на безопасный счет',
      'зачислите средства на защищенный счет пока мошенники не украли',
      'ваши накопления под угрозой нужен срочный перевод',
      'snatch funds to secure account before attackers drain it',
      'немедленно снимите деньги и внесите через банкомат',
    ],
  },
  {
    id: 'remote-access-request',
    label: 'Remote access demand',
    risk: 'high',
    phrases: [
      'установите приложение для удаленного доступа',
      'разрешите управление экраном для проверки безопасности',
      'скачайте anydesk или teamviewer для диагностики',
      'дайте доступ к телефону нашему специалисту',
      'включите демонстрацию экрана',
    ],
  },
  {
    id: 'family-emergency',
    label: 'Family emergency / voice clone',
    risk: 'high',
    phrases: [
      'ваш сын попал в аварию срочно нужны деньги',
      'дочка задержана срочно нужна сумма для освобождения',
      'балаңыз апатқа ұшырады шұғыл ақша керек',
      'родственник в больнице нужна срочная помощь деньгами',
    ],
  },
  {
    id: 'investment-scheme',
    label: 'Investment / trading fraud',
    risk: 'high',
    phrases: [
      'гарантированная прибыль без риска вложите сейчас',
      'криптовалютная платформа ваши инвестиции выросли выведите',
      'брокерский счет требует пополнение для вывода прибыли',
      'эксклюзивное предложение только сегодня вложение с доходом',
    ],
  },
]

function tokenize(text: string): Map<string, number> {
  const words = text
    .toLowerCase()
    .replace(/[^\w\sа-яёәіңғүұқөһа-я]/gi, '')
    .split(/\s+/)
    .filter((w) => w.length > 2)
  const freq = new Map<string, number>()
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1)
  return freq
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (const [term, count] of a) {
    dot += count * (b.get(term) ?? 0)
    normA += count * count
  }
  for (const [, count] of b) normB += count * count
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

export function matchSemanticTemplates(transcript: string, threshold = 0.22): TemplateMatch[] {
  if (transcript.trim().length < 20) return []
  const queryVec = tokenize(transcript)
  const results: TemplateMatch[] = []

  for (const template of TEMPLATES) {
    let best = 0
    for (const phrase of template.phrases) {
      const sim = cosineSimilarity(queryVec, tokenize(phrase))
      if (sim > best) best = sim
    }
    if (best >= threshold) {
      results.push({ templateId: template.id, label: template.label, similarity: best, risk: template.risk })
    }
  }

  return results.sort((a, b) => b.similarity - a.similarity)
}
