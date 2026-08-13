import { app, screen, shell } from 'electron'
import path from 'node:path'
import type {
  AppSettings,
  AugmentOverlayState,
  ChampionAugmentData,
  ChampSelectSnapshot,
  LcuConnectionState,
  RuntimeState,
  VisualMode,
} from '../shared/contracts.js'
import { buildChampionCandidates, rankAugmentSlots } from '../shared/recommendations.js'
import { ConfigStore } from './config-store.js'
import { DataService } from './data-service.js'
import { isLeagueGameProcessRunning } from './game-process.js'
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
  private scanMisses = 0
  private lastCombination = ''
  private championRequestSequence = 0
  private dataReady = false
  private gpuAcceleration = true
  private onHotkeyChanged: ((hotkey: string) => void) | null = null

  constructor() {
    const userData = app.getPath('userData')
    this.data = new DataService(path.join(userData, 'data-cache'), this.config)
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
    })
  }

  async initialize(): Promise<void> {
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

  setHotkeyHandler(handler: (hotkey: string) => void): void {
    this.onHotkeyChanged = handler
    handler(this.config.getSettings().hotkey)
  }

  getState(): RuntimeState {
    const settings = this.config.getSettings()
    const activeVisualMode = this.activeVisualMode(settings)
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
    if (next.hotkey !== previous.hotkey) this.onHotkeyChanged?.(next.hotkey)
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

  async triggerOcr(): Promise<{ ok: boolean; message: string }> {
    if (!isMatchContextOcrEligible(this.snapshot)) {
      return { ok: false, message: '仅在海克斯大乱斗对局中识别' }
    }
    return this.runScan(true)
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
      this.scanMisses = 0
      this.lastCombination = ''
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
    this.scanTimer = setInterval(() => void this.runScan(false), 750)
    void this.runScan(false)
  }

  private stopScanLoop(): void {
    if (this.scanTimer) clearInterval(this.scanTimer)
    this.scanTimer = null
  }

  private async runScan(manual: boolean): Promise<{ ok: boolean; message: string }> {
    if (!isMatchContextOcrEligible(this.snapshot)) {
      return { ok: false, message: '当前没有可识别的海克斯大乱斗对局' }
    }
    const scanGeneration = this.snapshot.matchGeneration
    const scanChampionId = this.snapshot.currentChampionId
    if (scanChampionId == null) {
      return { ok: false, message: '当前没有可识别的英雄' }
    }
    const augments = this.data.getAugments()
    if (!augments.length) return { ok: false, message: '海克斯目录尚未就绪' }
    const result = await this.scanner.scan(augments, manual)
    const contextDisposition = classifyScanContext(this.snapshot, scanGeneration, scanChampionId)
    if (contextDisposition === 'ended') {
      this.overlay = { ...EMPTY_OVERLAY, championId: this.snapshot.currentChampionId }
      this.stopScanLoop()
      this.sync()
      return { ok: false, message: '对局上下文已结束' }
    }
    if (contextDisposition === 'switched') {
      // A late result from the previous generation must never clear or stop
      // the already-running scanner for the new match.
      this.updateScanLoop()
      return { ok: false, message: '识别结果已过期，新对局扫描继续运行' }
    }
    if (result.status === 'busy') return { ok: false, message: '识别任务正在运行' }
    if (result.status === 'matched') {
      this.lcu.confirmGameActive('augment-interface', scanGeneration, scanChampionId)
      const detailRanks = detailRanksForCurrentChampion(
        this.detail,
        this.snapshot.currentChampionId,
        this.data.getState().dataVersion,
      )
      const combination = result.slots.map((slot) => slot.augmentId).join(':')
      if (combination !== this.lastCombination || manual) {
        const ranked = rankAugmentSlots(result.slots, detailRanks, augments)
        this.overlay = {
          visible: true,
          championId: this.snapshot.currentChampionId,
          slots: ranked,
          detectedAt: Date.now(),
          message: ranked.some((slot) => slot.position != null) ? '推荐已更新' : '暂无可靠数据',
        }
        this.lastCombination = combination
        this.sync()
      }
      this.scanMisses = 0
      return { ok: true, message: '已识别三张海克斯' }
    }

    this.scanMisses += 1
    if (result.status === 'unreliable' && manual) {
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
    } else if (this.scanMisses >= 3 && this.overlay.visible) {
      this.overlay = { ...EMPTY_OVERLAY, championId: this.snapshot.currentChampionId }
      this.sync()
    }
    const message = result.error ?? (result.status === 'not-detected' ? '未检测到海克斯界面' : '未能可靠识别三张卡')
    return { ok: false, message }
  }

  private activeVisualMode(settings: AppSettings): VisualMode {
    if (this.snapshot.matchStage === 'launching' || this.snapshot.matchStage === 'active') return 'eco'
    if (settings.visualMode !== 'auto') return settings.visualMode
    const lowMemory = process.getSystemMemoryInfo().total < 8 * 1024 * 1024
    if (!this.gpuAcceleration || lowMemory) return 'eco'
    return 'balanced'
  }

  private updateGameProcessLoop(): void {
    if (this.snapshot.matchStage !== 'launching') {
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
  }

  private async checkGameProcess(): Promise<void> {
    if (this.gameProcessCheckInFlight || this.snapshot.matchStage !== 'launching') return
    this.gameProcessCheckInFlight = true
    const generation = this.snapshot.matchGeneration
    const championId = this.snapshot.currentChampionId
    try {
      const running = await isLeagueGameProcessRunning()
      if (
        running &&
        championId != null &&
        this.snapshot.matchStage === 'launching' &&
        this.snapshot.matchGeneration === generation &&
        this.snapshot.currentChampionId === championId
      ) {
        this.lcu.confirmGameActive('game-process', generation, championId)
      }
    } finally {
      this.gameProcessCheckInFlight = false
    }
  }

  private sync(): void {
    this.windows.sync(this.getState())
  }
}
