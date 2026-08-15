import { describe, expect, it, vi } from 'vitest'
import type { AppSettings } from '../src/shared/contracts.js'

vi.mock('electron', () => ({ safeStorage: {} }))
vi.mock('electron-store', () => ({ default: class {} }))

import {
  migrateSettingsForRevision,
  sanitizeWallpaperEnginePreferences,
} from '../src/main/config-store.js'

const settings = (visualMode: AppSettings['visualMode'], autoOcr: boolean): AppSettings => ({
  visualMode,
  autoOcr,
  showChampionPanel: true,
  showInGameRecommendations: true,
  opponentScouting: true,
  lobbyBackground: true,
  wallpaperEngineEnabled: true,
  recommendationDataSource: 'tencent101',
  hotkey: 'F8',
  gameDirectory: '',
  displayId: '',
  calibration: null,
  diagnosticsScreenshots: false,
})

describe('settings migration', () => {
  it.each(['eco', 'balanced', 'cinematic'] as const)(
    'disables legacy automatic OCR and removes the obsolete %s visual override',
    (visualMode) => {
      const migrated = migrateSettingsForRevision(settings(visualMode, true), 0)
      expect(migrated).toMatchObject({ revision: 8, settings: { visualMode: 'auto', autoOcr: false, showInGameRecommendations: true, opponentScouting: false, lobbyBackground: false, wallpaperEngineEnabled: false, recommendationDataSource: 'dtodo' } })
    },
  )

  it('migrates a revision-one manual override without changing OCR again', () => {
    expect(migrateSettingsForRevision(settings('eco', true), 1)).toEqual({
      settings: { ...settings('auto', true), opponentScouting: false, lobbyBackground: false, wallpaperEngineEnabled: false, recommendationDataSource: 'dtodo' },
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

  it('fails closed to dtodo for an unknown persisted recommendation source', () => {
    const invalid = { ...settings('auto', false), recommendationDataSource: 'auto' as AppSettings['recommendationDataSource'] }
    expect(migrateSettingsForRevision(invalid, 8)).toMatchObject({
      revision: 8,
      settings: { recommendationDataSource: 'dtodo' },
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
      settings: { ...previous, showInGameRecommendations: true, opponentScouting: false, lobbyBackground: false, wallpaperEngineEnabled: false, recommendationDataSource: 'dtodo' },
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
