import { describe, expect, it } from 'vitest'
import type { ChampionSummary } from '../src/shared/contracts.js'
import { groupChampionsByTier } from '../src/shared/champion-tier-groups.js'

function hero(id: number, tier: number, winRate: number): ChampionSummary {
  return {
    id,
    alias: `Hero${id}`,
    name: `英雄${id}`,
    title: '',
    roles: [],
    iconUrl: '',
    splashUrl: '',
    tier,
    winRate,
    championPickRate: null,
    patch: '',
    date: '',
    source: 'fixture',
  }
}

describe('champion tier groups', () => {
  it('splits dtodo tier-one leaders into OP and keeps native T1-T5 buckets', () => {
    const heroes = [
      hero(1, 1, .61), hero(2, 1, .59), hero(3, 1, .58), hero(4, 1, .55),
      hero(5, 2, .54), hero(6, 3, .53), hero(7, 4, .52), hero(8, 5, .51),
    ]
    const groups = groupChampionsByTier(heroes, 'dtodo', 'tier')
    expect(groups.map((group) => [group.key, group.items.map((item) => item.id)])).toEqual([
      ['OP', [1, 2, 3]], ['T1', [4]], ['T2', [5]], ['T3', [6]], ['T4', [7]], ['T5', [8]],
    ])
  })

  it('maps Tencent overall ranks into stable OP/T1-T5 display buckets', () => {
    const heroes = Array.from({ length: 10 }, (_, index) => hero(index + 1, index + 1, .6 - index / 100))
    const groups = groupChampionsByTier(heroes, 'tencent101', 'tier')
    expect(groups.map((group) => [group.key, group.items.map((item) => item.id)])).toEqual([
      ['OP', [1, 2, 3]], ['T1', [4]], ['T2', [5]], ['T3', [6]], ['T4', [7, 8]], ['T5', [9, 10]],
    ])
  })

  it('keeps tier buckets stable while allowing win-rate sorting inside them', () => {
    const heroes = [hero(1, 1, .54), hero(2, 1, .61), hero(3, 2, .59), hero(4, 2, .52)]
    const groups = groupChampionsByTier(heroes, 'dtodo', 'winRate')
    expect(groups[0]?.key).toBe('OP')
    expect(groups[0]?.items.map((item) => item.id)).toEqual([2, 1])
    expect(groups[1]?.key).toBe('T2')
    expect(groups[1]?.items.map((item) => item.id)).toEqual([3, 4])
  })
})
