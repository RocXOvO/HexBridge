import { describe, expect, it } from 'vitest'
import type { ChampionSummary } from '../src/shared/contracts.js'
import { matchesChampionSearch } from '../src/shared/champion-search.js'

const vayne: ChampionSummary = {
  id: 67, alias: 'Vayne', name: '薇恩', title: '暗夜猎手', roles: ['marksman'],
  iconUrl: '', splashUrl: '', tier: 1, winRate: .52, patch: '', date: '', source: '',
}

describe('champion search aliases', () => {
  it.each(['薇恩', '暗夜猎手', 'vayne', 'VN', '暗 夜 猎 手'])(
    'finds Vayne by %s',
    (query) => expect(matchesChampionSearch(vayne, query)).toBe(true),
  )
  it('does not fabricate unrelated matches', () => {
    expect(matchesChampionSearch(vayne, '亚索')).toBe(false)
  })
})
