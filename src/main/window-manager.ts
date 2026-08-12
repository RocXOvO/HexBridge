import { app, BrowserWindow, screen } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RuntimeState } from '../shared/contracts.js'
import { ConfigStore } from './config-store.js'
import { logger } from './logger.js'

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
    const shouldShowChampion =
      state.settings.showChampionPanel &&
      state.snapshot.phase === 'ChampSelect' &&
      state.snapshot.modeActive
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

  startCalibration(): void {
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
    const window = this.createWindow('calibration', {
      ...display.bounds,
      frame: false,
      transparent: true,
      show: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      fullscreenable: false,
    })
    window.setAlwaysOnTop(true, 'screen-saver')
    window.on('closed', () => this.windows.delete('calibration'))
  }

  closeCalibration(): void {
    this.windows.get('calibration')?.destroy()
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
