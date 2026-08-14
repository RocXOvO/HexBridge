import { app, BrowserWindow, desktopCapturer, screen } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AugmentOverlayViewState, CalibrationContext, RuntimeState } from '../shared/contracts.js'
import { calculateAugmentOverlayBounds, calculateAugmentOverlayColumns } from '../shared/augment-overlay-layout.js'
import { ConfigStore } from './config-store.js'
import { LeagueWindowObserver } from './league-window-observer.js'
import { logger } from './logger.js'
import { shouldShowAugmentCompanion, shouldShowChampionCompanion } from './runtime-guards.js'

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url))

type ManagedWindow = 'main' | 'champion' | 'augment' | 'calibration'

export function resolvePreloadPath(): string {
  return path.resolve(moduleDirectory, '../preload/index.cjs')
}

export function secureWebPreferences(route?: ManagedWindow): Electron.WebPreferences {
  return {
    preload: resolvePreloadPath(),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
    backgroundThrottling: true,
    ...(route ? { additionalArguments: [`--hexbridge-renderer=${route}`] } : {}),
  }
}

export function applicationIconPath(): string {
  if (process.platform === 'win32') {
    return app.isPackaged
      ? path.join(process.resourcesPath, 'icon.ico')
      : path.resolve(process.cwd(), 'build/icon.ico')
  }
  return app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.resolve(process.cwd(), 'build/icon.png')
}

export class WindowManager {
  private windows = new Map<ManagedWindow, BrowserWindow>()
  private quitting = false
  private quitCommitted = false
  private installPreparationSequence = 0
  private preparedInstallToken: number | null = null
  private latestState: RuntimeState | null = null
  private calibrationContext: CalibrationContext | null = null
  private restoreMainAfterCalibration = false
  private activityChanged: (() => void) | null = null
  private suspendedActivityChanged: (() => void) | null = null
  private lifecycleEpoch = 0
  private captureTransactionInFlight = false
  private captureWindowsHidden = false
  private championDismissedGeneration: number | null = null
  private leagueClientProcessId: number | null = null
  private readonly leagueWindows = new LeagueWindowObserver(() => this.notifyActivityChanged())

  constructor(private readonly config: ConfigStore) {}

  setActivityChangedHandler(handler: () => void): void {
    this.activityChanged = handler
  }

  private notifyActivityChanged(): void {
    if (!this.quitting) this.activityChanged?.()
  }

  private getLiveWindow(name: ManagedWindow): BrowserWindow | null {
    const window = this.windows.get(name)
    if (!window) return null
    if (!window.isDestroyed()) return window
    if (this.windows.get(name) === window) this.windows.delete(name)
    return null
  }

  getMainActivity(): { visible: boolean; focused: boolean; minimized: boolean } {
    const main = this.getLiveWindow('main')
    return {
      visible: Boolean(main && !main.isDestroyed() && main.isVisible()),
      focused: Boolean(main && !main.isDestroyed() && main.isFocused()),
      minimized: Boolean(main && !main.isDestroyed() && main.isMinimized()),
    }
  }

  isLeagueGameForeground(): boolean {
    return this.leagueWindows.isGameForeground()
  }

  createMainWindow(): BrowserWindow {
    const saved = this.config.getWindowBounds('main')
    const window = this.createWindow('main', {
      width: saved?.width ?? 1180,
      height: saved?.height ?? 760,
      x: saved?.x,
      y: saved?.y,
      minWidth: 960,
      minHeight: 640,
      frame: false,
      show: false,
      backgroundColor: '#0B0E12',
    })
    window.once('ready-to-show', () => {
      window.show()
      this.sendLatest(window)
      this.notifyActivityChanged()
    })
    window.on('show', () => this.notifyActivityChanged())
    window.on('hide', () => this.notifyActivityChanged())
    window.on('focus', () => this.notifyActivityChanged())
    window.on('blur', () => this.notifyActivityChanged())
    window.on('minimize', () => this.notifyActivityChanged())
    window.on('restore', () => this.notifyActivityChanged())
    window.on('close', (event) => {
      if (!this.quitting) {
        event.preventDefault()
        window.hide()
      }
    })
    this.rememberBounds(window, 'main')
    return window
  }

