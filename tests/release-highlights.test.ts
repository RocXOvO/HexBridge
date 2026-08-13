import { describe, expect, it } from 'vitest'
import { resolveReleaseHighlights } from '../src/shared/release-highlights.js'

describe('release highlights', () => {
  it('returns the curated upgrade summary for the new version', () => {
    expect(resolveReleaseHighlights('0.1.17', '0.1.18')).toMatchObject({
      version: '0.1.18',
      previousVersion: '0.1.17',
      items: expect.arrayContaining(['更新入口改为一键完成。']),
    })
  })

  it('does not show a dialog for a fresh or unchanged installation', () => {
    expect(resolveReleaseHighlights('', '0.1.18')).toBeNull()
    expect(resolveReleaseHighlights('0.1.18', '0.1.18')).toBeNull()
  })
})
