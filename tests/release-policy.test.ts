import { describe, expect, it } from 'vitest'
import {
  compareVersions,
  higherStableReleaseTags,
  releaseTagParts,
  stableReleaseRetentionPlan,
  stableReleasesNewestFirst,
  stableReleasesToDelete,
  versionParts,
} from '../scripts/stable-release-policy.mjs'

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

  it('keeps exactly the five newest public stable Releases without touching drafts or prereleases', () => {
    const releases = [
      { id: 20, tag_name: 'v0.1.20', draft: false, prerelease: false },
      { id: 25, tag_name: 'v0.1.25', draft: false, prerelease: false },
      { id: 24, tag_name: 'v0.1.24', draft: false, prerelease: false },
      { id: 23, tag_name: 'v0.1.23', draft: false, prerelease: false },
      { id: 22, tag_name: 'v0.1.22', draft: false, prerelease: false },
      { id: 21, tag_name: 'v0.1.21', draft: false, prerelease: false },
      { id: 26, tag_name: 'v0.1.26-rc.1', draft: false, prerelease: true },
      { id: 27, tag_name: 'v0.1.27', draft: true, prerelease: false },
    ]
    expect(stableReleasesNewestFirst(releases).map((release) => release.tag_name)).toEqual([
      'v0.1.25', 'v0.1.24', 'v0.1.23', 'v0.1.22', 'v0.1.21', 'v0.1.20',
    ])
    expect(stableReleasesToDelete(releases, 5).map((release) => release.tag_name)).toEqual(['v0.1.20'])
    expect(() => stableReleasesToDelete(releases, 0)).toThrow(/invalid/)
  })

  it('does not place non-semver public entries into the deletion set', () => {
    expect(stableReleasesToDelete([
      { id: 2, tag_name: 'nightly', draft: false, prerelease: false },
      { id: 1, tag_name: 'v0.1.1', draft: false, prerelease: false },
    ], 1).map((release) => release.tag_name)).toEqual([])
  })

  it('fails closed before destructive cleanup for a higher, missing or duplicate current stable Release', () => {
    const stable = (tag_name: string, id: number) => ({ id, tag_name, draft: false, prerelease: false })
    expect(() => stableReleaseRetentionPlan([
      stable('v0.1.27', 27), stable('v0.1.26', 26),
    ], '0.1.26')).toThrow(/higher/)
    expect(() => stableReleaseRetentionPlan([
      stable('v0.1.25', 25),
    ], '0.1.26')).toThrow(/not the newest/)
    expect(() => stableReleaseRetentionPlan([
      stable('v0.1.26', 26), stable('v0.1.26', 126),
    ], '0.1.26')).toThrow(/duplicate/)
  })
})
