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

vi.mock('../src/main/config-store.js', () => ({
  ConfigStore: class {},
}))

import { LcuClient } from '../src/main/lcu/client.js'
import { HexBridgeRuntime } from '../src/main/runtime.js'

const a: LcuCredentials = {
  port: 58120,
  token: 'match-a',
  source: 'process',
  executablePath: 'A',
  processId: 101,
  processStartedAt: '2026-08-13T02:00:00.000Z',
}
const b: LcuCredentials = {
  port: 58121,
  token: 'idle-b',
  source: 'log',
  executablePath: 'B',
  processId: 202,
}

const discovery = (candidates: LcuCredentials[]): LcuDiscoveryResult => ({
  candidates,
  summary: `${candidates.length} candidates`,
  processCount: candidates.length,
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

describe('production LCU transport hand-off replay', () => {
  it('keeps Runtime detail/OCR context when A dies and a foreign B reports Lobby', async () => {
    let phase: 'select-a' | 'a-down' | 'competing' | 'foreign-lobby' | 'matching-end' = 'select-a'
    const client = new LcuClient(() => '', {
      disableWebSocket: true,
      discover: async () => discovery(
        phase === 'select-a' || phase === 'a-down'
          ? [a]
          : phase === 'competing'
            ? [a, b]
            : [b],
      ),
      request: async (endpoint, credentials) => {
        if (credentials.token === a.token) {
          if (phase === 'a-down') throw new Error('ECONNREFUSED')
          if (phase === 'competing') {
            if (endpoint === '/lol-gameflow/v1/gameflow-phase') return 'None'
            if (endpoint === '/riotclient/region-locale') return { locale: 'zh_CN' }
            return null
          }
          if (endpoint === '/lol-gameflow/v1/gameflow-phase') return 'ChampSelect'
          if (endpoint === '/lol-gameflow/v1/session') {
            return { gameData: { queue: { id: 2400 }, gameId: 7001 }, gameClient: { running: false } }
          }
          if (endpoint === '/lol-champ-select/v1/session') {
            return {
              gameId: 7001,
              localPlayerCellId: 4,
              myTeam: [{ cellId: 4, championId: 103 }],
              benchChampionIds: [81, 63],
              timer: { phase: 'FINALIZATION' },
            }
          }
          if (endpoint === '/lol-champ-select/v1/current-champion') return 103
          if (endpoint === '/riotclient/region-locale') return { locale: 'zh_CN' }
          return null
        }

        if (phase === 'competing') {
          if (endpoint === '/lol-gameflow/v1/gameflow-phase') return 'ChampSelect'
          if (endpoint === '/lol-gameflow/v1/session') {
            return { gameData: { queue: { id: 2400 }, gameId: 9002 } }
          }
          if (endpoint === '/lol-champ-select/v1/session') {
            return { gameId: 9002, localPlayerCellId: 2, myTeam: [{ cellId: 2, championId: 81 }] }
          }
          if (endpoint === '/lol-champ-select/v1/current-champion') return 81
          if (endpoint === '/riotclient/region-locale') return { locale: 'zh_CN' }
          return null
        }
        if (endpoint === '/lol-gameflow/v1/gameflow-phase') {
          return phase === 'matching-end' ? 'EndOfGame' : 'Lobby'
        }
        if (endpoint === '/lol-gameflow/v1/session') {
          return phase === 'matching-end'
            ? { gameData: { queue: { id: 2400 }, gameId: 7001 }, gameClient: { running: false } }
            : { gameData: { queue: { id: 450 }, gameId: 9002 }, gameClient: { running: false } }
        }
        if (endpoint === '/lol-lobby/v2/lobby') return { gameConfig: { queueId: 450 } }
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
      currentChampionId: 103,
      matchStage: 'selecting',
      matchGeneration: 1,
    })

    const detail: ChampionAugmentData = {
      championId: 103,
      dataVersion: '16.15.6',
      ranks: [{ augmentId: 1, rank: 1, tier: 1, total: 100 }],
    }
    const overlay = {
      visible: true,
      championId: 103,
      slots: [],
      detectedAt: 1,
      message: 'retained',
    }
    runtime.detail = detail
    runtime.overlay = overlay
    runtime.championRequestSequence = 7

    phase = 'a-down'
    await client.pollOnce()
    expect(runtime.snapshot).toMatchObject({
      currentChampionId: 103,
      matchStage: 'launching',
      matchGeneration: 1,
    })

    phase = 'competing'
    await client.rediscoverNow()
    expect(runtime.lcuState).toMatchObject({ connected: true, source: 'process' })
    expect(runtime.snapshot).toMatchObject({
      queueId: 2400,
      currentChampionId: 103,
      matchStage: 'launching',
      matchGeneration: 1,
    })
    expect(runtime.detail).toBe(detail)
    expect(runtime.overlay).toBe(overlay)
    expect(runtime.championRequestSequence).toBe(7)

    phase = 'foreign-lobby'
    await client.rediscoverNow()
    expect(runtime.snapshot).toMatchObject({
      queueId: 2400,
      currentChampionId: 103,
      matchStage: 'launching',
      matchGeneration: 1,
    })
    expect(runtime.lcuState).toMatchObject({ connected: true, source: 'log' })
    expect(runtime.detail).toBe(detail)
    expect(runtime.overlay).toBe(overlay)
    expect(runtime.championRequestSequence).toBe(7)

    client.confirmGameActive('game-process', 1, 103)
    expect(runtime.snapshot.matchStage).toBe('active')

    phase = 'matching-end'
    await client.pollOnce()
    expect(runtime.snapshot).toMatchObject({ currentChampionId: null, matchStage: 'none' })
    expect(runtime.detail).toBeNull()
    expect(runtime.overlay).toMatchObject({ visible: false, championId: null })
    expect(runtime.championRequestSequence).toBe(8)
    client.stop()
  })
})
