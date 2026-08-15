import { describe, expect, it } from 'vitest'
// @ts-expect-error Executable release helper intentionally has no TypeScript declaration file.
import { previousStableReleaseTag, renderStableReleaseNotes } from '../scripts/release-notes.mjs'

describe('stable Release notes', () => {
  const releases = [
    { tag_name: 'v0.1.38', draft: false, prerelease: false },
    { tag_name: 'v0.1.37', draft: false, prerelease: false },
    { tag_name: 'v0.1.36', draft: false, prerelease: false },
    { tag_name: 'v0.1.35', draft: false, prerelease: false },
    { tag_name: 'v0.1.34', draft: false, prerelease: false },
    { tag_name: 'v0.1.33', draft: false, prerelease: false },
    { tag_name: 'v0.1.32', draft: false, prerelease: false },
    { tag_name: 'v0.1.31', draft: false, prerelease: false },
    { tag_name: 'v0.1.30', draft: false, prerelease: false },
    { tag_name: 'v0.1.29', draft: false, prerelease: false },
    { tag_name: 'v0.1.28', draft: false, prerelease: false },
    { tag_name: 'v0.1.27', draft: false, prerelease: false },
    { tag_name: 'v0.1.26', draft: false, prerelease: false },
    { tag_name: 'v0.1.25', draft: false, prerelease: false },
    { tag_name: 'v0.1.24', draft: false, prerelease: false },
    { tag_name: 'v0.1.99', draft: true, prerelease: false },
    { tag_name: 'v0.1.98', draft: false, prerelease: true },
    { tag_name: 'not-semver', draft: false, prerelease: false },
  ]

  it('selects the immediately preceding public stable version', () => {
    expect(previousStableReleaseTag(releases, '0.1.39')).toBe('v0.1.38')
  })

  it('renders curated changes relative to the previous stable Release', () => {
    const body = renderStableReleaseNotes({
      repository: 'RocXOvO/HexBridge',
      version: '0.1.39',
      releases,
    })
    expect(body).toContain('### 相较 v0.1.38 的更新')
    expect(body).toContain('同一局选人中队友或对手换英雄')
    expect(body).toContain('/compare/v0.1.38...v0.1.39')
    expect(body).not.toContain('v0.1.37：')
  })

  it('includes every missing intermediate version when the previous stable Release is not adjacent', () => {
    const body = renderStableReleaseNotes({
      repository: 'RocXOvO/HexBridge',
      version: '0.1.39',
      releases: [{ tag_name: 'v0.1.24', draft: false, prerelease: false }],
    })
    expect(body).toContain('### 相较 v0.1.24 的更新')
    expect(body).toContain('v0.1.25：')
    expect(body).toContain('v0.1.26：')
    expect(body).toContain('v0.1.39：')
  })

  it('fails closed when a version has no curated notes', () => {
    expect(() => renderStableReleaseNotes({
      repository: 'RocXOvO/HexBridge',
      version: '9.9.9',
      releases,
    })).toThrow(/No curated Release notes/)
  })
})
