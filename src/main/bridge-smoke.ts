import { BrowserWindow, desktopCapturer, ipcMain, screen } from 'electron'
import type { RuntimeState } from '../shared/contracts.js'
import { ConfigStore } from './config-store.js'
import { discoverLcuCredentials } from './lcu/discovery.js'
import { secureWebPreferences, WindowManager } from './window-manager.js'

const CHANNEL = 'hexbridge:get-state'
const TIMEOUT_MS = 15_000

const smokeState: RuntimeState = {
  lcu: { connected: false, source: null, lastError: null, lastConnectedAt: null },
  snapshot: {
    phase: 'None',
    locale: 'zh_CN',
    queueId: null,
    modeActive: false,
    matchStage: 'none',
    matchGeneration: 0,
    currentChampionId: null,
    benchChampionIds: [],
    benchEnabled: false,
    updatedAt: 1,
  },
  api: {
    configured: false,
    status: 'missing',
    gamePatch: '',
    dataVersion: '',
    publishedAt: '',
    lastError: null,
  },
  update: {
    status: 'unsupported',
    currentVersion: '0.1.14',
    availableVersion: null,
    releaseName: null,
    releaseNotes: '',
    percent: null,
    transferred: null,
    total: null,
    bytesPerSecond: null,
    lastCheckedAt: null,
    errorCode: null,
    message: 'smoke',
  },
  champions: [],
  candidates: [],
  overlay: { visible: false, championId: null, slots: [], detectedAt: null, message: 'smoke' },
  settings: {
    visualMode: 'eco',
    autoOcr: false,
    showChampionPanel: false,
    hotkey: 'F8',
    gameDirectory: '',
    displayId: '',
    calibration: null,
    diagnosticsScreenshots: false,
  },
  displays: [],
  diagnostics: {
    ocrReady: false,
    ocrBusy: false,
    ocrLastDurationMs: null,
    ocrLastError: null,
    manualOcrStatus: 'idle',
    manualOcrCode: 'IDLE',
    manualOcrSource: null,
    manualOcrTriggeredAt: null,
    manualOcrMessage: '尚未手动识别',
    polling: false,
    activeVisualMode: 'eco',
    gpuAcceleration: false,
    logLines: [],
  },
}

export interface BridgeSmokeResult {
  ok: true
  bridge: true
  ipc: true
  updaterBridge: true
  lcuDiscovery: true
  windowsDisplayCapture: true | null
  shutdownLifecycle: true
  security: {
    sandbox: true
    contextIsolation: true
    nodeIntegration: false
    webSecurity: true
  }
}

class SmokeFailure extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'SmokeFailure'
  }
}

