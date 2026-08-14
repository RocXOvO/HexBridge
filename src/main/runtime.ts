import { app, screen, shell } from 'electron'
import path from 'node:path'
import type {
  AppSettings,
  AugmentOverlayState,
  ChampionAugmentData,
  ChampSelectSnapshot,
  LcuConnectionState,
  OpponentScoutState,
  ScoutPlayerDetailsResult,
  RuntimeState,
  HotkeyRegistrationResult,
} from '../shared/contracts.js'
import { buildChampionCandidates, rankAugmentSlots } from '../shared/recommendations.js'
import { ConfigStore } from './config-store.js'
import { DataService } from './data-service.js'
import { GameProcessExitGuard, gameProcessPollInterval, inspectLeagueGameProcess } from './game-process.js'
import {
  commitHotkeyRegistration,
  registerInitialOcrHotkey,
  resolveActiveHotkeyOverride,
} from './hotkey-manager.js'
import { LcuClient } from './lcu/client.js'
import { logger } from './logger.js'
import { AugmentScanner } from './ocr/scanner.js'
import {
  automaticOcrErrorDelay,
  classifyScanContext,
  detailBuildForCurrentChampion,
  detailRanksForCurrentChampion,
  isMatchContextOcrEligible,
  isCurrentChampionRequest,
  fingerprintDistance,
  sameLcuState,
  sameSnapshot,
  shouldRunOcr,
} from './runtime-guards.js'
import { WindowManager } from './window-manager.js'
import { UpdateManager, type UpdateAdapter } from './update-manager.js'
import { STABLE_UPDATE_FEEDS } from './update-channel.js'
import { resolveAutomaticVisualMode } from './visual-policy.js'
import { AugmentRoundTracker } from './augment-round.js'

const EMPTY_SNAPSHOT: ChampSelectSnapshot = {
  phase: 'None',
  locale: 'zh_CN',
  queueId: null,
  modeActive: false,
  matchStage: 'none',
  matchGeneration: 0,
  currentChampionId: null,
  benchChampionIds: [],
  benchEnabled: false,
  updatedAt: Date.now(),
}

const EMPTY_LCU: LcuConnectionState = {
  connected: false,
  source: null,
  lastError: null,
  lastConnectedAt: null,
}

const EMPTY_OVERLAY: AugmentOverlayState = {
  visible: false,
  championId: null,
  slots: [],
  detectedAt: null,
  message: '等待海克斯界面',
}

const DISABLED_OPPONENT_SCOUT: OpponentScoutState = {
  status: 'disabled',
  reason: 'disabled',
  matchGeneration: null,
  allies: [],
  opponents: [],
  sampledAt: null,
  source: null,
  message: '对手近期状态实验未开启',
}

type ManualOcrCode = RuntimeState['diagnostics']['manualOcrCode']
interface ScanActionResult {
  ok: boolean
  code: ManualOcrCode
  message: string
}

const AUTO_OCR_WAIT_MS = 2_000
const AUTO_OCR_VISIBLE_MS = 700
const AUTO_OCR_CHANGE_CONFIRM_MS = 280
const AUTO_OCR_UNRELIABLE_RETRY_LIMIT = 4
const MANUAL_OVERLAY_PROBE_MS = 1_000
const MANUAL_OVERLAY_MONITOR_MAX_MS = 45_000
const OPPONENT_SCOUT_ACTIVE_RETRY_MS = [3_000, 5_000, 10_000, 15_000, 15_000] as const

export class HexBridgeRuntime {
  private readonly config = new ConfigStore(app.getVersion())
  private readonly data: DataService
  private readonly lcu: LcuClient
  private readonly scanner: AugmentScanner
  private readonly windows: WindowManager
  private readonly updates: UpdateManager
  private snapshot: ChampSelectSnapshot = { ...EMPTY_SNAPSHOT }
  private lcuState: LcuConnectionState = { ...EMPTY_LCU }
  private overlay: AugmentOverlayState = { ...EMPTY_OVERLAY }
  private opponentScout: OpponentScoutState = { ...DISABLED_OPPONENT_SCOUT }
  private opponentScoutSequence = 0
  private opponentScoutAttemptKey: string | null = null
  private opponentScoutAbort: AbortController | null = null
  private opponentScoutRetryTimer: NodeJS.Timeout | null = null
  private opponentScoutRetryAttempt = 0
  private detail: ChampionAugmentData | null = null
  private scanTimer: NodeJS.Timeout | null = null
  private automaticScanPhase: 'waiting' | 'recognizing' | 'latched' = 'waiting'
  private automaticScanAbsences = 0
  private automaticScanErrors = 0
  private automaticFullAttempts = 0
  private automaticFingerprint: string[] | null = null
  private automaticFingerprintCandidate: string[] | null = null
  private automaticFingerprintSamples = 0
  private automaticScanEpoch = 0
  private automaticScanContextKey: string | null = null
  private automaticScanInFlightEpoch: number | null = null
  private manualScanInFlight = false
  private manualOverlayMonitorDeadlineAt: number | null = null
  private manualOverlayExpiryTimer: NodeJS.Timeout | null = null
  private stopping = false
  private gameProcessTimer: NodeJS.Timeout | null = null
  private gameProcessPollMs: number | null = null
  private gameProcessCheckInFlight = false
  private readonly gameProcessExitGuard = new GameProcessExitGuard()
  private augmentRound = new AugmentRoundTracker()
  private championRequestSequence = 0
  private dataReady = false
  private gpuAcceleration = true
  private onHotkeyChanged: ((hotkey: string) => HotkeyRegistrationResult) | null = null
  private activeHotkeyOverride: string | null = null
  private manualOcrSequence = 0
  private manualOcr: Pick<RuntimeState['diagnostics'], 'manualOcrStatus' | 'manualOcrCode' | 'manualOcrSource' | 'manualOcrTriggeredAt' | 'manualOcrMessage'> = {
    manualOcrStatus: 'idle',
    manualOcrCode: 'IDLE',
    manualOcrSource: null,
    manualOcrTriggeredAt: null,
    manualOcrMessage: '尚未手动识别',
  }

