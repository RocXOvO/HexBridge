import { describe, expect, it } from 'vitest'
import { resolveReleaseHighlights } from '../src/shared/release-highlights.js'

describe('release highlights', () => {
  it('returns the curated upgrade summary for the new version', () => {
    expect(resolveReleaseHighlights('0.1.19', '0.1.20')).toMatchObject({
      version: '0.1.20',
      previousVersion: '0.1.19',
      items: expect.arrayContaining(['选人伴随窗会跟随英雄联盟客户端移动和最小化。']),
    })
  })

  it('does not show a dialog for a fresh or unchanged installation', () => {
    expect(resolveReleaseHighlights('', '0.1.20')).toBeNull()
    expect(resolveReleaseHighlights('0.1.20', '0.1.20')).toBeNull()
  })
})
