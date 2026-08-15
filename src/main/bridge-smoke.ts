import { BrowserWindow, desktopCapturer, ipcMain, screen } from 'electron'
import type { RuntimeState } from '../shared/contracts.js'
import { ConfigStore } from './config-store.js'
import { discoverLcuCredentials, queryLeagueClientProcesses } from './lcu/discovery.js'
import { secureWebPreferences, WindowManager } from './window-manager.js'
import { cropNativeImageTitles } from './ocr/scanner.js'
import {
  smokeLeagueWindowObserverFollow,
  smokeLeagueWindowObserverScript,
} from './league-window-observer.js'
import { smokeLobbyBackgroundCapture } from './lobby-background.js'

const CHANNEL = 'hexbridge:get-state'
const TIMEOUT_MS = 24_000

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
  recommendation: {
    source: 'tencent101', status: 'missing', snapshotId: '', dataVersion: '', statisticsDate: '', stale: false, lastError: null,
  },
  update: {
    status: 'unsupported',
    currentVersion: '0.1.42',
    availableVersion: null,
    releaseName: null,
    releaseNotes: '',
    percent: null,
    transferred: null,
    total: null,
    bytesPerSecond: null,
    downloadMode: null,
    downloadModeMessage: '',
    lastCheckedAt: null,
    errorCode: null,
    message: 'smoke',
  },
  releaseHighlights: null,
  champions: [],
  candidates: [],
  currentRecommendation: null,
  currentBuild: null,
  opponentScout: {
    status: 'disabled', reason: 'disabled', matchGeneration: null, allies: [], opponents: [], sampledAt: null,
    source: null, message: '对手近期状态实验未开启',
  },
  overlay: { visible: false, championId: null, slots: [], detectedAt: null, message: 'smoke' },
  wallpaperEngine: {
    supported: true,
    configured: false,
    status: 'disabled',
    championId: null,
    errorCode: null,
    message: 'smoke',
  },
  settings: {
    visualMode: 'eco',
    autoOcr: false,
    showChampionPanel: false,
    showInGameRecommendations: true,
    opponentScouting: false,
    lobbyBackground: false,
    wallpaperEngineEnabled: false,
    recommendationDataSource: 'tencent101',
    hotkey: 'F8',
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
    presentation: {
      observer: 'stopped',
      championCompanion: 'disabled',
      augmentCompanion: 'inactive',
    },
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
  windowObserverScript: true | null
  windowObserverFollow: true | null
  lobbyBackgroundCapture: true | null
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
  const deadlineAt = Date.now() + TIMEOUT_MS
  const withinSmokeDeadline = async <T>(operation: Promise<T>): Promise<T> => {
    let phaseTimeout: NodeJS.Timeout | null = null
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_resolve, reject) => {
          phaseTimeout = setTimeout(
            () => reject(new SmokeFailure('HB_SMOKE_TIMEOUT')),
            Math.max(1, deadlineAt - Date.now()),
          )
        }),
      ])
    } finally {
      if (phaseTimeout) clearTimeout(phaseTimeout)
    }
  }

  const discovery = await withinSmokeDeadline(discoverLcuCredentials(''))
  if (!discovery.summary || !Array.isArray(discovery.candidates)) {
    throw new SmokeFailure('HB_SMOKE_LCU_DISCOVERY_FAILED')
  }
  if (
    process.platform === 'win32' &&
    !['ok', 'empty'].includes(discovery.processStrategies['get-process'])
  ) {
    // Keep the product's 1.8 second discovery budget, but separate that
    // latency target from CI's script-validity assertion. Hosted runners can
    // be heavily contended, so execute the exact production scripts once with
    // a wider smoke-only deadline before deciding that Get-Process is broken.
    const verification = await withinSmokeDeadline(
      queryLeagueClientProcesses({ 'get-process': 8_000 }),
    )
    if (!['ok', 'empty'].includes(verification.strategies['get-process'])) {
      throw new SmokeFailure('HB_SMOKE_GET_PROCESS_STRATEGY_FAILED')
    }
  }
  ipcMain.removeHandler(CHANNEL)
  ipcMain.handle(CHANNEL, () => smokeState)

  const window = new BrowserWindow({
    show: false,
    webPreferences: secureWebPreferences(),
  })

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
        updaterBridge: ['applyUpdate', 'openDeveloperPage', 'dismissReleaseHighlights', 'setOcrHotkey', 'previewCalibration']
          .every((name) => typeof window.hexbridge[name] === 'function'),
      }
    })()`)
    if (!rendererResult?.bridge) throw new SmokeFailure('HB_SMOKE_BRIDGE_MISSING')
    if (!rendererResult?.ipc) throw new SmokeFailure('HB_SMOKE_IPC_FAILED')
    if (!rendererResult?.updaterBridge) throw new SmokeFailure('HB_SMOKE_UPDATER_BRIDGE_MISSING')

    let windowsDisplayCapture: true | null = null
    let windowObserverScript: true | null = null
    let windowObserverFollow: true | null = null
    let lobbyBackgroundCapture: true | null = null
    if (process.platform === 'win32') {
      await smokeLeagueWindowObserverScript()
      windowObserverScript = true
      if (process.env.HEXBRIDGE_SMOKE_FAKE_LEAGUE === '1') {
        await smokeLeagueWindowObserverFollow(window)
        windowObserverFollow = true
        const smokeClientPid = Number(process.env.HEXBRIDGE_SMOKE_FAKE_LEAGUE_PID)
        await smokeLobbyBackgroundCapture(smokeClientPid)
        lobbyBackgroundCapture = true
      }
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
      const nativeCrops = cropNativeImageTitles(source.thumbnail, {
        left: { x: .1, y: .1, width: .2, height: .1 },
        center: { x: .4, y: .1, width: .2, height: .1 },
        right: { x: .7, y: .1, width: .2, height: .1 },
      })
      if (
        nativeCrops.length !== 3 ||
        nativeCrops.some((crop) => crop.isEmpty() || crop.toPNG().length < 16)
      ) {
        throw new SmokeFailure('HB_SMOKE_NATIVE_IMAGE_CROP_FAILED')
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
      windowObserverScript,
      windowObserverFollow,
      lobbyBackgroundCapture,
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
    return await withinSmokeDeadline(Promise.race([verification(), failure]))
  } finally {
    ipcMain.removeHandler(CHANNEL)
    if (!window.isDestroyed()) window.destroy()
  }
}
