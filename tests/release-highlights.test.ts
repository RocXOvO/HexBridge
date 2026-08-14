import { describe, expect, it } from 'vitest'
import { resolveReleaseHighlights } from '../src/shared/release-highlights.js'

describe('release highlights', () => {
  it('returns the curated upgrade summary for the new version', () => {
    expect(resolveReleaseHighlights('0.1.18', '0.1.19')).toMatchObject({
      version: '0.1.19',
      previousVersion: '0.1.18',
      items: expect.arrayContaining(['确认最新版后不再显示更新按钮。']),
    })
  })

  it('does not show a dialog for a fresh or unchanged installation', () => {
    expect(resolveReleaseHighlights('', '0.1.19')).toBeNull()
    expect(resolveReleaseHighlights('0.1.19', '0.1.19')).toBeNull()
  })
})
