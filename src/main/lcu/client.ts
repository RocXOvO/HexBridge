import { EventEmitter } from 'node:events'
import https from 'node:https'
import path from 'node:path'
import WebSocket from 'ws'
import type { ChampSelectSnapshot, GameflowPhase, LcuConnectionState } from '../../shared/contracts.js'
import { isAramMayhemQueueId } from '../../shared/mayhem-queues.js'
import { logger } from '../logger.js'
import { discoverLcuCredentials, type LcuCredentials } from './discovery.js'
import {
  MatchContextTracker,
  normalizeChampSelectSnapshot,
  type LcuEndpointObservationStatus,
} from './normalize.js'

const EMPTY_SNAPSHOT: ChampSelectSnapshot = {
  phase: 'None',
  locale: 'zh_CN',
  queueId: null,
  modeActive: false,
  matchStage: 'none',
  matchGeneration: 0,
  currentChampionId: null,
  benchChampionIds: [],
  benchEnabled: false,
  updatedAt: Date.now(),
}

const READ_ONLY_ENDPOINTS = new Set([
  '/lol-gameflow/v1/gameflow-phase',
  '/lol-gameflow/v1/session',
  '/lol-lobby/v2/lobby',
  '/lol-champ-select/v1/session',
  '/lol-champ-select/v1/current-champion',
  '/riotclient/region-locale',
])

const KNOWN_GAMEFLOW_PHASES = new Set<GameflowPhase>([
  'None', 'Lobby', 'Matchmaking', 'ReadyCheck', 'ChampSelect', 'GameStart',
  'InProgress', 'Reconnect', 'WaitingForStats', 'PreEndOfGame', 'EndOfGame',
  'FailedToLaunch', 'TerminatedInError',
])

const AUTHORITY_ALIAS_TTL_MS = 24 * 60 * 60 * 1_000

type AuthorityAliasEntry = {
  epoch: number
  lastSeenAt: number
}

/**
 * Binds credentials that belong to the same League client instance without
 * trusting a reusable PID on its own. Tokens remain in Main-process memory and
 * are never returned to Renderer or written to diagnostics.
 */
export class LcuAuthorityRegistry {
  private readonly aliases = new Map<string, AuthorityAliasEntry>()
  private nextEpoch = 0

  authorityFor(credentials: LcuCredentials, now = Date.now()): number {
    this.prune(now)
    const aliases = this.aliasesFor(credentials)
    const existingEpochs = [...new Set(
      aliases.flatMap((alias) => {
        const entry = this.aliases.get(alias)
        return entry ? [entry.epoch] : []
      }),
    )]
    const epoch = existingEpochs.length ? Math.min(...existingEpochs) : ++this.nextEpoch

    if (existingEpochs.some((value) => value !== epoch)) {
      const mergedEpochs = new Set(existingEpochs)
      for (const [alias, entry] of this.aliases) {
        if (mergedEpochs.has(entry.epoch)) this.aliases.set(alias, { epoch, lastSeenAt: now })
      }
    }
    for (const alias of aliases) this.aliases.set(alias, { epoch, lastSeenAt: now })
    return epoch
  }

  private aliasesFor(credentials: LcuCredentials): string[] {
    const aliases = [`endpoint:${credentials.port}:${credentials.token}`]
    const processId = Number(credentials.processId)
    const startedAt = credentials.processStartedAt?.trim()
    if (Number.isInteger(processId) && processId > 0 && startedAt) {
      const executable = credentials.executablePath
        ? path.resolve(credentials.executablePath).replaceAll('\\', '/').toLowerCase()
        : ''
      aliases.push(`process:${processId}:${startedAt.toLowerCase()}:${executable}`)
    }
    return aliases
  }

  private prune(now: number): void {
    for (const [alias, entry] of this.aliases) {
      if (now - entry.lastSeenAt > AUTHORITY_ALIAS_TTL_MS) this.aliases.delete(alias)
    }
  }
}

export function isChampSelectSessionPayload(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const session = value as Record<string, unknown>
  if (session.errorCode) return false
  return Array.isArray(session.myTeam) ||
    Array.isArray(session.benchChampionIds) ||
    Array.isArray(session.benchChampions) ||
    (session.localPlayerCellId != null && Number.isInteger(Number(session.localPlayerCellId))) ||
    (session.timer != null && typeof session.timer === 'object')
}

