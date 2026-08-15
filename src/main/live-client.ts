import { request as httpsRequest } from 'node:https'
import type { IncomingMessage } from 'node:http'

export const LIVE_CLIENT_HOST = '127.0.0.1'
export const LIVE_CLIENT_PORT = 2_999
export const LIVE_CLIENT_MAX_BODY_BYTES = 2 * 1024 * 1024
export const LIVE_CLIENT_TIMEOUT_MS = 1_200

export type LiveClientEndpoint = 'activeplayer' | 'eventdata' | 'gamestats'

const ENDPOINT_PATHS: Record<LiveClientEndpoint, string> = {
  activeplayer: '/liveclientdata/activeplayer',
  eventdata: '/liveclientdata/eventdata',
  gamestats: '/liveclientdata/gamestats',
}

export const LIVE_CLIENT_DIAGNOSTIC_ENDPOINTS: readonly LiveClientEndpoint[] = [
  'activeplayer', 'eventdata', 'gamestats',
]

export type LiveClientLevelCode = 'ready' | 'unavailable' | 'invalid' | 'aborted' | 'error'

export interface LiveClientLevelResult {
  level: number | null
  code: LiveClientLevelCode
}

export type LiveClientFieldType = 'boolean' | 'number' | 'string' | 'null' | 'object' | 'array'

export interface LiveClientFieldSummary {
  path: string
  type: LiveClientFieldType
  value?: boolean | number | string
}

export interface LiveClientEndpointSummary {
  endpoint: LiveClientEndpoint
  status: 'ready' | 'unavailable' | 'invalid' | 'aborted'
  fields: LiveClientFieldSummary[]
}

export interface LiveClientDiagnosticReadResult {
  level: number | null
  endpoints: LiveClientEndpointSummary[]
}

export function liveClientEndpointUrl(endpoint: LiveClientEndpoint): string {
  return `https://${LIVE_CLIENT_HOST}:${LIVE_CLIENT_PORT}${ENDPOINT_PATHS[endpoint]}`
}

export function parseActivePlayerLevel(value: unknown): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const level = (value as Record<string, unknown>).level
  return Number.isInteger(level) && Number(level) >= 1 && Number(level) <= 18
    ? Number(level)
    : null
}

type RequestJson = (endpoint: LiveClientEndpoint, signal: AbortSignal) => Promise<unknown>

const SENSITIVE_FIELD = /(?:name|puuid|riot|summoner|account|player|chat|loadout|rune|item|spell|portrait|profile|gameid|matchid|token|path)/i
const ENUM_FIELD = /(?:phase|mode|status|state|type|event|team|role|action|result)/i

function summarizeFields(value: unknown, path = '', fields: LiveClientFieldSummary[] = [], depth = 0): LiveClientFieldSummary[] {
  if (fields.length >= 80 || depth > 4) return fields
  if (value === null) {
    if (path) fields.push({ path, type: 'null' })
    return fields
  }
  if (Array.isArray(value)) {
    if (path) fields.push({ path, type: 'array' })
    if (value.length > 0) summarizeFields(value[0], `${path}[]`, fields, depth + 1)
    return fields
  }
  if (typeof value !== 'object') {
    if (!path) return fields
    if (typeof value === 'boolean') fields.push({ path, type: 'boolean', value })
    else if (typeof value === 'number' && Number.isFinite(value)) {
      fields.push({ path, type: 'number', value: Math.max(-1_000_000, Math.min(1_000_000, Number(value.toFixed(4)))) })
    } else if (typeof value === 'string') {
      const summary: LiveClientFieldSummary = { path, type: 'string' }
      if (ENUM_FIELD.test(path) && value.length <= 32 && /^[A-Za-z0-9_.:-]+$/.test(value)) summary.value = value
      fields.push(summary)
    }
    return fields
  }
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_FIELD.test(key) || key.length > 48) continue
    summarizeFields(child, path ? `${path}.${key}` : key, fields, depth + 1)
    if (fields.length >= 80) break
  }
  return fields
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function requestJson(endpoint: LiveClientEndpoint, signal: AbortSignal): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('The operation was aborted', 'AbortError'))
      return
    }
    const request = httpsRequest({
      hostname: LIVE_CLIENT_HOST,
      port: LIVE_CLIENT_PORT,
      path: ENDPOINT_PATHS[endpoint],
      method: 'GET',
      rejectUnauthorized: false,
      headers: { accept: 'application/json' },
    }, (response: IncomingMessage) => {
      const chunks: Buffer[] = []
      let size = 0
      response.on('data', (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        size += buffer.byteLength
        if (size > LIVE_CLIENT_MAX_BODY_BYTES) {
          request.destroy(new Error('live client response too large'))
          return
        }
        chunks.push(buffer)
      })
      response.once('error', reject)
      response.once('end', () => {
        if (size > LIVE_CLIENT_MAX_BODY_BYTES) return
        const status = response.statusCode ?? 0
        if (status < 200 || status >= 300) {
          reject(new Error(`live client HTTP ${status}`))
          return
        }
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
        } catch {
          reject(new Error('live client invalid JSON'))
        }
      })
    })
    const onAbort = (): void => {
      request.destroy(new DOMException('The operation was aborted', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    request.setTimeout(LIVE_CLIENT_TIMEOUT_MS, () => {
      request.destroy(new Error('live client timeout'))
    })
    request.once('error', reject)
    request.once('close', () => signal.removeEventListener('abort', onAbort))
    request.end()
  })
}

