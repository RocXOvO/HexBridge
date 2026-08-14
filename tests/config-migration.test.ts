import { describe, expect, it, vi } from 'vitest'
import type { AppSettings } from '../src/shared/contracts.js'

vi.mock('electron', () => ({ safeStorage: {} }))
vi.mock('electron-store', () => ({ default: class {} }))

import { migrateSettingsForRevision } from '../src/main/config-store.js'

const settings = (visualMode: AppSettings['visualMode'], autoOcr: boolean): AppSettings => ({
  visualMode,
  autoOcr,
  showChampionPanel: true,
  showInGameRecommendations: true,
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
      expect(migrated).toMatchObject({ revision: 4, settings: { visualMode: 'auto', autoOcr: false, showInGameRecommendations: true } })
    },
  )

  it('migrates a revision-one manual override without changing OCR again', () => {
    expect(migrateSettingsForRevision(settings('eco', true), 1)).toEqual({
      settings: settings('auto', true),
      revision: 4,
    })
  })

  it('does not repeat the migration at the current revision', () => {
    const current = { ...settings('auto', true), showInGameRecommendations: false }
    expect(migrateSettingsForRevision(current, 4)).toEqual({
      settings: current,
      revision: 4,
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
      settings: { ...previous, showInGameRecommendations: true },
      revision: 4,
    })
  })
})
