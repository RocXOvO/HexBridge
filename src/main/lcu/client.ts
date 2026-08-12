import { EventEmitter } from 'node:events'
import https from 'node:https'
import WebSocket from 'ws'
import type { ChampSelectSnapshot, GameflowPhase, LcuConnectionState } from '../../shared/contracts.js'
import { logger } from '../logger.js'
import { discoverLcuCredentials, type LcuCredentials } from './discovery.js'
import { MatchContextTracker, normalizeChampSelectSnapshot } from './normalize.js'

const EMPTY_SNAPSHOT: ChampSelectSnapshot = {
  phase: 'None',
  locale: 'zh_CN',
  queueId: null,
  modeActive: false,
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

  constructor(private readonly getManualDirectory: () => string) {
    super()
  }

  getSnapshot(): ChampSelectSnapshot {
    return { ...this.snapshot, benchChampionIds: [...this.snapshot.benchChampionIds] }
  }

  getState(): LcuConnectionState {
    return { ...this.state }
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

  private invalidate(reason: string, immediate = false): void {
    this.credentials = null
    this.socket?.close()
    this.socket = null
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
      this.state = {
        connected: true,
        source: credentials.source,
        lastError: null,
        lastConnectedAt: Date.now(),
      }
      logger.info('LCU credentials verified', { source: credentials.source, port: credentials.port })
      this.connectSocket(credentials)
      this.emit('update', this.getSnapshot(), this.getState())
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
        this.emit('update', this.getSnapshot(), this.getState())
        return
      }
      const phase = (await this.request<GameflowPhase>('/lol-gameflow/v1/gameflow-phase')) ?? 'None'
      const [gameflowSession, champSelectSession, currentChampionId, regionLocale] = await Promise.all([
        this.request<any>('/lol-gameflow/v1/session'),
        phase === 'ChampSelect' ? this.request<any>('/lol-champ-select/v1/session') : Promise.resolve(null),
        phase === 'ChampSelect'
          ? this.request<number>('/lol-champ-select/v1/current-champion')
          : Promise.resolve(null),
        this.request<any>('/riotclient/region-locale'),
      ])
      const normalized = normalizeChampSelectSnapshot({
        phase,
        locale: String(regionLocale?.locale ?? this.snapshot.locale ?? 'zh_CN'),
        gameflowSession,
        champSelectSession,
        currentChampionId,
      })
      this.snapshot = this.matchContext.apply(normalized)
      this.state = { ...this.state, connected: true, lastError: null }
      this.emit('update', this.getSnapshot(), this.getState())
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.invalidate(message)
      this.emit('update', this.getSnapshot(), this.getState())
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
}

export const lcuReadOnlyEndpoints = READ_ONLY_ENDPOINTS