  constructor() {
    const userData = app.getPath('userData')
    this.data = new DataService(path.join(userData, 'data-cache'), this.config, app.getVersion())
    this.lcu = new LcuClient(() => this.config.getSettings().gameDirectory)
    this.scanner = new AugmentScanner(
      () => this.config.getSettings(),
      path.join(userData, 'ocr-diagnostics'),
    )
    this.windows = new WindowManager(this.config)
    this.updates = new UpdateManager({
      currentVersion: app.getVersion(),
      supported: app.isPackaged && process.platform === 'win32',
      adapterLoader: async () => {
        const updaterModule = await import('electron-updater')
        return updaterModule.default.autoUpdater as unknown as UpdateAdapter
      },
      feeds: STABLE_UPDATE_FEEDS,
      isGameInProgress: () =>
        this.snapshot.matchStage !== 'none',
      onStateChanged: () => this.sync(),
      beginInstallShutdown: () => this.windows.prepareForUpdateInstall(),
      cancelInstallShutdown: (token) => this.windows.cancelPreparedQuit(Number(token)),
    })
  }

  async initialize(): Promise<void> {
    this.stopping = false
    this.windows.setActivityChangedHandler(() => this.handleWindowActivityChanged())
    this.windows.createMainWindow()
    this.windows.createCompanionWindows()
    this.gpuAcceleration = !app.getGPUFeatureStatus().gpu_compositing?.includes('disabled')
    this.lcu.on('update', (snapshot: ChampSelectSnapshot, state: LcuConnectionState) => {
      this.handleLcuUpdate(snapshot, state)
    })
    this.lcu.on('diagnostic', () => this.sync())
    this.lcu.start()
    this.updates.initialize()
    await this.data.initialize()
    this.dataReady = true
    if (this.snapshot.currentChampionId) {
      const sequence = ++this.championRequestSequence
      void this.refreshCurrentDetail(this.snapshot.currentChampionId, sequence).then(() => {
        if (sequence === this.championRequestSequence) this.sync()
      })
    }
    this.sync()
    if (this.snapshot.matchStage !== 'launching' && this.snapshot.matchStage !== 'active') {
      void this.scanner.warmup().then(() => this.sync())
    }
  }

  setHotkeyHandler(handler: (hotkey: string) => HotkeyRegistrationResult): void {
    this.onHotkeyChanged = handler
    const configured = this.config.getSettings().hotkey
    const result = registerInitialOcrHotkey(configured, handler)
    if (result.ok && result.activeHotkey !== configured) {
      this.config.updateSettings({ hotkey: result.activeHotkey })
    }
    this.activeHotkeyOverride = resolveActiveHotkeyOverride(
      this.config.getSettings().hotkey,
      result.activeHotkey,
    )
  }

  getState(includeOpponentScout = true): RuntimeState {
    const storedSettings = this.config.getSettings()
    const settings = this.activeHotkeyOverride !== null
      ? { ...storedSettings, hotkey: this.activeHotkeyOverride }
      : storedSettings
    const mainActivity = this.windows.getMainActivity()
    const activeVisualMode = resolveAutomaticVisualMode({
      matchStage: this.snapshot.matchStage,
      mainVisible: mainActivity.visible,
      mainFocused: mainActivity.focused,
      mainMinimized: mainActivity.minimized,
      gpuAcceleration: this.gpuAcceleration,
      lowMemory: process.getSystemMemoryInfo().total < 8 * 1024 * 1024,
    })
    const scanner = this.scanner.getDiagnostics()
    const supportedChampionId = this.snapshot.modeActive ? this.snapshot.currentChampionId : null
    const publicSnapshot = this.snapshot.modeActive
      ? { ...this.snapshot, benchChampionIds: [...this.snapshot.benchChampionIds] }
      : {
          ...this.snapshot,
          currentChampionId: null,
          benchChampionIds: [],
          benchEnabled: false,
        }
    const currentBuild = detailBuildForCurrentChampion(
      this.detail,
      supportedChampionId,
      this.data.getState().dataVersion,
    )
    return {
      lcu: { ...this.lcuState },
      snapshot: publicSnapshot,
      api: this.data.getState(),
      update: this.updates.getState(),
      releaseHighlights: this.config.getReleaseHighlights(),
      champions: this.data.getChampions(),
      candidates: buildChampionCandidates(publicSnapshot, this.data.getChampions()),
      currentBuild,
      opponentScout: includeOpponentScout
        ? {
            ...this.opponentScout,
            allies: this.opponentScout.allies.map((ally) => ({ ...ally })),
            opponents: this.opponentScout.opponents.map((opponent) => ({ ...opponent })),
          }
        : { ...DISABLED_OPPONENT_SCOUT },
      overlay: { ...this.overlay, slots: [...this.overlay.slots] },
      settings,
      displays: screen.getAllDisplays().map((display, index) => ({
        id: String(display.id),
        label: `显示器 ${index + 1}${display.id === screen.getPrimaryDisplay().id ? '（主）' : ''}`,
        width: Math.round(display.bounds.width * display.scaleFactor),
        height: Math.round(display.bounds.height * display.scaleFactor),
        scaleFactor: display.scaleFactor,
        primary: display.id === screen.getPrimaryDisplay().id,
      })),
      diagnostics: {
        ocrReady: scanner.ready,
        ocrBusy: scanner.busy,
        ocrLastDurationMs: scanner.lastDurationMs,
        ocrLastError: scanner.lastError,
        ...this.manualOcr,
        polling: true,
        activeVisualMode,
        gpuAcceleration: this.gpuAcceleration,
        logLines: logger.recent(),
      },
    }
  }