export function inferEffectiveGameflowPhase(
  rawPhase: GameflowPhase,
  champSelectSessionAvailable: boolean,
  currentChampionId: unknown,
): GameflowPhase {
  const canInferChampSelect = rawPhase === 'None' || !KNOWN_GAMEFLOW_PHASES.has(rawPhase)
  const championId = Number(currentChampionId)
  const positiveEvidence = champSelectSessionAvailable ||
    (Number.isInteger(championId) && championId > 0)
  return canInferChampSelect && positiveEvidence ? 'ChampSelect' : rawPhase
}

export interface LcuCredentialProbeResult {
  rawPhase: GameflowPhase
  phase: GameflowPhase
  queueId: number | null
  currentChampionId: number | null
  matchIdentity?: string | null
  gameClientRunning?: boolean
}

type LcuCredentialProbeOutput = GameflowPhase | null | void | LcuCredentialProbeResult

export interface LcuClientDependencies {
  discover?: typeof discoverLcuCredentials
  request?: (
    endpoint: string,
    credentials: LcuCredentials,
    timeoutMs: number,
  ) => Promise<unknown | null>
  disableWebSocket?: boolean
}

const normalizeCredentialProbe = (output: LcuCredentialProbeOutput): LcuCredentialProbeResult => {
  if (typeof output === 'object' && output != null) return output
  const phase = typeof output === 'string' ? output : 'None'
  return {
    rawPhase: phase,
    phase,
    queueId: null,
    currentChampionId: null,
    matchIdentity: null,
    gameClientRunning: false,
  }
}

export function shouldSwitchLcuCredential(
  current: LcuCredentials,
  candidate: LcuCredentials | null,
  probe: LcuCredentialProbeResult | null,
  sameMatchAuthority = false,
): candidate is LcuCredentials {
  return Boolean(
    candidate &&
    (sameMatchAuthority || (
      probe?.phase === 'ChampSelect' &&
      isAramMayhemQueueId(probe?.queueId) &&
      probe.currentChampionId != null
    )) &&
    (candidate.port !== current.port || candidate.token !== current.token),
  )
}

export function hasConfirmedTargetContext(snapshot: ChampSelectSnapshot): boolean {
  return snapshot.modeActive &&
    snapshot.currentChampionId != null &&
    snapshot.matchStage !== 'none'
}

export async function selectReachableLcuCredentials(
  candidates: LcuCredentials[],
  probe: (candidate: LcuCredentials) => Promise<LcuCredentialProbeOutput>,
  retainedPriority: (
    candidate: LcuCredentials,
    probe: LcuCredentialProbeResult,
  ) => number = () => 0,
): Promise<{
  credentials: LcuCredentials | null
  probe: LcuCredentialProbeResult | null
  failures: string[]
}> {
  const attempts = await Promise.all(candidates.map(async (candidate) => {
    try {
      const result = normalizeCredentialProbe(await probe(candidate))
      return { candidate, probe: result, failure: null }
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (/authorization|401/i.test(message)) return { candidate: null, probe: null, failure: '凭据已过期' }
      if (/timeout/i.test(message)) return { candidate: null, probe: null, failure: '只读连接超时' }
      if (/ECONNREFUSED|not listening/i.test(message)) return { candidate: null, probe: null, failure: '候选端口未监听' }
      if (/HTTP|endpoint unavailable/i.test(message)) return { candidate: null, probe: null, failure: 'LCU 端点不可用' }
      return { candidate: null, probe: null, failure: '只读连接失败' }
    }
  }))
  const probePriority = (probe: LcuCredentialProbeResult): number => {
    if (probe.phase === 'ChampSelect' && isAramMayhemQueueId(probe.queueId) && probe.currentChampionId != null) return 100
    if (probe.phase === 'ChampSelect' && probe.currentChampionId != null) return 80
    if (probe.phase === 'ChampSelect' && isAramMayhemQueueId(probe.queueId)) return 70
    if (probe.phase === 'ChampSelect') return 60
    if (probe.phase === 'GameStart' || probe.phase === 'InProgress' || probe.phase === 'Reconnect') return 50
    return 0
  }
  const sourcePriority = (source: LcuCredentials['source']): number =>
    source === 'process' ? 3 : source === 'lockfile' || source === 'manual' ? 2 : 1
  const reachable = attempts
    .filter((attempt): attempt is typeof attempt & { candidate: LcuCredentials } => attempt.candidate != null)
    .sort((left, right) =>
      retainedPriority(right.candidate, right.probe) - retainedPriority(left.candidate, left.probe) ||
      probePriority(right.probe) - probePriority(left.probe) ||
      sourcePriority(right.candidate.source) - sourcePriority(left.candidate.source),
    )[0] ?? null
  const failures = attempts.flatMap((attempt) => attempt.failure ? [attempt.failure] : [])
  return { credentials: reachable?.candidate ?? null, probe: reachable?.probe ?? null, failures }
}

