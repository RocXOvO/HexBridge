import type { ReleaseHighlights } from './contracts.js'

const VERSION_PATTERN = /^\d+\.\d+\.\d+$/

const HIGHLIGHTS: Readonly<Record<string, readonly string[]>> = {
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
