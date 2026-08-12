import { app, BrowserWindow, desktopCapturer, screen } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CalibrationContext, RuntimeState } from '../shared/contracts.js'
import { ConfigStore } from './config-store.js'
import { logger } from './logger.js'
import { shouldShowChampionCompanion } from './runtime-guards.js'

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url))

type ManagedWindow = 'main' | 'champion' | 'augment' | 'calibration'

export function resolvePreloadPath(): string {
  return path.resolve(moduleDirectory, '../preload/index.cjs')
}

export function secureWebPreferences(): Electron.WebPreferences {
  return {
    preload: resolvePreloadPath(),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
    backgroundThrottling: true,
  }
}

export class WindowManager {
  private windows = new Map<ManagedWindow, BrowserWindow>()
  private quitting = false
  private latestState: RuntimeState | null = null
  private calibrationContext: CalibrationContext | null = null
  private restoreMainAfterCalibration = false

  constructor(private readonly config: ConfigStore) {}

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
    })
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
      hasShadow: true,
    })
    champion.setAlwaysOnTop(true, 'floating')
    this.rememberBounds(champion, 'champion')

    const augment = this.createWindow('augment', {
      frame: false,
      transparent: true,
      show: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      resizable: false,
      hasShadow: false,
    })
    augment.setAlwaysOnTop(true, 'screen-saver')
    augment.setIgnoreMouseEvents(true)
  }

  showMain(): void {
    const window = this.windows.get('main') ?? this.createMainWindow()
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
    this.sendLatest(window)
  }

  sync(state: RuntimeState): void {
    this.latestState = state
    const champion = this.windows.get('champion')
    const shouldShowChampion = shouldShowChampionCompanion(state.settings, state.snapshot)
    if (shouldShowChampion) champion?.showInactive()
    else champion?.hide()

    const augment = this.windows.get('augment')
    const shouldShowAugment = state.settings.showAugmentOverlay && state.overlay.visible
    if (shouldShowAugment && augment) {
      const display =
        screen.getAllDisplays().find((candidate) => String(candidate.id) === state.settings.displayId) ??
        screen.getPrimaryDisplay()
      augment.setBounds(display.bounds)
      augment.showInactive()
    } else {
      augment?.hide()
    }
    this.broadcastVisible(state)
  }

  private broadcastVisible(state: RuntimeState): void {
    for (const window of this.windows.values()) {
      if (!window.isDestroyed() && window.isVisible()) window.webContents.send('hexbridge:state', state)
    }
  }

  private sendLatest(window: BrowserWindow): void {
    if (this.latestState && !window.isDestroyed()) {
      window.webContents.send('hexbridge:state', this.latestState)
    }
  }

  async startCalibration(): Promise<void> {
    const existing = this.windows.get('calibration')
    if (existing && !existing.isDestroyed()) {
      existing.show()
      existing.focus()
      return
    }
    const display =
      screen
        .getAllDisplays()
        .find((candidate) => String(candidate.id) === this.config.getSettings().displayId) ??
      screen.getPrimaryDisplay()
    const main = this.windows.get('main')
    this.restoreMainAfterCalibration = Boolean(main?.isVisible())
    if (this.restoreMainAfterCalibration) main?.hide()

    try {
      await new Promise((resolve) => setTimeout(resolve, 220))
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
      window.showInactive()
      await this.waitForCalibrationContent(window)
      if (window.isDestroyed()) throw new Error('校准窗口意外关闭')
      window.setOpacity(1)
      window.setIgnoreMouseEvents(false)
      window.show()
      window.focus()
    } catch (error) {
      this.windows.get('calibration')?.destroy()
      this.finishCalibration()
      throw error
    }
  }

  closeCalibration(): void {
    this.windows.get('calibration')?.destroy()
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

  handleAction(sender: Electron.WebContents, action: 'minimize' | 'maximize' | 'close' | 'quit'): void {
    if (action === 'quit') {
      this.quitting = true
      app.quit()
      return
    }
    const window = BrowserWindow.fromWebContents(sender)
    if (!window) return
    if (action === 'minimize') window.minimize()
    if (action === 'maximize') {
      if (window.isMaximized()) window.unmaximize()
      else window.maximize()
    }
    if (action === 'close') window.hide()
  }

  prepareToQuit(): void {
    this.quitting = true
  }

  private createWindow(name: ManagedWindow, options: Electron.BrowserWindowConstructorOptions): BrowserWindow {
    const window = new BrowserWindow({
      ...options,
      webPreferences: secureWebPreferences(),
    })
    this.windows.set(name, window)
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
        if (error) reject(error)
        else resolve()
      }
      const loaded = (): void => finish()
      const failed = (): void => finish(new Error('校准界面加载失败'))
      const gone = (): void => finish(new Error('校准界面渲染进程异常退出'))
      window.webContents.once('did-finish-load', loaded)
      window.webContents.once('did-fail-load', failed)
      window.webContents.once('render-process-gone', gone)
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

  private rememberBounds(window: BrowserWindow, name: 'main' | 'champion'): void {
    let timer: NodeJS.Timeout | null = null
    const save = (): void => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        if (!window.isDestroyed() && !window.isMaximized()) this.config.saveWindowBounds(name, window.getBounds())
      }, 200)
    }
    window.on('move', save)
    window.on('resize', save)
  }
}