export function resolveLcuAuxiliaryResults(
  results: PromiseSettledResult<unknown>[],
): {
  gameflowSession: unknown
  champSelectSession: unknown
  currentChampionId: unknown
  regionLocale: unknown
  lobbySession: unknown
  failure: unknown | null
} {
  const valueAt = (index: number): unknown => {
    const result = results[index]
    return result?.status === 'fulfilled' ? result.value : null
  }
  return {
    gameflowSession: valueAt(0),
    champSelectSession: valueAt(1),
    currentChampionId: valueAt(2),
    regionLocale: valueAt(3),
    lobbySession: valueAt(4),
    // Locale is optional and must not invalidate an otherwise complete match
    // observation. The first three endpoints carry phase-adjacent match data.
    failure: results.slice(0, 3).find((result) => result.status === 'rejected')?.reason ?? null,
  }
}

type LcuObservationSummary = {
  gameflowSession: LcuEndpointObservationStatus
  champSelectSession: LcuEndpointObservationStatus
  currentChampion: LcuEndpointObservationStatus
  locale: LcuEndpointObservationStatus
  lobby: LcuEndpointObservationStatus
}

const identityValue = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return String(value)
  if (typeof value === 'string' && value.trim() && value !== '0') return value.trim()
  return null
}

export function extractLcuMatchIdentity(
  gameflowSession: any,
  champSelectSession: any,
): string | null {
  const championSelectId = identityValue(champSelectSession?.gameId)
  if (championSelectId) return `game:${championSelectId}`
  const gameflowId = identityValue(
    gameflowSession?.gameData?.gameId ??
    gameflowSession?.gameClient?.gameId ??
    gameflowSession?.gameId,
  )
  return gameflowId ? `game:${gameflowId}` : null
}

export function extractChampSelectTimerPhase(champSelectSession: any): string | null {
  const value = champSelectSession?.timer?.phase
  return typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : null
}

export function extractGameClientRunning(gameflowSession: any): boolean {
  return gameflowSession?.gameClient?.running === true ||
    String(gameflowSession?.gameClient?.clientState ?? '').toLowerCase() === 'running'
}

export function summarizeLcuAuxiliaryResults(
  phase: GameflowPhase,
  results: PromiseSettledResult<unknown>[],
  champSelectProbed = phase === 'ChampSelect',
): LcuObservationSummary {
  const statusAt = (index: number): LcuEndpointObservationStatus => {
    const result = results[index]
    if (!result || result.status === 'rejected') return 'error'
    return result.value == null ? 'empty' : 'ok'
  }
  return {
    gameflowSession: statusAt(0),
    champSelectSession: champSelectProbed ? statusAt(1) : 'skipped',
    currentChampion: champSelectProbed ? statusAt(2) : 'skipped',
    locale: statusAt(3),
    lobby: results[4] ? statusAt(4) : 'skipped',
  }
}

export function applyLcuPollResults(
  tracker: MatchContextTracker,
  previous: ChampSelectSnapshot,
  phase: GameflowPhase,
  results: PromiseSettledResult<unknown>[],
  now = Date.now(),
  authorityEpoch: number | null = 0,
): { snapshot: ChampSelectSnapshot; failure: unknown | null } {
  const resolved = resolveLcuAuxiliaryResults(results)
  const normalized = normalizeChampSelectSnapshot({
    phase,
    locale: String(
      (resolved.regionLocale as { locale?: unknown } | null)?.locale ??
      previous.locale ??
      'zh_CN',
    ),
    gameflowSession: resolved.gameflowSession,
    lobbySession: resolved.lobbySession,
    champSelectSession: resolved.champSelectSession,
    currentChampionId: resolved.currentChampionId,
  })
  // A rejected phase-adjacent request makes this a partial observation. Do
  // not let a terminal phase, queue change, or empty champ select destructively
  // mutate the retained match before transport hand-off protection runs.
  const endpointStatus = summarizeLcuAuxiliaryResults(phase, results)
  const observed = tracker.apply(normalized, now, {
    destructive: resolved.failure == null,
    champSelectSession: endpointStatus.champSelectSession,
    currentChampion: endpointStatus.currentChampion,
    matchIdentity: extractLcuMatchIdentity(
      resolved.gameflowSession,
      resolved.champSelectSession,
    ),
    authorityEpoch,
    champSelectTimerPhase: extractChampSelectTimerPhase(resolved.champSelectSession),
    gameClientRunning: extractGameClientRunning(resolved.gameflowSession),
  })
  return {
    snapshot: observed,
    failure: resolved.failure,
  }
}

