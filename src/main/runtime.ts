import { app, screen, shell } from 'electron'
import path from 'node:path'
import type {
  AppSettings,
  AugmentOverlayState,
  ChampionAugmentData,
  ChampSelectSnapshot,
  LcuConnectionState,
  RuntimeState,
  HotkeyRegistrationResult,
} from '../shared/contracts.js'
import { buildChampionCandidates, rankAugmentSlots } from '../shared/recommendations.js'
import { ConfigStore } from './config-store.js'
import { DataService } from './data-service.js'
import { GameProcessExitGuard, inspectLeagueGameProcess } from './game-process.js'
import {
  commitHotkeyRegistration,
  registerInitialOcrHotkey,
  resolveActiveHotkeyOverride,
} from './hotkey-manager.js'
import { LcuClient } from './lcu/client.js'
import { logger } from './logger.js'
import { AugmentScanner } from './ocr/scanner.js'
import {
  classifyScanContext,
  detailRanksForCurrentChampion,
  isMatchContextOcrEligible,
  isCurrentChampionRequest,
  sameLcuState,
  sameSnapshot,
  shouldRunOcr,
} from './runtime-guards.js'
import { WindowManager } from './window-manager.js'
import { UpdateManager, type UpdateAdapter } from './update-manager.js'
import { OFFICIAL_RELEASE_PAGE_URL, STABLE_UPDATE_FEEDS } from './update-channel.js'
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

type ManualOcrCode = RuntimeState['diagnostics']['manualOcrCode']
interface ScanActionResult {
  ok: boolean
  code: ManualOcrCode
  message: string
}

export class HexBridgeRuntime {
  private readonly config = new ConfigStore()
  private readonly data: DataService
  private readonly lcu: LcuClient
  private readonly scanner: AugmentScanner
  private readonly windows: WindowManager
  private readonly updates: UpdateManager
  private snapshot: ChampSelectSnapshot = { ...EMPTY_SNAPSHOT }
  private lcuState: LcuConnectionState = { ...EMPTY_LCU }
  private overlay: AugmentOverlayState = { ...EMPTY_OVERLAY }
  private detail: ChampionAugmentData | null = null
  private scanTimer: NodeJS.Timeout | null = null
  private gameProcessTimer: NodeJS.Timeout | null = null
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
    this.windows.setActivityChangedHandler(() => this.sync())
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
    if (this.config.getSettings().autoOcr) void this.scanner.warmup().then(() => this.sync())
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

  getState(): RuntimeState {
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
    return {
      lcu: { ...this.lcuState },
      snapshot: { ...this.snapshot, benchChampionIds: [...this.snapshot.benchChampionIds] },
      api: this.data.getState(),
      update: this.updates.getState(),
      champions: this.data.getChampions(),
      candidates: buildChampionCandidates(this.snapshot, this.data.getChampions()),
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
    if (!next.autoOcr) this.stopScanLoop()
    else this.updateScanLoop()
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

  checkForUpdates(): Promise<{ ok: boolean; message: string }> {
    return this.updates.check(true)
  }

  downloadUpdate(): Promise<{ ok: boolean; message: string }> {
    return this.updates.download()
  }

  installUpdate(): { ok: boolean; message: string } {
    return this.updates.install()
  }

  async openReleasePage(): Promise<{ ok: boolean; message: string }> {
    try {
      await shell.openExternal(OFFICIAL_RELEASE_PAGE_URL, { activate: true })
      return { ok: true, message: '已打开 GitHub 官方下载页' }
    } catch (error) {
      logger.warn('Unable to open official release page', {
        errorName: error instanceof Error ? error.name : 'Error',
      })
      return { ok: false, message: '无法打开浏览器，请手动访问 GitHub Releases' }
    }
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
    this.windows.prepareToQuit()
    this.stopScanLoop()
    this.stopGameProcessLoop()
    this.updates.stop()
    this.lcu.stop()
  }

  private handleLcuUpdate(snapshot: ChampSelectSnapshot, state: LcuConnectionState): void {
    const snapshotChanged = !sameSnapshot(this.snapshot, snapshot)
    const stateChanged = !sameLcuState(this.lcuState, state)
    const oldChampion = this.snapshot.currentChampionId
    this.snapshot = snapshotChanged ? snapshot : this.snapshot
    this.lcuState = state
    if (snapshot.currentChampionId !== oldChampion) {
      const sequence = ++this.championRequestSequence
      this.detail = null
      this.overlay = { ...EMPTY_OVERLAY, championId: snapshot.currentChampionId }
      if (snapshot.currentChampionId && this.dataReady) {
        void this.refreshCurrentDetail(snapshot.currentChampionId, sequence).then(() => {
          if (sequence === this.championRequestSequence) this.sync()
        })
      }
    }
    if (!isMatchContextOcrEligible(snapshot)) {
      this.overlay = { ...EMPTY_OVERLAY, championId: snapshot.currentChampionId }
      this.getAugmentRound().reset()
    }
    this.updateScanLoop()
    this.updateGameProcessLoop()
    if (!snapshotChanged && !stateChanged) return
    this.sync()
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
          this.snapshot.currentChampionId,
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
    const settings = this.config.getSettings()
    if (!shouldRunOcr(settings.autoOcr, this.snapshot)) {
      this.stopScanLoop()
      return
    }
    if (this.scanTimer) return
    this.scanTimer = setInterval(() => void this.runScan(false), 2_000)
    void this.runScan(false)
  }

  private stopScanLoop(): void {
    if (this.scanTimer) clearInterval(this.scanTimer)
    this.scanTimer = null
  }

  private async runScan(manual: boolean): Promise<ScanActionResult> {
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
    const result = await this.scanner.scan(augments, manual)
    const contextDisposition = classifyScanContext(this.snapshot, scanGeneration, scanChampionId)
    if (contextDisposition === 'ended') {
      this.overlay = { ...EMPTY_OVERLAY, championId: this.snapshot.currentChampionId }
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
        ...EMPTY_OVERLAY,
        visible: true,
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

  private captureManualScan(): Promise<ScanActionResult> {
    const transaction = this.windows?.captureWithoutHexBridgeWindows?.bind(this.windows)
    return transaction ? transaction(() => this.runScan(true)) : this.runScan(true)
  }

  private updateGameProcessLoop(): void {
    if (this.snapshot.matchStage !== 'launching' && this.snapshot.matchStage !== 'active') {
      this.stopGameProcessLoop()
      return
    }
    if (this.gameProcessTimer) return
    this.gameProcessTimer = setInterval(() => void this.checkGameProcess(), 2_000)
    void this.checkGameProcess()
  }

  private stopGameProcessLoop(): void {
    if (this.gameProcessTimer) clearInterval(this.gameProcessTimer)
    this.gameProcessTimer = null
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
