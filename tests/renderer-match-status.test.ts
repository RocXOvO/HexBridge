import { describe, expect, it } from 'vitest'
import type { ChampSelectSnapshot } from '../src/shared/contracts.js'
import { describeMatchStatus } from '../src/shared/match-status.js'

const snapshot = (patch: Partial<ChampSelectSnapshot> = {}): ChampSelectSnapshot => ({
  phase: 'None',
  locale: 'zh_CN',
  queueId: 2400,
  modeActive: true,
  matchStage: 'launching',
  matchGeneration: 1,
  currentChampionId: 103,
  benchChampionIds: [],
  benchEnabled: false,
  updatedAt: 1,
  ...patch,
})

describe('renderer match handoff status', () => {
  it('distinguishes a retained game context from an ordinary LCU disconnect', () => {
    expect(describeMatchStatus(snapshot(), false)).toEqual({
      retained: true,
      label: '游戏客户端接管中 · 本局信息已保留',
      lcuTitle: 'LCU 已交接',
    })
    expect(describeMatchStatus(snapshot({
      queueId: null,
      modeActive: false,
      matchStage: 'none',
      currentChampionId: null,
    }), false)).toEqual({
      retained: false,
      label: '等待客户端',
      lcuTitle: 'LCU 未连接',
    })
  })
})
