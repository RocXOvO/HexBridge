import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  applyLcuPollResults,
  extractLcuMatchIdentity,
  hasConfirmedTargetContext,
  inferEffectiveGameflowPhase,
  isChampSelectSessionPayload,
  LcuAuthorityRegistry,
  lcuReadOnlyEndpoints,
  prepareLcuReductionResults,
  selectReachableLcuCredentials,
  shouldSwitchLcuCredential,
  summarizeLcuAuxiliaryResults,
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
  MATCH_CONTEXT_TERMINAL_CONFIRM_MS,
  normalizeChampSelectSnapshot,
} from '../src/main/lcu/normalize.js'

describe('LCU credential discovery parsers', () => {
  it('parses process arguments', () => {
    expect(lcuDiscoveryInternals.parseCommandLine(
      '--app-port=4242 --remoting-auth-token=secret',
      '',
      42,
      '2026-08-13T02:00:00.000Z',
    )).toMatchObject({
      port: 4242,
      token: 'secret',
      source: 'process',
      processId: 42,
      processStartedAt: '2026-08-13T02:00:00.000Z',
    })
  })
  it('parses quoted and whole-argument quoted process arguments and rejects invalid ports', () => {
    expect(lcuDiscoveryInternals.parseCommandLine('"LeagueClientUx.exe" --app-port="4242" --remoting-auth-token="quoted-token"')).toMatchObject({ port: 4242, token: 'quoted-token' })
    expect(lcuDiscoveryInternals.parseCommandLine('"--app-port=4250" "--remoting-auth-token=whole-token"')).toMatchObject({ port: 4250, token: 'whole-token' })
    expect(lcuDiscoveryInternals.parseCommandLine('--app-port=70000 --remoting-auth-token=bad')).toBeNull()
  })
  it('parses lockfile and the latest log credential', () => {
    expect(lcuDiscoveryInternals.parseLockfile('LeagueClient:1:2999:token:https', 'manual')).toMatchObject({ port: 2999, token: 'token', source: 'manual', processId: 1 })
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
  it('accepts only structural champ-select payloads as positive evidence', () => {
    expect(isChampSelectSessionPayload({ localPlayerCellId: 0, myTeam: [] })).toBe(true)
    expect(isChampSelectSessionPayload({ timer: { phase: 'FINALIZATION' } })).toBe(true)
    expect(isChampSelectSessionPayload({ errorCode: 'RPC_ERROR', localPlayerCellId: 0 })).toBe(false)
    expect(isChampSelectSessionPayload({})).toBe(false)
  })
  it('infers champ select only from None or an unknown regional phase', () => {
    expect(inferEffectiveGameflowPhase('None', true, 103)).toBe('ChampSelect')
    expect(inferEffectiveGameflowPhase('CN_CHAMPION_SELECT', false, 103)).toBe('ChampSelect')
    expect(inferEffectiveGameflowPhase('Lobby', true, 103)).toBe('Lobby')
    expect(inferEffectiveGameflowPhase('EndOfGame', true, 103)).toBe('EndOfGame')
  })
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
  it('uses the read-only lobby queue when the gameflow session is temporarily empty', () => {
    const result = normalizeChampSelectSnapshot({
      phase: 'ChampSelect',
      gameflowSession: null,
      lobbySession: { gameConfig: { queueId: 2400 } },
      champSelectSession: {},
      currentChampionId: 103,
    })
    expect(result).toMatchObject({ queueId: 2400, modeActive: true, currentChampionId: 103 })
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
    const retainedPastLaunchGrace = tracker.transportDisconnected(
      reduced.snapshot,
      2_000 + MATCH_CONTEXT_NONE_GRACE_MS + 1,
    )
    expect(retainedPastLaunchGrace).toMatchObject({
      currentChampionId: 103,
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
    tracker.apply(normalizeChampSelectSnapshot({
      phase: 'InProgress', gameflowSession: { queueId: 2400 }, champSelectSession: null,
      currentChampionId: null,
    }), 1_500)
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

  it('opens a new generation only after a new champ-select has a positive hero', () => {
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
      currentChampionId: 103,
      matchStage: 'active',
      matchGeneration: 1,
    })
    expect(newChampion).toMatchObject({
      currentChampionId: 81,
      matchStage: 'selecting',
      matchGeneration: 2,
    })
  })

  it('retains a detached launch context through a late empty outgoing champ select', () => {
    const tracker = new MatchContextTracker()
    const selected = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400 }, champSelectSession: {}, currentChampionId: 103,
    }), 1_000)
    tracker.transportDisconnected(selected, 2_000)
    const nextSelect = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400 }, champSelectSession: null, currentChampionId: null,
    }), 30_000, { destructive: true, champSelectSession: 'empty', matchIdentity: null })
    const nextChampion = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400 }, champSelectSession: {}, currentChampionId: 81,
    }), 31_000)

    expect(nextSelect).toMatchObject({
      queueId: 2400,
      currentChampionId: 103,
      matchStage: 'launching',
      matchGeneration: 1,
    })
    expect(nextChampion).toMatchObject({
      currentChampionId: 81,
      matchStage: 'selecting',
      matchGeneration: 2,
    })
  })

  it('uses a stable game identity to reject a late complete outgoing champ select', () => {
    const tracker = new MatchContextTracker()
    const selected = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400 }, champSelectSession: {}, currentChampionId: 103,
    }), 1_000, { destructive: true, champSelectSession: 'ok', matchIdentity: 'game:7001' })
    tracker.transportDisconnected(selected, 2_000)
    const lateComplete = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400 }, champSelectSession: {}, currentChampionId: 103,
    }), 3_000, { destructive: true, champSelectSession: 'ok', matchIdentity: 'game:7001' })

    expect(lateComplete).toMatchObject({
      currentChampionId: 103,
      matchStage: 'launching',
      matchGeneration: 1,
    })
    expect(tracker.getLastDecision()).toBe('retained-outgoing-champ-select')
  })

  it('conservatively retains a late complete same-hero session when no identity is exposed', () => {
    const tracker = new MatchContextTracker()
    const selected = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400 }, champSelectSession: {}, currentChampionId: 103,
    }), 1_000)
    tracker.transportDisconnected(selected, 2_000)
    const lateComplete = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400 }, champSelectSession: {}, currentChampionId: 103,
    }), 3_000)

    expect(lateComplete).toMatchObject({
      currentChampionId: 103,
      matchStage: 'launching',
      matchGeneration: 1,
    })
  })

  it('opens a new generation for the same champion when the game identity changes', () => {
    const tracker = new MatchContextTracker()
    tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400 }, champSelectSession: {}, currentChampionId: 103,
    }), 1_000, { destructive: true, champSelectSession: 'ok', matchIdentity: 'game:7001' })
    tracker.apply(normalizeChampSelectSnapshot({
      phase: 'InProgress', gameflowSession: { queueId: 2400 }, champSelectSession: null, currentChampionId: null,
    }), 2_000, { destructive: true, champSelectSession: 'skipped', matchIdentity: 'game:7001' })
    const next = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400 }, champSelectSession: {}, currentChampionId: 103,
    }), 3_000, { destructive: true, champSelectSession: 'ok', matchIdentity: 'game:7002' })

    expect(next).toMatchObject({
      currentChampionId: 103,
      matchStage: 'selecting',
      matchGeneration: 2,
    })
  })

  it('replays the reconnect poll where outgoing champ-select endpoints already return 404', async () => {
    const tracker = new MatchContextTracker()
    const selected = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400 }, champSelectSession: {}, currentChampionId: 103,
    }), 1_000)
    const detached = tracker.transportDisconnected(selected, 2_000)
    const outgoing404 = await Promise.allSettled([
      Promise.resolve({ queueId: 2400 }),
      Promise.resolve(null),
      Promise.resolve(null),
      Promise.resolve({ locale: 'zh_CN' }),
    ])
    const reduced = applyLcuPollResults(tracker, detached, 'ChampSelect', outgoing404, 3_000)

    expect(reduced.failure).toBeNull()
    expect(reduced.snapshot).toMatchObject({
      phase: 'ChampSelect',
      queueId: 2400,
      currentChampionId: 103,
      matchStage: 'launching',
      matchGeneration: 1,
    })
    expect(tracker.getLastDecision()).toBe('retained-outgoing-champ-select')
    expect(summarizeLcuAuxiliaryResults('ChampSelect', outgoing404)).toEqual({
      gameflowSession: 'ok',
      champSelectSession: 'empty',
      currentChampion: 'empty',
      locale: 'ok',
      lobby: 'skipped',
    })
  })

  it.each([
    { label: 'empty session', evidence: { destructive: true, champSelectSession: 'empty' as const, matchIdentity: null } },
    { label: 'same identity', evidence: { destructive: true, champSelectSession: 'ok' as const, matchIdentity: 'game:7001' } },
    { label: 'same hero without identity', evidence: { destructive: true, champSelectSession: 'ok' as const, matchIdentity: null } },
  ])('does not let $label renew the launch lease forever', ({ evidence }) => {
    const tracker = new MatchContextTracker()
    const selected = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400 }, champSelectSession: {}, currentChampionId: 103,
    }), 1_000, { destructive: true, champSelectSession: 'ok', matchIdentity: evidence.matchIdentity })
    tracker.transportDisconnected(selected, 2_000)
    const expired = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400 }, champSelectSession: null,
      currentChampionId: evidence.champSelectSession === 'ok' ? 103 : null,
    }), 1_000 + MATCH_CONTEXT_NONE_GRACE_MS + 1, evidence)

    expect(expired).toMatchObject({ currentChampionId: null, matchStage: 'none' })
    expect(tracker.getLastDecision()).toBe('expired')
  })

  it('does not let a same-identity active observation exceed the maximum lease', () => {
    const tracker = new MatchContextTracker()
    tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400 }, champSelectSession: {}, currentChampionId: 103,
    }), 1_000, { destructive: true, champSelectSession: 'ok', matchIdentity: 'game:7001' })
    tracker.apply(normalizeChampSelectSnapshot({
      phase: 'InProgress', gameflowSession: { queueId: 2400 }, champSelectSession: null, currentChampionId: null,
    }), 2_000, { destructive: true, champSelectSession: 'skipped', matchIdentity: 'game:7001' })
    const expired = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400 }, champSelectSession: {}, currentChampionId: 103,
    }), 2_000 + MATCH_CONTEXT_MAX_STALE_MS + 1, {
      destructive: true, champSelectSession: 'ok', matchIdentity: 'game:7001',
    })

    expect(expired).toMatchObject({ currentChampionId: null, matchStage: 'none' })
    expect(tracker.getLastDecision()).toBe('expired')
  })

  it.each([
    { label: 'missing session', evidence: { destructive: true, champSelectSession: 'empty' as const, matchIdentity: null } },
    { label: 'same identity', evidence: { destructive: true, champSelectSession: 'ok' as const, matchIdentity: 'game:7001' } },
  ])('opens a new generation when $label nevertheless reports a different hero', ({ evidence }) => {
    const tracker = new MatchContextTracker()
    const selected = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400 }, champSelectSession: {}, currentChampionId: 103,
    }), 1_000, { destructive: true, champSelectSession: 'ok', matchIdentity: evidence.matchIdentity })
    tracker.transportDisconnected(selected, 2_000)
    const next = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400 }, champSelectSession: null, currentChampionId: 81,
    }), 3_000, evidence)

    expect(next).toMatchObject({
      currentChampionId: 81,
      matchStage: 'selecting',
      matchGeneration: 2,
    })
    expect(tracker.confirmGameActive(next, 1, 103, 4_000)).toMatchObject({
      currentChampionId: 81,
      matchGeneration: 2,
    })
  })

  it('records only endpoint states in handoff diagnostics', async () => {
    const results = await Promise.allSettled([
      Promise.resolve(null),
      Promise.reject(new Error('secret path must not be copied')),
      Promise.resolve(103),
      Promise.resolve({ locale: 'zh_CN' }),
    ])
    expect(summarizeLcuAuxiliaryResults('ChampSelect', results)).toEqual({
      gameflowSession: 'empty',
      champSelectSession: 'error',
      currentChampion: 'ok',
      locale: 'ok',
      lobby: 'skipped',
    })
    expect(JSON.stringify(summarizeLcuAuxiliaryResults('ChampSelect', results))).not.toContain('secret')
  })

  it('extracts the same non-logged match identity from champ-select or gameflow', () => {
    expect(extractLcuMatchIdentity(null, { gameId: 7001 })).toBe('game:7001')
    expect(extractLcuMatchIdentity({ gameData: { gameId: '7001' } }, null)).toBe('game:7001')
    expect(extractLcuMatchIdentity({ gameData: { gameId: 0 } }, {})).toBeNull()
  })

  it('clears a detached context when a complete champ select belongs to another queue', () => {
    const tracker = new MatchContextTracker()
    const selected = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400 }, champSelectSession: {}, currentChampionId: 103,
    }), 1_000)
    tracker.transportDisconnected(selected, 2_000)
    const otherQueue = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 450 }, champSelectSession: {}, currentChampionId: 81,
    }), 3_000)

    expect(otherQueue).toMatchObject({
      queueId: 450,
      modeActive: false,
      currentChampionId: 81,
      matchStage: 'none',
    })
    expect(tracker.getLastDecision()).toBe('cleared-queue-change')
  })

  it('never combines an explicit other queue with a retained old champion', () => {
    const tracker = new MatchContextTracker()
    const selected = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400 }, champSelectSession: {}, currentChampionId: 103,
    }), 1_000)
    tracker.transportDisconnected(selected, 2_000)
    const otherQueue = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 450 }, champSelectSession: {}, currentChampionId: null,
    }), 3_000)

    expect(otherQueue).toMatchObject({
      queueId: 450,
      modeActive: false,
      currentChampionId: null,
      matchStage: 'none',
    })
  })

  it.each(['Lobby', 'Matchmaking', 'ReadyCheck'])(
    'clears a trusted retained match immediately on explicit queue change in %s',
    (phase) => {
      const tracker = new MatchContextTracker()
      const selected = tracker.apply(normalizeChampSelectSnapshot({
        phase: 'ChampSelect',
        gameflowSession: { queueId: 3270 },
        champSelectSession: {},
        currentChampionId: 103,
      }), 1_000, {
        destructive: true,
        champSelectSession: 'ok',
        currentChampion: 'ok',
        matchIdentity: null,
        authorityEpoch: 1,
      })
      tracker.transportDisconnected(selected, 2_000)
      const changed = tracker.apply(normalizeChampSelectSnapshot({
        phase,
        gameflowSession: { queueId: 450 },
        champSelectSession: null,
        currentChampionId: null,
      }), 3_000, {
        destructive: true,
        champSelectSession: 'skipped',
        currentChampion: 'skipped',
        matchIdentity: null,
        authorityEpoch: 1,
      })
      expect(changed).toMatchObject({
        queueId: 450,
        modeActive: false,
        currentChampionId: null,
        matchStage: 'none',
      })
      expect(tracker.getLastDecision()).toBe('cleared-queue-change')
    },
  )

  it.each([
    [2400, 3270],
    [3270, 2400],
  ])('atomically replaces queue %i with a complete supported queue %i ChampSelect', (oldQueue, newQueue) => {
    const tracker = new MatchContextTracker()
    const oldMatch = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect',
      gameflowSession: { queueId: oldQueue },
      champSelectSession: {},
      currentChampionId: 103,
    }), 1_000, {
      destructive: true,
      champSelectSession: 'ok',
      currentChampion: 'ok',
      matchIdentity: 'old-match',
      authorityEpoch: 1,
    })
    expect(oldMatch.matchGeneration).toBe(1)

    const replaced = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect',
      gameflowSession: { queueId: newQueue },
      champSelectSession: {},
      currentChampionId: 81,
    }), 2_000, {
      destructive: true,
      champSelectSession: 'ok',
      currentChampion: 'ok',
      matchIdentity: 'new-match',
      authorityEpoch: 1,
    })
    expect(replaced).toMatchObject({
      queueId: newQueue,
      modeActive: true,
      currentChampionId: 81,
      matchStage: 'selecting',
      matchGeneration: 2,
    })
    expect(tracker.getLastDecision()).toBe('confirmed')
  })

  it('does not apply destructive partial observations before transport handoff', async () => {
    const tracker = new MatchContextTracker()
    const selected = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400 }, champSelectSession: {}, currentChampionId: 103,
    }), 1_000)
    const auxiliary = await Promise.allSettled([
      Promise.resolve({ queueId: 450 }),
      Promise.reject(new Error('LCU request timeout')),
      Promise.resolve(null),
      Promise.resolve({ locale: 'zh_CN' }),
    ])
    const reduced = applyLcuPollResults(tracker, selected, 'EndOfGame', auxiliary, 2_000)

    expect(reduced.failure).toBeInstanceOf(Error)
    expect(reduced.snapshot).toMatchObject({
      queueId: 2400,
      currentChampionId: 103,
      matchStage: 'launching',
      matchGeneration: 1,
    })
    expect(tracker.getLastDecision()).toBe('retained-partial-observation')
  })

  it('commits InProgress from a partial poll without accepting destructive fields', async () => {
    const tracker = new MatchContextTracker()
    const selected = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400 }, champSelectSession: {}, currentChampionId: 103,
    }), 1_000)
    const auxiliary = await Promise.allSettled([
      Promise.reject(new Error('gameflow session timeout')),
      Promise.resolve(null),
      Promise.resolve(null),
      Promise.resolve({ locale: 'zh_CN' }),
    ])
    const reduced = applyLcuPollResults(tracker, selected, 'InProgress', auxiliary, 2_000)

    expect(reduced.failure).toBeInstanceOf(Error)
    expect(reduced.snapshot).toMatchObject({
      queueId: 2400,
      currentChampionId: 103,
      matchStage: 'active',
      matchGeneration: 1,
    })
  })

  it('keeps fresh queue and current champion when champ-select session times out', async () => {
    const tracker = new MatchContextTracker()
    const auxiliary = await Promise.allSettled([
      Promise.resolve({ queueId: 2400 }),
      Promise.reject(new Error('session timeout')),
      Promise.resolve(103),
      Promise.resolve({ locale: 'zh_CN' }),
      Promise.resolve(null),
    ])
    const reduced = applyLcuPollResults(tracker, normalizeChampSelectSnapshot({
      phase: 'None', gameflowSession: null, champSelectSession: null, currentChampionId: null,
    }), 'ChampSelect', auxiliary, 2_000)

    expect(reduced.failure).toBeInstanceOf(Error)
    expect(reduced.snapshot).toMatchObject({
      queueId: 2400,
      currentChampionId: 103,
      matchStage: 'selecting',
      matchGeneration: 1,
    })
  })

  it('keeps fresh queue and session-local champion when current endpoint times out', async () => {
    const tracker = new MatchContextTracker()
    const auxiliary = await Promise.allSettled([
      Promise.resolve({ queueId: 2400 }),
      Promise.resolve({
        localPlayerCellId: 4,
        myTeam: [{ cellId: 4, championId: 81, championPickIntent: 0 }],
      }),
      Promise.reject(new Error('current endpoint timeout')),
      Promise.resolve({ locale: 'zh_CN' }),
      Promise.resolve(null),
    ])
    const reduced = applyLcuPollResults(tracker, normalizeChampSelectSnapshot({
      phase: 'None', gameflowSession: null, champSelectSession: null, currentChampionId: null,
    }), 'ChampSelect', auxiliary, 2_000)

    expect(reduced.failure).toBeInstanceOf(Error)
    expect(reduced.snapshot).toMatchObject({
      queueId: 2400,
      currentChampionId: 81,
      matchStage: 'selecting',
      matchGeneration: 1,
    })
  })

  it('treats opportunistic champ-select errors during raw None as optional', async () => {
    const raw = await Promise.allSettled([
      Promise.resolve(null),
      Promise.reject(new Error('no active delegate')),
      Promise.reject(new Error('no current champion')),
      Promise.resolve({ locale: 'zh_CN' }),
      Promise.resolve(null),
    ])
    const prepared = prepareLcuReductionResults('None', 'None', raw)
    expect(prepared[1]).toEqual({ status: 'fulfilled', value: null })
    expect(prepared[2]).toEqual({ status: 'fulfilled', value: null })
    expect(prepared[0]).toBe(raw[0])
  })

  it('keeps a complete observation when only locale retrieval fails', async () => {
    const tracker = new MatchContextTracker()
    const selected = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400 }, champSelectSession: {}, currentChampionId: 103,
    }), 1_000)
    const auxiliary = await Promise.allSettled([
      Promise.resolve(null),
      Promise.resolve(null),
      Promise.resolve(null),
      Promise.reject(new Error('locale unavailable')),
    ])
    const reduced = applyLcuPollResults(tracker, selected, 'GameStart', auxiliary, 2_000)

    expect(reduced.failure).toBeNull()
    expect(reduced.snapshot).toMatchObject({
      currentChampionId: 103,
      matchStage: 'launching',
      matchGeneration: 1,
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
  ])('retains a pre-game hand-off beyond the old 15 second terminal window on %s', (phase) => {
    const tracker = new MatchContextTracker()
    tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400 }, champSelectSession: {}, currentChampionId: 103,
    }), 1_000)
    const first = tracker.apply(normalizeChampSelectSnapshot({
      phase, gameflowSession: null, champSelectSession: null, currentChampionId: null,
    }), 2_000)
    const afterOldWindow = tracker.apply(normalizeChampSelectSnapshot({
      phase, gameflowSession: null, champSelectSession: null, currentChampionId: null,
    }), 2_000 + MATCH_CONTEXT_TERMINAL_CONFIRM_MS + 1)
    expect(first).toMatchObject({ currentChampionId: 103, matchStage: 'launching' })
    expect(afterOldWindow).toMatchObject({ currentChampionId: 103, matchStage: 'launching' })
  })

  it('retains an outgoing structured ChampSelect with no hero or game identity', () => {
    const tracker = new MatchContextTracker()
    tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 3270, gameData: { gameId: 7001 } },
      champSelectSession: { gameId: 7001 }, currentChampionId: 103,
    }), 1_000, {
      destructive: true, champSelectSession: 'ok', currentChampion: 'ok',
      matchIdentity: 'game:7001', authorityEpoch: 1,
    })
    tracker.apply(normalizeChampSelectSnapshot({
      phase: 'None', gameflowSession: null, champSelectSession: null, currentChampionId: null,
    }), 2_000, {
      destructive: true, champSelectSession: 'empty', currentChampion: 'empty',
      matchIdentity: null, authorityEpoch: 1,
    })
    const outgoing = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 3270 },
      champSelectSession: { timer: { phase: '' }, localPlayerCellId: 4, myTeam: [] },
      currentChampionId: null,
    }), 20_000, {
      destructive: true, champSelectSession: 'ok', currentChampion: 'empty',
      matchIdentity: null, authorityEpoch: 1,
    })
    expect(outgoing).toMatchObject({
      queueId: 3270, currentChampionId: 103, matchStage: 'launching', matchGeneration: 1,
    })
    expect(tracker.getLastDecision()).toBe('retained-outgoing-champ-select')
  })

  it.each(['FailedToLaunch', 'TerminatedInError'])('clears a trusted explicit launch failure on %s', (phase) => {
    const tracker = new MatchContextTracker()
    tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400 }, champSelectSession: {},
      currentChampionId: 103,
    }), 1_000)
    const terminal = tracker.apply(normalizeChampSelectSnapshot({
      phase, gameflowSession: null, champSelectSession: null, currentChampionId: null,
    }), 2_000)
    expect(terminal).toMatchObject({ currentChampionId: null, matchStage: 'none' })
  })

  it('ignores terminal and other-queue observations from a replacement client authority', () => {
    const tracker = new MatchContextTracker()
    const selected = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400, gameData: { gameId: 7001 } },
      champSelectSession: { gameId: 7001 }, currentChampionId: 103,
    }), 1_000, {
      destructive: true, champSelectSession: 'ok', matchIdentity: 'game:7001', authorityEpoch: 1,
    })
    tracker.transportDisconnected(selected, 2_000)
    const foreignLobby = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'Lobby', gameflowSession: { queueId: 450 }, champSelectSession: null,
      currentChampionId: null,
    }), 3_000, {
      destructive: true, champSelectSession: 'skipped', matchIdentity: null, authorityEpoch: 2,
    })
    const foreignEnd = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'EndOfGame', gameflowSession: null, champSelectSession: null, currentChampionId: null,
    }), 4_000, {
      destructive: true, champSelectSession: 'skipped', matchIdentity: null, authorityEpoch: 2,
    })

    expect(foreignLobby).toMatchObject({
      queueId: 2400, currentChampionId: 103, matchStage: 'launching', matchGeneration: 1,
    })
    expect(foreignEnd).toMatchObject({
      queueId: 2400, currentChampionId: 103, matchStage: 'launching', matchGeneration: 1,
    })
    expect(tracker.getLastDecision()).toBe('retained-untrusted-observation')
  })

  it('commits GAME_STARTING before transport disappears and keeps the hand-off lease', () => {
    const tracker = new MatchContextTracker()
    const starting = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400 },
      champSelectSession: { timer: { phase: 'GAME_STARTING' } }, currentChampionId: 103,
    }), 1_000, {
      destructive: true,
      champSelectSession: 'ok',
      matchIdentity: null,
      authorityEpoch: 1,
      champSelectTimerPhase: 'GAME_STARTING',
    })
    const transientLobby = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'Lobby', gameflowSession: null, champSelectSession: null, currentChampionId: null,
    }), 1_000 + MATCH_CONTEXT_TERMINAL_CONFIRM_MS + 1, {
      destructive: true, champSelectSession: 'skipped', matchIdentity: null, authorityEpoch: 1,
    })
    expect(starting).toMatchObject({ currentChampionId: 103, matchStage: 'launching' })
    expect(transientLobby).toMatchObject({ currentChampionId: 103, matchStage: 'launching' })
  })

  it('commits GAME_STARTING when the current-champion endpoint already disappeared', () => {
    const tracker = new MatchContextTracker()
    tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400, gameId: 7001 },
      champSelectSession: { gameId: 7001 }, currentChampionId: 103,
    }), 1_000, {
      destructive: true, champSelectSession: 'ok', currentChampion: 'ok',
      matchIdentity: 'game:7001', authorityEpoch: 1,
    })
    const handoff = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400, gameId: 7001 },
      champSelectSession: { gameId: 7001, timer: { phase: 'GAME_STARTING' } },
      currentChampionId: null,
    }), 2_000, {
      destructive: true, champSelectSession: 'ok', currentChampion: 'empty',
      matchIdentity: 'game:7001', authorityEpoch: 1,
      champSelectTimerPhase: 'GAME_STARTING',
    })
    expect(handoff).toMatchObject({
      queueId: 2400, currentChampionId: 103, matchStage: 'launching', matchGeneration: 1,
    })
  })

  it('accepts trusted game-client running evidence after champ-select endpoints disappear', () => {
    const tracker = new MatchContextTracker()
    tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400, gameId: 7001 },
      champSelectSession: { gameId: 7001 }, currentChampionId: 103,
    }), 1_000, {
      destructive: true, champSelectSession: 'ok', currentChampion: 'ok',
      matchIdentity: 'game:7001', authorityEpoch: 1,
    })
    const active = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'GameStart', gameflowSession: { gameId: 7001, gameClient: { running: true } },
      champSelectSession: null, currentChampionId: null,
    }), 2_000, {
      destructive: true, champSelectSession: 'empty', currentChampion: 'empty',
      matchIdentity: 'game:7001', authorityEpoch: 1, gameClientRunning: true,
    })
    expect(active).toMatchObject({
      queueId: 2400, currentChampionId: 103, matchStage: 'active', matchGeneration: 1,
    })
  })

  it('does not let a foreign complete champ select replace the retained match', () => {
    const tracker = new MatchContextTracker()
    const selected = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400, gameId: 7001 },
      champSelectSession: { gameId: 7001 }, currentChampionId: 103,
    }), 1_000, {
      destructive: true, champSelectSession: 'ok', currentChampion: 'ok',
      matchIdentity: 'game:7001', authorityEpoch: 1,
    })
    tracker.transportDisconnected(selected, 2_000)
    const differentHero = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400, gameId: 9002 },
      champSelectSession: { gameId: 9002 }, currentChampionId: 81,
    }), 3_000, {
      destructive: true, champSelectSession: 'ok', currentChampion: 'ok',
      matchIdentity: 'game:9002', authorityEpoch: 2,
    })
    const sameHero = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400, gameId: 9003 },
      champSelectSession: { gameId: 9003 }, currentChampionId: 103,
    }), 4_000, {
      destructive: true, champSelectSession: 'ok', currentChampion: 'ok',
      matchIdentity: 'game:9003', authorityEpoch: 2,
    })
    expect(differentHero).toMatchObject({ currentChampionId: 103, matchGeneration: 1 })
    expect(sameHero).toMatchObject({ currentChampionId: 103, matchGeneration: 1 })
    expect(tracker.getBinding()).toMatchObject({
      authorityEpoch: 1, matchIdentity: 'game:7001', generation: 1,
    })
  })

  it('rebinds a rotated authority only after it proves the same match identity', () => {
    const tracker = new MatchContextTracker()
    const selected = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400, gameId: 7001 },
      champSelectSession: { gameId: 7001 }, currentChampionId: 103,
    }), 1_000, {
      destructive: true, champSelectSession: 'ok', currentChampion: 'ok',
      matchIdentity: 'game:7001', authorityEpoch: 1,
    })
    tracker.transportDisconnected(selected, 2_000)
    const rotated = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'GameStart', gameflowSession: { gameId: 7001 },
      champSelectSession: null, currentChampionId: null,
    }), 3_000, {
      destructive: true, champSelectSession: 'empty', currentChampion: 'empty',
      matchIdentity: 'game:7001', authorityEpoch: 2,
    })
    expect(rotated).toMatchObject({ currentChampionId: 103, matchStage: 'launching' })
    expect(tracker.getBinding()).toMatchObject({ authorityEpoch: 2, matchIdentity: 'game:7001' })
  })

  it.each([
    { label: 'different hero at GAME_STARTING', hero: 81, timer: 'GAME_STARTING', running: false },
    { label: 'same hero at GAME_STARTING', hero: 103, timer: 'GAME_STARTING', running: false },
    { label: 'different hero with game client running', hero: 81, timer: null, running: true },
    { label: 'same hero with game client running', hero: 103, timer: null, running: true },
  ])('opens a new generation for a complete second match: $label', ({ hero, timer, running }) => {
    const tracker = new MatchContextTracker()
    const first = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400, gameId: 7001 },
      champSelectSession: { gameId: 7001 }, currentChampionId: 103,
    }), 1_000, {
      destructive: true, champSelectSession: 'ok', currentChampion: 'ok',
      matchIdentity: 'game:7001', authorityEpoch: 1,
    })
    tracker.transportDisconnected(first, 2_000)
    const second = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect',
      gameflowSession: {
        queueId: 2400,
        gameId: 9002,
        gameClient: { running },
      },
      champSelectSession: {
        gameId: 9002,
        timer: timer ? { phase: timer } : undefined,
      },
      currentChampionId: hero,
    }), 3_000, {
      destructive: true, champSelectSession: 'ok', currentChampion: 'ok',
      matchIdentity: 'game:9002', authorityEpoch: 1,
      champSelectTimerPhase: timer,
      gameClientRunning: running,
    })
    expect(second).toMatchObject({
      queueId: 2400,
      currentChampionId: hero,
      matchGeneration: 2,
      matchStage: running ? 'active' : 'launching',
    })
    expect(tracker.getBinding()).toMatchObject({
      matchIdentity: 'game:9002', generation: 2, championId: hero,
    })
  })

  it.each([
    { label: 'GAME_STARTING', timer: 'GAME_STARTING', running: false, stage: 'launching' },
    { label: 'game client running', timer: null, running: true, stage: 'active' },
  ])('keeps the generation but updates a last-second hero change at $label', ({ timer, running, stage }) => {
    const tracker = new MatchContextTracker()
    tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400, gameId: 7001 },
      champSelectSession: { gameId: 7001 }, currentChampionId: 103,
    }), 1_000, {
      destructive: true, champSelectSession: 'ok', currentChampion: 'ok',
      matchIdentity: 'game:7001', authorityEpoch: 1,
    })
    const changed = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect',
      gameflowSession: { queueId: 2400, gameId: 7001, gameClient: { running } },
      champSelectSession: {
        gameId: 7001,
        timer: timer ? { phase: timer } : undefined,
      },
      currentChampionId: 81,
    }), 2_000, {
      destructive: true, champSelectSession: 'ok', currentChampion: 'ok',
      matchIdentity: 'game:7001', authorityEpoch: 1,
      champSelectTimerPhase: timer, gameClientRunning: running,
    })
    expect(changed).toMatchObject({
      currentChampionId: 81, matchGeneration: 1, matchStage: stage,
    })
    expect(tracker.getBinding()).toMatchObject({ championId: 81, generation: 1 })
  })

  it.each([
    { label: 'GAME_STARTING', timer: 'GAME_STARTING', running: false, stage: 'launching' },
    { label: 'game client running', timer: null, running: true, stage: 'active' },
  ])('opens a second generation after an active match even with the same hero and no identity at $label', ({ timer, running, stage }) => {
    const tracker = new MatchContextTracker()
    tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect', gameflowSession: { queueId: 2400, gameId: 7001 },
      champSelectSession: { gameId: 7001 }, currentChampionId: 103,
    }), 1_000, {
      destructive: true, champSelectSession: 'ok', currentChampion: 'ok',
      matchIdentity: 'game:7001', authorityEpoch: 1,
    })
    tracker.apply(normalizeChampSelectSnapshot({
      phase: 'InProgress', gameflowSession: { gameId: 7001 },
      champSelectSession: null, currentChampionId: null,
    }), 2_000, {
      destructive: true, champSelectSession: 'skipped', currentChampion: 'skipped',
      matchIdentity: 'game:7001', authorityEpoch: 1,
    })
    const second = tracker.apply(normalizeChampSelectSnapshot({
      phase: 'ChampSelect',
      gameflowSession: { queueId: 2400, gameClient: { running } },
      champSelectSession: { timer: timer ? { phase: timer } : undefined },
      currentChampionId: 103,
    }), 3_000, {
      destructive: true, champSelectSession: 'ok', currentChampion: 'ok',
      matchIdentity: null, authorityEpoch: 1,
      champSelectTimerPhase: timer, gameClientRunning: running,
    })
    expect(second).toMatchObject({
      currentChampionId: 103, matchGeneration: 2, matchStage: stage,
    })
    expect(tracker.getBinding()).toMatchObject({ generation: 2, championId: 103 })
  })
})

