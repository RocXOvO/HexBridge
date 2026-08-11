import { app, screen } from 'electron'
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
import { LcuClient } from './lcu/client.js'
import { logger } from './logger.js'
import { AugmentScanner } from './ocr/scanner.js'
import {
  detailRanksForCurrentChampion,
  isCurrentChampionRequest,
  sameLcuState,
  sameSnapshot,
  shouldRunOcr,
} from './runtime-guards.js'
import { WindowManager } from './window-manager.js'

const EMPTY_SNAPSHOT: ChampSelectSnapshot = {
  phase: 'None',
  locale: 'zh_CN',
  queueId: null,
  modeActive: false,
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
  private snapshot: ChampSelectSnapshot = { ...EMPTY_SNAPSHOT }
  private lcuState: LcuConnectionState = { ...EMPTY_LCU }
  private overlay: AugmentOverlayState = { ...EMPTY_OVERLAY }
  private detail: ChampionAugmentData | null = null
  private scanTimer: NodeJS.Timeout | null = null
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
  }

  async initialize(): Promise<void> {
    this.windows.createMainWindow()
    this.windows.createCompanionWindows()
    this.gpuAcceleration = !app.getGPUFeatureStatus().gpu_compositing?.includes('disabled')
    this.lcu.on('update', (snapshot: ChampSelectSnapshot, state: LcuConnectionState) => {
      this.handleLcuUpdate(snapshot, state)
    })
    this.lcu.start()
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
    const next = this.config.updateSettings(patch)
    if (next.hotkey !== previous.hotkey) this.onHotkeyChanged?.(next.hotkey)
    if (!next.autoOcr) this.stopScanLoop()
    else this.updateScanLoop()
    this.sync()
    return next
  }

  async validateAndSaveApiKey(apiKey: string): Promise<{ ok: boolean; message: string }> {
    const result = await this.data.validateKey(apiKey)
    if (result.ok) await this.data.initialize(true)
    this.sync()
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

  async triggerOcr(): Promise<{ ok: boolean; message: string }> {
    if (!this.lcuState.connected || this.snapshot.phase !== 'InProgress' || !this.snapshot.modeActive) {
      return { ok: false, message: '仅在海克斯大乱斗对局中识别' }
    }
    return this.runScan(true)
  }

  async clearDiagnosticScreenshots(): Promise<{ ok: boolean; message: string }> {
    const removed = await this.scanner.clearDiagnostics()
    return { ok: true, message: removed ? `已清除 ${removed} 张诊断截图` : '没有诊断截图需要清除' }
  }

  startCalibration(): void {
    this.windows.startCalibration()
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
    if (!state.connected || snapshot.phase !== 'InProgress') {
      this.overlay = { ...EMPTY_OVERLAY, championId: snapshot.currentChampionId }
      this.scanMisses = 0
      this.lastCombination = ''
    }
    this.updateScanLoop()
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
    if (!shouldRunOcr(settings.autoOcr, this.lcuState.connected, this.snapshot)) {
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
    const augments = this.data.getAugments()
    if (!augments.length) return { ok: false, message: '海克斯目录尚未就绪' }
    const result = await this.scanner.scan(augments, manual)
    if (!this.lcuState.connected || this.snapshot.phase !== 'InProgress' || !this.snapshot.modeActive) {
      this.overlay = { ...EMPTY_OVERLAY, championId: this.snapshot.currentChampionId }
      this.stopScanLoop()
      this.sync()
      return { ok: false, message: '对局已结束或客户端已断开' }
    }
    if (result.status === 'busy') return { ok: false, message: '识别任务正在运行' }
    if (result.status === 'matched') {
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
    if (this.snapshot.phase === 'InProgress') return 'eco'
    if (settings.visualMode !== 'auto') return settings.visualMode
    const lowMemory = process.getSystemMemoryInfo().total < 8 * 1024 * 1024
    if (!this.gpuAcceleration || lowMemory) return 'eco'
    return 'balanced'
  }

  private sync(): void {
    this.windows.sync(this.getState())
  }
}
