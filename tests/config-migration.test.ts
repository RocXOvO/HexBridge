import { describe, expect, it, vi } from 'vitest'
import type { AppSettings } from '../src/shared/contracts.js'

vi.mock('electron', () => ({ safeStorage: {} }))
vi.mock('electron-store', () => ({ default: class {} }))

import { migrateSettingsForRevision } from '../src/main/config-store.js'

const settings = (visualMode: AppSettings['visualMode'], autoOcr: boolean): AppSettings => ({
  visualMode,
  autoOcr,
  showChampionPanel: true,
  showAugmentOverlay: true,
  hotkey: 'F8',
  gameDirectory: '',
  displayId: '',
  calibration: null,
  diagnosticsScreenshots: false,
})

describe('settings migration', () => {
  it.each(['eco', 'balanced', 'cinematic'] as const)(
    'disables legacy automatic OCR without changing an explicit %s preference',
    (visualMode) => {
      const migrated = migrateSettingsForRevision(settings(visualMode, true), 0)
      expect(migrated).toMatchObject({ revision: 1, settings: { visualMode, autoOcr: false } })
    },
  )

  it('does not repeat the migration', () => {
    expect(migrateSettingsForRevision(settings('auto', true), 1)).toEqual({
      settings: settings('auto', true),
      revision: 1,
    })
  })
})