export function prepareLcuReductionResults(
  _rawPhase: GameflowPhase,
  effectivePhase: GameflowPhase,
  results: PromiseSettledResult<unknown>[],
): PromiseSettledResult<unknown>[] {
  if (effectivePhase === 'ChampSelect') return results
  return results.map((result, index) =>
    (index === 1 || index === 2) && result.status === 'rejected'
      ? ({ status: 'fulfilled', value: null } as PromiseFulfilledResult<unknown>)
      : result,
  )
}

export class LcuClient extends EventEmitter {
  private credentials: LcuCredentials | null = null
  private snapshot: ChampSelectSnapshot = { ...EMPTY_SNAPSHOT }
  private state: LcuConnectionState = {
    connected: false,
    source: null,
    lastError: null,
    lastConnectedAt: null,
  }
  private pollTimer: NodeJS.Timeout | null = null
  private socket: WebSocket | null = null
  private nextDiscoveryAt = 0
  private tickInFlight: Promise<void> | null = null
  private eventTickPending = false
  private readonly matchContext = new MatchContextTracker()
  private candidatePool: LcuCredentials[] = []
  private nextAlternativeProbeAt = 0
  private nextCandidateRefreshAt = 0
  private candidateRefreshInFlight: Promise<void> | null = null
  private readonly authorityRegistry = new LcuAuthorityRegistry()
  private activeAuthorityEpoch: number | null = null
  private transportEpoch = 0
  private lastRawPhase: GameflowPhase = 'None'
  private lastHeartbeatAt = 0
  private lastContextSignature = ''
  private lastObservation: LcuObservationSummary | null = null

  constructor(
    private readonly getManualDirectory: () => string,
    private readonly dependencies: LcuClientDependencies = {},
  ) {
    super()
  }

  getSnapshot(): ChampSelectSnapshot {
    return { ...this.snapshot, benchChampionIds: [...this.snapshot.benchChampionIds] }
  }

  getState(): LcuConnectionState {
    return { ...this.state }
  }

  confirmGameActive(
    reason: 'game-process' | 'augment-interface',
    expectedGeneration: number,
    expectedChampionId: number,
  ): boolean {
    const previousStage = this.snapshot.matchStage
    this.snapshot = this.matchContext.confirmGameActive(
      this.snapshot,
      expectedGeneration,
      expectedChampionId,
    )
    if (this.snapshot.matchStage !== previousStage) this.publishUpdate(reason)
    return this.snapshot.matchStage === 'active' && previousStage !== 'active'
  }

  start(): void {
    if (this.pollTimer) return
    this.pollTimer = setInterval(() => void this.tick('timer'), 1000)
    void this.tick('timer')
  }

  async rediscoverNow(): Promise<LcuConnectionState> {
    if (this.tickInFlight) await this.tickInFlight
    this.invalidate('正在重新检测英雄联盟客户端', true)
    await this.tick('manual')
    return this.getState()
  }

  stop(): void {
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.pollTimer = null
    this.socket?.close()
    this.socket = null
    this.eventTickPending = false
  }

  /** Runs one production poll without starting timers; used by deterministic hand-off replay tests. */
  pollOnce(): Promise<void> {
    return this.tick('manual')
  }

  private invalidate(
    reason: string,
    immediate = false,
    observation: LcuObservationSummary | null = null,
  ): void {
    this.credentials = null
    this.activeAuthorityEpoch = null
    this.candidatePool = []
    this.nextCandidateRefreshAt = 0
    this.socket?.close()
    this.socket = null
    this.snapshot = this.matchContext.transportDisconnected(this.snapshot)
    this.lastObservation = observation
    this.state = { ...this.state, connected: false, lastError: reason }
    this.nextDiscoveryAt = immediate ? 0 : Date.now() + 3000
  }

