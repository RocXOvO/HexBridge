import { EventEmitter } from 'node:events'
import https from 'node:https'
import WebSocket from 'ws'
import type { ChampSelectSnapshot, GameflowPhase, LcuConnectionState } from '../../shared/contracts.js'
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
  '/lol-champ-select/v1/session',
  '/lol-champ-select/v1/current-champion',
  '/riotclient/region-locale',
])

export async function selectReachableLcuCredentials(
  candidates: LcuCredentials[],
  probe: (candidate: LcuCredentials) => Promise<void>,
): Promise<{ credentials: LcuCredentials | null; failures: string[] }> {
  const attempts = await Promise.all(candidates.map(async (candidate) => {
    try {
      await probe(candidate)
      return { candidate, failure: null }
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (/authorization|401/i.test(message)) return { candidate: null, failure: '凭据已过期' }
      if (/timeout/i.test(message)) return { candidate: null, failure: '只读连接超时' }
      if (/ECONNREFUSED|not listening/i.test(message)) return { candidate: null, failure: '候选端口未监听' }
      if (/HTTP|endpoint unavailable/i.test(message)) return { candidate: null, failure: 'LCU 端点不可用' }
      return { candidate: null, failure: '只读连接失败' }
    }
  }))
  const reachable = attempts.find((attempt) => attempt.candidate)?.candidate ?? null
  const failures = attempts.flatMap((attempt) => attempt.failure ? [attempt.failure] : [])
  return { credentials: reachable, failures }
}

