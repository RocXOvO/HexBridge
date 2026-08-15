import { describe, expect, it, vi } from 'vitest'
import type { AppSettings } from '../src/shared/contracts.js'
import { toPublicAppSettings } from '../src/shared/settings.js'

vi.mock('electron', () => ({ safeStorage: {} }))
vi.mock('electron-store', () => ({ default: class {} }))

import {
  DEFAULT_SETTINGS,
  type InternalAppSettings,
  migrateSettingsForRevision,
  sanitizeWallpaperEnginePreferences,
} from '../src/main/config-store.js'

const PRIVATE_DIRECTORY = '/Users/private/Games/League of Legends'

const settings = (visualMode: AppSettings['visualMode'], autoOcr: boolean): InternalAppSettings => ({
  visualMode,
  autoOcr,
  showChampionPanel: true,
  showInGameRecommendations: true,
  opponentScouting: true,
  lobbyBackground: true,
  wallpaperEngineEnabled: true,
  recommendationDataSource: 'tencent101',
  hotkey: 'F8',
  gameDirectory: PRIVATE_DIRECTORY,
  displayId: '',
  calibration: null,
  diagnosticsScreenshots: false,
})

describe('settings migration', () => {
  it('uses Tencent 101 for fresh settings without rewriting saved valid choices', () => {
    expect(DEFAULT_SETTINGS.recommendationDataSource).toBe('tencent101')
    expect(migrateSettingsForRevision(settings('auto', false), 8).settings.recommendationDataSource).toBe('tencent101')
    expect(migrateSettingsForRevision({ ...settings('auto', false), recommendationDataSource: 'dtodo' }, 8).settings.recommendationDataSource).toBe('dtodo')
  })

  it.each(['eco', 'balanced', 'cinematic'] as const)(
    'disables legacy automatic OCR and removes the obsolete %s visual override',
    (visualMode) => {
      const migrated = migrateSettingsForRevision(settings(visualMode, true), 0)
      expect(migrated).toMatchObject({ revision: 8, settings: { visualMode: 'auto', autoOcr: false, showInGameRecommendations: true, opponentScouting: false, lobbyBackground: false, wallpaperEngineEnabled: false, recommendationDataSource: 'tencent101' } })
    },
  )

  it('migrates a revision-one manual override without changing OCR again', () => {
    expect(migrateSettingsForRevision(settings('eco', true), 1)).toEqual({
      settings: { ...settings('auto', true), opponentScouting: false, lobbyBackground: false, wallpaperEngineEnabled: false, recommendationDataSource: 'tencent101' },
      revision: 8,
    })
  })

  it('does not repeat the migration at the current revision', () => {
    const current = { ...settings('auto', true), showInGameRecommendations: false }
    expect(migrateSettingsForRevision(current, 8)).toEqual({
      settings: current,
      revision: 8,
    })
  })

  it('preserves an existing explicit dtodo choice at the current revision', () => {
    const current = { ...settings('auto', false), recommendationDataSource: 'dtodo' as const }
    expect(migrateSettingsForRevision(current, 8)).toEqual({ settings: current, revision: 8 })
  })

  it('keeps the legacy Main-only discovery directory without exposing it in public settings', () => {
    const migrated = migrateSettingsForRevision(settings('auto', false), 0)
    expect(migrated.settings.gameDirectory).toBe(PRIVATE_DIRECTORY)

    const publicSettings = toPublicAppSettings(migrated.settings)
    expect(publicSettings).not.toHaveProperty('gameDirectory')
    expect(JSON.stringify(publicSettings)).not.toContain(PRIVATE_DIRECTORY)
  })

  it('fails closed to the Tencent default for an unknown persisted recommendation source', () => {
    const invalid = { ...settings('auto', false), recommendationDataSource: 'auto' as AppSettings['recommendationDataSource'] }
    expect(migrateSettingsForRevision(invalid, 8)).toMatchObject({
      revision: 8,
      settings: { recommendationDataSource: 'tencent101' },
    })
  })

  it('adds the bounded overlay default without changing unrelated revision-three settings', () => {
    const previous = {
      ...settings('auto', false),
      hotkey: 'Ctrl+F9',
      displayId: 'secondary',
      diagnosticsScreenshots: true,
      calibration: {
        left: { x: .1, y: .2, width: .15, height: .5 },
        center: { x: .4, y: .2, width: .15, height: .5 },
        right: { x: .7, y: .2, width: .15, height: .5 },
      },
    }
    expect(migrateSettingsForRevision(previous, 3)).toEqual({
      settings: { ...previous, showInGameRecommendations: true, opponentScouting: false, lobbyBackground: false, wallpaperEngineEnabled: false, recommendationDataSource: 'tencent101' },
      revision: 8,
    })
  })

  it('keeps Wallpaper Engine disabled when upgrading revision seven', () => {
    const previous = { ...settings('auto', false), wallpaperEngineEnabled: true }
    expect(migrateSettingsForRevision(previous, 7)).toEqual({
      settings: { ...previous, wallpaperEngineEnabled: false },
      revision: 8,
    })
  })

  it('accepts only bounded Wallpaper Engine targets with the stable champion id placeholder', () => {
    expect(sanitizeWallpaperEnginePreferences({
      championTargetType: 'profile',
      championTargetTemplate: 'HexBridge-{id}',
      restoreTarget: { type: 'playlist', name: 'Daily restore' },
    })).toEqual({
      championTargetType: 'profile',
      championTargetTemplate: 'HexBridge-{id}',
      restoreTarget: { type: 'playlist', name: 'Daily restore' },
    })
    expect(sanitizeWallpaperEnginePreferences({
      championTargetType: 'profile',
      championTargetTemplate: 'HexBridge-{alias}',
      restoreTarget: { type: 'profile', name: 'Restore' },
    })).toBeNull()
    expect(sanitizeWallpaperEnginePreferences({
      championTargetType: 'playlist',
      championTargetTemplate: 'HexBridge-{id}',
      restoreTarget: { type: 'profile', name: '-control' },
    })).toBeNull()
  })
})