  updateSettings(patch: Partial<AppSettings>): AppSettings {
    const previous = this.config.getSettings()
    const normalizedPatch =
      patch.displayId !== undefined && patch.displayId !== previous.displayId
        ? { ...patch, calibration: null }
        : patch
    const next = this.config.updateSettings(normalizedPatch)
    if (!next.showInGameRecommendations) {
      this.setManualOverlayMonitorDeadline(null)
      if (this.overlay.visible) {
        this.overlay = {
          ...this.overlay,
          visible: false,
          message: '游戏内推荐已关闭，主窗口仍保留上次可靠结果',
        }
      }
      this.stopScanLoop()
    } else if (next.autoOcr) {
      this.setManualOverlayMonitorDeadline(null)
      this.updateScanLoop()
    } else if (!next.autoOcr && this.manualOverlayMonitorDeadlineAt == null) {
      if (previous.autoOcr && this.overlay.visible && this.overlay.slots.length === 3) {
        this.setManualOverlayMonitorDeadline(Date.now() + MANUAL_OVERLAY_MONITOR_MAX_MS)
        this.updateScanLoop()
      } else {
        this.stopScanLoop()
      }
    } else {
      this.updateScanLoop()
    }
    if (!next.opponentScouting) {
      this.cancelOpponentScoutRequest()
      this.opponentScoutSequence += 1
      this.opponentScoutAttemptKey = null
      this.opponentScout = { ...DISABLED_OPPONENT_SCOUT }
    } else if (!previous.opponentScouting) {
      this.opponentScoutAttemptKey = null
      this.updateOpponentScout(true)
    }
    if (next.gameDirectory !== previous.gameDirectory) {
      void this.retryLcuConnection().catch((error) => {
        logger.warn('LCU manual directory retry failed', {
          errorName: error instanceof Error ? error.name : 'Error',
        })
        this.sync()
      })
    }
    this.sync()
    return next
  }

  setOcrHotkey(hotkey: string): HotkeyRegistrationResult {
    const previous = this.config.getSettings().hotkey
    if (!this.onHotkeyChanged) {
      return { ok: false, activeHotkey: previous, errorCode: 'HOTKEY_UNAVAILABLE', message: '全局快捷键服务尚未就绪' }
    }
    const result = commitHotkeyRegistration(
      previous,
      this.onHotkeyChanged(hotkey),
      (activeHotkey) => this.config.updateSettings({ hotkey: activeHotkey }),
      (oldHotkey) => this.onHotkeyChanged?.(oldHotkey) ?? {
        ok: false,
        activeHotkey: previous,
        errorCode: 'HOTKEY_UNAVAILABLE',
        message: '全局快捷键服务尚未就绪',
      },
    )
    const persistedHotkey = this.config.getSettings().hotkey
    this.activeHotkeyOverride = resolveActiveHotkeyOverride(persistedHotkey, result.activeHotkey)
    this.sync()
    return result
  }

  async validateAndSaveApiKey(apiKey: string): Promise<{ ok: boolean; message: string }> {
    const result = await this.data.validateKey(apiKey)
    this.sync()
    if (result.ok) {
      void this.data.initialize(true).then(() => this.sync()).catch((error) => {
        logger.warn('Data catalog background refresh failed', error instanceof Error ? error.message : error)
        this.sync()
      })
    }
    return result
  }

  clearApiKey(): void {
    this.config.clearApiKey()
    void this.data.initialize().finally(() => this.sync())
  }

  async refreshData(): Promise<{ ok: boolean; message: string }> {
    const state = await this.data.initialize(true)
    if (state.status !== 'ready') {
      this.sync()
      const fallback = state.status === 'stale' ? '，正在使用旧缓存' : ''
      return { ok: false, message: `${state.lastError ?? '数据刷新失败'}${fallback}` }
    }
    const championId = this.snapshot.currentChampionId
    if (championId) {
      const sequence = ++this.championRequestSequence
      await this.refreshCurrentDetail(championId, sequence)
    }
    const finalState = this.data.getState()
    if (finalState.status !== 'ready') {
      this.sync()
      const fallback = finalState.status === 'stale' ? '，正在使用旧缓存' : ''
      return { ok: false, message: `${finalState.lastError ?? '英雄详情刷新失败'}${fallback}` }
    }
    this.sync()
    return { ok: true, message: '数据已刷新' }
  }

  applyUpdate(): Promise<{ ok: boolean; message: string }> {
    return this.updates.applyUpdate()
  }

  async openDeveloperPage(): Promise<{ ok: boolean; message: string }> {
    try {
      await shell.openExternal('https://data.dtodo.cn/developer.html', { activate: true })
      return { ok: true, message: '已打开 API Key 申请页' }
    } catch (error) {
      logger.warn('Unable to open API Key developer page', {
        errorName: error instanceof Error ? error.name : 'Error',
      })
      return { ok: false, message: '无法打开 API Key 申请页' }
    }
  }

  dismissReleaseHighlights(): void {
    this.config.dismissReleaseHighlights()
    this.sync()
  }

  async triggerOcr(
    source: 'button' | 'hotkey' | 'tray' = 'button',
  ): Promise<{ ok: boolean; message: string }> {
    const requestSequence = (this.manualOcrSequence ?? 0) + 1
    this.manualOcrSequence = requestSequence
    const triggeredAt = Date.now()
    this.manualOcr = {
      manualOcrStatus: 'running',
      manualOcrCode: 'RUNNING',
      manualOcrSource: source,
      manualOcrTriggeredAt: triggeredAt,
      manualOcrMessage: '正在识别三张海克斯…',
    }
    this.sync()
    try {
      const result = isMatchContextOcrEligible(this.snapshot)
        ? await this.captureManualScan()
        : { ok: false, code: 'NOT_ELIGIBLE' as const, message: '仅在海克斯大乱斗对局中识别' }
      if (requestSequence === this.manualOcrSequence) {
        this.manualOcr = {
          manualOcrStatus: result.ok ? 'matched' : result.code === 'SCAN_ERROR' ? 'error' : 'miss',
          manualOcrCode: result.code,
          manualOcrSource: source,
          manualOcrTriggeredAt: triggeredAt,
          manualOcrMessage: result.message,
        }
        this.sync()
      }
      logger.info('Manual OCR completed', {
        source,
        outcome: result.code,
        durationMs: Date.now() - triggeredAt,
      })
      return { ok: result.ok, message: result.message }
    } catch (error) {
      const result = { ok: false, message: 'OCR 识别异常，请稍后重试' }
      if (requestSequence === this.manualOcrSequence) {
        this.manualOcr = {
          manualOcrStatus: 'error',
          manualOcrCode: 'UNEXPECTED_ERROR',
          manualOcrSource: source,
          manualOcrTriggeredAt: triggeredAt,
          manualOcrMessage: result.message,
        }
        this.sync()
      }
      logger.warn('Manual OCR failed', {
        source,
        errorName: error instanceof Error ? error.name : 'Error',
      })
      return result
    }
  }

