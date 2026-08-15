import { describe, expect, it } from 'vitest'
// @ts-expect-error Executable release helper intentionally has no TypeScript declaration file.
import { previousStableReleaseTag, renderStableReleaseNotes } from '../scripts/release-notes.mjs'

describe('stable Release notes', () => {
  const releases = [
    { tag_name: 'v0.1.39', draft: false, prerelease: false },
    { tag_name: 'v0.1.43', draft: false, prerelease: false },
    { tag_name: 'v0.1.44', draft: false, prerelease: false },
    { tag_name: 'v0.1.45', draft: false, prerelease: false },
    { tag_name: 'v0.1.42', draft: false, prerelease: false },
    { tag_name: 'v0.1.40', draft: false, prerelease: false },
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
    expect(previousStableReleaseTag(releases, '0.1.41')).toBe('v0.1.40')
  })

  it('renders curated changes relative to the previous stable Release', () => {
    const body = renderStableReleaseNotes({
      repository: 'RocXOvO/HexBridge',
      version: '0.1.41',
      releases,
    })
    expect(body).toContain('### 相较 v0.1.40 的更新')
    expect(body).toContain('卡面指纹变化后会在 100ms 确认窗口内启动完整 OCR')
    expect(body).toContain('/compare/v0.1.40...v0.1.41')
    expect(body).not.toContain('v0.1.39：')
  })

  it('renders the single-card refresh fix for the next stable Release', () => {
    const body = renderStableReleaseNotes({
      repository: 'RocXOvO/HexBridge',
      version: '0.1.42',
      releases: [...releases, { tag_name: 'v0.1.41', draft: false, prerelease: false }],
    })
    expect(body).toContain('### 相较 v0.1.41 的更新')
    expect(body).toContain('修复单张海克斯刷新时三张卡片和标签一起跳动的问题')
    expect(body).toContain('/compare/v0.1.41...v0.1.42')
  })

  it('renders the manual refresh surface-retention fix for v0.1.43', () => {
    const body = renderStableReleaseNotes({
      repository: 'RocXOvO/HexBridge',
      version: '0.1.43',
      releases: [...releases, { tag_name: 'v0.1.41', draft: false, prerelease: false }],
    })
    expect(body).toContain('### 相较 v0.1.42 的更新')
    expect(body).toContain('手动识别检测到单张卡刷新时先撤下整组三卡')
    expect(body).toContain('/compare/v0.1.42...v0.1.43')
  })

  it('renders the internal champion-panel scroll containment fix for v0.1.44', () => {
    const body = renderStableReleaseNotes({
      repository: 'RocXOvO/HexBridge',
      version: '0.1.44',
      releases: [...releases, { tag_name: 'v0.1.43', draft: false, prerelease: false }],
    })
    expect(body).toContain('### 相较 v0.1.43 的更新')
    expect(body).toContain('备战席滚动现在完全收在面板内部')
    expect(body).toContain('/compare/v0.1.43...v0.1.44')
  })

  it('renders the redundant wrapper cleanup for v0.1.45', () => {
    const body = renderStableReleaseNotes({
      repository: 'RocXOvO/HexBridge',
      version: '0.1.45',
      releases: [...releases, { tag_name: 'v0.1.44', draft: false, prerelease: false }],
    })
    expect(body).toContain('### 相较 v0.1.44 的更新')
    expect(body).toContain('清理不再使用的旧推荐、详情和进程兼容包装器')
    expect(body).toContain('/compare/v0.1.44...v0.1.45')
  })

  it('includes every missing intermediate version when the previous stable Release is not adjacent', () => {
    const body = renderStableReleaseNotes({
      repository: 'RocXOvO/HexBridge',
      version: '0.1.41',
      releases: [{ tag_name: 'v0.1.24', draft: false, prerelease: false }],
    })
    expect(body).toContain('### 相较 v0.1.24 的更新')
    expect(body).toContain('v0.1.25：')
    expect(body).toContain('v0.1.26：')
    expect(body).toContain('v0.1.41：')
  })

  it('fails closed when a version has no curated notes', () => {
    expect(() => renderStableReleaseNotes({
      repository: 'RocXOvO/HexBridge',
      version: '9.9.9',
      releases,
    })).toThrow(/No curated Release notes/)
  })
})
