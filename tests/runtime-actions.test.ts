import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {},
  screen: {},
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

import { HexBridgeRuntime } from '../src/main/runtime.js'

describe('runtime user actions', () => {
  it('returns after Key HEAD/save and refreshes catalogs in the background', async () => {
    let release: (() => void) | undefined
    const catalogRefresh = new Promise<void>((resolve) => { release = resolve })
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.data = {
      validateKey: vi.fn(async () => ({ ok: true, message: 'API Key 验证成功' })),
      initialize: vi.fn(async () => catalogRefresh),
    }
    runtime.sync = vi.fn()

    const result = await runtime.validateAndSaveApiKey('hx_live_12345678')
    expect(result).toEqual({ ok: true, message: 'API Key 验证成功' })
    expect(runtime.data.initialize).toHaveBeenCalledWith(true)
    expect(runtime.sync).toHaveBeenCalledTimes(1)
    release?.()
    await catalogRefresh
  })

  it('does not start catalog refresh when Key validation fails', async () => {
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.data = {
      validateKey: vi.fn(async () => ({ ok: false, message: '上游返回 HTTP 401' })),
      initialize: vi.fn(),
    }
    runtime.sync = vi.fn()

    expect(await runtime.validateAndSaveApiKey('hx_live_invalid')).toEqual({
      ok: false,
      message: '上游返回 HTTP 401',
    })
    expect(runtime.data.initialize).not.toHaveBeenCalled()
  })

  it('records a stable hotkey result even when the current phase is not OCR eligible', async () => {
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = {
      phase: 'Lobby', queueId: 3270, modeActive: false, matchStage: 'none',
      matchGeneration: 0, currentChampionId: null,
    }
    runtime.manualOcr = {}
    runtime.sync = vi.fn()

    const result = await runtime.triggerOcr('hotkey')

    expect(result).toEqual({ ok: false, message: '仅在海克斯大乱斗对局中识别' })
    expect(runtime.manualOcr).toMatchObject({
      manualOcrStatus: 'miss',
      manualOcrCode: 'NOT_ELIGIBLE',
      manualOcrSource: 'hotkey',
    })
    expect(runtime.manualOcr.manualOcrTriggeredAt).toEqual(expect.any(Number))
    expect(runtime.sync).toHaveBeenCalledTimes(2)
  })

  it('keeps the structured scan result for foreground hotkey diagnostics', async () => {
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = {
      phase: 'InProgress', queueId: 3270, modeActive: true, matchStage: 'active',
      matchGeneration: 1, currentChampionId: 103,
    }
    runtime.manualOcr = {}
    runtime.sync = vi.fn()
    runtime.runScan = vi.fn(async () => ({ ok: false, code: 'NOT_DETECTED', message: '未检测到三张海克斯标题' }))

    await runtime.triggerOcr('hotkey')

    expect(runtime.runScan).toHaveBeenCalledWith(true)
    expect(runtime.manualOcr).toMatchObject({
      manualOcrStatus: 'miss',
      manualOcrCode: 'NOT_DETECTED',
      manualOcrSource: 'hotkey',
      manualOcrMessage: '未检测到三张海克斯标题',
    })
  })

  it('does not let an older slow scan overwrite the newest manual trigger status', async () => {
    let finishFirst: ((result: unknown) => void) | undefined
    const firstResult = new Promise((resolve) => { finishFirst = resolve })
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = {
      phase: 'InProgress', queueId: 3270, modeActive: true, matchStage: 'active',
      matchGeneration: 1, currentChampionId: 103,
    }
    runtime.manualOcr = {}
    runtime.manualOcrSequence = 0
    runtime.sync = vi.fn()
    runtime.runScan = vi.fn()
      .mockImplementationOnce(() => firstResult)
      .mockResolvedValueOnce({ ok: false, code: 'BUSY', message: '识别任务正在运行' })

    const first = runtime.triggerOcr('button')
    await Promise.resolve()
    await runtime.triggerOcr('hotkey')
    finishFirst?.({ ok: true, code: 'MATCHED', message: '已识别三张海克斯' })
    await first

    expect(runtime.manualOcr).toMatchObject({
      manualOcrStatus: 'miss',
      manualOcrCode: 'BUSY',
      manualOcrSource: 'hotkey',
      manualOcrMessage: '识别任务正在运行',
    })
  })

  it('classifies scanner failures as errors rather than ordinary misses', async () => {
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = {
      phase: 'InProgress', queueId: 3270, modeActive: true, matchStage: 'active',
      matchGeneration: 1, currentChampionId: 103,
    }
    runtime.manualOcr = {}
    runtime.manualOcrSequence = 0
    runtime.sync = vi.fn()
    runtime.runScan = vi.fn(async () => ({ ok: false, code: 'SCAN_ERROR', message: 'OCR 截图或识别失败' }))

    await runtime.triggerOcr('tray')

    expect(runtime.manualOcr).toMatchObject({
      manualOcrStatus: 'error',
      manualOcrCode: 'SCAN_ERROR',
      manualOcrSource: 'tray',
    })
  })
})
