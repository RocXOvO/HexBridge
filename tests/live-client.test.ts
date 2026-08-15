import { describe, expect, it, vi } from 'vitest'
import {
  LIVE_CLIENT_HOST,
  LIVE_CLIENT_PORT,
  LiveClientAdapter,
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

  it('emits bounded field summaries without identity fields or raw payload values', async () => {
    const adapter = new LiveClientAdapter(vi.fn(async (endpoint) => ({
      level: endpoint === 'activeplayer' ? 9 : undefined,
      summonerName: 'secret-name',
      puuid: 'secret-puuid',
      gameData: { gameMode: 'ARAM', phase: 'InProgress', score: 1.23456 },
      nested: { enabled: true },
    })))
    const result = await adapter.sampleDiagnostics()
    const fields = result.endpoints.flatMap((endpoint) => endpoint.fields)
    expect(result.level).toBe(9)
    expect(fields.some((field) => /name|puuid/i.test(field.path))).toBe(false)
    expect(fields).toContainEqual({ path: 'gameData.phase', type: 'string', value: 'InProgress' })
    expect(fields).toContainEqual({ path: 'nested.enabled', type: 'boolean', value: true })
    expect(JSON.stringify(result)).not.toContain('secret-name')
    expect(JSON.stringify(result)).not.toContain('secret-puuid')
  })

  it('aborts a request on stop and classifies the result without raw error text', async () => {
    let rejectRequest: ((error: Error) => void) | undefined
    const requester = vi.fn((_endpoint: 'activeplayer' | 'eventdata' | 'gamestats', signal: AbortSignal) => new Promise<unknown>((_resolve, reject) => {
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
