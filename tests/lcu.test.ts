import { describe, expect, it } from 'vitest'
import { lcuReadOnlyEndpoints } from '../src/main/lcu/client.js'
import { lcuDiscoveryInternals } from '../src/main/lcu/discovery.js'
import {
  carryForwardMatchContext,
  normalizeChampSelectSnapshot,
} from '../src/main/lcu/normalize.js'

describe('LCU credential discovery parsers', () => {
  it('parses process arguments', () => {
    expect(lcuDiscoveryInternals.parseCommandLine('--app-port=4242 --remoting-auth-token=secret')).toMatchObject({ port: 4242, token: 'secret', source: 'process' })
  })
  it('parses lockfile and the latest log credential', () => {
    expect(lcuDiscoveryInternals.parseLockfile('LeagueClient:1:2999:token:https', 'manual')).toMatchObject({ port: 2999, token: 'token', source: 'manual' })
    expect(lcuDiscoveryInternals.parseLog('https://riot:old@127.0.0.1:1\nhttps://riot:new@127.0.0.1:2')).toMatchObject({ port: 2, token: 'new' })
  })
})

describe('LCU snapshot normalization', () => {
  it('supports benchChampions objects and local pick intent', () => {
    const result = normalizeChampSelectSnapshot({
      phase: 'ChampSelect',
      gameflowSession: { gameData: { queue: { id: 2400 } } },
      currentChampionId: 0,
      champSelectSession: {
        localPlayerCellId: 4,
        myTeam: [{ cellId: 4, championId: 0, championPickIntent: 103 }],
        benchChampions: [{ championId: 81 }, { championId: 81 }, { championId: 63 }],
      },
    })
    expect(result).toMatchObject({ modeActive: true, currentChampionId: 103, benchChampionIds: [81, 63], benchEnabled: true })
  })
  it('does not activate for another queue', () => {
    const result = normalizeChampSelectSnapshot({ phase: 'ChampSelect', gameflowSession: { queueId: 450 }, champSelectSession: {}, currentChampionId: null })
    expect(result.modeActive).toBe(false)
  })
  it('carries the selected champion and queue through GameStart and InProgress', () => {
    const champSelect = normalizeChampSelectSnapshot({
      phase: 'ChampSelect',
      gameflowSession: { queueId: 2400 },
      champSelectSession: {},
      currentChampionId: 103,
    })
    const gameStart = carryForwardMatchContext(
      champSelect,
      normalizeChampSelectSnapshot({
        phase: 'GameStart',
        gameflowSession: null,
        champSelectSession: null,
        currentChampionId: null,
      }),
    )
    const inProgress = carryForwardMatchContext(
      gameStart,
      normalizeChampSelectSnapshot({
        phase: 'InProgress',
        gameflowSession: null,
        champSelectSession: null,
        currentChampionId: null,
      }),
    )

    expect(gameStart).toMatchObject({ currentChampionId: 103, queueId: 2400, modeActive: true })
    expect(inProgress).toMatchObject({ currentChampionId: 103, queueId: 2400, modeActive: true })
  })
  it('clears carried match context after the game ends', () => {
    const previous = normalizeChampSelectSnapshot({
      phase: 'InProgress',
      gameflowSession: { queueId: 2400 },
      champSelectSession: null,
      currentChampionId: 103,
    })
    const ended = carryForwardMatchContext(
      previous,
      normalizeChampSelectSnapshot({
        phase: 'EndOfGame',
        gameflowSession: null,
        champSelectSession: null,
        currentChampionId: null,
      }),
    )
    expect(ended).toMatchObject({ currentChampionId: null, queueId: null, modeActive: false })
  })
})

it('contains only the explicit read-only LCU allowlist', () => {
  expect([...lcuReadOnlyEndpoints]).toEqual(expect.arrayContaining([
    '/lol-gameflow/v1/gameflow-phase', '/lol-gameflow/v1/session', '/lol-champ-select/v1/session', '/lol-champ-select/v1/current-champion', '/riotclient/region-locale',
  ]))
  expect([...lcuReadOnlyEndpoints].every((endpoint) => !endpoint.includes('patch') && !endpoint.includes('put'))).toBe(true)
})
