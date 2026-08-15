import { safeStorage } from 'electron'
import Store from 'electron-store'
import type {
  AppSettings,
  ReleaseHighlights,
  WallpaperEnginePreferences,
  WallpaperEngineTarget,
  WallpaperEngineTargetType,
} from '../shared/contracts.js'
import { resolveReleaseHighlights } from '../shared/release-highlights.js'
import { toPublicAppSettings } from '../shared/settings.js'

export interface InternalAppSettings extends AppSettings {
  /** Legacy Main-only discovery fallback. Never expose this value to a Renderer. */
  gameDirectory: string
}

interface PersistedConfig {
  settings: InternalAppSettings
  encryptedApiKey: string
  windowBounds: Partial<Record<'main' | 'champion', Electron.Rectangle>>
  settingsRevision: number
  lastLaunchedVersion: string
  pendingReleaseHighlights: ReleaseHighlights | null
  wallpaperEnginePreferences: WallpaperEnginePreferences
  wallpaperEngineLeaseHeld: boolean
}

export const DEFAULT_WALLPAPER_ENGINE_PREFERENCES: WallpaperEnginePreferences = {
  championTargetType: 'profile',
  championTargetTemplate: 'HexBridge-{id}',
  restoreTarget: null,
}

export const DEFAULT_SETTINGS: InternalAppSettings = {
  visualMode: 'auto',
  autoOcr: false,
  showChampionPanel: true,
  showInGameRecommendations: true,
  opponentScouting: false,
  lobbyBackground: false,
  wallpaperEngineEnabled: false,
  recommendationDataSource: 'tencent101',
  hotkey: 'F8',
  gameDirectory: '',
  displayId: '',
  calibration: null,
  diagnosticsScreenshots: false,
}

export function migrateSettingsForRevision(
  settings: InternalAppSettings,
  revision: number,
): { settings: InternalAppSettings; revision: number } {
  const { showAugmentOverlay: _obsoleteOverlay, ...supported } = settings as InternalAppSettings & {
    showAugmentOverlay?: boolean
  }
  void _obsoleteOverlay
  let next: InternalAppSettings = { ...supported }
  let nextRevision = revision
  if (nextRevision < 1) {
    next = { ...next, autoOcr: false }
    nextRevision = 1
  }
  if (nextRevision < 2) {
    // Visual scheduling is Main-process policy from v0.1.13 onward. Discard
    // old manual overrides so an installation cannot remain stuck in a costly
    // or unexpectedly low-quality mode after the UI control is removed.
    next = { ...next, visualMode: 'auto' }
    nextRevision = 2
  }
  if (nextRevision < 3) {
    // Augment recommendations now live inside the main assistant. Remove the
    // obsolete full-screen overlay preference so it cannot be re-enabled.
    nextRevision = 3
  }
  if (nextRevision < 4) {
    // The retired full-screen overlay preference must stay ignored. This is a
    // new, bounded and click-through recommendation strip above the cards.
    next = { ...next, showInGameRecommendations: true }
    nextRevision = 4
  }
  if (nextRevision < 5) {
    // Opponent history is an explicit local experiment. Existing users must
    // opt in; upgrades never start the extra LCU reads automatically.
    next = { ...next, opponentScouting: false }
    nextRevision = 5
  }
  if (nextRevision < 6) {
    // A live client-window background is an explicit privacy/performance
    // choice. Existing installations must never start capturing on upgrade.
    next = { ...next, lobbyBackground: false }
    nextRevision = 6
  }
  if (nextRevision < 7) {
    // Installations that have never stored a recommendation-source choice use
    // Tencent 101 by default. Once revision 7 has been persisted, either valid
    // source remains an explicit user choice and is never rewritten here.
    next = { ...next, recommendationDataSource: 'tencent101' }
    nextRevision = 7
  }
  if (nextRevision < 8) {
    // Wallpaper Engine control is an explicit desktop-side effect. Existing
    // users must opt in and configure a restore target before it can run.
    next = { ...next, wallpaperEngineEnabled: false }
    nextRevision = 8
  }
  if (next.recommendationDataSource !== 'dtodo' && next.recommendationDataSource !== 'tencent101') {
    next = { ...next, recommendationDataSource: 'tencent101' }
  }
  return { settings: next, revision: nextRevision }
}

export class ConfigStore {
  private readonly store = new Store<PersistedConfig>({
    name: 'hexbridge',
    defaults: {
      settings: DEFAULT_SETTINGS,
      encryptedApiKey: '',
      windowBounds: {},
      settingsRevision: 0,
      lastLaunchedVersion: '',
      pendingReleaseHighlights: null,
      wallpaperEnginePreferences: DEFAULT_WALLPAPER_ENGINE_PREFERENCES,
      wallpaperEngineLeaseHeld: false,
    },
  })

