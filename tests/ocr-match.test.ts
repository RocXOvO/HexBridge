import { describe, expect, it } from 'vitest'
import type { AugmentMeta } from '../src/shared/contracts.js'
import { matchAugmentText, normalizeOcrText, textSimilarity } from '../src/shared/ocr-match.js'

const augments: AugmentMeta[] = [
  { id: 1, name: '珠光护手', iconUrl: '', rarity: 2, rarityName: '金色', description: '', globalTier: 1 },
  { id: 2, name: '万用瞄准镜', iconUrl: '', rarity: 2, rarityName: '金色', description: '', globalTier: 2 },
]

describe('OCR text matching', () => {
  it('normalizes common Chinese punctuation and labels', () => {
    expect(normalizeOcrText(' 海克斯强化：珠光·护手！ ')).toBe('珠光护手')
  })
  it('accepts exact normalized matches', () => {
    expect(matchAugmentText('left', '珠光 护手', augments)).toMatchObject({ augmentId: 1, confidence: 1 })
  })
  it('rejects a fuzzy match below the 90 percent threshold', () => {
    const result = matchAugmentText('center', '完全不同名称', augments)
    expect(result.augmentId).toBeNull()
    expect(result.confidence).toBeLessThan(.9)
  })
  it('exposes deterministic similarity', () => {
    expect(textSimilarity('万用瞄准镜', '万用瞄准境')).toBeCloseTo(.8)
  })
})