  createCompanionWindows(): void {
    const championBounds = this.config.getWindowBounds('champion')
    const champion = this.createWindow('champion', {
      width: championBounds?.width ?? 430,
      height: championBounds?.height ?? 570,
      x: championBounds?.x,
      y: championBounds?.y,
      minWidth: 360,
      minHeight: 420,
      frame: false,
      transparent: true,
      show: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: true,
      movable: false,
      hasShadow: true,
    })
    champion.setAlwaysOnTop(true, 'floating')
    this.rememberBounds(champion, 'champion', false)

    const augment = this.createWindow('augment', {
      width: 960,
      height: 96,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      show: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      resizable: false,
      movable: false,
      fullscreenable: false,
      hasShadow: false,
    })
    augment.setAlwaysOnTop(true, 'floating')
    augment.setIgnoreMouseEvents(true)
    augment.webContents.on('did-finish-load', () => {
      if (this.latestState) this.sendAugmentView(augment, this.latestState)
    })
  }

  showMain(): void {
    if (this.quitting) return
    const window = this.getLiveWindow('main') ?? this.createMainWindow()
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
    this.sendLatest(window)
  }

  setLeagueClientProcessId(processId: number | null): void {
    this.leagueClientProcessId = Number.isInteger(processId) && Number(processId) > 0
      ? Number(processId)
      : null
  }

  sync(state: RuntimeState): void {
    if (this.quitting) return
    this.latestState = state
    if (this.captureWindowsHidden) return
    const champion = this.getLiveWindow('champion')
    const augment = this.getLiveWindow('augment')
    if (
      state.snapshot.matchStage === 'none' ||
      state.snapshot.matchGeneration !== this.championDismissedGeneration
    ) {
      this.championDismissedGeneration = null
    }
    const championDismissed =
      this.championDismissedGeneration != null &&
      this.championDismissedGeneration === state.snapshot.matchGeneration
    const shouldShowChampion =
      shouldShowChampionCompanion(state.settings, state.snapshot) && !championDismissed
    const shouldObserveLeague = shouldShowChampion || (
      state.settings.showInGameRecommendations &&
      state.snapshot.matchStage === 'active' &&
      (state.settings.autoOcr || state.overlay.visible)
    )
    this.leagueWindows.setEnabled(
      shouldObserveLeague,
      shouldShowChampion ? champion : augment,
      shouldShowChampion,
      shouldShowChampion ? this.leagueClientProcessId : null,
    )
    const clientVisible = process.platform !== 'win32' || (
      this.leagueWindows.hasObservation() &&
      this.leagueWindows.isClientVisible() &&
      this.leagueWindows.isTargetPlaced()
    )
    if (shouldShowChampion && clientVisible) champion?.showInactive()
    else champion?.hide()

    const shouldShowAugment = shouldShowAugmentCompanion(
      state.settings,
      state.snapshot,
      state.overlay,
      process.platform !== 'win32' || this.leagueWindows.isGameForeground(),
    )
    if (shouldShowAugment && augment) {
      this.positionAugmentWindow(augment, state)
      this.sendAugmentView(augment, state)
      augment.showInactive()
    } else {
      augment?.hide()
    }

    this.broadcastVisible(state)
  }

  async captureWithoutHexBridgeWindows<T>(task: (restoreWindows: () => void) => Promise<T>): Promise<T> {
    if (this.quitting) throw new Error('应用正在退出，无法截图')
    if (this.captureTransactionInFlight) throw new Error('截图任务正在运行')
    if (this.getLiveWindow('calibration')) throw new Error('请先完成或取消屏幕校准')
    const lifecycleEpoch = this.lifecycleEpoch
    const original = (['main', 'champion', 'augment'] as const).map((name) => {
      const window = this.getLiveWindow(name)
      return {
        name,
        window,
        visible: Boolean(window?.isVisible()),
        minimized: Boolean(window?.isMinimized()),
      }
    })
    this.captureTransactionInFlight = true
    this.captureWindowsHidden = true
    let restored = false
    const restoreWindows = (): void => {
      if (restored) return
      restored = true
      this.captureWindowsHidden = false
      if (!this.quitting && lifecycleEpoch === this.lifecycleEpoch) {
        for (const entry of original) {
          const window = this.getLiveWindow(entry.name)
          if (!entry.visible || entry.minimized || !window) continue
          window.showInactive()
        }
        this.notifyActivityChanged()
      }
    }
    try {
      for (const entry of original) {
        if (entry.visible && !entry.window?.isDestroyed()) entry.window?.hide()
      }
      this.notifyActivityChanged()
      await new Promise((resolve) => setTimeout(resolve, 220))
      if (this.quitting || lifecycleEpoch !== this.lifecycleEpoch) throw new Error('截图已因应用状态变化取消')
      return await task(restoreWindows)
    } finally {
      this.captureTransactionInFlight = false
      restoreWindows()
    }
  }

