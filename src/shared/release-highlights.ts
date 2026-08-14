import type { ReleaseHighlights } from './contracts.js'
import { RELEASE_HIGHLIGHTS } from './release-highlights-data.mjs'

const VERSION_PATTERN = /^\d+\.\d+\.\d+$/

const versionParts = (value: string): [bigint, bigint, bigint] | null => {
  const match = value.match(/^(\d+)\.(\d+)\.(\d+)$/)
  return match ? [BigInt(match[1]!), BigInt(match[2]!), BigInt(match[3]!)] : null
}

const compareVersions = (left: string, right: string): number => {
  const leftParts = versionParts(left)
  const rightParts = versionParts(right)
  if (!leftParts || !rightParts) return 0
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index]! > rightParts[index]!) return 1
    if (leftParts[index]! < rightParts[index]!) return -1
  }
  return 0
}

export function resolveReleaseHighlights(
  previousVersion: string,
  currentVersion: string,
): ReleaseHighlights | null {
  if (
    previousVersion === currentVersion ||
    !VERSION_PATTERN.test(previousVersion) ||
    !VERSION_PATTERN.test(currentVersion) ||
    compareVersions(previousVersion, currentVersion) >= 0
  ) return null
  const versions = Object.keys(RELEASE_HIGHLIGHTS)
    .filter((version) => compareVersions(version, previousVersion) > 0 && compareVersions(version, currentVersion) <= 0)
    .sort(compareVersions)
  if (!versions.length || versions.at(-1) !== currentVersion) return null
  const items = versions.flatMap((version) => (
    RELEASE_HIGHLIGHTS[version] ?? []
  ).map((item) => `v${version}：${item}`))
  return items.length ? { version: currentVersion, previousVersion, items } : null
}
