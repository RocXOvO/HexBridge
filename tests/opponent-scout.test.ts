import { describe, expect, it, vi } from 'vitest'
import {
  classifyOpponentForm,
  extractRecentMatchDetails,
  extractRecentMatchSamples,
  extractVisibleOpponentIdentities,
  inspectScoutRosterObservation,
  inspectVisibleOpponentIdentities,
  inspectVisibleTeamIdentities,
  summarizeOpponentHistory,
  summarizeOpponentTeam,
} from '../src/main/opponent-scout.js'
import { isLcuReadOnlyEndpoint, LcuClient } from '../src/main/lcu/client.js'
import { logger } from '../src/main/logger.js'

vi.mock('../src/main/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), recent: () => [] },
}))

const SELF = `self_${'a'.repeat(32)}`
const ENEMY_ONE = `enemy_${'b'.repeat(32)}`
const ENEMY_TWO = `enemy_${'c'.repeat(32)}`
const ENEMY_THREE = `enemy_${'d'.repeat(32)}`
const ENEMY_FOUR = `enemy_${'e'.repeat(32)}`
const ENEMY_FIVE = `enemy_${'f'.repeat(32)}`
const ALLY_ONE = `ally_${'g'.repeat(32)}`
const ALLY_TWO = `ally_${'h'.repeat(32)}`
const ALLY_THREE = `ally_${'i'.repeat(32)}`
const ALLY_FOUR = `ally_${'j'.repeat(32)}`
const ALLIES = [ALLY_ONE, ALLY_TWO, ALLY_THREE, ALLY_FOUR]

const activeOwnTeam = (self: Array<Record<string, unknown>> = [{ puuid: SELF, championId: 103 }]) => [
  ...self,
  ...ALLIES.slice(0, Math.max(0, 5 - self.length)).map((puuid, index) => ({
    puuid,
    championId: 30 + index,
  })),
]

const selectingOwnTeam = () => [
  { puuid: SELF, nameVisibilityType: 'VISIBLE', championId: 103 },
  ...ALLIES.map((puuid, index) => ({
    puuid,
    nameVisibilityType: 'VISIBLE',
    championId: 30 + index,
  })),
]

const game = (win: boolean, kills: number, deaths: number, assists: number, duration = 900) => ({
  gameDuration: duration,
  participants: [{ stats: { win, kills, deaths, assists } }],
})

