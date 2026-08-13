import { describe, expect, it, vi } from 'vitest'
import type {
  ChampionAugmentData,
  ChampSelectSnapshot,
  LcuConnectionState,
} from '../src/shared/contracts.js'
import type { LcuCredentials, LcuDiscoveryResult } from '../src/main/lcu/discovery.js'

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

vi.mock('../src/main/config-store.js', () => ({ ConfigStore: class {} }))

import {
  LcuClient,
  selectReachableLcuCredentials,
  shouldSwitchLcuCredential,
} from '../src/main/lcu/client.js'
import { MatchContextTracker, normalizeChampSelectSnapshot } from '../src/main/lcu/normalize.js'
import { HexBridgeRuntime } from '../src/main/runtime.js'
import { isMatchContextOcrEligible } from '../src/main/runtime-guards.js'
import { isAramMayhemQueueId } from '../src/shared/mayhem-queues.js'

const credentials: LcuCredentials = {
  port: 58120,
  token: 'cn-wegame-fixture',
  source: 'process',
  executablePath: 'LeagueClientUx.exe',
  processId: 101,
  processStartedAt: '2026-08-13T04:00:00.000Z',
}

const discovery = (): LcuDiscoveryResult => ({
  candidates: [credentials],
  summary: '1 candidate',
  processCount: 1,
  manualConfigured: false,
  processStrategies: { cim: 'ok', 'get-process': 'ok' },
})

const emptySnapshot = (): ChampSelectSnapshot => ({
  phase: 'None',
  locale: 'zh_CN',
  queueId: null,
  modeActive: false,
  matchStage: 'none',
  matchGeneration: 0,
  currentChampionId: null,
  benchChampionIds: [],
  benchEnabled: false,
  updatedAt: 0,
})

const emptyConnection = (): LcuConnectionState => ({
  connected: false,
  source: null,
  lastError: null,
  lastConnectedAt: null,
})

