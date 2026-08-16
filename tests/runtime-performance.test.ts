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

import { HexBridgeRuntime, mergeIncrementalOcrSlots, reuseUnchangedAugmentSlots } from '../src/main/runtime.js'
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
  runtime.automaticScanAbsenceStartedAt = null
  runtime.automaticScanErrors = 0
  runtime.automaticFullAttempts = 0
  runtime.automaticFingerprint = null
  runtime.automaticFingerprintCandidate = null
  runtime.automaticFingerprintSamples = 0
  runtime.automaticScanEpoch = 0
  runtime.automaticScanContextKey = null
  runtime.automaticScanInFlightEpoch = null
  runtime.automaticScanPaused = false
  runtime.automaticScanNextDelayMs = null
  runtime.ocrScheduleLastOutcome = 'none'
  runtime.ocrDiagnosticsSyncAt = 0
  runtime.ocrDiagnosticsSyncTimer = null
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
  it('merges a guarded single-slot OCR result without replacing unchanged slots', () => {
    const previous = [
      { slot: 'left', rawText: '左', augmentId: 1, name: '左', confidence: 1 },
      { slot: 'center', rawText: '中', augmentId: 2, name: '中', confidence: 1 },
      { slot: 'right', rawText: '右', augmentId: 3, name: '右', confidence: 1 },
    ] as any
    const update = [{ slot: 'center', rawText: '新中', augmentId: 9, name: '新中', confidence: 1 }] as any

    const merged = mergeIncrementalOcrSlots(previous, update, ['center'])

    expect(merged).toHaveLength(3)
    expect(merged?.[0]).toMatchObject({ slot: 'left', augmentId: 1 })
    expect(merged?.[1]).toMatchObject({ slot: 'center', augmentId: 9 })
    expect(merged?.[2]).toMatchObject({ slot: 'right', augmentId: 3 })
    expect(merged?.[0]).not.toBe(previous[0])
    expect(mergeIncrementalOcrSlots(previous, update, ['left'])).toBeNull()
    expect(mergeIncrementalOcrSlots(previous, [{ ...update[0], augmentId: null }], ['center'])).toBeNull()
  })

  it('passes a single changed slot through runtime and preserves the other physical cards', async () => {
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = { ...activeSnapshot }
    runtime.config = { getSettings: () => ({ recommendationDataSource: 'dtodo', autoOcr: true }) }
    const augments = [1, 2, 3, 9].map((id) => ({
      id,
      name: `海克斯${id}`,
      iconUrl: `https://example.test/${id}.png`,
      rarity: 1,
      rarityName: '白银',
      description: '',
      globalTier: id,
    }))
    const card = (slot: 'left' | 'center' | 'right', augmentId: number) => ({
      slot,
      rawText: `海克斯${augmentId}`,
      augmentId,
      name: `海克斯${augmentId}`,
      confidence: 1,
      position: augmentId,
      tied: false,
      reason: '暂无可靠的推荐依据',
      iconUrl: `https://example.test/${augmentId}.png`,
      rarityName: '白银',
      pickRate: null,
      globalPickRate: null,
      globalWinRate: null,
      globalPickRank: null,
      globalWinRank: null,
      recommendationSource: 'dtodo',
      statisticsDate: '',
      metricScope: null,
      statsSource: null,
      statsRegion: null,
    })
    runtime.overlay = {
      visible: true,
      championId: 103,
      slots: [card('left', 1), card('center', 2), card('right', 3)],
      detectedAt: 1,
      message: '推荐已更新',
    }
    runtime.automaticScanContextKey = 'ctx'
    runtime.selectedRecommendationSource = () => 'dtodo'
    runtime.getRecommendationState = () => ({
      source: 'dtodo', status: 'ready', snapshotId: 'v1', dataVersion: 'v1', statisticsDate: '', stale: false, lastError: null,
    })
    runtime.getRecommendationAugments = () => augments
    runtime.scanContextKey = () => 'ctx'
    runtime.currentRecommendationDetail = () => null
    runtime.getAugmentRound = () => ({ observe: () => ({ commitMatched: true, clearPrevious: false }) })
    runtime.setOcrScheduleOutcome = vi.fn()
    runtime.setManualOverlayMonitorDeadline = vi.fn()
    runtime.sync = vi.fn()
    runtime.lcu = { confirmGameActive: vi.fn() }
    runtime.scanner = {
      scan: vi.fn(async (...args: unknown[]) => {
        expect(args[4]).toEqual({ onlySlots: ['center'] })
        return {
          status: 'matched',
          slots: [{ slot: 'center', rawText: '海克斯9', augmentId: 9, name: '海克斯9', confidence: 1 }],
          fingerprints: ['aaaa', 'ffff', 'cccc'],
          durationMs: 10,
          error: null,
        }
      }),
    }

    await expect(runtime.runScan(false, undefined, true, {
      slots: ['center'],
      previousFingerprints: ['aaaa', 'bbbb', 'cccc'],
      confirmedFingerprints: ['aaaa', 'ffff', 'cccc'],
      contextKey: 'ctx',
      previousOverlay: [
        { slot: 'left', augmentId: 1 },
        { slot: 'center', augmentId: 2 },
        { slot: 'right', augmentId: 3 },
      ],
    })).resolves.toMatchObject({ ok: true, code: 'MATCHED' })
    expect(runtime.scanner.scan).toHaveBeenCalledOnce()
    expect(runtime.overlay.slots[0]).toMatchObject({ slot: 'left', augmentId: 1 })
    expect(runtime.overlay.slots[1]).toMatchObject({ slot: 'center', augmentId: 9 })
    expect(runtime.overlay.slots[2]).toMatchObject({ slot: 'right', augmentId: 3 })
  })

  it('rejects a mixed-frame incremental result and lets the next scan use all slots', async () => {
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = { ...activeSnapshot }
    runtime.config = { getSettings: () => ({ recommendationDataSource: 'dtodo', autoOcr: true }) }
    const augments = [1, 2, 3, 9].map((id) => ({
      id, name: `海克斯${id}`, iconUrl: `https://example.test/${id}.png`, rarity: 1,
      rarityName: '白银', description: '', globalTier: id,
    }))
    const slot = (name: 'left' | 'center' | 'right', augmentId: number) => ({
      slot: name, rawText: `海克斯${augmentId}`, augmentId, name: `海克斯${augmentId}`, confidence: 1,
      position: augmentId, tied: false, reason: '暂无可靠的推荐依据',
      iconUrl: `https://example.test/${augmentId}.png`, rarityName: '白银',
      pickRate: null, globalPickRate: null, globalWinRate: null,
      globalPickRank: null, globalWinRank: null, recommendationSource: 'dtodo',
      statisticsDate: '', metricScope: null, statsSource: null, statsRegion: null,
    })
    runtime.overlay = {
      visible: true, championId: 103, slots: [slot('left', 1), slot('center', 2), slot('right', 3)],
      detectedAt: 1, message: '推荐已更新',
    }
    runtime.automaticScanContextKey = 'ctx'
    runtime.selectedRecommendationSource = () => 'dtodo'
    runtime.getRecommendationState = () => ({
      source: 'dtodo', status: 'ready', snapshotId: 'v1', dataVersion: 'v1', statisticsDate: '', stale: false, lastError: null,
    })
    runtime.getRecommendationAugments = () => augments
    runtime.scanContextKey = () => 'ctx'
    runtime.currentRecommendationDetail = () => null
    runtime.getAugmentRound = () => ({ observe: () => ({ commitMatched: true, clearPrevious: false }) })
    runtime.setOcrScheduleOutcome = vi.fn()
    runtime.setManualOverlayMonitorDeadline = vi.fn()
    runtime.sync = vi.fn()
    runtime.lcu = { confirmGameActive: vi.fn() }
    const request = {
      slots: ['center'], previousFingerprints: ['aaaa', 'bbbb', 'cccc'],
      confirmedFingerprints: ['aaaa', 'ffff', 'cccc'], contextKey: 'ctx',
      previousOverlay: [
        { slot: 'left', augmentId: 1 }, { slot: 'center', augmentId: 2 }, { slot: 'right', augmentId: 3 },
      ],
    }
    const scan = vi.fn()
      .mockResolvedValueOnce({
        status: 'matched',
        slots: [{ slot: 'center', rawText: '海克斯9', augmentId: 9, name: '海克斯9', confidence: 1 }],
        fingerprints: ['aaaa', 'ffff', 'gggg'], durationMs: 10, error: null,
      })
      .mockResolvedValueOnce({
        status: 'matched',
        slots: [
          { slot: 'left', rawText: '海克斯1', augmentId: 1, name: '海克斯1', confidence: 1 },
          { slot: 'center', rawText: '海克斯9', augmentId: 9, name: '海克斯9', confidence: 1 },
          { slot: 'right', rawText: '海克斯3', augmentId: 3, name: '海克斯3', confidence: 1 },
        ],
        fingerprints: ['aaaa', 'ffff', 'gggg'], durationMs: 10, error: null,
      })
    runtime.scanner = { scan }

    await expect(runtime.runScan(false, undefined, true, request)).resolves.toMatchObject({ ok: false, code: 'UNRELIABLE' })
    expect(runtime.overlay.slots[1]).toMatchObject({ augmentId: 2 })
    await expect(runtime.runScan(false, undefined, true, null)).resolves.toMatchObject({ ok: true, code: 'MATCHED' })
    expect(scan).toHaveBeenCalledTimes(2)
    expect(scan.mock.calls[0]?.[4]).toEqual({ onlySlots: ['center'] })
    expect(scan.mock.calls[1]?.[4]).toBeUndefined()
    expect(runtime.overlay.slots[1]).toMatchObject({ augmentId: 9 })
  })

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

  it('publishes and clears the bounded scheduler delay across pause/stop', async () => {
    vi.useFakeTimers()
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = { ...activeSnapshot }
    initializeAutomaticState(runtime)
    runtime.config = { getSettings: () => ({ autoOcr: true }) }
    runtime.windows = { getMainActivity: () => ({ visible: true, minimized: false }) }
    runtime.scanner = {
      probeInterface: vi.fn().mockResolvedValue({ status: 'not-detected', durationMs: 10 }),
    }

    runtime.updateScanLoop()
    expect(runtime.automaticScanNextDelayMs).toBe(2_000)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(runtime.automaticScanNextDelayMs).toBe(2_000)
    expect(runtime.ocrScheduleLastOutcome).toBe('not-detected')

    runtime.pauseScanLoop()
    expect(runtime.automaticScanPaused).toBe(true)
    expect(runtime.automaticScanNextDelayMs).toBeNull()
    runtime.stopScanLoop()
    expect(runtime.automaticScanPaused).toBe(false)
    expect(runtime.ocrScheduleLastOutcome).toBe('none')
  })

  it('publishes the final scheduled delay after a probe settles', async () => {
    vi.useFakeTimers()
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = { ...activeSnapshot }
    initializeAutomaticState(runtime)
    runtime.config = { getSettings: () => ({ autoOcr: true }) }
    runtime.windows = { getMainActivity: () => ({ visible: true, minimized: false }) }
    runtime.scanner = {
      probeInterface: vi.fn().mockResolvedValue({ status: 'error', durationMs: 10 }),
      resetPerformanceDiagnostics: vi.fn(),
    }
    const published: Array<{ delay: number | null; outcome: string }> = []
    runtime.sync = vi.fn(() => published.push({
      delay: runtime.automaticScanNextDelayMs,
      outcome: runtime.ocrScheduleLastOutcome,
    }))

    runtime.updateScanLoop()
    await vi.advanceTimersByTimeAsync(2_000)

    expect(published.at(-1)).toEqual({ delay: 4_000, outcome: 'error' })
    runtime.stopScanLoop()
  })

  it('coalesces rapid latched-probe diagnostics broadcasts to at most once per second', async () => {
    vi.useFakeTimers()
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = { ...activeSnapshot }
    initializeAutomaticState(runtime)
    runtime.automaticScanPhase = 'latched'
    runtime.automaticScanContextKey = '1:103'
    runtime.automaticFingerprint = ['1111', '1111', '1111']
    runtime.overlay = {
      visible: true,
      championId: 103,
      slots: [{ augmentId: 10 }, { augmentId: 11 }, { augmentId: 12 }],
      detectedAt: 1,
      message: '上一轮推荐',
    }
    runtime.config = { getSettings: () => ({ autoOcr: true, showInGameRecommendations: true }) }
    runtime.windows = {
      getMainActivity: () => ({ visible: true, minimized: false }),
      isLeagueGameForeground: () => true,
    }
    runtime.scanner = {
      probeInterface: vi.fn().mockResolvedValue({
        status: 'detected',
        durationMs: 10,
        fingerprints: ['1111', '1111', '1111'],
      }),
      resetPerformanceDiagnostics: vi.fn(),
    }
    runtime.sync = vi.fn()

    runtime.updateScanLoop()
    await vi.advanceTimersByTimeAsync(700)
    await vi.advanceTimersByTimeAsync(700)
    expect(runtime.scanner.probeInterface).toHaveBeenCalledTimes(2)
    expect(runtime.sync).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(300)
    expect(runtime.sync).toHaveBeenCalledTimes(2)
    runtime.stopScanLoop()
  })

  it('hard-resets OCR diagnostics when a new match generation arrives during manual OCR', () => {
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = { ...activeSnapshot }
    runtime.lcuState = { connected: false, source: null, lastError: null, lastConnectedAt: null }
    runtime.lcu = { getActiveProcessId: () => null }
    runtime.leagueClientProcessId = null
    runtime.config = { getSettings: () => ({ autoOcr: false, showChampionPanel: true }) }
    runtime.windows = { setLeagueClientProcessId: vi.fn() }
    runtime.wallpaper = { reconcile: vi.fn() }
    runtime.dataReady = false
    runtime.augmentRound = { reset: vi.fn() }
    runtime.updateScanLoop = vi.fn()
    runtime.updateGameProcessLoop = vi.fn()
    runtime.resetCurrentChampionLevel = vi.fn()
    runtime.refreshOpponentScoutPresentation = vi.fn(() => false)
    runtime.opponentScout = null
    runtime.sync = vi.fn()
    runtime.manualScanInFlight = true
    runtime.ocrScheduleLastOutcome = 'error'
    runtime.scanner = { resetPerformanceDiagnostics: vi.fn() }
    const nextSnapshot = { ...activeSnapshot, matchGeneration: 2 }
    const nextLcuState = { ...runtime.lcuState }

    runtime.handleLcuUpdate(nextSnapshot, nextLcuState)

    expect(runtime.scanner.resetPerformanceDiagnostics).toHaveBeenCalledOnce()
    expect(runtime.ocrScheduleLastOutcome).toBe('none')
  })

  it('keeps completed manual-scan diagnostics when the automatic loop is not restarted', async () => {
    vi.useFakeTimers()
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = { ...activeSnapshot }
    initializeAutomaticState(runtime)
    runtime.config = { getSettings: () => ({ autoOcr: false, showInGameRecommendations: true }) }
    runtime.windows = {
      getMainActivity: () => ({ visible: true, minimized: false }),
      isLeagueGameForeground: () => true,
    }
    runtime.scanTimer = setTimeout(() => undefined, 10_000)
    runtime.scanner = {
      waitUntilIdle: vi.fn().mockResolvedValue(true),
      resetPerformanceDiagnostics: vi.fn(),
      cheapProbeCount: 3,
    }
    runtime.runScan = vi.fn().mockResolvedValue({
      ok: false,
      code: 'NOT_DETECTED',
      message: '未检测到三张海克斯标题',
    })

    const result = await runtime.captureManualScan()

    expect(result.code).toBe('NOT_DETECTED')
    expect(runtime.scanner.resetPerformanceDiagnostics).not.toHaveBeenCalled()
    expect(runtime.scanner.cheapProbeCount).toBe(3)
    expect(runtime.manualScanInFlight).toBe(false)
    runtime.stopScanLoop()
  })

  it('eventually withdraws the same visible cards after the absence grace expires', async () => {
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
      .mockResolvedValue({ status: 'not-detected', durationMs: 10 })
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
    await vi.advanceTimersByTimeAsync(1_700)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(runtime.scanner.probeInterface).toHaveBeenCalledTimes(5)
    expect(runtime.runScan).toHaveBeenCalledOnce()
    expect(runtime.overlay.visible).toBe(false)
    expect(runtime.runScan).toHaveBeenCalledWith(false, undefined, true, null)
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
      visible: true,
      slots: [{ augmentId: 10 }, { augmentId: 11 }, { augmentId: 12 }],
      message: '检测到卡牌刷新，正在识别新一轮',
    })
    runtime.stopScanLoop()
  })

  it('passes the confirmed single-slot request first, then falls back to full OCR after failure', async () => {
    vi.useFakeTimers()
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = { ...activeSnapshot }
    initializeAutomaticState(runtime)
    runtime.config = { getSettings: () => ({ autoOcr: true, showInGameRecommendations: true }) }
    runtime.windows = { getMainActivity: () => ({ visible: true, focused: true, minimized: false }), isLeagueGameForeground: () => true }
    runtime.overlay = {
      visible: true,
      championId: 103,
      slots: [
        { slot: 'left', augmentId: 10, recommendationSource: 'dtodo', statisticsDate: '' },
        { slot: 'center', augmentId: 11, recommendationSource: 'dtodo', statisticsDate: '' },
        { slot: 'right', augmentId: 12, recommendationSource: 'dtodo', statisticsDate: '' },
      ],
      detectedAt: 1,
      message: '上一轮推荐',
    }
    runtime.automaticScanContextKey = '1:103'
    runtime.automaticScanPhase = 'latched'
    runtime.automaticFingerprint = ['aaaa', 'bbbb', 'cccc']
    runtime.scanner = {
      probeInterface: vi.fn()
        .mockResolvedValue({ status: 'detected', durationMs: 10, fingerprints: ['aaaa', 'ffff', 'cccc'] }),
    }
    runtime.runScan = vi.fn(async () => ({ ok: false, code: 'UNRELIABLE', message: 'fixture' }))

    runtime.updateScanLoop()
    await vi.advanceTimersByTimeAsync(700 + 100)

    expect(runtime.runScan).toHaveBeenCalledTimes(1)
    expect(runtime.runScan.mock.calls[0]?.[3]).toMatchObject({
      slots: ['center'],
      previousFingerprints: ['aaaa', 'bbbb', 'cccc'],
      confirmedFingerprints: ['aaaa', 'ffff', 'cccc'],
      contextKey: '1:103',
    })

    await vi.advanceTimersByTimeAsync(100)
    expect(runtime.runScan).toHaveBeenCalledTimes(2)
    expect(runtime.runScan.mock.calls[1]?.[3]).toBeNull()
    runtime.stopScanLoop()
  })

  it('keeps the reliable three-card surface through a transient refresh-probe miss', async () => {
    vi.useFakeTimers()
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = { ...activeSnapshot }
    initializeAutomaticState(runtime)
    runtime.config = { getSettings: () => ({ autoOcr: true, showInGameRecommendations: true }) }
    runtime.windows = {
      getMainActivity: () => ({ visible: true, focused: true, minimized: false }),
      isLeagueGameForeground: () => true,
    }
    runtime.overlay = {
      visible: true,
      championId: 103,
      slots: [{ augmentId: 10 }, { augmentId: 11 }, { augmentId: 12 }],
      detectedAt: 1,
      message: '上一轮推荐',
    }
    runtime.automaticScanContextKey = '1:103'
    runtime.automaticScanPhase = 'recognizing'
    runtime.automaticFingerprint = ['dddd', 'eeee', 'ffff']
    runtime.scanner = {
      probeInterface: vi.fn()
        .mockResolvedValueOnce({ status: 'not-detected', durationMs: 10, fingerprints: [] })
        .mockResolvedValueOnce({ status: 'detected', durationMs: 10, fingerprints: ['dddd', 'eeee', 'ffff'] }),
    }
    runtime.runScan = vi.fn(async () => ({ ok: true, code: 'MATCHED', message: 'matched' }))

    runtime.updateScanLoop()
    await vi.advanceTimersByTimeAsync(2_000)

    expect(runtime.scanner.probeInterface).toHaveBeenCalledOnce()
    expect(runtime.overlay.visible).toBe(true)
    expect(runtime.automaticScanPhase).toBe('recognizing')

    await vi.advanceTimersByTimeAsync(100)

    expect(runtime.scanner.probeInterface).toHaveBeenCalledTimes(2)
    expect(runtime.runScan).toHaveBeenCalledOnce()
    expect(runtime.overlay.visible).toBe(true)
    expect(runtime.automaticScanAbsences).toBe(0)
    expect(runtime.automaticScanPhase).toBe('latched')
    runtime.stopScanLoop()
  })

  it('keeps a recognizing surface through short absences and withdraws after the grace window', async () => {
    vi.useFakeTimers()
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = { ...activeSnapshot }
    initializeAutomaticState(runtime)
    runtime.config = { getSettings: () => ({ autoOcr: true, showInGameRecommendations: true }) }
    runtime.windows = {
      getMainActivity: () => ({ visible: true, focused: true, minimized: false }),
      isLeagueGameForeground: () => true,
    }
    runtime.overlay = {
      visible: true,
      championId: 103,
      slots: [{ augmentId: 10 }, { augmentId: 11 }, { augmentId: 12 }],
      detectedAt: 1,
      message: '上一轮推荐',
    }
    runtime.automaticScanContextKey = '1:103'
    runtime.automaticScanPhase = 'recognizing'
    runtime.automaticFingerprint = ['dddd', 'eeee', 'ffff']
    runtime.scanner = {
      probeInterface: vi.fn(async () => ({ status: 'not-detected', durationMs: 10, fingerprints: [] })),
    }

    runtime.updateScanLoop()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(runtime.overlay.visible).toBe(true)
    expect(runtime.automaticScanPhase).toBe('recognizing')

    await vi.advanceTimersByTimeAsync(100)

    expect(runtime.overlay.visible).toBe(true)
    expect(runtime.automaticScanAbsences).toBe(2)
    expect(runtime.automaticScanAbsenceStartedAt).not.toBeNull()

    await vi.advanceTimersByTimeAsync(1_700)

    expect(runtime.overlay.visible).toBe(false)
    expect(runtime.overlay.slots).toHaveLength(3)
    expect(runtime.automaticScanPhase).toBe('waiting')
    expect(runtime.automaticFingerprint).toBeNull()
    runtime.stopScanLoop()
  })

  it('does not carry an absence run across a probe error', async () => {
    vi.useFakeTimers()
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = { ...activeSnapshot }
    initializeAutomaticState(runtime)
    runtime.config = { getSettings: () => ({ autoOcr: true, showInGameRecommendations: true }) }
    runtime.windows = {
      getMainActivity: () => ({ visible: true, focused: true, minimized: false }),
      isLeagueGameForeground: () => true,
    }
    runtime.overlay = {
      visible: true,
      championId: 103,
      slots: [{ augmentId: 10 }, { augmentId: 11 }, { augmentId: 12 }],
      detectedAt: 1,
      message: '上一轮推荐',
    }
    runtime.automaticScanContextKey = '1:103'
    runtime.automaticScanPhase = 'recognizing'
    runtime.scanner = {
      probeInterface: vi.fn()
        .mockResolvedValueOnce({ status: 'not-detected', durationMs: 10 })
        .mockResolvedValueOnce({ status: 'error', durationMs: 10 })
        .mockResolvedValue({ status: 'not-detected', durationMs: 10 }),
    }

    runtime.updateScanLoop()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(runtime.automaticScanAbsences).toBe(1)
    expect(runtime.automaticScanAbsenceStartedAt).not.toBeNull()

    await vi.advanceTimersByTimeAsync(100)
    expect(runtime.automaticScanAbsences).toBe(0)
    expect(runtime.automaticScanAbsenceStartedAt).toBeNull()
    expect(runtime.overlay.visible).toBe(true)

    await vi.advanceTimersByTimeAsync(4_000)
    expect(runtime.automaticScanAbsences).toBe(1)
    expect(runtime.overlay.visible).toBe(true)

    await vi.advanceTimersByTimeAsync(100)
    expect(runtime.automaticScanAbsences).toBe(2)
    expect(runtime.overlay.visible).toBe(true)
    runtime.stopScanLoop()
  })

  it('starts a fresh absence grace after focus pause and recovery', async () => {
    vi.useFakeTimers()
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = { ...activeSnapshot }
    initializeAutomaticState(runtime)
    runtime.config = { getSettings: () => ({ autoOcr: true, showInGameRecommendations: true }) }
    runtime.windows = {
      getMainActivity: () => ({ visible: true, focused: true, minimized: false }),
      isLeagueGameForeground: () => true,
    }
    runtime.overlay = {
      visible: true,
      championId: 103,
      slots: [{ augmentId: 10 }, { augmentId: 11 }, { augmentId: 12 }],
      detectedAt: 1,
      message: '上一轮推荐',
    }
    runtime.automaticScanContextKey = '1:103'
    runtime.automaticScanPhase = 'recognizing'
    runtime.scanner = { probeInterface: vi.fn(async () => ({ status: 'not-detected', durationMs: 10 })) }

    runtime.updateScanLoop()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(runtime.automaticScanAbsences).toBe(1)
    expect(runtime.automaticScanAbsenceStartedAt).not.toBeNull()

    runtime.pauseScanLoop()
    expect(runtime.automaticScanAbsences).toBe(0)
    expect(runtime.automaticScanAbsenceStartedAt).toBeNull()
    runtime.updateScanLoop()
    await vi.advanceTimersByTimeAsync(2_000 + 100)

    expect(runtime.automaticScanAbsences).toBe(2)
    expect(runtime.overlay.visible).toBe(true)
    runtime.stopScanLoop()
  })

  it('keeps the surface mounted when cards return at the grace boundary', async () => {
    vi.useFakeTimers()
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = { ...activeSnapshot }
    initializeAutomaticState(runtime)
    runtime.config = { getSettings: () => ({ autoOcr: true, showInGameRecommendations: true }) }
    runtime.windows = {
      getMainActivity: () => ({ visible: true, focused: true, minimized: false }),
      isLeagueGameForeground: () => true,
    }
    const left = { augmentId: 10 } as any
    const center = { augmentId: 11 } as any
    const right = { augmentId: 12 } as any
    runtime.overlay = {
      visible: true,
      championId: 103,
      slots: [left, center, right],
      detectedAt: 1,
      message: '上一轮推荐',
    }
    runtime.automaticScanContextKey = '1:103'
    runtime.automaticScanPhase = 'recognizing'
    runtime.scanner = {
      probeInterface: vi.fn()
        .mockResolvedValueOnce({ status: 'not-detected', durationMs: 10 })
        .mockResolvedValueOnce({ status: 'not-detected', durationMs: 10 })
        .mockResolvedValueOnce({ status: 'detected', durationMs: 10, fingerprints: ['new', 'new', 'new'] }),
    }
    runtime.runScan = vi.fn(async () => {
      runtime.overlay = {
        ...runtime.overlay,
        slots: reuseUnchangedAugmentSlots(runtime.overlay.slots, [left, { augmentId: 99 }, right] as any),
      }
      return { ok: true, code: 'MATCHED', message: 'matched' }
    })

    runtime.updateScanLoop()
    await vi.advanceTimersByTimeAsync(2_000 + 100)
    expect(runtime.overlay.visible).toBe(true)
    expect(runtime.scanner.probeInterface).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(1_700)
    expect(runtime.overlay.visible).toBe(true)
    expect(runtime.scanner.probeInterface).toHaveBeenCalledTimes(3)
    expect(runtime.runScan).toHaveBeenCalledOnce()
    expect(runtime.overlay.slots[0]).toBe(left)
    expect(runtime.overlay.slots[1]).toMatchObject({ augmentId: 99 })
    expect(runtime.overlay.slots[2]).toBe(right)
    runtime.stopScanLoop()
  })

  it('does not hide a reliable surface during a long title-only refresh gap', async () => {
    vi.useFakeTimers()
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = { ...activeSnapshot }
    initializeAutomaticState(runtime)
    runtime.config = { getSettings: () => ({ autoOcr: true, showInGameRecommendations: true }) }
    runtime.windows = {
      getMainActivity: () => ({ visible: true, focused: true, minimized: false }),
      isLeagueGameForeground: () => true,
    }
    runtime.overlay = {
      visible: true,
      championId: 103,
      slots: [{ augmentId: 10 }, { augmentId: 11 }, { augmentId: 12 }],
      detectedAt: 1,
      message: '上一轮推荐',
    }
    runtime.automaticScanContextKey = '1:103'
    runtime.automaticScanPhase = 'recognizing'
    runtime.scanner = { probeInterface: vi.fn(async () => ({ status: 'not-detected', durationMs: 10 })) }

    runtime.updateScanLoop()
    await vi.advanceTimersByTimeAsync(2_000 + 100)
    expect(runtime.automaticScanAbsences).toBe(2)
    expect(runtime.overlay.visible).toBe(true)

    await vi.advanceTimersByTimeAsync(1_699)
    expect(runtime.overlay.visible).toBe(true)
    expect(runtime.scanner.probeInterface).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(1)
    expect(runtime.overlay.visible).toBe(false)
    expect(runtime.scanner.probeInterface).toHaveBeenCalledTimes(3)
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

  it('seeds the manual card fingerprint immediately and keeps the reliable surface mounted during a refresh', async () => {
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
    expect(runtime.overlay.visible).toBe(true)
    expect(runtime.overlay.slots).toHaveLength(3)
    expect(runtime.manualOverlayMonitorDeadlineAt).not.toBeNull()
    expect(runtime.augmentRound.beginNextRound).toHaveBeenCalledOnce()
    runtime.stopScanLoop()
  })

  it('keeps all cards mounted when a manual refresh first misses one slot', async () => {
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = { ...activeSnapshot }
    initializeAutomaticState(runtime)
    runtime.augmentRound = new AugmentRoundTracker()
    const settings = { autoOcr: false, showInGameRecommendations: true }
    const augments = [1, 2, 3, 9].map((id) => ({
      id,
      name: `海克斯${id}`,
      iconUrl: '',
      rarity: 1,
      rarityName: '白银',
      description: '',
      globalTier: id,
    }))
    const slot = (name: string, augmentId: number | null) => ({
      slot: name,
      rawText: augmentId == null ? '' : `海克斯${augmentId}`,
      augmentId,
      name: augmentId == null ? '' : `海克斯${augmentId}`,
      confidence: augmentId == null ? 0 : 1,
    })
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
    runtime.scanner = {
      scan: vi.fn()
        .mockResolvedValueOnce({
          status: 'matched',
          slots: [slot('left', 1), slot('center', 2), slot('right', 3)],
          fingerprints: ['a', 'b', 'c'], durationMs: 10, error: null,
        })
        .mockResolvedValueOnce({
          status: 'unreliable',
          slots: [slot('left', 1), slot('center', null), slot('right', 3)],
          fingerprints: ['d', 'e', 'f'], durationMs: 10, error: null,
        })
        .mockResolvedValueOnce({
          status: 'matched',
          slots: [slot('left', 1), slot('center', 9), slot('right', 3)],
          fingerprints: ['g', 'h', 'i'], durationMs: 10, error: null,
        }),
    }

    await expect(runtime.runScan(true)).resolves.toMatchObject({ ok: true, code: 'MATCHED' })
    const firstSlots = runtime.overlay.slots
    await expect(runtime.runScan(true)).resolves.toMatchObject({ ok: false, code: 'UNRELIABLE' })
    expect(runtime.overlay.visible).toBe(true)
    expect(runtime.overlay.slots).toBe(firstSlots)
    expect(runtime.overlay.message).toContain('确认变化')

    await expect(runtime.runScan(true)).resolves.toMatchObject({ ok: true, code: 'MATCHED' })
    expect(runtime.overlay.visible).toBe(true)
    expect(runtime.overlay.slots[0]).toBe(firstSlots[0])
    expect(runtime.overlay.slots[1]).not.toBe(firstSlots[1])
    expect(runtime.overlay.slots[2]).toMatchObject({ augmentId: 3 })
    expect(runtime.sync).toHaveBeenCalledTimes(3)
  })

  it('does not resurrect a hidden retained surface after an incomplete manual refresh', async () => {
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = { ...activeSnapshot }
    initializeAutomaticState(runtime)
    runtime.augmentRound = new AugmentRoundTracker()
    runtime.augmentRound.observe('matched', { combination: '1:2:3', manual: true })
    const augments = [1, 2, 3].map((id) => ({
      id,
      name: `海克斯${id}`,
      iconUrl: '',
      rarity: 1,
      rarityName: '白银',
      description: '',
      globalTier: id,
    }))
    runtime.config = { getSettings: () => ({ autoOcr: false, showInGameRecommendations: true }) }
    runtime.data = { getAugments: () => augments, getState: () => ({ dataVersion: 'fixture' }) }
    runtime.detail = null
    runtime.lcu = { confirmGameActive: vi.fn() }
    runtime.windows = {
      getMainActivity: () => ({ visible: true, focused: true, minimized: false }),
      isLeagueGameForeground: () => true,
    }
    runtime.overlay = {
      visible: false,
      championId: 103,
      slots: [{ augmentId: 1 }, { augmentId: 2 }, { augmentId: 3 }],
      detectedAt: 1,
      message: '卡牌界面已关闭，已保留上次可靠结果',
    }
    runtime.scanner = {
      scan: vi.fn(async () => ({
        status: 'unreliable',
        slots: [{ augmentId: 1 }, { augmentId: null }, { augmentId: 3 }],
        fingerprints: ['a', 'b', 'c'],
        durationMs: 10,
        error: null,
      })),
    }

    await expect(runtime.runScan(true)).resolves.toMatchObject({ ok: false, code: 'UNRELIABLE' })
    expect(runtime.overlay.visible).toBe(false)
    expect(runtime.overlay.slots).toHaveLength(3)
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
    expect(runtime.sync).toHaveBeenCalledTimes(3)
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

  it('does not resurrect a hidden retained surface when the automatic probe sees a new fingerprint', async () => {
    vi.useFakeTimers()
    const runtime = Object.create(HexBridgeRuntime.prototype) as any
    runtime.snapshot = { ...activeSnapshot }
    initializeAutomaticState(runtime)
    runtime.config = { getSettings: () => ({ autoOcr: true, showInGameRecommendations: true }) }
    runtime.windows = {
      getMainActivity: () => ({ visible: true, focused: true, minimized: false }),
      isLeagueGameForeground: () => true,
    }
    runtime.overlay = {
      visible: false,
      championId: 103,
      slots: [{ augmentId: 1 }, { augmentId: 2 }, { augmentId: 3 }],
      detectedAt: 1,
      message: '卡牌界面已关闭，已保留上次可靠结果',
    }
    runtime.automaticScanContextKey = '1:103'
    runtime.automaticScanPhase = 'latched'
    runtime.automaticFingerprint = ['aaaa', 'bbbb', 'cccc']
    runtime.scanner = {
      probeInterface: vi.fn()
        .mockResolvedValueOnce({ status: 'detected', durationMs: 10, fingerprints: ['dddd', 'eeee', 'ffff'] })
        .mockResolvedValue({ status: 'detected', durationMs: 10, fingerprints: ['dddd', 'eeee', 'ffff'] }),
    }
    runtime.runScan = vi.fn(async () => ({ ok: false, code: 'UNRELIABLE', message: 'fixture' }))

    runtime.updateScanLoop()
    await vi.advanceTimersByTimeAsync(800)

    expect(runtime.scanner.probeInterface).toHaveBeenCalledTimes(2)
    expect(runtime.overlay.visible).toBe(false)
    expect(runtime.overlay.slots).toHaveLength(3)
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
    await vi.advanceTimersByTimeAsync(2_800)

    expect(runtime.scanner.probeInterface).toHaveBeenCalledTimes(3)
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

  it('hides the in-game bar after the bounded absence grace even when automatic OCR is disabled', async () => {
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
    await vi.advanceTimersByTimeAsync(2_800)

    expect(runtime.scanner.probeInterface).toHaveBeenCalledTimes(3)
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
