import type { ChampSelectSnapshot } from './contracts.js'

export interface MatchStatusDescription {
  retained: boolean
  label: string
  lcuTitle: string
}

export function describeMatchStatus(
  snapshot: ChampSelectSnapshot,
  lcuConnected: boolean,
): MatchStatusDescription {
  const contextPresent = snapshot.matchStage !== 'none'
  const retained = !lcuConnected && contextPresent
  if (retained) {
    return {
      retained: true,
      label: '游戏客户端接管中 · 本局信息已保留',
      lcuTitle: 'LCU 已交接',
    }
  }
  if (!lcuConnected) return { retained: false, label: '等待客户端', lcuTitle: 'LCU 未连接' }
  if (!snapshot.modeActive) {
    return { retained: false, label: '等待海克斯大乱斗', lcuTitle: 'LCU 已连接' }
  }
  const label = snapshot.matchStage === 'selecting'
    ? '选人同步中'
    : snapshot.matchStage === 'launching'
      ? '游戏客户端接管中'
      : snapshot.matchStage === 'active'
        ? '对局中'
        : snapshot.phase
  return { retained: false, label, lcuTitle: 'LCU 已连接' }
}