  private broadcastVisible(state: RuntimeState): void {
    for (const [name, window] of this.windows) {
      if (window.isDestroyed()) {
        if (this.windows.get(name) === window) this.windows.delete(name)
        continue
      }
      if (name !== 'augment' && !window.webContents.isDestroyed() && window.isVisible()) {
        window.webContents.send(
          'hexbridge:state',
          name === 'main'
            ? state
            : {
                ...state,
                opponentScout: {
                  status: 'disabled',
                  reason: 'disabled',
                  matchGeneration: null,
                  allies: [],
                  opponents: [],
                  sampledAt: null,
                  source: null,
                  message: '仅主窗口可见',
                },
              },
        )
      }
    }
  }

  private sendLatest(window: BrowserWindow): void {
    if (this.latestState && !window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send('hexbridge:state', this.latestState)
    }
  }

  private sendAugmentView(window: BrowserWindow, state: RuntimeState): void {
    if (window.isDestroyed() || window.webContents.isDestroyed()) return
    const view: AugmentOverlayViewState = {
      slots: state.overlay.slots.map(({ slot, augmentId, name, position, tied, reason, pickRate }) => ({
        slot,
        augmentId,
        name,
        position,
        tied,
        reason,
        pickRate,
      })),
      layout: calculateAugmentOverlayColumns(state.settings.calibration),
      message: state.overlay.message,
    }
    window.webContents.send('hexbridge:augment-overlay', view)
  }

