import type { AugmentMeta, AugmentSlot, OcrSlotResult } from './contracts.js'

export function normalizeOcrText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\s·•・,，。.!！?？:：;；'"“”‘’()（）[\]【】_-]/g, '')
    .replace(/海克斯强化|强化符文|强化/g, '')
    .toLowerCase()
}

export function levenshteinDistance(a: string, b: string): number {
  if (!a.length) return b.length
  if (!b.length) return a.length
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  const current = new Array<number>(b.length + 1).fill(0)

  for (let row = 1; row <= a.length; row += 1) {
    current[0] = row
    for (let column = 1; column <= b.length; column += 1) {
      current[column] = Math.min(
        (current[column - 1] ?? 0) + 1,
        (previous[column] ?? 0) + 1,
        (previous[column - 1] ?? 0) + (a[row - 1] === b[column - 1] ? 0 : 1),
      )
    }
    for (let column = 0; column <= b.length; column += 1) {
      previous[column] = current[column] ?? 0
    }
  }
  return previous[b.length] ?? Math.max(a.length, b.length)
}

export function textSimilarity(a: string, b: string): number {
  const normalizedA = normalizeOcrText(a)
  const normalizedB = normalizeOcrText(b)
  if (!normalizedA || !normalizedB) return 0
  if (normalizedA === normalizedB) return 1
  const distance = levenshteinDistance(normalizedA, normalizedB)
  return Math.max(0, 1 - distance / Math.max(normalizedA.length, normalizedB.length))
}

export function matchAugmentText(
  slot: AugmentSlot,
  rawText: string,
  augments: AugmentMeta[],
  threshold = 0.9,
): OcrSlotResult {
  const candidates = [rawText, ...rawText.split(/[\r\n|]+/)]
    .map((line) => line.trim())
    .filter(Boolean)
  let best: AugmentMeta | null = null
  let bestScore = 0
  for (const augment of augments) {
    for (const candidate of candidates) {
      const score = textSimilarity(candidate, augment.name)
      if (score > bestScore) {
        best = augment
        bestScore = score
      }
    }
  }

  if (!best || bestScore < threshold) {
    return { slot, rawText, augmentId: null, name: rawText.trim(), confidence: bestScore }
  }
  return {
    slot,
    rawText,
    augmentId: best.id,
    name: best.name,
    confidence: bestScore,
  }
}
