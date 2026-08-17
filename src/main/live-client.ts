import { request as httpsRequest } from 'node:https'
import type { IncomingMessage } from 'node:http'

export const LIVE_CLIENT_HOST = '127.0.0.1'
export const LIVE_CLIENT_PORT = 2_999
export const LIVE_CLIENT_MAX_BODY_BYTES = 2 * 1024 * 1024
export const LIVE_CLIENT_TIMEOUT_MS = 1_200

export type LiveClientEndpoint = 'activeplayer'

const ENDPOINT_PATHS: Record<LiveClientEndpoint, string> = {
  activeplayer: '/liveclientdata/activeplayer',
}

export type LiveClientLevelCode = 'ready' | 'unavailable' | 'invalid' | 'aborted' | 'error'

export interface LiveClientLevelResult {
  level: number | null
  code: LiveClientLevelCode
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

  abort(): void {
    this.controller?.abort()
  }

  stop(): void {
    this.abort()
  }
}
