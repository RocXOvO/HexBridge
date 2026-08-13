import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, CalibrationRects, HexBridgeApi, RuntimeState } from '../shared/contracts.js'

const api: HexBridgeApi = {
  getState: () => ipcRenderer.invoke('hexbridge:get-state'),
  onStateChanged: (callback: (state: RuntimeState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: RuntimeState): void => callback(state)
    ipcRenderer.on('hexbridge:state', listener)
    return () => ipcRenderer.removeListener('hexbridge:state', listener)
  },
  updateSettings: (patch: Partial<AppSettings>) => ipcRenderer.invoke('hexbridge:update-settings', patch),
  setOcrHotkey: (hotkey: string) => ipcRenderer.invoke('hexbridge:set-ocr-hotkey', hotkey),
  validateAndSaveApiKey: (apiKey: string) => ipcRenderer.invoke('hexbridge:validate-key', apiKey),
  clearApiKey: () => ipcRenderer.invoke('hexbridge:clear-key'),
  refreshData: () => ipcRenderer.invoke('hexbridge:refresh-data'),
  checkForUpdates: () => ipcRenderer.invoke('hexbridge:check-update'),
  downloadUpdate: () => ipcRenderer.invoke('hexbridge:download-update'),
  installUpdate: () => ipcRenderer.invoke('hexbridge:install-update'),
  openReleasePage: () => ipcRenderer.invoke('hexbridge:open-release-page'),
  triggerOcr: () => ipcRenderer.invoke('hexbridge:trigger-ocr'),
  clearDiagnosticScreenshots: () => ipcRenderer.invoke('hexbridge:clear-diagnostics'),
  retryLcuConnection: () => ipcRenderer.invoke('hexbridge:retry-lcu'),
  startCalibration: () => ipcRenderer.invoke('hexbridge:start-calibration'),
  getCalibrationContext: () => ipcRenderer.invoke('hexbridge:get-calibration-context'),
  previewCalibration: (rects: CalibrationRects) =>
    ipcRenderer.invoke('hexbridge:preview-calibration', rects),
  completeCalibration: (rects: CalibrationRects) =>
    ipcRenderer.invoke('hexbridge:complete-calibration', rects),
  cancelCalibration: () => ipcRenderer.invoke('hexbridge:cancel-calibration'),
  windowAction: (action: 'minimize' | 'maximize' | 'close' | 'quit') =>
    ipcRenderer.invoke('hexbridge:window-action', action),
}

contextBridge.exposeInMainWorld('hexbridge', api)
