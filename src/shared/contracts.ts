export type GameflowPhase =
  | 'None'
  | 'Lobby'
  | 'Matchmaking'
  | 'ReadyCheck'
  | 'ChampSelect'
  | 'GameStart'
  | 'InProgress'
  | 'Reconnect'
  | 'WaitingForStats'
  | 'PreEndOfGame'
  | 'EndOfGame'
  | string

export type VisualMode = 'cinematic' | 'balanced' | 'eco'
export type VisualModePreference = VisualMode | 'auto'
export type MatchContextStage = 'none' | 'selecting' | 'launching' | 'active'

export interface NormalizedRect {
  x: number
  y: number
  width: number
  height: number
}

export interface CalibrationRects {
  left: NormalizedRect
  center: NormalizedRect
  right: NormalizedRect
}

export interface CalibrationContext {
  backgroundDataUrl: string
  displayLabel: string
  physicalWidth: number
  physicalHeight: number
  existing: CalibrationRects | null
}

export interface AppSettings {
  visualMode: VisualModePreference
  autoOcr: boolean
  showChampionPanel: boolean
  showInGameRecommendations: boolean
  opponentScouting: boolean
  hotkey: string
  gameDirectory: string
  displayId: string
  calibration: CalibrationRects | null
  diagnosticsScreenshots: boolean
}

export interface HotkeyRegistrationResult {
  ok: boolean
  activeHotkey: string
  errorCode: string | null
  message: string
}

export interface DisplayOption {
  id: string
  label: string
  width: number
  height: number
  scaleFactor: number
  primary: boolean
}

export interface LcuConnectionState {
  connected: boolean
  source: 'process' | 'lockfile' | 'log' | 'manual' | null
  lastError: string | null
  lastConnectedAt: number | null
}

export interface ChampSelectSnapshot {
  phase: GameflowPhase
  locale: string
  queueId: number | null
  modeActive: boolean
  matchStage: MatchContextStage
  matchGeneration: number
  currentChampionId: number | null
  benchChampionIds: number[]
  benchEnabled: boolean
  updatedAt: number
}

export interface ChampionSummary {
  id: number
  alias: string
  name: string
  title: string
  roles: string[]
  iconUrl: string
  splashUrl: string
  tier: number | null
  winRate: number | null
  patch: string
  date: string
  source: string
}

export interface ChampionCandidate extends ChampionSummary {
  sourceType: 'current' | 'bench'
  isCurrent: boolean
  isBest: boolean
  winRateDelta: number | null
}

export interface AugmentMeta {
  id: number
  name: string
  iconUrl: string
  rarity: number | null
  rarityName: string
  description: string
  globalTier: number | null
}

export interface ChampionAugmentRank {
  augmentId: number
  rank: number | null
  total: number | null
  tier: number | null
  /** Champion-specific selection ratio from the documented upstream detail endpoint. */
  pickRate: number | null
  statsSource: 'iesdev' | 'tencent' | 'aramgg-client-upload' | null
  statsRegion: 'WORLD' | 'CN' | null
}

export interface ChampionBuildItem {
  id: number
  name: string
  iconUrl: string
}

export interface ChampionBuildRecommendation {
  label: string
  patch: string
  source: 'iesdev'
  startingItems: ChampionBuildItem[]
  coreItems: ChampionBuildItem[]
  situationalItems: ChampionBuildItem[]
}

export interface ChampionAugmentData {
  championId: number
  dataVersion: string
  ranks: ChampionAugmentRank[]
  builds: ChampionBuildRecommendation[]
}

export type AugmentSlot = 'left' | 'center' | 'right'

export interface OcrSlotResult {
  slot: AugmentSlot
  rawText: string
  augmentId: number | null
  name: string
  confidence: number
}

export interface RankedAugmentSlot extends OcrSlotResult {
  position: number | null
  tied: boolean
  reason: string
  iconUrl: string
  rarityName: string
  pickRate: number | null
  statsSource: ChampionAugmentRank['statsSource']
  statsRegion: ChampionAugmentRank['statsRegion']
}

export interface AugmentOverlayState {
  visible: boolean
  championId: number | null
  slots: RankedAugmentSlot[]
  detectedAt: number | null
  message: string
}

export interface AugmentOverlayViewState {
  slots: Array<Pick<RankedAugmentSlot, 'slot' | 'augmentId' | 'name' | 'position' | 'tied' | 'reason' | 'pickRate'>>
  layout: Array<{ slot: AugmentSlot; left: number; width: number }>
  message: string
}

export type OpponentFormTier = '上等马' | '中等马' | '下等马'

export interface OpponentFormSummary {
  slot: number
  championId: number | null
  status: 'ready' | 'unavailable'
  rating: number | null
  tier: OpponentFormTier | null
  sampleSize: number
  wins: number
  losses: number
  winRate: number | null
  kda: number | null
  streak: number
}