  async retryOpponentScout(): Promise<{ ok: boolean; message: string }> {
    if (!this.config.getSettings().opponentScouting) {
      return { ok: false, message: '请先在设置中开启“对手近期状态（实验）”' }
    }
    if (this.snapshot.matchStage === 'none' || !this.snapshot.modeActive) {
      return { ok: false, message: '当前没有可查询的海克斯大乱斗对局' }
    }
    await this.updateOpponentScout(true, true)
    return {
      ok: this.opponentScout.status === 'ready' || this.opponentScout.status === 'partial',
      message: this.opponentScout.message,
    }
  }

  getScoutPlayerDetails(opaqueKey: string, matchGeneration: number): ScoutPlayerDetailsResult {
    if (!/^[A-Za-z0-9_-]{24}$/.test(opaqueKey)) {
      return { ok: false, message: '明细请求已失效', details: null }
    }
    if (!this.config.getSettings().opponentScouting) {
      return { ok: false, message: '队伍近期状态实验未开启', details: null }
    }
    if (
      this.snapshot.matchStage === 'none' ||
      this.snapshot.matchGeneration !== matchGeneration
    ) {
      return { ok: false, message: '对局已切换，上一局的明细已清理', details: null }
    }
    const currentKeys = [...this.opponentScout.allies, ...this.opponentScout.opponents]
      .map((entry) => entry.opaqueKey)
      .filter((entry): entry is string => Boolean(entry))
    if (!currentKeys.includes(opaqueKey)) {
      return { ok: false, message: '该明细不属于当前对局', details: null }
    }
    const details = this.lcu.getScoutPlayerDetails(matchGeneration, opaqueKey)
    return details
      ? { ok: true, message: '已读取本机缓存的近期明细', details }
      : { ok: false, message: '该明细已过期，请重新读取', details: null }
  }

  async clearDiagnosticScreenshots(): Promise<{ ok: boolean; message: string }> {
    const removed = await this.scanner.clearDiagnostics()
    return { ok: true, message: removed ? `已清除 ${removed} 张诊断截图` : '没有诊断截图需要清除' }
  }

  async retryLcuConnection(): Promise<{ ok: boolean; message: string }> {
    const state = await this.lcu.rediscoverNow()
    this.lcuState = state
    this.sync()
    return {
      ok: state.connected,
      message: state.connected ? '已连接英雄联盟客户端' : (state.lastError ?? '仍未发现客户端'),
    }
  }

  startCalibration(): Promise<void> {
    return this.windows.startCalibration()
  }

  getCalibrationContext() {
    return this.windows.getCalibrationContext()
  }

  async previewCalibration(rects: AppSettings['calibration']): Promise<{ ok: boolean; names: string[]; message: string }> {
    const context = this.windows.getCalibrationContext()
    if (!context || !rects) return { ok: false, names: [], message: '校准会话已失效，请重新打开校准' }
    const augments = this.data.getAugments()
    if (!augments.length) return { ok: false, names: [], message: '海克斯目录尚未就绪，请先刷新数据' }
    const result = await this.scanner.previewCalibration(context.backgroundDataUrl, rects, augments)
    this.sync()
    return result
  }

  completeCalibration(rects: AppSettings['calibration']): void {
    if (rects) this.updateSettings({ calibration: rects })
    this.windows.closeCalibration()
  }

  cancelCalibration(): void {
    this.windows.closeCalibration()
  }

  getWindowManager(): WindowManager {
    return this.windows
  }

  stop(): void {
    this.stopping = true
    this.setManualOverlayMonitorDeadline(null)
    this.cancelOpponentScoutRequest()
    this.windows.prepareToQuit()
    this.stopScanLoop()
    this.stopGameProcessLoop()
    this.updates.stop()
    this.lcu.stop()
  }

  private handleLcuUpdate(snapshot: ChampSelectSnapshot, state: LcuConnectionState): void {
    const snapshotChanged = !sameSnapshot(this.snapshot, snapshot)
    const stateChanged = !sameLcuState(this.lcuState, state)
    const oldChampion = this.snapshot.modeActive ? this.snapshot.currentChampionId : null
    const nextChampion = snapshot.modeActive ? snapshot.currentChampionId : null
    const previousGeneration = this.snapshot.matchGeneration
    const wasConnected = this.lcuState.connected
    const previousSource = this.lcuState.source
    const previousConnectedAt = this.lcuState.lastConnectedAt
    this.snapshot = snapshotChanged ? snapshot : this.snapshot
    this.lcuState = state
    this.windows?.setLeagueClientProcessId?.(this.lcu?.getActiveProcessId?.() ?? null)
    if (nextChampion !== oldChampion) {
      const sequence = ++this.championRequestSequence
      this.detail = null
      this.overlay = { ...EMPTY_OVERLAY, championId: nextChampion }
      this.setManualOverlayMonitorDeadline(null)
      if (nextChampion && this.dataReady) {
        void this.refreshCurrentDetail(nextChampion, sequence).then(() => {
          if (sequence === this.championRequestSequence) this.sync()
        })
      }
    }
    if (!isMatchContextOcrEligible(snapshot)) {
      this.overlay = { ...EMPTY_OVERLAY, championId: nextChampion }
      this.setManualOverlayMonitorDeadline(null)
      this.getAugmentRound().reset()
    }
    this.updateScanLoop()
    this.updateGameProcessLoop()
    if (this.opponentScout && (
      snapshot.matchGeneration !== previousGeneration || snapshot.matchStage === 'none'
    )) {
      this.cancelOpponentScoutRequest()
      this.opponentScoutSequence += 1
      this.opponentScoutAttemptKey = null
      this.opponentScout = this.config.getSettings().opponentScouting
        ? {
            ...DISABLED_OPPONENT_SCOUT,
            status: 'idle',
            reason: 'waiting-context',
            message: '等待可查询的对手身份',
          }
        : { ...DISABLED_OPPONENT_SCOUT }
    }
    const transportChanged = state.connected && (
      !wasConnected ||
      state.source !== previousSource ||
      state.lastConnectedAt !== previousConnectedAt
    )
    if (this.opponentScout) this.updateOpponentScout(transportChanged)
    if (!snapshotChanged && !stateChanged) return
    this.sync()
  }

