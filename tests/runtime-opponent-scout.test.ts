import { describe, expect, it, vi } from 'vitest'

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

import { HexBridgeRuntime } from '../src/main/runtime.js'

describe('runtime opponent scout lifecycle', () => {
  it('leaves loading and clears the attempt key when the LCU transport aborts', async () => {
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = {
      phase: 'InProgress', locale: 'zh_CN', queueId: 3270, modeActive: true,
      matchStage: 'active', matchGeneration: 3, currentChampionId: 103,
      benchChampionIds: [], benchEnabled: false, updatedAt: Date.now(),
    }
    runtime.config = { getSettings: () => ({ opponentScouting: true }) }
    runtime.opponentScout = {
      status: 'idle', matchGeneration: 3, opponents: [], sampledAt: null, source: null, message: '',
    }
    runtime.opponentScoutSequence = 0
    runtime.opponentScoutAttemptKey = null
    runtime.opponentScoutAbort = null
    runtime.lcu = {
      scoutOpponents: vi.fn(async () => {
        throw Object.assign(new Error('aborted'), { name: 'AbortError' })
      }),
    }
    runtime.sync = vi.fn()

    await runtime.updateOpponentScout(true, true)

    expect(runtime.opponentScout).toMatchObject({
      status: 'idle', matchGeneration: 3, message: 'LCU 连接已切换，等待重新查询',
    })
    expect(runtime.opponentScoutAttemptKey).toBeNull()
    expect(runtime.opponentScoutAbort).toBeNull()
  })
})
