import { assessAsrQuality, type AsrQuality } from './asrQuality'

export type AsrSegment = { text: string; startMs: number; endMs: number; confidence: number | null; language?: 'ru' | 'kk' | 'mixed' | 'unknown' }
export type ProcessedAsr = { rawText: string; derivedText: string; segments: AsrSegment[]; quality: AsrQuality; flags: string[] }

const clean = (value: string) => value.normalize('NFC').replace(/\s+/gu, ' ').trim()

function removeOverlap(previous: string, next: string): string {
  const left = clean(previous)
  const right = clean(next)
  if (!left) return right
  if (!right || left === right || left.endsWith(right)) return ''
  const words = left.split(' ')
  const nextWords = right.split(' ')
  for (let count = Math.min(words.length, nextWords.length, 16); count >= 2; count -= 1) {
    if (words.slice(-count).join(' ') === nextWords.slice(0, count).join(' ')) return nextWords.slice(count).join(' ')
  }
  return right
}

/** Creates derived ASR text while retaining raw decoder output for evidence. */
export function postProcessAsrSegments(segments: AsrSegment[], fallbackText = ''): ProcessedAsr {
  const valid = segments.map((segment) => ({ ...segment, text: clean(segment.text), startMs: Math.max(0, segment.startMs), endMs: Math.max(segment.startMs, segment.endMs) })).filter((segment) => segment.text)
  const parts: string[] = []
  const flags: string[] = []
  valid.forEach((segment, index) => {
    const part = removeOverlap(parts.at(-1) ?? '', segment.text)
    if (part) parts.push(part)
    if (segment.confidence !== null && segment.confidence < 0.55) flags.push('low_confidence')
    const previous = index > 0 ? valid[index - 1] : undefined
    if (previous && segment.startMs < previous.endMs) flags.push('overlap')
  })
  const rawText = fallbackText || valid.map((segment) => segment.text).join(' ')
  const derivedText = clean(parts.join(' ') || rawText)
  const confidence = valid.length > 0 ? Math.round(valid.reduce((sum, segment) => sum + (segment.confidence ?? 1), 0) / valid.length * 100) : null
  const quality = assessAsrQuality(derivedText, confidence)
  return { rawText, derivedText, segments: valid, quality, flags: [...new Set([...flags, ...quality.flags])] }
}