  private async updateOpponentScout(force = false, waitForResult = false): Promise<void> {
    const settings = this.config.getSettings()
    if (!settings.opponentScouting) {
      this.cancelOpponentScoutRequest()
      this.opponentScout = { ...DISABLED_OPPONENT_SCOUT }
      return
    }
    if (!this.snapshot.modeActive || this.snapshot.matchStage === 'none') {
      this.cancelOpponentScoutRequest()
      this.opponentScout = {
        ...DISABLED_OPPONENT_SCOUT,
        status: 'idle',
        reason: 'waiting-context',
        message: '等待可查询的对手身份',
      }
      return
    }
    const generation = this.snapshot.matchGeneration
    const attemptKey = `${generation}:${this.snapshot.matchStage}`
    if (
      !force &&
      this.opponentScout.matchGeneration === generation &&
      this.opponentScout.status === 'ready'
    ) return
    if (!force && this.opponentScoutAttemptKey === attemptKey) return
    this.opponentScoutAbort?.abort()
    this.opponentScoutAbort = null
    this.clearOpponentScoutRetry(force)
    this.opponentScoutAttemptKey = attemptKey
    const sequence = ++this.opponentScoutSequence
    const controller = new AbortController()
    this.opponentScoutAbort = controller
    this.opponentScout = {
      status: 'loading',
      reason: 'loading',
      matchGeneration: generation,
      allies: [],
      opponents: [],
      sampledAt: null,
      source: null,
      message: '正在通过本机 LCU 读取近期战绩…',
    }
    this.sync()
    const operation = this.lcu.scoutOpponents(generation, controller.signal).then((result) => {
      if (
        sequence !== this.opponentScoutSequence ||
        generation !== this.snapshot.matchGeneration ||
        !this.config.getSettings().opponentScouting
      ) return
      this.opponentScout = result
      const retryableIdentityMiss =
        result.reason === 'identity-source-unavailable' ||
        result.reason === 'identity-team-incomplete'
      if (
        result.status === 'unavailable' &&
        result.source === null &&
        this.snapshot.matchStage === 'active' &&
        retryableIdentityMiss
      ) {
        const scheduled = this.scheduleOpponentScoutRetry(generation)
        this.opponentScout = {
          ...result,
          message: scheduled
            ? result.message
            : '游戏内仍未取得完整的 5 人对手身份，可点击“重新读取”再试',
        }
      } else {
        this.clearOpponentScoutRetry()
      }
      this.sync()
    }).catch((error) => {
      if (sequence !== this.opponentScoutSequence) return
      if (error instanceof Error && error.name === 'AbortError') {
        this.opponentScoutAttemptKey = null
        const scheduled = this.snapshot.matchStage === 'active' &&
          this.snapshot.matchGeneration === generation &&
          this.scheduleOpponentScoutRetry(generation)
        this.opponentScout = {
          status: 'idle',
          reason: 'transport-switched',
          matchGeneration: generation,
          allies: [],
          opponents: [],
          sampledAt: null,
          source: null,
          message: scheduled
            ? 'LCU 连接已切换，稍后自动重新查询'
            : 'LCU 连接已切换，可手动重新查询',
        }
        this.sync()
        return
      }
      this.opponentScout = {
        status: 'error',
        reason: 'unexpected-error',
        matchGeneration: generation,
        allies: [],
        opponents: [],
        sampledAt: Date.now(),
        source: null,
        message: '本地对手战绩查询失败，可手动重试',
      }
      logger.warn('Local opponent form scan failed', {
        errorName: error instanceof Error ? error.name : 'Error',
      })
      this.sync()
    }).finally(() => {
      if (this.opponentScoutAbort === controller) this.opponentScoutAbort = null
    })
    if (waitForResult) await operation
  }

  private cancelOpponentScoutRequest(): void {
    this.opponentScoutAbort?.abort()
    this.opponentScoutAbort = null
    this.lcu.clearOpponentScoutDetails?.()
    this.clearOpponentScoutRetry()
  }

  private clearOpponentScoutRetry(resetAttempts = true): void {
    if (this.opponentScoutRetryTimer) clearTimeout(this.opponentScoutRetryTimer)
    this.opponentScoutRetryTimer = null
    if (resetAttempts) this.opponentScoutRetryAttempt = 0
  }

  private scheduleOpponentScoutRetry(generation: number): boolean {
    this.clearOpponentScoutRetry(false)
    const delay = OPPONENT_SCOUT_ACTIVE_RETRY_MS[this.opponentScoutRetryAttempt]
    if (delay == null || this.stopping) return false
    this.opponentScoutRetryAttempt += 1
    this.opponentScoutRetryTimer = setTimeout(() => {
      this.opponentScoutRetryTimer = null
      if (
        this.stopping ||
        !this.config.getSettings().opponentScouting ||
        this.snapshot.matchGeneration !== generation ||
        this.snapshot.matchStage !== 'active'
      ) return
      this.opponentScoutAttemptKey = null
      void this.updateOpponentScout()
    }, delay)
    return true
  }

  private async refreshCurrentDetail(championId: number, sequence: number): Promise<void> {
    const dataState = this.data.getState()
    if (!dataState.configured || !dataState.dataVersion) return
    try {
      const detail = await this.data.getChampionAugments(championId)
      if (
        isCurrentChampionRequest(
          championId,
          sequence,
          this.snapshot.modeActive ? this.snapshot.currentChampionId : null,
          this.championRequestSequence,
        )
      ) {
        this.detail = detail
      }
    } catch (error) {
      logger.warn('Champion augment detail unavailable', error instanceof Error ? error.message : error)
    }
  }