export type OpponentScoutReason =
  | 'disabled'
  | 'waiting-context'
  | 'loading'
  | 'identity-source-unavailable'
  | 'identity-team-incomplete'
  | 'identity-visibility-rejected'
  | 'identity-ambiguous'
  | 'history-unavailable'
  | 'ready'
  | 'partial'
  | 'transport-switched'
  | 'unexpected-error'

export interface OpponentScoutState {
  status: 'disabled' | 'idle' | 'loading' | 'ready' | 'partial' | 'unavailable' | 'error'
  reason: OpponentScoutReason
  matchGeneration: number | null
  opponents: OpponentFormSummary[]
  sampledAt: number | null
  source: 'local-lcu' | null
  message: string
}

export interface AugmentOverlayBridge {
  onChanged(callback: (state: AugmentOverlayViewState) => void): () => void
}

export interface ApiConnectionState {
  configured: boolean
  status: 'missing' | 'ready' | 'stale' | 'unauthorized' | 'limited' | 'offline' | 'error'
  gamePatch: string
  dataVersion: string
  publishedAt: string
  lastError: string | null
}

export type AppUpdateStatus =
  | 'unsupported'
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error'

export type UpdateDownloadMode = 'preparing' | 'differential' | 'full' | null

export interface AppUpdateState {
  status: AppUpdateStatus
  currentVersion: string
  availableVersion: string | null
  releaseName: string | null
  releaseNotes: string
  percent: number | null
  transferred: number | null
  total: number | null
  bytesPerSecond: number | null
  downloadMode: UpdateDownloadMode
  downloadModeMessage: string
  lastCheckedAt: number | null
  errorCode: string | null
  message: string
}

export interface ReleaseHighlights {
  version: string
  previousVersion: string
  items: string[]
}

export interface RuntimeDiagnostics {
  ocrReady: boolean
  ocrBusy: boolean
  ocrLastDurationMs: number | null
  ocrLastError: string | null
  manualOcrStatus: 'idle' | 'running' | 'matched' | 'miss' | 'error'
  manualOcrCode:
    | 'IDLE'
    | 'RUNNING'
    | 'MATCHED'
    | 'NOT_ELIGIBLE'
    | 'NO_CHAMPION'
    | 'NO_CATALOG'
    | 'BUSY'
    | 'CONTEXT_ENDED'
    | 'CONTEXT_SWITCHED'
    | 'NOT_DETECTED'
    | 'UNRELIABLE'
    | 'SCAN_ERROR'
    | 'UNEXPECTED_ERROR'
  manualOcrSource: 'button' | 'hotkey' | 'tray' | null
  manualOcrTriggeredAt: number | null
  manualOcrMessage: string
  polling: boolean
  activeVisualMode: VisualMode
  gpuAcceleration: boolean
  logLines: string[]
}

export interface RuntimeState {
  lcu: LcuConnectionState
  snapshot: ChampSelectSnapshot
  api: ApiConnectionState
  update: AppUpdateState
  releaseHighlights: ReleaseHighlights | null
  champions: ChampionSummary[]
  candidates: ChampionCandidate[]
  currentBuild: ChampionBuildRecommendation | null
  opponentScout: OpponentScoutState
  overlay: AugmentOverlayState
  settings: AppSettings
  displays: DisplayOption[]
  diagnostics: RuntimeDiagnostics
}

export interface HexBridgeApi {
  getState(): Promise<RuntimeState>
  onStateChanged(callback: (state: RuntimeState) => void): () => void
  updateSettings(patch: Partial<AppSettings>): Promise<AppSettings>
  setOcrHotkey(hotkey: string): Promise<HotkeyRegistrationResult>
  validateAndSaveApiKey(apiKey: string): Promise<{ ok: boolean; message: string }>
  clearApiKey(): Promise<void>
  refreshData(): Promise<{ ok: boolean; message: string }>
  applyUpdate(): Promise<{ ok: boolean; message: string }>
  openDeveloperPage(): Promise<{ ok: boolean; message: string }>
  dismissReleaseHighlights(): Promise<void>
  triggerOcr(): Promise<{ ok: boolean; message: string }>
  retryOpponentScout(): Promise<{ ok: boolean; message: string }>
  clearDiagnosticScreenshots(): Promise<{ ok: boolean; message: string }>
  retryLcuConnection(): Promise<{ ok: boolean; message: string }>
  startCalibration(): Promise<void>
  getCalibrationContext(): Promise<CalibrationContext | null>
  previewCalibration(rects: CalibrationRects): Promise<{ ok: boolean; names: string[]; message: string }>
  completeCalibration(rects: CalibrationRects): Promise<void>
  cancelCalibration(): Promise<void>
  windowAction(action: 'minimize' | 'maximize' | 'close' | 'quit'): Promise<void>
}
