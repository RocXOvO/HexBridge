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
  it('leaves loading and schedules a bounded retry when the LCU transport aborts', async () => {
    vi.useFakeTimers()
    try {
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = {
      phase: 'InProgress', locale: 'zh_CN', queueId: 3270, modeActive: true,
      matchStage: 'active', matchGeneration: 3, currentChampionId: 103,
      benchChampionIds: [], benchEnabled: false, updatedAt: Date.now(),
    }
    runtime.config = { getSettings: () => ({ opponentScouting: true }) }
    runtime.opponentScout = {
      status: 'idle', reason: 'waiting-context', matchGeneration: 3, opponents: [], sampledAt: null, source: null, message: '',
    }
    runtime.opponentScoutSequence = 0
    runtime.opponentScoutAttemptKey = null
    runtime.opponentScoutAbort = null
    runtime.opponentScoutRetryTimer = null
    runtime.opponentScoutRetryAttempt = 0
    runtime.stopping = false
    runtime.lcu = {
      scoutOpponents: vi.fn()
        .mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        .mockResolvedValueOnce({
          status: 'ready', reason: 'ready', matchGeneration: 3,
          opponents: [], sampledAt: Date.now(), source: 'local-lcu', message: '读取完成',
        }),
    }
    runtime.sync = vi.fn()

    await runtime.updateOpponentScout(true, true)

    expect(runtime.opponentScout).toMatchObject({
      status: 'idle', matchGeneration: 3, message: 'LCU 连接已切换，稍后自动重新查询',
    })
    expect(runtime.opponentScoutAttemptKey).toBeNull()
    expect(runtime.opponentScoutAbort).toBeNull()
    expect(runtime.opponentScoutRetryTimer).not.toBeNull()

    await vi.advanceTimersByTimeAsync(3_000)
    expect(runtime.lcu.scoutOpponents).toHaveBeenCalledTimes(2)
    expect(runtime.opponentScout).toMatchObject({ status: 'ready', source: 'local-lcu' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('automatically retries an early active-game identity miss and stops after success', async () => {
    vi.useFakeTimers()
    try {
      const runtime = Object.create(HexBridgeRuntime.prototype) as any
      runtime.snapshot = {
        phase: 'InProgress', locale: 'zh_CN', queueId: 3270, modeActive: true,
        matchStage: 'active', matchGeneration: 4, currentChampionId: 103,
        benchChampionIds: [], benchEnabled: false, updatedAt: Date.now(),
      }
      runtime.config = { getSettings: () => ({ opponentScouting: true }) }
      runtime.opponentScout = {
        status: 'idle', reason: 'waiting-context', matchGeneration: 4, opponents: [], sampledAt: null, source: null, message: '',
      }
      runtime.opponentScoutSequence = 0
      runtime.opponentScoutAttemptKey = null
      runtime.opponentScoutAbort = null
      runtime.opponentScoutRetryTimer = null
      runtime.opponentScoutRetryAttempt = 0
      runtime.stopping = false
      runtime.sync = vi.fn()
      runtime.lcu = {
        scoutOpponents: vi.fn()
          .mockResolvedValueOnce({
            status: 'unavailable', reason: 'identity-team-incomplete', matchGeneration: 4, opponents: [], sampledAt: Date.now(),
            source: null, message: '身份尚未就绪',
          })
          .mockResolvedValueOnce({
            status: 'ready', reason: 'ready', matchGeneration: 4, opponents: [], sampledAt: Date.now(),
            source: 'local-lcu', message: '读取完成',
          }),
      }

      await runtime.updateOpponentScout(false, true)
      expect(runtime.lcu.scoutOpponents).toHaveBeenCalledTimes(1)
      expect(runtime.opponentScoutRetryTimer).not.toBeNull()

      await vi.advanceTimersByTimeAsync(2_999)
      expect(runtime.lcu.scoutOpponents).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1)
      await Promise.resolve()

      expect(runtime.lcu.scoutOpponents).toHaveBeenCalledTimes(2)
      expect(runtime.opponentScout).toMatchObject({ status: 'ready', source: 'local-lcu' })
      expect(runtime.opponentScoutRetryTimer).toBeNull()
      expect(runtime.opponentScoutRetryAttempt).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it.each(['identity-visibility-rejected', 'identity-ambiguous'] as const)(
    'does not retry the non-transient identity decision %s',
    async (reason) => {
      vi.useFakeTimers()
      try {
        const runtime = Object.create(HexBridgeRuntime.prototype) as any
        runtime.snapshot = {
          phase: 'InProgress', locale: 'zh_CN', queueId: 3270, modeActive: true,
          matchStage: 'active', matchGeneration: 5, currentChampionId: 103,
          benchChampionIds: [], benchEnabled: false, updatedAt: Date.now(),
        }
        runtime.config = { getSettings: () => ({ opponentScouting: true }) }
        runtime.opponentScout = {
          status: 'idle', reason: 'waiting-context', matchGeneration: 5,
          opponents: [], sampledAt: null, source: null, message: '',
        }
        runtime.opponentScoutSequence = 0
        runtime.opponentScoutAttemptKey = null
        runtime.opponentScoutAbort = null
        runtime.opponentScoutRetryTimer = null
        runtime.opponentScoutRetryAttempt = 0
        runtime.stopping = false
        runtime.sync = vi.fn()
        runtime.lcu = {
          scoutOpponents: vi.fn().mockResolvedValue({
            status: 'unavailable', reason, matchGeneration: 5,
            opponents: [], sampledAt: Date.now(), source: null, message: '不会查询',
          }),
        }

        await runtime.updateOpponentScout(false, true)
        await vi.advanceTimersByTimeAsync(60_000)

        expect(runtime.lcu.scoutOpponents).toHaveBeenCalledTimes(1)
        expect(runtime.opponentScoutRetryTimer).toBeNull()
        expect(runtime.opponentScoutRetryAttempt).toBe(0)
      } finally {
        vi.useRealTimers()
      }
    },
  )

  it('bounds active identity retries and then leaves an explicit manual retry path', async () => {
    vi.useFakeTimers()
    try {
      const runtime = Object.create(HexBridgeRuntime.prototype) as any
      runtime.snapshot = {
        phase: 'InProgress', locale: 'zh_CN', queueId: 3270, modeActive: true,
        matchStage: 'active', matchGeneration: 6, currentChampionId: 103,
        benchChampionIds: [], benchEnabled: false, updatedAt: Date.now(),
      }
      runtime.config = { getSettings: () => ({ opponentScouting: true }) }
      runtime.opponentScout = {
        status: 'idle', reason: 'waiting-context', matchGeneration: 6,
        opponents: [], sampledAt: null, source: null, message: '',
      }
      runtime.opponentScoutSequence = 0
      runtime.opponentScoutAttemptKey = null
      runtime.opponentScoutAbort = null
      runtime.opponentScoutRetryTimer = null
      runtime.opponentScoutRetryAttempt = 0
      runtime.stopping = false
      runtime.sync = vi.fn()
      runtime.lcu = {
        scoutOpponents: vi.fn().mockImplementation(async () => ({
          status: 'unavailable', reason: 'identity-team-incomplete', matchGeneration: 6,
          opponents: [], sampledAt: Date.now(), source: null, message: '身份尚未就绪',
        })),
      }

      await runtime.updateOpponentScout(false, true)
      for (const delay of [3_000, 5_000, 10_000, 15_000, 15_000]) {
        await vi.advanceTimersByTimeAsync(delay)
      }
      await Promise.resolve()

      expect(runtime.lcu.scoutOpponents).toHaveBeenCalledTimes(6)
      expect(runtime.opponentScoutRetryTimer).toBeNull()
      expect(runtime.opponentScout).toMatchObject({
        status: 'unavailable',
        message: '游戏内仍未取得完整的 5 人对手身份，可点击“重新读取”再试',
      })

      runtime.cancelOpponentScoutRequest()
      expect(runtime.opponentScoutRetryAttempt).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
