import { describe, expect, it } from 'vitest'
// @ts-expect-error Executable release helper intentionally has no TypeScript declaration file.
import { previousStableReleaseTag, renderStableReleaseNotes } from '../scripts/release-notes.mjs'

describe('stable Release notes', () => {
  const releases = [
    { tag_name: 'v0.1.39', draft: false, prerelease: false },
    { tag_name: 'v0.1.43', draft: false, prerelease: false },
    { tag_name: 'v0.1.44', draft: false, prerelease: false },
    { tag_name: 'v0.1.45', draft: false, prerelease: false },
    { tag_name: 'v0.1.46', draft: false, prerelease: false },
    { tag_name: 'v0.1.47', draft: false, prerelease: false },
    { tag_name: 'v0.1.48', draft: false, prerelease: false },
    { tag_name: 'v0.1.49', draft: false, prerelease: false },
    { tag_name: 'v0.1.50', draft: false, prerelease: false },
    { tag_name: 'v0.1.51', draft: false, prerelease: false },
    { tag_name: 'v0.1.52', draft: false, prerelease: false },
    { tag_name: 'v0.1.53', draft: false, prerelease: false },
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

  it('renders the Live Client diagnostic sampling and single-card animation fix for v0.1.46', () => {
    const body = renderStableReleaseNotes({
      repository: 'RocXOvO/HexBridge',
      version: '0.1.46',
      releases,
    })
    expect(body).toContain('### 相较 v0.1.45 的更新')
    expect(body).toContain('当前英雄等级')
    expect(body).toContain('脱敏采样')
    expect(body).toContain('/compare/v0.1.45...v0.1.46')
  })

  it('renders the compact overlay animation-cycle fix for v0.1.47', () => {
    const body = renderStableReleaseNotes({
      repository: 'RocXOvO/HexBridge',
      version: '0.1.47',
      releases,
    })
    expect(body).toContain('### 相较 v0.1.46 的更新')
    expect(body).toContain('96px 推荐条')
    expect(body).toContain('/compare/v0.1.46...v0.1.47')
  })

  it('renders the manual incomplete-refresh surface retention fix for v0.1.48', () => {
    const body = renderStableReleaseNotes({
      repository: 'RocXOvO/HexBridge',
      version: '0.1.48',
      releases,
    })
    expect(body).toContain('### 相较 v0.1.47 的更新')
    expect(body).toContain('首轮识别不完整')
    expect(body).toContain('/compare/v0.1.47...v0.1.48')
  })

  it('renders the hidden-surface resurrection fix for v0.1.49', () => {
    const body = renderStableReleaseNotes({
      repository: 'RocXOvO/HexBridge',
      version: '0.1.49',
      releases,
    })
    expect(body).toContain('### 相较 v0.1.48 的更新')
    expect(body).toContain('卡面已被可靠隐藏')
    expect(body).toContain('/compare/v0.1.48...v0.1.49')
  })

  it('renders the automatic-probe hidden-surface fix for v0.1.50', () => {
    const body = renderStableReleaseNotes({
      repository: 'RocXOvO/HexBridge',
      version: '0.1.50',
      releases,
    })
    expect(body).toContain('### 相较 v0.1.49 的更新')
    expect(body).toContain('自动低成本 probe')
    expect(body).toContain('/compare/v0.1.49...v0.1.50')
  })

  it('renders Tencent champion pick rate for v0.1.51', () => {
    const body = renderStableReleaseNotes({
      repository: 'RocXOvO/HexBridge',
      version: '0.1.51',
      releases,
    })
    expect(body).toContain('### 相较 v0.1.50 的更新')
    expect(body).toContain('总体选取率贯通当前英雄、备战席与英雄榜')
    expect(body).toContain('/compare/v0.1.50...v0.1.51')
  })

  it('renders the transient refresh probe and physical-slot animation fix for v0.1.52', () => {
    const body = renderStableReleaseNotes({
      repository: 'RocXOvO/HexBridge',
      version: '0.1.52',
      releases,
    })
    expect(body).toContain('### 相较 v0.1.51 的更新')
    expect(body).toContain('短暂识别空窗误撤整组三卡')
    expect(body).toContain('按物理卡位与卡片 ID 区分节点')
    expect(body).toContain('/compare/v0.1.51...v0.1.52')
  })

  it('renders the weighted team strength summary for v0.1.53', () => {
    const body = renderStableReleaseNotes({
      repository: 'RocXOvO/HexBridge',
      version: '0.1.53',
      releases,
    })
    expect(body).toContain('### 相较 v0.1.52 的更新')
    expect(body).toContain('队伍强度摘要')
    expect(body).toContain('/compare/v0.1.52...v0.1.53')
  })

  it('renders the de-identified OCR scheduler diagnostics for v0.1.54', () => {
    const body = renderStableReleaseNotes({
      repository: 'RocXOvO/HexBridge',
      version: '0.1.54',
      releases,
    })
    expect(body).toContain('### 相较 v0.1.53 的更新')
    expect(body).toContain('脱敏 OCR 调度摘要')
    expect(body).toContain('/compare/v0.1.53...v0.1.54')
  })

  it('renders the packaged UI smoke gate correction for v0.1.55', () => {
    const body = renderStableReleaseNotes({
      repository: 'RocXOvO/HexBridge',
      version: '0.1.55',
      releases,
    })
    expect(body).toContain('### 相较 v0.1.53 的更新')
    expect(body).toContain('v0.1.54：')
    expect(body).toContain('脱敏 OCR 调度摘要')
    expect(body).toContain('v0.1.55：')
    expect(body).toContain('打包 UI smoke')
    expect(body).toContain('/compare/v0.1.53...v0.1.55')
  })

  it('keeps the no-Release intermediate tags in the v0.1.56 cumulative notes', () => {
    const body = renderStableReleaseNotes({
      repository: 'RocXOvO/HexBridge',
      version: '0.1.56',
      releases: [...releases, { tag_name: 'v0.1.55', draft: false, prerelease: false }],
    })
    expect(body).toContain('### 相较 v0.1.55 的更新')
    expect(body).toContain('修正 Release notes 测试')
    expect(body).not.toContain('v0.1.54：')
    expect(body).not.toContain('v0.1.55：')
    expect(body).toContain('/compare/v0.1.55...v0.1.56')
  })

  it('renders the bounded refresh absence grace for v0.1.57', () => {
    const body = renderStableReleaseNotes({
      repository: 'RocXOvO/HexBridge',
      version: '0.1.57',
      releases: [...releases, { tag_name: 'v0.1.56', draft: false, prerelease: false }],
    })
    expect(body).toContain('### 相较 v0.1.56 的更新')
    expect(body).toContain('短暂探测空窗')
    expect(body).toContain('/compare/v0.1.56...v0.1.57')
  })

  it('renders incremental single-slot OCR for v0.1.58', () => {
    const body = renderStableReleaseNotes({
      repository: 'RocXOvO/HexBridge',
      version: '0.1.58',
      releases: [...releases, { tag_name: 'v0.1.57', draft: false, prerelease: false }],
    })
    expect(body).toContain('### 相较 v0.1.57 的更新')
    expect(body).toContain('单个物理卡位做增量 OCR')
    expect(body).toContain('1.8 秒保留租约')
    expect(body).toContain('不隐藏 96px 小窗')
    expect(body).toContain('/compare/v0.1.57...v0.1.58')
  })

  it('renders the no-group-transition fix for v0.1.59', () => {
    const body = renderStableReleaseNotes({
      repository: 'RocXOvO/HexBridge',
      version: '0.1.59',
      releases: [...releases, { tag_name: 'v0.1.58', draft: false, prerelease: false }],
    })
    expect(body).toContain('### 相较 v0.1.58 的更新')
    expect(body).toContain('整组三卡进出场过渡')
    expect(body).toContain('/compare/v0.1.58...v0.1.59')
  })

  it('renders the allgamedata diagnostic experiment for v0.1.60', () => {
    const body = renderStableReleaseNotes({
      repository: 'RocXOvO/HexBridge',
      version: '0.1.60',
      releases: [...releases, { tag_name: 'v0.1.58', draft: false, prerelease: false }, { tag_name: 'v0.1.59', draft: false, prerelease: false }],
    })
    expect(body).toContain('### 相较 v0.1.59 的更新')
    expect(body).toContain('allgamedata')
    expect(body).toContain('不保存原始响应')
    expect(body).toContain('/compare/v0.1.59...v0.1.60')
  })

  it('renders the private full Live Client capture for v0.1.61', () => {
    const body = renderStableReleaseNotes({
      repository: 'RocXOvO/HexBridge',
      version: '0.1.61',
      releases: [...releases, { tag_name: 'v0.1.59', draft: false, prerelease: false }, { tag_name: 'v0.1.60', draft: false, prerelease: false }],
    })
    expect(body).toContain('### 相较 v0.1.60 的更新')
    expect(body).toContain('个人研究模式')
    expect(body).toContain('完整 allgamedata')
    expect(body).toContain('不进入 Renderer')
    expect(body).toContain('/compare/v0.1.60...v0.1.61')
  })

  it('renders the Tencent bestHeroes and grouped champion ranking release for v0.1.62', () => {
    const body = renderStableReleaseNotes({
      repository: 'RocXOvO/HexBridge',
      version: '0.1.62',
      releases: [...releases, { tag_name: 'v0.1.60', draft: false, prerelease: false }, { tag_name: 'v0.1.61', draft: false, prerelease: false }],
    })
    expect(body).toContain('### 相较 v0.1.61 的更新')
    expect(body).toContain('bestHeroes')
    expect(body).toContain('OP、T1–T5')
    expect(body).toContain('独立 data.dtodo 出装')
    expect(body).toContain('/compare/v0.1.61...v0.1.62')
  })

  it('renders the hero-card and dedicated detail page release for v0.1.63', () => {
    const body = renderStableReleaseNotes({
      repository: 'RocXOvO/HexBridge',
      version: '0.1.63',
      releases: [...releases, { tag_name: 'v0.1.62', draft: false, prerelease: false }],
    })
    expect(body).toContain('### 相较 v0.1.62 的更新')
    expect(body).toContain('英雄榜改为头像卡片布局')
    expect(body).toContain('英雄详情独立成页')
    expect(body).toContain('/compare/v0.1.62...v0.1.63')
  })

  it('accumulates a tag-only v0.1.63 when rendering v0.1.64', () => {
    const body = renderStableReleaseNotes({
      repository: 'RocXOvO/HexBridge',
      version: '0.1.64',
      releases: [...releases, { tag_name: 'v0.1.62', draft: false, prerelease: false }],
    })
    expect(body).toContain('### 相较 v0.1.62 的更新')
    expect(body).toContain('v0.1.63：')
    expect(body).toContain('v0.1.64：')
    expect(body).toContain('/compare/v0.1.62...v0.1.64')
  })

  it('renders the independent hero detail loading and data.dtodo entry fix for v0.1.65', () => {
    const body = renderStableReleaseNotes({
      repository: 'RocXOvO/HexBridge',
      version: '0.1.65',
      releases: [...releases, { tag_name: 'v0.1.64', draft: false, prerelease: false }],
    })
    expect(body).toContain('### 相较 v0.1.64 的更新')
    expect(body).toContain('独立出装')
    expect(body).toContain('data.dtodo API Key 配置收回')
    expect(body).toContain('/compare/v0.1.64...v0.1.65')
  })

  it('renders the source-card packaged smoke follow-up for v0.1.66', () => {
    const body = renderStableReleaseNotes({
      repository: 'RocXOvO/HexBridge',
      version: '0.1.66',
      releases: [...releases, { tag_name: 'v0.1.64', draft: false, prerelease: false }],
    })
    expect(body).toContain('### 相较 v0.1.64 的更新')
    expect(body).toContain('来源卡片配置入口')
    expect(body).toContain('/compare/v0.1.64...v0.1.66')
  })

  it('renders hero-specialized live OCR ranking for v0.1.67', () => {
    const body = renderStableReleaseNotes({
      repository: 'RocXOvO/HexBridge',
      version: '0.1.67',
      releases: [...releases, { tag_name: 'v0.1.64', draft: false, prerelease: false }, { tag_name: 'v0.1.66', draft: false, prerelease: false }],
    })
    expect(body).toContain('### 相较 v0.1.66 的更新')
    expect(body).toContain('实时 OCR 三卡')
    expect(body).toContain('当前英雄')
    expect(body).toContain('部分卡位通过')
    expect(body).toContain('/compare/v0.1.66...v0.1.67')
  })

  it('renders the concise leaderboard, history fallback and retired card sampling for v0.1.68', () => {
    const body = renderStableReleaseNotes({
      repository: 'RocXOvO/HexBridge',
      version: '0.1.68',
      releases: [...releases, { tag_name: 'v0.1.64', draft: false, prerelease: false }, { tag_name: 'v0.1.66', draft: false, prerelease: false }, { tag_name: 'v0.1.67', draft: false, prerelease: false }],
    })
    expect(body).toContain('### 相较 v0.1.67 的更新')
    expect(body).toContain('简洁的 OP、T1–T5 分组')
    expect(body).toContain('唯一 PUUID')
    expect(body).toContain('移除已确认无法可靠判断选卡完成状态')
    expect(body).toContain('/compare/v0.1.67...v0.1.68')
  })

  it('renders the detail hydration guard fix for v0.1.69', () => {
    const body = renderStableReleaseNotes({
      repository: 'RocXOvO/HexBridge',
      version: '0.1.69',
      releases: [...releases, { tag_name: 'v0.1.64', draft: false, prerelease: false }, { tag_name: 'v0.1.66', draft: false, prerelease: false }, { tag_name: 'v0.1.67', draft: false, prerelease: false }, { tag_name: 'v0.1.68', draft: false, prerelease: false }],
    })
    expect(body).toContain('### 相较 v0.1.68 的更新')
    expect(body).toContain('hydration')
    expect(body).toContain('自动重读当前英雄')
    expect(body).toContain('/compare/v0.1.68...v0.1.69')
  })

  it('renders the compact hero ranking and metric cleanup for v0.1.70', () => {
    const body = renderStableReleaseNotes({
      repository: 'RocXOvO/HexBridge',
      version: '0.1.70',
      releases: [...releases, { tag_name: 'v0.1.64', draft: false, prerelease: false }, { tag_name: 'v0.1.66', draft: false, prerelease: false }, { tag_name: 'v0.1.67', draft: false, prerelease: false }, { tag_name: 'v0.1.68', draft: false, prerelease: false }, { tag_name: 'v0.1.69', draft: false, prerelease: false }],
    })
    expect(body).toContain('### 相较 v0.1.69 的更新')
    expect(body).toContain('移除容易与全局口径混淆的英雄选取率徽标')
    expect(body).toContain('轻量 Tier 边框高亮')
    expect(body).toContain('/compare/v0.1.69...v0.1.70')
  })

  it('renders hero-specific live ranking and chroma border notes for v0.1.71', () => {
    const body = renderStableReleaseNotes({
      repository: 'RocXOvO/HexBridge',
      version: '0.1.71',
      releases: [...releases, { tag_name: 'v0.1.66', draft: false, prerelease: false }, { tag_name: 'v0.1.67', draft: false, prerelease: false }, { tag_name: 'v0.1.68', draft: false, prerelease: false }, { tag_name: 'v0.1.69', draft: false, prerelease: false }, { tag_name: 'v0.1.70', draft: false, prerelease: false }],
    })
    expect(body).toContain('### 相较 v0.1.70 的更新')
    expect(body).toContain('只按当前英雄的 lowest_rank_runes 专属推荐顺序排序')
    expect(body).toContain('炫彩卡牌渐变高亮')
    expect(body).toContain('/compare/v0.1.70...v0.1.71')
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