describe('local opponent form experiment', () => {
  it('refreshes vetted team champion selections without exposing identity bindings', () => {
    const initialSession = {
      myTeam: selectingOwnTeam(),
      theirTeam: [ENEMY_ONE, ENEMY_TWO, ENEMY_THREE, ENEMY_FOUR, ENEMY_FIVE]
        .map((puuid, index) => ({
          puuid,
          nameVisibilityType: 'VISIBLE',
          championId: 60 + index,
        })),
    }
    const decision = inspectVisibleTeamIdentities({
      currentSummoner: { puuid: SELF },
      gameflowSession: null,
      champSelectSession: initialSession,
      matchStage: 'selecting',
    })
    const changedSession = structuredClone(initialSession)
    changedSession.myTeam[1]!.championId = 115
    changedSession.myTeam[2]!.championId = 0
    ;(changedSession.myTeam[2] as any).championPickIntent = 99

    const observation = inspectScoutRosterObservation({
      selfPuuid: SELF,
      bindings: [...decision.allies, ...decision.opponents],
      gameflowSession: null,
      champSelectSession: changedSession,
      matchStage: 'selecting',
    })
    const selections = [...observation.allies.identities, ...observation.opponents.identities]

    expect(selections).toHaveLength(9)
    expect(selections).toContainEqual(expect.objectContaining({
      puuid: ALLY_ONE, relation: 'ally', slot: 1, championId: 115,
    }))
    expect(selections).toContainEqual(expect.objectContaining({
      relation: 'ally', slot: 2, championId: 99,
    }))
    const opponentOnly = inspectScoutRosterObservation({
      selfPuuid: SELF,
      bindings: decision.opponents,
      gameflowSession: null,
      champSelectSession: changedSession,
      matchStage: 'selecting',
    })
    expect(opponentOnly.allies.status).toBe('rejected')
    expect(opponentOnly.opponents.identities).toHaveLength(5)
  })

  it('fails champion refresh closed per group for hidden, incomplete or ambiguous rosters', () => {
    const initialSession = {
      myTeam: selectingOwnTeam(),
      theirTeam: [ENEMY_ONE, ENEMY_TWO, ENEMY_THREE, ENEMY_FOUR, ENEMY_FIVE]
        .map((puuid, index) => ({
          puuid,
          nameVisibilityType: 'VISIBLE',
          championId: 60 + index,
        })),
    }
    const decision = inspectVisibleTeamIdentities({
      currentSummoner: { puuid: SELF },
      gameflowSession: null,
      champSelectSession: initialSession,
      matchStage: 'selecting',
    })
    const bindings = [...decision.allies, ...decision.opponents]
    const hiddenAlly = structuredClone(initialSession)
    hiddenAlly.myTeam[1]!.nameVisibilityType = 'HIDDEN'
    const hidden = inspectScoutRosterObservation({
      selfPuuid: SELF, bindings, gameflowSession: null,
      champSelectSession: hiddenAlly, matchStage: 'selecting',
    })
    expect(hidden.allies.status).toBe('rejected')
    expect(hidden.opponents.identities).toHaveLength(5)

    const incompleteAlly = structuredClone(initialSession)
    incompleteAlly.myTeam.pop()
    const incomplete = inspectScoutRosterObservation({
      selfPuuid: SELF, bindings, gameflowSession: null,
      champSelectSession: incompleteAlly, matchStage: 'selecting',
    })
    expect(incomplete.allies.status).toBe('rejected')
    expect(incomplete.opponents.identities).toHaveLength(5)

    const duplicatedAcrossTeams = structuredClone(initialSession)
    duplicatedAcrossTeams.theirTeam[0]!.puuid = ALLY_ONE
    const duplicated = inspectScoutRosterObservation({
      selfPuuid: SELF, bindings, gameflowSession: null,
      champSelectSession: duplicatedAcrossTeams, matchStage: 'selecting',
    })
    expect(duplicated.globalAmbiguous).toBe(true)
    expect(duplicated.allies.status).toBe('rejected')
    expect(duplicated.opponents.status).toBe('rejected')

    const selfReplaced = structuredClone(initialSession)
    selfReplaced.myTeam[0]!.puuid = 'replacement_player_000000000000'
    const replaced = inspectScoutRosterObservation({
      selfPuuid: SELF, bindings, gameflowSession: null,
      champSelectSession: selfReplaced, matchStage: 'selecting',
    })
    expect(replaced.globalAmbiguous).toBe(true)
    expect(replaced.allies.status).toBe('rejected')
    expect(replaced.opponents.status).toBe('rejected')
  })

  it('uses gameflow only after the match is active and keeps identity across slot changes', () => {
    const champSelectSession = {
      myTeam: selectingOwnTeam(),
      theirTeam: [ENEMY_ONE, ENEMY_TWO, ENEMY_THREE, ENEMY_FOUR, ENEMY_FIVE]
        .map((puuid, index) => ({
          puuid, nameVisibilityType: 'VISIBLE', championId: 60 + index,
        })),
    }
    const initial = inspectVisibleTeamIdentities({
      currentSummoner: { puuid: SELF }, gameflowSession: null,
      champSelectSession, matchStage: 'selecting',
    })
    const activeAllies = structuredClone(champSelectSession.myTeam)
    ;[activeAllies[1], activeAllies[3]] = [activeAllies[3]!, activeAllies[1]!]
    for (const player of activeAllies) delete (player as any).nameVisibilityType
    activeAllies[3]!.championId = 115
    const activeOpponents = structuredClone(champSelectSession.theirTeam)
    for (const player of activeOpponents) delete (player as any).nameVisibilityType
    const observation = inspectScoutRosterObservation({
      selfPuuid: SELF,
      bindings: [...initial.allies, ...initial.opponents],
      gameflowSession: { gameData: { teamOne: activeAllies, teamTwo: activeOpponents } },
      champSelectSession: { myTeam: [], theirTeam: [] },
      matchStage: 'active',
    })

    expect(observation.allies.status).toBe('ready')
    expect(observation.allies.identities).toContainEqual(expect.objectContaining({
      puuid: ALLY_ONE, slot: 3, championId: 115,
    }))
    expect(observation.opponents.identities).toHaveLength(5)
  })

  it('separates four allies and five opponents with generation-local slots', () => {
    const decision = inspectVisibleTeamIdentities({
      currentSummoner: { puuid: SELF },
      gameflowSession: {
        gameData: {
          teamOne: activeOwnTeam(),
          teamTwo: [ENEMY_ONE, ENEMY_TWO, ENEMY_THREE, ENEMY_FOUR, ENEMY_FIVE]
            .map((puuid, index) => ({ puuid, championId: 60 + index })),
        },
      },
      champSelectSession: null,
      matchStage: 'active',
    })
    expect(decision.allies).toEqual(ALLIES.map((puuid, index) => ({
      puuid, championId: 30 + index, relation: 'ally', slot: index + 1,
    })))
    expect(decision.opponents).toHaveLength(5)
    expect(decision.opponents[0]).toMatchObject({ relation: 'opponent', slot: 1, championId: 60 })
  })

  it('keeps the visible group when the other group is hidden, but fails closed on cross-team duplicates', () => {
    const hiddenAllyTeam = activeOwnTeam().map((player, index) =>
      index === 2 ? { ...player, nameVisibilityType: 'HIDDEN' } : player)
    const opponents = [ENEMY_ONE, ENEMY_TWO, ENEMY_THREE, ENEMY_FOUR, ENEMY_FIVE]
      .map((puuid) => ({ puuid }))
    const partial = inspectVisibleTeamIdentities({
      currentSummoner: { puuid: SELF },
      gameflowSession: { gameData: { teamOne: hiddenAllyTeam, teamTwo: opponents } },
      champSelectSession: null,
      matchStage: 'active',
    })
    expect(partial.allies).toEqual([])
    expect(partial.opponents).toHaveLength(5)
    expect(partial.allyReason).toBe('opponent-visibility-rejected')

    const duplicated = structuredClone(opponents)
    duplicated[0] = { puuid: ALLY_ONE }
    const ambiguous = inspectVisibleTeamIdentities({
      currentSummoner: { puuid: SELF },
      gameflowSession: { gameData: { teamOne: activeOwnTeam(), teamTwo: duplicated } },
      champSelectSession: null,
      matchStage: 'active',
    })
    expect(ambiguous).toMatchObject({ allies: [], opponents: [], globalAmbiguous: true })
  })

  it('fails closed when either raw team contains more than five entries', () => {
    const opponents = [ENEMY_ONE, ENEMY_TWO, ENEMY_THREE, ENEMY_FOUR, ENEMY_FIVE]
      .map((puuid) => ({ puuid }))
    const inspect = (teamOne: Array<Record<string, unknown>>, teamTwo: Array<Record<string, unknown>>) =>
      inspectVisibleTeamIdentities({
        currentSummoner: { puuid: SELF },
        gameflowSession: { gameData: { teamOne, teamTwo } },
        champSelectSession: null,
        matchStage: 'active',
      })

    expect(inspect([...activeOwnTeam(), { puuid: `extra_${'k'.repeat(32)}` }], opponents))
      .toMatchObject({ allies: [], opponents: [], globalAmbiguous: true })
    expect(inspect(activeOwnTeam(), [...opponents, { puuid: `extra_${'l'.repeat(32)}` }]))
      .toMatchObject({ allies: [], opponents: [], globalAmbiguous: true })
  })

  it('extracts only the opposite explicit gameflow team and preserves slot champion ids', () => {
    expect(extractVisibleOpponentIdentities({
      currentSummoner: { puuid: SELF },
      gameflowSession: {
        gameData: {
          teamOne: activeOwnTeam(),
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

  it('accepts a complete active-game team when gameflow omits visibility markers', () => {
    expect(extractVisibleOpponentIdentities({
      currentSummoner: { puuid: SELF },
      gameflowSession: {
        gameData: {
          teamOne: activeOwnTeam(),
          teamTwo: [ENEMY_ONE, ENEMY_TWO, ENEMY_THREE, ENEMY_FOUR, ENEMY_FIVE]
            .map((puuid, index) => ({ puuid, championId: 20 + index })),
        },
      },
      champSelectSession: null,
      matchStage: 'active',
    })).toHaveLength(5)
  })

  it('accepts an explicit blank champ-select visibility marker but never a missing or hidden one', () => {
    const opponents = [ENEMY_ONE, ENEMY_TWO, ENEMY_THREE, ENEMY_FOUR, ENEMY_FIVE]
    const extract = (theirTeam: Array<Record<string, unknown>>) => extractVisibleOpponentIdentities({
      currentSummoner: { puuid: SELF },
      gameflowSession: null,
      champSelectSession: { myTeam: selectingOwnTeam(), theirTeam },
      matchStage: 'selecting',
    })
    expect(extract(opponents.map((puuid) => ({ puuid, nameVisibilityType: '' })))).toHaveLength(5)
    expect(extract(opponents.map((puuid) => ({ puuid })))).toEqual([])
    expect(extract(opponents.map((puuid, index) => ({
      puuid,
      nameVisibilityType: index === 2 ? 'HIDDEN' : 'VISIBLE',
    })))).toEqual([])
  })

  it.each(['HIDDEN', '', 'UNKNOWN'])(
    'rejects an active team when an opponent has the explicit %j visibility marker',
    (nameVisibilityType) => {
      const opponents = [ENEMY_ONE, ENEMY_TWO, ENEMY_THREE, ENEMY_FOUR, ENEMY_FIVE]
        .map((puuid, index) => ({
          puuid,
          championId: 20 + index,
          ...(index === 3 ? { nameVisibilityType } : {}),
        }))
      expect(extractVisibleOpponentIdentities({
        currentSummoner: { puuid: SELF },
        gameflowSession: { gameData: { teamOne: activeOwnTeam(), teamTwo: opponents } },
        champSelectSession: null,
        matchStage: 'active',
      })).toEqual([])
    },
  )

  it('fails closed for duplicate self placement and non-string visibility markers', () => {
    const activeTeam = [ENEMY_ONE, ENEMY_TWO, ENEMY_THREE, ENEMY_FOUR, ENEMY_FIVE]
      .map((puuid, index) => ({
        puuid,
        ...(index === 1 ? { nameVisibilityType: 42 } : {}),
      }))
    expect(inspectVisibleOpponentIdentities({
      currentSummoner: { puuid: SELF },
      gameflowSession: {
        gameData: {
          teamOne: activeOwnTeam([{ puuid: SELF }, { puuid: SELF }]),
          teamTwo: activeTeam,
        },
      },
      champSelectSession: null,
      matchStage: 'active',
    })).toMatchObject({ identities: [], reason: 'self-team-ambiguous', selfMatches: 2 })

    expect(inspectVisibleOpponentIdentities({
      currentSummoner: { puuid: SELF },
      gameflowSession: {
        gameData: { teamOne: activeOwnTeam(), teamTwo: activeTeam },
      },
      champSelectSession: null,
      matchStage: 'active',
    })).toMatchObject({ identities: [], reason: 'opponent-visibility-rejected' })

    expect(inspectVisibleOpponentIdentities({
      currentSummoner: { puuid: SELF },
      gameflowSession: null,
      champSelectSession: {
        myTeam: selectingOwnTeam(),
        theirTeam: [{ puuid: SELF }, ...activeTeam.slice(1).map((player) => ({
          ...player,
          nameVisibilityType: 'VISIBLE',
        }))],
      },
      matchStage: 'selecting',
    })).toMatchObject({ identities: [], reason: 'self-team-ambiguous', selfMatches: 2 })
  })

  it('treats an active five-player roster with a missing PUUID as incomplete and retryable', () => {
    const opponents: Array<Record<string, unknown>> = [
      { puuid: ENEMY_ONE },
      { puuid: ENEMY_TWO },
      { puuid: ENEMY_THREE },
      { puuid: ENEMY_FOUR },
      { puuid: ENEMY_FIVE },
    ]
    delete opponents[2]?.puuid
    expect(inspectVisibleOpponentIdentities({
      currentSummoner: { puuid: SELF },
      gameflowSession: {
        gameData: { teamOne: activeOwnTeam(), teamTwo: opponents },
      },
      champSelectSession: null,
      matchStage: 'active',
    })).toMatchObject({ identities: [], reason: 'opponent-team-incomplete' })
  })

  it('treats present but empty or partial stage rosters as incomplete rather than ambiguous', () => {
    expect(inspectVisibleOpponentIdentities({
      currentSummoner: { puuid: SELF },
      gameflowSession: { gameData: { teamOne: [], teamTwo: [] } },
      champSelectSession: null,
      matchStage: 'active',
    })).toMatchObject({ identities: [], reason: 'opponent-team-incomplete' })

    expect(inspectVisibleOpponentIdentities({
      currentSummoner: { puuid: SELF },
      gameflowSession: null,
      champSelectSession: {
        myTeam: [{ puuid: SELF }],
        theirTeam: [{ puuid: ENEMY_ONE, nameVisibilityType: 'VISIBLE' }],
      },
      matchStage: 'selecting',
    })).toMatchObject({ identities: [], reason: 'opponent-team-incomplete' })
  })

  it('prioritizes an explicit hidden marker over an incomplete active roster', () => {
    const inspect = (teamTwo: Array<Record<string, unknown>>) => inspectVisibleOpponentIdentities({
      currentSummoner: { puuid: SELF },
      gameflowSession: { gameData: { teamOne: activeOwnTeam(), teamTwo } },
      champSelectSession: null,
      matchStage: 'active',
    })
    expect(inspect([
      { puuid: null, nameVisibilityType: 'HIDDEN' },
      { puuid: ENEMY_TWO },
      { puuid: ENEMY_THREE },
      { puuid: ENEMY_FOUR },
      { puuid: ENEMY_FIVE },
    ])).toMatchObject({ identities: [], reason: 'opponent-visibility-rejected' })
    expect(inspect([
      { puuid: ENEMY_ONE },
      { puuid: null, nameVisibilityType: 'HIDDEN' },
    ])).toMatchObject({ identities: [], reason: 'opponent-visibility-rejected' })
  })

  it('uses visible champ-select identities but rejects hidden, malformed and spectator-like payloads', () => {
    expect(extractVisibleOpponentIdentities({
      currentSummoner: { puuid: SELF },
      gameflowSession: null,
      champSelectSession: {
        myTeam: selectingOwnTeam(),
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
        myTeam: selectingOwnTeam(),
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
        myTeam: selectingOwnTeam(),
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
          teamOne: activeOwnTeam(),
          teamTwo: [ENEMY_ONE, ENEMY_TWO, ENEMY_THREE, ENEMY_FOUR, ENEMY_FIVE]
            .map((puuid) => ({ puuid, nameVisibilityType: 'VISIBLE' })),
        },
      },
      champSelectSession: {
        myTeam: selectingOwnTeam(),
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
          teamOne: activeOwnTeam(),
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

  it('caps sanitized recent samples at twenty matches', () => {
    const payload = { games: { games: Array.from({ length: 25 }, (_, index) => ({
      ...game(index % 2 === 0, 4, 2, 7),
      gameCreation: index,
      gameId: `private-${index}`,
      participantIdentities: [{ participantId: 1, player: { puuid: ENEMY_ONE, displayName: 'private' } }],
      participants: [{
        participantId: 1,
        championId: 63,
        summonerName: 'private',
        stats: { win: index % 2 === 0, kills: 4, deaths: 2, assists: 7, accountId: 'private' },
      }],
    })) } }
    expect(extractRecentMatchSamples(payload, ENEMY_ONE)).toHaveLength(20)
    const details = extractRecentMatchDetails(payload, ENEMY_ONE)
    expect(details).toHaveLength(20)
    expect(details[0]).toEqual({
      championId: 63, win: true, kills: 4, deaths: 2, assists: 7, durationMinutes: 15,
    })
    expect(Object.keys(details[0] ?? {}).sort()).toEqual([
      'assists', 'championId', 'deaths', 'durationMinutes', 'kills', 'win',
    ])
    expect(JSON.stringify(details)).not.toContain('gameCreation')
    expect(JSON.stringify(details)).not.toContain('gameId')
    expect(JSON.stringify(details)).not.toContain('displayName')
    expect(JSON.stringify(details)).not.toContain('summonerName')
    expect(JSON.stringify(details)).not.toContain(ENEMY_ONE)
    expect(JSON.stringify(details)).not.toContain('participant')
  })

  it('does not invent a rating or tier for fewer than twelve valid games', () => {
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

  it('creates a tier only when twelve valid samples support the rating', () => {
    const summary = summarizeOpponentHistory({
      games: { games: Array.from({ length: 12 }, () => game(true, 8, 2, 10)) },
    }, 1, 63, ENEMY_ONE)
    expect(summary).toMatchObject({ status: 'ready', sampleSize: 12, tier: '上等马' })
    expect(summary.rating).toBeGreaterThanOrEqual(65)
  })

  it('aggregates team strength by usable sample weight and marks incomplete ratings', () => {
    const summary = summarizeOpponentTeam([
      {
        opaqueKey: 'opaque-a', relation: 'ally', slot: 1, championId: 103,
        status: 'ready', rating: 80, tier: '上等马', sampleSize: 20,
        wins: 14, losses: 6, winRate: .7, kda: 3.5, streak: 2,
      },
      {
        opaqueKey: 'opaque-b', relation: 'ally', slot: 2, championId: 81,
        status: 'ready', rating: 38, tier: '下等马', sampleSize: 12,
        wins: 4, losses: 8, winRate: 1 / 3, kda: 1.5, streak: -2,
      },
      {
        opaqueKey: null, relation: 'ally', slot: 3, championId: 63,
        status: 'ready', rating: null, tier: null, sampleSize: 5,
        wins: 2, losses: 3, winRate: .4, kda: 2, streak: 0,
      },
    ])
    expect(summary).toMatchObject({
      playerCount: 3,
      ratedCount: 2,
      sampleSize: 37,
      confidence: 'partial',
      winRate: 20 / 37,
      kda: (20 * 3.5 + 12 * 1.5 + 5 * 2) / 37,
      rating: Math.round((80 * 20 + 38 * 12) / 32),
    })
    expect(summary.tier).toBe('中等马')
    expect(Object.keys(summary).sort()).toEqual([
      'confidence', 'kda', 'playerCount', 'ratedCount', 'rating', 'sampleSize', 'tier', 'winRate',
    ])
  })

  it('does not invent a team score when every player lacks usable samples', () => {
    expect(summarizeOpponentTeam([
      {
        opaqueKey: null, relation: 'opponent', slot: 1, championId: null,
        status: 'unavailable', rating: null, tier: null, sampleSize: 0,
        wins: 0, losses: 0, winRate: null, kda: null, streak: 0,
      },
    ])).toEqual({
      playerCount: 1, ratedCount: 0, sampleSize: 0, rating: null, tier: null,
      winRate: null, kda: null, confidence: 'none',
    })
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

  it('joins a full history payload through one unique direct PUUID without using participant position', () => {
    const payload = {
      games: { games: [{
        gameDuration: 900,
        participants: [
          { puuid: SELF, participantId: 1, stats: { win: false, kills: 1, deaths: 8, assists: 2 } },
          { puuid: ENEMY_ONE, participantId: 2, stats: { win: true, kills: 9, deaths: 1, assists: 7 } },
        ],
      }] },
    }
    expect(extractRecentMatchSamples(payload, ENEMY_ONE)).toEqual([
      { win: true, kills: 9, deaths: 1, assists: 7 },
    ])
    expect(extractRecentMatchSamples(payload, ENEMY_TWO)).toEqual([])
  })

  it('accepts a target-scoped legacy history item only when it has one participant and no PUUID identities', () => {
    const scoped = {
      games: { games: [{
        gameDuration: 900,
        participantIdentities: [{ participantId: 1, player: { summonerName: 'redacted' } }],
        participants: [{
          participantId: 1,
          stats: { win: true, kills: 7, deaths: 2, assists: 11 },
        }],
      }] },
    }
    expect(extractRecentMatchSamples(scoped, ENEMY_ONE)).toEqual([
      { win: true, kills: 7, deaths: 2, assists: 11 },
    ])

    const ambiguous = structuredClone(scoped)
    ambiguous.games.games[0]?.participants.push({
      participantId: 2,
      stats: { win: false, kills: 1, deaths: 8, assists: 2 },
    })
    expect(extractRecentMatchSamples(ambiguous, ENEMY_ONE)).toEqual([])
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

  it('rejects duplicate target identity and participant mappings instead of picking the first one', () => {
    const baseStats = { win: true, kills: 9, deaths: 1, assists: 7 }
    const duplicateIdentity = {
      games: { games: [{
        gameDuration: 900,
        participantIdentities: [
          { participantId: 1, player: { puuid: ENEMY_ONE } },
          { participantId: 2, player: { puuid: ENEMY_ONE } },
        ],
        participants: [
          { participantId: 1, stats: baseStats },
          { participantId: 2, stats: baseStats },
        ],
      }] },
    }
    expect(extractRecentMatchSamples(duplicateIdentity, ENEMY_ONE)).toEqual([])

    const duplicateParticipant = {
      games: { games: [{
        gameDuration: 900,
        participantIdentities: [{ participantId: 1, player: { puuid: ENEMY_ONE } }],
        participants: [
          { participantId: 1, stats: baseStats },
          { participantId: 1, stats: baseStats },
        ],
      }] },
    }
    expect(extractRecentMatchSamples(duplicateParticipant, ENEMY_ONE)).toEqual([])

    const sharedParticipantMapping = {
      games: { games: [{
        gameDuration: 900,
        participantIdentities: [
          { participantId: 1, player: { puuid: ENEMY_ONE } },
          { participantId: 1, player: { puuid: ENEMY_TWO } },
        ],
        participants: [{ participantId: 1, stats: baseStats }],
      }] },
    }
    expect(extractRecentMatchSamples(sharedParticipantMapping, ENEMY_ONE)).toEqual([])

    const sharedWithMissingPuuid = {
      games: { games: [{
        gameDuration: 900,
        participantIdentities: [
          { participantId: 1, player: { puuid: ENEMY_ONE } },
          { participantId: 1, player: { summonerName: 'redacted' } },
        ],
        participants: [{ participantId: 1, stats: baseStats }],
      }] },
    }
    expect(extractRecentMatchSamples(sharedWithMissingPuuid, ENEMY_ONE)).toEqual([])
  })

  it('rejects the scoped single-participant fallback when an explicit PUUID field is malformed', () => {
    const payload = {
      games: { games: [{
        gameDuration: 900,
        participantIdentities: [{ participantId: 1, player: { puuid: 'not-a-valid-puuid' } }],
        participants: [{
          participantId: 1,
          stats: { win: true, kills: 9, deaths: 1, assists: 7 },
        }],
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
      `/lol-match-history/v1/products/lol/${ENEMY_ONE}/matches?begIndex=0&endIndex=19`,
    )).toBe(true)
    expect(isLcuReadOnlyEndpoint(
      `/lol-match-history/v1/products/lol/${ENEMY_ONE}/matches?begIndex=0&endIndex=200`,
    )).toBe(false)
    expect(isLcuReadOnlyEndpoint('/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=19')).toBe(false)
    expect(isLcuReadOnlyEndpoint(`/lol-match-history/v1/products/lol/${ENEMY_ONE}/matches?begIndex=0&endIndex=19&token=secret`)).toBe(false)
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
              teamOne: activeOwnTeam(),
              teamTwo: [
                { puuid: ENEMY_ONE, championId: 63 },
                { puuid: ENEMY_TWO, championId: 89 },
                { puuid: ENEMY_THREE, championId: 81 },
                { puuid: ENEMY_FOUR, championId: 22 },
                { puuid: ENEMY_FIVE, championId: 99 },
              ],
            },
          }
        }
        if (endpoint === '/lol-champ-select/v1/session') return null
        if (endpoint.includes(ENEMY_ONE)) {
          return { games: { games: Array.from({ length: 12 }, () => game(true, 5, 2, 8)) } }
        }
        if (endpoint.includes(ENEMY_TWO)) return { errorCode: 'NOT_FOUND', httpStatus: 404 }
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
    expect(result.allies).toHaveLength(4)
    expect(result.opponents).toHaveLength(5)
    expect(result.opponents[0]).toMatchObject({ championId: 63, status: 'ready', tier: '上等马' })
    expect(result.opponents[1]).toMatchObject({ championId: 89, status: 'unavailable' })
    expect(JSON.stringify(result)).not.toContain(SELF)
    expect(JSON.stringify(result)).not.toContain(ENEMY_ONE)
    expect(JSON.stringify(result)).not.toContain('secret-not-rendered')
    expect(requests.filter((endpoint) => endpoint.includes('/matches?'))).toHaveLength(9)
    expect(requests.some((endpoint) => endpoint.includes(SELF))).toBe(false)
    expect(requests).toContain('/lol-gameflow/v1/session')
    expect(requests).not.toContain('/lol-champ-select/v1/session')
    expect(requests.filter((endpoint) => endpoint.includes(ENEMY_TWO))).toHaveLength(1)
    const opaqueKey = result.opponents[0]?.opaqueKey
    expect(opaqueKey).toMatch(/^[A-Za-z0-9_-]{24}$/)
    const details = client.getScoutPlayerDetails(7, opaqueKey as string)
    expect(details).toMatchObject({ matchGeneration: 7, relation: 'opponent', slot: 1 })
    expect(details?.matches).toHaveLength(12)
    expect(JSON.stringify(details)).not.toContain(ENEMY_ONE)
    expect(JSON.stringify(details)).not.toContain('participantId')
    client.snapshot = { ...client.snapshot, matchGeneration: 8 }
    expect(client.getScoutPlayerDetails(7, opaqueKey as string)).toBeNull()
  })

  it('uses the same-generation Main-only summoner cache during a transient current-summoner failure', async () => {
    const requests: string[] = []
    const client = new LcuClient(() => '', {
      disableWebSocket: true,
      request: vi.fn(async (endpoint: string) => {
        requests.push(endpoint)
        if (endpoint === '/lol-summoner/v1/current-summoner') throw new Error('LCU HTTP 503')
        if (endpoint === '/lol-gameflow/v1/session') {
          return {
            gameData: {
              teamOne: activeOwnTeam(),
              teamTwo: [ENEMY_ONE, ENEMY_TWO, ENEMY_THREE, ENEMY_FOUR, ENEMY_FIVE]
                .map((puuid) => ({ puuid })),
            },
          }
        }
        if (endpoint.includes('/matches?')) {
          const target = endpoint.split('/products/lol/')[1]?.split('/matches?')[0]
          return {
            games: {
              games: Array.from({ length: 12 }, () => ({
                gameDuration: 900,
                participants: [{ puuid: target, stats: { win: true, kills: 8, deaths: 2, assists: 10 } }],
              })),
            },
          }
        }
        return null
      }),
    }) as any
    client.credentials = { port: 2999, token: 'secret', source: 'process' }
    client.state = { connected: true, source: 'process', lastError: null, lastConnectedAt: Date.now() }
    client.snapshot = {
      phase: 'InProgress', locale: 'zh_CN', queueId: 3270, modeActive: true,
      matchStage: 'active', matchGeneration: 21, currentChampionId: 103,
      benchChampionIds: [], benchEnabled: false, updatedAt: Date.now(),
    }
    client.currentSummonerPuuid = SELF

    const result = await client.scoutOpponents(21)
    expect(result.status).toBe('ready')
    expect(requests.filter((endpoint) => endpoint.includes('/matches?'))).toHaveLength(9)
    expect(JSON.stringify(result)).not.toContain(SELF)
  })

  it('keeps all nine history reads within a global concurrency of two', async () => {
    let inFlight = 0
    let maximumInFlight = 0
    const client = new LcuClient(() => '', {
      disableWebSocket: true,
      request: vi.fn(async (endpoint: string) => {
        if (endpoint === '/lol-summoner/v1/current-summoner') return { puuid: SELF }
        if (endpoint === '/lol-gameflow/v1/session') {
          return {
            gameData: {
              teamOne: activeOwnTeam(),
              teamTwo: [ENEMY_ONE, ENEMY_TWO, ENEMY_THREE, ENEMY_FOUR, ENEMY_FIVE]
                .map((puuid) => ({ puuid })),
            },
          }
        }
        if (endpoint.includes('/matches?')) {
          inFlight += 1
          maximumInFlight = Math.max(maximumInFlight, inFlight)
          await new Promise((resolve) => setTimeout(resolve, 2))
          inFlight -= 1
          return { games: { games: [game(true, 4, 2, 7)] } }
        }
        return null
      }),
    }) as any
    client.credentials = { port: 2999, token: 'secret', source: 'process' }
    client.state = { connected: true, source: 'process', lastError: null, lastConnectedAt: Date.now() }
    client.snapshot = {
      phase: 'InProgress', locale: 'zh_CN', queueId: 3270, modeActive: true,
      matchStage: 'active', matchGeneration: 11, currentChampionId: 103,
      benchChampionIds: [], benchEnabled: false, updatedAt: Date.now(),
    }

    await client.scoutOpponents(11)
    expect(maximumInFlight).toBe(2)
  })

  it('keeps replacement batches within the same global history concurrency limit', async () => {
    const firstController = new AbortController()
    const pending: Array<() => void> = []
    let started = 0
    let inFlight = 0
    let maximumInFlight = 0
    const historyPayload = { games: { games: [game(true, 4, 2, 7)] } }
    const client = new LcuClient(() => '', {
      disableWebSocket: true,
      request: vi.fn(async (endpoint: string) => {
        if (endpoint === '/lol-summoner/v1/current-summoner') return { puuid: SELF }
        if (endpoint === '/lol-gameflow/v1/session') {
          return {
            gameData: {
              teamOne: activeOwnTeam(),
              teamTwo: [ENEMY_ONE, ENEMY_TWO, ENEMY_THREE, ENEMY_FOUR, ENEMY_FIVE]
                .map((puuid) => ({ puuid })),
            },
          }
        }
        if (!endpoint.includes('/matches?')) return null
        started += 1
        inFlight += 1
        maximumInFlight = Math.max(maximumInFlight, inFlight)
        return new Promise((resolve) => pending.push(() => {
          inFlight -= 1
          resolve(historyPayload)
        }))
      }),
    }) as any
    client.credentials = { port: 2999, token: 'secret', source: 'process' }
    client.state = { connected: true, source: 'process', lastError: null, lastConnectedAt: Date.now() }
    client.snapshot = {
      phase: 'InProgress', locale: 'zh_CN', queueId: 3270, modeActive: true,
      matchStage: 'active', matchGeneration: 12, currentChampionId: 103,
      benchChampionIds: [], benchEnabled: false, updatedAt: Date.now(),
    }

    const first = client.scoutOpponents(12, firstController.signal)
    while (started < 2) await Promise.resolve()
    firstController.abort()
    await expect(first).rejects.toMatchObject({ name: 'AbortError' })

    const replacement = client.scoutOpponents(12)
    await Promise.resolve()
    await Promise.resolve()
    expect(started).toBe(2)
    expect(maximumInFlight).toBe(2)

    for (let round = 0; round < 8 && (started < 11 || inFlight > 0); round += 1) {
      const releases = pending.splice(0)
      releases.forEach((release) => release())
      await new Promise<void>((resolve) => setImmediate(resolve))
    }
    await replacement
    expect(started).toBe(11)
    expect(maximumInFlight).toBe(2)
  })

  it('retries a transient history request once but does not expose the requested identity', async () => {
    vi.useFakeTimers()
    try {
      const attempts = new Map<string, number>()
      const client = new LcuClient(() => '', {
        disableWebSocket: true,
        request: vi.fn(async (endpoint: string) => {
          if (endpoint === '/lol-summoner/v1/current-summoner') return { puuid: SELF }
          if (endpoint === '/lol-gameflow/v1/session') {
            return {
              gameData: {
                teamOne: activeOwnTeam(),
                teamTwo: [ENEMY_ONE, ENEMY_TWO, ENEMY_THREE, ENEMY_FOUR, ENEMY_FIVE]
                  .map((puuid) => ({ puuid })),
              },
            }
          }
          if (endpoint.includes('/matches?')) {
            const count = (attempts.get(endpoint) ?? 0) + 1
            attempts.set(endpoint, count)
            if (endpoint.includes(ENEMY_ONE) && count === 1) {
              return { errorCode: 'RPC_ERROR', httpStatus: 500 }
            }
            return { games: { games: [game(true, 4, 2, 7)] } }
          }
          return null
        }),
      }) as any
      client.credentials = { port: 2999, token: 'secret', source: 'process' }
      client.state = { connected: true, source: 'process', lastError: null, lastConnectedAt: Date.now() }
      client.snapshot = {
        phase: 'InProgress', locale: 'zh_CN', queueId: 3270, modeActive: true,
        matchStage: 'active', matchGeneration: 8, currentChampionId: 103,
        benchChampionIds: [], benchEnabled: false, updatedAt: Date.now(),
      }

      const operation = client.scoutOpponents(8)
      await vi.advanceTimersByTimeAsync(250)
      const result = await operation

      const retriedEndpoint = [...attempts.keys()].find((endpoint) => endpoint.includes(ENEMY_ONE))
      expect(retriedEndpoint).toBeTruthy()
      expect(attempts.get(retriedEndpoint as string)).toBe(2)
      expect([...attempts.entries()].filter(([endpoint]) => !endpoint.includes(ENEMY_ONE)))
        .toEqual(expect.arrayContaining([
          [expect.stringContaining(ENEMY_TWO), 1],
          [expect.stringContaining(ENEMY_THREE), 1],
          [expect.stringContaining(ENEMY_FOUR), 1],
          [expect.stringContaining(ENEMY_FIVE), 1],
        ]))
      expect(result).toMatchObject({ status: 'ready', reason: 'ready', source: 'local-lcu' })
      expect(JSON.stringify(result)).not.toContain(ENEMY_ONE)
    } finally {
      vi.useRealTimers()
    }
  })

  it('never queries a hidden opponent group while allowing an independently visible ally group', async () => {
    const requests: string[] = []
    const client = new LcuClient(() => '', {
      disableWebSocket: true,
      request: vi.fn(async (endpoint: string) => {
        requests.push(endpoint)
        if (endpoint === '/lol-summoner/v1/current-summoner') return { puuid: SELF }
        if (endpoint === '/lol-champ-select/v1/session') {
          return {
            myTeam: selectingOwnTeam(),
            theirTeam: [
                { puuid: ENEMY_ONE, nameVisibilityType: 'VISIBLE' },
                { puuid: ENEMY_TWO, nameVisibilityType: 'HIDDEN' },
                { puuid: ENEMY_THREE, nameVisibilityType: 'VISIBLE' },
                { puuid: ENEMY_FOUR, nameVisibilityType: 'VISIBLE' },
                { puuid: ENEMY_FIVE, nameVisibilityType: 'VISIBLE' },
            ],
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
    expect(result).toMatchObject({
      status: 'unavailable', reason: 'history-unavailable', opponents: [],
    })
    expect(result.allies).toHaveLength(4)
    expect(requests.filter((endpoint) => endpoint.includes('/matches?'))).toHaveLength(4)
    expect(requests.some((endpoint) => endpoint.includes(ENEMY_TWO))).toBe(false)
    expect(requests).toContain('/lol-champ-select/v1/session')
    expect(requests).not.toContain('/lol-gameflow/v1/session')
  })

  it('updates a same-generation ally portrait without repeating history reads', async () => {
    const requests: string[] = []
    const initialSession = {
      myTeam: selectingOwnTeam(),
      theirTeam: [ENEMY_ONE, ENEMY_TWO, ENEMY_THREE, ENEMY_FOUR, ENEMY_FIVE]
        .map((puuid, index) => ({
          puuid,
          nameVisibilityType: 'VISIBLE',
          championId: 60 + index,
        })),
    }
    const client = new LcuClient(() => '', {
      disableWebSocket: true,
      request: vi.fn(async (endpoint: string) => {
        requests.push(endpoint)
        if (endpoint === '/lol-summoner/v1/current-summoner') return { puuid: SELF }
        if (endpoint === '/lol-champ-select/v1/session') return initialSession
        if (endpoint.includes('/matches?')) {
          return { games: { games: Array.from({ length: 12 }, () => game(true, 5, 2, 8)) } }
        }
        return null
      }),
    }) as any
    client.credentials = { port: 2999, token: 'secret', source: 'process' }
    client.state = { connected: true, source: 'process', lastError: null, lastConnectedAt: Date.now() }
    client.snapshot = {
      phase: 'ChampSelect', locale: 'zh_CN', queueId: 3270, modeActive: true,
      matchStage: 'selecting', matchGeneration: 18, currentChampionId: 103,
      benchChampionIds: [], benchEnabled: false, updatedAt: Date.now(),
    }

    const result = await client.scoutOpponents(18)
    const historyRequests = requests.filter((endpoint) => endpoint.includes('/matches?')).length
    const allyKey = result.allies[0]?.opaqueKey
    const initialRating = result.allies[0]?.rating
    expect(result.allies[0]).toMatchObject({ championId: 30, status: 'ready', slot: 1 })

    const switchedSession = structuredClone(initialSession)
    switchedSession.myTeam[1]!.championId = 115
    client.observeOpponentScoutRoster(null, switchedSession, 'selecting')

    const firstPresentation = client.getOpponentScoutPresentation(18)
    expect(firstPresentation.allies)
      .toContainEqual(expect.objectContaining({ relation: 'ally', slot: 1, championId: 115 }))
    expect(JSON.stringify(firstPresentation)).not.toContain(ALLY_ONE)
    expect(JSON.stringify(firstPresentation)).not.toContain(ENEMY_ONE)
    expect(JSON.stringify(vi.mocked(logger.info).mock.calls)).not.toContain(ALLY_ONE)
    expect(JSON.stringify(vi.mocked(logger.debug).mock.calls)).not.toContain(ALLY_ONE)
    expect(client.getScoutPlayerDetails(18, allyKey)).toMatchObject({ championId: 115 })
    expect(requests.filter((endpoint) => endpoint.includes('/matches?'))).toHaveLength(historyRequests)

    const reorderedSession = structuredClone(switchedSession)
    ;[reorderedSession.myTeam[1], reorderedSession.myTeam[2]] = [
      reorderedSession.myTeam[2]!, reorderedSession.myTeam[1]!,
    ]
    client.observeOpponentScoutRoster(null, reorderedSession, 'selecting')
    const reorderedAlly = client.getOpponentScoutPresentation(18).allies
      .find((entry: any) => entry.opaqueKey === allyKey)
    expect(reorderedAlly).toMatchObject({ championId: 115, slot: 2, rating: initialRating })
    expect(client.getScoutPlayerDetails(18, allyKey)).toMatchObject({
      relation: 'ally', slot: 2, championId: 115,
    })
    expect(requests.filter((endpoint) => endpoint.includes('/matches?'))).toHaveLength(historyRequests)

    reorderedSession.myTeam[2]!.nameVisibilityType = 'HIDDEN'
    client.observeOpponentScoutRoster(null, reorderedSession, 'selecting')
    expect(client.getOpponentScoutPresentation(18).allies).toEqual([])
    expect(client.getOpponentScoutPresentation(18).opponents.every(
      (entry: any) => entry.championId != null,
    )).toBe(true)
    expect(client.getScoutPlayerDetails(18, allyKey)).toMatchObject({ championId: null })

    const activeOwnTeam = structuredClone(initialSession.myTeam)
    ;[activeOwnTeam[1], activeOwnTeam[2]] = [activeOwnTeam[2]!, activeOwnTeam[1]!]
    for (const player of activeOwnTeam) delete (player as any).nameVisibilityType
    activeOwnTeam[2]!.championId = 115
    const activeOpponentTeam = structuredClone(initialSession.theirTeam)
    for (const player of activeOpponentTeam) delete (player as any).nameVisibilityType
    client.snapshot = { ...client.snapshot, phase: 'InProgress', matchStage: 'active' }
    client.observeOpponentScoutRoster({
      gameData: { teamOne: activeOwnTeam, teamTwo: activeOpponentTeam },
    }, null, 'active')
    expect(client.getOpponentScoutPresentation(18).allies
      .find((entry: any) => entry.opaqueKey === allyKey))
      .toMatchObject({ championId: 115, slot: 2 })

    client.snapshot = { ...client.snapshot, matchGeneration: 19 }
    expect(client.getOpponentScoutPresentation(18)).toBeNull()
  })

  it('publishes the latest roster when a champion changes during history reads', async () => {
    const requests: string[] = []
    let releaseHistory!: () => void
    const historyGate = new Promise<void>((resolve) => { releaseHistory = resolve })
    const initialSession = {
      myTeam: selectingOwnTeam(),
      theirTeam: [ENEMY_ONE, ENEMY_TWO, ENEMY_THREE, ENEMY_FOUR, ENEMY_FIVE]
        .map((puuid, index) => ({
          puuid, nameVisibilityType: 'VISIBLE', championId: 60 + index,
        })),
    }
    const client = new LcuClient(() => '', {
      disableWebSocket: true,
      request: vi.fn(async (endpoint: string) => {
        requests.push(endpoint)
        if (endpoint === '/lol-summoner/v1/current-summoner') return { puuid: SELF }
        if (endpoint === '/lol-champ-select/v1/session') return initialSession
        if (endpoint.includes('/matches?')) {
          await historyGate
          return { games: { games: Array.from({ length: 12 }, () => game(true, 5, 2, 8)) } }
        }
        return null
      }),
    }) as any
    client.credentials = { port: 2999, token: 'secret', source: 'process' }
    client.state = { connected: true, source: 'process', lastError: null, lastConnectedAt: Date.now() }
    client.snapshot = {
      phase: 'ChampSelect', locale: 'zh_CN', queueId: 3270, modeActive: true,
      matchStage: 'selecting', matchGeneration: 20, currentChampionId: 103,
      benchChampionIds: [], benchEnabled: false, updatedAt: Date.now(),
    }

    const pending = client.scoutOpponents(20)
    await vi.waitFor(() => {
      expect(requests.filter((endpoint) => endpoint.includes('/matches?'))).toHaveLength(2)
    })
    const switched = structuredClone(initialSession)
    switched.myTeam[1]!.championId = 115
    client.observeOpponentScoutRoster(null, switched, 'selecting')
    releaseHistory()

    const result = await pending
    expect(result.allies[0]).toMatchObject({ championId: 115, slot: 1 })
    expect(client.getOpponentScoutPresentation(20).allies[0])
      .toMatchObject({ championId: 115, slot: 1 })
    expect(requests.filter((endpoint) => endpoint.includes('/matches?'))).toHaveLength(9)
  })

  it('does not let an aborted scan clear a replacement scan latest roster', async () => {
    const requests: string[] = []
    let releaseTransports!: () => void
    const transportGate = new Promise<void>((resolve) => { releaseTransports = resolve })
    const initialSession = {
      myTeam: selectingOwnTeam(),
      theirTeam: [ENEMY_ONE, ENEMY_TWO, ENEMY_THREE, ENEMY_FOUR, ENEMY_FIVE]
        .map((puuid, index) => ({
          puuid, nameVisibilityType: 'VISIBLE', championId: 60 + index,
        })),
    }
    const client = new LcuClient(() => '', {
      disableWebSocket: true,
      request: vi.fn(async (endpoint: string) => {
        requests.push(endpoint)
        if (endpoint === '/lol-summoner/v1/current-summoner') return { puuid: SELF }
        if (endpoint === '/lol-champ-select/v1/session') return initialSession
        if (endpoint.includes('/matches?')) {
          await transportGate
          return { games: { games: Array.from({ length: 12 }, () => game(true, 5, 2, 8)) } }
        }
        return null
      }),
    }) as any
    client.credentials = { port: 2999, token: 'secret', source: 'process' }
    client.state = { connected: true, source: 'process', lastError: null, lastConnectedAt: Date.now() }
    client.snapshot = {
      phase: 'ChampSelect', locale: 'zh_CN', queueId: 3270, modeActive: true,
      matchStage: 'selecting', matchGeneration: 22, currentChampionId: 103,
      benchChampionIds: [], benchEnabled: false, updatedAt: Date.now(),
    }

    const firstAbort = new AbortController()
    const first = client.scoutOpponents(22, firstAbort.signal)
    const firstOutcome = first.then(
      () => null,
      (error: unknown) => error,
    )
    await vi.waitFor(() => {
      expect(requests.filter((endpoint) => endpoint.includes('/matches?'))).toHaveLength(2)
    })
    firstAbort.abort()
    const replacement = client.scoutOpponents(22)
    await vi.waitFor(() => {
      expect(requests.filter((endpoint) => endpoint === '/lol-summoner/v1/current-summoner'))
        .toHaveLength(2)
      expect(client.opponentScoutLatestRoster).not.toBeNull()
    })
    const switched = structuredClone(initialSession)
    switched.myTeam[1]!.championId = 115
    client.observeOpponentScoutRoster(null, switched, 'selecting')
    expect(await firstOutcome).toMatchObject({ name: 'AbortError' })
    expect(client.opponentScoutLatestRoster?.champSelectSession?.myTeam?.[1]?.championId)
      .toBe(115)

    releaseTransports()
    const result = await replacement
    expect(result.allies[0]).toMatchObject({ championId: 115 })
    expect(requests.filter((endpoint) => endpoint.includes('/matches?'))).toHaveLength(11)
  })

  it('refreshes a visible ally-only partial result without querying hidden opponents', async () => {
    const requests: string[] = []
    const session = {
      myTeam: selectingOwnTeam(),
      theirTeam: [ENEMY_ONE, ENEMY_TWO, ENEMY_THREE, ENEMY_FOUR, ENEMY_FIVE]
        .map((puuid, index) => ({
          puuid, nameVisibilityType: 'HIDDEN', championId: 60 + index,
        })),
    }
    const client = new LcuClient(() => '', {
      disableWebSocket: true,
      request: vi.fn(async (endpoint: string) => {
        requests.push(endpoint)
        if (endpoint === '/lol-summoner/v1/current-summoner') return { puuid: SELF }
        if (endpoint === '/lol-champ-select/v1/session') return session
        if (endpoint.includes('/matches?')) {
          return { games: { games: Array.from({ length: 12 }, () => game(true, 5, 2, 8)) } }
        }
        return null
      }),
    }) as any
    client.credentials = { port: 2999, token: 'secret', source: 'process' }
    client.state = { connected: true, source: 'process', lastError: null, lastConnectedAt: Date.now() }
    client.snapshot = {
      phase: 'ChampSelect', locale: 'zh_CN', queueId: 3270, modeActive: true,
      matchStage: 'selecting', matchGeneration: 21, currentChampionId: 103,
      benchChampionIds: [], benchEnabled: false, updatedAt: Date.now(),
    }

    const result = await client.scoutOpponents(21)
    const historyCount = requests.filter((endpoint) => endpoint.includes('/matches?')).length
    expect(result).toMatchObject({ status: 'partial' })
    expect(result.allies).toHaveLength(4)
    expect(result.opponents).toEqual([])
    expect(historyCount).toBe(4)

    const changed = structuredClone(session)
    changed.myTeam[1]!.championId = 115
    client.observeOpponentScoutRoster(null, changed, 'selecting')
    expect(client.getOpponentScoutPresentation(21).allies[0])
      .toMatchObject({ championId: 115 })
    expect(client.getOpponentScoutPresentation(21).opponents).toEqual([])
    expect(requests.filter((endpoint) => endpoint.includes('/matches?'))).toHaveLength(historyCount)
  })

  it('never queries history when either raw active team exceeds five entries', async () => {
    const opponents = [ENEMY_ONE, ENEMY_TWO, ENEMY_THREE, ENEMY_FOUR, ENEMY_FIVE]
      .map((puuid) => ({ puuid }))
    for (const [teamOne, teamTwo] of [
      [[...activeOwnTeam(), { puuid: `extra_${'k'.repeat(32)}` }], opponents],
      [activeOwnTeam(), [...opponents, { puuid: `extra_${'l'.repeat(32)}` }]],
    ] as const) {
      const requests: string[] = []
      const client = new LcuClient(() => '', {
        disableWebSocket: true,
        request: vi.fn(async (endpoint: string) => {
          requests.push(endpoint)
          if (endpoint === '/lol-summoner/v1/current-summoner') return { puuid: SELF }
          if (endpoint === '/lol-gameflow/v1/session') return { gameData: { teamOne, teamTwo } }
          return null
        }),
      }) as any
      client.credentials = { port: 2999, token: 'secret', source: 'process' }
      client.state = { connected: true, source: 'process', lastError: null, lastConnectedAt: Date.now() }
      client.snapshot = {
        phase: 'InProgress', locale: 'zh_CN', queueId: 3270, modeActive: true,
        matchStage: 'active', matchGeneration: 14, currentChampionId: 103,
        benchChampionIds: [], benchEnabled: false, updatedAt: Date.now(),
      }

      const result = await client.scoutOpponents(14)
      expect(result).toMatchObject({ status: 'unavailable', reason: 'identity-ambiguous' })
      expect(requests.some((endpoint) => endpoint.includes('/matches?'))).toBe(false)
    }
  })

  it('classifies a fulfilled-null active identity payload as a retryable source miss', async () => {
    const requests: string[] = []
    const client = new LcuClient(() => '', {
      disableWebSocket: true,
      request: vi.fn(async (endpoint: string) => {
        requests.push(endpoint)
        if (endpoint === '/lol-summoner/v1/current-summoner') return { puuid: SELF }
        if (endpoint === '/lol-gameflow/v1/session') return null
        return null
      }),
    }) as any
    client.credentials = { port: 2999, token: 'secret', source: 'process' }
    client.state = { connected: true, source: 'process', lastError: null, lastConnectedAt: Date.now() }
    client.snapshot = {
      phase: 'InProgress', locale: 'zh_CN', queueId: 3270, modeActive: true,
      matchStage: 'active', matchGeneration: 10, currentChampionId: 103,
      benchChampionIds: [], benchEnabled: false, updatedAt: Date.now(),
    }

    const result = await client.scoutOpponents(10)
    expect(result).toMatchObject({
      status: 'unavailable', reason: 'identity-source-unavailable', opponents: [],
    })
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
              teamOne: activeOwnTeam(),
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