describe('LCU client authority registry', () => {
  it('binds a log credential to the process candidate for the same endpoint', () => {
    const registry = new LcuAuthorityRegistry()
    const fromLog = registry.authorityFor({
      port: 58120, token: 'rotating', source: 'log', executablePath: '',
    }, 1_000)
    const fromProcess = registry.authorityFor({
      port: 58120, token: 'rotating', source: 'process', executablePath: 'D:\\League\\LeagueClientUx.exe',
      processId: 42, processStartedAt: '2026-08-13T02:00:00.000Z',
    }, 2_000)
    expect(fromProcess).toBe(fromLog)
  })

  it('keeps one authority when the same process rotates endpoint credentials', () => {
    const registry = new LcuAuthorityRegistry()
    const first = registry.authorityFor({
      port: 58120, token: 'first', source: 'process', executablePath: 'D:\\League\\LeagueClientUx.exe',
      processId: 42, processStartedAt: '2026-08-13T02:00:00.000Z',
    }, 1_000)
    const rotated = registry.authorityFor({
      port: 58121, token: 'second', source: 'process', executablePath: 'D:\\League\\LeagueClientUx.exe',
      processId: 42, processStartedAt: '2026-08-13T02:00:00.000Z',
    }, 2_000)
    expect(rotated).toBe(first)
  })

  it('does not trust a reused PID with a different process start time', () => {
    const registry = new LcuAuthorityRegistry()
    const first = registry.authorityFor({
      port: 58120, token: 'first', source: 'process', executablePath: 'D:\\League\\LeagueClientUx.exe',
      processId: 42, processStartedAt: '2026-08-13T02:00:00.000Z',
    }, 1_000)
    const reused = registry.authorityFor({
      port: 58121, token: 'second', source: 'process', executablePath: 'D:\\League\\LeagueClientUx.exe',
      processId: 42, processStartedAt: '2026-08-13T03:00:00.000Z',
    }, 2_000)
    expect(reused).not.toBe(first)
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

it('prefers a candidate with confirmed queue 2400 and champion over an unrelated Lobby', async () => {
  const candidates = [
    { port: 2955, token: 'old-log', source: 'log' as const, executablePath: '' },
    { port: 58121, token: 'live-process', source: 'process' as const, executablePath: '' },
  ]
  const result = await selectReachableLcuCredentials(candidates, async (candidate) =>
    candidate.token === 'old-log'
      ? { rawPhase: 'Lobby', phase: 'Lobby', queueId: null, currentChampionId: null }
      : { rawPhase: 'None', phase: 'ChampSelect', queueId: 2400, currentChampionId: 103 },
  )
  expect(result.credentials?.token).toBe('live-process')
  expect(result.probe).toMatchObject({ queueId: 2400, currentChampionId: 103 })
})

it('does not prefer an unrelated non-None candidate over target-mode evidence', async () => {
  const candidates = [
    { port: 58121, token: 'target', source: 'log' as const, executablePath: '' },
    { port: 58122, token: 'other', source: 'process' as const, executablePath: '' },
  ]
  const result = await selectReachableLcuCredentials(candidates, async (candidate) =>
    candidate.token === 'target'
      ? { rawPhase: 'None', phase: 'ChampSelect', queueId: 2400, currentChampionId: 81 }
      : { rawPhase: 'Lobby', phase: 'Lobby', queueId: 450, currentChampionId: null },
  )
  expect(result.credentials?.token).toBe('target')
})

it('switches a sticky credential only for stronger target-mode evidence', () => {
  const current = { port: 2955, token: 'current', source: 'log' as const, executablePath: '' }
  const alternative = { port: 58121, token: 'alternative', source: 'process' as const, executablePath: '' }
  expect(shouldSwitchLcuCredential(current, alternative, {
    rawPhase: 'Lobby', phase: 'Lobby', queueId: 450, currentChampionId: null,
  })).toBe(false)
  expect(shouldSwitchLcuCredential(current, alternative, {
    rawPhase: 'EndOfGame', phase: 'EndOfGame', queueId: 2400, currentChampionId: 103,
  })).toBe(false)
  expect(shouldSwitchLcuCredential(current, alternative, {
    rawPhase: 'None', phase: 'ChampSelect', queueId: 2400, currentChampionId: 103,
  })).toBe(true)
})

it('prefers live ChampSelect over stale target fields in an explicit terminal phase', async () => {
  const candidates = [
    { port: 58120, token: 'ended', source: 'process' as const, executablePath: '' },
    { port: 58121, token: 'live-select', source: 'log' as const, executablePath: '' },
  ]
  const result = await selectReachableLcuCredentials(candidates, async (candidate) =>
    candidate.token === 'ended'
      ? { rawPhase: 'EndOfGame', phase: 'EndOfGame', queueId: 2400, currentChampionId: 103 }
      : { rawPhase: 'ChampSelect', phase: 'ChampSelect', queueId: 2400, currentChampionId: 81 },
  )
  expect(result.credentials?.token).toBe('live-select')
  expect(shouldSwitchLcuCredential(candidates[0]!, result.credentials, result.probe)).toBe(true)
})

it('allows an unknown regional phase only after positive target-mode inference', () => {
  const current = { port: 2955, token: 'idle', source: 'log' as const, executablePath: '' }
  const alternative = { port: 58121, token: 'regional', source: 'process' as const, executablePath: '' }
  expect(shouldSwitchLcuCredential(current, alternative, {
    rawPhase: 'CN_CHAMPION_SELECT',
    phase: 'ChampSelect',
    queueId: 2400,
    currentChampionId: 81,
  })).toBe(true)
})

it('re-evaluates an initially preferred Lobby candidate when another candidate gains target evidence', async () => {
  const candidates = [
    { port: 58120, token: 'lobby-process', source: 'process' as const, executablePath: '' },
    { port: 58121, token: 'target-log', source: 'log' as const, executablePath: '' },
  ]
  const initial = await selectReachableLcuCredentials(candidates, async (candidate) =>
    candidate.token === 'lobby-process'
      ? { rawPhase: 'Lobby', phase: 'Lobby', queueId: null, currentChampionId: null }
      : { rawPhase: 'None', phase: 'None', queueId: null, currentChampionId: null },
  )
  expect(initial.credentials?.token).toBe('lobby-process')
  expect(hasConfirmedTargetContext(normalizeChampSelectSnapshot({
    phase: 'Lobby', gameflowSession: null, champSelectSession: null, currentChampionId: null,
  }))).toBe(false)

  const later = await selectReachableLcuCredentials(candidates, async (candidate) =>
    candidate.token === 'lobby-process'
      ? { rawPhase: 'Lobby', phase: 'Lobby', queueId: null, currentChampionId: null }
      : { rawPhase: 'ChampSelect', phase: 'ChampSelect', queueId: 2400, currentChampionId: 103 },
  )
  expect(shouldSwitchLcuCredential(initial.credentials!, later.credentials, later.probe)).toBe(true)
})

it('contains only the explicit read-only LCU allowlist', () => {
  expect([...lcuReadOnlyEndpoints]).toEqual(expect.arrayContaining([
    '/lol-gameflow/v1/gameflow-phase', '/lol-gameflow/v1/session', '/lol-lobby/v2/lobby', '/lol-champ-select/v1/session', '/lol-champ-select/v1/current-champion', '/riotclient/region-locale',
  ]))
  expect([...lcuReadOnlyEndpoints].every((endpoint) => !endpoint.includes('patch') && !endpoint.includes('put'))).toBe(true)
})