export async function runBridgeSmokeTest(): Promise<BridgeSmokeResult> {
  let discovery = await discoverLcuCredentials('')
  if (!discovery.summary || !Array.isArray(discovery.candidates)) {
    throw new SmokeFailure('HB_SMOKE_LCU_DISCOVERY_FAILED')
  }
  if (
    process.platform === 'win32' &&
    !['ok', 'empty'].includes(discovery.processStrategies['get-process'])
  ) {
    // A cold Windows PowerShell startup can exceed the product discovery
    // budget on hosted runners. Retry once, but keep the executable/parse
    // assertion strict so an invalid Get-Process script still fails CI.
    discovery = await discoverLcuCredentials('')
  }
  if (
    process.platform === 'win32' &&
    !['ok', 'empty'].includes(discovery.processStrategies['get-process'])
  ) {
    throw new SmokeFailure('HB_SMOKE_GET_PROCESS_STRATEGY_FAILED')
  }
  ipcMain.removeHandler(CHANNEL)
  ipcMain.handle(CHANNEL, () => smokeState)

  const window = new BrowserWindow({
    show: false,
    webPreferences: secureWebPreferences(),
  })

  let timeout: NodeJS.Timeout | null = null
  let rejectFailure: ((error: Error) => void) | null = null
  const failure = new Promise<never>((_resolve, reject) => {
    rejectFailure = reject
  })
  const fail = (code: string): void => rejectFailure?.(new SmokeFailure(code))

  window.webContents.once('preload-error', () => fail('HB_SMOKE_PRELOAD_ERROR'))
  window.webContents.once('did-fail-load', () => fail('HB_SMOKE_LOAD_FAILED'))
  window.webContents.once('render-process-gone', () => fail('HB_SMOKE_RENDERER_GONE'))

  const verification = async (): Promise<BridgeSmokeResult> => {
    await window.loadURL('data:text/html;charset=utf-8,<html><body>HexBridge bridge smoke</body></html>')
    const preferences = (
      window.webContents as typeof window.webContents & {
        getLastWebPreferences(): Electron.WebPreferences
      }
    ).getLastWebPreferences()
    if (
      preferences.sandbox !== true ||
      preferences.contextIsolation !== true ||
      preferences.nodeIntegration !== false ||
      preferences.webSecurity !== true
    ) {
      throw new SmokeFailure('HB_SMOKE_SECURITY_REGRESSION')
    }

    const rendererResult = await window.webContents.executeJavaScript(`(async () => {
      if (!window.hexbridge || typeof window.hexbridge.getState !== 'function') {
        return { bridge: false, ipc: false }
      }
      const state = await window.hexbridge.getState()
      return {
        bridge: true,
        ipc: Boolean(state && state.snapshot && state.snapshot.phase === 'None' && state.api && state.update),
        updaterBridge: ['checkForUpdates', 'downloadUpdate', 'installUpdate', 'openReleasePage', 'setOcrHotkey', 'previewCalibration']
          .every((name) => typeof window.hexbridge[name] === 'function'),
      }
    })()`)
    if (!rendererResult?.bridge) throw new SmokeFailure('HB_SMOKE_BRIDGE_MISSING')
    if (!rendererResult?.ipc) throw new SmokeFailure('HB_SMOKE_IPC_FAILED')
    if (!rendererResult?.updaterBridge) throw new SmokeFailure('HB_SMOKE_UPDATER_BRIDGE_MISSING')

    let windowsDisplayCapture: true | null = null
    if (process.platform === 'win32') {
      const display = screen.getPrimaryDisplay()
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 480, height: 270 },
        fetchWindowIcons: false,
      })
      const source =
        sources.find((candidate) => candidate.display_id === String(display.id)) ?? sources[0]
      if (!source || source.thumbnail.isEmpty()) {
        throw new SmokeFailure('HB_SMOKE_DISPLAY_CAPTURE_FAILED')
      }
      const rendered = await window.webContents.executeJavaScript(`(() => new Promise((resolve) => {
        const image = new Image()
        image.onload = () => resolve(image.naturalWidth > 0 && image.naturalHeight > 0)
        image.onerror = () => resolve(false)
        image.src = ${JSON.stringify(source.thumbnail.toDataURL())}
      }))()`)
      if (!rendered) throw new SmokeFailure('HB_SMOKE_CAPTURE_RENDER_FAILED')
      windowsDisplayCapture = true
    }

    // Reproduce the production tray-exit order with a real BrowserWindow. A
    // late activity/sync callback must not touch the destroyed native object.
    const shutdownWindows = new WindowManager(new ConfigStore())
    const managedWindows = shutdownWindows as unknown as {
      windows: Map<'main' | 'champion' | 'calibration', BrowserWindow>
    }
    managedWindows.windows.set('champion', window)
    shutdownWindows.setActivityChangedHandler(() => shutdownWindows.sync(smokeState))
    shutdownWindows.prepareToQuit()
    window.destroy()
    shutdownWindows.sync(smokeState)

    return {
      ok: true,
      bridge: true,
      ipc: true,
      updaterBridge: true,
      lcuDiscovery: true,
      windowsDisplayCapture,
      shutdownLifecycle: true,
      security: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
      },
    }
  }

  try {
    const deadline = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => reject(new SmokeFailure('HB_SMOKE_TIMEOUT')), TIMEOUT_MS)
    })
    return await Promise.race([verification(), failure, deadline])
  } finally {
    if (timeout) clearTimeout(timeout)
    ipcMain.removeHandler(CHANNEL)
    if (!window.isDestroyed()) window.destroy()
  }
}
