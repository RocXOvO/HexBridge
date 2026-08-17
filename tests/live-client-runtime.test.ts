import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.1.68' },
  screen: {},
  safeStorage: {},
  BrowserWindow: class {},
  desktopCapturer: {},
}))

vi.mock('../src/main/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), recent: () => [] },
}))

import { HexBridgeRuntime } from '../src/main/runtime.js'

function makeRuntime() {
  const runtime = Object.create(HexBridgeRuntime.prototype) as any
  runtime.stopping = false
  runtime.trustedGameProcessRunning = true
  runtime.liveClientLevelInFlight = false
  runtime.liveClientLevelSequence = 0
  runtime.currentChampionLevel = null
  runtime.snapshot = {
    phase: 'InProgress', queueId: 3270, modeActive: true, matchStage: 'active',
    matchGeneration: 2, currentChampionId: 103,
  }
  runtime.sync = vi.fn()
  runtime.liveClient = {
    readActivePlayerLevel: vi.fn(async () => ({ level: 12, code: 'ready' })),
    abort: vi.fn(),
  }
  runtime.windows = { getPresentationDiagnostics: () => ({ augmentCompanion: 'inactive' }) }
  return runtime
}

describe('Runtime Live Client level guards', () => {
  it('publishes only a validated level for the current active generation', async () => {
    const runtime = makeRuntime()
    await runtime.pollCurrentChampionLevel()
    expect(runtime.currentChampionLevel).toBe(12)
    expect(runtime.sync).toHaveBeenCalledTimes(1)
  })

  it('drops a late level response after a generation or champion change', async () => {
    let resolveLevel: ((value: unknown) => void) | undefined
    const runtime = makeRuntime()
    runtime.liveClient.readActivePlayerLevel = vi.fn(() => new Promise((resolve) => { resolveLevel = resolve }))
    const pending = runtime.pollCurrentChampionLevel()
    runtime.snapshot = { ...runtime.snapshot, matchGeneration: 3, currentChampionId: 81 }
    resolveLevel?.({ level: 18, code: 'ready' })
    await pending
    expect(runtime.currentChampionLevel).toBeNull()
    expect(runtime.sync).not.toHaveBeenCalled()
  })

  it('clears the level and aborts when leaving the active game stage', () => {
    const runtime = makeRuntime()
    runtime.currentChampionLevel = 9
    runtime.liveClientLevelTimer = setTimeout(() => undefined, 60_000)
    runtime.resetCurrentChampionLevel()
    expect(runtime.currentChampionLevel).toBeNull()
    expect(runtime.liveClient.abort).toHaveBeenCalledTimes(1)
    expect(runtime.liveClientLevelTimer).toBeNull()
  })

})
