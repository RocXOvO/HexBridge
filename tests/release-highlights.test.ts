import { describe, expect, it } from 'vitest'
import { resolveReleaseHighlights } from '../src/shared/release-highlights.js'

describe('release highlights', () => {
  it('returns the curated upgrade summary for the new version', () => {
    expect(resolveReleaseHighlights('0.1.19', '0.1.20')).toMatchObject({
      version: '0.1.20',
      previousVersion: '0.1.19',
      items: expect.arrayContaining(['v0.1.20：选人伴随窗会跟随英雄联盟客户端移动和最小化。']),
    })
  })

  it('lists every intervening release when an installation skips versions', () => {
    const result = resolveReleaseHighlights('0.1.22', '0.1.25')
    expect(result?.items).toEqual([
      'v0.1.23：游戏短暂失去前台后，三卡推荐会随返回游戏正确恢复。',
      'v0.1.23：提示条仍会在卡面关闭或有界监测到期后自动撤下，不会因切屏重跑完整 OCR。',
      'v0.1.24：本地近期状态现可分别显示 4 位队友与 5 位对手，身份不完整的分组不会被猜测补齐。',
      'v0.1.24：最多汇总 20 场可用对局，点击英雄头像可查看本局内存中的脱敏胜负、K/D/A 与时长。',
      'v0.1.25：客户端每次启动都会立即检查一次最新正式版；检查只读取版本信息，不会自动下载或安装。',
    ])
  })

  it('keeps the complete historical chain available after old GitHub Releases are pruned', () => {
    const result = resolveReleaseHighlights('0.1.0', '0.1.42')
    for (let patch = 1; patch <= 42; patch += 1) {
      expect(result?.items.some((item) => item.startsWith(`v0.1.${patch}：`))).toBe(true)
    }
  })

  it('does not show a dialog for a fresh or unchanged installation', () => {
    expect(resolveReleaseHighlights('', '0.1.20')).toBeNull()
    expect(resolveReleaseHighlights('0.1.20', '0.1.20')).toBeNull()
    expect(resolveReleaseHighlights('0.1.25', '0.1.24')).toBeNull()
  })
})