  constructor(currentVersion = '') {
    const storedRevision = this.store.get('settingsRevision')
    const migration = migrateSettingsForRevision(
      { ...DEFAULT_SETTINGS, ...this.store.get('settings') },
      storedRevision,
    )
    const storedSettings = this.store.get('settings') as InternalAppSettings & { recommendationDataSource?: unknown }
    if (
      migration.revision !== this.store.get('settingsRevision') ||
      storedSettings.recommendationDataSource !== migration.settings.recommendationDataSource
    ) {
      // Apply one-time, revisioned safety migrations without altering the API
      // key, calibration or display selection.
      this.store.set('settings', migration.settings)
      this.store.set('settingsRevision', migration.revision)
    }
    if (currentVersion) {
      const previousVersion = this.store.get('lastLaunchedVersion') || (
        storedRevision > 0 && currentVersion === '0.1.18' ? '0.1.17' : ''
      )
      const pending = previousVersion
        ? resolveReleaseHighlights(previousVersion, currentVersion)
        : null
      if (previousVersion && previousVersion !== currentVersion) {
        this.store.set('pendingReleaseHighlights', pending)
      }
      this.store.set('lastLaunchedVersion', currentVersion)
    }
  }

  getReleaseHighlights(): ReleaseHighlights | null {
    const value = this.store.get('pendingReleaseHighlights')
    return value ? { ...value, items: [...value.items] } : null
  }

  dismissReleaseHighlights(): void {
    this.store.set('pendingReleaseHighlights', null)
  }

  getSettings(): AppSettings {
    return toPublicAppSettings(this.getInternalSettings())
  }

  updateSettings(patch: Partial<AppSettings>): AppSettings {
    const current = this.getInternalSettings()
    const publicNext = toPublicAppSettings({ ...toPublicAppSettings(current), ...patch })
    const next = { ...current, ...publicNext }
    this.store.set('settings', next)
    return publicNext
  }

  getGameDirectory(): string {
    return this.getInternalSettings().gameDirectory
  }

  private getInternalSettings(): InternalAppSettings {
    const stored = this.store.get('settings')
    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      gameDirectory: typeof stored?.gameDirectory === 'string' ? stored.gameDirectory : '',
    }
  }

  getWallpaperEnginePreferences(): WallpaperEnginePreferences {
    const stored = sanitizeWallpaperEnginePreferences(this.store.get('wallpaperEnginePreferences'))
    return stored ?? structuredClone(DEFAULT_WALLPAPER_ENGINE_PREFERENCES)
  }

  saveWallpaperEnginePreferences(preferences: WallpaperEnginePreferences): void {
    const safe = sanitizeWallpaperEnginePreferences(preferences)
    if (!safe) throw new Error('壁纸配置无效')
    this.store.set('wallpaperEnginePreferences', safe)
  }

  isWallpaperEngineLeaseHeld(): boolean {
    return this.store.get('wallpaperEngineLeaseHeld') === true
  }

  setWallpaperEngineLeaseHeld(held: boolean): void {
    this.store.set('wallpaperEngineLeaseHeld', held)
  }

  hasApiKey(): boolean {
    return this.getApiKey() !== null
  }

  getApiKey(): string | null {
    const encrypted = this.store.get('encryptedApiKey')
    if (!encrypted || !safeStorage.isEncryptionAvailable()) return null
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
    } catch {
      return null
    }
  }

  saveApiKey(apiKey: string): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('当前系统无法提供安全的密钥存储')
    }
    const encrypted = safeStorage.encryptString(apiKey.trim())
    this.store.set('encryptedApiKey', encrypted.toString('base64'))
  }

  clearApiKey(): void {
    this.store.set('encryptedApiKey', '')
  }

  getWindowBounds(name: 'main' | 'champion'): Electron.Rectangle | null {
    return this.store.get('windowBounds')[name] ?? null
  }

  saveWindowBounds(name: 'main' | 'champion', bounds: Electron.Rectangle): void {
    this.store.set(`windowBounds.${name}`, bounds)
  }
}

function safeTargetType(value: unknown): value is WallpaperEngineTargetType {
  return value === 'profile' || value === 'playlist'
}

function safeTargetName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.trim()
  const hasControlCharacter = Array.from(name).some((character) => {
    const code = character.codePointAt(0) ?? 0
    return code <= 31 || code === 127
  })
  if (!name || name.length > 80 || name.startsWith('-') || hasControlCharacter) return null
  return name
}

function sanitizeTarget(value: unknown): WallpaperEngineTarget | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const name = safeTargetName(record.name)
  if (!safeTargetType(record.type) || !name) return null
  return { type: record.type, name }
}

export function sanitizeWallpaperEnginePreferences(value: unknown): WallpaperEnginePreferences | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const template = safeTargetName(record.championTargetTemplate)
  const withoutSupportedPlaceholders = template?.replaceAll('{id}', '') ?? ''
  if (
    !safeTargetType(record.championTargetType) ||
    !template ||
    template.length > 79 ||
    !template.includes('{id}') ||
    withoutSupportedPlaceholders.includes('{') ||
    withoutSupportedPlaceholders.includes('}')
  ) return null
  const restoreTarget = record.restoreTarget == null ? null : sanitizeTarget(record.restoreTarget)
  if (record.restoreTarget != null && !restoreTarget) return null
  return {
    championTargetType: record.championTargetType,
    championTargetTemplate: template,
    restoreTarget,
  }
}
