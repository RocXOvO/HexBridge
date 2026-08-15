import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.1.55' },
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
    sampleDiagnostics: vi.fn(async () => ({
      level: 10,
      endpoints: [{ endpoint: 'activeplayer', status: 'ready', fields: [] }],
    })),
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

  it('returns a redacted one-shot diagnostic sample only for the current generation', async () => {
    const runtime = makeRuntime()
    const result = await runtime.sampleLiveClientDiagnostics('cards-visible')
    expect(result.ok).toBe(true)
    expect(result.sample).toMatchObject({
      step: 'cards-visible',
      clientVersion: '0.1.55',
      currentChampionLevel: 10,
      matchGeneration: 2,
      ocrSurface: 'inactive',
    })
    expect(result.sample?.sessionId).toMatch(/^[a-f0-9]{12}$/)
  })

  it('does not publish a sample after the match generation changes', async () => {
    let resolveRead: ((value: unknown) => void) | undefined
    const runtime = makeRuntime()
    runtime.liveClient.sampleDiagnostics = vi.fn(() => new Promise((resolve) => { resolveRead = resolve }))
    const pending = runtime.sampleLiveClientDiagnostics('no-card')
    runtime.snapshot = { ...runtime.snapshot, matchGeneration: 3 }
    resolveRead?.({ level: 3, endpoints: [] })
    await expect(pending).resolves.toEqual({ ok: false, message: '对局已变化，已丢弃迟到采样', sample: null })
  })
})