  private updateScanLoop(): void {
    if (this.stopping) {
      this.stopScanLoop()
      return
    }
    if (this.manualScanInFlight) return
    if (this.expireManualOverlayMonitor()) {
      this.stopScanLoop()
      return
    }
    if (!this.shouldRunAutomaticSurfaceLoop()) {
      if (this.shouldPauseAutomaticSurfaceLoop()) this.pauseScanLoop()
      else this.stopScanLoop()
      return
    }
    const contextKey = `${this.snapshot.matchGeneration}:${this.snapshot.currentChampionId ?? 0}`
    if (this.automaticScanContextKey !== contextKey) {
      this.stopScanLoop()
      this.automaticScanContextKey = contextKey
    }
    if (this.scanTimer || this.automaticScanInFlightEpoch != null) return
    const manualSurfaceVisible = !this.config.getSettings().autoOcr &&
      this.overlay.visible && this.overlay.slots.length === 3
    this.scheduleAutomaticScan(
      this.automaticScanPhase === 'latched'
        ? this.visibleSurfaceProbeDelay()
        : manualSurfaceVisible
          ? MANUAL_OVERLAY_PROBE_MS
          : AUTO_OCR_WAIT_MS,
    )
  }

  private handleWindowActivityChanged(): void {
    // Foreground loss is only a presentation boundary. WindowManager hides the
    // compact companion while League is not foreground, but the last reliable
    // surface and its bounded cheap-probe lease must survive so the observer can
    // report foreground recovery without running another full OCR pass.
    this.updateScanLoop()
    this.sync()
  }

  private scheduleAutomaticScan(delayMs: number): void {
    if (this.scanTimer) clearTimeout(this.scanTimer)
    this.scanTimer = setTimeout(() => void this.runAutomaticScan(), delayMs)
  }

  private async runAutomaticScan(): Promise<void> {
    this.scanTimer = null
    const epoch = this.automaticScanEpoch
    const generation = this.snapshot.matchGeneration
    const championId = this.snapshot.currentChampionId
    this.automaticScanInFlightEpoch = epoch
    let nextDelay = this.automaticScanPhase === 'latched'
      ? this.visibleSurfaceProbeDelay()
      : AUTO_OCR_WAIT_MS
    try {
      const probe = await this.scanner.probeInterface()
      if (!this.isAutomaticScanCurrent(epoch, generation, championId)) return
      if (probe.status === 'error') {
        this.automaticScanErrors = Math.min(3, this.automaticScanErrors + 1)
        nextDelay = automaticOcrErrorDelay(this.automaticScanErrors - 1)
      } else if (probe.status === 'not-detected') {
        this.getAugmentRound().observe('not-detected')
        this.automaticScanErrors = 0
        this.automaticScanAbsences += 1
        if (this.overlay.visible && this.automaticScanAbsences < 2) {
          nextDelay = AUTO_OCR_CHANGE_CONFIRM_MS
        }
        if (this.automaticScanPhase === 'recognizing' || this.automaticScanAbsences >= 2) {
          this.automaticScanPhase = 'waiting'
          this.automaticFullAttempts = 0
          this.automaticFingerprint = null
          this.automaticFingerprintCandidate = null
          this.automaticFingerprintSamples = 0
          nextDelay = AUTO_OCR_WAIT_MS
          if (this.overlay.visible && this.overlay.slots.length) {
            this.setManualOverlayMonitorDeadline(null)
            this.overlay = {
              ...this.overlay,
              visible: false,
              message: '卡牌界面已关闭，已保留上次可靠结果',
            }
            this.sync()
          }
        }
      } else if (probe.status === 'detected') {
        this.getAugmentRound().observe('detected')
        this.automaticScanAbsences = 0
        const fingerprints = probe.fingerprints?.length === 3 ? probe.fingerprints : null
        const automaticRecognitionEnabled = this.config.getSettings().autoOcr
        if (
          this.automaticScanPhase === 'waiting' &&
          !automaticRecognitionEnabled &&
          this.overlay.slots.length === 3
        ) {
          this.automaticScanPhase = 'latched'
          if (fingerprints) this.automaticFingerprint = [...fingerprints]
        }
        if (this.automaticScanPhase === 'latched' && fingerprints && this.automaticFingerprint) {
          if (fingerprintDistance(this.automaticFingerprint, fingerprints) >= 0.08) {
            if (
              this.automaticFingerprintCandidate &&
              fingerprintDistance(this.automaticFingerprintCandidate, fingerprints) <= 0.04
            ) {
              this.automaticFingerprintSamples += 1
            } else {
              this.automaticFingerprintCandidate = [...fingerprints]
              this.automaticFingerprintSamples = 1
            }
            nextDelay = AUTO_OCR_CHANGE_CONFIRM_MS
            if (this.automaticFingerprintSamples >= 2) {
              this.automaticScanPhase = 'recognizing'
              this.automaticFullAttempts = 0
              this.automaticFingerprint = [...fingerprints]
              this.automaticFingerprintCandidate = null
              this.automaticFingerprintSamples = 0
              this.getAugmentRound().beginNextRound()
              this.setManualOverlayMonitorDeadline(null)
              this.overlay = {
                ...this.overlay,
                visible: false,
                championId: this.snapshot.currentChampionId,
                message: '检测到卡牌刷新，正在识别新一轮',
              }
              this.sync()
            }
          } else {
            this.automaticFingerprintCandidate = null
            this.automaticFingerprintSamples = 0
          }
        }
        if (this.automaticScanPhase !== 'latched' && automaticRecognitionEnabled) {
          const result = await this.runScan(false, undefined, true)
          if (!this.isAutomaticScanCurrent(epoch, generation, championId)) return
          if (result.ok) {
            this.automaticScanErrors = 0
            this.automaticScanPhase = 'latched'
            this.automaticFullAttempts = 0
            if (fingerprints) this.automaticFingerprint = [...fingerprints]
            nextDelay = this.visibleSurfaceProbeDelay()
          } else if (result.code === 'UNRELIABLE' || result.code === 'NOT_DETECTED') {
            this.automaticScanErrors = 0
            this.automaticFullAttempts += 1
            this.automaticScanPhase = this.automaticFullAttempts >= AUTO_OCR_UNRELIABLE_RETRY_LIMIT
              ? 'latched'
              : 'recognizing'
            nextDelay = this.automaticScanPhase === 'latched'
              ? this.visibleSurfaceProbeDelay()
              : this.automaticFullAttempts === 1
                ? AUTO_OCR_CHANGE_CONFIRM_MS
                : this.automaticFullAttempts === 2
                  ? 2_000
                  : 4_000
          } else if (result.code === 'SCAN_ERROR') {
            this.automaticScanPhase = 'waiting'
            this.automaticFullAttempts = 0
            this.automaticScanErrors = Math.min(3, this.automaticScanErrors + 1)
            nextDelay = automaticOcrErrorDelay(this.automaticScanErrors - 1)
          }
        } else {
          this.automaticScanErrors = 0
          if (this.automaticFingerprintSamples === 0) nextDelay = this.visibleSurfaceProbeDelay()
        }
      }
    } finally {
      if (this.automaticScanInFlightEpoch === epoch) this.automaticScanInFlightEpoch = null
      if (!this.stopping && this.isAutomaticScanCurrent(epoch, generation, championId)) {
        this.scheduleAutomaticScan(nextDelay)
      } else if (!this.stopping) {
        this.updateScanLoop()
      }
    }
  }

