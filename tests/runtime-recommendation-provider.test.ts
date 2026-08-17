import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {}, screen: {}, shell: {}, safeStorage: {}, BrowserWindow: class {}, desktopCapturer: {},
}))
vi.mock('../src/main/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), recent: () => [] },
}))
vi.mock('../src/main/config-store.js', () => ({ ConfigStore: class {} }))

import type { RecommendationDataSource, RecommendationDataState, RecommendationDetail } from '../src/shared/contracts.js'
import { HexBridgeRuntime } from '../src/main/runtime.js'
import { rankRecommendationSlots } from '../src/shared/recommendations.js'

const detail = (source: RecommendationDataSource, snapshotId: string): RecommendationDetail => ({
  source,
  championId: 103,
  snapshotId,
  dataVersion: snapshotId,
  statisticsDate: source === 'tencent101' ? '20260814' : '',
  ranks: [],
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

describe('Runtime recommendation provider guards', () => {
  it('does not cancel provider initialization when the current hero detail changes', async () => {
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    const pending = deferred<RecommendationDataState>()
    let providerSignal: AbortSignal | undefined
    runtime.config = { getSettings: () => ({ recommendationDataSource: 'tencent101' }) }
    runtime.snapshot = { modeActive: true, currentChampionId: 103, matchGeneration: 2 }
    runtime.championRequestSequence = 4
    runtime.recommendationProviderAbort = null
    runtime.recommendationDetailAbort = null
    runtime.recommendationDetail = null
    runtime.sync = vi.fn()
    runtime.recommendations = {
      initialize: vi.fn((_source, _force, signal) => {
        providerSignal = signal
        return pending.promise
      }),
      getState: () => ({
        source: 'tencent101', status: 'ready', snapshotId: 'tencent-v1', dataVersion: '20260814',
        statisticsDate: '20260814', stale: false, lastError: null,
      }),
      getChampionRecommendation: vi.fn(async () => detail('tencent101', 'tencent-v1')),
    }
    runtime.data = { getState: () => ({ configured: false, dataVersion: '' }) }

    const initializing = runtime.initializeRecommendationSource(false)
    await Promise.resolve()
    await runtime.refreshCurrentDetail(103, 4)

    expect(providerSignal?.aborted).toBe(false)
    pending.resolve({
      source: 'tencent101', status: 'ready', snapshotId: 'tencent-v1', dataVersion: '20260814',
      statisticsDate: '20260814', stale: false, lastError: null,
    })
    await initializing
  })

  it('drops a late detail after the user switches providers', async () => {
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    let source: RecommendationDataSource = 'dtodo'
    const pending = deferred<RecommendationDetail>()
    runtime.config = { getSettings: () => ({ recommendationDataSource: source }) }
    runtime.snapshot = { modeActive: true, currentChampionId: 103, matchGeneration: 1 }
    runtime.championRequestSequence = 1
    runtime.recommendationDetailAbort = null
    runtime.recommendationDetail = null
    runtime.sync = vi.fn()
    runtime.recommendations = {
      getState: (selected: RecommendationDataSource) => ({
        source: selected, status: 'ready', snapshotId: selected === 'dtodo' ? 'dtodo-v1' : 'tencent-v1',
        dataVersion: selected === 'dtodo' ? 'dtodo-v1' : '20260814', statisticsDate: selected === 'dtodo' ? '' : '20260814',
        stale: false, lastError: null,
      }),
      getChampionRecommendation: vi.fn(() => pending.promise),
    }
    runtime.data = {
      getState: () => ({ configured: false, dataVersion: '' }),
    }

    const operation = runtime.refreshCurrentDetail(103, 1)
    source = 'tencent101'
    runtime.championRequestSequence = 2
    pending.resolve(detail('dtodo', 'dtodo-v1'))
    await operation

    expect(runtime.recommendationDetail).toBeNull()
  })

  it('accepts Tencent recommendation data without a dtodo key when every context token still matches', async () => {
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.config = { getSettings: () => ({ recommendationDataSource: 'tencent101' }) }
    runtime.snapshot = { modeActive: true, currentChampionId: 103, matchGeneration: 4 }
    runtime.championRequestSequence = 9
    runtime.recommendationDetailAbort = null
    runtime.recommendationDetail = null
    runtime.sync = vi.fn()
    const recommendation = detail('tencent101', 'tencent-v1')
    runtime.recommendations = {
      getState: () => ({ source: 'tencent101', status: 'ready', snapshotId: 'tencent-v1', dataVersion: '20260814', statisticsDate: '20260814', stale: false, lastError: null }),
      getChampionRecommendation: vi.fn(async () => recommendation),
    }
    runtime.data = { getState: () => ({ configured: false, dataVersion: '' }) }

    await runtime.refreshCurrentDetail(103, 9)

    expect(runtime.recommendationDetail).toEqual(recommendation)
    expect(runtime.detail).toBeUndefined()
  })

  it('re-ranks an already visible live OCR surface when hero detail arrives', async () => {
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    const augments = [1, 2, 3].map((id) => ({
      id,
      name: `强化${id}`,
      iconUrl: `https://example.test/${id}.png`,
      rarity: 1,
      rarityName: '金色',
      description: '',
      globalTier: id,
    }))
    const slotNames = ['left', 'center', 'right'] as const
    const recognized = [1, 2, 3].map((id, index) => ({
      slot: slotNames[index]!,
      rawText: `强化${id}`,
      augmentId: id,
      name: `强化${id}`,
      confidence: 1,
    }))
    const initialSlots = rankRecommendationSlots(recognized, null, augments, 'tencent101')
    const recommendation: RecommendationDetail = {
      ...detail('tencent101', 'tencent-v1'),
      dataVersion: '20260814',
      ranks: [
        {
          augmentId: 2,
          heroRecommendationRank: 2,
          heroRecommendationTotal: 2,
          heroRecommendationBasis: 'lowest_rank_runes',
          heroTier: null,
          championPickRate: null,
          globalPickRate: .2,
          globalWinRate: .5,
          globalPickRank: 30,
          globalWinRank: 20,
          globalPickRankChange: 0,
          globalWinRankChange: 0,
          statsSource: 'tencent',
          statsRegion: 'CN',
        },
        {
          augmentId: 3,
          heroRecommendationRank: 1,
          heroRecommendationTotal: 2,
          heroRecommendationBasis: 'lowest_rank_runes',
          heroTier: null,
          championPickRate: null,
          globalPickRate: .1,
          globalWinRate: .6,
          globalPickRank: 40,
          globalWinRank: 10,
          globalPickRankChange: 0,
          globalWinRankChange: 0,
          statsSource: 'tencent',
          statsRegion: 'CN',
        },
        {
          augmentId: 1,
          heroRecommendationRank: null,
          heroRecommendationTotal: null,
          heroRecommendationBasis: null,
          heroTier: null,
          championPickRate: null,
          globalPickRate: .9,
          globalWinRate: .4,
          globalPickRank: 3,
          globalWinRank: 30,
          globalPickRankChange: 0,
          globalWinRankChange: 0,
          statsSource: 'tencent',
          statsRegion: 'CN',
        },
      ],
    }
    runtime.config = { getSettings: () => ({ recommendationDataSource: 'tencent101' }) }
    runtime.snapshot = { modeActive: true, currentChampionId: 103, matchGeneration: 7 }
    runtime.championRequestSequence = 12
    runtime.recommendationDetailAbort = null
    runtime.recommendationDetail = null
    runtime.overlay = {
      visible: true,
      championId: 103,
      slots: initialSlots,
      detectedAt: 1,
      message: '暂无可靠数据',
    }
    runtime.sync = vi.fn()
    runtime.getRecommendationAugments = () => augments
    runtime.recommendations = {
      getState: () => ({
        source: 'tencent101', status: 'ready', snapshotId: 'tencent-v1', dataVersion: '20260814',
        statisticsDate: '20260814', stale: false, lastError: null,
      }),
      getChampionRecommendation: vi.fn(async () => recommendation),
    }
    runtime.data = { getState: () => ({ configured: false, dataVersion: '' }) }

    await runtime.refreshCurrentDetail(103, 12)

    expect(runtime.recommendationDetail).toEqual(recommendation)
    expect(runtime.overlay.slots.map((slot: any) => slot.position)).toEqual([null, 2, 1])
    expect(runtime.overlay.slots.map((slot: any) => slot.reason)).toEqual([
      '腾讯数据站暂无该英雄专属推荐依据',
      '腾讯英雄推荐第 2',
      '腾讯英雄推荐第 1',
    ])
    expect(runtime.overlay.message).toBe('推荐已更新')
    expect(runtime.sync).toHaveBeenCalled()
  })

  it('drops the previous generation even when the next game has the same hero and source', async () => {
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    const pending = deferred<RecommendationDetail>()
    runtime.config = { getSettings: () => ({ recommendationDataSource: 'tencent101' }) }
    runtime.snapshot = { modeActive: true, currentChampionId: 103, matchGeneration: 4 }
    runtime.championRequestSequence = 3
    runtime.recommendationDetailAbort = null
    runtime.recommendationDetail = null
    runtime.sync = vi.fn()
    runtime.recommendations = {
      getState: () => ({ source: 'tencent101', status: 'ready', snapshotId: 'tencent-v1', dataVersion: '20260814', statisticsDate: '20260814', stale: false, lastError: null }),
      getChampionRecommendation: vi.fn(() => pending.promise),
    }
    runtime.data = { getState: () => ({ configured: false, dataVersion: '' }) }

    const operation = runtime.refreshCurrentDetail(103, 3)
    runtime.snapshot = { ...runtime.snapshot, matchGeneration: 5 }
    runtime.championRequestSequence = 4
    pending.resolve(detail('tencent101', 'tencent-v1'))
    await operation

    expect(runtime.recommendationDetail).toBeNull()
  })

  it('does not let an old source-switch continuation cancel the next hero request', async () => {
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    const initialization = deferred<void>()
    runtime.config = { getSettings: () => ({ recommendationDataSource: 'tencent101' }) }
    runtime.snapshot = { modeActive: true, currentChampionId: 103, matchGeneration: 1 }
    runtime.championRequestSequence = 0
    runtime.recommendationProviderAbort = null
    runtime.recommendationDetailAbort = null
    runtime.browseRecommendationAbort = null
    runtime.browseRecommendationSequence = 0
    runtime.recommendationDetail = null
    runtime.overlay = { visible: false, championId: null, slots: [], message: '' }
    runtime.setManualOverlayMonitorDeadline = vi.fn()
    runtime.getAugmentRound = () => ({ reset: vi.fn() })
    runtime.stopScanLoop = vi.fn()
    runtime.updateScanLoop = vi.fn()
    runtime.sync = vi.fn()
    runtime.initializeRecommendationSource = vi.fn(() => initialization.promise)
    runtime.refreshCurrentDetail = vi.fn()

    runtime.switchRecommendationSource('tencent101')
    expect(runtime.championRequestSequence).toBe(1)
    runtime.snapshot = { modeActive: true, currentChampionId: 81, matchGeneration: 2 }
    runtime.championRequestSequence = 2
    initialization.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(runtime.refreshCurrentDetail).not.toHaveBeenCalled()
  })

  it('publishes Tencent recommendations without waiting for independent dtodo build data', async () => {
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    const pendingBuild = deferred<{ championId: number; dataVersion: string; ranks: never[]; builds: never[] }>()
    runtime.config = { getSettings: () => ({ recommendationDataSource: 'tencent101' }) }
    runtime.snapshot = { modeActive: true, currentChampionId: 103, matchGeneration: 4 }
    runtime.championRequestSequence = 9
    runtime.recommendationDetailAbort = null
    runtime.recommendationDetail = null
    runtime.detail = null
    runtime.sync = vi.fn()
    const recommendation = detail('tencent101', 'tencent-v1')
    runtime.recommendations = {
      getState: () => ({ source: 'tencent101', status: 'ready', snapshotId: 'tencent-v1', dataVersion: '20260814', statisticsDate: '20260814', stale: false, lastError: null }),
      getChampionRecommendation: vi.fn(async () => recommendation),
    }
    runtime.data = {
      getState: () => ({ configured: true, dataVersion: 'dtodo-v1' }),
      getChampionAugments: vi.fn(() => pendingBuild.promise),
    }

    const operation = runtime.refreshCurrentDetail(103, 9)
    await vi.waitFor(() => expect(runtime.recommendationDetail).toEqual(recommendation))
    expect(runtime.detail).toBeNull()

    pendingBuild.resolve({ championId: 103, dataVersion: 'dtodo-v1', ranks: [], builds: [] })
    await operation
    expect(runtime.detail).toMatchObject({ championId: 103, dataVersion: 'dtodo-v1' })
  })

  it('rejects a stale detail request before aborting the current hero request', async () => {
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    const current = new AbortController()
    runtime.config = { getSettings: () => ({ recommendationDataSource: 'tencent101' }) }
    runtime.snapshot = { modeActive: true, currentChampionId: 81, matchGeneration: 5 }
    runtime.championRequestSequence = 10
    runtime.recommendationDetailAbort = current
    runtime.recommendations = { getChampionRecommendation: vi.fn() }

    await runtime.refreshCurrentDetail(103, 9)

    expect(current.signal.aborted).toBe(false)
    expect(runtime.recommendations.getChampionRecommendation).not.toHaveBeenCalled()
  })

  it('does not resume an old manual refresh after the hero or generation changes', async () => {
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    const providerRefresh = deferred<void>()
    const dataRefresh = deferred<void>()
    runtime.config = { getSettings: () => ({ recommendationDataSource: 'tencent101' }) }
    runtime.snapshot = { modeActive: true, currentChampionId: 103, matchGeneration: 4 }
    runtime.championRequestSequence = 3
    runtime.recommendationProviderAbort = null
    runtime.recommendationDetailAbort = null
    runtime.recommendationDetail = null
    runtime.overlay = { visible: false, championId: null, slots: [], message: '' }
    runtime.setManualOverlayMonitorDeadline = vi.fn()
    runtime.getAugmentRound = () => ({ reset: vi.fn() })
    runtime.stopScanLoop = vi.fn()
    runtime.updateScanLoop = vi.fn()
    runtime.sync = vi.fn()
    runtime.data = { initialize: vi.fn(() => dataRefresh.promise) }
    runtime.initializeRecommendationSource = vi.fn(() => providerRefresh.promise)
    runtime.refreshCurrentDetail = vi.fn()
    runtime.getRecommendationState = () => ({
      source: 'tencent101', status: 'ready', snapshotId: 'tencent-v1', dataVersion: '20260814',
      statisticsDate: '20260814', stale: false, lastError: null,
    })

    const operation = runtime.refreshData()
    runtime.snapshot = { modeActive: true, currentChampionId: 81, matchGeneration: 5 }
    runtime.championRequestSequence += 1
    providerRefresh.resolve()
    dataRefresh.resolve()
    await expect(operation).resolves.toMatchObject({ ok: false })

    expect(runtime.refreshCurrentDetail).not.toHaveBeenCalled()
  })

  it('drops a browsed hero view when the statistics date changes before Main commits it', async () => {
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    const pending = deferred<any>()
    let state: RecommendationDataState = {
      source: 'tencent101', status: 'ready', snapshotId: 'tencent-v1', dataVersion: '20260814',
      statisticsDate: '20260814', stale: false, lastError: null,
    }
    runtime.config = { getSettings: () => ({ recommendationDataSource: 'tencent101' }) }
    runtime.browseRecommendationAbort = null
    runtime.browseRecommendationSequence = 0
    runtime.recommendations = {
      getState: () => ({ ...state }),
      getChampions: () => [{ id: 103 }],
      getChampionView: vi.fn(() => pending.promise),
    }
    runtime.data = {
      getState: () => ({ configured: false, dataVersion: '', status: 'missing' }),
    }

    const operation = runtime.getChampionRecommendation(103)
    state = { ...state, dataVersion: '20260815', statisticsDate: '20260815' }
    pending.resolve({
      source: 'tencent101', championId: 103, snapshotId: 'tencent-v1', dataVersion: '20260814',
      statisticsDate: '20260814', stale: false, cards: [], message: '旧结果',
    })

    await expect(operation).resolves.toMatchObject({ ok: false, detail: null })
  })

  it('broadcasts a provider state change when a browsed hero request is rejected', async () => {
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    let state: RecommendationDataState = {
      source: 'dtodo', status: 'ready', snapshotId: '16.15.6', dataVersion: '16.15.6',
      statisticsDate: '2026-08-15', stale: false, lastError: null,
    }
    runtime.config = { getSettings: () => ({ recommendationDataSource: 'dtodo' }) }
    runtime.browseRecommendationAbort = null
    runtime.browseRecommendationSequence = 0
    runtime.sync = vi.fn()
    runtime.recommendations = {
      getState: () => ({ ...state }),
      getChampions: () => [{ id: 103 }],
      getChampionView: vi.fn(async () => {
        state = { ...state, status: 'unauthorized', lastError: 'API Key 无效或已失效' }
        throw new Error('上游返回 HTTP 401')
      }),
    }
    runtime.data = {
      getState: () => ({ configured: false, dataVersion: '', status: 'missing' }),
    }

    await expect(runtime.getChampionRecommendation(103)).resolves.toMatchObject({
      ok: false,
      detail: null,
    })
    expect(runtime.sync).toHaveBeenCalledOnce()
    expect(state.status).toBe('unauthorized')
  })

  it('loads a selected hero build through the independent dtodo module', async () => {
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.data = {
      getState: () => ({ configured: true, dataVersion: '16.16.1', status: 'ready' }),
      getChampionAugments: vi.fn(async () => ({ builds: [{ label: '标准', patch: '16.16', source: 'iesdev', startingItems: [], coreItems: [], situationalItems: [] }] })),
    }

    await expect(runtime.getChampionBuild(103)).resolves.toMatchObject({
      ok: true,
      message: '出装推荐已读取',
      build: { label: '标准', source: 'iesdev' },
    })
    expect(runtime.data.getChampionAugments).toHaveBeenCalledWith(103)
  })

  it('does not make the independent build module block when no key is configured', async () => {
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.data = { getState: () => ({ configured: false, dataVersion: '', status: 'missing' }) }
    await expect(runtime.getChampionBuild(103)).resolves.toEqual({
      ok: false,
      message: '出装仍需单独配置 data.dtodo API Key',
      build: null,
    })
  })
})
