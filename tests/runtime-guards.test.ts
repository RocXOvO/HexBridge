import { describe, expect, it } from 'vitest'
import type { ChampionAugmentData, ChampSelectSnapshot } from '../src/shared/contracts.js'
import {
  classifyScanContext,
  detailRanksForCurrentChampion,
  isCurrentScanContext,
  isCurrentChampionRequest,
  sameSnapshot,
  shouldRunOcr,
  shouldShowChampionCompanion,
} from '../src/main/runtime-guards.js'

const snapshot = (patch: Partial<ChampSelectSnapshot> = {}): ChampSelectSnapshot => ({
  phase: 'InProgress',
  locale: 'zh_CN',
  queueId: 2400,
  modeActive: true,
  matchStage: 'active',
  matchGeneration: 1,
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

  it('keeps OCR eligible from game launch through active play without coupling to LCU transport', () => {
    expect(shouldRunOcr(true, snapshot({ matchStage: 'launching', phase: 'None' }))).toBe(true)
    expect(shouldRunOcr(true, snapshot({ matchStage: 'active' }))).toBe(true)
    expect(shouldRunOcr(true, snapshot({ matchStage: 'selecting' }))).toBe(false)
    expect(shouldRunOcr(false, snapshot())).toBe(false)
  })

  it('keeps the champion companion visible throughout the launching handoff', () => {
    expect(shouldShowChampionCompanion(
      { showChampionPanel: true },
      snapshot({ matchStage: 'launching', phase: 'None', currentChampionId: 103 }),
    )).toBe(true)
    expect(shouldShowChampionCompanion(
      { showChampionPanel: true },
      snapshot({ matchStage: 'active', currentChampionId: 103 }),
    )).toBe(false)
    expect(shouldShowChampionCompanion(
      { showChampionPanel: true },
      snapshot({ matchStage: 'launching', currentChampionId: null }),
    )).toBe(false)
  })

  it('rejects an OCR result after the match generation or champion changes', () => {
    expect(isCurrentScanContext(snapshot(), 1, 103)).toBe(true)
    expect(isCurrentScanContext(snapshot({ matchGeneration: 2 }), 1, 103)).toBe(false)
    expect(isCurrentScanContext(snapshot({ currentChampionId: 81 }), 1, 103)).toBe(false)
    expect(isCurrentScanContext(snapshot({ matchStage: 'none' }), 1, 103)).toBe(false)
    expect(classifyScanContext(snapshot({ matchGeneration: 2 }), 1, 103)).toBe('switched')
    expect(classifyScanContext(snapshot({ matchStage: 'none' }), 1, 103)).toBe('ended')
  })

  it('ignores timestamp-only polling updates', () => {
    expect(sameSnapshot(snapshot({ updatedAt: 1 }), snapshot({ updatedAt: 2 }))).toBe(true)
    expect(sameSnapshot(snapshot(), snapshot({ currentChampionId: 81 }))).toBe(false)
  })

  it('never ranks with details for another champion or data version', () => {
    const detail: ChampionAugmentData = {
      championId: 103,
      dataVersion: '16.15.6',
      ranks: [{ augmentId: 1, rank: 1, total: 100, tier: 1, pickRate: .2, statsSource: 'tencent', statsRegion: 'CN' }],
    }
    expect(detailRanksForCurrentChampion(detail, 103, '16.15.6')).toHaveLength(1)
    expect(detailRanksForCurrentChampion(detail, 81, '16.15.6')).toEqual([])
    expect(detailRanksForCurrentChampion(detail, 103, '16.16.1')).toEqual([])
  })
})
