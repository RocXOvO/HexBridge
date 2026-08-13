import { ipcMain } from 'electron'
import type { AppSettings, CalibrationRects } from '../shared/contracts.js'
import { HexBridgeRuntime } from './runtime.js'

const allowedSettingKeys = new Set<keyof AppSettings>([
  'autoOcr',
  'showChampionPanel',
  'showAugmentOverlay',
  'displayId',
  'calibration',
  'diagnosticsScreenshots',
])

function sanitizeSettings(value: unknown): Partial<AppSettings> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const patch: Partial<AppSettings> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (!allowedSettingKeys.has(key as keyof AppSettings)) continue
    if (['autoOcr', 'showChampionPanel', 'showAugmentOverlay', 'diagnosticsScreenshots'].includes(key)) {
      if (typeof entry === 'boolean') Object.assign(patch, { [key]: entry })
    } else if (key === 'displayId' && typeof entry === 'string') {
      patch.displayId = entry.slice(0, 80)
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
  ipcMain.handle('hexbridge:get-state', () => runtime.getState())
  ipcMain.handle('hexbridge:update-settings', (_event, patch) => runtime.updateSettings(sanitizeSettings(patch)))
  ipcMain.handle('hexbridge:set-ocr-hotkey', (_event, hotkey) => {
    if (typeof hotkey !== 'string' || hotkey.length > 40) {
      return { ok: false, activeHotkey: runtime.getState().settings.hotkey, errorCode: 'HOTKEY_INVALID', message: '快捷键格式无效' }
    }
    return runtime.setOcrHotkey(hotkey)
  })
  ipcMain.handle('hexbridge:validate-key', (_event, key) => {
    if (typeof key !== 'string' || key.length > 300) return { ok: false, message: 'API Key 无效' }
    return runtime.validateAndSaveApiKey(key)
  })
  ipcMain.handle('hexbridge:clear-key', () => runtime.clearApiKey())
  ipcMain.handle('hexbridge:refresh-data', () => runtime.refreshData())
  ipcMain.handle('hexbridge:check-update', () => runtime.checkForUpdates())
  ipcMain.handle('hexbridge:download-update', () => runtime.downloadUpdate())
  ipcMain.handle('hexbridge:install-update', () => runtime.installUpdate())
  ipcMain.handle('hexbridge:open-release-page', () => runtime.openReleasePage())
  ipcMain.handle('hexbridge:trigger-ocr', () => runtime.triggerOcr())
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
    runtime.getWindowManager().handleAction(event.sender, action)
  })
}