describe('CN/WeGame queue 3270 hand-off regression', () => {
  it('recognizes both published and observed Mayhem queue identifiers only', () => {
    expect(isAramMayhemQueueId(2400)).toBe(true)
    expect(isAramMayhemQueueId(3270)).toBe(true)
    expect(isAramMayhemQueueId(450)).toBe(false)
    expect(isAramMayhemQueueId(null)).toBe(false)
  })

  it('uses the local player action when it appears before myTeam/current-champion', () => {
    const snapshot = normalizeChampSelectSnapshot({
      phase: 'ChampSelect',
      gameflowSession: { queueId: 3270 },
      champSelectSession: {
        localPlayerCellId: 4,
        myTeam: [{ cellId: 4, championId: 0, championPickIntent: 0 }],
        actions: [[{ actorCellId: 4, championId: 115, type: 'pick' }]],
      },
      currentChampionId: null,
    })
    expect(snapshot).toMatchObject({
      queueId: 3270,
      modeActive: true,
      currentChampionId: 115,
    })
  })

  it('uses only the newest local pick action and never resurrects an old pick', () => {
    const normalizeActions = (actions: unknown[][], championPickIntent = 0) =>
      normalizeChampSelectSnapshot({
        phase: 'ChampSelect',
        gameflowSession: { queueId: 3270 },
        champSelectSession: {
          localPlayerCellId: 4,
          myTeam: [{ cellId: 4, championId: 0, championPickIntent }],
          actions,
        },
        currentChampionId: null,
      }).currentChampionId

    expect(normalizeActions([
      [{ actorCellId: 4, championId: 81, type: 'pick' }],
      [{ actorCellId: 4, championId: 115, type: 'pick' }],
    ])).toBe(115)
    expect(normalizeActions([
      [{ actorCellId: 4, championId: 81, type: 'pick' }],
      [{ actorCellId: 4, championId: 0, type: 'pick' }],
    ], 81)).toBeNull()
    expect(normalizeActions([
      [{ actorCellId: 4, championId: 115, type: 'pick' }],
      [{ actorCellId: 4, championId: 81, type: 'ban' }],
    ])).toBe(115)

    const authoritative = normalizeChampSelectSnapshot({
      phase: 'ChampSelect',
      gameflowSession: { queueId: 3270 },
      champSelectSession: {
        localPlayerCellId: 4,
        myTeam: [{ cellId: 4, championId: 103 }],
        actions: [[{ actorCellId: 4, championId: 115, type: 'pick' }]],
      },
      currentChampionId: 81,
    })
    expect(authoritative.currentChampionId).toBe(81)

    const teamBeforeAction = normalizeChampSelectSnapshot({
      phase: 'ChampSelect',
      gameflowSession: { queueId: 3270 },
      champSelectSession: {
        localPlayerCellId: 4,
        myTeam: [{ cellId: 4, championId: 103 }],
        actions: [[{ actorCellId: 4, championId: 115, type: 'pick' }]],
      },
      currentChampionId: null,
    })
    expect(teamBeforeAction.currentChampionId).toBe(103)
  })

  it('prefers live queue 3270 ChampSelect evidence over an unrelated process candidate', async () => {
    const unrelated = { ...credentials, token: 'unrelated', source: 'process' as const }
    const live = { ...credentials, port: 58121, token: 'live-3270', source: 'log' as const }
    const selection = await selectReachableLcuCredentials([unrelated, live], async (candidate) =>
      candidate.token === 'unrelated'
        ? { rawPhase: 'Lobby', phase: 'Lobby', queueId: 450, currentChampionId: null }
        : { rawPhase: 'ChampSelect', phase: 'ChampSelect', queueId: 3270, currentChampionId: 115 },
    )
    expect(selection.credentials).toBe(live)
    expect(shouldSwitchLcuCredential(unrelated, selection.credentials, selection.probe)).toBe(true)
  })

  it('retains the selected hero and Runtime detail when the game process takes over', async () => {
    let phase: 'ChampSelect' | 'Lobby' | 'InProgress' | 'EndOfGame' = 'ChampSelect'
    let selectionReady = false
    const client = new LcuClient(() => '', {
      disableWebSocket: true,
      discover: async () => discovery(),
      request: async (endpoint) => {
        if (endpoint === '/lol-gameflow/v1/gameflow-phase') return phase
        if (endpoint === '/lol-gameflow/v1/session') {
          return {
            gameData: { queue: { id: 3270 }, gameId: 3270001 },
            gameClient: { running: phase === 'InProgress' },
          }
        }
        if (endpoint === '/lol-champ-select/v1/session' && phase === 'ChampSelect') {
          return {
            gameId: 3270001,
            localPlayerCellId: 4,
            myTeam: [{ cellId: 4, championId: 0 }],
            actions: selectionReady
              ? [[{ actorCellId: 4, championId: 115, type: 'pick' }]]
              : [[]],
            benchChampionIds: [81, 103],
          }
        }
        if (endpoint === '/lol-champ-select/v1/current-champion') return null
        if (endpoint === '/riotclient/region-locale') return { locale: 'zh_CN' }
        if (endpoint === '/lol-lobby/v2/lobby') return { gameConfig: { queueId: 3270 } }
        return null
      },
    })

    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = emptySnapshot()
    runtime.lcuState = emptyConnection()
    runtime.detail = null
    runtime.overlay = { visible: false, championId: null, slots: [], detectedAt: null, message: '' }
    runtime.championRequestSequence = 0
    runtime.dataReady = false
    runtime.scanMisses = 0
    runtime.lastCombination = ''
    runtime.updateScanLoop = vi.fn()
    runtime.updateGameProcessLoop = vi.fn()
    runtime.sync = vi.fn()
    client.on('update', (snapshot, state) => runtime.handleLcuUpdate(snapshot, state))

    await client.pollOnce()
    expect(runtime.snapshot).toMatchObject({
      queueId: 3270,
      modeActive: true,
      currentChampionId: null,
      matchStage: 'none',
      matchGeneration: 0,
    })

    selectionReady = true
    await client.pollOnce()
    expect(runtime.snapshot).toMatchObject({
      queueId: 3270,
      modeActive: true,
      currentChampionId: 115,
      matchStage: 'selecting',
      matchGeneration: 1,
    })

    const detail: ChampionAugmentData = {
      championId: 115,
      dataVersion: '16.15.6',
      ranks: [{ augmentId: 1, rank: 1, tier: 1, total: 100 }],
    }
    runtime.detail = detail
    runtime.overlay = {
      visible: true,
      championId: 115,
      slots: [],
      detectedAt: 1,
      message: 'retained',
    }
    runtime.championRequestSequence = 7

    // Real CN/WeGame hand-off: LeagueClientUx can remain reachable while its
    // gameflow briefly returns Lobby before the separate game process appears.
    phase = 'Lobby'
    await client.pollOnce()
    expect(runtime.snapshot).toMatchObject({
      queueId: 3270,
      modeActive: true,
      currentChampionId: 115,
      matchStage: 'launching',
      matchGeneration: 1,
    })
    expect(runtime.detail).toBe(detail)
    expect(runtime.championRequestSequence).toBe(7)

    phase = 'InProgress'
    await client.pollOnce()
    expect(runtime.snapshot).toMatchObject({
      queueId: 3270,
      modeActive: true,
      currentChampionId: 115,
      matchStage: 'active',
      matchGeneration: 1,
    })
    expect(isMatchContextOcrEligible(runtime.snapshot)).toBe(true)
    expect(runtime.detail).toBe(detail)
    expect(runtime.overlay).toMatchObject({ championId: 115, message: 'retained' })
    expect(runtime.championRequestSequence).toBe(7)

    phase = 'EndOfGame'
    await client.pollOnce()
    expect(runtime.snapshot).toMatchObject({
      currentChampionId: null,
      matchStage: 'none',
      modeActive: true,
    })
    expect(runtime.detail).toBeNull()
    expect(runtime.championRequestSequence).toBe(8)
    client.stop()
  })

  it('shows an ordinary inactive message for unreachable historical candidates', async () => {
    const client = new LcuClient(() => '', {
      disableWebSocket: true,
      discover: async () => ({
        ...discovery(),
        processCount: 0,
        candidates: [{ ...credentials, source: 'log', processId: null, processStartedAt: null }],
      }),
      request: async () => { throw new Error('ECONNREFUSED') },
    })
    await client.pollOnce()
    expect(client.getState()).toMatchObject({
      connected: false,
      source: null,
      lastError: '英雄联盟客户端未启动或尚未发现',
    })
    client.stop()
  })

  it('coalesces an in-flight WAMP notification into exactly one trailing poll', async () => {
    let phaseReads = 0
    let blockNextPhase = false
    let enteredBlockedRead!: () => void
    let releaseBlockedRead!: () => void
    const blockedReadEntered = new Promise<void>((resolve) => { enteredBlockedRead = resolve })
    const release = new Promise<void>((resolve) => { releaseBlockedRead = resolve })
    const client = new LcuClient(() => '', {
      disableWebSocket: true,
      discover: async () => discovery(),
      request: async (endpoint) => {
        if (endpoint === '/lol-gameflow/v1/gameflow-phase') {
          phaseReads += 1
          if (blockNextPhase) {
            blockNextPhase = false
            enteredBlockedRead()
            await release
          }
          return 'Lobby'
        }
        if (endpoint === '/lol-gameflow/v1/session') return { queueId: 450 }
        if (endpoint === '/riotclient/region-locale') return { locale: 'zh_CN' }
        return null
      },
    })

    await client.pollOnce()
    phaseReads = 0
    blockNextPhase = true
    const internal = client as unknown as {
      tick(trigger: 'timer' | 'event' | 'manual'): Promise<void>
    }
    const polling = internal.tick('timer')
    await blockedReadEntered
    void internal.tick('event')
    void internal.tick('event')
    void internal.tick('event')
    releaseBlockedRead()
    await polling

    expect(phaseReads).toBe(2)
    client.stop()
  })

  it('retains queue 3270 across transport loss and selects the live match from two candidates', async () => {
    type ReplayStage = 'selected' | 'detached' | 'reconnected' | 'in-progress'
    let replayStage: ReplayStage = 'selected'
    const foreignLobby: LcuCredentials = {
      ...credentials,
      port: 58121,
      token: 'foreign-lobby',
      source: 'process',
      processId: 202,
      processStartedAt: '2026-08-13T04:01:00.000Z',
    }
    const liveMatch: LcuCredentials = {
      ...credentials,
      port: 58122,
      token: 'rotated-live-match',
      source: 'log',
      processId: null,
      processStartedAt: null,
    }
    const client = new LcuClient(() => '', {
      disableWebSocket: true,
      discover: async () => ({
        ...discovery(),
        candidates: replayStage === 'selected' || replayStage === 'detached'
          ? [credentials]
          : [foreignLobby, liveMatch],
        processCount: replayStage === 'selected' || replayStage === 'detached' ? 1 : 2,
      }),
      request: async (endpoint, candidate) => {
        if (replayStage === 'detached') throw new Error('ECONNREFUSED')
        if (candidate.token === foreignLobby.token) {
          if (endpoint === '/lol-gameflow/v1/gameflow-phase') return 'Lobby'
          if (endpoint === '/lol-gameflow/v1/session') return { queueId: 450, gameData: { gameId: 9001 } }
          if (endpoint === '/lol-lobby/v2/lobby') return { gameConfig: { queueId: 450 } }
          if (endpoint === '/riotclient/region-locale') return { locale: 'zh_CN' }
          return null
        }
        if (endpoint === '/lol-gameflow/v1/gameflow-phase') {
          return replayStage === 'in-progress' ? 'InProgress' : 'ChampSelect'
        }
        if (endpoint === '/lol-gameflow/v1/session') {
          return {
            gameData: { queue: { id: 3270 }, gameId: 3270004 },
            gameClient: { running: replayStage === 'in-progress' },
          }
        }
        if (endpoint === '/lol-champ-select/v1/session' && replayStage !== 'in-progress') {
          return {
            gameId: 3270004,
            localPlayerCellId: 4,
            myTeam: [{ cellId: 4, championId: 115 }],
          }
        }
        if (endpoint === '/lol-champ-select/v1/current-champion') {
          return replayStage === 'in-progress' ? null : 115
        }
        if (endpoint === '/lol-lobby/v2/lobby') return { gameConfig: { queueId: 3270 } }
        if (endpoint === '/riotclient/region-locale') return { locale: 'zh_CN' }
        return null
      },
    })

    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = emptySnapshot()
    runtime.lcuState = emptyConnection()
    runtime.detail = null
    runtime.overlay = { visible: false, championId: null, slots: [], detectedAt: null, message: '' }
    runtime.championRequestSequence = 0
    runtime.dataReady = false
    runtime.scanMisses = 0
    runtime.lastCombination = ''
    runtime.updateScanLoop = vi.fn()
    runtime.updateGameProcessLoop = vi.fn()
    runtime.sync = vi.fn()
    client.on('update', (snapshot, state) => runtime.handleLcuUpdate(snapshot, state))

    await client.pollOnce()
    expect(runtime.snapshot).toMatchObject({
      queueId: 3270,
      currentChampionId: 115,
      matchStage: 'selecting',
      matchGeneration: 1,
    })
    const detail: ChampionAugmentData = {
      championId: 115,
      dataVersion: '16.15.6',
      ranks: [{ augmentId: 1, rank: 1, tier: 1, total: 100 }],
    }
    runtime.detail = detail
    runtime.championRequestSequence = 7

    replayStage = 'detached'
    await client.pollOnce()
    expect(runtime.snapshot).toMatchObject({
      queueId: 3270,
      currentChampionId: 115,
      matchStage: 'launching',
      matchGeneration: 1,
    })
    expect(runtime.detail).toBe(detail)
    expect(runtime.championRequestSequence).toBe(7)

    replayStage = 'reconnected'
    await client.rediscoverNow()
    expect(runtime.lcuState).toMatchObject({ connected: true, source: 'log' })
    expect(runtime.snapshot).toMatchObject({
      queueId: 3270,
      currentChampionId: 115,
      matchStage: 'launching',
      matchGeneration: 1,
    })
    expect(runtime.detail).toBe(detail)

    replayStage = 'in-progress'
    await client.pollOnce()
    expect(runtime.snapshot).toMatchObject({
      queueId: 3270,
      currentChampionId: 115,
      matchStage: 'active',
      matchGeneration: 1,
    })
    expect(runtime.detail).toBe(detail)
    expect(runtime.championRequestSequence).toBe(7)
    client.stop()
  })

  it('keeps queue 3270 through a direct tracker hand-off with missing champ endpoints', () => {
    const tracker = new MatchContextTracker()
    const selected = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect',
      gameflowSession: { queueId: 3270, gameData: { gameId: 3270002 } },
      champSelectSession: { gameId: 3270002 },
      currentChampionId: 115,
    }), 1_000, {
      destructive: true,
      champSelectSession: 'ok',
      currentChampion: 'ok',
      matchIdentity: 'game:3270002',
    })
    const active = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'InProgress',
      gameflowSession: { queueId: 3270, gameData: { gameId: 3270002 } },
      champSelectSession: null,
      currentChampionId: null,
    }), 2_000, {
      destructive: true,
      champSelectSession: 'skipped',
      currentChampion: 'skipped',
      matchIdentity: 'game:3270002',
    })
    expect(selected).toMatchObject({ matchStage: 'selecting', matchGeneration: 1 })
    expect(active).toMatchObject({
      queueId: 3270,
      currentChampionId: 115,
      matchStage: 'active',
      matchGeneration: 1,
    })

    const secondMatch = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect',
      gameflowSession: { queueId: 3270, gameData: { gameId: 3270003 } },
      champSelectSession: { gameId: 3270003 },
      currentChampionId: 81,
    }), 3_000, {
      destructive: true,
      champSelectSession: 'ok',
      currentChampion: 'ok',
      matchIdentity: 'game:3270003',
    })
    expect(secondMatch).toMatchObject({
      queueId: 3270,
      currentChampionId: 81,
      matchStage: 'selecting',
      matchGeneration: 2,
    })
  })
})