  private async ensureCredentials(): Promise<boolean> {
    if (this.credentials) return true
    if (Date.now() < this.nextDiscoveryAt) return false
    this.nextDiscoveryAt = Date.now() + 5000
    const discovery = await (this.dependencies.discover ?? discoverLcuCredentials)(
      this.getManualDirectory(),
    )
    this.candidatePool = discovery.candidates
    this.nextCandidateRefreshAt = Date.now() + 10_000
    if (!discovery.candidates.length) {
      const ordinaryMessage = discovery.processCount === 0 && !discovery.manualConfigured
        ? '英雄联盟客户端未启动或尚未发现'
        : '英雄联盟客户端暂时不可用，正在后台重试'
      this.state = { ...this.state, connected: false, source: null, lastError: ordinaryMessage }
      return false
    }
    const selection = await selectReachableLcuCredentials(
      discovery.candidates,
      (candidate) => this.probeCandidateContext(candidate, 1_000),
      (candidate, probe) => this.retainedCandidatePriority(candidate, probe),
    )
    if (selection.credentials) {
      const credentials = selection.credentials
      this.credentials = credentials
      this.activeAuthorityEpoch = this.authorityEpochFor(credentials)
      this.transportEpoch += 1
      this.lastObservation = null
      this.state = {
        connected: true,
        source: credentials.source,
        lastError: null,
        lastConnectedAt: Date.now(),
      }
      logger.info('LCU credentials verified', {
        source: credentials.source,
        candidateCount: this.candidatePool.length,
        transportEpoch: this.transportEpoch,
      })
      this.connectSocket(credentials)
      this.publishUpdate('transport-connected')
      return true
    }
    const reason = [...new Set(selection.failures)].slice(0, 2).join('；') || '只读探测失败'
    const ordinaryMessage = discovery.processCount === 0 && !discovery.manualConfigured
      ? '英雄联盟客户端未启动或尚未发现'
      : '英雄联盟客户端暂时不可用，正在后台重试'
    this.state = {
      ...this.state,
      connected: false,
      source: null,
      lastError: ordinaryMessage,
    }
    logger.debug('LCU candidates were not reachable', {
      candidateCount: discovery.candidates.length,
      processCount: discovery.processCount,
      failureClass: reason,
    })
    return false
  }

  private request<T>(endpoint: string): Promise<T | null> {
    if (!READ_ONLY_ENDPOINTS.has(endpoint)) {
      return Promise.reject(new Error(`Blocked non-whitelisted LCU endpoint: ${endpoint}`))
    }
    if (!this.credentials) return Promise.resolve(null)
    return this.requestWithCredentials<T>(endpoint, this.credentials, 1_500)
  }

  private requestWithCredentials<T>(
    endpoint: string,
    credentials: LcuCredentials,
    timeoutMs: number,
  ): Promise<T | null> {
    if (!READ_ONLY_ENDPOINTS.has(endpoint)) {
      return Promise.reject(new Error(`Blocked non-whitelisted LCU endpoint: ${endpoint}`))
    }
    if (this.dependencies.request) {
      return this.dependencies.request(endpoint, credentials, timeoutMs) as Promise<T | null>
    }
    const authorization = Buffer.from(`riot:${credentials.token}`).toString('base64')

    return new Promise((resolve, reject) => {
      let settled = false
      let hardTimeout: NodeJS.Timeout | null = null
      const finish = <Value>(callback: (value: Value) => void, value: Value): void => {
        if (settled) return
        settled = true
        if (hardTimeout) clearTimeout(hardTimeout)
        callback(value)
      }
      const request = https.request(
        {
          hostname: '127.0.0.1',
          port: credentials.port,
          path: endpoint,
          method: 'GET',
          rejectUnauthorized: false,
          headers: { Authorization: `Basic ${authorization}`, Accept: 'application/json' },
          timeout: timeoutMs,
        },
        (response) => {
          const chunks: Buffer[] = []
          response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
          response.on('end', () => {
            if (response.statusCode === 404) return finish(resolve, null)
            if (response.statusCode === 401) return finish(reject, new Error('LCU authorization expired'))
            if (!response.statusCode || response.statusCode >= 400) {
              return finish(reject, new Error(`LCU HTTP ${response.statusCode ?? 0}`))
            }
            try {
              const text = Buffer.concat(chunks).toString('utf8')
              finish(resolve, text ? (JSON.parse(text) as T) : (null as T | null))
            } catch (error) {
              finish(reject, error)
            }
          })
        },
      )
      hardTimeout = setTimeout(() => {
        request.destroy(new Error('LCU request hard timeout'))
      }, timeoutMs)
      request.on('timeout', () => request.destroy(new Error('LCU request timeout')))
      request.on('error', (error) => finish(reject, error))
      request.end()
    })
  }