export class LiveClientAdapter {
  private readonly requestJson: RequestJson
  private inFlight: Promise<LiveClientLevelResult> | null = null
  private controller: AbortController | null = null
  private busy = false

  constructor(requester: RequestJson = requestJson) {
    this.requestJson = requester
  }

  readActivePlayerLevel(externalSignal?: AbortSignal): Promise<LiveClientLevelResult> {
    if (this.inFlight) return this.inFlight
    if (this.busy) return Promise.resolve({ level: null, code: 'unavailable' })
    this.busy = true
    const controller = new AbortController()
    this.controller = controller
    const forwardAbort = (): void => controller.abort()
    if (externalSignal?.aborted) controller.abort()
    else externalSignal?.addEventListener('abort', forwardAbort, { once: true })
    const operation = this.requestJson('activeplayer', controller.signal)
      .then((payload): LiveClientLevelResult => {
        const level = parseActivePlayerLevel(payload)
        return level == null ? { level: null, code: 'invalid' } : { level, code: 'ready' }
      })
      .catch((error): LiveClientLevelResult => ({
        level: null,
        code: controller.signal.aborted ? 'aborted' : isAbortError(error) ? 'aborted' : 'unavailable',
      }))
      .finally(() => {
        if (externalSignal) externalSignal.removeEventListener('abort', forwardAbort)
        if (this.inFlight === operation) {
          this.inFlight = null
          this.controller = null
        }
        this.busy = false
      })
    this.inFlight = operation
    return operation
  }

  async sampleDiagnostics(): Promise<LiveClientDiagnosticReadResult> {
    if (this.busy) return { level: null, endpoints: [] }
    this.busy = true
    const controller = new AbortController()
    this.controller = controller
    try {
      const endpoints: LiveClientEndpointSummary[] = []
      let level: number | null = null
      for (const endpoint of LIVE_CLIENT_DIAGNOSTIC_ENDPOINTS) {
        try {
          const payload = await this.requestJson(endpoint, controller.signal)
          if (endpoint === 'activeplayer') level = parseActivePlayerLevel(payload)
          endpoints.push({
            endpoint,
            status: endpoint === 'activeplayer' && level == null ? 'invalid' : 'ready',
            fields: summarizeFields(payload),
          })
        } catch (error) {
          endpoints.push({
            endpoint,
            status: controller.signal.aborted || isAbortError(error) ? 'aborted' : 'unavailable',
            fields: [],
          })
        }
      }
      return { level, endpoints }
    } finally {
      this.controller = null
      this.busy = false
    }
  }

  abort(): void {
    this.controller?.abort()
  }

  stop(): void {
    this.abort()
  }
}
