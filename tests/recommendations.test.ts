import { describe, expect, it } from 'vitest'
import type { AugmentMeta, ChampionSummary, ChampSelectSnapshot, RecommendationDetail } from '../src/shared/contracts.js'
import { buildChampionCandidates, compareChampions, dtodoRecommendationDetail, rankRecommendationSlots } from '../src/shared/recommendations.js'

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
  it('never exposes candidates from an unsupported queue', () => {
    const unsupportedSnapshot = {
      ...snapshot,
      queueId: 450,
      modeActive: false,
      currentChampionId: 1,
      benchChampionIds: [2],
    }
    expect(buildChampionCandidates(unsupportedSnapshot, [champion(1, 1, .5), champion(2, 2, .4)])).toEqual([])
  })

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
    const ranks = [
      { augmentId: 2, rank: 8, total: 100, tier: 2, pickRate: .27, statsSource: 'tencent', statsRegion: 'CN' },
      { augmentId: 3, rank: null, total: null, tier: 1, pickRate: null, statsSource: null, statsRegion: null },
    ] as const
    const result = rankRecommendationSlots(
      slots,
      dtodoRecommendationDetail({ championId: 103, dataVersion: '16.15.6', ranks: [...ranks], builds: [] }),
      augments,
      'dtodo',
    )
    expect(result.map((slot) => slot.position)).toEqual([3, 1, 2])
    expect(result[1]?.reason).toBe('该英雄适配度排名第 8（共 100 项）')
    expect(result[1]?.pickRate).toBe(.27)
    expect(result[1]).toMatchObject({ statsSource: 'tencent', statsRegion: 'CN' })
  })

  it('marks equal rank data as tied and never invents a position for missing data', () => {
    const noGlobal = augments.map((item) => ({ ...item, globalTier: null }))
    const ranks = [
      { augmentId: 1, rank: 2, total: 50, tier: 1, pickRate: .1, statsSource: 'tencent', statsRegion: 'CN' },
      { augmentId: 2, rank: 2, total: 50, tier: 1, pickRate: .9, statsSource: 'tencent', statsRegion: 'CN' },
    ] as const
    const result = rankRecommendationSlots(
      slots,
      dtodoRecommendationDetail({ championId: 103, dataVersion: '16.15.6', ranks: [...ranks], builds: [] }),
      noGlobal,
      'dtodo',
    )
    expect(result[0]).toMatchObject({ position: 1, tied: true })
    expect(result[1]).toMatchObject({ position: 1, tied: true })
    expect(result[2]).toMatchObject({ position: null, reason: '暂无可靠的推荐依据' })
    expect(result.map((slot) => slot.position)).toEqual([1, 1, null])
  })

  it('orders Tencent cards by hero recommendation first, then global rank without using rates', () => {
    const detail: RecommendationDetail = {
      source: 'tencent101',
      championId: 1,
      snapshotId: 'snapshot',
      dataVersion: '20260814',
      statisticsDate: '20260814',
      ranks: [
        { augmentId: 1, heroRecommendationRank: null, heroRecommendationTotal: null, heroTier: null, championPickRate: null, globalPickRate: .99, globalWinRate: .9, globalPickRank: 2, globalWinRank: 1, globalPickRankChange: 0, globalWinRankChange: 0, statsSource: 'tencent', statsRegion: 'CN' },
        { augmentId: 2, heroRecommendationRank: 2, heroRecommendationTotal: 3, heroTier: null, championPickRate: null, globalPickRate: .01, globalWinRate: .1, globalPickRank: 80, globalWinRank: 80, globalPickRankChange: 0, globalWinRankChange: 0, statsSource: 'tencent', statsRegion: 'CN' },
        { augmentId: 3, heroRecommendationRank: 1, heroRecommendationTotal: 3, heroTier: null, championPickRate: null, globalPickRate: null, globalWinRate: null, globalPickRank: null, globalWinRank: null, globalPickRankChange: null, globalWinRankChange: null, statsSource: null, statsRegion: null },
      ],
    }
    const result = rankRecommendationSlots(slots, detail, augments, 'tencent101')
    expect(result.map((slot) => slot.position)).toEqual([3, 2, 1])
    expect(result[2]).toMatchObject({
      reason: '腾讯英雄推荐第 1',
      globalPickRate: null,
      metricScope: null,
      recommendationSource: 'tencent101',
      statisticsDate: '20260814',
    })
    expect(result[0]).toMatchObject({ reason: '腾讯全局排名第 2', globalPickRate: .99, globalWinRate: .9, metricScope: 'global' })
  })

  it('keeps Tencent global-rank ties and refuses to mix a detail from another provider', () => {
    const detail: RecommendationDetail = {
      source: 'tencent101', championId: 1, snapshotId: 'snapshot', dataVersion: '20260814', statisticsDate: '20260814',
      ranks: [1, 2].map((augmentId) => ({
        augmentId, heroRecommendationRank: null, heroRecommendationTotal: null, heroTier: null,
        championPickRate: null, globalPickRate: augmentId === 1 ? .1 : .9, globalWinRate: .5,
        globalPickRank: 4, globalWinRank: 5, globalPickRankChange: 0, globalWinRankChange: 0,
        statsSource: 'tencent' as const, statsRegion: 'CN' as const,
      })),
    }
    const tied = rankRecommendationSlots(slots, detail, augments.map((item) => ({ ...item, globalTier: null })), 'tencent101')
    expect(tied.map((slot) => slot.position)).toEqual([1, 1, null])
    expect(tied[0]?.tied).toBe(true)
    expect(tied[1]?.tied).toBe(true)

    const isolated = rankRecommendationSlots(slots, { ...detail, source: 'dtodo' }, augments.map((item) => ({ ...item, globalTier: null })), 'tencent101')
    expect(isolated.every((slot) => slot.position == null && slot.globalPickRate == null)).toBe(true)
  })
})