  private isAutomaticScanCurrent(epoch: number, generation: number, championId: number | null): boolean {
    return epoch === this.automaticScanEpoch &&
      !this.stopping &&
      generation === this.snapshot.matchGeneration &&
      championId != null &&
      championId === this.snapshot.currentChampionId &&
      this.shouldRunAutomaticSurfaceLoop()
  }

  private shouldRunAutomaticSurfaceLoop(): boolean {
    const settings = this.config.getSettings()
    const gameForeground = Boolean(
      settings.showInGameRecommendations && this.windows.isLeagueGameForeground?.(),
    )
    const automaticRecognition = shouldRunOcr(
      settings.autoOcr,
      this.snapshot,
      this.windows.getMainActivity(),
      { enabled: settings.showInGameRecommendations, gameForeground },
    )
    const manualOverlayLifecycle =
      settings.showInGameRecommendations &&
      this.manualOverlayMonitorDeadlineAt != null &&
      Date.now() < this.manualOverlayMonitorDeadlineAt &&
      this.overlay.visible &&
      this.overlay.slots.length === 3 &&
      this.snapshot.modeActive &&
      this.snapshot.currentChampionId != null &&
      this.snapshot.matchStage === 'active' &&
      gameForeground
    return automaticRecognition || manualOverlayLifecycle
  }

  private shouldPauseAutomaticSurfaceLoop(): boolean {
    if (!isMatchContextOcrEligible(this.snapshot)) return false
    const settings = this.config.getSettings()
    if (settings.autoOcr) return true
    return settings.showInGameRecommendations &&
      this.manualOverlayMonitorDeadlineAt != null &&
      Date.now() < this.manualOverlayMonitorDeadlineAt &&
      this.overlay.visible &&
      this.overlay.slots.length === 3
  }

  private visibleSurfaceProbeDelay(): number {
    return this.config.getSettings().autoOcr ? AUTO_OCR_VISIBLE_MS : MANUAL_OVERLAY_PROBE_MS
  }

  private expireManualOverlayMonitor(): boolean {
    if (
      this.manualOverlayMonitorDeadlineAt == null ||
      Date.now() < this.manualOverlayMonitorDeadlineAt
    ) return false
    this.setManualOverlayMonitorDeadline(null)
    if (this.overlay.visible && this.overlay.slots.length === 3) {
      this.overlay = {
        ...this.overlay,
        visible: false,
        message: '卡牌界面监测已结束，已保留上次可靠结果',
      }
      this.sync()
    }
    return true
  }

  private setManualOverlayMonitorDeadline(deadlineAt: number | null): void {
    if (this.manualOverlayExpiryTimer) clearTimeout(this.manualOverlayExpiryTimer)
    this.manualOverlayExpiryTimer = null
    this.manualOverlayMonitorDeadlineAt = deadlineAt
    if (deadlineAt == null || this.stopping) return
    const expectedDeadline = deadlineAt
    this.manualOverlayExpiryTimer = setTimeout(() => {
      this.manualOverlayExpiryTimer = null
      if (this.stopping || this.manualOverlayMonitorDeadlineAt !== expectedDeadline) return
      if (this.expireManualOverlayMonitor()) this.stopScanLoop()
    }, Math.max(0, deadlineAt - Date.now()))
  }

  private pauseScanLoop(): void {
    this.automaticScanEpoch += 1
    if (this.scanTimer) clearTimeout(this.scanTimer)
    this.scanTimer = null
    this.automaticFingerprintCandidate = null
    this.automaticFingerprintSamples = 0
  }

  private stopScanLoop(): void {
    this.automaticScanEpoch += 1
    if (this.scanTimer) clearTimeout(this.scanTimer)
    this.scanTimer = null
    this.automaticScanContextKey = null
    this.automaticScanPhase = 'waiting'
    this.automaticScanAbsences = 0
    this.automaticScanErrors = 0
    this.automaticFullAttempts = 0
    this.automaticFingerprint = null
    this.automaticFingerprintCandidate = null
    this.automaticFingerprintSamples = 0
  }