  private async probeCandidateContext(
    candidate: LcuCredentials,
    timeoutMs: number,
  ): Promise<LcuCredentialProbeResult> {
    const [phaseResult, gameflowResult, champSelectResult, championResult, lobbyResult] =
      await Promise.allSettled([
      this.requestWithCredentials<GameflowPhase>(
        '/lol-gameflow/v1/gameflow-phase',
        candidate,
        timeoutMs,
      ),
      this.requestWithCredentials<unknown>('/lol-gameflow/v1/session', candidate, timeoutMs),
      this.requestWithCredentials<unknown>(
        '/lol-champ-select/v1/session',
        candidate,
        timeoutMs,
      ),
      this.requestWithCredentials<unknown>(
        '/lol-champ-select/v1/current-champion',
        candidate,
        timeoutMs,
      ),
      this.requestWithCredentials<unknown>('/lol-lobby/v2/lobby', candidate, timeoutMs),
    ])
    if (phaseResult.status === 'rejected') throw phaseResult.reason
    const rawPhase = phaseResult.value
    if (rawPhase == null) throw new Error('LCU gameflow endpoint unavailable')
    const gameflowSession = gameflowResult.status === 'fulfilled' ? gameflowResult.value : null
    const champSelectSession = champSelectResult.status === 'fulfilled' ? champSelectResult.value : null
    const currentChampionId = championResult.status === 'fulfilled' ? championResult.value : null
    const lobbySession = lobbyResult.status === 'fulfilled' ? lobbyResult.value : null
    const phase = inferEffectiveGameflowPhase(
      rawPhase,
      isChampSelectSessionPayload(champSelectSession),
      currentChampionId,
    )
    const normalized = normalizeChampSelectSnapshot({
      phase,
      gameflowSession,
      lobbySession,
      champSelectSession,
      currentChampionId,
    })
    return {
      rawPhase,
      phase,
      queueId: normalized.queueId,
      currentChampionId: normalized.currentChampionId,
      matchIdentity: extractLcuMatchIdentity(gameflowSession, champSelectSession),
      gameClientRunning: extractGameClientRunning(gameflowSession),
    }
  }

  private tick(trigger: 'timer' | 'event' | 'manual'): Promise<void> {
    if (this.tickInFlight) {
      if (trigger === 'event') this.eventTickPending = true
      return this.tickInFlight
    }
    const operation = (async () => {
      // Coalesce an event received during a poll into one immediate follow-up.
      // Previously the WAMP notification returned the in-flight promise and
      // the newly selected champion could wait for the next 1s timer tick.
      this.eventTickPending = false
      await this.tickInternal()
      if (this.eventTickPending) {
        this.eventTickPending = false
        await this.tickInternal()
      }
    })().finally(() => {
      if (this.tickInFlight === operation) this.tickInFlight = null
      if (this.eventTickPending) {
        this.eventTickPending = false
        setImmediate(() => void this.tick('event'))
      }
    })
    this.tickInFlight = operation
    return operation
  }

