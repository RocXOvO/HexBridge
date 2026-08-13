import { safeStorage } from 'electron'
import Store from 'electron-store'
import type { AppSettings } from '../shared/contracts.js'

interface PersistedConfig {
  settings: AppSettings
  encryptedApiKey: string
  windowBounds: Partial<Record<'main' | 'champion', Electron.Rectangle>>
  settingsRevision: number
}

export const DEFAULT_SETTINGS: AppSettings = {
  visualMode: 'auto',
  autoOcr: false,
  showChampionPanel: true,
  hotkey: 'F8',
  gameDirectory: '',
  displayId: '',
  calibration: null,
  diagnosticsScreenshots: false,
}

export function migrateSettingsForRevision(
  settings: AppSettings,
  revision: number,
): { settings: AppSettings; revision: number } {
  const { showAugmentOverlay: _obsoleteOverlay, ...supported } = settings as AppSettings & {
    showAugmentOverlay?: boolean
  }
  void _obsoleteOverlay
  let next: AppSettings = { ...supported }
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
  return { settings: next, revision: nextRevision }
}

export class ConfigStore {
  private readonly store = new Store<PersistedConfig>({
    name: 'hexbridge',
    defaults: { settings: DEFAULT_SETTINGS, encryptedApiKey: '', windowBounds: {}, settingsRevision: 0 },
  })

  constructor() {
    const migration = migrateSettingsForRevision(
      { ...DEFAULT_SETTINGS, ...this.store.get('settings') },
      this.store.get('settingsRevision'),
    )
    if (migration.revision !== this.store.get('settingsRevision')) {
      // Apply one-time, revisioned safety migrations without altering the API
      // key, calibration or display selection.
      this.store.set('settings', migration.settings)
      this.store.set('settingsRevision', migration.revision)
    }
  }

  getSettings(): AppSettings {
    return { ...DEFAULT_SETTINGS, ...this.store.get('settings') }
  }

  updateSettings(patch: Partial<AppSettings>): AppSettings {
    const next = { ...this.getSettings(), ...patch }
    this.store.set('settings', next)
    return next
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
