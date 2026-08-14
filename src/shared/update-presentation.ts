import type { AppUpdateState } from './contracts.js'

export function shouldShowUpdateAction(status: AppUpdateState['status']): boolean {
  return status !== 'unsupported' && status !== 'up-to-date'
}

export function describeUpdateAction(
  state: AppUpdateState,
  blocked: boolean,
): string {
  if (blocked) return '对局后更新'
  if (state.status === 'checking') return '检查中…'
  if (state.status === 'downloading') {
    const percent = Math.max(0, Math.min(100, state.percent ?? 0))
    return `${percent.toFixed(0)}%`
  }
  if (state.status === 'downloaded') return '重启更新'
  if (state.status === 'installing') return '更新中…'
  if (state.status === 'available') {
    return state.availableVersion ? `更新至 v${state.availableVersion}` : '一键更新'
  }
  if (state.status === 'error') return state.availableVersion ? '重试更新' : '重试检查'
  if (state.status === 'idle') return '检查更新'
  return ''
}
