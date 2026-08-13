import { describe, expect, it, vi } from 'vitest'
import type { ChampionAugmentData, LcuConnectionState } from '../src/shared/contracts.js'

vi.mock('electron', () => ({
  app: {},
  screen: {},
  shell: {},
  safeStorage: {},
  BrowserWindow: class {},
  desktopCapturer: {},
}))

vi.mock('../src/main/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), recent: () => [] },
}))

vi.mock('../src/main/config-store.js', () => ({
  ConfigStore: class {},
}))

import { applyLcuPollResults } from '../src/main/lcu/client.js'
import { MatchContextTracker, normalizeChampSelectSnapshot } from '../src/main/lcu/normalize.js'
import { HexBridgeRuntime } from '../src/main/runtime.js'
import { shouldShowChampionCompanion } from '../src/main/runtime-guards.js'
import { buildChampionCandidates } from '../src/shared/recommendations.js'

const connected: LcuConnectionState = {
  connected: true,
  source: 'process',
  lastError: null,
  lastConnectedAt: 1_000,
}

const detached: LcuConnectionState = {
  connected: false,
  source: null,
  lastError: 'LCU transport handed off',
  lastConnectedAt: 1_000,
}

describe('LCU handoff through runtime state', () => {
  it('renders a fresh partial ChampSelect observation instead of dropping successful fields', async () => {
    const tracker = new MatchContextTracker()
    const auxiliary = await Promise.allSettled([
      Promise.resolve({ queueId: 2400 }),
      Promise.reject(new Error('champ-select session timed out')),
      Promise.resolve(103),
      Promise.resolve({ locale: 'zh_CN' }),
      Promise.resolve(null),
    ])
    const observed = applyLcuPollResults(
      tracker,
      normalizeChampSelectSnapshot({
        phase: 'None', gameflowSession: null, champSelectSession: null, currentChampionId: null,
      }),
      'ChampSelect',
      auxiliary,
      1_000,
    ).snapshot
    const candidates = buildChampionCandidates(observed, [{
      id: 103,
      alias: 'Ahri',
      name: '阿狸',
      title: '',
      roles: ['法师'],
      iconUrl: '',
      splashUrl: '',
      tier: 1,
      winRate: 0.53,
      patch: '16.15',
      date: '',
      source: 'fixture',
    }])

    expect(observed).toMatchObject({ modeActive: true, matchStage: 'selecting', currentChampionId: 103 })
    expect(candidates).toEqual([expect.objectContaining({ id: 103, isCurrent: true })])
    expect(shouldShowChampionCompanion({ showChampionPanel: true }, observed)).toBe(true)
  })

  it('retains detail, overlay, and OCR eligibility until a real new champion replaces the match', async () => {
    const tracker = new MatchContextTracker()
    const selected = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect',
      gameflowSession: { queueId: 2400, gameData: { gameId: 7001 } },
      champSelectSession: { gameId: 7001 },
      currentChampionId: 103,
    }), 1_000, { destructive: true, champSelectSession: 'ok', matchIdentity: 'game:7001' })

    const detail: ChampionAugmentData = {
      championId: 103,
      dataVersion: '16.15.6',
      ranks: [{ augmentId: 1, rank: 1, total: 100, tier: 1 }],
    }
    const overlay = {
      visible: true,
      championId: 103,
      slots: [],
      detectedAt: 1_000,
      message: '已保留的推荐',
    }
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = selected
    runtime.lcuState = connected
    runtime.detail = detail
    runtime.overlay = overlay
    runtime.championRequestSequence = 7
    runtime.dataReady = false
    runtime.scanMisses = 0
    runtime.lastCombination = '1:2:3'
    runtime.updateScanLoop = vi.fn()
    runtime.updateGameProcessLoop = vi.fn()
    runtime.sync = vi.fn()

    const launching = tracker.transportDisconnected(selected, 2_000)
    runtime.handleLcuUpdate(launching, detached)
    expect(runtime.snapshot).toMatchObject({
      currentChampionId: 103,
      matchStage: 'launching',
      matchGeneration: 1,
    })
    expect(runtime.detail).toBe(detail)
    expect(runtime.overlay).toBe(overlay)
    expect(runtime.championRequestSequence).toBe(7)

    const outgoingEndpointsGone = await Promise.allSettled([
      Promise.resolve({ queueId: 2400, gameData: { gameId: 7001 } }),
      Promise.resolve(null),
      Promise.resolve(null),
      Promise.resolve({ locale: 'zh_CN' }),
    ])
    const outgoing = applyLcuPollResults(
      tracker,
      launching,
      'ChampSelect',
      outgoingEndpointsGone,
      3_000,
    ).snapshot
    runtime.handleLcuUpdate(outgoing, connected)
    expect(runtime.snapshot.currentChampionId).toBe(103)
    expect(runtime.detail).toBe(detail)
    expect(runtime.overlay).toBe(overlay)
    expect(runtime.championRequestSequence).toBe(7)

    const partialInProgress = await Promise.allSettled([
      Promise.reject(new Error('gameflow session disappeared during handoff')),
      Promise.resolve(null),
      Promise.resolve(null),
      Promise.resolve({ locale: 'zh_CN' }),
    ])
    const active = applyLcuPollResults(
      tracker,
      outgoing,
      'InProgress',
      partialInProgress,
      4_000,
    ).snapshot
    const activeAfterTransportLoss = tracker.transportDisconnected(active, 4_100)
    runtime.handleLcuUpdate(activeAfterTransportLoss, detached)
    expect(runtime.snapshot).toMatchObject({
      currentChampionId: 103,
      matchStage: 'active',
      matchGeneration: 1,
    })
    expect(runtime.detail).toBe(detail)
    expect(runtime.overlay).toBe(overlay)
    expect(runtime.championRequestSequence).toBe(7)
    expect(runtime.updateScanLoop).toHaveBeenCalledTimes(3)

    const nextChampion = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect',
      gameflowSession: { queueId: 2400, gameData: { gameId: 7002 } },
      champSelectSession: { gameId: 7002 },
      currentChampionId: 81,
    }), 5_000, { destructive: true, champSelectSession: 'ok', matchIdentity: 'game:7002' })
    runtime.handleLcuUpdate(nextChampion, connected)
    expect(runtime.snapshot).toMatchObject({
      currentChampionId: 81,
      matchStage: 'selecting',
      matchGeneration: 2,
    })
    expect(runtime.detail).toBeNull()
    expect(runtime.overlay).toMatchObject({ visible: false, championId: 81 })
    expect(runtime.championRequestSequence).toBe(8)
  })
})
