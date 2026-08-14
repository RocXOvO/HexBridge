import type { ReleaseHighlights } from './contracts.js'

const VERSION_PATTERN = /^\d+\.\d+\.\d+$/

const HIGHLIGHTS: Readonly<Record<string, readonly string[]>> = {
  '0.1.24': [
    '本地近期状态现可分别显示 4 位队友与 5 位对手，身份不完整的分组不会被猜测补齐。',
    '最多汇总 20 场可用对局，点击英雄头像可查看本局内存中的脱敏胜负、K/D/A 与时长。',
  ],
  '0.1.23': [
    '游戏短暂失去前台后，三卡下方推荐会随返回游戏正确恢复。',
    '提示条仍会在卡面关闭或有界监测到期后自动撤下，不会因切屏重跑完整 OCR。',
  ],
  '0.1.22': [
    '非海克斯队列不再残留或展示上一局的英雄、出装与三卡推荐。',
    '对局结束或换局后会失效本机身份缓存，下一局中途启动时重新只读确认当前英雄。',
  ],
  '0.1.21': [
    '退出自定义房间后会及时清理旧英雄，中途启动也能从当前对局恢复本地英雄。',
    '选人伴随窗贴合 LeagueClientUx 移动，并可在本局手动关闭后保持隐藏。',
    '三卡刷新识别更快；推荐序与英雄专属真实选取率分开展示，卡面关闭后小条自动隐藏。',
  ],
  '0.1.20': [
    '页面切换更稳定，滚动区域不再因内容高度变化而横向跳动。',
    '选人伴随窗会跟随英雄联盟客户端移动和最小化。',
    '三卡可靠识别后可在卡片下方显示点击穿透的小型推荐，并在刷新后更新。',
  ],
  '0.1.19': [
    '确认最新版后不再显示更新按钮。',
    'API Key 配置完成态更清晰。',
    '实时助手切换与推荐展示更顺滑，并自动遵守性能档位。',
  ],
  '0.1.18': [
    '侧栏与内容页切换更顺滑。',
    '更新入口改为一键完成。',
    '设置页更精简，API Key 申请可直接打开。',
  ],
}

export function resolveReleaseHighlights(
  previousVersion: string,
  currentVersion: string,
): ReleaseHighlights | null {
  if (
    previousVersion === currentVersion ||
    !VERSION_PATTERN.test(previousVersion) ||
    !VERSION_PATTERN.test(currentVersion)
  ) return null
  const items = HIGHLIGHTS[currentVersion]
  return items
    ? { version: currentVersion, previousVersion, items: [...items] }
    : null
}
