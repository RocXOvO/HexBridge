import { RELEASE_HIGHLIGHTS } from '../src/shared/release-highlights-data.mjs'
import { compareVersions, releaseTagParts, versionParts } from './stable-release-policy.mjs'

export function previousStableReleaseTag(releases, version) {
  const current = versionParts(version)
  return releases
    .filter((release) => !release?.draft && !release?.prerelease)
    .map((release) => ({ tag: String(release?.tag_name ?? ''), parts: releaseTagParts(release?.tag_name) }))
    .filter((release) => release.parts && compareVersions(release.parts, current) < 0)
    .sort((left, right) => compareVersions(right.parts, left.parts))[0]?.tag ?? null
}

export function renderStableReleaseNotes({ repository, version, releases }) {
  const previousTag = previousStableReleaseTag(releases, version)
  const previousVersion = previousTag?.slice(1) ?? null
  const currentParts = versionParts(version)
  const versions = Object.keys(RELEASE_HIGHLIGHTS)
    .map((entryVersion) => ({ version: entryVersion, parts: versionParts(entryVersion) }))
    .filter((entry) => (
      compareVersions(entry.parts, currentParts) <= 0 &&
      (!previousVersion || compareVersions(entry.parts, versionParts(previousVersion)) > 0)
    ))
    .sort((left, right) => compareVersions(left.parts, right.parts))
    .map((entry) => entry.version)
  if (!versions.length || versions.at(-1) !== version) {
    throw new Error(`No curated Release notes exist for v${version}`)
  }
  const changes = versions.flatMap((entryVersion) => (
    RELEASE_HIGHLIGHTS[entryVersion] ?? []
  ).map((change) => versions.length === 1 ? change : `v${entryVersion}：${change}`))
  const tag = `v${version}`
  const comparison = previousTag
    ? `相较 ${previousTag} 的更新`
    : '本版本更新'
  const lines = [
    `## HexBridge ${tag}`,
    '',
    `### ${comparison}`,
    '',
    ...changes.map((change) => `- ${change}`),
    '',
    '### 安装说明',
    '',
    '- 客户端会在启动时只读检查新版；下载和安装仍由用户主动触发。',
    '- Windows 安装包尚未进行商业代码签名，可能显示未知发布者或触发 SmartScreen。',
  ]
  if (previousTag) {
    lines.push('', `**完整变更**：https://github.com/${repository}/compare/${previousTag}...${tag}`)
  }
  return `${lines.join('\n')}\n`
}
