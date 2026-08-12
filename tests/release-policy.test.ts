import { describe, expect, it } from 'vitest'
// @ts-expect-error Executable release policy script intentionally has no TypeScript declaration file.
import { compareVersions, higherStableReleaseTags, releaseTagParts, versionParts } from '../scripts/stable-release-policy.mjs'

describe('stable release retention policy', () => {
  it('compares numeric semver components instead of lexical tag text', () => {
    expect(compareVersions(versionParts('0.1.10'), versionParts('0.1.9'))).toBe(1)
    expect(compareVersions(versionParts('1.0.0'), versionParts('1.0.0'))).toBe(0)
    expect(compareVersions(versionParts('0.9.9'), versionParts('1.0.0'))).toBe(-1)
    expect(releaseTagParts('release-1.0.0')).toBeNull()
  })

  it('fails closed only for a higher public stable release', () => {
    const releases = [
      { tag_name: 'v0.1.7', draft: false, prerelease: false },
      { tag_name: 'v0.1.9', draft: true, prerelease: false },
      { tag_name: 'v0.2.0', draft: false, prerelease: true },
      { tag_name: 'nightly', draft: false, prerelease: false },
      { tag_name: 'v0.1.10', draft: false, prerelease: false },
    ]

    expect(higherStableReleaseTags(releases, '0.1.8')).toEqual(['v0.1.10'])
    expect(higherStableReleaseTags(releases, '0.1.10')).toEqual([])
  })
})
