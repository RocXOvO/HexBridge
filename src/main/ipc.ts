import { ipcMain } from 'electron'
import type { AppSettings, CalibrationRects } from '../shared/contracts.js'
import { sanitizeWallpaperEnginePreferences } from './config-store.js'
import { HexBridgeRuntime } from './runtime.js'

const allowedSettingKeys = new Set<keyof AppSettings>([
  'autoOcr',
  'showChampionPanel',
  'showInGameRecommendations',
  'opponentScouting',
  'lobbyBackground',
  'wallpaperEngineEnabled',
  'recommendationDataSource',
  'displayId',
  'calibration',
  'diagnosticsScreenshots',
])

function sanitizeSettings(value: unknown): Partial<AppSettings> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const patch: Partial<AppSettings> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (!allowedSettingKeys.has(key as keyof AppSettings)) continue
    if (['autoOcr', 'showChampionPanel', 'showInGameRecommendations', 'opponentScouting', 'lobbyBackground', 'wallpaperEngineEnabled', 'diagnosticsScreenshots'].includes(key)) {
      if (typeof entry === 'boolean') Object.assign(patch, { [key]: entry })
    } else if (key === 'displayId' && typeof entry === 'string') {
      patch.displayId = entry.slice(0, 80)
    } else if (key === 'recommendationDataSource' && (entry === 'dtodo' || entry === 'tencent101')) {
      patch.recommendationDataSource = entry
    } else if (key === 'calibration' && (entry === null || validCalibration(entry))) {
      patch.calibration = entry as CalibrationRects | null
    }
  }
  return patch
}

function validCalibration(value: unknown): value is CalibrationRects {
  if (!value || typeof value !== 'object') return false
  return ['left', 'center', 'right'].every((slot) => {
    const rect = (value as any)[slot]
    return (
      rect &&
      ['x', 'y', 'width', 'height'].every(
        (key) => typeof rect[key] === 'number' && rect[key] >= 0 && rect[key] <= 1,
      ) &&
      rect.width > 0 &&
      rect.height > 0 &&
      rect.x + rect.width <= 1.001 &&
      rect.y + rect.height <= 1.001
    )
  })
}

