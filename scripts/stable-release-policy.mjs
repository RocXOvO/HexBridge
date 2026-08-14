const parseTriplet = (value, withTagPrefix) => {
  const pattern = withTagPrefix
    ? /^v(\d+)\.(\d+)\.(\d+)$/
    : /^(\d+)\.(\d+)\.(\d+)$/
  const match = String(value).match(pattern)
  return match ? match.slice(1).map((part) => BigInt(part)) : null
}

export const versionParts = (value) => {
  const parsed = parseTriplet(value, false)
  if (!parsed) throw new Error('Stable channel version is invalid')
  return parsed
}

export const releaseTagParts = (value) => parseTriplet(value, true)

export const compareVersions = (left, right) => {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] > right[index]) return 1
    if (left[index] < right[index]) return -1
  }
  return 0
}

export const higherStableReleaseTags = (releases, candidateVersion) => {
  const candidate = versionParts(candidateVersion)
  return releases
    .filter((release) => !release?.draft && !release?.prerelease)
    .map((release) => ({ tag: String(release?.tag_name ?? ''), parts: releaseTagParts(release?.tag_name) }))
    .filter((release) => release.parts && compareVersions(release.parts, candidate) > 0)
    .map((release) => release.tag)
}

export const stableReleasesNewestFirst = (releases) => releases
  .filter((release) => !release?.draft && !release?.prerelease)
  .map((release) => ({ release, parts: releaseTagParts(release?.tag_name) }))
  .filter((entry) => entry.parts)
  .sort((left, right) => compareVersions(right.parts, left.parts))
  .map((entry) => entry.release)

export const stableReleasesToDelete = (releases, keepCount = 5) => {
  if (!Number.isSafeInteger(keepCount) || keepCount < 1) {
    throw new Error('Stable Release retention count is invalid')
  }
  return stableReleasesNewestFirst(releases).slice(keepCount)
}

export const stableReleaseRetentionPlan = (releases, currentVersion, keepCount = 5) => {
  const currentTag = `v${currentVersion}`
  if (higherStableReleaseTags(releases, currentVersion).length) {
    throw new Error('Refusing to prune while a higher stable Release exists')
  }
  const newest = stableReleasesNewestFirst(releases)
  if (new Set(newest.map((release) => release.tag_name)).size !== newest.length) {
    throw new Error('Refusing to prune duplicate stable Release tags')
  }
  if (newest[0]?.tag_name !== currentTag) {
    throw new Error('Current stable Release is not the newest verified public Release')
  }
  return {
    keep: newest.slice(0, keepCount),
    remove: stableReleasesToDelete(releases, keepCount),
  }
}
