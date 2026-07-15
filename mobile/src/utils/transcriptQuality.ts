export type TranscriptQuality = {
  accepted: boolean
  reason?: 'empty' | 'repetition' | 'hallucination'
}

const hallucinationPatterns = ['субтитры', 'подписывайтесь', 'спасибо за просмотр', '字幕', 'ご視聴ありがとうございました']

export function assessTranscriptQuality(text: string): TranscriptQuality {
  const normalized = text.trim().replace(/\s+/gu, ' ')
  if (!normalized) return { accepted: false, reason: 'empty' }
  const folded = normalized.toLocaleLowerCase()
  if (hallucinationPatterns.some((phrase) => folded.includes(phrase))) return { accepted: false, reason: 'hallucination' }
  const words = normalized.toLocaleLowerCase().split(' ')
  if (words.length >= 8 && new Set(words).size / words.length < 0.3) return { accepted: false, reason: 'repetition' }
  return { accepted: true }
}