  private async runScan(
    manual: boolean,
    afterCapture?: () => void,
    interfaceAlreadyDetected = false,
  ): Promise<ScanActionResult> {
    if (!isMatchContextOcrEligible(this.snapshot)) {
      return { ok: false, code: 'NOT_ELIGIBLE', message: '当前没有可识别的海克斯大乱斗对局' }
    }
    const scanGeneration = this.snapshot.matchGeneration
    const scanChampionId = this.snapshot.currentChampionId
    if (scanChampionId == null) {
      return { ok: false, code: 'NO_CHAMPION', message: '当前没有可识别的英雄' }
    }
    const augments = this.data.getAugments()
    if (!augments.length) return { ok: false, code: 'NO_CATALOG', message: '海克斯目录尚未就绪' }
    const result = await this.scanner.scan(augments, manual, afterCapture, interfaceAlreadyDetected)
    const contextDisposition = classifyScanContext(this.snapshot, scanGeneration, scanChampionId)
    if (contextDisposition === 'ended') {
      this.overlay = { ...EMPTY_OVERLAY, championId: this.snapshot.currentChampionId }
      this.setManualOverlayMonitorDeadline(null)
      this.stopScanLoop()
      this.sync()
      return { ok: false, code: 'CONTEXT_ENDED', message: '对局上下文已结束' }
    }
    if (contextDisposition === 'switched') {
      // A late result from the previous generation must never clear or stop
      // the already-running scanner for the new match.
      this.updateScanLoop()
      return { ok: false, code: 'CONTEXT_SWITCHED', message: '识别结果已过期，新对局扫描继续运行' }
    }
    if (result.status === 'busy') return { ok: false, code: 'BUSY', message: '识别任务正在运行' }
    if (result.status === 'matched') {
      this.lcu.confirmGameActive('augment-interface', scanGeneration, scanChampionId)
      const detailRanks = detailRanksForCurrentChampion(
        this.detail,
        this.snapshot.currentChampionId,
        this.data.getState().dataVersion,
      )
      const combination = result.slots.map((slot) => slot.augmentId).join(':')
      const decision = this.getAugmentRound().observe('matched', {
        combination,
        manual,
      })
      if (decision.commitMatched) {
        const ranked = rankAugmentSlots(result.slots, detailRanks, augments)
        this.setManualOverlayMonitorDeadline(manual && !this.config.getSettings().autoOcr
          ? Date.now() + MANUAL_OVERLAY_MONITOR_MAX_MS
          : null)
        this.overlay = {
          visible: true,
          championId: this.snapshot.currentChampionId,
          slots: ranked,
          detectedAt: Date.now(),
          message: ranked.some((slot) => slot.position != null) ? '推荐已更新' : '暂无可靠数据',
        }
        this.sync()
      }
      return { ok: true, code: 'MATCHED', message: '已识别三张海克斯' }
    }

    const roundDecision = this.getAugmentRound().observe(
      result.status === 'not-detected' ? 'not-detected' : result.status === 'unreliable' ? 'unreliable' : 'error',
      {
        manual,
      },
    )
    if (roundDecision.clearPrevious) {
      this.overlay = {
        ...this.overlay,
        visible: false,
        championId: this.snapshot.currentChampionId,
        message: '新一轮海克斯已出现，正在等待识别稳定',
      }
      this.sync()
    } else if (result.status === 'unreliable' && manual && !this.overlay.visible) {
      const detailRanks = detailRanksForCurrentChampion(
        this.detail,
        this.snapshot.currentChampionId,
        this.data.getState().dataVersion,
      )
      this.overlay = {
        visible: true,
        championId: this.snapshot.currentChampionId,
        slots: rankAugmentSlots(result.slots, detailRanks, augments),
        detectedAt: Date.now(),
        message: '存在未识别卡牌，请重试',
      }
      this.sync()
    }
    const matchedCount = result.slots.filter((slot) => slot.augmentId != null).length
    const message = result.error ?? (
      result.status === 'not-detected'
        ? '未检测到三张海克斯标题，请停在三卡界面或重新校准整张卡片'
        : `已识别 ${matchedCount}/3 张卡片，请等待动画稳定后重试`
    )
    const code: ManualOcrCode = result.status === 'not-detected'
      ? 'NOT_DETECTED'
      : result.status === 'unreliable'
        ? 'UNRELIABLE'
        : 'SCAN_ERROR'
    return { ok: false, code, message }
  }

  private getAugmentRound(): AugmentRoundTracker {
    this.augmentRound ??= new AugmentRoundTracker()
    return this.augmentRound
  }

  private async captureManualScan(): Promise<ScanActionResult> {
    const managesAutomaticLoop = this.scanTimer !== undefined && typeof this.scanner?.waitUntilIdle === 'function'
    if (managesAutomaticLoop) this.manualScanInFlight = true
    if (managesAutomaticLoop) this.stopScanLoop()
    try {
      const idle = managesAutomaticLoop ? await this.scanner.waitUntilIdle() : true
      if (!idle) {
        return { ok: false, code: 'BUSY', message: '后台识别正在收尾，请稍后重试' }
      }
      const transaction = this.windows?.captureWithoutHexBridgeWindows?.bind(this.windows)
      return transaction
        ? await transaction((restoreWindows) => this.runScan(true, restoreWindows))
        : await this.runScan(true)
    } finally {
      if (managesAutomaticLoop) {
        this.manualScanInFlight = false
        this.updateScanLoop()
      }
    }
  }

  private updateGameProcessLoop(): void {
    const pollMs = gameProcessPollInterval(this.snapshot.matchStage)
    if (pollMs == null) {
      this.stopGameProcessLoop()
      return
    }
    if (this.gameProcessTimer && this.gameProcessPollMs === pollMs) return
    if (this.gameProcessTimer) clearInterval(this.gameProcessTimer)
    this.gameProcessPollMs = pollMs
    this.gameProcessTimer = setInterval(() => void this.checkGameProcess(), pollMs)
  }

  private stopGameProcessLoop(): void {
    if (this.gameProcessTimer) clearInterval(this.gameProcessTimer)
    this.gameProcessTimer = null
    this.gameProcessPollMs = null
    this.gameProcessExitGuard.reset()
  }

  private async checkGameProcess(): Promise<void> {
    if (
      this.gameProcessCheckInFlight ||
      (this.snapshot.matchStage !== 'launching' && this.snapshot.matchStage !== 'active')
    ) return
    this.gameProcessCheckInFlight = true
    const generation = this.snapshot.matchGeneration
    const championId = this.snapshot.currentChampionId
    try {
      const status = await inspectLeagueGameProcess()
      const stillCurrent = championId != null &&
        (this.snapshot.matchStage === 'launching' || this.snapshot.matchStage === 'active') &&
        this.snapshot.matchGeneration === generation &&
        this.snapshot.currentChampionId === championId
      if (!stillCurrent) {
        this.gameProcessExitGuard.reset()
        return
      }
      const confirmedExit = this.gameProcessExitGuard.observe(status, {
        matchStage: this.snapshot.matchStage,
        matchGeneration: generation,
        currentChampionId: championId,
      })
      if (
        status === 'running' &&
        stillCurrent
      ) {
        this.lcu.confirmGameActive('game-process', generation, championId)
      } else if (
        confirmedExit &&
        this.snapshot.matchStage === 'active'
      ) {
        this.lcu.confirmGameInactive(generation, championId)
      }
    } finally {
      this.gameProcessCheckInFlight = false
    }
  }

  private sync(): void {
    this.windows.sync(this.getState())
  }
}