  private async tickInternal(): Promise<void> {
    try {
      if (!(await this.ensureCredentials())) {
        this.lastObservation = null
        this.snapshot = this.matchContext.transportDisconnected(this.snapshot)
        this.publishUpdate('transport-unavailable')
        return
      }
      let rawPhase = (await this.request<GameflowPhase>('/lol-gameflow/v1/gameflow-phase')) ?? 'None'
      rawPhase = await this.promoteAlternativeCredential(rawPhase)
      this.lastRawPhase = rawPhase
      const probeChampSelect = rawPhase === 'ChampSelect' || rawPhase === 'None' ||
        !KNOWN_GAMEFLOW_PHASES.has(rawPhase)
      const auxiliary = await Promise.allSettled([
        this.request<any>('/lol-gameflow/v1/session'),
        probeChampSelect ? this.request<any>('/lol-champ-select/v1/session') : Promise.resolve(null),
        probeChampSelect
          ? this.request<number>('/lol-champ-select/v1/current-champion')
          : Promise.resolve(null),
        this.request<any>('/riotclient/region-locale'),
        probeChampSelect ? this.request<any>('/lol-lobby/v2/lobby') : Promise.resolve(null),
      ])
      const champSelectSessionAvailable =
        auxiliary[1]?.status === 'fulfilled' && isChampSelectSessionPayload(auxiliary[1].value)
      const probedChampion = auxiliary[2]?.status === 'fulfilled'
        ? Number(auxiliary[2].value)
        : 0
      const phase = inferEffectiveGameflowPhase(
        rawPhase,
        probeChampSelect && champSelectSessionAvailable,
        probeChampSelect ? probedChampion : null,
      )
      this.lastObservation = summarizeLcuAuxiliaryResults(phase, auxiliary, probeChampSelect)
      const reductionResults = prepareLcuReductionResults(rawPhase, phase, auxiliary)
      const reduced = applyLcuPollResults(
        this.matchContext,
        this.snapshot,
        phase,
        reductionResults,
        Date.now(),
        this.activeAuthorityEpoch,
      )
      this.snapshot = reduced.snapshot
      if (reduced.failure) {
        const message = reduced.failure instanceof Error
          ? reduced.failure.message
          : 'LCU auxiliary request failed'
        this.state = {
          ...this.state,
          connected: true,
          lastError: `部分只读端点暂不可用：${/timeout/i.test(message) ? '请求超时' : '读取失败'}`,
        }
        this.publishUpdate('auxiliary-partial')
        this.publishHeartbeat(phase)
        return
      }
      this.state = { ...this.state, connected: true, lastError: null }
      this.publishUpdate('poll')
      this.publishHeartbeat(phase)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.invalidate(message)
      this.publishUpdate('poll-failed')
    }
  }

  private async promoteAlternativeCredential(
    currentPhase: GameflowPhase,
  ): Promise<GameflowPhase> {
    this.refreshCandidatePoolInBackground()
    if (
      (hasConfirmedTargetContext(this.snapshot) &&
        this.matchContext.isAuthorityTrusted(this.activeAuthorityEpoch)) ||
      !this.credentials ||
      this.candidatePool.length < 2 ||
      Date.now() < this.nextAlternativeProbeAt
    ) {
      return currentPhase
    }
    this.nextAlternativeProbeAt = Date.now() + 2_000
    const binding = this.matchContext.getBinding()
    const selection = await selectReachableLcuCredentials(
      this.candidatePool,
      (candidate) => this.probeCandidateContext(candidate, 800),
      (candidate, probe) => this.retainedCandidatePriority(candidate, probe),
    )
    const next = selection.credentials
    const nextAuthorityEpoch = next ? this.authorityEpochFor(next) : null
    const sameMatchAuthority = this.matchContext.isAuthorityTrusted(nextAuthorityEpoch) || Boolean(
      binding?.matchIdentity &&
      selection.probe?.matchIdentity &&
      selection.probe.matchIdentity === binding.matchIdentity,
    )
    if (!shouldSwitchLcuCredential(
      this.credentials,
      next,
      selection.probe,
      sameMatchAuthority,
    )) {
      return currentPhase
    }
    const selectedProbe = selection.probe as LcuCredentialProbeResult

    const previousSource = this.credentials.source
    this.credentials = next
    this.activeAuthorityEpoch = nextAuthorityEpoch
    this.transportEpoch += 1
    this.socket?.close()
    this.socket = null
    this.state = { ...this.state, connected: true, source: next.source, lastError: null }
    logger.info('LCU credential candidate switched', {
      fromSource: previousSource,
      toSource: next.source,
      phase: selectedProbe.phase,
      candidateCount: this.candidatePool.length,
      transportEpoch: this.transportEpoch,
      retainedAuthority: sameMatchAuthority,
    })
    this.connectSocket(next)
    return selectedProbe.rawPhase
  }

  private refreshCandidatePoolInBackground(): void {
    if (
      (hasConfirmedTargetContext(this.snapshot) &&
        this.matchContext.isAuthorityTrusted(this.activeAuthorityEpoch)) ||
      !this.credentials ||
      Date.now() < this.nextCandidateRefreshAt ||
      this.candidateRefreshInFlight
    ) {
      return
    }
    this.nextCandidateRefreshAt = Date.now() + 10_000
    const activeCredentials = this.credentials
    const operation = (this.dependencies.discover ?? discoverLcuCredentials)(
      this.getManualDirectory(),
    )
      .then((discovery) => {
        if (this.credentials === activeCredentials && discovery.candidates.length) {
          this.candidatePool = discovery.candidates
        }
      })
      .catch((error) => {
        logger.debug('LCU candidate refresh unavailable', {
          errorName: error instanceof Error ? error.name : 'Error',
        })
      })
      .finally(() => {
        if (this.candidateRefreshInFlight === operation) this.candidateRefreshInFlight = null
      })
    this.candidateRefreshInFlight = operation
  }

