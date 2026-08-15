import { describe, expect, it, vi } from 'vitest'
import type { AugmentMeta, ChampionAugmentData, ChampionSummary, RecommendationDataState, RecommendationDetail } from '../src/shared/contracts.js'
import { RecommendationCoordinator } from '../src/main/recommendation-coordinator.js'
import type { DataService } from '../src/main/data-service.js'
import type { Tencent101Adapter } from '../src/main/tencent101-adapter.js'

const champions: ChampionSummary[] = [{
  id: 1, alias: 'Hero1', name: '英雄1', title: '称号1', roles: [], iconUrl: '', splashUrl: '',
  tier: 1, winRate: .5, championPickRate: .22, patch: '16.16', date: '2026-08-14', source: 'fixture',
}]
const augments: AugmentMeta[] = [1, 2].map((id) => ({
  id, name: `强化${id}`, iconUrl: `https://game.gtimg.cn/${id}.png`, rarity: 2,
  rarityName: '黄金', description: '', globalTier: id,
}))

const dtodoDetail: ChampionAugmentData = {
  championId: 1,
  dataVersion: '16.16.1',
  ranks: [{ augmentId: 1, rank: 1, total: 100, tier: 1, pickRate: .25, statsSource: 'iesdev', statsRegion: 'WORLD' }],
  builds: [],
}

const tencentDetail: RecommendationDetail = {
  source: 'tencent101', championId: 1, snapshotId: 'tencent-snapshot', dataVersion: '20260814', statisticsDate: '20260814',
  ranks: [
    { augmentId: 2, heroRecommendationRank: 1, heroRecommendationTotal: 1, heroTier: null, championPickRate: null, globalPickRate: .3, globalWinRate: .6, globalPickRank: 9, globalWinRank: 3, globalPickRankChange: 1, globalWinRankChange: -1, statsSource: 'tencent', statsRegion: 'CN' },
    { augmentId: 1, heroRecommendationRank: null, heroRecommendationTotal: 1, heroTier: null, championPickRate: null, globalPickRate: .8, globalWinRate: .4, globalPickRank: 1, globalWinRank: 20, globalPickRankChange: 0, globalWinRankChange: 0, statsSource: 'tencent', statsRegion: 'CN' },
  ],
}

function fixtureCoordinator(options: { getTencentDetail?: () => RecommendationDetail | Promise<RecommendationDetail> } = {}) {
  const dtodo = {
    getState: () => ({ configured: true, status: 'ready', gamePatch: '16.16', dataVersion: '16.16.1', publishedAt: '2026-08-14', lastError: null }),
    getChampions: () => champions,
    getAugments: () => augments,
    initialize: vi.fn(async () => undefined),
    getChampionAugments: vi.fn(async () => dtodoDetail),
  } as unknown as DataService
  const tencentState: RecommendationDataState = {
    source: 'tencent101', status: 'ready', snapshotId: 'tencent-snapshot', dataVersion: '20260814',
    statisticsDate: '20260814', stale: false, lastError: null,
  }
  const tencent = {
    getState: vi.fn(() => ({ ...tencentState })),
    getChampions: () => champions.map((entry) => ({ ...entry, source: 'tencent101' })),
    getAugments: () => augments,
    initialize: vi.fn(async () => ({ ...tencentState })),
    getChampionRecommendation: vi.fn(options.getTencentDetail ?? (() => tencentDetail)),
  } as unknown as Tencent101Adapter
  return { coordinator: new RecommendationCoordinator(dtodo, tencent), dtodo, tencent, tencentState }
}

describe('RecommendationCoordinator source isolation', () => {
  it('returns provider-specific views without borrowing ranks or metrics from the other source', async () => {
    const { coordinator, dtodo, tencent } = fixtureCoordinator()
    const dtodoView = await coordinator.getChampionView('dtodo', 1)
    const tencentView = await coordinator.getChampionView('tencent101', 1)

    expect(dtodoView).toMatchObject({ source: 'dtodo', snapshotId: '16.16.1' })
    expect(dtodoView.cards).toHaveLength(1)
    expect(dtodoView.cards[0]).toMatchObject({ augmentId: 1, recommendationRank: 1, globalPickRate: null })
    expect(tencentView).toMatchObject({ source: 'tencent101', snapshotId: 'tencent-snapshot', statisticsDate: '20260814' })
    expect(tencentView.cards).toHaveLength(1)
    expect(tencentView.cards[0]).toMatchObject({ augmentId: 2, recommendationRank: 1, globalPickRate: .3, globalWinRate: .6 })
    expect(dtodo.getChampionAugments).toHaveBeenCalledTimes(1)
    expect(tencent.getChampionRecommendation).toHaveBeenCalledTimes(1)
  })

  it('preserves the selected provider champion pick rate in the public catalog', () => {
    const { coordinator } = fixtureCoordinator()
    expect(coordinator.getChampions('tencent101')[0]?.championPickRate).toBe(.22)
  })

  it('drops a late hero result when the provider snapshot changes', async () => {
    let resolveDetail!: (detail: RecommendationDetail) => void
    const deferred = new Promise<RecommendationDetail>((resolve) => { resolveDetail = resolve })
    const { coordinator, tencent, tencentState } = fixtureCoordinator({ getTencentDetail: () => deferred })
    const operation = coordinator.getChampionView('tencent101', 1)
    tencentState.snapshotId = 'new-snapshot'
    vi.mocked(tencent.getState).mockImplementation(() => ({ ...tencentState }))
    resolveDetail(tencentDetail)
    await expect(operation).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('drops a late hero result when the provider date changes under the same snapshot token', async () => {
    let resolveDetail!: (detail: RecommendationDetail) => void
    const deferred = new Promise<RecommendationDetail>((resolve) => { resolveDetail = resolve })
    const { coordinator, tencent, tencentState } = fixtureCoordinator({ getTencentDetail: () => deferred })
    const operation = coordinator.getChampionView('tencent101', 1)
    tencentState.statisticsDate = '20260815'
    tencentState.dataVersion = '20260815'
    vi.mocked(tencent.getState).mockImplementation(() => ({ ...tencentState }))
    resolveDetail(tencentDetail)
    await expect(operation).rejects.toMatchObject({ name: 'AbortError' })
  })
})
