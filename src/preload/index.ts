import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  AugmentOverlayBridge,
  AugmentOverlayViewState,
  CalibrationRects,
  HexBridgeApi,
  LobbyBackgroundBridge,
  LobbyBackgroundFrame,
  LiveClientDiagnosticStep,
  RuntimeState,
} from '../shared/contracts.js'

const rendererRoute = process.argv
  .filter((argument) => argument.startsWith('--hexbridge-renderer='))
  .at(-1)
  ?.slice('--hexbridge-renderer='.length)

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

const lobbyBackgroundCallbacks = new Set<(frame: LobbyBackgroundFrame | null) => void>()
let latestLobbyBackground: LobbyBackgroundFrame | null = null
if (rendererRoute === 'main') {
  ipcRenderer.on('hexbridge:lobby-background', (_event, frame: LobbyBackgroundFrame | null) => {
    latestLobbyBackground = frame
    for (const callback of lobbyBackgroundCallbacks) callback(frame)
  })
}

const lobbyBackgroundApi: LobbyBackgroundBridge = {
  onChanged: (callback) => {
    lobbyBackgroundCallbacks.add(callback)
    queueMicrotask(() => callback(latestLobbyBackground))
    return () => lobbyBackgroundCallbacks.delete(callback)
  },
  setPresentation: (presentation) =>
    ipcRenderer.invoke('hexbridge:set-lobby-background-presentation', presentation),
}

const api = {
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
  getChampionRecommendation: (championId: number) =>
    ipcRenderer.invoke('hexbridge:get-champion-recommendation', championId),
  applyUpdate: () => ipcRenderer.invoke('hexbridge:apply-update'),
  openDeveloperPage: () => ipcRenderer.invoke('hexbridge:open-developer-page'),
  dismissReleaseHighlights: () => ipcRenderer.invoke('hexbridge:dismiss-release-highlights'),
  triggerOcr: () => ipcRenderer.invoke('hexbridge:trigger-ocr'),
  retryOpponentScout: () => ipcRenderer.invoke('hexbridge:retry-opponent-scout'),
  getScoutPlayerDetails: (opaqueKey: string, matchGeneration: number) =>
    ipcRenderer.invoke('hexbridge:get-scout-player-details', opaqueKey, matchGeneration),
  clearDiagnosticScreenshots: () => ipcRenderer.invoke('hexbridge:clear-diagnostics'),
  sampleLiveClientDiagnostics: (step: LiveClientDiagnosticStep) =>
    ipcRenderer.invoke('hexbridge:sample-live-client-diagnostics', step),
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
  ...(rendererRoute === 'main' ? {
    getWallpaperEnginePreferences: () =>
      ipcRenderer.invoke('hexbridge:get-wallpaper-engine-preferences'),
    saveWallpaperEnginePreferences: (preferences: import('../shared/contracts.js').WallpaperEnginePreferences) =>
      ipcRenderer.invoke('hexbridge:save-wallpaper-engine-preferences', preferences),
    retryWallpaperEngine: () => ipcRenderer.invoke('hexbridge:retry-wallpaper-engine'),
  } : {}),
} as HexBridgeApi

if (rendererRoute === 'augment') contextBridge.exposeInMainWorld('hexbridgeOverlay', overlayApi)
else {
  contextBridge.exposeInMainWorld('hexbridge', api)
  if (rendererRoute === 'main') contextBridge.exposeInMainWorld('hexbridgeLobbyBackground', lobbyBackgroundApi)
}
