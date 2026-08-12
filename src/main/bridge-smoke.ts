import { BrowserWindow, ipcMain } from 'electron'
import type { RuntimeState } from '../shared/contracts.js'
import { secureWebPreferences } from './window-manager.js'

const CHANNEL = 'hexbridge:get-state'
const TIMEOUT_MS = 15_000

const smokeState: RuntimeState = {
  lcu: { connected: false, source: null, lastError: null, lastConnectedAt: null },
  snapshot: {
    phase: 'None',
    locale: 'zh_CN',
    queueId: null,
    modeActive: false,
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
  champions: [],
  candidates: [],
  overlay: { visible: false, championId: null, slots: [], detectedAt: null, message: 'smoke' },
  settings: {
    visualMode: 'eco',
    autoOcr: false,
    showChampionPanel: false,
    showAugmentOverlay: false,
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
        ipc: Boolean(state && state.snapshot && state.snapshot.phase === 'None' && state.api),
      }
    })()`)
    if (!rendererResult?.bridge) throw new SmokeFailure('HB_SMOKE_BRIDGE_MISSING')
    if (!rendererResult?.ipc) throw new SmokeFailure('HB_SMOKE_IPC_FAILED')

    return {
      ok: true,
      bridge: true,
      ipc: true,
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
