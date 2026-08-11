import { describe, expect, it } from 'vitest'
import {
  normalizeAugmentCatalog,
  normalizeChampionAugmentDetail,
  normalizeChampionCatalog,
} from '../src/shared/data-normalize.js'

describe('upstream data sanitation', () => {
  it('keeps only the champion fields exposed by HexBridge', () => {
    const rows = normalizeChampionCatalog({ data: [{
      id: 103, alias: 'Ahri', name: '阿狸', title: '九尾妖狐', roles: ['Mage'], iconUrl: 'icon',
      stats: { tier: '2', winRate: '52.8', gamePatch: '16.15', date: '2026-08-10', source: 'tencent', wins: 123, games: 456 },
    }] })
    expect(rows[0]).toMatchObject({ id: 103, tier: 2, winRate: .528, patch: '16.15' })
    expect(rows[0]).not.toHaveProperty('wins')
    expect(rows[0]).not.toHaveProperty('games')
  })

  it('strips augment HTML and discards win-rate fields', () => {
    const rows = normalizeAugmentCatalog({ data: [{
      id: 7, name: '强化', enabled: true, description: '<rules>说明</rules><br>下一行', rarity: 2,
      stats: { tier: 1, wins: 100, games: 200, winRate: .5, pickRate: .2 },
    }] })
    expect(rows[0]).toMatchObject({ id: 7, description: '说明下一行', globalTier: 1 })
    expect(JSON.stringify(rows[0])).not.toMatch(/winRate|wins|games|pickRate/)
  })

  it('stores only official rank, total and tier for a champion augment', () => {
    const detail = normalizeChampionAugmentDetail({ data: { augments: [{
      id: 7, stats: { rank: 3, total: 167, tier: 1, winRate: .8, wins: 999, games: 1000 },
    }] } }, 103, '16.15.6')
    expect(detail).toEqual({ championId: 103, dataVersion: '16.15.6', ranks: [{ augmentId: 7, rank: 3, total: 167, tier: 1 }] })
  })
})
