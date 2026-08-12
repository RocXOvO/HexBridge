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
