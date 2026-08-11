import { EventEmitter } from 'node:events'
import https from 'node:https'
import WebSocket from 'ws'
import type { ChampSelectSnapshot, GameflowPhase, LcuConnectionState } from '../../shared/contracts.js'
import { logger } from '../logger.js'
import { discoverLcuCredentials, type LcuCredentials } from './discovery.js'
import { carryForwardMatchContext, normalizeChampSelectSnapshot } from './normalize.js'

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
  private polling = false

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

  stop(): void {
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.pollTimer = null
    this.socket?.close()
    this.socket = null
  }

  private invalidate(reason: string): void {
    this.credentials = null
    this.socket?.close()
    this.socket = null
    this.state = { ...this.state, connected: false, lastError: reason }
    this.nextDiscoveryAt = Date.now() + 3000
  }

  private async ensureCredentials(): Promise<boolean> {
    if (this.credentials) return true
    if (Date.now() < this.nextDiscoveryAt) return false
    this.nextDiscoveryAt = Date.now() + 5000
    const credentials = await discoverLcuCredentials(this.getManualDirectory())
    if (!credentials) {
      this.state = { ...this.state, connected: false, lastError: '未发现正在运行的英雄联盟客户端' }
      return false
    }
    this.credentials = credentials
    this.state = {
      connected: true,
      source: credentials.source,
      lastError: null,
      lastConnectedAt: Date.now(),
    }
    logger.info('LCU credentials discovered', { source: credentials.source, port: credentials.port })
    this.connectSocket(credentials)
    return true
  }

  private request<T>(endpoint: string): Promise<T | null> {
    if (!READ_ONLY_ENDPOINTS.has(endpoint)) {
      return Promise.reject(new Error(`Blocked non-whitelisted LCU endpoint: ${endpoint}`))
    }
    if (!this.credentials) return Promise.resolve(null)
    const credentials = this.credentials
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
          timeout: 1800,
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

  private async tick(): Promise<void> {
    if (this.polling) return
    this.polling = true
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
      this.snapshot = carryForwardMatchContext(this.snapshot, normalized)
      this.state = { ...this.state, connected: true, lastError: null }
      this.emit('update', this.getSnapshot(), this.getState())
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.invalidate(message)
      this.emit('update', this.getSnapshot(), this.getState())
    } finally {
      this.polling = false
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
