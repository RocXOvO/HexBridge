import { describe, expect, it, vi } from 'vitest'
import type { AppSettings } from '../src/shared/contracts.js'

vi.mock('electron', () => ({ safeStorage: {} }))
vi.mock('electron-store', () => ({ default: class {} }))

import { migrateSettingsForRevision } from '../src/main/config-store.js'

const settings = (visualMode: AppSettings['visualMode'], autoOcr: boolean): AppSettings => ({
  visualMode,
  autoOcr,
  showChampionPanel: true,
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
      expect(migrated).toMatchObject({ revision: 3, settings: { visualMode: 'auto', autoOcr: false } })
    },
  )

  it('migrates a revision-one manual override without changing OCR again', () => {
    expect(migrateSettingsForRevision(settings('eco', true), 1)).toEqual({
      settings: settings('auto', true),
      revision: 3,
    })
  })

  it('does not repeat the migration at the current revision', () => {
    expect(migrateSettingsForRevision(settings('auto', true), 3)).toEqual({
      settings: settings('auto', true),
      revision: 3,
    })
  })
})
