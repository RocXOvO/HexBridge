import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, AugmentOverlayBridge, AugmentOverlayViewState, CalibrationRects, HexBridgeApi, RuntimeState } from '../shared/contracts.js'

const overlayCallbacks = new Set<(state: AugmentOverlayViewState) => void>()
let latestOverlay: AugmentOverlayViewState | null = null
ipcRenderer.on('hexbridge:augment-overlay', (_event, state: AugmentOverlayViewState) => {
  latestOverlay = state
  for (const callback of overlayCallbacks) callback(state)
})

const overlayApi: AugmentOverlayBridge = {
  onChanged: (callback) => {
    overlayCallbacks.add(callback)
    if (latestOverlay) queueMicrotask(() => callback(latestOverlay as AugmentOverlayViewState))
    return () => overlayCallbacks.delete(callback)
  },
}

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
  applyUpdate: () => ipcRenderer.invoke('hexbridge:apply-update'),
  openDeveloperPage: () => ipcRenderer.invoke('hexbridge:open-developer-page'),
  dismissReleaseHighlights: () => ipcRenderer.invoke('hexbridge:dismiss-release-highlights'),
  triggerOcr: () => ipcRenderer.invoke('hexbridge:trigger-ocr'),
  retryOpponentScout: () => ipcRenderer.invoke('hexbridge:retry-opponent-scout'),
  getScoutPlayerDetails: (opaqueKey: string, matchGeneration: number) =>
    ipcRenderer.invoke('hexbridge:get-scout-player-details', opaqueKey, matchGeneration),
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

const rendererRoute = process.argv
  .filter((argument) => argument.startsWith('--hexbridge-renderer='))
  .at(-1)
  ?.slice('--hexbridge-renderer='.length)
if (rendererRoute === 'augment') contextBridge.exposeInMainWorld('hexbridgeOverlay', overlayApi)
else contextBridge.exposeInMainWorld('hexbridge', api)
