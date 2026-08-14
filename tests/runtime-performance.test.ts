import { afterEach, describe, expect, it, vi } from 'vitest'

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

const activeSnapshot = {
  phase: 'InProgress',
  queueId: 3270,
  modeActive: true,
  matchStage: 'active',
  matchGeneration: 1,
  currentChampionId: 103,
}

function initializeAutomaticState(runtime: any): void {
  runtime.scanTimer = null
  runtime.automaticScanPhase = 'waiting'
  runtime.automaticScanAbsences = 0
  runtime.automaticScanErrors = 0
  runtime.automaticFullAttempts = 0
  runtime.automaticFingerprint = null
  runtime.automaticFingerprintCandidate = null
  runtime.automaticFingerprintSamples = 0
  runtime.automaticScanEpoch = 0
  runtime.automaticScanContextKey = null
  runtime.automaticScanInFlightEpoch = null
  runtime.manualScanInFlight = false
  runtime.manualOverlayMonitorDeadlineAt = null
  runtime.stopping = false
  runtime.overlay = { visible: false, championId: 103, slots: [], detectedAt: null, message: '' }
  runtime.sync = vi.fn()
  runtime.augmentRound = { observe: vi.fn(), reset: vi.fn(), beginNextRound: vi.fn() }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('runtime performance scheduling', () => {
  it('does not capture immediately and keeps waiting probes responsive after misses', async () => {
    vi.useFakeTimers()
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = { ...activeSnapshot }
    initializeAutomaticState(runtime)
    runtime.config = { getSettings: () => ({ autoOcr: true }) }
    runtime.windows = { getMainActivity: () => ({ visible: true, minimized: false }) }
    runtime.scanner = { probeInterface: vi.fn(async () => ({ status: 'not-detected', durationMs: 10 })) }
    runtime.runScan = vi.fn()

    runtime.updateScanLoop()
    expect(runtime.scanner.probeInterface).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(runtime.scanner.probeInterface).toHaveBeenCalledTimes(1)
    expect(runtime.runScan).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(runtime.scanner.probeInterface).toHaveBeenCalledTimes(2)
    runtime.stopScanLoop()
  })

  it('runs full OCR once for the same visible cards and rearms after two absences', async () => {
    vi.useFakeTimers()
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = { ...activeSnapshot }
    initializeAutomaticState(runtime)
    runtime.config = { getSettings: () => ({ autoOcr: true }) }
    runtime.windows = { getMainActivity: () => ({ visible: true, minimized: false }) }
    runtime.scanner = { probeInterface: vi.fn() }
    runtime.scanner.probeInterface
      .mockResolvedValueOnce({ status: 'detected', durationMs: 10 })
      .mockResolvedValueOnce({ status: 'detected', durationMs: 10 })
      .mockResolvedValueOnce({ status: 'not-detected', durationMs: 10 })
      .mockResolvedValueOnce({ status: 'not-detected', durationMs: 10 })
      .mockResolvedValue({ status: 'detected', durationMs: 10 })
    runtime.runScan = vi.fn(async () => ({ ok: true, code: 'MATCHED', message: 'matched' }))

    runtime.updateScanLoop()
    await vi.advanceTimersByTimeAsync(2_000)
    runtime.overlay = {
      visible: true,
      championId: 103,
      slots: [{ augmentId: 10 }, { augmentId: 11 }, { augmentId: 12 }],
      detectedAt: 1,
      message: '上一轮推荐',
    }
    await vi.advanceTimersByTimeAsync(700)
    await vi.advanceTimersByTimeAsync(700)
    await vi.advanceTimersByTimeAsync(700)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(runtime.scanner.probeInterface).toHaveBeenCalledTimes(5)
    expect(runtime.runScan).toHaveBeenCalledTimes(2)
    expect(runtime.runScan).toHaveBeenCalledWith(false, undefined, true)
    runtime.stopScanLoop()
  })

  it('re-runs full OCR after one card has a stable two-frame visual change', async () => {
    vi.useFakeTimers()
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = { ...activeSnapshot }
    initializeAutomaticState(runtime)
    runtime.automaticScanPhase = 'latched'
    runtime.automaticScanContextKey = '1:103'
    runtime.automaticFingerprint = ['0000', '0000', '0000']
    runtime.overlay = {
      visible: true,
      championId: 103,
      slots: [{ augmentId: 10 }, { augmentId: 11 }, { augmentId: 12 }],
      detectedAt: 1,
      message: '上一轮推荐',
    }
    runtime.config = { getSettings: () => ({ autoOcr: true }) }
    runtime.windows = { getMainActivity: () => ({ visible: true, minimized: false }) }
    runtime.scanner = { probeInterface: vi.fn() }
    runtime.scanner.probeInterface
      .mockResolvedValueOnce({ status: 'detected', durationMs: 10, fingerprints: ['0000', 'ffff', '0000'] })
      .mockResolvedValue({ status: 'detected', durationMs: 10, fingerprints: ['0000', 'ffff', '0000'] })
    runtime.runScan = vi.fn(async () => ({ ok: true, code: 'MATCHED', message: 'matched' }))

    runtime.updateScanLoop()
    await vi.advanceTimersByTimeAsync(700)
    await vi.advanceTimersByTimeAsync(280)
    expect(runtime.runScan).toHaveBeenCalledTimes(1)
    expect(runtime.augmentRound.beginNextRound).toHaveBeenCalledOnce()
    expect(runtime.overlay).toMatchObject({
      visible: false,
      slots: [{ augmentId: 10 }, { augmentId: 11 }, { augmentId: 12 }],
      message: '检测到卡牌刷新，正在识别新一轮',
    })
    runtime.stopScanLoop()
  })

  it('backs off scan errors instead of retrying every two seconds', async () => {
    vi.useFakeTimers()
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = { ...activeSnapshot }
    initializeAutomaticState(runtime)
    runtime.config = { getSettings: () => ({ autoOcr: true }) }
    runtime.windows = { getMainActivity: () => ({ visible: true, minimized: false }) }
    runtime.scanner = { probeInterface: vi.fn(async () => ({ status: 'error', durationMs: 10 })) }

    runtime.updateScanLoop()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(runtime.scanner.probeInterface).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(3_999)
    expect(runtime.scanner.probeInterface).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(runtime.scanner.probeInterface).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(7_999)
    expect(runtime.scanner.probeInterface).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(runtime.scanner.probeInterface).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(14_999)
    expect(runtime.scanner.probeInterface).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(1)
    expect(runtime.scanner.probeInterface).toHaveBeenCalledTimes(4)
    runtime.stopScanLoop()
  })

  it('also reaches the fifteen-second backoff when full OCR itself fails', async () => {
    vi.useFakeTimers()
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = { ...activeSnapshot }
    initializeAutomaticState(runtime)
    runtime.config = { getSettings: () => ({ autoOcr: true }) }
    runtime.windows = { getMainActivity: () => ({ visible: true, minimized: false }) }
    runtime.scanner = { probeInterface: vi.fn(async () => ({ status: 'detected', durationMs: 10 })) }
    runtime.runScan = vi.fn(async () => ({ ok: false, code: 'SCAN_ERROR', message: 'error' }))

    runtime.updateScanLoop()
    await vi.advanceTimersByTimeAsync(2_000)
    await vi.advanceTimersByTimeAsync(4_000)
    await vi.advanceTimersByTimeAsync(8_000)
    expect(runtime.runScan).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(14_999)
    expect(runtime.runScan).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(1)
    expect(runtime.runScan).toHaveBeenCalledTimes(4)
    runtime.stopScanLoop()
  })

  it('caps unreliable full OCR attempts while the same cards remain visible', async () => {
    vi.useFakeTimers()
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = { ...activeSnapshot }
    initializeAutomaticState(runtime)
    runtime.config = { getSettings: () => ({ autoOcr: true }) }
    runtime.windows = { getMainActivity: () => ({ visible: true, minimized: false }) }
    runtime.scanner = { probeInterface: vi.fn(async () => ({ status: 'detected', durationMs: 10 })) }
    runtime.runScan = vi.fn(async () => ({ ok: false, code: 'UNRELIABLE', message: 'miss' }))

    runtime.updateScanLoop()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(runtime.scanner.probeInterface.mock.calls.length).toBeGreaterThan(15)
    expect(runtime.runScan).toHaveBeenCalledTimes(4)
    runtime.stopScanLoop()
  })

  it('accepts a fourth full OCR success and never performs a fifth scan for the same cards', async () => {
    vi.useFakeTimers()
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = { ...activeSnapshot }
    initializeAutomaticState(runtime)
    runtime.config = { getSettings: () => ({ autoOcr: true }) }
    runtime.windows = { getMainActivity: () => ({ visible: true, minimized: false }) }
    runtime.scanner = {
      probeInterface: vi.fn(async () => ({
        status: 'detected',
        durationMs: 10,
        fingerprints: ['1111', '2222', '3333'],
      })),
    }
    runtime.runScan = vi.fn()
      .mockResolvedValueOnce({ ok: false, code: 'UNRELIABLE', message: 'miss 1' })
      .mockResolvedValueOnce({ ok: false, code: 'UNRELIABLE', message: 'miss 2' })
      .mockResolvedValueOnce({ ok: false, code: 'UNRELIABLE', message: 'miss 3' })
      .mockResolvedValueOnce({ ok: true, code: 'MATCHED', message: 'matched' })

    runtime.updateScanLoop()
    await vi.advanceTimersByTimeAsync(2_000 + 280 + 2_000 + 4_000)
    expect(runtime.runScan).toHaveBeenCalledTimes(4)
    expect(runtime.automaticScanPhase).toBe('latched')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(runtime.runScan).toHaveBeenCalledTimes(4)
    runtime.stopScanLoop()
  })

  it('withdraws the compact strip on focus loss while retaining the last reliable result', () => {
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = { ...activeSnapshot }
    initializeAutomaticState(runtime)
    runtime.overlay = {
      visible: true,
      championId: 103,
      slots: [{ augmentId: 1 }, { augmentId: 2 }, { augmentId: 3 }],
      detectedAt: 1,
      message: '推荐已更新',
    }
    runtime.manualOverlayMonitorDeadlineAt = Date.now() + 45_000
    runtime.windows = { isLeagueGameForeground: () => false }
    runtime.updateScanLoop = vi.fn()

    runtime.handleWindowActivityChanged()

    expect(runtime.overlay).toMatchObject({
      visible: false,
      slots: [{ augmentId: 1 }, { augmentId: 2 }, { augmentId: 3 }],
      message: '游戏已失去前台焦点，已保留上次可靠结果',
    })
    expect(runtime.manualOverlayMonitorDeadlineAt).toBeNull()
    expect(runtime.updateScanLoop).toHaveBeenCalledOnce()
    expect(runtime.sync).toHaveBeenCalledOnce()
  })

  it('never schedules automatic capture during launching or while the main window is hidden', () => {
    vi.useFakeTimers()
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = { ...activeSnapshot, matchStage: 'launching' }
    initializeAutomaticState(runtime)
    runtime.config = { getSettings: () => ({ autoOcr: true }) }
    runtime.windows = { getMainActivity: () => ({ visible: true, minimized: false }) }
    runtime.updateScanLoop()
    expect(runtime.scanTimer).toBeNull()

    runtime.snapshot = { ...activeSnapshot }
    runtime.windows = { getMainActivity: () => ({ visible: false, minimized: false }) }
    runtime.updateScanLoop()
    expect(runtime.scanTimer).toBeNull()
  })

  it('hides the in-game bar after two cheap absence probes even when automatic OCR is disabled', async () => {
    vi.useFakeTimers()
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = { ...activeSnapshot }
    initializeAutomaticState(runtime)
    runtime.overlay = {
      visible: true,
      championId: 103,
      slots: [{ augmentId: 1 }, { augmentId: 2 }, { augmentId: 3 }],
      detectedAt: 1,
      message: '推荐已更新',
    }
    runtime.manualOverlayMonitorDeadlineAt = Date.now() + 45_000
    runtime.config = { getSettings: () => ({ autoOcr: false, showInGameRecommendations: true }) }
    runtime.windows = {
      getMainActivity: () => ({ visible: false, focused: false, minimized: false }),
      isLeagueGameForeground: () => true,
    }
    runtime.scanner = { probeInterface: vi.fn(async () => ({ status: 'not-detected', durationMs: 10 })) }
    runtime.runScan = vi.fn()

    runtime.updateScanLoop()
    await vi.advanceTimersByTimeAsync(1_280)

    expect(runtime.scanner.probeInterface).toHaveBeenCalledTimes(2)
    expect(runtime.runScan).not.toHaveBeenCalled()
    expect(runtime.overlay.visible).toBe(false)
    expect(runtime.overlay.slots).toHaveLength(3)
    expect(runtime.scanTimer).toBeNull()
  })

  it('ends the bounded cheap monitor without running full OCR when the cards never disappear', async () => {
    vi.useFakeTimers()
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = { ...activeSnapshot }
    initializeAutomaticState(runtime)
    runtime.overlay = {
      visible: true,
      championId: 103,
      slots: [{ augmentId: 1 }, { augmentId: 2 }, { augmentId: 3 }],
      detectedAt: 1,
      message: '推荐已更新',
    }
    runtime.manualOverlayMonitorDeadlineAt = Date.now() + 45_000
    runtime.config = { getSettings: () => ({ autoOcr: false, showInGameRecommendations: true }) }
    runtime.windows = {
      getMainActivity: () => ({ visible: false, focused: false, minimized: false }),
      isLeagueGameForeground: () => true,
    }
    runtime.scanner = {
      probeInterface: vi.fn(async () => ({
        status: 'detected', durationMs: 10, fingerprints: ['0000', '0000', '0000'],
      })),
    }
    runtime.runScan = vi.fn()

    runtime.updateScanLoop()
    await vi.advanceTimersByTimeAsync(45_000)

    expect(runtime.runScan).not.toHaveBeenCalled()
    expect(runtime.overlay).toMatchObject({
      visible: false,
      message: '卡牌界面监测已结束，已保留上次可靠结果',
    })
    expect(runtime.scanTimer).toBeNull()
  })

  it('does not run or reschedule full OCR after a hide, focus loss or match switch during a probe', async () => {
    let finishProbe: ((value: unknown) => void) | undefined
    const probe = new Promise((resolve) => { finishProbe = resolve })
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = { ...activeSnapshot }
    initializeAutomaticState(runtime)
    runtime.config = { getSettings: () => ({ autoOcr: true }) }
    let focused = true
    runtime.windows = { getMainActivity: () => ({ visible: true, focused, minimized: false }) }
    runtime.scanner = { probeInterface: vi.fn(() => probe) }
    runtime.runScan = vi.fn()

    const inFlight = runtime.runAutomaticScan()
    focused = false
    runtime.stopScanLoop()
    finishProbe?.({ status: 'detected', durationMs: 10 })
    await inFlight
    expect(runtime.runScan).not.toHaveBeenCalled()
    expect(runtime.scanTimer).toBeNull()
  })

  it('never revives automatic scanning after runtime stop while a probe is pending', async () => {
    let finishProbe: ((value: unknown) => void) | undefined
    const probe = new Promise((resolve) => { finishProbe = resolve })
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = { ...activeSnapshot }
    initializeAutomaticState(runtime)
    runtime.config = { getSettings: () => ({ autoOcr: true }) }
    runtime.windows = {
      getMainActivity: () => ({ visible: true, minimized: false }),
      prepareToQuit: vi.fn(),
    }
    runtime.scanner = { probeInterface: vi.fn(() => probe) }
    runtime.runScan = vi.fn()
    runtime.stopGameProcessLoop = vi.fn()
    runtime.updates = { stop: vi.fn() }
    runtime.lcu = { stop: vi.fn() }

    const inFlight = runtime.runAutomaticScan()
    runtime.stop()
    finishProbe?.({ status: 'detected', durationMs: 10 })
    await inFlight
    expect(runtime.runScan).not.toHaveBeenCalled()
    expect(runtime.scanTimer).toBeNull()
    expect(runtime.stopping).toBe(true)
  })

  it('restores automatic scheduling after a manual scan times out waiting for the scanner', async () => {
    vi.useFakeTimers()
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = { ...activeSnapshot }
    initializeAutomaticState(runtime)
    runtime.config = { getSettings: () => ({ autoOcr: true }) }
    runtime.windows = { getMainActivity: () => ({ visible: true, minimized: false }) }
    runtime.scanner = { waitUntilIdle: vi.fn(async () => false) }

    await expect(runtime.captureManualScan()).resolves.toMatchObject({ code: 'BUSY' })
    expect(runtime.manualScanInFlight).toBe(false)
    expect(runtime.scanTimer).not.toBeNull()
    runtime.stopScanLoop()
  })

  it('delays process probes and reduces active polling to once per ten seconds', async () => {
    vi.useFakeTimers()
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = { ...activeSnapshot, matchStage: 'launching' }
    runtime.gameProcessTimer = null
    runtime.gameProcessPollMs = null
    runtime.gameProcessExitGuard = { reset: vi.fn() }
    runtime.checkGameProcess = vi.fn()

    runtime.updateGameProcessLoop()
    expect(runtime.checkGameProcess).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(3_000)
    expect(runtime.checkGameProcess).toHaveBeenCalledTimes(1)

    runtime.snapshot = { ...activeSnapshot }
    runtime.updateGameProcessLoop()
    await vi.advanceTimersByTimeAsync(9_999)
    expect(runtime.checkGameProcess).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(runtime.checkGameProcess).toHaveBeenCalledTimes(2)
    runtime.stopGameProcessLoop()
  })
})
