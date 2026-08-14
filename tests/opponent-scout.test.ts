import { describe, expect, it, vi } from 'vitest'
import {
  classifyOpponentForm,
  extractRecentMatchSamples,
  extractVisibleOpponentIdentities,
  summarizeOpponentHistory,
} from '../src/main/opponent-scout.js'
import { isLcuReadOnlyEndpoint, LcuClient } from '../src/main/lcu/client.js'

vi.mock('../src/main/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), recent: () => [] },
}))

const SELF = `self_${'a'.repeat(32)}`
const ENEMY_ONE = `enemy_${'b'.repeat(32)}`
const ENEMY_TWO = `enemy_${'c'.repeat(32)}`
const ENEMY_THREE = `enemy_${'d'.repeat(32)}`
const ENEMY_FOUR = `enemy_${'e'.repeat(32)}`
const ENEMY_FIVE = `enemy_${'f'.repeat(32)}`

const game = (win: boolean, kills: number, deaths: number, assists: number, duration = 900) => ({
  gameDuration: duration,
  participants: [{ stats: { win, kills, deaths, assists } }],
})

describe('local opponent form experiment', () => {
  it('extracts only the opposite explicit gameflow team and preserves slot champion ids', () => {
    expect(extractVisibleOpponentIdentities({
      currentSummoner: { puuid: SELF },
      gameflowSession: {
        gameData: {
          teamOne: [{ puuid: SELF, championId: 103 }],
          teamTwo: [
            { puuid: ENEMY_ONE, championId: 63, nameVisibilityType: 'VISIBLE' },
            { puuid: ENEMY_TWO, championId: 89, nameVisibilityType: 'VISIBLE' },
            { puuid: ENEMY_THREE, championId: 81, nameVisibilityType: 'VISIBLE' },
            { puuid: ENEMY_FOUR, championId: 22, nameVisibilityType: 'VISIBLE' },
            { puuid: ENEMY_FIVE, championId: 99, nameVisibilityType: 'VISIBLE' },
          ],
        },
      },
      champSelectSession: null,
      matchStage: 'active',
    })).toEqual([
      { puuid: ENEMY_ONE, championId: 63 },
      { puuid: ENEMY_TWO, championId: 89 },
      { puuid: ENEMY_THREE, championId: 81 },
      { puuid: ENEMY_FOUR, championId: 22 },
      { puuid: ENEMY_FIVE, championId: 99 },
    ])
  })

  it('uses visible champ-select identities but rejects hidden, malformed and spectator-like payloads', () => {
    expect(extractVisibleOpponentIdentities({
      currentSummoner: { puuid: SELF },
      gameflowSession: null,
      champSelectSession: {
        myTeam: [{ puuid: SELF }],
        theirTeam: [
          { puuid: ENEMY_ONE, championPickIntent: 81, nameVisibilityType: 'VISIBLE' },
          { puuid: ENEMY_TWO, championId: 63, nameVisibilityType: 'VISIBLE' },
          { puuid: ENEMY_THREE, championId: 89, nameVisibilityType: 'VISIBLE' },
          { puuid: ENEMY_FOUR, championId: 22, nameVisibilityType: 'VISIBLE' },
          { puuid: ENEMY_FIVE, championId: 99, nameVisibilityType: 'VISIBLE' },
        ],
      },
      matchStage: 'selecting',
    })).toHaveLength(5)

    expect(extractVisibleOpponentIdentities({
      currentSummoner: { puuid: SELF },
      gameflowSession: null,
      champSelectSession: {
        myTeam: [{ puuid: SELF }],
        theirTeam: [
          { puuid: ENEMY_ONE, nameVisibilityType: 'VISIBLE' },
          { puuid: ENEMY_TWO, nameVisibilityType: 'HIDDEN' },
          { puuid: ENEMY_THREE, nameVisibilityType: 'VISIBLE' },
          { puuid: ENEMY_FOUR, nameVisibilityType: 'VISIBLE' },
          { puuid: ENEMY_FIVE, nameVisibilityType: 'VISIBLE' },
        ],
      },
      matchStage: 'selecting',
    })).toEqual([])

    expect(extractVisibleOpponentIdentities({
      currentSummoner: { puuid: SELF },
      gameflowSession: null,
      champSelectSession: {
        myTeam: [{ puuid: SELF }],
        theirTeam: [
          ENEMY_ONE, ENEMY_TWO, ENEMY_THREE, ENEMY_FOUR, ENEMY_FIVE, `enemy_${'g'.repeat(32)}`,
        ].map((puuid) => ({ puuid, nameVisibilityType: 'VISIBLE' })),
      },
      matchStage: 'selecting',
    })).toEqual([])

    expect(extractVisibleOpponentIdentities({
      currentSummoner: { puuid: SELF },
      gameflowSession: {
        gameData: {
          teamOne: [{ puuid: SELF }],
          teamTwo: [ENEMY_ONE, ENEMY_TWO, ENEMY_THREE, ENEMY_FOUR, ENEMY_FIVE]
            .map((puuid) => ({ puuid, nameVisibilityType: 'VISIBLE' })),
        },
      },
      champSelectSession: {
        myTeam: [{ puuid: SELF }],
        theirTeam: [
          { puuid: ENEMY_ONE, nameVisibilityType: 'VISIBLE' },
          { puuid: ENEMY_TWO, nameVisibilityType: 'HIDDEN' },
          { puuid: ENEMY_THREE, nameVisibilityType: 'VISIBLE' },
          { puuid: ENEMY_FOUR, nameVisibilityType: 'VISIBLE' },
          { puuid: ENEMY_FIVE, nameVisibilityType: 'VISIBLE' },
        ],
      },
      matchStage: 'selecting',
    })).toEqual([])

    expect(extractVisibleOpponentIdentities({
      currentSummoner: { puuid: SELF },
      gameflowSession: {
        gameData: {
          teamOne: [{ puuid: SELF }],
          teamTwo: [{ puuid: ENEMY_ONE, championId: 63 }],
        },
      },
      champSelectSession: null,
      matchStage: 'active',
    })).toEqual([])

    expect(extractVisibleOpponentIdentities({
      currentSummoner: { puuid: SELF },
      gameflowSession: { gameData: { teamOne: [], teamTwo: [{ puuid: ENEMY_ONE }] } },
      champSelectSession: { myTeam: [], theirTeam: [{ puuid: ENEMY_ONE }] },
      matchStage: 'selecting',
    })).toEqual([])
  })

  it('normalizes recent summaries, removes remakes and malformed stats, and produces an explainable tier', () => {
    const payload = {
      games: {
        games: [
          game(true, 10, 2, 12),
          game(true, 8, 3, 9),
          game(true, 6, 1, 15),
          game(false, 2, 6, 4),
          game(true, 7, 2, 8),
          game(false, 0, 0, 0, 120),
          { gameDuration: 900, participants: [{ stats: { win: true, kills: '9', deaths: 1, assists: 2 } }] },
        ],
      },
    }
    expect(extractRecentMatchSamples(payload, ENEMY_ONE)).toHaveLength(5)
    const summary = summarizeOpponentHistory(payload, 2, 81, ENEMY_ONE)
    expect(summary).toMatchObject({
      slot: 2,
      championId: 81,
      status: 'ready',
      sampleSize: 5,
      wins: 4,
      losses: 1,
      streak: 3,
      tier: null,
    })
    expect(summary.winRate).toBeCloseTo(.8)
    expect(summary.kda).toBeCloseTo(81 / 14)
    expect(summary.rating).toBeNull()
  })

  it('does not invent a rating or tier for fewer than eight valid games', () => {
    const summary = summarizeOpponentHistory(
      { games: { games: [game(false, 1, 7, 2)] } },
      1,
      null,
      ENEMY_ONE,
    )
    expect(summary).toMatchObject({
      status: 'ready', sampleSize: 1, wins: 0, losses: 1, streak: -1, rating: null, tier: null,
    })
    expect(classifyOpponentForm(65)).toBe('上等马')
    expect(classifyOpponentForm(40)).toBe('中等马')
    expect(classifyOpponentForm(39)).toBe('下等马')
  })

  it('creates a tier only when eight valid samples support the rating', () => {
    const summary = summarizeOpponentHistory({
      games: { games: Array.from({ length: 8 }, () => game(true, 8, 2, 10)) },
    }, 1, 63, ENEMY_ONE)
    expect(summary).toMatchObject({ status: 'ready', sampleSize: 8, tier: '上等马' })
    expect(summary.rating).toBeGreaterThanOrEqual(65)
  })

  it('joins multi-participant history through participantIdentities instead of guessing index zero', () => {
    const payload = {
      games: { games: [{
        gameDuration: 900,
        participantIdentities: [
          { participantId: 1, player: { puuid: SELF } },
          { participantId: 2, player: { puuid: ENEMY_ONE } },
        ],
        participants: [
          { participantId: 1, stats: { win: false, kills: 0, deaths: 9, assists: 1 } },
          { participantId: 2, stats: { win: true, kills: 9, deaths: 1, assists: 7 } },
        ],
      }] },
    }
    const samples = extractRecentMatchSamples(payload, ENEMY_ONE)
    expect(samples).toEqual([{ win: true, kills: 9, deaths: 1, assists: 7 }])
    expect(extractRecentMatchSamples(payload, ENEMY_TWO)).toEqual([])
  })

  it('rejects a single participant when an explicit identity maps to someone else', () => {
    const payload = {
      games: { games: [{
        gameDuration: 900,
        participantIdentities: [{ participantId: 1, player: { puuid: SELF } }],
        participants: [{ participantId: 1, stats: { win: true, kills: 9, deaths: 1, assists: 7 } }],
      }] },
    }
    expect(extractRecentMatchSamples(payload, ENEMY_ONE)).toEqual([])
  })

  it('orders streaks by gameCreation instead of trusting an unsorted response', () => {
    const older = { ...game(false, 1, 5, 2), gameCreation: 100 }
    const newest = { ...game(true, 8, 1, 9), gameCreation: 300 }
    const middle = { ...game(true, 6, 2, 7), gameCreation: 200 }
    const summary = summarizeOpponentHistory(
      { games: { games: [older, newest, middle] } },
      1,
      63,
      ENEMY_ONE,
    )
    expect(summary.streak).toBe(2)
  })

  it('allows only the fixed current-summoner route and bounded match-history query', () => {
    expect(isLcuReadOnlyEndpoint('/lol-summoner/v1/current-summoner')).toBe(true)
    expect(isLcuReadOnlyEndpoint(
      `/lol-match-history/v1/products/lol/${ENEMY_ONE}/matches?begIndex=0&endIndex=9`,
    )).toBe(true)
    expect(isLcuReadOnlyEndpoint(
      `/lol-match-history/v1/products/lol/${ENEMY_ONE}/matches?begIndex=0&endIndex=200`,
    )).toBe(false)
    expect(isLcuReadOnlyEndpoint('/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=9')).toBe(false)
    expect(isLcuReadOnlyEndpoint(`/lol-match-history/v1/products/lol/${ENEMY_ONE}/matches?begIndex=0&endIndex=9&token=secret`)).toBe(false)
  })

  it('queries identities and histories inside Main but returns only aggregate summaries', async () => {
    const requests: string[] = []
    const client = new LcuClient(() => '', {
      disableWebSocket: true,
      request: vi.fn(async (endpoint: string) => {
        requests.push(endpoint)
        if (endpoint === '/lol-summoner/v1/current-summoner') return { puuid: SELF }
        if (endpoint === '/lol-gameflow/v1/session') {
          return {
            gameData: {
              teamOne: [{ puuid: SELF, championId: 103 }],
              teamTwo: [
                { puuid: ENEMY_ONE, championId: 63, nameVisibilityType: 'VISIBLE' },
                { puuid: ENEMY_TWO, championId: 89, nameVisibilityType: 'VISIBLE' },
                { puuid: ENEMY_THREE, championId: 81, nameVisibilityType: 'VISIBLE' },
                { puuid: ENEMY_FOUR, championId: 22, nameVisibilityType: 'VISIBLE' },
                { puuid: ENEMY_FIVE, championId: 99, nameVisibilityType: 'VISIBLE' },
              ],
            },
          }
        }
        if (endpoint === '/lol-champ-select/v1/session') return null
        if (endpoint.includes(ENEMY_ONE)) {
          return { games: { games: Array.from({ length: 8 }, () => game(true, 5, 2, 8)) } }
        }
        if (endpoint.includes(ENEMY_TWO)) throw new Error('LCU HTTP 404')
        return null
      }),
    }) as any
    client.credentials = {
      port: 2999, token: 'secret-not-rendered', source: 'process', executablePath: 'LeagueClientUx.exe',
    }
    client.state = { connected: true, source: 'process', lastError: null, lastConnectedAt: Date.now() }
    client.snapshot = {
      phase: 'InProgress', locale: 'zh_CN', queueId: 3270, modeActive: true,
      matchStage: 'active', matchGeneration: 7, currentChampionId: 103,
      benchChampionIds: [], benchEnabled: false, updatedAt: Date.now(),
    }

    const result = await client.scoutOpponents(7)
    expect(result).toMatchObject({ status: 'partial', matchGeneration: 7, source: 'local-lcu' })
    expect(result.opponents).toHaveLength(5)
    expect(result.opponents[0]).toMatchObject({ championId: 63, status: 'ready', tier: '上等马' })
    expect(result.opponents[1]).toMatchObject({ championId: 89, status: 'unavailable' })
    expect(JSON.stringify(result)).not.toContain(SELF)
    expect(JSON.stringify(result)).not.toContain(ENEMY_ONE)
    expect(JSON.stringify(result)).not.toContain('secret-not-rendered')
    expect(requests.filter((endpoint) => endpoint.includes('/matches?'))).toHaveLength(5)
  })

  it('does not query any history unless all five opponent identities are explicitly visible', async () => {
    const requests: string[] = []
    const client = new LcuClient(() => '', {
      disableWebSocket: true,
      request: vi.fn(async (endpoint: string) => {
        requests.push(endpoint)
        if (endpoint === '/lol-summoner/v1/current-summoner') return { puuid: SELF }
        if (endpoint === '/lol-gameflow/v1/session') {
          return {
            gameData: {
              teamOne: [{ puuid: SELF }],
              teamTwo: [
                { puuid: ENEMY_ONE, nameVisibilityType: 'VISIBLE' },
                { puuid: ENEMY_TWO, nameVisibilityType: 'HIDDEN' },
              ],
            },
          }
        }
        return null
      }),
    }) as any
    client.credentials = { port: 2999, token: 'secret', source: 'process' }
    client.state = { connected: true, source: 'process', lastError: null, lastConnectedAt: Date.now() }
    client.snapshot = {
      phase: 'ChampSelect', locale: 'zh_CN', queueId: 3270, modeActive: true,
      matchStage: 'selecting', matchGeneration: 4, currentChampionId: 103,
      benchChampionIds: [], benchEnabled: false, updatedAt: Date.now(),
    }
    const result = await client.scoutOpponents(4)
    expect(result).toMatchObject({ status: 'unavailable', opponents: [] })
    expect(requests.some((endpoint) => endpoint.includes('/matches?'))).toBe(false)
  })

  it('cancels in-flight history work without returning stale aggregate data', async () => {
    const controller = new AbortController()
    const client = new LcuClient(() => '', {
      disableWebSocket: true,
      request: vi.fn(async (endpoint: string, _credentials, _timeout, signal) => {
        if (endpoint === '/lol-summoner/v1/current-summoner') return { puuid: SELF }
        if (endpoint === '/lol-gameflow/v1/session') {
          return {
            gameData: {
              teamOne: [{ puuid: SELF }],
              teamTwo: [
                { puuid: ENEMY_ONE, nameVisibilityType: 'VISIBLE' },
                { puuid: ENEMY_TWO, nameVisibilityType: 'VISIBLE' },
                { puuid: ENEMY_THREE, nameVisibilityType: 'VISIBLE' },
                { puuid: ENEMY_FOUR, nameVisibilityType: 'VISIBLE' },
                { puuid: ENEMY_FIVE, nameVisibilityType: 'VISIBLE' },
              ],
            },
          }
        }
        if (endpoint === '/lol-champ-select/v1/session') return null
        await new Promise<void>((resolve, reject) => {
          signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true })
          setTimeout(resolve, 5_000)
        })
        return null
      }),
    }) as any
    client.credentials = {
      port: 2999, token: 'secret', source: 'process', executablePath: 'LeagueClientUx.exe',
    }
    client.state = { connected: true, source: 'process', lastError: null, lastConnectedAt: Date.now() }
    client.snapshot = {
      phase: 'InProgress', locale: 'zh_CN', queueId: 3270, modeActive: true,
      matchStage: 'active', matchGeneration: 9, currentChampionId: 103,
      benchChampionIds: [], benchEnabled: false, updatedAt: Date.now(),
    }
    const operation = client.scoutOpponents(9, controller.signal)
    await Promise.resolve()
    controller.abort()
    await expect(operation).rejects.toMatchObject({ name: 'AbortError' })
  })
})
