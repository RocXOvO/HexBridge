import { describe, expect, it } from 'vitest'
import type { ChampSelectSnapshot } from '../src/shared/contracts.js'
import {
  detailRanksForCurrentChampion,
  isCurrentChampionRequest,
  sameSnapshot,
  shouldRunOcr,
} from '../src/main/runtime-guards.js'

const snapshot = (patch: Partial<ChampSelectSnapshot> = {}): ChampSelectSnapshot => ({
  phase: 'InProgress',
  locale: 'zh_CN',
  queueId: 2400,
  modeActive: true,
  currentChampionId: 103,
  benchChampionIds: [],
  benchEnabled: false,
  updatedAt: 1,
  ...patch,
})

describe('runtime state guards', () => {
  it('rejects a late champion-detail response after the selected champion changes', () => {
    expect(isCurrentChampionRequest(103, 1, 81, 2)).toBe(false)
    expect(isCurrentChampionRequest(81, 2, 81, 2)).toBe(true)
  })

  it('stops OCR immediately when LCU disconnects', () => {
    expect(shouldRunOcr(true, true, snapshot())).toBe(true)
    expect(shouldRunOcr(true, false, snapshot())).toBe(false)
  })

  it('ignores timestamp-only polling updates', () => {
    expect(sameSnapshot(snapshot({ updatedAt: 1 }), snapshot({ updatedAt: 2 }))).toBe(true)
    expect(sameSnapshot(snapshot(), snapshot({ currentChampionId: 81 }))).toBe(false)
  })

  it('never ranks with details for another champion or data version', () => {
    const detail = {
      championId: 103,
      dataVersion: '16.15.6',
      ranks: [{ augmentId: 1, rank: 1, total: 100, tier: 1 }],
    }
    expect(detailRanksForCurrentChampion(detail, 103, '16.15.6')).toHaveLength(1)
    expect(detailRanksForCurrentChampion(detail, 81, '16.15.6')).toEqual([])
    expect(detailRanksForCurrentChampion(detail, 103, '16.16.1')).toEqual([])
  })
})