  private connectSocket(credentials: LcuCredentials): void {
    if (this.dependencies.disableWebSocket) return
    const authorization = Buffer.from(`riot:${credentials.token}`).toString('base64')
    try {
      const socket = new WebSocket(`wss://127.0.0.1:${credentials.port}/`, 'wamp', {
        rejectUnauthorized: false,
        headers: { Authorization: `Basic ${authorization}` },
      })
      this.socket = socket
      socket.on('open', () => socket.send(JSON.stringify([5, 'OnJsonApiEvent'])))
      socket.on('message', (payload) => {
        try {
          const message = JSON.parse(payload.toString()) as any[]
          const event = message[2]
          if (message[0] === 8 && event?.uri && String(event.uri).startsWith('/lol-')) {
            if (this.socket === socket) void this.tick('event')
          }
        } catch {
          // Ignore malformed push events; polling remains active.
        }
      })
      socket.on('close', () => {
        if (this.socket === socket) this.socket = null
      })
      socket.on('error', (error) => logger.debug('LCU websocket unavailable; polling active', error.message))
    } catch (error) {
      logger.debug('LCU websocket setup failed', error instanceof Error ? error.message : error)
    }
  }

  private publishUpdate(reason: string): void {
    const contextDecision = this.matchContext.getLastDecision()
    const signature = [
      this.state.connected ? 'connected' : 'detached',
      this.snapshot.phase,
      this.snapshot.matchStage,
      this.snapshot.matchGeneration,
      this.snapshot.queueId ?? 0,
      this.snapshot.currentChampionId ?? 0,
      contextDecision,
      this.lastRawPhase,
      this.transportEpoch,
    ].join(':')
    if (signature !== this.lastContextSignature) {
      this.lastContextSignature = signature
      logger.info('LCU match context transitioned', {
        reason,
        transport: this.state.connected ? 'connected' : 'detached',
        rawPhase: this.lastRawPhase,
        phase: this.snapshot.phase,
        matchStage: this.snapshot.matchStage,
        matchGeneration: this.snapshot.matchGeneration,
        queueId: this.snapshot.queueId,
        championId: this.snapshot.currentChampionId,
        contextDecision,
        endpointStatus: this.lastObservation,
        transportEpoch: this.transportEpoch,
        retainedAuthority: this.matchContext.isAuthorityTrusted(this.activeAuthorityEpoch),
      })
    }
    this.emit('update', this.getSnapshot(), this.getState())
  }

  private publishHeartbeat(phase: GameflowPhase): void {
    const now = Date.now()
    if (now - this.lastHeartbeatAt < 15_000) return
    this.lastHeartbeatAt = now
    logger.debug('LCU poll heartbeat', {
      transport: this.state.connected ? 'connected' : 'detached',
      source: this.state.source,
      rawPhase: this.lastRawPhase,
      phase,
      matchStage: this.snapshot.matchStage,
      queueId: this.snapshot.queueId,
      championId: this.snapshot.currentChampionId,
      endpointStatus: this.lastObservation,
      candidateCount: this.candidatePool.length,
      transportEpoch: this.transportEpoch,
      retainedAuthority: this.matchContext.isAuthorityTrusted(this.activeAuthorityEpoch),
    })
    this.emit('diagnostic')
  }

  private authorityEpochFor(credentials: LcuCredentials): number {
    return this.authorityRegistry.authorityFor(credentials)
  }

  private retainedCandidatePriority(
    candidate: LcuCredentials,
    probe: LcuCredentialProbeResult,
  ): number {
    const binding = this.matchContext.getBinding()
    const authorityEpoch = this.authorityEpochFor(candidate)
    if (this.matchContext.isAuthorityTrusted(authorityEpoch)) return 1_000
    if (
      binding?.matchIdentity &&
      probe.matchIdentity &&
      probe.matchIdentity === binding.matchIdentity
    ) return 900
    return 0
  }
}

export const lcuReadOnlyEndpoints = READ_ONLY_ENDPOINTS
