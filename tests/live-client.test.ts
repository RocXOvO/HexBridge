import { describe, expect, it, vi } from 'vitest'
import {
  LIVE_CLIENT_HOST,
  LIVE_CLIENT_PORT,
  LiveClientAdapter,
  type LiveClientEndpoint,
  liveClientEndpointUrl,
  parseActivePlayerLevel,
} from '../src/main/live-client.js'

describe('Live Client level adapter', () => {
  it('accepts only integer hero levels in the official 1..18 range', () => {
    expect(parseActivePlayerLevel({ level: 1 })).toBe(1)
    expect(parseActivePlayerLevel({ level: 18 })).toBe(18)
    for (const value of [0, 19, 1.5, '8', null, undefined, [], { level: true }]) {
      expect(parseActivePlayerLevel({ level: value })).toBeNull()
    }
  })

  it('uses only the fixed localhost activeplayer endpoint', () => {
    expect(liveClientEndpointUrl('activeplayer')).toBe(
      `https://${LIVE_CLIENT_HOST}:${LIVE_CLIENT_PORT}/liveclientdata/activeplayer`,
    )
    expect(liveClientEndpointUrl('activeplayer')).not.toContain('summoner')
  })

  it('keeps one request in flight and drops aborted work without exposing payloads', async () => {
    let resolveRequest: ((value: unknown) => void) | undefined
    const requester = vi.fn(() => new Promise<unknown>((resolve) => { resolveRequest = resolve }))
    const adapter = new LiveClientAdapter(requester)
    const first = adapter.readActivePlayerLevel()
    const second = adapter.readActivePlayerLevel()
    expect(requester).toHaveBeenCalledTimes(1)
    expect(second).toBe(first)
    resolveRequest?.({ level: 7, summonerName: 'must not escape' })
    await expect(first).resolves.toEqual({ level: 7, code: 'ready' })
  })

  it('returns unavailable for malformed or failed responses', async () => {
    const malformed = new LiveClientAdapter(vi.fn(async () => ({ level: '7', puuid: 'secret' })))
    await expect(malformed.readActivePlayerLevel()).resolves.toEqual({ level: null, code: 'invalid' })
    const failed = new LiveClientAdapter(vi.fn(async () => { throw new Error('connection refused') }))
    await expect(failed.readActivePlayerLevel()).resolves.toEqual({ level: null, code: 'unavailable' })
  })


  it('aborts a request on stop and classifies the result without raw error text', async () => {
    let rejectRequest: ((error: Error) => void) | undefined
    const requester = vi.fn((_endpoint: LiveClientEndpoint, signal: AbortSignal) => new Promise<unknown>((_resolve, reject) => {
      rejectRequest = reject
      signal.addEventListener('abort', () => reject(new DOMException('raw detail', 'AbortError')), { once: true })
    }))
    const adapter = new LiveClientAdapter(requester)
    const pending = adapter.readActivePlayerLevel()
    adapter.stop()
    rejectRequest?.(new DOMException('raw detail', 'AbortError'))
    await expect(pending).resolves.toEqual({ level: null, code: 'aborted' })
  })

})
