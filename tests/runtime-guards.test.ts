import { describe, expect, it } from 'vitest'
import type { ChampionAugmentData, ChampSelectSnapshot } from '../src/shared/contracts.js'
import {
  automaticOcrErrorDelay,
  classifyScanContext,
  detailBuildForCurrentChampion,
  fingerprintDistance,
  isCurrentScanContext,
  isCurrentChampionRequest,
  sameSnapshot,
  shouldShowAugmentCompanion,
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
  it('shows the bounded augment companion only for three reliably identified cards', () => {
    const reliable = [
      { slot: 'left', augmentId: 1, position: 1 },
      { slot: 'center', augmentId: 2, position: null },
      { slot: 'right', augmentId: 3, position: 2 },
    ]
    const input = [{ showInGameRecommendations: true }, { matchStage: 'active' }, { visible: true }] as const
    expect(shouldShowAugmentCompanion(input[0], input[1] as any, { ...input[2], slots: reliable }, true)).toBe(true)
    for (const recognized of [0, 1, 2]) {
      const partial = reliable.map((slot, index) => ({ ...slot, augmentId: index < recognized ? slot.augmentId : null }))
      expect(shouldShowAugmentCompanion(input[0], input[1] as any, { ...input[2], slots: partial }, true)).toBe(false)
    }
    expect(shouldShowAugmentCompanion(input[0], input[1] as any, { ...input[2], slots: reliable }, false)).toBe(false)
    expect(shouldShowAugmentCompanion(input[0], { matchStage: 'launching' } as any, { ...input[2], slots: reliable }, true)).toBe(false)
  })
  it('compares only bounded three-slot visual fingerprints', () => {
    expect(fingerprintDistance(['0000', '0000', '0000'], ['0000', '0000', '0000'])).toBe(0)
    expect(fingerprintDistance(['0000', '0000', '0000'], ['0000', 'ffff', '0000'])).toBe(1)
    expect(fingerprintDistance(['0000'], ['0000'])).toBe(1)
  })
  it('backs off repeated automatic capture or model errors', () => {
    expect([0, 1, 2, 3, 8].map(automaticOcrErrorDelay)).toEqual([4_000, 8_000, 15_000, 15_000, 15_000])
  })
  it('rejects a late champion-detail response after the selected champion changes', () => {
    expect(isCurrentChampionRequest(103, 1, 81, 2)).toBe(false)
    expect(isCurrentChampionRequest(81, 2, 81, 2)).toBe(true)
  })

  it('runs automatic OCR only during active play with a visible main window or foreground game overlay', () => {
    expect(shouldRunOcr(true, snapshot({ matchStage: 'launching', phase: 'None' }))).toBe(false)
    expect(shouldRunOcr(true, snapshot({ matchStage: 'active' }))).toBe(true)
    expect(shouldRunOcr(true, snapshot({ matchStage: 'active' }), { visible: false, minimized: false })).toBe(false)
    expect(shouldRunOcr(true, snapshot({ matchStage: 'active' }), { visible: true, minimized: true })).toBe(false)
    expect(shouldRunOcr(true, snapshot({ matchStage: 'active' }), { visible: true, minimized: false, focused: false })).toBe(false)
    expect(shouldRunOcr(true, snapshot({ matchStage: 'active' }), { visible: true, minimized: false, focused: true })).toBe(true)
    expect(shouldRunOcr(
      true,
      snapshot({ matchStage: 'active' }),
      { visible: false, minimized: false },
      { enabled: true, gameForeground: true },
    )).toBe(true)
    expect(shouldRunOcr(
      true,
      snapshot({ matchStage: 'active' }),
      { visible: false, minimized: false },
      { enabled: true, gameForeground: false },
    )).toBe(false)
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
      builds: [{ label: '爆发法师', patch: '16.15', source: 'iesdev', startingItems: [], coreItems: [], situationalItems: [] }],
    }
    expect(detailBuildForCurrentChampion(detail, 103, '16.15.6')).toMatchObject({ label: '爆发法师' })
    expect(detailBuildForCurrentChampion(detail, 81, '16.15.6')).toBeNull()
    expect(detailBuildForCurrentChampion(detail, 103, '16.16.1')).toBeNull()
  })
})
