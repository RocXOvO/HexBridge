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

import { HexBridgeRuntime, reuseUnchangedAugmentSlots } from '../src/main/runtime.js'
import { AugmentRoundTracker } from '../src/main/augment-round.js'

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
  runtime.manualOverlayExpiryTimer = null
  runtime.manualSurfaceFirstProbePending = false
  runtime.stopping = false
  runtime.overlay = { visible: false, championId: 103, slots: [], detectedAt: null, message: '' }
  runtime.sync = vi.fn()
  runtime.augmentRound = { observe: vi.fn(), reset: vi.fn(), beginNextRound: vi.fn() }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('runtime performance scheduling', () => {
  it('reuses unchanged card objects while replacing only changed slots', () => {
    const slot = (name: string, augmentId: number) => ({
      slot: name,
      rawText: name,
      augmentId,
      name: `海克斯${augmentId}`,
      confidence: 1,
      position: augmentId,
      tied: false,
      reason: '推荐序',
      iconUrl: `https://example.test/${augmentId}.png`,
      rarityName: '白银',
      pickRate: null,
      globalPickRate: null,
      globalWinRate: null,
      globalPickRank: null,
      globalWinRank: null,
      recommendationSource: 'tencent101',
      statisticsDate: '20260816',
      metricScope: 'global',
      statsSource: null,
      statsRegion: null,
    })
    const previous = [slot('left', 1), slot('center', 2), slot('right', 3)]
    const next = [slot('left', 1), slot('center', 9), slot('right', 3)]
    const merged = reuseUnchangedAugmentSlots(previous as any, next as any)

    expect(merged[0]).toBe(previous[0])
    expect(merged[1]).toBe(next[1])
    expect(merged[2]).toBe(previous[2])
  })

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
    expect(runtime.scanner.probeInterface).toHaveBeenCalledOnce()
    expect(runtime.runScan).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(99)
    expect(runtime.runScan).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
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
    await vi.advanceTimersByTimeAsync(2_000 + 100 + 2_000 + 4_000)
    expect(runtime.runScan).toHaveBeenCalledTimes(4)
    expect(runtime.automaticScanPhase).toBe('latched')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(runtime.runScan).toHaveBeenCalledTimes(4)
    runtime.stopScanLoop()
  })

  it('seeds the manual card fingerprint immediately and hides a post-selection frame before it can become the baseline', async () => {
    vi.useFakeTimers()
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = { ...activeSnapshot }
    initializeAutomaticState(runtime)
    const settings = { autoOcr: false, showInGameRecommendations: true }
    const augments = [1, 2, 3].map((id) => ({
      id,
      name: `海克斯${id}`,
      iconUrl: '',
      rarity: 1,
      rarityName: '白银',
      description: '',
      globalTier: id,
    }))
    runtime.config = { getSettings: () => settings }
    runtime.data = {
      getAugments: () => augments,
      getState: () => ({ dataVersion: 'fixture' }),
    }
    runtime.detail = null
    runtime.lcu = { confirmGameActive: vi.fn() }
    let gameForeground = false
    runtime.windows = {
      getMainActivity: () => ({ visible: false, focused: false, minimized: false }),
      isLeagueGameForeground: () => gameForeground,
    }
    runtime.augmentRound.observe.mockReturnValue({ commitMatched: true, clearPrevious: false })
    runtime.scanner = {
      scan: vi.fn(async () => ({
        status: 'matched',
        slots: [
          { slot: 'left', rawText: '海克斯1', augmentId: 1, name: '海克斯1', confidence: 1 },
          { slot: 'center', rawText: '海克斯2', augmentId: 2, name: '海克斯2', confidence: 1 },
          { slot: 'right', rawText: '海克斯3', augmentId: 3, name: '海克斯3', confidence: 1 },
        ],
        fingerprints: ['aaaa', 'bbbb', 'cccc'],
        durationMs: 30,
        error: null,
      })),
      probeInterface: vi.fn(async () => ({
        status: 'detected',
        durationMs: 10,
        fingerprints: ['dddd', 'eeee', 'ffff'],
      })),
    }

    await expect(runtime.runScan(true)).resolves.toMatchObject({ ok: true, code: 'MATCHED' })
    expect(runtime.automaticScanContextKey).toBe('1:103')
    expect(runtime.automaticScanPhase).toBe('latched')
    expect(runtime.automaticFingerprint).toEqual(['aaaa', 'bbbb', 'cccc'])
    expect(runtime.manualSurfaceFirstProbePending).toBe(true)

    runtime.updateScanLoop()
    expect(runtime.scanTimer).toBeNull()
    expect(runtime.automaticFingerprint).toEqual(['aaaa', 'bbbb', 'cccc'])
    expect(runtime.manualSurfaceFirstProbePending).toBe(true)
    gameForeground = true
    runtime.updateScanLoop()
    await vi.advanceTimersByTimeAsync(500)
    expect(runtime.overlay.visible).toBe(true)
    await vi.advanceTimersByTimeAsync(100)

    expect(runtime.scanner.probeInterface).toHaveBeenCalledTimes(2)
    expect(runtime.overlay.visible).toBe(false)
    expect(runtime.overlay.slots).toHaveLength(3)
    expect(runtime.manualOverlayMonitorDeadlineAt).toBeNull()
    expect(runtime.augmentRound.beginNextRound).toHaveBeenCalledOnce()
    runtime.stopScanLoop()
  })

  it('recovers the same automatic recommendation after two probe errors withdraw the compact surface', async () => {
    vi.useFakeTimers()
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = { ...activeSnapshot }
    initializeAutomaticState(runtime)
    const settings = { autoOcr: true, showInGameRecommendations: true }
    const augments = [1, 2, 3].map((id) => ({
      id,
      name: `海克斯${id}`,
      iconUrl: '',
      rarity: 1,
      rarityName: '白银',
      description: '',
      globalTier: id,
    }))
    runtime.config = { getSettings: () => settings }
    runtime.data = {
      getAugments: () => augments,
      getState: () => ({ dataVersion: 'fixture' }),
    }
    runtime.detail = null
    runtime.lcu = { confirmGameActive: vi.fn() }
    runtime.windows = {
      getMainActivity: () => ({ visible: true, focused: true, minimized: false }),
      isLeagueGameForeground: () => true,
    }
    runtime.augmentRound = new AugmentRoundTracker()
    runtime.augmentRound.observe('matched', { combination: '1:2:3', manual: true })
    runtime.overlay = {
      visible: true,
      championId: 103,
      slots: [{ augmentId: 1 }, { augmentId: 2 }, { augmentId: 3 }],
      detectedAt: 1,
      message: '推荐已更新',
    }
    runtime.automaticScanContextKey = '1:103'
    runtime.automaticScanPhase = 'latched'
    runtime.automaticFingerprint = ['aaaa', 'bbbb', 'cccc']
    runtime.scanner = {
      probeInterface: vi.fn()
        .mockResolvedValueOnce({ status: 'error', durationMs: 10, fingerprints: [] })
        .mockResolvedValueOnce({ status: 'error', durationMs: 10, fingerprints: [] })
        .mockResolvedValue({ status: 'detected', durationMs: 10, fingerprints: ['aaaa', 'bbbb', 'cccc'] }),
      scan: vi.fn(async () => ({
        status: 'matched',
        slots: [
          { slot: 'left', rawText: '海克斯1', augmentId: 1, name: '海克斯1', confidence: 1 },
          { slot: 'center', rawText: '海克斯2', augmentId: 2, name: '海克斯2', confidence: 1 },
          { slot: 'right', rawText: '海克斯3', augmentId: 3, name: '海克斯3', confidence: 1 },
        ],
        fingerprints: ['aaaa', 'bbbb', 'cccc'],
        durationMs: 30,
        error: null,
      })),
    }

    runtime.updateScanLoop()
    await vi.advanceTimersByTimeAsync(700 + 4_000)
    expect(runtime.overlay.visible).toBe(false)
    await vi.advanceTimersByTimeAsync(8_000)

    expect(runtime.scanner.scan).toHaveBeenCalledTimes(1)
    expect(runtime.overlay.visible).toBe(true)
    expect(runtime.overlay.slots).toHaveLength(3)
    expect(runtime.automaticScanPhase).toBe('latched')
    runtime.stopScanLoop()
  })

  it('withdraws a retained compact surface after two probe errors but tolerates one transient error', async () => {
    vi.useFakeTimers()
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = { ...activeSnapshot }
    initializeAutomaticState(runtime)
    runtime.config = { getSettings: () => ({ autoOcr: false, showInGameRecommendations: true }) }
    runtime.windows = {
      getMainActivity: () => ({ visible: false, focused: false, minimized: false }),
      isLeagueGameForeground: () => true,
    }
    runtime.overlay = {
      visible: true,
      championId: 103,
      slots: [{ augmentId: 1 }, { augmentId: 2 }, { augmentId: 3 }],
      detectedAt: 1,
      message: '推荐已更新',
    }
    runtime.automaticScanContextKey = '1:103'
    runtime.automaticScanPhase = 'latched'
    runtime.automaticFingerprint = ['aaaa', 'bbbb', 'cccc']
    runtime.scanner = { probeInterface: vi.fn(async () => ({ status: 'error', durationMs: 10, fingerprints: [] })) }
    runtime.setManualOverlayMonitorDeadline(Date.now() + 45_000)

    runtime.updateScanLoop()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(runtime.overlay.visible).toBe(true)
    await vi.advanceTimersByTimeAsync(4_000)

    expect(runtime.overlay.visible).toBe(false)
    expect(runtime.overlay.slots).toHaveLength(3)
    expect(runtime.manualOverlayMonitorDeadlineAt).toBeNull()
    expect(runtime.overlay.message).toContain('监测异常')
    runtime.stopScanLoop()
  })

  it('keeps the compact surface after one absence when the same cards return', async () => {
    vi.useFakeTimers()
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = { ...activeSnapshot }
    initializeAutomaticState(runtime)
    runtime.config = { getSettings: () => ({ autoOcr: false, showInGameRecommendations: true }) }
    runtime.windows = {
      getMainActivity: () => ({ visible: false, focused: false, minimized: false }),
      isLeagueGameForeground: () => true,
    }
    runtime.overlay = {
      visible: true,
      championId: 103,
      slots: [{ augmentId: 1 }, { augmentId: 2 }, { augmentId: 3 }],
      detectedAt: 1,
      message: '推荐已更新',
    }
    runtime.automaticScanContextKey = '1:103'
    runtime.automaticScanPhase = 'latched'
    runtime.automaticFingerprint = ['aaaa', 'bbbb', 'cccc']
    runtime.scanner = { probeInterface: vi.fn()
      .mockResolvedValueOnce({ status: 'not-detected', durationMs: 10, fingerprints: [] })
      .mockResolvedValueOnce({ status: 'detected', durationMs: 10, fingerprints: ['aaaa', 'bbbb', 'cccc'] }) }
    runtime.setManualOverlayMonitorDeadline(Date.now() + 45_000)

    runtime.updateScanLoop()
    await vi.advanceTimersByTimeAsync(1_000 + 100)

    expect(runtime.scanner.probeInterface).toHaveBeenCalledTimes(2)
    expect(runtime.overlay.visible).toBe(true)
    expect(runtime.automaticScanAbsences).toBe(0)
    expect(runtime.manualOverlayMonitorDeadlineAt).not.toBeNull()
    runtime.setManualOverlayMonitorDeadline(null)
    runtime.stopScanLoop()
  })

  it('pauses on focus loss without revoking the compact surface or its fingerprint', async () => {
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
    const deadline = Date.now() + 45_000
    runtime.config = { getSettings: () => ({ autoOcr: false, showInGameRecommendations: true }) }
    let gameForeground = false
    runtime.windows = {
      getMainActivity: () => ({ visible: false, focused: false, minimized: false }),
      isLeagueGameForeground: () => gameForeground,
    }
    runtime.scanner = {
      probeInterface: vi.fn(async () => ({
        status: 'detected', durationMs: 10, fingerprints: ['aaaa', 'bbbb', 'cccc'],
      })),
    }
    runtime.runScan = vi.fn()
    runtime.automaticScanContextKey = '1:103'
    runtime.automaticScanPhase = 'latched'
    runtime.automaticFingerprint = ['aaaa', 'bbbb', 'cccc']
    runtime.setManualOverlayMonitorDeadline(deadline)

    runtime.handleWindowActivityChanged()

    expect(runtime.overlay).toMatchObject({
      visible: true,
      slots: [{ augmentId: 1 }, { augmentId: 2 }, { augmentId: 3 }],
      message: '推荐已更新',
    })
    expect(runtime.manualOverlayMonitorDeadlineAt).toBe(deadline)
    expect(runtime.automaticScanPhase).toBe('latched')
    expect(runtime.automaticFingerprint).toEqual(['aaaa', 'bbbb', 'cccc'])
    expect(runtime.scanTimer).toBeNull()

    gameForeground = true
    runtime.handleWindowActivityChanged()
    await vi.advanceTimersByTimeAsync(1_000)

    expect(runtime.overlay.visible).toBe(true)
    expect(runtime.manualOverlayMonitorDeadlineAt).toBe(deadline)
    expect(runtime.scanner.probeInterface).toHaveBeenCalledOnce()
    expect(runtime.runScan).not.toHaveBeenCalled()
    expect(runtime.sync).toHaveBeenCalledTimes(2)
    runtime.setManualOverlayMonitorDeadline(null)
    runtime.stopScanLoop()
  })

  it('detects a card refresh that happens while the game is temporarily out of foreground', async () => {
    vi.useFakeTimers()
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = { ...activeSnapshot }
    initializeAutomaticState(runtime)
    runtime.config = { getSettings: () => ({ autoOcr: true, showInGameRecommendations: true }) }
    let gameForeground = false
    runtime.windows = {
      getMainActivity: () => ({ visible: false, focused: false, minimized: false }),
      isLeagueGameForeground: () => gameForeground,
    }
    runtime.overlay = {
      visible: true,
      championId: 103,
      slots: [{ augmentId: 1 }, { augmentId: 2 }, { augmentId: 3 }],
      detectedAt: 1,
      message: '推荐已更新',
    }
    runtime.automaticScanContextKey = '1:103'
    runtime.automaticScanPhase = 'latched'
    runtime.automaticFingerprint = ['aaaa', 'bbbb', 'cccc']
    runtime.scanner = {
      probeInterface: vi.fn(async () => ({
        status: 'detected', durationMs: 10, fingerprints: ['dddd', 'eeee', 'ffff'],
      })),
    }
    runtime.runScan = vi.fn(async () => ({ ok: true, code: 'MATCHED', message: 'matched' }))

    runtime.handleWindowActivityChanged()
    expect(runtime.automaticFingerprint).toEqual(['aaaa', 'bbbb', 'cccc'])
    gameForeground = true
    runtime.handleWindowActivityChanged()
    await vi.advanceTimersByTimeAsync(700 + 100)

    expect(runtime.scanner.probeInterface).toHaveBeenCalledTimes(2)
    expect(runtime.augmentRound.beginNextRound).toHaveBeenCalledOnce()
    expect(runtime.runScan).toHaveBeenCalledOnce()
    runtime.stopScanLoop()
  })

  it('expires a manual compact surface while the game remains out of foreground', async () => {
    vi.useFakeTimers()
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = { ...activeSnapshot }
    initializeAutomaticState(runtime)
    runtime.config = { getSettings: () => ({ autoOcr: false, showInGameRecommendations: true }) }
    runtime.windows = {
      getMainActivity: () => ({ visible: false, focused: false, minimized: false }),
      isLeagueGameForeground: () => false,
    }
    runtime.overlay = {
      visible: true,
      championId: 103,
      slots: [{ augmentId: 1 }, { augmentId: 2 }, { augmentId: 3 }],
      detectedAt: 1,
      message: '推荐已更新',
    }
    runtime.automaticScanContextKey = '1:103'
    runtime.automaticScanPhase = 'latched'
    runtime.automaticFingerprint = ['aaaa', 'bbbb', 'cccc']
    runtime.setManualOverlayMonitorDeadline(Date.now() + 45_000)

    runtime.handleWindowActivityChanged()
    await vi.advanceTimersByTimeAsync(45_000)

    expect(runtime.overlay).toMatchObject({
      visible: false,
      message: '卡牌界面监测已结束，已保留上次可靠结果',
    })
    expect(runtime.manualOverlayMonitorDeadlineAt).toBeNull()
    expect(runtime.manualOverlayExpiryTimer).toBeNull()
    expect(runtime.scanTimer).toBeNull()
    expect(runtime.sync).toHaveBeenCalledTimes(2)
  })

  it('continues cheap absence monitoring when automatic OCR is turned off with a visible result', async () => {
    vi.useFakeTimers()
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = { ...activeSnapshot }
    initializeAutomaticState(runtime)
    let settings = {
      autoOcr: true,
      showInGameRecommendations: true,
      opponentScouting: true,
    }
    runtime.config = {
      getSettings: () => settings,
      updateSettings: (patch: Record<string, unknown>) => {
        settings = { ...settings, ...patch }
        return settings
      },
    }
    runtime.windows = {
      getMainActivity: () => ({ visible: false, focused: false, minimized: false }),
      isLeagueGameForeground: () => true,
    }
    runtime.overlay = {
      visible: true,
      championId: 103,
      slots: [{ augmentId: 1 }, { augmentId: 2 }, { augmentId: 3 }],
      detectedAt: 1,
      message: '推荐已更新',
    }
    runtime.scanner = { probeInterface: vi.fn(async () => ({ status: 'not-detected', durationMs: 10 })) }
    runtime.runScan = vi.fn()

    runtime.updateSettings({ autoOcr: false })
    expect(runtime.manualOverlayMonitorDeadlineAt).toBe(Date.now() + 45_000)
    await vi.advanceTimersByTimeAsync(1_100)

    expect(runtime.scanner.probeInterface).toHaveBeenCalledTimes(2)
    expect(runtime.runScan).not.toHaveBeenCalled()
    expect(runtime.overlay.visible).toBe(false)
    expect(runtime.manualOverlayMonitorDeadlineAt).toBeNull()
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
    await vi.advanceTimersByTimeAsync(1_100)

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
    runtime.data = { dispose: vi.fn() }
    runtime.lcu = { stop: vi.fn() }

    const inFlight = runtime.runAutomaticScan()
    runtime.stop()
    finishProbe?.({ status: 'detected', durationMs: 10 })
    await inFlight
    expect(runtime.runScan).not.toHaveBeenCalled()
    expect(runtime.scanTimer).toBeNull()
    expect(runtime.stopping).toBe(true)
    expect(runtime.data.dispose).toHaveBeenCalledOnce()
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