export function resolveLcuAuxiliaryResults(
  results: PromiseSettledResult<unknown>[],
): {
  gameflowSession: unknown
  champSelectSession: unknown
  currentChampionId: unknown
  regionLocale: unknown
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

export function summarizeLcuAuxiliaryResults(
  phase: GameflowPhase,
  results: PromiseSettledResult<unknown>[],
): LcuObservationSummary {
  const statusAt = (index: number): LcuEndpointObservationStatus => {
    const result = results[index]
    if (!result || result.status === 'rejected') return 'error'
    return result.value == null ? 'empty' : 'ok'
  }
  return {
    gameflowSession: statusAt(0),
    champSelectSession: phase === 'ChampSelect' ? statusAt(1) : 'skipped',
    currentChampion: phase === 'ChampSelect' ? statusAt(2) : 'skipped',
    locale: statusAt(3),
  }
}

export function applyLcuPollResults(
  tracker: MatchContextTracker,
  previous: ChampSelectSnapshot,
  phase: GameflowPhase,
  results: PromiseSettledResult<unknown>[],
  now = Date.now(),
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
    matchIdentity: extractLcuMatchIdentity(
      resolved.gameflowSession,
      resolved.champSelectSession,
    ),
  })
  return {
    snapshot: observed,
    failure: resolved.failure,
  }
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
  private readonly matchContext = new MatchContextTracker()
  private lastContextSignature = ''
  private lastObservation: LcuObservationSummary | null = null

  constructor(private readonly getManualDirectory: () => string) {
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
    this.pollTimer = setInterval(() => void this.tick(), 1000)
    void this.tick()
  }

  async rediscoverNow(): Promise<LcuConnectionState> {
    if (this.tickInFlight) await this.tickInFlight
    this.invalidate('正在重新检测英雄联盟客户端', true)
    await this.tick()
    return this.getState()
  }

  stop(): void {
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.pollTimer = null
    this.socket?.close()
    this.socket = null
  }

  private invalidate(
    reason: string,
    immediate = false,
    observation: LcuObservationSummary | null = null,
  ): void {
    this.credentials = null
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
    const discovery = await discoverLcuCredentials(this.getManualDirectory())
    if (!discovery.candidates.length) {
      this.state = { ...this.state, connected: false, source: null, lastError: discovery.summary }
      return false
    }
    const selection = await selectReachableLcuCredentials(
      discovery.candidates,
      async (candidate) => {
        const phase = await this.requestWithCredentials<GameflowPhase>(
          '/lol-gameflow/v1/gameflow-phase',
          candidate,
          1_000,
        )
        if (phase == null) throw new Error('LCU gameflow endpoint unavailable')
      },
    )
    if (selection.credentials) {
      const credentials = selection.credentials
      this.credentials = credentials
      this.lastObservation = null
      this.state = {
        connected: true,
        source: credentials.source,
        lastError: null,
        lastConnectedAt: Date.now(),
      }
      logger.info('LCU credentials verified', { source: credentials.source, port: credentials.port })
      this.connectSocket(credentials)
      this.publishUpdate('transport-connected')
      return true
    }
    const reason = [...new Set(selection.failures)].slice(0, 2).join('；') || '只读探测失败'
    this.state = {
      ...this.state,
      connected: false,
      source: null,
      lastError: `检测到 ${discovery.candidates.length} 个候选，但无法连接：${reason}`,
    }
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
    const authorization = Buffer.from(`riot:${credentials.token}`).toString('base64')

    return new Promise((resolve, reject) => {
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
            if (response.statusCode === 404) return resolve(null)
            if (response.statusCode === 401) return reject(new Error('LCU authorization expired'))
            if (!response.statusCode || response.statusCode >= 400) {
              return reject(new Error(`LCU HTTP ${response.statusCode ?? 0}`))
            }
            try {
              const text = Buffer.concat(chunks).toString('utf8')
              resolve(text ? (JSON.parse(text) as T) : (null as T | null))
            } catch (error) {
              reject(error)
            }
          })
        },
      )
      request.on('timeout', () => request.destroy(new Error('LCU request timeout')))
      request.on('error', reject)
      request.end()
    })
  }

  private tick(): Promise<void> {
    if (this.tickInFlight) return this.tickInFlight
    const operation = this.tickInternal().finally(() => {
      if (this.tickInFlight === operation) this.tickInFlight = null
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
      const phase = (await this.request<GameflowPhase>('/lol-gameflow/v1/gameflow-phase')) ?? 'None'
      const auxiliary = await Promise.allSettled([
        this.request<any>('/lol-gameflow/v1/session'),
        phase === 'ChampSelect' ? this.request<any>('/lol-champ-select/v1/session') : Promise.resolve(null),
        phase === 'ChampSelect'
          ? this.request<number>('/lol-champ-select/v1/current-champion')
          : Promise.resolve(null),
        this.request<any>('/riotclient/region-locale'),
      ])
      this.lastObservation = summarizeLcuAuxiliaryResults(phase, auxiliary)
      const reduced = applyLcuPollResults(this.matchContext, this.snapshot, phase, auxiliary)
      this.snapshot = reduced.snapshot
      if (reduced.failure) {
        const message = reduced.failure instanceof Error
          ? reduced.failure.message
          : 'LCU auxiliary request failed'
        this.invalidate(message, false, this.lastObservation)
        this.publishUpdate('auxiliary-request-failed')
        return
      }
      this.state = { ...this.state, connected: true, lastError: null }
      this.publishUpdate('poll')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.invalidate(message)
      this.publishUpdate('poll-failed')
    }
  }

  private connectSocket(credentials: LcuCredentials): void {
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
            void this.tick()
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
    ].join(':')
    if (signature !== this.lastContextSignature) {
      this.lastContextSignature = signature
      logger.info('LCU match context transitioned', {
        reason,
        transport: this.state.connected ? 'connected' : 'detached',
        phase: this.snapshot.phase,
        matchStage: this.snapshot.matchStage,
        matchGeneration: this.snapshot.matchGeneration,
        queueId: this.snapshot.queueId,
        championId: this.snapshot.currentChampionId,
        contextDecision,
        endpointStatus: this.lastObservation,
      })
    }
    this.emit('update', this.getSnapshot(), this.getState())
  }
}

export const lcuReadOnlyEndpoints = READ_ONLY_ENDPOINTS
