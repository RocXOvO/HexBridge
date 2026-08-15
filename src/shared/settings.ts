import type { AppSettings } from './contracts.js'

/**
 * Rebuild the Renderer-visible settings shape from an explicit allowlist.
 *
 * Main may carry legacy private discovery fields alongside AppSettings. Never
 * spread that object across the process boundary.
 */
export function toPublicAppSettings(settings: AppSettings): AppSettings {
  return {
    visualMode: settings.visualMode,
    autoOcr: settings.autoOcr,
    showChampionPanel: settings.showChampionPanel,
    showInGameRecommendations: settings.showInGameRecommendations,
    opponentScouting: settings.opponentScouting,
    lobbyBackground: settings.lobbyBackground,
    wallpaperEngineEnabled: settings.wallpaperEngineEnabled,
    recommendationDataSource: settings.recommendationDataSource,
    hotkey: settings.hotkey,
    displayId: settings.displayId,
    calibration: settings.calibration,
    diagnosticsScreenshots: settings.diagnosticsScreenshots,
  }
}