export function registerIpc(runtime: HexBridgeRuntime): void {
  const requireSender = (
    event: Electron.IpcMainInvokeEvent,
    name: 'main' | 'calibration',
  ): void => {
    if (!runtime.getWindowManager().isWindowSender(name, event.sender)) {
      throw new Error('该操作不允许从当前窗口调用')
    }
  }
  ipcMain.handle('hexbridge:get-state', (event) =>
    runtime.getState(runtime.getWindowManager().isWindowSender('main', event.sender)))
  ipcMain.handle('hexbridge:update-settings', (event, patch) => {
    requireSender(event, 'main')
    return runtime.updateSettings(sanitizeSettings(patch))
  })
  ipcMain.handle('hexbridge:set-lobby-background-presentation', (event, presentation) => {
    requireSender(event, 'main')
    if (!presentation || typeof presentation !== 'object' || Array.isArray(presentation)) return
    const livePageVisible = (presentation as Record<string, unknown>).livePageVisible
    const reducedMotion = (presentation as Record<string, unknown>).reducedMotion
    if (typeof livePageVisible !== 'boolean' || typeof reducedMotion !== 'boolean') return
    runtime.getWindowManager().setLobbyBackgroundPresentation({ livePageVisible, reducedMotion })
  })
  ipcMain.handle('hexbridge:set-ocr-hotkey', (event, hotkey) => {
    requireSender(event, 'main')
    if (typeof hotkey !== 'string' || hotkey.length > 40) {
      return { ok: false, activeHotkey: runtime.getState().settings.hotkey, errorCode: 'HOTKEY_INVALID', message: '快捷键格式无效' }
    }
    return runtime.setOcrHotkey(hotkey)
  })
  ipcMain.handle('hexbridge:validate-key', (event, key) => {
    requireSender(event, 'main')
    if (typeof key !== 'string' || key.length > 300) return { ok: false, message: 'API Key 无效' }
    return runtime.validateAndSaveApiKey(key)
  })
  ipcMain.handle('hexbridge:clear-key', (event) => {
    requireSender(event, 'main')
    return runtime.clearApiKey()
  })
  ipcMain.handle('hexbridge:refresh-data', (event) => {
    requireSender(event, 'main')
    return runtime.refreshData()
  })
  ipcMain.handle('hexbridge:get-champion-recommendation', (event, championId) => {
    requireSender(event, 'main')
    if (!Number.isInteger(championId) || championId < 1 || championId > 10_000) {
      return { ok: false, message: '英雄参数无效', detail: null }
    }
    return runtime.getChampionRecommendation(championId)
  })
  ipcMain.handle('hexbridge:apply-update', (event) => {
    requireSender(event, 'main')
    return runtime.applyUpdate()
  })
  ipcMain.handle('hexbridge:open-developer-page', (event) => {
    requireSender(event, 'main')
    return runtime.openDeveloperPage()
  })
  ipcMain.handle('hexbridge:dismiss-release-highlights', (event) => {
    requireSender(event, 'main')
    runtime.dismissReleaseHighlights()
  })
  ipcMain.handle('hexbridge:trigger-ocr', (event) => {
    requireSender(event, 'main')
    return runtime.triggerOcr()
  })
  ipcMain.handle('hexbridge:retry-opponent-scout', (event) => {
    requireSender(event, 'main')
    return runtime.retryOpponentScout()
  })
  ipcMain.handle('hexbridge:get-scout-player-details', (event, opaqueKey, matchGeneration) => {
    requireSender(event, 'main')
    if (
      typeof opaqueKey !== 'string' ||
      !/^[A-Za-z0-9_-]{24}$/.test(opaqueKey) ||
      !Number.isInteger(matchGeneration) ||
      matchGeneration < 1
    ) {
      return { ok: false, message: '明细请求已失效', details: null }
    }
    return runtime.getScoutPlayerDetails(opaqueKey, matchGeneration)
  })
  ipcMain.handle('hexbridge:get-wallpaper-engine-preferences', (event) => {
    requireSender(event, 'main')
    return runtime.getWallpaperEnginePreferences()
  })
  ipcMain.handle('hexbridge:save-wallpaper-engine-preferences', (event, preferences) => {
    requireSender(event, 'main')
    const safe = sanitizeWallpaperEnginePreferences(preferences)
    if (!safe) return { ok: false, message: '配置无效：英雄模板需包含 {id}，且目标名不得为空' }
    return runtime.saveWallpaperEnginePreferences(safe)
  })
  ipcMain.handle('hexbridge:retry-wallpaper-engine', (event) => {
    requireSender(event, 'main')
    return runtime.retryWallpaperEngine()
  })
  ipcMain.handle('hexbridge:clear-diagnostics', () => runtime.clearDiagnosticScreenshots())
  ipcMain.handle('hexbridge:retry-lcu', () => runtime.retryLcuConnection())
  ipcMain.handle('hexbridge:start-calibration', (event) => {
    requireSender(event, 'main')
    return runtime.startCalibration()
  })
  ipcMain.handle('hexbridge:get-calibration-context', (event) => {
    requireSender(event, 'calibration')
    return runtime.getCalibrationContext()
  })
  ipcMain.handle('hexbridge:preview-calibration', (event, rects) => {
    requireSender(event, 'calibration')
    if (!validCalibration(rects)) return { ok: false, names: [], message: '校准区域无效' }
    return runtime.previewCalibration(rects)
  })
  ipcMain.handle('hexbridge:complete-calibration', (event, rects) => {
    requireSender(event, 'calibration')
    if (!validCalibration(rects)) throw new Error('校准区域无效')
    runtime.completeCalibration(rects)
  })
  ipcMain.handle('hexbridge:cancel-calibration', (event) => {
    requireSender(event, 'calibration')
    runtime.cancelCalibration()
  })
  ipcMain.handle('hexbridge:window-action', (event, action) => {
    if (!['minimize', 'maximize', 'close', 'quit'].includes(String(action))) return
    if (action === 'quit') requireSender(event, 'main')
    runtime.getWindowManager().handleAction(event.sender, action)
  })
}
