import { describe, expect, it } from 'vitest'
import type { AugmentMeta, ChampionAugmentRank, ChampionSummary, ChampSelectSnapshot } from '../src/shared/contracts.js'
import { buildChampionCandidates, compareChampions, rankAugmentSlots } from '../src/shared/recommendations.js'

const champion = (id: number, tier: number | null, winRate: number | null): ChampionSummary => ({
  id, alias: `Champion${id}`, name: `英雄${id}`, title: '', roles: [], iconUrl: '', splashUrl: '',
  tier, winRate, patch: '16.15', date: '', source: 'fixture',
})

const snapshot: ChampSelectSnapshot = {
  phase: 'ChampSelect', locale: 'zh_CN', queueId: 2400, modeActive: true, currentChampionId: 1,
  matchStage: 'selecting', matchGeneration: 1,
  benchChampionIds: [3, 2, 4], benchEnabled: true, updatedAt: 1,
}

describe('champion recommendations', () => {
  it('sorts by tier, win rate, then id while keeping current champion first', () => {
    const result = buildChampionCandidates(snapshot, [
      champion(1, 2, .51), champion(2, 1, .53), champion(3, 1, .55), champion(4, null, null),
    ])
    expect(result.map((item) => item.id)).toEqual([1, 3, 2, 4])
    expect(result.find((item) => item.id === 3)?.isBest).toBe(true)
    expect(result.find((item) => item.id === 3)?.winRateDelta).toBeCloseTo(.04)
  })

  it('puts missing statistics after reliable statistics', () => {
    expect(compareChampions(champion(1, null, null), champion(2, 4, .45))).toBeGreaterThan(0)
  })
})

describe('augment recommendations', () => {
  const augments: AugmentMeta[] = [1, 2, 3].map((id) => ({
    id, name: `强化${id}`, iconUrl: '', rarity: 1, rarityName: '金色', description: '', globalTier: id,
  }))
  const slots = [
    { slot: 'left' as const, rawText: '强化1', augmentId: 1, name: '强化1', confidence: 1 },
    { slot: 'center' as const, rawText: '强化2', augmentId: 2, name: '强化2', confidence: 1 },
    { slot: 'right' as const, rawText: '强化3', augmentId: 3, name: '强化3', confidence: 1 },
  ]

  it('uses champion rank before champion tier and global tier', () => {
    const ranks: ChampionAugmentRank[] = [
      { augmentId: 2, rank: 8, total: 100, tier: 2, pickRate: .27, statsSource: 'tencent', statsRegion: 'CN' },
      { augmentId: 3, rank: null, total: null, tier: 1, pickRate: null, statsSource: null, statsRegion: null },
    ]
    const result = rankAugmentSlots(slots, ranks, augments)
    expect(result.map((slot) => slot.position)).toEqual([3, 1, 2])
    expect(result[1]?.reason).toBe('该英雄适配度排名第 8（共 100 项）')
    expect(result[1]?.pickRate).toBe(.27)
    expect(result[1]).toMatchObject({ statsSource: 'tencent', statsRegion: 'CN' })
  })

  it('marks equal rank data as tied and never invents a position for missing data', () => {
    const noGlobal = augments.map((item) => ({ ...item, globalTier: null }))
    const ranks: ChampionAugmentRank[] = [
      { augmentId: 1, rank: 2, total: 50, tier: 1, pickRate: .1, statsSource: 'tencent', statsRegion: 'CN' },
      { augmentId: 2, rank: 2, total: 50, tier: 1, pickRate: .9, statsSource: 'tencent', statsRegion: 'CN' },
    ]
    const result = rankAugmentSlots(slots, ranks, noGlobal)
    expect(result[0]).toMatchObject({ position: 1, tied: true })
    expect(result[1]).toMatchObject({ position: 1, tied: true })
    expect(result[2]).toMatchObject({ position: null, reason: '暂无可靠的推荐依据' })
    expect(result.map((slot) => slot.position)).toEqual([1, 1, null])
  })
})