  async startCalibration(): Promise<void> {
    if (this.quitting) throw new Error('应用正在退出，校准已取消')
    const lifecycleEpoch = this.lifecycleEpoch
    const existing = this.getLiveWindow('calibration')
    if (existing) {
      existing.show()
      existing.focus()
      return
    }
    const display =
      screen
        .getAllDisplays()
        .find((candidate) => String(candidate.id) === this.config.getSettings().displayId) ??
      screen.getPrimaryDisplay()
    const main = this.getLiveWindow('main')
    this.restoreMainAfterCalibration = Boolean(main?.isVisible())
    if (this.restoreMainAfterCalibration) main?.hide()

    try {
      await new Promise((resolve) => setTimeout(resolve, 220))
      this.assertLifecycleActive(lifecycleEpoch)
      const physicalWidth = Math.max(1, Math.round(display.bounds.width * display.scaleFactor))
      const physicalHeight = Math.max(1, Math.round(display.bounds.height * display.scaleFactor))
      const captureWidth = Math.min(physicalWidth, 2_560)
      const captureHeight = Math.max(1, Math.round(captureWidth * physicalHeight / physicalWidth))
      let captureTimeout: NodeJS.Timeout | null = null
      const sources = await Promise.race([
        desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: captureWidth, height: captureHeight },
          fetchWindowIcons: false,
        }),
        new Promise<never>((_resolve, reject) => {
          captureTimeout = setTimeout(
            () => reject(new Error('屏幕截图超时，主窗口已恢复，请检查屏幕捕获权限')),
            5_000,
          )
        }),
      ]).finally(() => {
        if (captureTimeout) clearTimeout(captureTimeout)
      })
      this.assertLifecycleActive(lifecycleEpoch)
      const source =
        sources.find((candidate) => candidate.display_id === String(display.id)) ??
        (sources.length === 1 ? sources[0] : undefined)
      if (!source || source.thumbnail.isEmpty()) throw new Error('无法捕获目标显示器，请检查系统屏幕捕获权限')
      const displayIndex = screen.getAllDisplays().findIndex((candidate) => candidate.id === display.id)
      this.calibrationContext = {
        backgroundDataUrl: source.thumbnail.toDataURL(),
        displayLabel: `显示器 ${displayIndex + 1}${display.id === screen.getPrimaryDisplay().id ? '（主）' : ''}`,
        physicalWidth,
        physicalHeight,
        existing: this.config.getSettings().calibration,
      }

      const window = this.createWindow('calibration', {
        ...display.bounds,
        frame: false,
        transparent: false,
        backgroundColor: '#0B0E12',
        show: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        movable: false,
        fullscreenable: false,
      })
      window.setAlwaysOnTop(true, 'screen-saver')
      // A fully hidden BrowserWindow may defer image decode on Windows. Let it
      // participate in rendering at zero opacity so the screenshot is ready
      // before the user can see the calibration surface.
      window.setOpacity(0)
      window.setIgnoreMouseEvents(true)
      window.on('closed', () => this.finishCalibration())
      await this.waitForRenderer(window)
      this.assertLifecycleActive(lifecycleEpoch)
      if (window.isDestroyed()) throw new Error('校准窗口意外关闭')
      window.showInactive()
      await this.waitForCalibrationContent(window)
      this.assertLifecycleActive(lifecycleEpoch)
      if (window.isDestroyed()) throw new Error('校准窗口意外关闭')
      window.setOpacity(1)
      window.setIgnoreMouseEvents(false)
      window.show()
      window.focus()
    } catch (error) {
      this.getLiveWindow('calibration')?.destroy()
      this.finishCalibration()
      throw error
    }
  }

  closeCalibration(): void {
    this.getLiveWindow('calibration')?.destroy()
  }

  getCalibrationContext(): CalibrationContext | null {
    if (!this.calibrationContext) return null
    return {
      ...this.calibrationContext,
      existing: this.calibrationContext.existing
        ? structuredClone(this.calibrationContext.existing)
        : null,
    }
  }

  isWindowSender(name: 'main' | 'calibration', sender: Electron.WebContents): boolean {
    const window = this.windows.get(name)
    return Boolean(window && !window.isDestroyed() && window.webContents === sender)
  }

  handleAction(sender: Electron.WebContents, action: 'minimize' | 'maximize' | 'close' | 'quit'): void {
    if (action === 'quit') {
      this.prepareToQuit()
      app.quit()
      return
    }
    const managed = Array.from(this.windows.entries()).find(([, candidate]) =>
      !candidate.isDestroyed() && candidate.webContents === sender,
    )
    const window = managed?.[1] ?? BrowserWindow.fromWebContents(sender)
    if (!window || window.isDestroyed()) return
    if (action === 'minimize') window.minimize()
    if (action === 'maximize') {
      if (window.isMaximized()) window.unmaximize()
      else window.maximize()
    }
    if (action === 'close') {
      if (
        managed?.[0] === 'champion' &&
        this.latestState?.snapshot.matchStage !== 'none' &&
        (this.latestState?.snapshot.matchGeneration ?? 0) > 0
      ) {
        this.championDismissedGeneration = this.latestState!.snapshot.matchGeneration
      }
      window.hide()
      this.notifyActivityChanged()
    }
  }

  prepareToQuit(): void {
    this.quitCommitted = true
    this.preparedInstallToken = null
    this.enterShutdownState()
  }

  prepareForUpdateInstall(): number {
    const token = ++this.installPreparationSequence
    if (!this.quitCommitted) this.preparedInstallToken = token
    this.enterShutdownState()
    return token
  }

  cancelPreparedQuit(token: number): void {
    if (this.quitCommitted || token !== this.preparedInstallToken) return
    this.preparedInstallToken = null
    this.quitting = false
    this.activityChanged = this.suspendedActivityChanged
    this.suspendedActivityChanged = null
    if (this.latestState) this.sync(this.latestState)
  }

  private enterShutdownState(): void {
    if (this.quitting) return
    this.quitting = true
    this.lifecycleEpoch += 1
    this.suspendedActivityChanged = this.activityChanged
    this.activityChanged = null
    this.leagueWindows.stop()
    this.getLiveWindow('calibration')?.destroy()
  }

  private createWindow(name: ManagedWindow, options: Electron.BrowserWindowConstructorOptions): BrowserWindow {
    if (this.quitting) throw new Error('应用正在退出，不能创建窗口')
    const window = new BrowserWindow({
      icon: applicationIconPath(),
      ...options,
      webPreferences: secureWebPreferences(name),
    })
    this.windows.set(name, window)
    window.once('closed', () => {
      if (this.windows.get(name) === window) this.windows.delete(name)
    })
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('preload-error', (_event, _preloadPath, error) => {
      logger.error('HB_PRELOAD_LOAD_FAILED', {
        window: name,
        errorName: error?.name || 'Error',
      })
    })
    const guardNavigation = (event: Electron.Event, url: string): void => {
      if (!this.isAllowedNavigation(url)) event.preventDefault()
    }
    window.webContents.on('will-navigate', guardNavigation)
    window.webContents.on('will-redirect', guardNavigation)
    void this.load(window, name).catch((error) => {
      logger.error('HexBridge renderer failed to load', error instanceof Error ? error.message : error)
    })
    return window
  }

  private waitForRenderer(window: BrowserWindow): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => finish(new Error('校准界面加载超时')), 10_000)
      const finish = (error?: Error): void => {
        clearTimeout(timeout)
        window.webContents.removeListener('did-finish-load', loaded)
        window.webContents.removeListener('did-fail-load', failed)
        window.webContents.removeListener('render-process-gone', gone)
        window.removeListener('closed', closed)
        if (error) reject(error)
        else resolve()
      }
      const loaded = (): void => finish()
      const failed = (): void => finish(new Error('校准界面加载失败'))
      const gone = (): void => finish(new Error('校准界面渲染进程异常退出'))
      const closed = (): void => finish(new Error('校准界面已关闭'))
      window.webContents.once('did-finish-load', loaded)
      window.webContents.once('did-fail-load', failed)
      window.webContents.once('render-process-gone', gone)
      window.once('closed', closed)
      const currentUrl = window.webContents.getURL()
      if (currentUrl && currentUrl !== 'about:blank' && !window.webContents.isLoadingMainFrame()) {
        queueMicrotask(loaded)
      }
    })
  }

  private async waitForCalibrationContent(window: BrowserWindow): Promise<void> {
    const deadline = Date.now() + 6_000
    let lastStatus: Record<string, unknown> | null = null
    while (Date.now() < deadline && !window.isDestroyed()) {
      const status: Record<string, unknown> = await window.webContents.executeJavaScript(`(() => {
        const image = document.querySelector('.calibration-screenshot')
        const toolbar = document.querySelector('.calibration-toolbar')
        return {
          route: document.documentElement.dataset.route || location.hash,
          readyState: document.readyState,
          bridge: Boolean(window.hexbridge),
          appChildren: document.querySelector('#app')?.childElementCount ?? -1,
          toolbar: Boolean(toolbar),
          image: Boolean(image),
          imageComplete: Boolean(image?.complete),
          imageWidth: image?.naturalWidth ?? 0,
          error: document.querySelector('.calibration-error')?.textContent?.slice(0, 120) || '',
        }
      })()`)
      lastStatus = status
      if (status.toolbar && status.imageComplete && Number(status.imageWidth) > 0) return
      await new Promise((resolve) => setTimeout(resolve, 60))
    }
    throw new Error(`校准截图未能显示，请检查屏幕捕获权限后重试 (${JSON.stringify(lastStatus)})`)
  }

  private finishCalibration(): void {
    this.windows.delete('calibration')
    this.calibrationContext = null
    if (this.restoreMainAfterCalibration && !this.quitting) this.showMain()
    this.restoreMainAfterCalibration = false
  }

  private assertLifecycleActive(epoch: number): void {
    if (this.quitting || epoch !== this.lifecycleEpoch) {
      throw new Error('应用正在退出，校准已取消')
    }
  }

  private isAllowedNavigation(url: string): boolean {
    try {
      const target = new URL(url)
      if (process.env.ELECTRON_RENDERER_URL) {
        const allowed = new URL(process.env.ELECTRON_RENDERER_URL)
        return (
          target.origin === allowed.origin &&
          target.pathname === allowed.pathname &&
          target.search === allowed.search
        )
      }
      if (target.protocol !== 'file:') return false
      const rendererEntry = path.resolve(moduleDirectory, '../../dist/index.html')
      return path.resolve(fileURLToPath(target)) === rendererEntry
    } catch {
      return false
    }
  }

  private async load(window: BrowserWindow, name: ManagedWindow): Promise<void> {
    const route = name === 'main' ? 'main' : name
    if (process.env.ELECTRON_RENDERER_URL) {
      await window.loadURL(`${process.env.ELECTRON_RENDERER_URL}#${route}`)
    } else {
      await window.loadFile(path.resolve(moduleDirectory, '../../dist/index.html'), { hash: route })
    }
  }

  private positionAugmentWindow(window: BrowserWindow, state: RuntimeState): void {
    const displays = screen.getAllDisplays()
    const display = displays.find((candidate) => String(candidate.id) === state.settings.displayId) ?? screen.getPrimaryDisplay()
    const bounds = calculateAugmentOverlayBounds(
      state.settings.calibration,
      display.bounds,
      display.workArea,
    )
    const current = window.getBounds()
    if (
      current.x !== bounds.x || current.y !== bounds.y ||
      current.width !== bounds.width || current.height !== bounds.height
    ) {
      window.setBounds(bounds, false)
    }
  }

  private rememberBounds(window: BrowserWindow, name: 'main' | 'champion', rememberMoves = true): void {
    let timer: NodeJS.Timeout | null = null
    const save = (): void => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        if (!window.isDestroyed() && !window.isMaximized()) this.config.saveWindowBounds(name, window.getBounds())
      }, 200)
    }
    if (rememberMoves) window.on('move', save)
    window.on('resize', save)
  }
}
