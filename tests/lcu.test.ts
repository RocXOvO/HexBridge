import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  applyLcuPollResults,
  lcuReadOnlyEndpoints,
  selectReachableLcuCredentials,
} from '../src/main/lcu/client.js'
import {
  collectDirectoryCredentials,
  lcuDiscoveryInternals,
  queryLeagueClientProcessesWithRunner,
} from '../src/main/lcu/discovery.js'
import {
  carryForwardMatchContext,
  MatchContextTracker,
  MATCH_CONTEXT_MAX_STALE_MS,
  MATCH_CONTEXT_NONE_GRACE_MS,
  normalizeChampSelectSnapshot,
} from '../src/main/lcu/normalize.js'

describe('LCU credential discovery parsers', () => {
  it('parses process arguments', () => {
    expect(lcuDiscoveryInternals.parseCommandLine('--app-port=4242 --remoting-auth-token=secret')).toMatchObject({ port: 4242, token: 'secret', source: 'process' })
  })
  it('parses quoted and whole-argument quoted process arguments and rejects invalid ports', () => {
    expect(lcuDiscoveryInternals.parseCommandLine('"LeagueClientUx.exe" --app-port="4242" --remoting-auth-token="quoted-token"')).toMatchObject({ port: 4242, token: 'quoted-token' })
    expect(lcuDiscoveryInternals.parseCommandLine('"--app-port=4250" "--remoting-auth-token=whole-token"')).toMatchObject({ port: 4250, token: 'whole-token' })
    expect(lcuDiscoveryInternals.parseCommandLine('--app-port=70000 --remoting-auth-token=bad')).toBeNull()
  })
  it('parses lockfile and the latest log credential', () => {
    expect(lcuDiscoveryInternals.parseLockfile('LeagueClient:1:2999:token:https', 'manual')).toMatchObject({ port: 2999, token: 'token', source: 'manual' })
    expect(lcuDiscoveryInternals.parseLog('https://riot:old@127.0.0.1:1\nhttps://riot:new@127.0.0.1:2')).toMatchObject({ port: 2, token: 'new' })
  })
  it('parses command-line credentials from recent LeagueClientUx log lines', () => {
    expect(lcuDiscoveryInternals.parseLog('old\nCommand line arguments: --remoting-auth-token=log-token --app-port=58124')).toMatchObject({ port: 58124, token: 'log-token', source: 'log' })
  })
  it('falls back to Get-Process records when CIM is unavailable', async () => {
    const result = await queryLeagueClientProcessesWithRunner(async (method, script) => {
      if (method === 'cim') throw new Error('timeout')
      expect(script).toContain('[Console]::OutputEncoding = $utf8')
      expect(script).toContain("$ErrorActionPreference='SilentlyContinue'; @(")
      return '\uFEFF{"Name":"LeagueClientUx.exe","ProcessId":42,"ExecutablePath":"D:\\\\League\\\\LeagueClientUx.exe","CommandLine":null}'
    })
    expect(result.records).toHaveLength(1)
    expect(result.records[0]?.ExecutablePath).toContain('LeagueClientUx.exe')
    expect(result.summary).toContain('CIM 不可用')
    expect(result.strategies).toEqual({ cim: 'unavailable', 'get-process': 'ok' })
  })
  it('checks every known directory even when an older credential already exists', async () => {
    const visited: string[] = []
    const found = await collectDirectoryCredentials(
      ['/first-empty', '/later-wegame'],
      'lockfile',
      async (directory) => {
        visited.push(directory)
        return directory.endsWith('later-wegame')
          ? [{ port: 58128, token: 'current', source: 'lockfile', executablePath: directory }]
          : []
      },
    )
    expect(visited).toEqual(['/first-empty', '/later-wegame'])
    expect(found).toEqual([expect.objectContaining({ port: 58128, token: 'current' })])
  })
  it('reads Riot install roots from BOM-prefixed product metadata', () => {
    const roots = lcuDiscoveryInternals.parseInstallMetadata(
      '\uFEFFproduct_install_full_path: "D:/Riot Games/League of Legends"\nproduct_install_root: E:/WeGameApps/英雄联盟',
    )
    expect(roots).toHaveLength(2)
    expect(roots.join('|')).toContain('League of Legends')
    expect(roots.join('|')).toContain('英雄联盟')
  })
  it('finds a parent lockfile and timestamped LeagueClientUx logs from a manual LeagueClient path', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'hexbridge-lcu-'))
    const child = path.join(root, 'LeagueClient')
    await mkdir(child)
    try {
      await writeFile(path.join(root, 'lockfile'), 'LeagueClient:1:58125:parent-token:https')
      await writeFile(path.join(child, '2026-08-12_1000_LeagueClientUx.log'), 'Command line arguments: --app-port=58126 --remoting-auth-token=log-token')
      const candidates = await lcuDiscoveryInternals.credentialsFromDirectory(child, 'manual')
      expect(candidates).toEqual(expect.arrayContaining([
        expect.objectContaining({ port: 58125, token: 'parent-token', source: 'manual' }),
        expect.objectContaining({ port: 58126, token: 'log-token', source: 'log' }),
      ]))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
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

  it('keeps a confirmed match through outgoing champ-select 404s and a transient None phase', () => {
    const tracker = new MatchContextTracker()
    const full = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect',
      gameflowSession: { queueId: 2400 },
      champSelectSession: { benchChampionIds: [81, 63] },
      currentChampionId: 103,
    }), 1_000)
    const outgoing404 = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect',
      gameflowSession: null,
      champSelectSession: null,
      currentChampionId: null,
    }), 2_000)
    const transientNone = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'None',
      gameflowSession: null,
      champSelectSession: null,
      currentChampionId: null,
    }), 3_000)
    const inProgress = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'InProgress',
      gameflowSession: null,
      champSelectSession: null,
      currentChampionId: null,
    }), 4_000)

    expect(full.benchChampionIds).toEqual([81, 63])
    expect(outgoing404).toMatchObject({ queueId: 2400, currentChampionId: 103, modeActive: true })
    expect(transientNone).toMatchObject({ queueId: 2400, currentChampionId: 103, modeActive: true })
    expect(inProgress).toMatchObject({ queueId: 2400, currentChampionId: 103, modeActive: true })
    expect(inProgress.benchChampionIds).toEqual([])
  })

  it('retains the selected champion when LeagueClientUx hands transport to the game client', () => {
    const tracker = new MatchContextTracker()
    const selected = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect',
      gameflowSession: { queueId: 2400 },
      champSelectSession: { benchChampionIds: [81, 63] },
      currentChampionId: 103,
    }), 1_000)
    const detached = tracker.transportDisconnected(selected, 2_000)
    const longLaunchGap = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'None', gameflowSession: null, champSelectSession: null, currentChampionId: null,
    }), 122_001)

    expect(detached).toMatchObject({
      queueId: 2400,
      currentChampionId: 103,
      matchStage: 'launching',
      matchGeneration: 1,
      benchChampionIds: [],
      benchEnabled: false,
    })
    expect(longLaunchGap).toMatchObject({
      queueId: 2400,
      currentChampionId: 103,
      matchStage: 'launching',
      matchGeneration: 1,
    })
  })

  it('uses the longer active-match lease after GameStart has been observed', () => {
    const tracker = new MatchContextTracker()
    tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400 }, champSelectSession: {}, currentChampionId: 103,
    }), 1_000)
    tracker.apply(normalizeChampSelectSnapshot({
      phase: 'GameStart', gameflowSession: null, champSelectSession: null, currentChampionId: null,
    }), 2_000)
    const retained = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'None', gameflowSession: null, champSelectSession: null, currentChampionId: null,
    }), 2_000 + MATCH_CONTEXT_NONE_GRACE_MS + 1)
    expect(retained).toMatchObject({
      currentChampionId: 103,
      matchStage: 'launching',
      matchGeneration: 1,
    })
  })

  it('upgrades a detached handoff to an active lease using independent game evidence', () => {
    const tracker = new MatchContextTracker()
    const selected = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400 }, champSelectSession: {}, currentChampionId: 103,
    }), 1_000)
    const detached = tracker.transportDisconnected(selected, 2_000)
    const active = tracker.confirmGameActive(detached, 1, 103, 5_000)
    const retainedPastLaunchLease = tracker.transportDisconnected(
      active,
      5_000 + MATCH_CONTEXT_NONE_GRACE_MS + 1,
    )

    expect(active).toMatchObject({ currentChampionId: 103, matchStage: 'active' })
    expect(retainedPastLaunchLease).toMatchObject({
      currentChampionId: 103,
      matchStage: 'active',
      matchGeneration: 1,
    })
  })

  it('rejects delayed game-process evidence from a previous match generation', () => {
    const tracker = new MatchContextTracker()
    const first = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400 }, champSelectSession: {}, currentChampionId: 103,
    }), 1_000)
    tracker.transportDisconnected(first, 2_000)
    tracker.apply(normalizeChampSelectSnapshot({
      phase: 'EndOfGame', gameflowSession: null, champSelectSession: null, currentChampionId: null,
    }), 3_000)
    const second = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400 }, champSelectSession: {}, currentChampionId: 81,
    }), 4_000)
    const unchanged = tracker.confirmGameActive(second, 1, 103, 4_500)

    expect(unchanged).toMatchObject({
      currentChampionId: 81,
      matchStage: 'selecting',
      matchGeneration: 2,
    })
  })

  it('does not let repeated unknown handoff phases renew a launch lease forever', () => {
    const tracker = new MatchContextTracker()
    tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400 }, champSelectSession: {}, currentChampionId: 103,
    }), 1_000)
    const firstUnknown = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'LaunchingGameClient', gameflowSession: null, champSelectSession: null, currentChampionId: null,
    }), 2_000)
    const expired = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'LaunchingGameClient', gameflowSession: null, champSelectSession: null, currentChampionId: null,
    }), 1_000 + MATCH_CONTEXT_NONE_GRACE_MS + 1)
    expect(firstUnknown).toMatchObject({ currentChampionId: 103, matchStage: 'launching' })
    expect(expired).toMatchObject({ currentChampionId: null, matchStage: 'none' })
  })

  it('commits an observed launch phase even when another LCU endpoint fails', async () => {
    const auxiliary = await Promise.allSettled([
      Promise.resolve(null),
      Promise.reject(new Error('LCU request timeout')),
      Promise.resolve(null),
      Promise.resolve({ locale: 'zh_CN' }),
    ])
    const tracker = new MatchContextTracker()
    const selected = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400 }, champSelectSession: {}, currentChampionId: 103,
    }), 1_000)
    const reduced = applyLcuPollResults(tracker, selected, 'GameStart', auxiliary, 2_000)

    expect(reduced.failure).toBeInstanceOf(Error)
    expect(reduced.snapshot).toMatchObject({
      currentChampionId: 103,
      queueId: 2400,
      matchStage: 'launching',
      matchGeneration: 1,
    })
  })

  it('expires a transient None context and never carries it into another queue', () => {
    const tracker = new MatchContextTracker()
    tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400 }, champSelectSession: {}, currentChampionId: 103,
    }), 1_000)
    const expired = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'None', gameflowSession: null, champSelectSession: null, currentChampionId: null,
    }), 1_000 + MATCH_CONTEXT_NONE_GRACE_MS + 1)
    const otherQueue = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'InProgress', gameflowSession: { queueId: 450 }, champSelectSession: null, currentChampionId: null,
    }), 50_000)
    expect(expired).toMatchObject({ queueId: null, currentChampionId: null, modeActive: false })
    expect(otherQueue).toMatchObject({ queueId: 450, currentChampionId: null, modeActive: false })
  })

  it('clears the previous match before a second game', () => {
    const tracker = new MatchContextTracker()
    tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400 }, champSelectSession: {}, currentChampionId: 103,
    }), 1_000)
    const ended = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'EndOfGame', gameflowSession: null, champSelectSession: null, currentChampionId: null,
    }), 2_000)
    const ready = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ReadyCheck', gameflowSession: { queueId: 2400 }, champSelectSession: null, currentChampionId: null,
    }), 3_000)
    const second = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400 }, champSelectSession: {}, currentChampionId: 81,
    }), 4_000)
    expect(ended.currentChampionId).toBeNull()
    expect(ready.currentChampionId).toBeNull()
    expect(second.currentChampionId).toBe(81)
  })

  it('starts a new generation when reconnecting directly from a game into another champ select', () => {
    const tracker = new MatchContextTracker()
    tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400 }, champSelectSession: {}, currentChampionId: 103,
    }), 1_000)
    tracker.apply(normalizeChampSelectSnapshot({
      phase: 'InProgress', gameflowSession: null, champSelectSession: null, currentChampionId: null,
    }), 2_000)
    const newSelectWithoutChampion = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400 }, champSelectSession: null, currentChampionId: null,
    }), 10_000)
    const newChampion = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400 }, champSelectSession: {}, currentChampionId: 81,
    }), 11_000)
    expect(newSelectWithoutChampion).toMatchObject({
      queueId: 2400,
      modeActive: true,
      currentChampionId: null,
    })
    expect(newChampion.currentChampionId).toBe(81)
  })

  it('does not reuse a detached launch context in a later same-queue champ select', () => {
    const tracker = new MatchContextTracker()
    const selected = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400 }, champSelectSession: {}, currentChampionId: 103,
    }), 1_000)
    tracker.transportDisconnected(selected, 2_000)
    const nextSelect = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400 }, champSelectSession: null, currentChampionId: null,
    }), 30_000)
    const nextChampion = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400 }, champSelectSession: {}, currentChampionId: 81,
    }), 31_000)

    expect(nextSelect).toMatchObject({ currentChampionId: null, matchStage: 'none' })
    expect(nextChampion).toMatchObject({
      currentChampionId: 81,
      matchStage: 'selecting',
      matchGeneration: 2,
    })
  })

  it('drops all retained payload after the maximum detached-context lifetime', () => {
    const tracker = new MatchContextTracker()
    const selected = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400 }, champSelectSession: {}, currentChampionId: 103,
    }), 1_000)
    const expired = tracker.transportDisconnected(selected, 1_000 + MATCH_CONTEXT_MAX_STALE_MS + 1)
    expect(expired).toMatchObject({
      queueId: null,
      modeActive: false,
      currentChampionId: null,
      matchStage: 'none',
      benchChampionIds: [],
    })
  })

  it.each([
    'WaitingForStats',
    'PreEndOfGame',
    'EndOfGame',
    'FailedToLaunch',
    'TerminatedInError',
  ])('clears retained context on %s', (phase) => {
    const tracker = new MatchContextTracker()
    tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400 }, champSelectSession: {}, currentChampionId: 103,
    }), 1_000)
    const terminal = tracker.apply(normalizeChampSelectSnapshot({
      phase, gameflowSession: null, champSelectSession: null, currentChampionId: null,
    }), 2_000)
    expect(terminal).toMatchObject({ currentChampionId: null, matchStage: 'none' })
  })
})

it('skips a stale LCU credential and keeps probing later candidates', async () => {
  const candidates = [
    { port: 58120, token: 'stale', source: 'lockfile' as const, executablePath: '' },
    { port: 58121, token: 'current', source: 'process' as const, executablePath: '' },
  ]
  const observed: number[] = []
  const result = await selectReachableLcuCredentials(candidates, async (candidate) => {
    observed.push(candidate.port)
    if (candidate.token === 'stale') throw new Error('LCU authorization expired')
  })
  expect(observed).toEqual([58120, 58121])
  expect(result.credentials?.token).toBe('current')
  expect(result.failures).toEqual(['凭据已过期'])
})

it('contains only the explicit read-only LCU allowlist', () => {
  expect([...lcuReadOnlyEndpoints]).toEqual(expect.arrayContaining([
    '/lol-gameflow/v1/gameflow-phase', '/lol-gameflow/v1/session', '/lol-champ-select/v1/session', '/lol-champ-select/v1/current-champion', '/riotclient/region-locale',
  ]))
  expect([...lcuReadOnlyEndpoints].every((endpoint) => !endpoint.includes('patch') && !endpoint.includes('put'))).toBe(true)
})
